<script>
	import { onMount } from 'svelte';
	import { selectedVesselId, selectedVesselInfo } from '$lib/stores/selectedVessel.svelte.js';
	import { getMonthlyReportData, getMonthlyReportExcelUrl } from '$lib/api/monthlyReportApi.js';
	import { setPageStatus } from '$lib/stores/pageStatusStore.svelte.js';
	import { downloadApiFile, apiRequest } from '$lib/api/authApi.js';

	let loading = $state(false);
	let exporting = $state(false);
	let error = $state('');
	let reportData = $state(null);

	let reportMonth = $state('');
	let startDate = $state('01');
	let endDate = $state('');
	let timezoneMode = $state('auto');
	let timezoneOffset = $state('+07:00');

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

			console.log('[MONTHLY][CURRENT_USER_PERMISSION]', currentUser);

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

	let { active = false } = $props();

	let loadedKeys = $state({});
	let lastLoadedVesselId = $state(null);

	$effect(() => {
		const vesselId = $selectedVesselId;

		if (!vesselId) return;
		if (vesselId === lastLoadedVesselId) return;

		lastLoadedVesselId = vesselId;
		loadMonthlyReport();
	});

	function pad(value) {
		return String(value).padStart(2, '0');
	}

	function currentMonth() {
		const date = new Date();
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
	}

	function getLastDayOfMonth(monthValue) {
		if (!monthValue) return '31';

		const [year, month] = monthValue.split('-').map(Number);
		if (!year || !month) return '31';

		return String(new Date(year, month, 0).getDate()).padStart(2, '0');
	}

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

	function getRuntime(row, engineKey) {
		const runtimes = row?.runtimes || row?.runtime || {};
		const value = getValueByNormalizedKey(runtimes, engineKey);

		return formatRuntimeMinutes(parseRuntimeMinutes(value));
	}

	const monthlyEngineFuelSources = [
		{ key: 'ecu', label: 'ECU' },
		{ key: 'fms', label: 'FMS' },
		{ key: 'ems_internal', label: 'EMS Internal' },
		{ key: 'ems_external', label: 'EMS External' },
		{ key: 'engine_maker', label: 'Engine Maker' }
	];

	function engineFuelSourceHasAnyValue(sourceKey) {
		return monthlyRows.some((row) => {
			const fuelConsumption = row?.fuel_consumption || row?.fuelConsumption || {};

			const source = fuelConsumption?.[sourceKey] || {};
			if (!source || typeof source !== 'object') return false;

			return Object.entries(source).some(([key, value]) => {
				if (!isEngineKey(key)) return false;

				const number = getFuelNumber(value);
				return Number.isFinite(number) && number > 0;
			});
		});
	}

	let visibleMonthlyEngineFuelSources = $derived(
		monthlyEngineFuelSources.filter(
			(source) => canViewMonthlyFuelSource(source.key) && engineFuelSourceHasAnyValue(source.key)
		)
	);

	function getMonthlyFuelSourceLabel(sourceKey) {
		const hasInternal = visibleMonthlyEngineFuelSources.some(
			(source) => source.key === 'ems_internal'
		);

		const hasExternal = visibleMonthlyEngineFuelSources.some(
			(source) => source.key === 'ems_external'
		);

		if (sourceKey === 'ems_internal') {
			return hasInternal && hasExternal ? 'EMS Internal' : 'EMS';
		}

		if (sourceKey === 'ems_external') {
			return hasInternal && hasExternal ? 'EMS External' : 'EMS';
		}

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
		if (normalized === 'fod_single_l') return 'FOD Single';
		if (normalized === 'total_fod_l') return 'Total FOD';
		if (normalized === 'bunker_l') return 'Bunker';

		return normalizeEngineText(key);
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

		const order = ['fod_port_l', 'fod_stbd_l', 'fod_single_l', 'total_fod_l', 'bunker_l'];

		return [...columnMap.values()].sort((a, b) => {
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

	let visibleMonthlyGlobalFuelGroups = $derived([
		...(canViewMonthlyFuelSource('fod') && monthlyFodColumns.length
			? [{ key: 'fod', label: 'FOD', columns: monthlyFodColumns }]
			: []),
		...(canViewMonthlyFuelSource('fuel_bunker') && monthlyBunkerColumns.length
			? [
					{
						key: 'fuel_bunker',
						label: 'Fuel Bunker',
						columns: monthlyBunkerColumns
					}
				]
			: [])
	]);

	function getGlobalFuelValue(row, sourceKey, columnKey) {
		const source = getGlobalFuelSource(row, sourceKey);
		return formatFuel(getValueByNormalizedKey(source, columnKey));
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
		const paths = {
			me_port: [
				'highRpmLowSpeed.me_port.duration',
				'high_rpm_low_speed.me_port.duration',
				'highRpmLowSpeedMePortDuration',
				'high_rpm_low_speed_me_port_duration',
				'mePortHighRpmDuration',
				'sritiMePortDuration'
			],
			me_stbd: [
				'highRpmLowSpeed.me_stbd.duration',
				'high_rpm_low_speed.me_stbd.duration',
				'highRpmLowSpeedMeStbdDuration',
				'high_rpm_low_speed_me_stbd_duration',
				'meStbdHighRpmDuration',
				'sritiMeStbdDuration'
			]
		};

		return formatDuration(getNested(row, paths[engineKey] || []));
	}

	function getHighRpmFuel(row) {
		return formatFuel(
			firstValue(
				getNested(row, [
					'highRpmLowSpeed.totalFuel',
					'high_rpm_low_speed.totalFuel',
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
		const total = monthlyRows.reduce((sum, row) => {
			const fuelConsumption = row?.fuel_consumption || row?.fuelConsumption || {};

			const engineFuelTotal = visibleMonthlyEngineFuelSources.reduce((sourceSum, source) => {
				const value = getFuelNumber(fuelConsumption?.[source.key]?.total);
				return sourceSum + (Number.isFinite(value) ? value : 0);
			}, 0);

			const globalFuelTotal = visibleMonthlyGlobalFuelGroups.reduce((groupSum, group) => {
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

	async function loadMonthlyReport() {
		if (!$selectedVesselId) {
			error = 'No vessel has been selected from Fleet View.';
			reportData = null;
			return;
		}

		loading = true;
		error = '';

		try {
			const result = await getMonthlyReportData({
				vesselId: $selectedVesselId,
				month: reportMonth,
				startDate,
				endDate,
				timezoneMode,
				timezoneOffset
			});

			reportData = result;

			const payload = result?.data || result || {};
			const rows = Array.isArray(payload?.details) ? payload.details : [];

			const received = rows.reduce((sum, row) => {
				return (
					sum +
					Number(
						row?.data_received_stats?.received_minutes ||
							row?.dataReceivedStats?.receivedMinutes ||
							0
					)
				);
			}, 0);

			const total = rows.reduce((sum, row) => {
				return (
					sum +
					Number(
						row?.data_received_stats?.total_minutes || row?.dataReceivedStats?.totalMinutes || 0
					)
				);
			}, 0);

			const percentage = total ? ((received / total) * 100).toFixed(1) : '-';

			setPageStatus({
				pageKey: 'monthly-report',
				dataReceived: total > 0 ? `${received} of ${total} (${percentage}%)` : '-',
				sourcePage: 'Monthly Report'
			});

			console.log('[MONTHLY_REPORT_DATA]', result);
		} catch (err) {
			console.error('[MONTHLY_REPORT_ERROR]', err);
			error = err?.message || 'Failed to load monthly report.';
			reportData = null;
		} finally {
			loading = false;
		}
	}

	async function handleExportExcel() {
		if (!$selectedVesselId) {
			error = 'No vessel has been selected.';
			return;
		}

		exporting = true;
		error = '';

		try {
			const url = getMonthlyReportExcelUrl({
				vesselId: $selectedVesselId,
				month: reportMonth,
				startDate,
				endDate,
				timezoneMode,
				timezoneOffset
			});

			const safeVesselName = String(vesselName || 'vessel')
				.replace(/[^\w\s-]/g, '')
				.replace(/\s+/g, '_');

			await downloadApiFile(
				url,
				`Monthly_Report_${safeVesselName}_${reportMonth}_${startDate}-${endDate}.xlsx`
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
		startDate = '01';
		endDate = getLastDayOfMonth(reportMonth);
	});

	$effect(() => {
		if (!active) return;
		if (currentUser || currentUserLoading) return;

		loadCurrentUser();
	});

	$effect(() => {
		if (!active) return;
		if (!$selectedVesselId) return;
		if (!reportMonth) return;

		const key = `${$selectedVesselId}|${reportMonth}|${startDate}|${endDate}|${timezoneMode}|${timezoneOffset}`;

		if (loadedKeys[key]) return;

		loadedKeys = {
			...loadedKeys,
			[key]: true
		};

		loadMonthlyReport();
	});
</script>

<section class="monthly-page">
	<section class="monthly-header-card">
		<div>
			<div class="page-kicker">Monthly Report</div>
			<h1>{vesselName}</h1>
			<p>
				Monthly operation report by date with runtime, fuel consumption, speed, and high RPM low
				speed summary.
			</p>
		</div>
	</section>

	<section class="filter-card">
		<label>
			<span>Month</span>
			<input type="month" bind:value={reportMonth} />
		</label>

		<label>
			<span>Start Day</span>
			<input type="text" bind:value={startDate} placeholder="01" />
		</label>

		<label>
			<span>End Day</span>
			<input type="text" bind:value={endDate} placeholder="31" />
		</label>

		<label>
			<span>Timezone Mode</span>
			<select bind:value={timezoneMode}>
				<option value="auto">Auto</option>
				<option value="manual">Manual</option>
			</select>
		</label>

		{#if timezoneMode === 'manual'}
			<label>
				<span>Timezone Offset</span>
				<input type="text" bind:value={timezoneOffset} placeholder="+07:00" />
			</label>
		{/if}

		<div class="filter-actions">
			<button type="button" class="primary-btn" onclick={loadMonthlyReport} disabled={loading}>
				{loading ? 'Loading...' : 'Load Data'}
			</button>

			<button type="button" class="export-btn" onclick={handleExportExcel} disabled={exporting}>
				{exporting ? 'Exporting...' : 'Export Excel'}
			</button>
		</div>
	</section>

	{#if error}
		<div class="status-box error-box">{error}</div>
	{/if}

	{#if currentUserLoading}
		<div class="status-box">Loading user permissions...</div>
	{/if}

	{#if currentUserError}
		<div class="status-box error-box">{currentUserError}</div>
	{/if}

	<section class="summary-grid">
		{#if canViewEngineRuntimeTable}
			<article class="summary-card">
				<span>Total Runtime</span>
				<strong>{getSummaryRuntime()}</strong>
			</article>
		{/if}

		{#if canViewFuelConsumptionTable && hasMonthlyFuelColumns}
			<article class="summary-card">
				<span>Total Fuel</span>
				<strong>{getSummaryFuel()} L</strong>
			</article>
		{/if}

		{#if canViewSpeedStatsTable}
			<article class="summary-card">
				<span>Average Speed</span>
				<strong>{getSummaryAvgSpeed()}</strong>
			</article>
		{/if}

		{#if canViewTravelDistanceTable}
			<article class="summary-card">
				<span>Total Distance</span>
				<strong>{getSummaryDistance()}</strong>
			</article>
		{/if}
	</section>

	<section class="table-section monthly-main-table">
		<div class="section-header">
			<div>
				<span class="section-kicker">Daily Aggregation</span>
				<h2>Monthly Report by Date</h2>
			</div>

			<strong>{monthlyRows.length} rows</strong>
		</div>

		{#if monthlyRows.length}
			<div class="monthly-table-wrapper">
				<table class="monthly-report-table">
					<thead>
						<tr>
							<th rowspan="3" class="sticky-col">DATE</th>
							<th rowspan="3">DATA RECEIVED</th>

							{#if canViewEngineRuntimeTable}
								<th colspan={monthlyEngines.length || 1}>RUNTIME</th>
							{/if}

							{#if canViewFuelConsumptionTable}
								<th colspan={monthlyFuelColspan}> FUEL CONSUMPTION (L) </th>
							{/if}

							{#if canViewSpeedStatsTable}
								<th colspan="2">SPEED (KNOT)</th>
							{/if}

							{#if canViewHighRpmLowSpeedTable}
								<th colspan="3">HIGH RPM LOW SPEED</th>
							{/if}
						</tr>

						<tr>
							{#if canViewEngineRuntimeTable}
								{#if monthlyEngines.length}
									{#each monthlyEngines as engine}
										<th rowspan="2">{engine.name}</th>
									{/each}
								{:else}
									<th rowspan="2">-</th>
								{/if}
							{/if}

							{#if canViewFuelConsumptionTable}
								{#if hasMonthlyFuelColumns}
									{#each visibleMonthlyEngineFuelSources as source}
										<th colspan={monthlyEngines.length + 1}>
											{getMonthlyFuelSourceLabel(source.key)}
										</th>
									{/each}

									{#each visibleMonthlyGlobalFuelGroups as group}
										<th colspan={group.columns.length}>{group.label}</th>
									{/each}
								{:else}
									<th rowspan="2">-</th>
								{/if}
							{/if}

							{#if canViewSpeedStatsTable}
								<th rowspan="2">AVG</th>
								<th rowspan="2">MAX</th>
							{/if}

							{#if canViewHighRpmLowSpeedTable}
								<th colspan="2">DURATION (HH:MM)</th>
								<th rowspan="2">TOTAL FUEL (L)</th>
							{/if}
						</tr>

						<tr>
							{#if canViewFuelConsumptionTable && hasMonthlyFuelColumns}
								{#each visibleMonthlyEngineFuelSources as source}
									{#each monthlyEngines as engine}
										<th>{engine.name}</th>
									{/each}
									<th>TOTAL</th>
								{/each}

								{#each visibleMonthlyGlobalFuelGroups as group}
									{#each group.columns as column}
										<th>{column.label}</th>
									{/each}
								{/each}
							{/if}

							{#if canViewHighRpmLowSpeedTable}
								<th>ME PORT</th>
								<th>ME STBD</th>
							{/if}
						</tr>
					</thead>

					<tbody>
						{#each monthlyRows as row}
							{@const isFutureRow = isFutureMonthlyRow(row)}

							<tr class:future-row={isFutureRow}>
								<td class="sticky-col date-cell">{getDateCell(row)}</td>
								<td>{isFutureRow ? '-' : getDataReceived(row)}</td>

								{#if canViewEngineRuntimeTable}
									{#if monthlyEngines.length}
										{#each monthlyEngines as engine}
											<td>{isFutureRow ? '-' : getRuntime(row, engine.key)}</td>
										{/each}
									{:else}
										<td>-</td>
									{/if}
								{/if}

								{#if canViewFuelConsumptionTable}
									{#if hasMonthlyFuelColumns}
										{#each visibleMonthlyEngineFuelSources as source}
											{#each monthlyEngines as engine}
												<td>{isFutureRow ? '-' : getFuelBySource(row, source.key, engine.key)}</td>
											{/each}

											<td class="total-col">
												{isFutureRow ? '-' : getFuelSourceTotal(row, source.key)}
											</td>
										{/each}

										{#each visibleMonthlyGlobalFuelGroups as group}
											{#each group.columns as column}
												<td>{isFutureRow ? '-' : getGlobalFuelValue(row, group.key, column.key)}</td
												>
											{/each}
										{/each}
									{:else}
										<td>-</td>
									{/if}
								{/if}

								{#if canViewSpeedStatsTable}
									<td>{isFutureRow ? '-' : getSpeed(row, 'avg')}</td>
									<td>{isFutureRow ? '-' : getSpeed(row, 'max')}</td>
								{/if}

								{#if canViewHighRpmLowSpeedTable}
									<td>{isFutureRow ? '-' : getHighRpmDuration(row, 'me_port')}</td>
									<td>{isFutureRow ? '-' : getHighRpmDuration(row, 'me_stbd')}</td>
									<td class="total-col">{isFutureRow ? '-' : getHighRpmFuel(row)}</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="empty-box">Monthly report by date is not available yet.</div>
		{/if}
	</section>

	{#if hasRawData}
		<details class="raw-box">
			<summary>Raw Monthly Report Response</summary>
			<pre>{JSON.stringify(reportData, null, 2)}</pre>
		</details>
	{/if}
</section>

<style>
	.monthly-page {
		width: 100%;
		height: 100%;
		max-height: 100%;
		min-height: 0;
		padding: 14px;
		background: var(--color-base);
		color: var(--text-primary);
		overflow-y: auto;
		overflow-x: hidden;
		box-sizing: border-box;
	}

	.monthly-header-card,
	.filter-card,
	.summary-card,
	.table-section,
	.raw-box {
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
	}

	.monthly-header-card {
		padding: 14px 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.page-kicker,
	.section-kicker {
		display: inline-flex;
		width: fit-content;
		padding: 4px 9px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		color: #1d4ed8;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.monthly-header-card h1 {
		margin: 8px 0 0;
		font-size: 21px;
		line-height: 1.2;
		font-weight: 900;
		color: var(--text-primary);
	}

	.monthly-header-card p {
		margin: 7px 0 0;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
	}

	.header-meta {
		min-width: 120px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--color-elevated);
		border: 1px solid #e2e8f0;
		text-align: right;
	}

	.header-meta span {
		display: block;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.header-meta strong {
		display: block;
		margin-top: 5px;
		color: var(--text-primary);
		font-size: 14px;
		font-weight: 900;
	}

	.filter-card {
		margin-top: 12px;
		padding: 12px;
		display: flex;
		align-items: end;
		gap: 10px;
		flex-wrap: wrap;
	}

	.filter-card label {
		display: grid;
		gap: 5px;
	}

	.filter-card label span {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.filter-card input,
	.filter-card select {
		height: 32px;
		min-width: 130px;
		border: 1px solid #cbd5e1;
		background: var(--color-surface);
		padding: 0 9px;
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 700;
		outline: none;
	}

	.filter-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.primary-btn,
	.export-btn {
		height: 32px;
		padding: 0 12px;
		border: none;
		font-size: 11px;
		font-weight: 900;
		cursor: pointer;
	}

	.primary-btn {
		background: #2563eb;
		color: #ffffff;
	}

	.export-btn {
		background: #16a34a;
		color: #ffffff;
	}

	.primary-btn:disabled,
	.export-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.status-box {
		margin-top: 12px;
		padding: 10px 12px;
		border-radius: 10px;
		font-size: 12px;
		font-weight: 900;
	}

	.error-box {
		background: var(--color-danger-muted);
		color: #b91c1c;
		border: 1px solid #fecaca;
	}

	.summary-grid {
		margin-top: 12px;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
	}

	.summary-card {
		min-height: 84px;
		padding: 13px 14px;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.summary-card span {
		color: var(--text-secondary);
		font-size: 10.5px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.summary-card strong {
		margin-top: 9px;
		color: var(--text-primary);
		font-size: 19px;
		line-height: 1.1;
		font-weight: 900;
	}

	.table-section {
		margin-top: 12px;
		overflow: hidden;
	}

	.section-header {
		min-height: 54px;
		padding: 11px 13px;
		border-bottom: 1px solid #e5edf5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--color-surface);
	}

	.section-header h2 {
		margin: 6px 0 0;
		color: var(--text-primary);
		font-size: 16px;
		font-weight: 900;
	}

	.section-header > strong {
		padding: 5px 10px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 11px;
		font-weight: 900;
	}

	.monthly-table-wrapper {
		width: 100%;
		max-height: 100vh;
		min-height: 260px;
		overflow: auto;
		background: var(--color-surface);
	}

	.monthly-report-table {
		width: max-content;
		min-width: 100%;
		border-collapse: separate;
		border-spacing: 0;
		font-size: 11px;
	}

	.monthly-report-table thead th {
		position: sticky;
		top: 0;
		z-index: 5;
		background: #3478e5;
		color: #ffffff;
		border-right: 1px solid rgba(255, 255, 255, 0.32);
		border-bottom: 1px solid rgba(255, 255, 255, 0.32);
		text-align: center;
		vertical-align: middle;
		padding: 8px 8px;
		font-size: 10.5px;
		line-height: 1.15;
		font-weight: 900;
		white-space: nowrap;
	}

	.monthly-report-table thead tr:nth-child(2) th {
		top: 31px;
		background: #3b82f6;
	}

	.monthly-report-table thead tr:nth-child(3) th {
		top: 62px;
		background: #4b8bf0;
	}

	.monthly-report-table tbody td {
		border-right: 1px solid #d7dee8;
		border-bottom: 1px solid #d7dee8;
		padding: 7px 9px;
		text-align: center;
		white-space: nowrap;
		font-size: 11px;
		font-weight: 700;
		color: var(--text-primary);
		background: var(--color-surface);
	}

	.monthly-report-table tbody tr:nth-child(even) td {
		background: var(--color-elevated);
	}

	.monthly-report-table tbody tr:hover td {
		background: var(--color-elevated);
	}

	.monthly-report-table .sticky-col {
		position: sticky;
		left: 0;
		z-index: 7;
		min-width: 44px;
	}

	.monthly-report-table thead .sticky-col {
		z-index: 9;
		background: #3478e5 !important;
		box-shadow: 1px 0 0 rgba(255, 255, 255, 0.22);
	}

	.monthly-report-table tbody .sticky-col {
		background: inherit;
		box-shadow: 1px 0 0 #d7dee8;
	}

	.monthly-report-table .date-cell {
		font-weight: 900;
		color: var(--text-primary);
	}

	.monthly-report-table .total-col {
		font-weight: 900;
		color: var(--text-primary);
		background: var(--color-elevated);
	}

	.raw-box {
		margin-top: 12px;
		padding: 12px 14px;
	}

	.raw-box summary {
		cursor: pointer;
		font-size: 12px;
		font-weight: 900;
		color: #1d4ed8;
	}

	.raw-box pre {
		margin-top: 12px;
		padding: 12px;
		max-height: 360px;
		overflow: auto;
		background: #0f172a;
		color: #e2e8f0;
		font-size: 11px;
		line-height: 1.5;
	}

	.empty-box {
		padding: 18px 14px;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 800;
	}

	.future-row td {
		color: #94a3b8;
		background: var(--color-elevated);
	}

	@media (max-width: 1100px) {
		.summary-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 760px) {
		.monthly-page {
			padding: 10px;
		}

		.monthly-header-card {
			flex-direction: column;
			align-items: flex-start;
		}

		.header-meta {
			width: 100%;
			text-align: left;
		}

		.summary-grid {
			grid-template-columns: 1fr;
		}

		.filter-card input,
		.filter-card select {
			min-width: 100%;
		}

		.filter-actions {
			width: 100%;
		}

		.primary-btn,
		.export-btn {
			width: 100%;
		}

		.monthly-table-wrapper {
			max-height: calc(100vh - 360px);
		}
	}
</style>
