<script>
	import { onMount } from 'svelte';
	import { selectedVesselId, selectedVesselInfo } from '$lib/stores/selectedVessel.svelte.js';
	import {
		getAvailableDataLogColumns,
		getDataLogData,
		getDataLogDeviations,
		getDataLogExcelUrl
	} from '$lib/api/dataLogApi.js';

	import { setPageStatus } from '$lib/stores/pageStatusStore.svelte.js';
	import { downloadApiFile, apiRequest } from '$lib/api/authApi.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import { getDataLogRowHighlights, getDataLogTimestamp } from '$lib/utils/dataLogRowHighlights.js';
	import DataLogHeader from './DataLogHeader.svelte';
	import DataLogOverrideCard from './DataLogOverrideCard.svelte';
	import DataLogColumnsCard from './DataLogColumnsCard.svelte';
	import DataLogDeviationCard from './DataLogDeviationCard.svelte';
	import DataLogTableSection from './DataLogTableSection.svelte';
	import './data-log-page.css';

	let loading = $state(false);
	let loadingMore = $state(false);
	let exporting = $state(false);
	let error = $state('');
	let logData = $state(null);
	let loadedRows = $state([]);
	let rowHighlightContext = $state(null);
	let rowHighlightContextError = $state('');
	let dataLogPagination = $state(null);
	let dataLogPage = $state(1);
	let dataLogRequestId = 0;
	const DATA_LOG_PAGE_SIZE = 100;
	let dataDeviation = $state(null);
	let dataDeviationLoading = $state(false);
	let dataDeviationError = $state('');
	let dataDeviationSkipped = $state(false);

	let startDateTime = $state('');
	let endDateTime = $state('');
	let timezoneMode = $state('auto');
	let timezoneOffset = $state('+07:00');
	let activeTimePreset = $state('');
	let hasLoadedDateRange = $state(false);

	let { active = false } = $props();

	let currentUser = $state(null);
	let currentUserLoading = $state(false);
	let currentUserError = $state('');
	let availableColumnsData = $state(null);
	let availableColumnsLoading = $state(false);
	let availableColumnsError = $state('');
	let availableColumnsVesselId = $state(null);

	async function loadCurrentUser() {
		if (currentUser || currentUserLoading) return currentUser;

		currentUserLoading = true;
		currentUserError = '';

		try {
			const response = await apiRequest('/users/current-user', {
				method: 'GET'
			});

			currentUser = response?.data || response?.user || response || null;

			console.log('[DATA_LOG_CURRENT_USER_PERMISSION]', currentUser);

			return currentUser;
		} catch (err) {
			console.error('[DATA_LOG_CURRENT_USER_PERMISSION_ERROR]', err);
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

	let canViewFuelEcu = $derived(hasPermission('view_fuel_ecu'));
	let canViewFuelFms = $derived(hasPermission('view_fuel_fms'));
	let canViewFuelFod = $derived(hasPermission('view_fuel_fod'));
	let canViewFuelEmsInternal = $derived(hasPermission('view_fuel_ems_internal'));
	let canViewFuelEmsExternal = $derived(hasPermission('view_fuel_ems_external'));
	let canViewFuelEngineMaker = $derived(hasPermission('view_fuel_engine_maker'));
	let canManageDataLogOverride = $derived(hasPermission('manage_data_log_override'));
	let canViewDataLogAvailableColumns = $derived(hasPermission('view_data_log_available_columns'));
	let canViewDataLogDataDeviations = $derived(hasPermission('view_data_log_data_deviations'));
	let canViewHighRpmLowSpeedTable = $derived(hasPermission('view_high_rpm_low_speed_table'));

	let overrideDownloadingTemplate = $state(false);
	let overrideImporting = $state(false);
	let overrideDeleting = $state(false);

	let overrideFile = $state(null);
	let overrideSourceFilePath = $state('');
	let overrideMessage = $state('');
	let overrideError = $state('');
	let overrideImports = $state([]);
	let overrideImportsLoading = $state(false);
	let overrideImportsError = $state('');
	let overrideImportsPagination = $state({
		page: 1,
		pageSize: 20,
		totalItems: 0,
		totalPages: 1,
		hasNext: false,
		hasPrevious: false
	});
	let overrideImportDeletingPath = $state('');
	const OVERRIDE_IMPORTS_PAGE_SIZE = 20;

	let canViewAnyEngineFuelSource = $derived(
		canViewFuelEcu ||
			canViewFuelFms ||
			canViewFuelEmsInternal ||
			canViewFuelEmsExternal ||
			canViewFuelEngineMaker
	);

	function normalizeColumnKey(key) {
		return String(key || '')
			.trim()
			.toLowerCase();
	}

	function isFuelRelatedColumn(columnKey) {
		const key = normalizeColumnKey(columnKey);

		return (
			key.includes('fuel') ||
			key.includes('_f_used') ||
			key.includes('_f_consump') ||
			key.includes('_f_rate') ||
			key.includes('_fm_') ||
			key.startsWith('fm_') ||
			key.includes('fms') ||
			key.includes('ecu') ||
			key.includes('ems') ||
			key.includes('flowmeter') ||
			key.includes('flow_meter') ||
			key.includes('volume_used') ||
			key.includes('volume_total') ||
			key.includes('bunker') ||
			key.includes('engine_maker') ||
			key.includes('enginemaker')
		);
	}

	function getFuelSourceFromColumn(columnKey) {
		const key = normalizeColumnKey(columnKey);

		if (!isFuelRelatedColumn(key)) return null;

		if (key.includes('fod')) return 'fod';

		if (
			key.includes('ems_external') ||
			key.includes('emsexternal') ||
			key.includes('ems_ext') ||
			key.includes('external_ems')
		) {
			return 'ems_external';
		}

		if (
			key.includes('ems_internal') ||
			key.includes('emsinternal') ||
			key.includes('ems_int') ||
			key.includes('internal_ems')
		) {
			return 'ems_internal';
		}

		if (key.includes('engine_maker') || key.includes('enginemaker')) {
			return 'engine_maker';
		}

		if (
			key.includes('fms') ||
			key.startsWith('fm_') ||
			key.includes('_fm_') ||
			key.includes('flowmeter') ||
			key.includes('flow_meter') ||
			key.includes('_f_consump') ||
			key.includes('fuel_consump')
		) {
			return 'fms';
		}

		if (key.includes('ecu')) return 'ecu';

		return 'generic_engine_fuel';
	}

	function canShowFuelColumn(columnKey) {
		const source = getFuelSourceFromColumn(columnKey);

		if (!source) return true;
		if (source === 'ecu') return canViewFuelEcu;
		if (source === 'fms') return canViewFuelFms;
		if (source === 'fod') return canViewFuelFod;
		if (source === 'ems_internal') return canViewFuelEmsInternal;
		if (source === 'ems_external') return canViewFuelEmsExternal;
		if (source === 'engine_maker') return canViewFuelEngineMaker;

		return canViewAnyEngineFuelSource;
	}

	function prettifyColumnLabel(key) {
		return String(key || '-')
			.replaceAll('_', ' ')
			.replace(/\b\w/g, (char) => char.toUpperCase());
	}

	const hiddenDisplayColumns = new Set(['timestamp_utc']);

	function isDisplayColumn(key) {
		const normalizedKey = normalizeColumnKey(key);

		if (normalizedKey === 'rig' && !canViewDataLogAvailableColumns) return false;

		return !hiddenDisplayColumns.has(normalizedKey) && canShowFuelColumn(normalizedKey);
	}

	function filterDisplayColumns(columns = []) {
		return Array.isArray(columns) ? columns.filter(isDisplayColumn) : [];
	}

	function getPayloadRows(payload = {}) {
		return pickArray(
			payload?.details,
			payload?.rows,
			payload?.logs,
			payload?.items,
			payload?.data,
			payload?.table,
			Array.isArray(payload) ? payload : []
		);
	}

	function getPayloadColumns(payload = {}) {
		if (Array.isArray(payload?.available_columns)) return payload.available_columns;
		if (Array.isArray(payload?.columns)) return payload.columns;
		if (Array.isArray(payload?.visible_columns)) return payload.visible_columns;

		const rows = getPayloadRows(payload);
		const keys = new Set();

		for (const row of rows.slice(0, 25)) {
			Object.keys(row || {}).forEach((key) => keys.add(key));
		}

		const preferred = DEFAULT_DATA_LOG_COLUMNS.filter((key) => keys.has(key));
		const extras = [...keys]
			.filter((key) => !preferred.includes(key))
			.sort((left, right) => String(left).localeCompare(String(right)));

		return [...preferred, ...extras];
	}

	const DATA_DEVIATION_LABELS = {
		jumping_data: 'Jumping Data',
		spike_rpm: 'Spike RPM',
		outrange_rpm: 'Outrange RPM',
		rpm_blank: 'RPM Blank'
	};

	const DATA_DEVIATION_DESCRIPTIONS = {
		jumping_data: 'Telemetry point jumps or discontinuities found in the selected range.',
		spike_rpm: 'RPM values that spike sharply beyond the expected trend.',
		outrange_rpm: 'RPM values outside the configured low/high operating range.',
		rpm_blank: 'Intervals where RPM values are missing or blank.'
	};

	function normalizeDeviationKey(key) {
		return String(key || '')
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '');
	}

	function getDeviationLabel(key) {
		const normalizedKey = normalizeDeviationKey(key);
		return DATA_DEVIATION_LABELS[normalizedKey] || formatColumnAcronyms(prettifyColumnLabel(key));
	}

	function getDeviationDescription(key) {
		return (
			DATA_DEVIATION_DESCRIPTIONS[normalizeDeviationKey(key)] ||
			'Deviation found in the selected date range.'
		);
	}

	function normalizeDeviationPayload(payload = {}) {
		const source = payload?.data || payload || {};
		const deviations = source?.deviations || {};

		if (!deviations || typeof deviations !== 'object' || Array.isArray(deviations)) {
			return [];
		}

		return Object.entries(deviations).map(([key, value = {}]) => {
			const rows = Array.isArray(value?.rows) ? value.rows : [];

			return {
				key: normalizeDeviationKey(key),
				rawKey: key,
				label: getDeviationLabel(key),
				description: getDeviationDescription(key),
				count: Number(value?.count ?? rows.length ?? 0) || 0,
				totalDurationMinutes:
					Number(value?.total_duration_minutes ?? value?.totalDurationMinutes ?? 0) || 0,
				rows
			};
		});
	}

	function flattenDeviationRows(categories = []) {
		return categories.flatMap((category) =>
			(category.rows || []).map((row, index) => ({
				...row,
				id: `${category.key}-${index}`,
				type: category.label,
				key: category.key
			}))
		);
	}

	const DEFAULT_DATA_LOG_COLUMNS = [
		'timestamp',
		'latitude',
		'longitude',
		'course',
		'speed',
		'rig',
		'me_port_run',
		'me_port_rpm',
		'me_port_load',
		'me_port_f_used',
		'me_stbd_run',
		'me_stbd_rpm',
		'me_stbd_load',
		'me_stbd_f_used',
		'ae_port_run',
		'ae_port_rpm',
		'ae_port_load',
		'ae_port_f_used',
		'ae_stbd_run',
		'ae_stbd_rpm',
		'ae_stbd_load',
		'ae_stbd_f_used'
	];

	let selectedColumns = $state([...DEFAULT_DATA_LOG_COLUMNS]);
	let columnSelectionVesselId = $state(null);

	let apiAvailableColumns = $derived(
		filterDisplayColumns(
			Array.isArray(availableColumnsData?.available_columns)
				? availableColumnsData.available_columns
				: Array.isArray(normalizedData?.available_columns)
					? normalizedData.available_columns
					: []
		)
	);

	let responseColumns = $derived(filterDisplayColumns(getPayloadColumns(normalizedData)));

	let visibleColumns = $derived(
		apiAvailableColumns.length
			? apiAvailableColumns
			: responseColumns.length
				? responseColumns
				: filterDisplayColumns(DEFAULT_DATA_LOG_COLUMNS)
	);

	let displaySelectedColumns = $derived(
		visibleColumns.filter((column) => selectedColumns.includes(column)).length
			? visibleColumns.filter((column) => selectedColumns.includes(column))
			: responseColumns.length
				? responseColumns.filter((column) => visibleColumns.includes(column))
				: visibleColumns
	);

	function sortRowsNewestFirst(rows = [], timezone = 'UTC+00:00') {
		return [...rows].sort((a, b) => {
			const aTime = getDataLogTimestamp(a, timezone);
			const bTime = getDataLogTimestamp(b, timezone);
			return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
		});
	}

	function normalizeDataLogPagination(rawPagination = {}, fallbackPage = 1, fallbackTotalRows = 0) {
		const page =
			Number(rawPagination?.page ?? rawPagination?.currentPage ?? fallbackPage ?? 1) || 1;
		const pageSize =
			Number(rawPagination?.pageSize ?? rawPagination?.page_size ?? rawPagination?.limit) ||
			DATA_LOG_PAGE_SIZE;
		const totalItems =
			Number(
				rawPagination?.totalItems ??
					rawPagination?.total_items ??
					rawPagination?.total ??
					rawPagination?.count
			) || fallbackTotalRows;
		const totalPages =
			Number(rawPagination?.totalPages ?? rawPagination?.total_pages ?? rawPagination?.pages) ||
			Math.max(1, Math.ceil(totalItems / pageSize)) ||
			page;

		return {
			...rawPagination,
			page,
			pageSize,
			totalItems,
			totalPages,
			hasNext: rawPagination?.hasNext ?? rawPagination?.has_next ?? page < totalPages,
			hasPrevious: rawPagination?.hasPrevious ?? rawPagination?.has_previous ?? page > 1
		};
	}

	function pad(value) {
		return String(value).padStart(2, '0');
	}

	function toLocalInputValue(date) {
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
			date.getHours()
		)}:${pad(date.getMinutes())}`;
	}

	const TIME_PRESETS = [
		{ id: 'today', label: 'Today' },
		{ id: 'yesterday', label: 'Yesterday' },
		{ id: 'two-days-before', label: '2 Days Before' },
		{ id: 'last-7-days', label: 'Last 7 Days' },
		{ id: 'last-30-days', label: 'Last 30 Days' }
	];

	function startOfLocalDay(date) {
		return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
	}

	function addLocalDays(date, amount) {
		const nextDate = new Date(date);
		nextDate.setDate(nextDate.getDate() + amount);
		return nextDate;
	}

	function applyTimePreset(presetId) {
		const now = new Date();
		let start = null;
		let end = null;

		if (presetId === 'today') {
			start = startOfLocalDay(now);
			end = startOfLocalDay(addLocalDays(now, 1));
		} else if (presetId === 'yesterday') {
			const yesterday = addLocalDays(now, -1);
			start = startOfLocalDay(yesterday);
			end = startOfLocalDay(now);
		} else if (presetId === 'two-days-before') {
			const twoDaysBefore = addLocalDays(now, -2);
			start = startOfLocalDay(twoDaysBefore);
			end = startOfLocalDay(addLocalDays(now, -1));
		} else if (presetId === 'last-7-days') {
			end = startOfLocalDay(now);
			start = startOfLocalDay(addLocalDays(now, -7));
		} else if (presetId === 'last-30-days') {
			end = startOfLocalDay(now);
			start = startOfLocalDay(addLocalDays(now, -30));
		}

		if (!start || !end) return;

		activeTimePreset = presetId;
		startDateTime = toLocalInputValue(start);
		endDateTime = toLocalInputValue(end);
		markDataLogFiltersDirty();
	}

	function markDataLogFiltersDirty({ clearPreset = false } = {}) {
		if (clearPreset) {
			activeTimePreset = '';
		}

		hasLoadedDateRange = false;
		rowHighlightContext = null;
		rowHighlightContextError = '';
		dataDeviation = null;
		dataDeviationError = '';
		dataDeviationLoading = false;
		overrideImports = [];
		overrideImportsError = '';
		overrideImportsPagination = {
			page: 1,
			pageSize: OVERRIDE_IMPORTS_PAGE_SIZE,
			totalItems: 0,
			totalPages: 1,
			hasNext: false,
			hasPrevious: false
		};
	}

	function clearActiveTimePreset() {
		markDataLogFiltersDirty({ clearPreset: true });
	}

	function formatTimezoneOffsetFromMinutes(offsetMinutes) {
		const normalizedMinutes = Number(offsetMinutes);

		if (!Number.isFinite(normalizedMinutes)) return '';

		const totalMinutes = -normalizedMinutes;
		const sign = totalMinutes >= 0 ? '+' : '-';
		const absoluteMinutes = Math.abs(totalMinutes);
		const hours = Math.floor(absoluteMinutes / 60);
		const minutes = absoluteMinutes % 60;

		return `UTC${sign}${pad(hours)}:${pad(minutes)}`;
	}

	function normalizeUtcLabel(value) {
		if (value === undefined || value === null || value === '') return '';

		const text = String(value).trim();
		if (!text || text === '-') return '';

		if (/^Asia\/Jakarta$/i.test(text) || /^WIB$/i.test(text)) return 'UTC+07:00';
		if (/^Asia\/Makassar$/i.test(text) || /^WITA$/i.test(text)) return 'UTC+08:00';
		if (/^Asia\/Jayapura$/i.test(text) || /^WIT$/i.test(text)) return 'UTC+09:00';

		const utcMatch =
			text.match(/\bUTC\s*([+-]\d{1,2})(?::?(\d{2}))?/i) ||
			text.match(/^([+-]\d{1,2})(?::?(\d{2}))?$/);

		if (!utcMatch) return '';

		const rawHour = utcMatch[1];
		const sign = rawHour.startsWith('-') ? '-' : '+';
		const hour = rawHour.replace(/^[+-]/, '').padStart(2, '0');
		const minute = (utcMatch[2] || '00').padStart(2, '0');

		return `UTC${sign}${hour}:${minute}`;
	}

	function getAutoTimezoneLabel() {
		const payload = normalizedData || {};
		const vessel = $selectedVesselInfo || {};

		return (
			normalizeUtcLabel(payload?.timezone) ||
			normalizeUtcLabel(payload?.timezoneOffset) ||
			normalizeUtcLabel(payload?.timezone_offset) ||
			normalizeUtcLabel(payload?.utc) ||
			normalizeUtcLabel(payload?.utcOffset) ||
			normalizeUtcLabel(payload?.utc_offset) ||
			normalizeUtcLabel(vessel?.timezone) ||
			normalizeUtcLabel(vessel?.timeZone) ||
			normalizeUtcLabel(vessel?.timezoneOffset) ||
			normalizeUtcLabel(vessel?.timezone_offset) ||
			normalizeUtcLabel(vessel?.utc) ||
			normalizeUtcLabel(vessel?.utcOffset) ||
			normalizeUtcLabel(vessel?.utc_offset) ||
			normalizeUtcLabel(vessel?.raw?.timezone) ||
			normalizeUtcLabel(vessel?.raw?.timezoneOffset) ||
			normalizeUtcLabel(vessel?.raw?.utcOffset) ||
			(typeof window !== 'undefined'
				? formatTimezoneOffsetFromMinutes(new Date().getTimezoneOffset())
				: 'UTC+07:00')
		);
	}

	function toApiDateTime(value) {
		if (!value) return '';

		const date = new Date(value);

		if (Number.isNaN(date.getTime())) return value;

		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
			date.getHours()
		)}:${pad(date.getMinutes())}:00`;
	}

	function formatValue(value) {
		if (value === undefined || value === null || value === '') return '-';

		if (typeof value === 'number') {
			if (Number.isNaN(value)) return 'nan';
			if (!Number.isFinite(value)) return String(value);
			return Number.isInteger(value) ? String(value) : value.toFixed(2);
		}

		if (typeof value === 'string') {
			const trimmed = value.trim();
			const normalized = trimmed.toLowerCase();

			if (
				normalized === 'null' ||
				normalized === 'undefined' ||
				normalized === 'infinity' ||
				normalized === '-infinity'
			) {
				return '-';
			}

			return trimmed || '-';
		}

		if (typeof value === 'boolean') {
			return value ? 'ON' : 'OFF';
		}

		return value;
	}

	function normalizeLookupKey(key) {
		return String(key || '')
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]/g, '');
	}

	function getRowColumnValue(row, column) {
		if (!row || !column) return undefined;

		if (Object.prototype.hasOwnProperty.call(row, column)) {
			return row[column];
		}

		const wantedKey = normalizeLookupKey(column);
		const matchedKey = Object.keys(row).find((key) => normalizeLookupKey(key) === wantedKey);

		return matchedKey ? row[matchedKey] : undefined;
	}

	function formatCellValue(value, column) {
		if (String(column || '').toLowerCase() === 'timestamp') {
			const formatted = formatValue(value);

			if (formatted === '-') return formatted;

			return String(formatted).replace(/\s*\(UTC[+-]?\d{1,2}(?::?\d{2})?\)\s*/i, '');
		}

		return formatValue(value);
	}

	function pickArray(...values) {
		for (const value of values) {
			if (Array.isArray(value)) return value;
		}

		return [];
	}

	function getEmsVariantSource(columnKey) {
		const source = getFuelSourceFromColumn(columnKey);

		if (source === 'ems_internal') return 'ems_internal';
		if (source === 'ems_external') return 'ems_external';

		return null;
	}

	function getEmsSourceCount(columns = []) {
		const sources = new Set();

		for (const column of columns) {
			const source = getEmsVariantSource(column);

			if (source) {
				sources.add(source);
			}
		}

		return sources.size;
	}

	function formatColumnAcronyms(label) {
		return String(label || '')
			.replace(/\bMe\b/g, 'ME')
			.replace(/\bAe\b/g, 'AE')
			.replace(/\bRpm\b/g, 'RPM')
			.replace(/\bStbd\b/g, 'STBD')
			.replace(/\bEms\b/g, 'EMS')
			.replace(/\bEcu\b/g, 'ECU')
			.replace(/\bFms\b/g, 'FMS')
			.replace(/\bFod\b/g, 'FOD');
	}

	function getColumnLabel(key, contextColumns = visibleColumns) {
		let label = formatColumnAcronyms(prettifyColumnLabel(key));

		const emsSource = getEmsVariantSource(key);
		const emsSourceCount = getEmsSourceCount(contextColumns);

		if (emsSource && emsSourceCount <= 1) {
			label = label
				.replace(/\bEMS\s+(Internal|External|Int|Ext)\b/gi, 'EMS')
				.replace(/\b(Internal|External|Int|Ext)\s+EMS\b/gi, 'EMS')
				.replace(/\b(Internal|External|Int|Ext)\b/gi, '')
				.replace(/\s+/g, ' ')
				.trim();
		} else if (emsSource === 'ems_internal') {
			label = label
				.replace(/\bEMS\s+(Internal|Int)\b/gi, 'VMS')
				.replace(/\b(Internal|Int)\s+EMS\b/gi, 'VMS')
				.replace(/\b(Internal|Int)\b/gi, 'VMS')
				.replace(/\s+/g, ' ')
				.trim();
		} else if (emsSource === 'ems_external') {
			label = label
				.replace(/\bEMS\s+(External|Ext)\b/gi, 'EMS')
				.replace(/\b(External|Ext)\s+EMS\b/gi, 'EMS')
				.replace(/\b(External|Ext)\b/gi, '')
				.replace(/\s+/g, ' ')
				.trim();
		}

		return label;
	}

	function toggleColumn(key) {
		if (selectedColumns.includes(key)) {
			selectedColumns = selectedColumns.filter((item) => item !== key);
		} else {
			selectedColumns = [...selectedColumns, key];
		}
	}

	function selectAllColumns() {
		selectedColumns = [...visibleColumns];
	}

	function selectBasicColumns() {
		const basicColumns = new Set(['timestamp', 'course', 'latitude', 'longitude', 'speed', 'rig']);
		selectedColumns = visibleColumns.filter((column) => {
			const key = normalizeColumnKey(column);
			return basicColumns.has(key) || key.endsWith('_rpm') || key.endsWith('_run');
		});
	}

	let vesselName = $derived(
		$selectedVesselInfo?.name || $selectedVesselInfo?.vesselName || 'Selected Vessel'
	);

	let normalizedData = $derived(logData?.data || logData || {});
	let normalizedDeviationData = $derived(dataDeviation?.data || dataDeviation || {});
	let dataDeviationCategories = $derived(normalizeDeviationPayload(normalizedDeviationData));
	let dataDeviationRows = $derived(flattenDeviationRows(dataDeviationCategories));
	let dataDeviationTotalCount = $derived(
		dataDeviationCategories.reduce((total, item) => total + (Number(item.count) || 0), 0)
	);
	let dataDeviationTotalDuration = $derived(
		dataDeviationCategories.reduce(
			(total, item) => total + (Number(item.totalDurationMinutes) || 0),
			0
		)
	);
	let selectedRangeDays = $derived(getSelectedRangeDays());
	let shouldLoadDataDeviation = $derived(
		canViewDataLogDataDeviations && (!Number.isFinite(selectedRangeDays) || selectedRangeDays <= 14)
	);

	let dataRows = $derived(loadedRows);
	let rowHighlights = $derived(
		canViewHighRpmLowSpeedTable
			? getDataLogRowHighlights(
					[...dataRows, ...getPayloadRows(rowHighlightContext?.payload)],
					normalizedData?.timezone ||
						(timezoneMode === 'manual' ? timezoneOffset : getAutoTimezoneLabel())
				)
			: new Map()
	);

	let hasNextDataLogPage = $derived(
		Boolean(dataLogPagination?.hasPrevious) || Number(dataLogPagination?.page || dataLogPage) > 1
	);

	let shouldShowDateRangeOverlay = $derived(!hasLoadedDateRange || !startDateTime || !endDateTime);

	async function loadAvailableColumns() {
		if (!$selectedVesselId || !canViewDataLogAvailableColumns || availableColumnsLoading) {
			return availableColumnsData;
		}

		if (availableColumnsData && availableColumnsVesselId === $selectedVesselId) {
			return availableColumnsData;
		}

		availableColumnsLoading = true;
		availableColumnsError = '';

		try {
			const result = await getAvailableDataLogColumns({
				vesselId: $selectedVesselId
			});

			const payload = result?.data || result || {};
			availableColumnsData = payload;
			availableColumnsVesselId = $selectedVesselId;

			const columns = filterDisplayColumns(payload?.available_columns || []);
			if (columns.length && columnSelectionVesselId !== $selectedVesselId) {
				selectedColumns = columns;
				columnSelectionVesselId = $selectedVesselId;
			}

			return payload;
		} catch (err) {
			console.error('[DATA_LOG_AVAILABLE_COLUMNS_ERROR]', err);
			availableColumnsError = err?.message || 'Failed to load available data log columns.';
			availableColumnsData = null;
			return null;
		} finally {
			availableColumnsLoading = false;
		}
	}

	function getDataLogRequestParams(page = 1) {
		return {
			vesselId: $selectedVesselId,
			start: toApiDateTime(startDateTime),
			end: toApiDateTime(endDateTime),
			timezoneMode,
			timezoneOffset,
			columns: '',
			page,
			pageSize: DATA_LOG_PAGE_SIZE
		};
	}

	function getSelectedRangeDays() {
		if (!startDateTime || !endDateTime) return null;
		const startTime = new Date(startDateTime).getTime();
		const endTime = new Date(endDateTime).getTime();
		if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
		return Math.abs(endTime - startTime) / 86400000;
	}

	async function fetchDataLogPage(page = 1) {
		if (rowHighlightContext?.page === page) return rowHighlightContext.result;
		return getDataLogData(getDataLogRequestParams(page));
	}

	async function loadDataLog({ page = null, append = false } = {}) {
		if (!$selectedVesselId) {
			error = 'No vessel has been selected from Fleet View.';
			rowHighlightContext = null;
			rowHighlightContextError = '';
			logData = null;
			loadedRows = [];
			dataLogPagination = null;
			hasLoadedDateRange = false;
			dataDeviation = null;
			dataDeviationError = '';
			dataDeviationLoading = false;
			return;
		}

		await loadCurrentUser();
		await loadAvailableColumns();

		const requestId = ++dataLogRequestId;

		if (append) {
			if (loading || loadingMore || !hasNextDataLogPage) return;
			loadingMore = true;
		} else {
			loading = true;
			loadedRows = [];
			rowHighlightContext = null;
			rowHighlightContextError = '';
			logData = null;
			dataLogPagination = null;
			dataLogPage = 1;
			dataDeviation = null;
			dataDeviationError = '';
			dataDeviationSkipped = false;
		}

		error = '';

		try {
			if (!append && canViewDataLogDataDeviations) {
				loadDataDeviation({ requestId });
			}

			let targetPage = Number(page || 1);
			let result;
			let payload;
			let rows;
			let pagination;
			let firstPageResult = null;

			if (append) {
				targetPage = Math.max(1, Number(page || dataLogPage - 1));
				result = await fetchDataLogPage(targetPage);
				if (requestId !== dataLogRequestId) return;

				payload = result?.data || result || {};
				rows = getPayloadRows(payload);
				pagination = normalizeDataLogPagination(payload?.pagination, targetPage, rows.length);
			} else {
				const firstResult = await fetchDataLogPage(1);
				if (requestId !== dataLogRequestId) return;
				firstPageResult = firstResult;

				const firstPayload = firstResult?.data || firstResult || {};
				const firstRows = getPayloadRows(firstPayload);
				const firstPagination = normalizeDataLogPagination(
					firstPayload?.pagination,
					1,
					firstRows.length
				);
				const newestPage = Math.max(1, Number(firstPagination?.totalPages || 1));

				if (newestPage > 1) {
					result = await fetchDataLogPage(newestPage);
					if (requestId !== dataLogRequestId) return;

					payload = result?.data || result || {};
					rows = getPayloadRows(payload);
					pagination = normalizeDataLogPagination(
						payload?.pagination,
						newestPage,
						firstPagination.totalItems
					);
				} else {
					result = firstResult;
					payload = firstPayload;
					rows = firstRows;
					pagination = firstPagination;
				}
			}

			// One older page supplies the preceding 10+ minutes without loading the whole range.
			// Cache it for the next scroll, but do not include it in the displayed row count yet.
			let nextHighlightContext = null;
			let contextError = '';
			const contextPage = Number(pagination.page) - 1;
			if (canViewHighRpmLowSpeedTable && contextPage >= 1) {
				try {
					const contextResult =
						contextPage === 1 && firstPageResult
							? firstPageResult
							: await fetchDataLogPage(contextPage);
					nextHighlightContext = {
						page: contextPage,
						result: contextResult,
						payload: contextResult?.data || contextResult || {}
					};
				} catch {
					contextError =
						'Earlier duration data could not be loaded. Load older rows to verify the first intervals.';
				}
			}
			if (requestId !== dataLogRequestId) return;

			const nextRows = sortRowsNewestFirst(
				append ? [...loadedRows, ...rows] : rows,
				payload?.timezone || (timezoneMode === 'manual' ? timezoneOffset : getAutoTimezoneLabel())
			);
			const stats = payload?.stats || {};

			rowHighlightContext = nextHighlightContext;
			rowHighlightContextError = contextError;
			loadedRows = nextRows;
			dataLogPagination = pagination;
			dataLogPage = Number(pagination?.page || page);
			if (!append) {
				hasLoadedDateRange = true;
			}
			logData = {
				...payload,
				details: nextRows,
				pagination
			};

			setPageStatus({
				pageKey: 'data-log',
				dataReceived:
					stats?.received_slots !== undefined && stats?.total_slots !== undefined
						? `${stats.received_slots} of ${stats.total_slots} (${stats.percentage ?? '-'}%)`
						: `${nextRows.length} of ${pagination?.totalItems ?? nextRows.length} rows`,
				sourcePage: 'Data Log'
			});

			const payloadColumns = filterDisplayColumns(getPayloadColumns(payload));
			if (!append && columnSelectionVesselId !== $selectedVesselId) {
				const initialColumns =
					Array.isArray(payload.available_columns) && payload.available_columns.length
						? filterDisplayColumns(payload.available_columns)
						: payloadColumns;

				if (initialColumns.length) {
					selectedColumns = initialColumns;
					columnSelectionVesselId = $selectedVesselId;
				}
			}

			if (!append && canManageDataLogOverride) {
				loadOverrideImports({ page: 1 });
			}

			console.log('[DATA_LOG_DATA]', result);
		} catch (err) {
			console.error('[DATA_LOG_ERROR]', err);
			error = err?.message || 'Failed to load data log.';
			if (!append) {
				logData = null;
				loadedRows = [];
				dataLogPagination = null;
				hasLoadedDateRange = false;
				dataDeviation = null;
				dataDeviationSkipped = false;
			}
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	async function loadDataDeviation({ requestId = dataLogRequestId } = {}) {
		if (!$selectedVesselId || !startDateTime || !endDateTime || !canViewDataLogDataDeviations) {
			dataDeviation = null;
			dataDeviationError = '';
			dataDeviationSkipped = false;
			dataDeviationLoading = false;
			return null;
		}

		if (!shouldLoadDataDeviation) {
			dataDeviation = null;
			dataDeviationError = '';
			dataDeviationSkipped = true;
			dataDeviationLoading = false;
			return null;
		}

		dataDeviationLoading = true;
		dataDeviationError = '';
		dataDeviationSkipped = false;

		try {
			const result = await getDataLogDeviations({
				vesselId: $selectedVesselId,
				start: toApiDateTime(startDateTime),
				end: toApiDateTime(endDateTime),
				timezoneMode,
				timezoneOffset
			});

			if (requestId !== dataLogRequestId) return null;

			dataDeviation = result?.data || result || null;
			console.log('[DATA_LOG_DEVIATION]', result);
			return dataDeviation;
		} catch (err) {
			if (requestId !== dataLogRequestId) return null;

			console.error('[DATA_LOG_DEVIATION_ERROR]', err);
			dataDeviation = null;
			dataDeviationError = err?.message || 'Failed to load data deviations.';
			return null;
		} finally {
			if (requestId === dataLogRequestId) {
				dataDeviationLoading = false;
			}
		}
	}

	function loadMoreDataLog() {
		if (!hasNextDataLogPage || loading || loadingMore) return;
		loadDataLog({ page: Math.max(1, dataLogPage - 1), append: true });
	}

	function handleDataLogTableScroll(event) {
		const element = event?.currentTarget;
		if (!element || !hasNextDataLogPage || loading || loadingMore) return;

		const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;

		if (distanceFromBottom < 320) {
			loadMoreDataLog();
		}
	}

	async function handleExportExcel() {
		if (!$selectedVesselId) {
			error = 'No vessel has been selected.';
			return;
		}

		await loadCurrentUser();

		const requestedColumns = [...displaySelectedColumns];

		exporting = true;
		error = '';

		try {
			const url = getDataLogExcelUrl({
				vesselId: $selectedVesselId,
				start: toApiDateTime(startDateTime),
				end: toApiDateTime(endDateTime),
				timezoneMode,
				timezoneOffset,
				columns: canViewDataLogAvailableColumns ? requestedColumns.join(',') : ''
			});

			const safeVesselName = String(vesselName || 'vessel')
				.replace(/[^\w\s-]/g, '')
				.replace(/\s+/g, '_');

			await downloadApiFile(
				url,
				`Data_Log_${safeVesselName}_${toApiDateTime(startDateTime).slice(0, 10)}.xlsx`
			);
		} catch (err) {
			console.error('[DATA_LOG_EXPORT_ERROR]', err);
			error = err?.message || 'Failed to export data log to Excel.';
		} finally {
			exporting = false;
		}
	}

	function getOverrideResponseMessage(
		response,
		fallback = 'Override operation completed successfully.'
	) {
		return response?.message || response?.data?.message || fallback;
	}

	function getImportedSourceFilePath(response) {
		return (
			response?.data?.sourceFilePath ||
			response?.data?.source_file_path ||
			response?.data?.source_file ||
			response?.sourceFilePath ||
			response?.source_file_path ||
			''
		);
	}

	function unwrapOverrideImportsPayload(response = {}) {
		return response?.data?.items || response?.data?.pagination
			? response.data
			: response?.data?.data?.items || response?.data?.data?.pagination
				? response.data.data
				: response?.items || response?.pagination
					? response
					: response?.data || response || {};
	}

	function normalizeOverrideImportsPagination(
		rawPagination = {},
		fallbackPage = 1,
		fallbackTotal = 0
	) {
		const page =
			Number(rawPagination?.page ?? rawPagination?.currentPage ?? fallbackPage ?? 1) || 1;
		const pageSize =
			Number(rawPagination?.pageSize ?? rawPagination?.page_size ?? rawPagination?.limit) ||
			OVERRIDE_IMPORTS_PAGE_SIZE;
		const totalItems =
			Number(
				rawPagination?.totalItems ??
					rawPagination?.total_items ??
					rawPagination?.total ??
					rawPagination?.count
			) || fallbackTotal;
		const totalPages =
			Number(rawPagination?.totalPages ?? rawPagination?.total_pages ?? rawPagination?.pages) ||
			Math.max(1, Math.ceil(totalItems / pageSize)) ||
			1;

		return {
			...rawPagination,
			page,
			pageSize,
			totalItems,
			totalPages,
			hasNext: rawPagination?.hasNext ?? rawPagination?.has_next ?? page < totalPages,
			hasPrevious: rawPagination?.hasPrevious ?? rawPagination?.has_previous ?? page > 1
		};
	}

	function getOverrideImportRows(payload = {}) {
		return pickArray(
			payload?.items,
			payload?.imports,
			payload?.files,
			payload?.data,
			Array.isArray(payload) ? payload : []
		);
	}

	async function loadOverrideImports({ page = 1 } = {}) {
		if (!$selectedVesselId || !startDateTime || !endDateTime) return;

		await loadCurrentUser();

		if (!canManageDataLogOverride) return;

		overrideImportsLoading = true;
		overrideImportsError = '';

		try {
			const query = new URLSearchParams({
				vesselId: String($selectedVesselId),
				start: toApiDateTime(startDateTime),
				end: toApiDateTime(endDateTime),
				timezoneMode,
				page: String(page),
				pageSize: String(OVERRIDE_IMPORTS_PAGE_SIZE)
			});

			if (timezoneMode === 'manual' && timezoneOffset) {
				query.set('timezoneOffset', timezoneOffset);
			}

			const response = await apiRequest(`/data-logs/overrides/imports?${query.toString()}`, {
				method: 'GET'
			});

			const payload = unwrapOverrideImportsPayload(response);
			const rows = getOverrideImportRows(payload);

			overrideImports = rows;
			overrideImportsPagination = normalizeOverrideImportsPagination(
				payload?.pagination,
				page,
				rows.length
			);
		} catch (err) {
			console.error('[DATA_LOG_OVERRIDE_IMPORTS_ERROR]', err);
			overrideImports = [];
			overrideImportsPagination = {
				page,
				pageSize: OVERRIDE_IMPORTS_PAGE_SIZE,
				totalItems: 0,
				totalPages: 1,
				hasNext: false,
				hasPrevious: false
			};
			overrideImportsError =
				err?.message || 'Failed to load imported override files for this date range.';
		} finally {
			overrideImportsLoading = false;
		}
	}

	function handleOverrideFileChange(event) {
		overrideFile = event?.currentTarget?.files?.[0] || null;
		overrideMessage = '';
		overrideError = '';
	}

	function fileToBase64(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();

			reader.onload = () => {
				const result = String(reader.result || '');
				const base64 = result.includes(',') ? result.split(',').pop() : result;
				resolve(base64);
			};

			reader.onerror = () => {
				reject(new Error('Failed to read the Excel file.'));
			};

			reader.readAsDataURL(file);
		});
	}

	async function handleDownloadOverrideTemplate() {
		await loadCurrentUser();

		if (!canManageDataLogOverride) {
			overrideError = 'You do not have the manage_data_log_override permission.';
			return;
		}

		overrideDownloadingTemplate = true;
		overrideMessage = '';
		overrideError = '';

		try {
			await downloadApiFile('/data-logs/overrides/template', 'data_log_override_template.xlsx');

			overrideMessage = 'Data log override template downloaded successfully.';
		} catch (err) {
			console.error('[DATA_LOG_OVERRIDE_TEMPLATE_ERROR]', err);
			overrideError = err?.message || 'Failed to download the data log override template.';
		} finally {
			overrideDownloadingTemplate = false;
		}
	}

	async function handleImportOverrideFile() {
		if (!$selectedVesselId) {
			overrideError = 'No vessel has been selected.';
			return;
		}

		await loadCurrentUser();

		if (!canManageDataLogOverride) {
			overrideError = 'You do not have the manage_data_log_override permission.';
			return;
		}

		if (!overrideFile) {
			overrideError = 'Select an override Excel file first.';
			return;
		}

		const allowedExtension = /\.xlsx$/i.test(overrideFile.name);

		if (!allowedExtension) {
			overrideError = 'The override file must be in .xlsx format.';
			return;
		}

		overrideImporting = true;
		overrideMessage = '';
		overrideError = '';

		try {
			const fileBase64 = await fileToBase64(overrideFile);

			const response = await apiRequest('/data-logs/overrides/import', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					vesselId: Number($selectedVesselId),
					fileName: overrideFile.name,
					fileBase64
				})
			});

			const importedSourceFilePath = getImportedSourceFilePath(response);

			if (importedSourceFilePath) {
				overrideSourceFilePath = importedSourceFilePath;
			}

			overrideMessage = getOverrideResponseMessage(
				response,
				'Data log override file imported successfully.'
			);

			overrideFile = null;

			await loadDataLog();
		} catch (err) {
			console.error('[DATA_LOG_OVERRIDE_IMPORT_ERROR]', err);
			overrideError =
				err?.message ||
				'Failed to import data log override. Make sure the permission and vessel access are correct.';
		} finally {
			overrideImporting = false;
		}
	}

	async function handleDeleteOverrideImport(sourceFilePath = overrideSourceFilePath) {
		if (!$selectedVesselId) {
			overrideError = 'No vessel has been selected.';
			return;
		}

		await loadCurrentUser();

		if (!canManageDataLogOverride) {
			overrideError = 'You do not have the manage_data_log_override permission.';
			return;
		}

		const normalizedSourceFilePath = String(sourceFilePath || '').trim();

		if (!normalizedSourceFilePath) {
			overrideError = 'Enter the source file path to delete.';
			return;
		}

		const confirmed = window.confirm(
			'Are you sure you want to delete all overrides from this imported file?'
		);

		if (!confirmed) return;

		overrideDeleting = true;
		overrideImportDeletingPath = normalizedSourceFilePath;
		overrideMessage = '';
		overrideError = '';

		try {
			const query = new URLSearchParams({
				vesselId: String($selectedVesselId),
				sourceFilePath: normalizedSourceFilePath
			});

			const response = await apiRequest(`/data-logs/overrides/imports?${query.toString()}`, {
				method: 'DELETE'
			});

			overrideMessage = getOverrideResponseMessage(
				response,
				'Imported override file deleted successfully.'
			);

			overrideSourceFilePath = '';

			await loadDataLog();
		} catch (err) {
			console.error('[DATA_LOG_OVERRIDE_DELETE_ERROR]', err);
			overrideError =
				err?.message ||
				'Failed to delete override import. Make sure sourceFilePath and vessel access are correct.';
		} finally {
			overrideDeleting = false;
			overrideImportDeletingPath = '';
		}
	}

	onMount(() => {
		const now = new Date();
		const start = new Date(now);
		start.setHours(0, 0, 0, 0);

		startDateTime = toLocalInputValue(start);
		endDateTime = toLocalInputValue(now);
		loadCurrentUser();
	});
</script>

<section class="data-log-page">
	<DataLogHeader
		{vesselName}
		bind:startDateTime
		bind:endDateTime
		bind:timezoneMode
		bind:timezoneOffset
		{activeTimePreset}
		timePresets={TIME_PRESETS}
		autoTimezoneLabel={getAutoTimezoneLabel()}
		{loading}
		{loadingMore}
		{exporting}
		rangeLocked={shouldShowDateRangeOverlay}
		onStartInput={clearActiveTimePreset}
		onEndInput={clearActiveTimePreset}
		onTimezoneChange={() => markDataLogFiltersDirty()}
		onLoad={() => loadDataLog()}
		onExport={handleExportExcel}
		onPreset={applyTimePreset}
	/>

	<div class="date-range-result-area" class:is-locked={shouldShowDateRangeOverlay}>
		{#if canManageDataLogOverride}
			<DataLogOverrideCard
				disabled={shouldShowDateRangeOverlay}
				downloadingTemplate={overrideDownloadingTemplate}
				importing={overrideImporting}
				deleting={overrideDeleting}
				deletingPath={overrideImportDeletingPath}
				file={overrideFile}
				message={overrideMessage}
				error={overrideError}
				imports={overrideImports}
				importsLoading={overrideImportsLoading}
				importsError={overrideImportsError}
				pagination={overrideImportsPagination}
				onDownloadTemplate={handleDownloadOverrideTemplate}
				onRefresh={() => loadOverrideImports({ page: overrideImportsPagination.page || 1 })}
				onFileChange={handleOverrideFileChange}
				onImport={handleImportOverrideFile}
				onClearFile={() => (overrideFile = null)}
				onDelete={handleDeleteOverrideImport}
				onPage={(page) => loadOverrideImports({ page })}
			/>
		{/if}

		{#if canViewDataLogAvailableColumns}
			<DataLogColumnsCard
				columns={visibleColumns}
				{selectedColumns}
				loading={availableColumnsLoading}
				error={availableColumnsError}
				{getColumnLabel}
				onToggle={toggleColumn}
				onSelectAll={selectAllColumns}
				onSelectBasic={selectBasicColumns}
			/>
		{/if}

		{#if error}
			<div class="status-box error-box">{error}</div>
		{/if}

		{#if currentUserLoading}
			<LoadingSkeleton label="Loading data log permissions" variant="card" rows={2} compact />
		{/if}

		{#if currentUserError}
			<div class="status-box error-box">{currentUserError}</div>
		{/if}

		{#if canViewDataLogDataDeviations}
			<DataLogDeviationCard
				skipped={dataDeviationSkipped}
				loading={dataDeviationLoading}
				error={dataDeviationError}
				deviation={dataDeviation}
				categories={dataDeviationCategories}
				rows={dataDeviationRows}
				totalCount={dataDeviationTotalCount}
				totalDuration={dataDeviationTotalDuration}
				rpmLimits={normalizedDeviationData?.rpm_limits}
			/>
		{/if}

		<DataLogTableSection
			{loading}
			{loadingMore}
			rows={dataRows}
			columns={displaySelectedColumns}
			pagination={dataLogPagination}
			page={dataLogPage}
			hasNext={hasNextDataLogPage}
			showLegend={canViewHighRpmLowSpeedTable}
			{rowHighlightContextError}
			{rowHighlights}
			{getColumnLabel}
			{formatCellValue}
			{getRowColumnValue}
			onScroll={handleDataLogTableScroll}
			onLoadMore={loadMoreDataLog}
		/>

		{#if shouldShowDateRangeOverlay}
			<div class="date-range-overlay">
				<div class="date-range-overlay-card">
					<div class="date-range-overlay-icon">!</div>
					<span class="section-kicker">Waiting for date range</span>
					<h2>Choose a date range first</h2>
					<p>
						Set the Start and End time in the filter above, then click <strong>Load Data</strong>
						to display the telemetry log.
					</p>
				</div>
			</div>
		{/if}
	</div>
</section>
