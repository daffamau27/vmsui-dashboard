<script>
	import { onMount } from 'svelte';
	import { selectedVesselId, selectedVesselInfo } from '$lib/stores/selectedVessel.svelte.js';
	import {
		getMonthlyReportAvailableColumns,
		getMonthlyReportData,
		getMonthlyReportExcelUrl
	} from '$lib/api/monthlyReportApi.js';
	import { setPageStatus } from '$lib/stores/pageStatusStore.svelte.js';
	import { downloadApiFile, apiRequest } from '$lib/api/authApi.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import { getAutoTimezoneLabelFromSources } from '$lib/utils/autoTimezoneLabel.js';
	import {
		currentMonth,
		getMonthlyRangeLimitText,
		validateMonthlyRange
	} from '$lib/utils/monthlyReportCalendar.js';
	import MonthlyReportHeader from './MonthlyReportHeader.svelte';
	import MonthlyReportColumnOptions from './MonthlyReportColumnOptions.svelte';
	import MonthlyReportSummary from './MonthlyReportSummary.svelte';
	import MonthlyReportTable from './MonthlyReportTable.svelte';
	import MonthlyReportLoadOverlay from './MonthlyReportLoadOverlay.svelte';
	import './monthly-report-page.css';

	let loading = $state(false);
	let exporting = $state(false);
	let error = $state('');
	let reportData = $state(null);

	let reportMonth = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let timezoneMode = $state('auto');
	let timezoneOffset = $state('+07:00');
	let hasLoadedDateRange = $state(false);
	let availableMonthlyColumns = $state([]);
	let availableMonthlyColumnsLoading = $state(false);
	let availableMonthlyColumnsError = $state('');
	let availableMonthlyColumnsVesselId = $state('');
	let availableMonthlyColumnsRequestedVesselId = $state('');
	let availableMonthlyColumnsMonth = $state('');
	let availableMonthlyColumnsRequestedMonth = $state('');
	let availableMonthlyColumnsRequestToken = 0;
	const MONTHLY_COLUMN_FILTER_DEFAULTS = [
		'data_received',
		'runtimes',
		'fuel',
		'speed',
		'high_rpm_low_speed'
	];
	const MONTHLY_FUEL_SOURCE_FILTER_DEFAULTS = [
		'ecu',
		'fms',
		'ems_internal',
		'ems_external',
		'engine_maker',
		'fod',
		'fuel_bunker'
	];
	let selectedMonthlyColumnKeys = $state([...MONTHLY_COLUMN_FILTER_DEFAULTS]);
	let selectedMonthlyFuelSourceKeys = $state([...MONTHLY_FUEL_SOURCE_FILTER_DEFAULTS]);

	let currentUser = $state(null);
	let currentUserLoading = $state(false);
	let currentUserError = $state('');

	async function loadCurrentUser() {
		if (currentUser || currentUserLoading) return currentUser;

		currentUserLoading = true;
		currentUserError = '';

		try {
			const response = await apiRequest('/users/current-user', {
				method: 'GET'
			});

			currentUser = response?.data || response?.user || response || null;

			return currentUser;
		} catch (err) {
			console.error('[MONTHLY][CURRENT_USER_PERMISSION_ERROR]', err);
			currentUserError = err?.message || 'Failed to load user permissions.';
			currentUser = null;
			return null;
		} finally {
			currentUserLoading = false;
		}
	}

	function hasPermissionForUser(user, permissionKey) {
		if (!permissionKey) return true;

		const permissionAccess = user?.permissionAccess || {};
		const mode = permissionAccess?.mode;

		if (mode === 'all') return true;

		if (mode === 'selected') {
			const permissions = Array.isArray(permissionAccess?.permissions)
				? permissionAccess.permissions
				: [];

			return permissions.includes(permissionKey);
		}

		return false;
	}

	function hasPermission(permissionKey) {
		return hasPermissionForUser(currentUser, permissionKey);
	}

	function normalizeMonthlyColumnKey(key) {
		const normalized = String(key || '').trim();
		if (normalized === 'runtime') return 'runtimes';
		return normalized;
	}

	function getMonthlyFuelSourceColumnKey(sourceKey) {
		return `fuel_consumption.${sourceKey}`;
	}

	function getMonthlyFuelSourceKeyFromColumn(columnKey) {
		const key = normalizeMonthlyColumnKey(columnKey);
		const prefix = 'fuel_consumption.';

		return key.startsWith(prefix) ? key.slice(prefix.length) : '';
	}

	function normalizeAvailableMonthlyColumns(payload) {
		const source =
			payload?.available_columns ||
			payload?.availableColumns ||
			payload?.data?.available_columns ||
			payload?.data?.availableColumns ||
			[];

		if (!Array.isArray(source)) return [];

		return source
			.map((column) => {
				const key = normalizeMonthlyColumnKey(column?.key);

				return {
					key,
					label: column?.label || key
				};
			})
			.filter((column) => column.key);
	}

	function getAvailableMonthlyColumn(key) {
		const normalizedKey = normalizeMonthlyColumnKey(key);
		return availableMonthlyColumns.find((column) => column.key === normalizedKey);
	}

	function isAvailableMonthlyColumnKey(key) {
		const normalizedKey = normalizeMonthlyColumnKey(key);
		if (normalizedKey === 'date') return true;

		if (!availableMonthlyColumnsVesselId) return true;

		return Boolean(getAvailableMonthlyColumn(normalizedKey));
	}

	function getAvailableMonthlyColumnLabel(key, fallback = '') {
		return getAvailableMonthlyColumn(key)?.label || fallback || normalizeMonthlyColumnKey(key);
	}

	function getAvailableMonthlyFuelSourceKeys() {
		if (!availableMonthlyColumnsVesselId) {
			return [...MONTHLY_FUEL_SOURCE_FILTER_DEFAULTS];
		}

		return availableMonthlyColumns
			.map((column) => getMonthlyFuelSourceKeyFromColumn(column.key))
			.filter(Boolean);
	}

	function getDefaultMonthlyColumnKeys() {
		return MONTHLY_COLUMN_FILTER_DEFAULTS.filter((key) => {
			if (key === 'fuel') return getAvailableMonthlyFuelSourceKeys().length > 0;
			return isAvailableMonthlyColumnKey(key);
		});
	}

	function syncMonthlyFilterSelectionWithAvailability() {
		selectedMonthlyColumnKeys = getDefaultMonthlyColumnKeys();
		selectedMonthlyFuelSourceKeys = getAvailableMonthlyFuelSourceKeys();
	}

	async function loadAvailableMonthlyColumns(vesselId, monthValue = reportMonth) {
		if (!vesselId) {
			availableMonthlyColumns = [];
			availableMonthlyColumnsError = '';
			availableMonthlyColumnsVesselId = '';
			availableMonthlyColumnsRequestedVesselId = '';
			availableMonthlyColumnsMonth = '';
			availableMonthlyColumnsRequestedMonth = '';
			syncMonthlyFilterSelectionWithAvailability();
			return;
		}

		const vesselKey = String(vesselId);
		const monthKey = String(monthValue || '');
		const requestToken = availableMonthlyColumnsRequestToken + 1;
		availableMonthlyColumnsRequestToken = requestToken;
		availableMonthlyColumnsRequestedVesselId = vesselKey;
		availableMonthlyColumnsRequestedMonth = monthKey;
		availableMonthlyColumnsLoading = true;
		availableMonthlyColumnsError = '';

		try {
			const result = await getMonthlyReportAvailableColumns({ vesselId, month: monthValue });
			if (requestToken !== availableMonthlyColumnsRequestToken) return;

			availableMonthlyColumns = normalizeAvailableMonthlyColumns(result);
			availableMonthlyColumnsVesselId = vesselKey;
			availableMonthlyColumnsMonth = monthKey;
			syncMonthlyFilterSelectionWithAvailability();
		} catch (err) {
			if (requestToken !== availableMonthlyColumnsRequestToken) return;

			console.error('[MONTHLY_AVAILABLE_COLUMNS_ERROR]', err);
			availableMonthlyColumns = [];
			availableMonthlyColumnsVesselId = '';
			availableMonthlyColumnsMonth = '';
			availableMonthlyColumnsError =
				err?.message || 'Failed to load available monthly report columns.';
			syncMonthlyFilterSelectionWithAvailability();
		} finally {
			if (requestToken === availableMonthlyColumnsRequestToken) {
				availableMonthlyColumnsLoading = false;
			}
		}
	}

	function getSelectedMonthlyApiColumnKeys() {
		const selectedKeys = ['date'];

		selectedMonthlyColumnKeys.forEach((key) => {
			const normalizedKey = normalizeMonthlyColumnKey(key);

			if (normalizedKey === 'fuel') return;
			if (!isAvailableMonthlyColumnKey(normalizedKey)) return;

			selectedKeys.push(normalizedKey);
		});

		if (isMonthlyColumnSelected('fuel')) {
			const availableFuelSourceKeys = new Set(getAvailableMonthlyFuelSourceKeys());

			selectedMonthlyFuelSourceKeys.forEach((sourceKey) => {
				if (!availableFuelSourceKeys.has(sourceKey)) return;

				selectedKeys.push(getMonthlyFuelSourceColumnKey(sourceKey));
			});
		}

		return [...new Set(selectedKeys)];
	}

	function isMonthlyColumnSelected(key) {
		const normalizedKey = normalizeMonthlyColumnKey(key);
		return selectedMonthlyColumnKeys.includes(normalizedKey);
	}

	function toggleMonthlyColumn(key) {
		const normalizedKey = normalizeMonthlyColumnKey(key);

		if (isMonthlyColumnSelected(normalizedKey)) {
			selectedMonthlyColumnKeys = selectedMonthlyColumnKeys.filter(
				(item) => item !== normalizedKey
			);
			return;
		}

		selectedMonthlyColumnKeys = [...selectedMonthlyColumnKeys, normalizedKey];
	}

	function resetMonthlyColumns() {
		selectedMonthlyColumnKeys = getDefaultMonthlyColumnKeys();
	}

	function isMonthlyFuelSourceSelected(key) {
		return selectedMonthlyFuelSourceKeys.includes(key);
	}

	function toggleMonthlyFuelSource(key) {
		if (isMonthlyFuelSourceSelected(key)) {
			selectedMonthlyFuelSourceKeys = selectedMonthlyFuelSourceKeys.filter((item) => item !== key);
			return;
		}

		selectedMonthlyFuelSourceKeys = [...selectedMonthlyFuelSourceKeys, key];
	}

	function resetMonthlyFuelSources() {
		selectedMonthlyFuelSourceKeys = getAvailableMonthlyFuelSourceKeys();
	}

	let { active = false } = $props();
	let shouldShowDateRangeOverlay = $derived(
		!hasLoadedDateRange || !reportMonth || !startDate || !endDate
	);

	function normalizeDay(value) {
		if (value === undefined || value === null || value === '') return '-';

		const text = String(value);

		if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
			return String(Number(text.slice(8, 10)));
		}

		if (/^\d+$/.test(text)) {
			return String(Number(text));
		}

		return text;
	}

	function formatNumber(value, digits = 1, fallback = '-') {
		const number = Number(value);
		if (!Number.isFinite(number)) return fallback;

		return number.toLocaleString('en-US', {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits
		});
	}

	function formatRuntime(value) {
		if (value === undefined || value === null || value === '') return '-';

		if (typeof value === 'string') {
			if (value.includes('h') || value.includes(':')) return value;
		}

		const number = Number(value);
		if (!Number.isFinite(number)) return '-';

		const totalMinutes = number > 24 ? number : number * 60;
		const hours = Math.floor(totalMinutes / 60);
		const minutes = Math.round(totalMinutes % 60);

		return `${hours}h ${minutes}m`;
	}

	function formatDuration(value) {
		return formatRuntime(value);
	}

	function formatFuel(value) {
		return formatNumber(value, 1);
	}

	function formatWholeNumber(value) {
		return formatNumber(value, 0);
	}

	function parseReportNumber(value) {
		if (value === undefined || value === null || value === '') return null;

		const number = Number(String(value).replace(/,/g, ''));
		return Number.isFinite(number) ? number : null;
	}

	function pickArray(...values) {
		for (const value of values) {
			if (Array.isArray(value)) return value;
		}

		return [];
	}

	function firstValue(...values) {
		return values.find((value) => value !== undefined && value !== null && value !== '');
	}

	function getNested(row, paths = []) {
		for (const path of paths) {
			const keys = path.split('.');
			let current = row;

			for (const key of keys) {
				if (current === undefined || current === null) {
					current = undefined;
					break;
				}

				current = current[key];
			}

			if (current !== undefined && current !== null && current !== '') {
				return current;
			}
		}

		return undefined;
	}

	function parseRuntimeMinutes(value) {
		if (value === undefined || value === null || value === '' || value === '-') {
			return 0;
		}

		if (typeof value === 'number') {
			return value > 24 ? value : value * 60;
		}

		const text = String(value).toLowerCase();

		const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*h/);
		const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*m/);

		const hours = hourMatch ? Number(hourMatch[1]) : 0;
		const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;

		if (hours || minutes) return hours * 60 + minutes;

		const numeric = Number(text);
		if (Number.isFinite(numeric)) return numeric > 24 ? numeric : numeric * 60;

		return 0;
	}

	function formatRuntimeMinutes(totalMinutes) {
		const value = Number(totalMinutes || 0);

		if (!Number.isFinite(value) || value <= 0) return '0h 0m';

		const hours = Math.floor(value / 60);
		const minutes = Math.round(value % 60);

		return `${hours}h ${minutes}m`;
	}

	function getFuelNumber(value) {
		if (value === undefined || value === null || value === '' || value === '-') {
			return null;
		}

		const number = Number(value);
		return Number.isFinite(number) ? number : null;
	}

	let vesselName = $derived(
		$selectedVesselInfo?.name || $selectedVesselInfo?.vesselName || 'Selected Vessel'
	);

	let normalizedReport = $derived(reportData?.data || reportData || {});
	let autoTimezoneLabel = $derived(
		getAutoTimezoneLabelFromSources(normalizedReport, reportData, $selectedVesselInfo)
	);

	let monthlyRows = $derived(
		pickArray(
			normalizedReport?.details,
			normalizedReport?.dailyRows,
			normalizedReport?.rows,
			normalizedReport?.monthlyRows,
			normalizedReport?.dailySummaries,
			normalizedReport?.summaries,
			normalizedReport?.reports,
			normalizedReport?.items,
			normalizedReport?.table,
			normalizedReport?.tables?.monthly,
			normalizedReport?.tables?.daily,
			Array.isArray(normalizedReport) ? normalizedReport : []
		)
	);

	let hasRawData = $derived(Boolean(reportData));

	let canViewEngineRuntimeTable = $derived(hasPermission('view_engine_runtime_table'));

	let canViewFuelConsumptionTable = $derived(hasPermission('view_fuel_consumption_table'));

	let canViewSpeedStatsTable = $derived(hasPermission('view_speed_stats_table'));

	let canViewTravelDistanceTable = $derived(hasPermission('view_travel_distance_table'));

	let canViewHighRpmLowSpeedTable = $derived(hasPermission('view_high_rpm_low_speed_table'));

	let canViewFuelEcu = $derived(hasPermission('view_fuel_ecu'));

	let canViewFuelFms = $derived(hasPermission('view_fuel_fms'));

	let canViewFuelFod = $derived(hasPermission('view_fuel_fod'));

	let canViewFuelEmsInternal = $derived(hasPermission('view_fuel_ems_internal'));

	let canViewFuelEmsExternal = $derived(hasPermission('view_fuel_ems_external'));

	let canViewFuelEngineMaker = $derived(hasPermission('view_fuel_engine_maker'));

	function canViewMonthlyFuelSource(sourceKey) {
		if (!canViewFuelConsumptionTable) return false;

		if (sourceKey === 'ecu') return canViewFuelEcu;
		if (sourceKey === 'fms') return canViewFuelFms;
		if (sourceKey === 'fod') return canViewFuelFod;
		if (sourceKey === 'fuel_bunker') return canViewFuelFod;
		if (sourceKey === 'ems_internal') return canViewFuelEmsInternal;
		if (sourceKey === 'ems_external') return canViewFuelEmsExternal;
		if (sourceKey === 'engine_maker') return canViewFuelEngineMaker;

		return true;
	}

	function getDateCell(row) {
		return normalizeDay(
			firstValue(
				row?.dateNumber,
				row?.dayNumber,
				row?.day,
				row?.tanggal,
				row?.date,
				row?.dateIso,
				row?.date_iso,
				row?.reportDate,
				row?.report_date
			)
		);
	}

	function getMonthlyRowDay(row) {
		const rawDay = firstValue(
			row?.dateNumber,
			row?.dayNumber,
			row?.day,
			row?.tanggal,
			row?.date,
			row?.dateIso,
			row?.date_iso,
			row?.reportDate,
			row?.report_date
		);

		if (rawDay === undefined || rawDay === null || rawDay === '') return null;

		const text = String(rawDay).trim();

		// YYYY-MM-DD format
		if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
			return Number(text.slice(8, 10));
		}

		// DD/MM/YYYY or DD-MM-YYYY format
		const dateLikeMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
		if (dateLikeMatch) {
			return Number(dateLikeMatch[1]);
		}

		// Numeric day format: 1, 2, 10, 31
		if (/^\d{1,2}$/.test(text)) {
			return Number(text);
		}

		return null;
	}

	function getRowDateObject(row) {
		const day = getMonthlyRowDay(row);

		if (!Number.isFinite(day) || day <= 0 || !reportMonth) {
			return null;
		}

		const [year, month] = String(reportMonth).split('-').map(Number);

		if (!year || !month) return null;

		return new Date(year, month - 1, day);
	}

	function isFutureMonthlyRow(row) {
		const rowDate = getRowDateObject(row);
		if (!rowDate) return false;

		const today = new Date();
		const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

		return rowDate > todayOnly;
	}

	function getDataReceived(row) {
		const stats =
			row?.data_received_stats ||
			row?.dataReceivedStats ||
			row?.data_received ||
			row?.dataReceived ||
			null;

		if (stats && typeof stats === 'object') {
			const received = firstValue(
				stats?.received_minutes,
				stats?.receivedMinutes,
				stats?.received,
				stats?.receivedCount
			);

			const total = firstValue(
				stats?.total_minutes,
				stats?.totalMinutes,
				stats?.total,
				stats?.expected,
				stats?.expectedMinutes
			);

			const percentage = firstValue(stats?.percentage, stats?.percent, stats?.data_percentage);

			if (received !== undefined && total !== undefined) {
				const computedPercent = Number(total) ? (Number(received) / Number(total)) * 100 : 0;

				return `${received} / ${total} (${formatNumber(percentage ?? computedPercent, 1)}%)`;
			}
		}

		const value = firstValue(
			row?.dataReceived,
			row?.data_received,
			row?.dataCompleteness,
			row?.data_completeness,
			row?.completeness,
			row?.received,
			row?.receivedCount,
			row?.data_count,
			row?.dataCount
		);

		if (value !== undefined && value !== null && value !== '') return value;

		const received = firstValue(row?.receivedMinutes, row?.received_minutes, row?.receivedCount);

		const expected = firstValue(row?.expectedMinutes, row?.expected_minutes, row?.expectedCount);

		if (received !== undefined && expected !== undefined) {
			const percent = Number(expected) ? (Number(received) / Number(expected)) * 100 : 0;

			return `${received} / ${expected} (${formatNumber(percent, 1)}%)`;
		}

		return '-';
	}

	function getDataReceivedMetric(row = {}) {
		const stats = row?.data_received_stats || row?.dataReceivedStats || null;

		if (stats && typeof stats === 'object') {
			const received = parseReportNumber(
				firstValue(
					stats?.received_minutes,
					stats?.receivedMinutes,
					stats?.received,
					stats?.receivedCount
				)
			);
			const total = parseReportNumber(
				firstValue(
					stats?.total_minutes,
					stats?.totalMinutes,
					stats?.total,
					stats?.expected,
					stats?.expectedMinutes
				)
			);
			const percentage = parseReportNumber(
				firstValue(stats?.percentage, stats?.percent, stats?.data_percentage)
			);

			if (Number.isFinite(received) || Number.isFinite(total)) {
				return { received: received || 0, total: total || 0, percentage };
			}
		}

		const value = firstValue(
			row?.dataReceived,
			row?.data_received,
			row?.dataCompleteness,
			row?.data_completeness,
			row?.completeness
		);

		if (typeof value === 'string') {
			const ratioMatch = value.match(/([\d,.]+)\s*\/\s*([\d,.]+)/);
			const percentMatch = value.match(/\(([\d,.]+)\s*%\)/);

			if (ratioMatch) {
				return {
					received: parseReportNumber(ratioMatch[1]) || 0,
					total: parseReportNumber(ratioMatch[2]) || 0,
					percentage: parseReportNumber(percentMatch?.[1])
				};
			}
		}

		const received = parseReportNumber(
			firstValue(row?.receivedMinutes, row?.received_minutes, row?.receivedCount)
		);
		const total = parseReportNumber(
			firstValue(row?.expectedMinutes, row?.expected_minutes, row?.expectedCount)
		);

		if (Number.isFinite(received) || Number.isFinite(total)) {
			return { received: received || 0, total: total || 0, percentage: null };
		}

		return null;
	}

	function getSummaryDataReceived(rows = monthlyRows) {
		let received = 0;
		let total = 0;
		let hasMetric = false;

		const safeRows = Array.isArray(rows) ? rows : [];

		safeRows.forEach((row) => {
			const metric = getDataReceivedMetric(row);
			if (!metric) return;

			received += metric.received;
			total += metric.total;
			hasMetric = true;
		});

		if (!hasMetric || total <= 0) return '-';

		const percentage = (received / total) * 100;
		return `${formatWholeNumber(received)} / ${formatWholeNumber(total)} (${formatNumber(percentage, 1)}%)`;
	}

	function normalizeEngineText(value) {
		return String(value || '')
			.replace(/_/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.toUpperCase();
	}

	function normalizeEngineKey(value) {
		return String(value || '')
			.replace(/\s+/g, '_')
			.trim()
			.toLowerCase();
	}

	function isTotalKey(key) {
		return (
			String(key || '')
				.trim()
				.toLowerCase() === 'total'
		);
	}

	function isEngineKey(key) {
		const normalized = normalizeEngineKey(key);

		if (!normalized || isTotalKey(normalized)) return false;

		return normalized.startsWith('ae_') || normalized.startsWith('me_');
	}

	function getEngineNameFromKey(key) {
		return normalizeEngineText(key);
	}

	function getValueByNormalizedKey(objectValue, targetKey) {
		if (!objectValue || typeof objectValue !== 'object') return undefined;

		if (objectValue[targetKey] !== undefined) {
			return objectValue[targetKey];
		}

		const normalizedTarget = normalizeEngineKey(targetKey);

		const matchedKey = Object.keys(objectValue).find((key) => {
			return normalizeEngineKey(key) === normalizedTarget;
		});

		return matchedKey ? objectValue[matchedKey] : undefined;
	}

	function addEngineKeyToMap(engineMap, rawKey) {
		if (!isEngineKey(rawKey)) return;

		const key = normalizeEngineKey(rawKey);

		if (!engineMap.has(key)) {
			engineMap.set(key, {
				key,
				name: getEngineNameFromKey(rawKey),
				rawKey
			});
		}
	}

	function collectEngineKeysFromObject(engineMap, objectValue) {
		if (!objectValue || typeof objectValue !== 'object' || Array.isArray(objectValue)) {
			return;
		}

		Object.keys(objectValue).forEach((key) => {
			addEngineKeyToMap(engineMap, key);
		});
	}

	const ENGINE_FUEL_SOURCE_KEYS = ['ecu', 'fms', 'ems_internal', 'ems_external', 'engine_maker'];

	function collectEngineKeysFromFuelConsumption(engineMap, fuelConsumption) {
		if (!fuelConsumption || typeof fuelConsumption !== 'object') return;

		ENGINE_FUEL_SOURCE_KEYS.forEach((sourceKey) => {
			collectEngineKeysFromObject(engineMap, fuelConsumption?.[sourceKey]);
		});
	}

	function sortMonthlyEngines(engines = []) {
		const order = [
			'ae_port_1',
			'ae_port_2',
			'ae_port',
			'ae_stbd_1',
			'ae_stbd_2',
			'ae_stbd',
			'me_port',
			'me_stbd',
			'me_center'
		];

		return [...engines].sort((a, b) => {
			const indexA = order.indexOf(a.key);
			const indexB = order.indexOf(b.key);

			if (indexA !== -1 || indexB !== -1) {
				if (indexA === -1) return 1;
				if (indexB === -1) return -1;
				return indexA - indexB;
			}

			return a.name.localeCompare(b.name);
		});
	}

	function collectEngineKeysFromMonthlyRows(rows = []) {
		const engineMap = new Map();

		rows.forEach((row) => {
			collectEngineKeysFromObject(engineMap, row?.runtimes || row?.runtime || {});

			collectEngineKeysFromFuelConsumption(
				engineMap,
				row?.fuel_consumption || row?.fuelConsumption || {}
			);
		});

		return sortMonthlyEngines([...engineMap.values()]);
	}

	let monthlyEngines = $derived(collectEngineKeysFromMonthlyRows(monthlyRows));

	function getHighRpmLowSpeedSource(row = {}) {
		return row?.high_rpm_low_speed || row?.highRpmLowSpeed || row?.high_rpm || row?.highRpm || {};
	}

	function addHighRpmEngineKeyToMap(engineMap, rawKey) {
		if (!isEngineKey(rawKey)) return;

		const key = normalizeEngineKey(rawKey);
		if (!key.startsWith('me_')) return;

		if (!engineMap.has(key)) {
			engineMap.set(key, {
				key,
				name: getEngineNameFromKey(rawKey),
				rawKey
			});
		}
	}

	function collectHighRpmEngineKeysFromObject(engineMap, objectValue) {
		if (!objectValue || typeof objectValue !== 'object' || Array.isArray(objectValue)) return;

		Object.keys(objectValue).forEach((key) => {
			addHighRpmEngineKeyToMap(engineMap, key);
		});
	}

	function collectHighRpmEngineKeysFromMonthlyRows(rows = []) {
		const engineMap = new Map();

		rows.forEach((row) => {
			const highRpmLowSpeed = getHighRpmLowSpeedSource(row);

			collectHighRpmEngineKeysFromObject(engineMap, highRpmLowSpeed?.durations);
			collectHighRpmEngineKeysFromObject(
				engineMap,
				highRpmLowSpeed?.duration_minutes || highRpmLowSpeed?.durationMinutes
			);
			collectHighRpmEngineKeysFromObject(
				engineMap,
				highRpmLowSpeed?.fuel_used_l || highRpmLowSpeed?.fuelUsedL
			);
			collectHighRpmEngineKeysFromObject(engineMap, highRpmLowSpeed);
		});

		return sortMonthlyEngines([...engineMap.values()]);
	}

	let monthlyHighRpmEngines = $derived(collectHighRpmEngineKeysFromMonthlyRows(monthlyRows));
	let monthlyHighRpmEngineColspan = $derived(Math.max(monthlyHighRpmEngines.length, 1));
	let monthlyHighRpmLowSpeedColspan = $derived(monthlyHighRpmEngineColspan * 2 + 1);

	function getRuntime(row, engineKey) {
		const runtimes = row?.runtimes || row?.runtime || {};
		const value = getValueByNormalizedKey(runtimes, engineKey);

		return formatRuntimeMinutes(parseRuntimeMinutes(value));
	}

	const monthlyEngineFuelSources = [
		{ key: 'ecu', label: 'ECU' },
		{ key: 'fms', label: 'FMS' },
		{ key: 'ems_internal', label: 'VMS' },
		{ key: 'ems_external', label: 'EMS' },
		{ key: 'engine_maker', label: 'Engine Maker' }
	];

	let availableMonthlyEngineFuelSources = $derived(
		monthlyEngineFuelSources.filter(
			(source) =>
				canViewMonthlyFuelSource(source.key) &&
				isAvailableMonthlyColumnKey(getMonthlyFuelSourceColumnKey(source.key))
		)
	);

	let visibleMonthlyEngineFuelSources = $derived(
		availableMonthlyEngineFuelSources.filter((source) => isMonthlyFuelSourceSelected(source.key))
	);

	function getMonthlyFuelSourceLabel(sourceKey) {
		const endpointLabel = getAvailableMonthlyColumn(
			getMonthlyFuelSourceColumnKey(sourceKey)
		)?.label;

		if (endpointLabel) return endpointLabel;

		if (sourceKey === 'ems_internal') return 'VMS';
		if (sourceKey === 'ems_external') return 'EMS';
		if (sourceKey === 'engine_maker') return 'Engine Maker';
		if (sourceKey === 'ecu') return 'ECU';
		if (sourceKey === 'fms') return 'FMS';

		return sourceKey || '-';
	}

	function getFuelBySource(row, sourceKey, engineKey) {
		const fuelConsumption = row?.fuel_consumption || row?.fuelConsumption || {};

		const source = fuelConsumption?.[sourceKey] || {};

		if (engineKey === 'total') {
			return formatFuel(source?.total);
		}

		return formatFuel(getValueByNormalizedKey(source, engineKey));
	}

	function getFuelSourceTotal(row, sourceKey) {
		return getFuelBySource(row, sourceKey, 'total');
	}

	function getGlobalFuelSource(row, sourceKey) {
		const fuelConsumption = row?.fuel_consumption || row?.fuelConsumption || {};

		return fuelConsumption?.[sourceKey] || {};
	}

	function isFodKey(key) {
		const normalized = normalizeEngineKey(key);

		return (
			normalized === 'fod_port_l' ||
			normalized === 'fod_stbd_l' ||
			normalized === 'fod_single_l' ||
			normalized === 'total_fod_l'
		);
	}

	function isBunkerKey(key) {
		const normalized = normalizeEngineKey(key);

		return normalized === 'bunker_l';
	}

	function getGlobalFuelColumnLabel(key) {
		const normalized = normalizeEngineKey(key);

		if (normalized === 'fod_port_l') return 'FOD Port';
		if (normalized === 'fod_stbd_l') return 'FOD STBD';
		if (normalized === 'fod_single_l') return 'FOD';
		if (normalized === 'total_fod_l') return 'Total FOD';
		if (normalized === 'bunker_l') return 'Bunker';

		return normalizeEngineText(key);
	}

	function normalizeFodColumns(columns = []) {
		const hasSingleFod = columns.some((column) => column.key === 'fod_single_l');
		const hasSplitFod = columns.some(
			(column) => column.key === 'fod_port_l' || column.key === 'fod_stbd_l'
		);

		if (!hasSingleFod || hasSplitFod) return columns;

		return columns.filter((column) => column.key === 'fod_single_l');
	}

	function collectGlobalFuelColumns(rows = [], sourceKey) {
		const columnMap = new Map();

		rows.forEach((row) => {
			const source = getGlobalFuelSource(row, sourceKey);

			if (!source || typeof source !== 'object') return;

			Object.entries(source).forEach(([key, value]) => {
				const normalized = normalizeEngineKey(key);

				if (sourceKey === 'fod' && !isFodKey(key)) return;
				if (sourceKey === 'fuel_bunker' && !isBunkerKey(key)) return;

				const number = getFuelNumber(value);

				if (!Number.isFinite(number) || number <= 0) return;

				if (!columnMap.has(normalized)) {
					columnMap.set(normalized, {
						key: normalized,
						rawKey: key,
						label: getGlobalFuelColumnLabel(key),
						sourceKey
					});
				}
			});
		});

		const columns =
			sourceKey === 'fod' ? normalizeFodColumns([...columnMap.values()]) : [...columnMap.values()];
		const order = ['fod_port_l', 'fod_stbd_l', 'fod_single_l', 'total_fod_l', 'bunker_l'];

		return columns.sort((a, b) => {
			const indexA = order.indexOf(a.key);
			const indexB = order.indexOf(b.key);

			if (indexA !== -1 || indexB !== -1) {
				if (indexA === -1) return 1;
				if (indexB === -1) return -1;
				return indexA - indexB;
			}

			return a.label.localeCompare(b.label);
		});
	}

	let monthlyFodColumns = $derived(collectGlobalFuelColumns(monthlyRows, 'fod'));

	let monthlyBunkerColumns = $derived(collectGlobalFuelColumns(monthlyRows, 'fuel_bunker'));

	const monthlyGlobalFuelSources = [
		{ key: 'fod', label: 'FOD' },
		{ key: 'fuel_bunker', label: 'Fuel Bunker' }
	];

	let availableMonthlyGlobalFuelSourceOptions = $derived(
		monthlyGlobalFuelSources
			.filter(
				(source) =>
					canViewMonthlyFuelSource(source.key) &&
					isAvailableMonthlyColumnKey(getMonthlyFuelSourceColumnKey(source.key))
			)
			.map((source) => ({
				...source,
				label:
					getAvailableMonthlyColumn(getMonthlyFuelSourceColumnKey(source.key))?.label ||
					source.label
			}))
	);

	let availableMonthlyGlobalFuelGroups = $derived([
		...(canViewMonthlyFuelSource('fod') &&
		isAvailableMonthlyColumnKey(getMonthlyFuelSourceColumnKey('fod')) &&
		monthlyFodColumns.length
			? [
					{
						key: 'fod',
						label: getAvailableMonthlyColumn(getMonthlyFuelSourceColumnKey('fod'))?.label || 'FOD',
						columns: monthlyFodColumns
					}
				]
			: []),
		...(canViewMonthlyFuelSource('fuel_bunker') &&
		isAvailableMonthlyColumnKey(getMonthlyFuelSourceColumnKey('fuel_bunker')) &&
		monthlyBunkerColumns.length
			? [
					{
						key: 'fuel_bunker',
						label:
							getAvailableMonthlyColumn(getMonthlyFuelSourceColumnKey('fuel_bunker'))?.label ||
							'Fuel Bunker',
						columns: monthlyBunkerColumns
					}
				]
			: [])
	]);

	let visibleMonthlyGlobalFuelGroups = $derived(
		availableMonthlyGlobalFuelGroups.filter((group) => isMonthlyFuelSourceSelected(group.key))
	);

	function getGlobalFuelValue(row, sourceKey, columnKey) {
		const source = getGlobalFuelSource(row, sourceKey);
		return formatFuel(getValueByNormalizedKey(source, columnKey));
	}

	function shouldCollapseGlobalFuelGroupHeader(group) {
		if (!group || group.columns?.length !== 1) return false;

		const groupLabel = String(group.label || '')
			.trim()
			.toLowerCase();
		const columnLabel = String(group.columns[0]?.label || '')
			.trim()
			.toLowerCase();

		return Boolean(groupLabel && groupLabel === columnLabel);
	}

	let monthlyFuelColspan = $derived(
		Math.max(
			1,
			visibleMonthlyEngineFuelSources.length * (monthlyEngines.length + 1) +
				visibleMonthlyGlobalFuelGroups.reduce((sum, group) => {
					return sum + group.columns.length;
				}, 0)
		)
	);

	let hasMonthlyFuelColumns = $derived(
		visibleMonthlyEngineFuelSources.length > 0 || visibleMonthlyGlobalFuelGroups.length > 0
	);

	let hasMonthlyAvailableFuelColumns = $derived(
		availableMonthlyEngineFuelSources.length > 0 ||
			availableMonthlyGlobalFuelSourceOptions.length > 0
	);

	let monthlyColumnFilterOptions = $derived(
		[
			{
				key: 'data_received',
				label: getAvailableMonthlyColumnLabel('data_received', 'Data Received'),
				available: isAvailableMonthlyColumnKey('data_received')
			},
			{
				key: 'runtimes',
				label: getAvailableMonthlyColumnLabel('runtimes', 'Engine Runtimes'),
				available: canViewEngineRuntimeTable && isAvailableMonthlyColumnKey('runtimes')
			},
			{
				key: 'fuel',
				label: 'Fuel Consumption',
				available: canViewFuelConsumptionTable && hasMonthlyAvailableFuelColumns
			},
			{
				key: 'speed',
				label: getAvailableMonthlyColumnLabel('speed', 'Speed'),
				available: canViewSpeedStatsTable && isAvailableMonthlyColumnKey('speed')
			},
			{
				key: 'high_rpm_low_speed',
				label: getAvailableMonthlyColumnLabel('high_rpm_low_speed', 'High RPM Low Speed'),
				available: canViewHighRpmLowSpeedTable && isAvailableMonthlyColumnKey('high_rpm_low_speed')
			}
		].filter((option) => option.available)
	);

	let monthlyFuelSourceFilterOptions = $derived([
		...availableMonthlyEngineFuelSources.map((source) => ({
			key: source.key,
			label: getMonthlyFuelSourceLabel(source.key)
		})),
		...availableMonthlyGlobalFuelSourceOptions.map((source) => ({
			key: source.key,
			label: source.label
		}))
	]);

	let showMonthlyDataReceivedColumn = $derived(
		isMonthlyColumnSelected('data_received') && isAvailableMonthlyColumnKey('data_received')
	);
	let showMonthlyRuntimeColumns = $derived(
		canViewEngineRuntimeTable &&
			isMonthlyColumnSelected('runtimes') &&
			isAvailableMonthlyColumnKey('runtimes')
	);
	let showMonthlyFuelColumns = $derived(
		canViewFuelConsumptionTable && isMonthlyColumnSelected('fuel') && hasMonthlyFuelColumns
	);
	let showMonthlySpeedColumns = $derived(
		canViewSpeedStatsTable &&
			isMonthlyColumnSelected('speed') &&
			isAvailableMonthlyColumnKey('speed')
	);
	let showMonthlyHighRpmLowSpeedColumns = $derived(
		canViewHighRpmLowSpeedTable &&
			isMonthlyColumnSelected('high_rpm_low_speed') &&
			isAvailableMonthlyColumnKey('high_rpm_low_speed')
	);
	let hasMonthlyGroupedHeaderRows = $derived(
		showMonthlyRuntimeColumns ||
			showMonthlyFuelColumns ||
			showMonthlySpeedColumns ||
			showMonthlyHighRpmLowSpeedColumns
	);
	let monthlyHeaderRowspan = $derived(hasMonthlyGroupedHeaderRows ? 3 : 1);

	let monthlyTableSkeletonColumns = $derived(
		1 +
			(showMonthlyDataReceivedColumn ? 1 : 0) +
			(showMonthlyRuntimeColumns ? Math.max(monthlyEngines.length, 1) : 0) +
			(showMonthlyFuelColumns ? (hasMonthlyFuelColumns ? monthlyFuelColspan : 1) : 0) +
			(showMonthlySpeedColumns ? 2 : 0) +
			(showMonthlyHighRpmLowSpeedColumns ? monthlyHighRpmLowSpeedColspan : 0)
	);

	function getSpeed(row, type) {
		const paths = {
			avg: [
				'speed.avg',
				'speed.average',
				'speed.averageSpeed',
				'avgSpeed',
				'averageSpeed',
				'avg_speed',
				'average_speed'
			],
			max: [
				'speed.max',
				'speed.top',
				'speed.maxSpeed',
				'speed.topSpeed',
				'maxSpeed',
				'topSpeed',
				'max_speed',
				'top_speed'
			]
		};

		return formatNumber(getNested(row, paths[type] || []), 1);
	}

	function getHighRpmDuration(row, engineKey) {
		const highRpmLowSpeed = getHighRpmLowSpeedSource(row);

		return formatDuration(
			firstValue(
				getValueByNormalizedKey(highRpmLowSpeed?.durations, engineKey),
				getValueByNormalizedKey(highRpmLowSpeed?.duration_minutes, engineKey),
				getValueByNormalizedKey(highRpmLowSpeed?.durationMinutes, engineKey),
				getNested(row, [
					`highRpmLowSpeed.${engineKey}.duration`,
					`high_rpm_low_speed.${engineKey}.duration`,
					`highRpmLowSpeed.${engineKey}.duration_minutes`,
					`high_rpm_low_speed.${engineKey}.duration_minutes`
				])
			)
		);
	}

	function getHighRpmFuelUsed(row, engineKey) {
		const highRpmLowSpeed = getHighRpmLowSpeedSource(row);

		return formatFuel(
			firstValue(
				getValueByNormalizedKey(highRpmLowSpeed?.fuel_used_l, engineKey),
				getValueByNormalizedKey(highRpmLowSpeed?.fuelUsedL, engineKey),
				getNested(row, [
					`highRpmLowSpeed.${engineKey}.fuel_used_l`,
					`high_rpm_low_speed.${engineKey}.fuel_used_l`,
					`highRpmLowSpeed.${engineKey}.fuelUsedL`,
					`high_rpm_low_speed.${engineKey}.fuelUsedL`,
					`highRpmLowSpeed.${engineKey}.fuel`,
					`high_rpm_low_speed.${engineKey}.fuel`
				])
			)
		);
	}

	function getHighRpmFuel(row) {
		const highRpmLowSpeed = getHighRpmLowSpeedSource(row);

		return formatFuel(
			firstValue(
				highRpmLowSpeed?.total_fuel_l,
				highRpmLowSpeed?.totalFuelL,
				highRpmLowSpeed?.total_fuel,
				highRpmLowSpeed?.totalFuel,
				getNested(row, [
					'highRpmLowSpeed.totalFuel',
					'high_rpm_low_speed.totalFuel',
					'highRpmLowSpeed.totalFuelL',
					'high_rpm_low_speed.totalFuelL',
					'highRpmLowSpeed.total_fuel_l',
					'high_rpm_low_speed.total_fuel_l',
					'highRpmLowSpeed.fuel',
					'high_rpm_low_speed.fuel'
				]),
				row?.highRpmLowSpeedFuel,
				row?.high_rpm_low_speed_fuel,
				row?.highRpmFuel,
				row?.high_rpm_fuel,
				row?.sritiFuel
			)
		);
	}

	function getSummaryRuntime() {
		const totalMinutes = monthlyRows.reduce((sum, row) => {
			const runtimes = row?.runtimes || row?.runtime || {};

			const rowMinutes = monthlyEngines.reduce((engineSum, engine) => {
				const value = getValueByNormalizedKey(runtimes, engine.key);
				return engineSum + parseRuntimeMinutes(value);
			}, 0);

			return sum + rowMinutes;
		}, 0);

		return formatRuntimeMinutes(totalMinutes);
	}

	function getSummaryFuel() {
		const summaryFuel = Number(
			normalizedReport?.summary?.total_fuel_consumption_l ??
				normalizedReport?.summary?.totalFuelConsumptionL
		);

		if (Number.isFinite(summaryFuel)) {
			return formatFuel(summaryFuel);
		}

		const total = monthlyRows.reduce((sum, row) => {
			const fuelConsumption = row?.fuel_consumption || row?.fuelConsumption || {};

			const engineFuelTotal = availableMonthlyEngineFuelSources.reduce((sourceSum, source) => {
				const value = getFuelNumber(fuelConsumption?.[source.key]?.total);
				return sourceSum + (Number.isFinite(value) ? value : 0);
			}, 0);

			const globalFuelTotal = availableMonthlyGlobalFuelGroups.reduce((groupSum, group) => {
				const source = fuelConsumption?.[group.key] || {};

				const hasTotalFod =
					group.key === 'fod' && group.columns.some((item) => item.key === 'total_fod_l');

				const columnTotal = group.columns.reduce((columnSum, column) => {
					if (hasTotalFod && column.key !== 'total_fod_l') {
						return columnSum;
					}

					const value = getFuelNumber(getValueByNormalizedKey(source, column.key));

					return columnSum + (Number.isFinite(value) ? value : 0);
				}, 0);

				return groupSum + columnTotal;
			}, 0);

			return sum + engineFuelTotal + globalFuelTotal;
		}, 0);

		return formatFuel(total);
	}

	function getSummaryAvgSpeed() {
		const summaryAverageSpeed = Number(
			normalizedReport?.summary?.average_speed ?? normalizedReport?.summary?.averageSpeed
		);

		if (Number.isFinite(summaryAverageSpeed)) {
			return `${formatNumber(summaryAverageSpeed, 2)} knot`;
		}

		const values = monthlyRows
			.map((row) =>
				Number(row?.speed?.avg ?? row?.speed?.average ?? row?.avgSpeed ?? row?.avg_speed)
			)
			.filter((value) => Number.isFinite(value) && value > 0);

		if (!values.length) return '-';

		const avg = values.reduce((sum, value) => sum + value, 0) / values.length;

		return `${formatNumber(avg, 1)} knot`;
	}

	function getSummaryDistance() {
		const summaryDistance = Number(
			normalizedReport?.summary?.total_distance_nm ??
				normalizedReport?.summary?.totalDistanceNm ??
				normalizedReport?.summary?.total_distance ??
				normalizedReport?.summary?.totalDistance
		);

		if (Number.isFinite(summaryDistance)) {
			return `${formatNumber(summaryDistance, 2)} NM`;
		}

		const total = monthlyRows.reduce((sum, row) => {
			const value = Number(
				row?.distance_nm ??
					row?.distance ??
					row?.total_distance_nm ??
					row?.travel_distance?.total_distance_nm
			);

			return sum + (Number.isFinite(value) ? value : 0);
		}, 0);

		return total > 0 ? `${formatNumber(total, 1)} NM` : '-';
	}

	function getSummaryEngineRuntimeEntries() {
		const runningHours =
			normalizedReport?.summary?.running_hours || normalizedReport?.summary?.runningHours || {};

		if (!runningHours || typeof runningHours !== 'object' || Array.isArray(runningHours)) return [];

		return sortMonthlyEngines(
			Object.entries(runningHours)
				.map(([key, value]) => ({
					key: normalizeEngineKey(key),
					name: normalizeEngineText(key),
					label: normalizeEngineText(key),
					value
				}))
				.filter(
					(entry) =>
						isEngineKey(entry.key) &&
						entry.value !== undefined &&
						entry.value !== null &&
						entry.value !== ''
				)
		);
	}

	function getSummaryTotalOperationHours() {
		return (
			normalizedReport?.summary?.total_operation_hours ??
			normalizedReport?.summary?.totalOperationHours ??
			getSummaryRuntime()
		);
	}

	let summaryEngineRuntimeEntries = $derived(getSummaryEngineRuntimeEntries());
	let monthlyRangeLimitText = $derived(getMonthlyRangeLimitText(reportMonth));
	let monthlyColumnOptions = $derived(
		monthlyColumnFilterOptions.map((option) => ({
			...option,
			selected: isMonthlyColumnSelected(option.key)
		}))
	);
	let monthlyFuelSourceOptions = $derived(
		monthlyFuelSourceFilterOptions.map((source) => ({
			...source,
			selected: isMonthlyFuelSourceSelected(source.key)
		}))
	);
	let monthlyTableGlobalFuelGroups = $derived(
		visibleMonthlyGlobalFuelGroups.map((group) => ({
			...group,
			collapsed: shouldCollapseGlobalFuelGroupHeader(group)
		}))
	);
	let monthlyTableRows = $derived(
		monthlyRows.map((row, index) => {
			const isFuture = isFutureMonthlyRow(row);

			return {
				key: `${getDateCell(row)}-${index}`,
				dateLabel: getDateCell(row),
				isFuture,
				dataReceived: getDataReceived(row),
				runtimes: monthlyEngines.map((engine) => getRuntime(row, engine.key)),
				fuelSourceCells: visibleMonthlyEngineFuelSources.map((source) => ({
					key: source.key,
					engineValues: monthlyEngines.map((engine) =>
						getFuelBySource(row, source.key, engine.key)
					),
					total: getFuelSourceTotal(row, source.key)
				})),
				globalFuelValues: visibleMonthlyGlobalFuelGroups.flatMap((group) =>
					group.columns.map((column) => getGlobalFuelValue(row, group.key, column.key))
				),
				speedAvg: getSpeed(row, 'avg'),
				speedMax: getSpeed(row, 'max'),
				highRpmDurations: monthlyHighRpmEngines.map((engine) =>
					getHighRpmDuration(row, engine.key)
				),
				highRpmFuelUsed: monthlyHighRpmEngines.map((engine) => getHighRpmFuelUsed(row, engine.key)),
				highRpmTotalFuel: getHighRpmFuel(row)
			};
		})
	);

	async function loadMonthlyReport() {
		if (!$selectedVesselId) {
			error = 'No vessel has been selected from Fleet View.';
			reportData = null;
			hasLoadedDateRange = false;
			return;
		}

		const rangeValidation = validateMonthlyRange(reportMonth, startDate, endDate);
		if (!rangeValidation.valid) {
			error = rangeValidation.message;
			reportData = null;
			hasLoadedDateRange = false;
			return;
		}

		startDate = rangeValidation.startDate;
		endDate = rangeValidation.endDate;

		loading = true;
		error = '';

		try {
			if (
				String(availableMonthlyColumnsVesselId) !== String($selectedVesselId) ||
				String(availableMonthlyColumnsMonth) !== String(reportMonth || '')
			) {
				await loadAvailableMonthlyColumns($selectedVesselId, reportMonth);
			}

			const result = await getMonthlyReportData({
				vesselId: $selectedVesselId,
				month: reportMonth,
				startDate: rangeValidation.startDate,
				endDate: rangeValidation.endDate,
				timezoneMode,
				timezoneOffset,
				columns: getSelectedMonthlyApiColumnKeys().join(',')
			});

			reportData = result;
			hasLoadedDateRange = true;

			const payload = result?.data || result || {};
			const rows = Array.isArray(payload?.details) ? payload.details : [];
			const dataReceivedSummary = getSummaryDataReceived(rows);

			setPageStatus({
				pageKey: 'monthly-report',
				dataReceived: dataReceivedSummary,
				sourcePage: 'Monthly Report'
			});
		} catch (err) {
			console.error('[MONTHLY_REPORT_ERROR]', err);
			error = err?.message || 'Failed to load monthly report.';
			reportData = null;
			hasLoadedDateRange = false;
		} finally {
			loading = false;
		}
	}

	async function handleExportExcel() {
		if (!$selectedVesselId) {
			error = 'No vessel has been selected.';
			return;
		}

		const rangeValidation = validateMonthlyRange(reportMonth, startDate, endDate);
		if (!rangeValidation.valid) {
			error = rangeValidation.message;
			return;
		}

		startDate = rangeValidation.startDate;
		endDate = rangeValidation.endDate;

		exporting = true;
		error = '';

		try {
			if (
				String(availableMonthlyColumnsVesselId) !== String($selectedVesselId) ||
				String(availableMonthlyColumnsMonth) !== String(reportMonth || '')
			) {
				await loadAvailableMonthlyColumns($selectedVesselId, reportMonth);
			}

			const url = getMonthlyReportExcelUrl({
				vesselId: $selectedVesselId,
				month: reportMonth,
				startDate: rangeValidation.startDate,
				endDate: rangeValidation.endDate,
				timezoneMode,
				timezoneOffset,
				columns: getSelectedMonthlyApiColumnKeys().join(',')
			});

			const safeVesselName = String(vesselName || 'vessel')
				.replace(/[^\w\s-]/g, '')
				.replace(/\s+/g, '_');

			await downloadApiFile(
				url,
				`Monthly_Report_${safeVesselName}_${reportMonth}_${rangeValidation.startDate}-${rangeValidation.endDate}.xlsx`
			);
		} catch (err) {
			console.error('[MONTHLY_EXPORT_EXCEL_ERROR]', err);
			error = err?.message || 'Failed to export monthly report to Excel.';
		} finally {
			exporting = false;
		}
	}

	onMount(() => {
		reportMonth = currentMonth();
	});

	$effect(() => {
		if (!active) return;
		if (currentUser || currentUserLoading) return;

		loadCurrentUser();
	});

	$effect(() => {
		if (!active) return;

		const vesselId = $selectedVesselId;

		if (!vesselId) {
			availableMonthlyColumns = [];
			availableMonthlyColumnsError = '';
			availableMonthlyColumnsVesselId = '';
			availableMonthlyColumnsRequestedVesselId = '';
			availableMonthlyColumnsMonth = '';
			availableMonthlyColumnsRequestedMonth = '';
			syncMonthlyFilterSelectionWithAvailability();
			return;
		}

		if (!reportMonth) return;

		const monthKey = String(reportMonth || '');

		if (
			String(availableMonthlyColumnsVesselId) === String(vesselId) &&
			String(availableMonthlyColumnsMonth) === monthKey
		)
			return;
		if (
			String(availableMonthlyColumnsRequestedVesselId) === String(vesselId) &&
			String(availableMonthlyColumnsRequestedMonth) === monthKey
		)
			return;
		if (availableMonthlyColumnsLoading) return;

		loadAvailableMonthlyColumns(vesselId, reportMonth);
	});
</script>

<section class="monthly-page">
	<MonthlyReportHeader
		{vesselName}
		bind:reportMonth
		bind:startDate
		bind:endDate
		bind:timezoneMode
		bind:timezoneOffset
		{autoTimezoneLabel}
		{loading}
		{exporting}
		loadDisabled={loading ||
			availableMonthlyColumnsLoading ||
			!reportMonth ||
			!startDate ||
			!endDate}
		exportDisabled={availableMonthlyColumnsLoading || shouldShowDateRangeOverlay}
		rangeLimitText={monthlyRangeLimitText}
		onLoad={loadMonthlyReport}
		onExport={handleExportExcel}
		onRangeChange={() => (hasLoadedDateRange = false)}
	/>

	<MonthlyReportColumnOptions
		columns={monthlyColumnOptions}
		fuelSources={monthlyFuelSourceOptions}
		selectedCount={getSelectedMonthlyApiColumnKeys().length}
		columnsLoading={availableMonthlyColumnsLoading}
		columnsError={availableMonthlyColumnsError}
		showFuelSources={isMonthlyColumnSelected('fuel')}
		onToggleColumn={toggleMonthlyColumn}
		onResetColumns={resetMonthlyColumns}
		onToggleFuelSource={toggleMonthlyFuelSource}
		onResetFuelSources={resetMonthlyFuelSources}
	/>

	<div class="load-required-area" class:is-locked={shouldShowDateRangeOverlay}>
		{#if error}
			<div class="status-box error-box">{error}</div>
		{/if}

		{#if currentUserLoading}
			<LoadingSkeleton label="Loading user permissions" variant="card" rows={2} compact />
		{/if}

		{#if currentUserError}
			<div class="status-box error-box">{currentUserError}</div>
		{/if}

		{#if loading}
			<LoadingSkeleton
				label="Loading monthly report data"
				variant="monthly-report"
				rows={10}
				columns={monthlyTableSkeletonColumns}
			/>
		{:else}
			<MonthlyReportSummary
				dataReceivedLabel={isAvailableMonthlyColumnKey('data_received')
					? getSummaryDataReceived()
					: ''}
				totalFuelLabel={canViewFuelConsumptionTable ? getSummaryFuel() : ''}
				totalDistanceLabel={canViewTravelDistanceTable ? getSummaryDistance() : ''}
				averageSpeedLabel={canViewSpeedStatsTable ? getSummaryAvgSpeed() : ''}
				totalOperationHoursLabel={canViewEngineRuntimeTable ? getSummaryTotalOperationHours() : ''}
				engineRuntimeEntries={canViewEngineRuntimeTable ? summaryEngineRuntimeEntries : []}
			/>

			<MonthlyReportTable
				rows={monthlyTableRows}
				engines={monthlyEngines}
				fuelSources={visibleMonthlyEngineFuelSources}
				globalFuelGroups={monthlyTableGlobalFuelGroups}
				highRpmEngines={monthlyHighRpmEngines}
				showDataReceived={showMonthlyDataReceivedColumn}
				showRuntime={showMonthlyRuntimeColumns}
				showFuel={showMonthlyFuelColumns}
				showSpeed={showMonthlySpeedColumns}
				showHighRpm={showMonthlyHighRpmLowSpeedColumns}
				fuelColspan={monthlyFuelColspan}
				highRpmColspan={monthlyHighRpmLowSpeedColspan}
				highRpmEngineColspan={monthlyHighRpmEngineColspan}
				headerRowspan={monthlyHeaderRowspan}
				hasGroupedHeaderRows={hasMonthlyGroupedHeaderRows}
			/>
		{/if}

		<MonthlyReportLoadOverlay visible={shouldShowDateRangeOverlay} />
	</div>
</section>
