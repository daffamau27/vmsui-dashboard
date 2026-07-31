<script>
	import { onMount } from 'svelte';
	import { selectedVesselId, selectedVesselInfo } from '$lib/stores/selectedVessel.svelte.js';
	import {
		getAvailableDataLogColumns,
		getDataLogData,
		getDataLogExcelUrl
	} from '$lib/api/dataLogApi.js';

	import { setPageStatus } from '$lib/stores/pageStatusStore.svelte.js';
	import { downloadApiFile, apiRequest } from '$lib/api/authApi.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import { TIMEZONE_MODE_OPTIONS, TIMEZONE_OFFSET_OPTIONS } from '$lib/utils/timezoneOptions.js';

	let loading = $state(false);
	let loadingMore = $state(false);
	let exporting = $state(false);
	let error = $state('');
	let logData = $state(null);
	let loadedRows = $state([]);
	let dataLogPagination = $state(null);
	let dataLogPage = $state(1);
	let dataLogRequestId = 0;
	const DATA_LOG_PAGE_SIZE = 100;

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

	let permissionReady = $derived(Boolean(currentUser) || Boolean(currentUserError));

	let canViewFuelEcu = $derived(hasPermission('view_fuel_ecu'));
	let canViewFuelFms = $derived(hasPermission('view_fuel_fms'));
	let canViewFuelFod = $derived(hasPermission('view_fuel_fod'));
	let canViewFuelEmsInternal = $derived(hasPermission('view_fuel_ems_internal'));
	let canViewFuelEmsExternal = $derived(hasPermission('view_fuel_ems_external'));
	let canViewFuelEngineMaker = $derived(hasPermission('view_fuel_engine_maker'));
	let canManageDataLogOverride = $derived(hasPermission('manage_data_log_override'));
	let canViewDataLogAvailableColumns = $derived(hasPermission('view_data_log_available_columns'));

	let overrideDownloadingTemplate = $state(false);
	let overrideImporting = $state(false);
	let overrideDeleting = $state(false);

	let overrideFile = $state(null);
	let overrideFileInput = $state(null);
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

		const preferred = selectedColumns.filter((key) => keys.has(key));
		const extras = [...keys].filter((key) => !preferred.includes(key));

		return [...preferred, ...extras];
	}

	let selectedColumns = $state([
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
	]);

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
		responseColumns.length
			? responseColumns
			: apiAvailableColumns.length
				? apiAvailableColumns
				: filterDisplayColumns(selectedColumns)
	);

	let displaySelectedColumns = $derived(
		filterDisplayColumns(selectedColumns).filter((column) => visibleColumns.includes(column)).length
			? filterDisplayColumns(selectedColumns).filter((column) => visibleColumns.includes(column))
			: responseColumns.length
				? responseColumns
				: visibleColumns
	);

	function parseRowTimestamp(row) {
		const value = row?.timestamp_utc || row?.timestamp || row?.ts || row?.time || row?.datetime;

		if (!value) return 0;

		// If this is a Unix timestamp
		if (/^\d+$/.test(String(value))) {
			return Number(value);
		}

		// Clean formats such as: 2026-05-24 00:00:00 (UTC+7)
		const cleaned = String(value)
			.replace(/\s*\(UTC[+-]?\d{1,2}(?::?\d{2})?\)\s*/i, '')
			.replace(' ', 'T');

		const time = new Date(cleaned).getTime();

		return Number.isFinite(time) ? time : 0;
	}

	function sortRowsNewestFirst(rows = []) {
		return [...rows].sort((a, b) => parseRowTimestamp(b) - parseRowTimestamp(a));
	}

	function normalizeDataLogPagination(rawPagination = {}, fallbackPage = 1, fallbackTotalRows = 0) {
		const page = Number(rawPagination?.page ?? rawPagination?.currentPage ?? fallbackPage ?? 1) || 1;
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

	function endOfLocalDay(date) {
		return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 0, 0);
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

	function clearColumns() {
		selectedColumns = ['timestamp', 'course', 'latitude', 'longitude', 'speed', 'rig'].filter(
			(key) => visibleColumns.includes(key)
		);
	}

	let vesselName = $derived(
		$selectedVesselInfo?.name || $selectedVesselInfo?.vesselName || 'Selected Vessel'
	);

	let normalizedData = $derived(logData?.data || logData || {});

	let dataRows = $derived(loadedRows);

	let hasNextDataLogPage = $derived(
		Boolean(dataLogPagination?.hasPrevious) ||
			Number(dataLogPagination?.page || dataLogPage) > 1
	);

	let hasRawData = $derived(Boolean(logData));
	let shouldShowDateRangeOverlay = $derived(
		!hasLoadedDateRange || !startDateTime || !endDateTime
	);

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
			if (columns.length) {
				selectedColumns = columns;
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

	async function fetchDataLogPage(page = 1) {
		return getDataLogData(getDataLogRequestParams(page));
	}

	async function loadDataLog({ page = null, append = false } = {}) {
		if (!$selectedVesselId) {
			error = 'No vessel has been selected from Fleet View.';
			logData = null;
			loadedRows = [];
			dataLogPagination = null;
			hasLoadedDateRange = false;
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
			logData = null;
			dataLogPagination = null;
			dataLogPage = 1;
		}

		error = '';

		try {
			let targetPage = Number(page || 1);
			let result;
			let payload;
			let rows;
			let pagination;

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
					pagination = normalizeDataLogPagination(payload?.pagination, newestPage, firstPagination.totalItems);
				} else {
					result = firstResult;
					payload = firstPayload;
					rows = firstRows;
					pagination = firstPagination;
				}
			}

			const nextRows = sortRowsNewestFirst(append ? [...loadedRows, ...rows] : rows);
			const stats = payload?.stats || {};

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
			if (payloadColumns.length && !append) {
				selectedColumns = payloadColumns;
			} else if (Array.isArray(payload.available_columns) && payload.available_columns.length) {
				selectedColumns = filterDisplayColumns(payload.available_columns);
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
			}
		} finally {
			loading = false;
			loadingMore = false;
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

		const requestedColumns = filterDisplayColumns(selectedColumns);

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

	function getOverrideResponseMessage(response, fallback = 'Override operation completed successfully.') {
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

	function normalizeOverrideImportsPagination(rawPagination = {}, fallbackPage = 1, fallbackTotal = 0) {
		const page = Number(rawPagination?.page ?? rawPagination?.currentPage ?? fallbackPage ?? 1) || 1;
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

	function getOverrideImportFilename(item = {}) {
		const sourceFilePath = item?.source_file_path || item?.sourceFilePath || '';

		return (
			item?.filename ||
			item?.fileName ||
			(sourceFilePath ? sourceFilePath.split(/[\\/]/).pop() : '') ||
			'Imported override file'
		);
	}

	function getOverrideImportSourcePath(item = {}) {
		return item?.source_file_path || item?.sourceFilePath || '';
	}

	function getOverrideImportDateRange(item = {}) {
		const start = item?.start || item?.min_ts || item?.recorded_from || '';
		const end = item?.end || item?.max_ts || item?.recorded_until || '';

		if (start && end) return `${start} — ${end}`;
		if (start) return `From ${start}`;
		if (end) return `Until ${end}`;

		return '-';
	}

	function getOverrideImportDateIso(item = {}) {
		if (Array.isArray(item?.date_iso) && item.date_iso.length) {
			return item.date_iso.join(', ');
		}

		return item?.date_iso || '-';
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

	function resetOverrideFileInput() {
		overrideFile = null;

		if (overrideFileInput) {
			overrideFileInput.value = '';
		}
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
			await downloadApiFile(
				'/data-logs/overrides/template',
				'data_log_override_template.xlsx'
			);

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

			resetOverrideFileInput();

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
	<section class="data-log-header-card">
		<div>
			<div class="page-kicker">Data Log</div>
			<h1>{vesselName}</h1>
			<p>
				Granular 1-minute telemetry log with position, speed, runtime, RPM, load, and fuel data.
			</p>
		</div>
	</section>

	<section class="filter-card">
		<label>
			<span>Start</span>
			<input
				type="datetime-local"
				bind:value={startDateTime}
				oninput={clearActiveTimePreset}
			/>
		</label>

		<label>
			<span>End</span>
			<input type="datetime-local" bind:value={endDateTime} oninput={clearActiveTimePreset} />
		</label>

		<label>
			<span class="field-label-row">
				Timezone Mode
				{#if timezoneMode === 'auto'}
					<small class="timezone-auto-pill">Auto • {getAutoTimezoneLabel()}</small>
				{/if}
			</span>
			<select bind:value={timezoneMode} onchange={() => markDataLogFiltersDirty()}>
				{#each TIMEZONE_MODE_OPTIONS as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</label>

		{#if timezoneMode === 'manual'}
			<label>
				<span>Timezone Offset</span>
				<select bind:value={timezoneOffset} onchange={() => markDataLogFiltersDirty()}>
					{#each TIMEZONE_OFFSET_OPTIONS as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>
		{/if}

		<div class="filter-actions">
			<button
				type="button"
				class="primary-btn"
				onclick={() => loadDataLog()}
				disabled={loading || loadingMore || !startDateTime || !endDateTime}
			>
				{loading ? 'Loading...' : 'Load Data'}
			</button>

			<button
				type="button"
				class="export-btn"
				onclick={handleExportExcel}
				disabled={exporting || loading || shouldShowDateRangeOverlay}
			>
				{exporting ? 'Exporting...' : 'Export Excel'}
			</button>
		</div>

		<div class="time-preset-row" aria-label="Data log time presets">
			<span>Preset</span>
			<div class="time-preset-list">
				{#each TIME_PRESETS as preset}
					<button
						type="button"
						class:active={activeTimePreset === preset.id}
						onclick={() => applyTimePreset(preset.id)}
					>
						{preset.label}
					</button>
				{/each}
			</div>
		</div>
	</section>

	<div class="date-range-result-area" class:is-locked={shouldShowDateRangeOverlay}>
	{#if canManageDataLogOverride}
		<section class="override-card">
			<div class="override-header">
				<div>
					<span class="section-kicker">Override</span>
					<h2>Data Log Override</h2>
				</div>

				<div class="override-actions">
					<button
						type="button"
						class="ghost-btn"
						onclick={handleDownloadOverrideTemplate}
						disabled={overrideDownloadingTemplate}
					>
						{overrideDownloadingTemplate ? 'Downloading...' : 'Download Template'}
					</button>
					<button
						type="button"
						class="ghost-btn"
						onclick={() => loadOverrideImports({ page: overrideImportsPagination.page || 1 })}
						disabled={overrideImportsLoading || shouldShowDateRangeOverlay}
					>
						{overrideImportsLoading ? 'Refreshing...' : 'Refresh Imports'}
					</button>
				</div>
			</div>

			<div class="override-grid">
				<label class="override-field">
					<span>Import Excel Override</span>
					<input
						bind:this={overrideFileInput}
						type="file"
						accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
						onchange={handleOverrideFileChange}
					/>
					<small>
						The file must use the system template and .xlsx format.
					</small>
				</label>

				<div class="override-actions">
					<button
						type="button"
						class="primary-btn"
						onclick={handleImportOverrideFile}
						disabled={overrideImporting || !overrideFile}
					>
						{overrideImporting ? 'Importing...' : 'Import Override'}
					</button>

					{#if overrideFile}
						<button type="button" class="ghost-btn" onclick={resetOverrideFileInput}>
							Clear File
						</button>
					{/if}
				</div>
			</div>

			<div class="override-imports-panel">
				<div class="override-imports-header">
					<div>
						<h3>Imported Override Files</h3>
						<p>Files are filtered by the selected data-log date range.</p>
					</div>
					<strong>{overrideImportsPagination.totalItems || overrideImports.length} files</strong>
				</div>

				{#if overrideImportsLoading && !overrideImports.length}
					<div class="override-imports-loading">Loading imported override files...</div>
				{:else if overrideImportsError}
					<div class="status-box error-box">{overrideImportsError}</div>
				{:else if overrideImports.length}
					<div class="override-import-list">
						{#each overrideImports as item}
							{@const sourcePath = getOverrideImportSourcePath(item)}
							<div class="override-import-item">
								<div class="override-import-main">
									<strong>{getOverrideImportFilename(item)}</strong>
									<small>{sourcePath || '-'}</small>
								</div>

								<div class="override-import-meta">
									<div>
										<span>Overrides</span>
										<strong>{item?.override_count ?? item?.overrideCount ?? '-'}</strong>
									</div>
									<div>
										<span>Range</span>
										<strong>{getOverrideImportDateRange(item)}</strong>
									</div>
									<div>
										<span>Date ISO</span>
										<strong>{getOverrideImportDateIso(item)}</strong>
									</div>
								</div>

								<button
									type="button"
									class="danger-btn"
									onclick={() => handleDeleteOverrideImport(sourcePath)}
									disabled={overrideDeleting || !sourcePath}
								>
									{overrideImportDeletingPath === sourcePath ? 'Deleting...' : 'Delete'}
								</button>
							</div>
						{/each}
					</div>

					<div class="override-imports-pagination">
						<button
							type="button"
							class="ghost-btn"
							onclick={() =>
								loadOverrideImports({ page: Math.max(1, (overrideImportsPagination.page || 1) - 1) })}
							disabled={!overrideImportsPagination.hasPrevious || overrideImportsLoading}
						>
							Previous
						</button>
						<span>
							Page {overrideImportsPagination.page || 1} of {overrideImportsPagination.totalPages || 1}
						</span>
						<button
							type="button"
							class="ghost-btn"
							onclick={() =>
								loadOverrideImports({ page: (overrideImportsPagination.page || 1) + 1 })}
							disabled={!overrideImportsPagination.hasNext || overrideImportsLoading}
						>
							Next
						</button>
					</div>
				{:else}
					<div class="empty-box">
						No imported override files found for this selected date range.
					</div>
				{/if}
			</div>

			{#if overrideMessage}
				<div class="status-box success-box">{overrideMessage}</div>
			{/if}

			{#if overrideError}
				<div class="status-box error-box">{overrideError}</div>
			{/if}
		</section>
	{/if}

	<section class="column-card">
		<div class="column-header">
			<div>
				<span class="section-kicker">Columns</span>
				<h2>Visible Data Columns</h2>
			</div>

			<div class="column-actions">
				{#if availableColumnsLoading}
					<span class="column-loading">Loading columns...</span>
				{/if}
				<button type="button" onclick={selectAllColumns}>Select All</button>
				<button type="button" onclick={clearColumns}>Basic</button>
			</div>
		</div>

		{#if availableColumnsError}
			<div class="column-warning">{availableColumnsError}</div>
		{/if}

		<div class="column-grid">
			{#each visibleColumns as column}
				<label class="column-item" class:is-checked={selectedColumns.includes(column)}>
					<input
						type="checkbox"
						checked={selectedColumns.includes(column)}
						onchange={() => toggleColumn(column)}
					/>
					<span>{getColumnLabel(column, visibleColumns)}</span>
				</label>
			{/each}
		</div>
	</section>

	{#if error}
		<div class="status-box error-box">{error}</div>
	{/if}

	{#if currentUserLoading}
		<LoadingSkeleton label="Loading data log permissions" variant="card" rows={2} compact />
	{/if}

	{#if currentUserError}
		<div class="status-box error-box">{currentUserError}</div>
	{/if}

	{#if loading && !dataRows.length}
		<LoadingSkeleton
			label="Loading telemetry log"
			variant="data-log"
			rows={10}
			columns={displaySelectedColumns.length || 10}
		/>
	{:else}
		<section class="table-section">
			<div class="section-header">
				<div>
					<span class="section-kicker">Telemetry</span>
					<h2>1-Minute Data Log</h2>
				</div>

				<strong>
					{dataRows.length}
					{#if dataLogPagination?.totalItems}
						/ {dataLogPagination.totalItems}
					{/if}
					rows
				</strong>
			</div>

			{#if dataRows.length}
				<div class="data-log-table-wrapper" onscroll={handleDataLogTableScroll}>
					<table class="data-log-table">
						<thead>
							<tr>
								{#each displaySelectedColumns as column}
									<th class:sticky-col={column === 'timestamp'}>
										{getColumnLabel(column, displaySelectedColumns)}
									</th>
								{/each}
							</tr>
						</thead>

						<tbody>
							{#each dataRows as row}
								<tr>
									{#each displaySelectedColumns as column}
										<td class:sticky-col={column === 'timestamp'}>
											{formatCellValue(getRowColumnValue(row, column), column)}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<div class="lazy-load-footer">
					<div>
						Page {dataLogPagination?.page || dataLogPage}
						{#if dataLogPagination?.totalPages}
							of {dataLogPagination.totalPages}
						{/if}
						{#if loadingMore}
							<span>• Loading older rows...</span>
						{:else if hasNextDataLogPage}
							<span>• Scroll down to load older rows</span>
						{:else}
							<span>• All loaded</span>
						{/if}
					</div>

					{#if hasNextDataLogPage}
						<button
							type="button"
							class="load-more-btn"
							onclick={loadMoreDataLog}
							disabled={loadingMore || loading}
						>
							{loadingMore ? 'Loading...' : 'Load more'}
						</button>
					{/if}
				</div>
			{:else}
				<div class="empty-box">Data log is not available for the selected time range.</div>
			{/if}
		</section>
	{/if}

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

<style>
	.data-log-page {
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

	.data-log-header-card,
	.filter-card,
	.column-card,
	.table-section,
	.raw-box {
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
	}

	.data-log-header-card {
		padding: 14px 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.override-card {
		display: grid;
		gap: 16px;
		margin-top: 16px;
		padding: 18px;
		border: 1px solid rgba(15, 23, 42, 0.1);
		border-radius: 18px;
		background: var(--color-surface);
		box-shadow: 0 14px 30px rgba(15, 23, 42, 0.06);
	}

	.override-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}

	.override-header h2 {
		margin: 2px 0 4px;
		font-size: 18px;
		font-weight: 800;
		color: var(--text-primary);
	}

	.override-header p {
		max-width: 720px;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-secondary);
	}

	.override-grid,
	.override-delete-row {
		display: grid;
		grid-template-columns: minmax(260px, 1fr) auto;
		align-items: end;
		gap: 14px;
	}

	.override-field {
		display: grid;
		gap: 7px;
	}

	.override-field span {
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 0.04em;
		color: var(--text-secondary);
		text-transform: uppercase;
	}

	.override-field input[type='text'],
	.override-field input[type='file'] {
		width: 100%;
		min-height: 42px;
		border: 1px solid rgba(15, 23, 42, 0.14);
		border-radius: 12px;
		background: var(--color-elevated);
		color: var(--text-primary);
		font-size: 13px;
	}

	.override-field input[type='text'] {
		padding: 0 12px;
	}

	.override-field input[type='file'] {
		padding: 9px 12px;
	}

	.override-field small {
		font-size: 12px;
		color: var(--text-secondary);
	}

	.field-label-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.timezone-auto-pill {
		display: inline-flex;
		align-items: center;
		min-height: 18px;
		padding: 2px 7px;
		border: 1px solid rgba(96, 165, 250, 0.28);
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.1);
		color: #bfdbfe;
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0;
		text-transform: none;
		white-space: nowrap;
	}

	.override-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.override-imports-panel {
		display: grid;
		gap: 12px;
		padding: 14px;
		border: 1px solid rgba(148, 163, 184, 0.18);
		border-radius: 16px;
		background: rgba(15, 23, 42, 0.26);
	}

	.override-imports-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 14px;
	}

	.override-imports-header h3 {
		margin: 0;
		font-size: 15px;
		font-weight: 800;
		color: var(--text-primary);
	}

	.override-imports-header p {
		margin: 4px 0 0;
		font-size: 12px;
		color: var(--text-secondary);
	}

	.override-imports-header > strong {
		flex: 0 0 auto;
		padding: 7px 11px;
		border: 1px solid rgba(96, 165, 250, 0.34);
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.12);
		color: #bfdbfe;
		font-size: 12px;
	}

	.override-imports-loading {
		padding: 16px;
		border-radius: 14px;
		background: rgba(15, 23, 42, 0.26);
		color: var(--text-secondary);
		font-size: 13px;
	}

	.override-import-list {
		display: grid;
		gap: 10px;
	}

	.override-import-item {
		display: grid;
		grid-template-columns: minmax(220px, 1.1fr) minmax(320px, 1.7fr) auto;
		align-items: center;
		gap: 12px;
		padding: 12px;
		border: 1px solid rgba(148, 163, 184, 0.16);
		border-radius: 14px;
		background: rgba(15, 23, 42, 0.34);
	}

	.override-import-main {
		display: grid;
		gap: 5px;
		min-width: 0;
	}

	.override-import-main strong {
		color: var(--text-primary);
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.override-import-main small {
		color: var(--text-secondary);
		font-size: 11px;
		line-height: 1.35;
		overflow-wrap: anywhere;
	}

	.override-import-meta {
		display: grid;
		grid-template-columns: 0.55fr 1.15fr 0.8fr;
		gap: 8px;
	}

	.override-import-meta div {
		display: grid;
		gap: 4px;
		padding: 9px 10px;
		border-radius: 12px;
		background: rgba(30, 41, 59, 0.6);
	}

	.override-import-meta span {
		color: var(--text-muted);
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.override-import-meta strong {
		color: var(--text-primary);
		font-size: 12px;
		line-height: 1.35;
	}

	.override-imports-pagination {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
	}

	.override-imports-pagination span {
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
	}

	.ghost-btn,
	.danger-btn {
		min-height: 42px;
		border: 0;
		border-radius: 12px;
		padding: 0 14px;
		font-size: 13px;
		font-weight: 800;
		cursor: pointer;
	}

	.ghost-btn {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-primary);
	}

	.danger-btn {
		background: #ef4444;
		color: #ffffff;
	}

	.ghost-btn:disabled,
	.danger-btn:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.success-box {
		border: 1px solid rgba(22, 163, 74, 0.2);
		background: var(--color-success-muted);
		color: #166534;
	}

	@media (max-width: 760px) {
		.override-header,
		.override-actions {
			align-items: stretch;
			flex-direction: column;
		}

		.override-grid,
		.override-delete-row {
			grid-template-columns: 1fr;
		}

		.override-imports-header,
		.override-imports-pagination {
			align-items: stretch;
			flex-direction: column;
		}

		.override-import-item {
			grid-template-columns: 1fr;
		}

		.override-import-meta {
			grid-template-columns: 1fr;
		}
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

	.data-log-header-card h1 {
		margin: 8px 0 0;
		font-size: 21px;
		line-height: 1.2;
		font-weight: 900;
		color: var(--text-primary);
	}

	.data-log-header-card p {
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
		font-size: 18px;
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
		min-width: 160px;
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

	.time-preset-row {
		flex: 1 1 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: -2px;
		min-width: 0;
	}

	.time-preset-row > span {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.time-preset-list {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		min-width: 0;
	}

	.time-preset-list button {
		height: 26px;
		border: 1px solid rgba(148, 163, 184, 0.34);
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.48);
		padding: 0 10px;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 850;
		cursor: pointer;
		transition:
			background 0.16s ease,
			border-color 0.16s ease,
			color 0.16s ease,
			transform 0.16s ease;
	}

	.time-preset-list button:hover,
	.time-preset-list button.active {
		border-color: rgba(96, 165, 250, 0.78);
		background: rgba(37, 99, 235, 0.26);
		color: #bfdbfe;
	}

	.time-preset-list button:active {
		transform: translateY(1px);
	}

	.date-range-result-area {
		position: relative;
		min-height: 430px;
		margin-top: 12px;
	}

	.date-range-result-area.is-locked > :not(.date-range-overlay) {
		pointer-events: none;
		user-select: none;
		filter: blur(1px);
		opacity: 0.34;
	}

	.date-range-overlay {
		position: absolute;
		inset: 0;
		z-index: 8;
		display: grid;
		place-items: start center;
		padding: 42px 16px 16px;
		border-radius: 16px;
		background:
			linear-gradient(180deg, rgba(10, 14, 26, 0.62), rgba(10, 14, 26, 0.82)),
			rgba(10, 14, 26, 0.46);
		backdrop-filter: blur(7px);
	}

	.date-range-overlay-card {
		width: min(520px, 100%);
		padding: 22px 22px 20px;
		border: 1px solid rgba(96, 165, 250, 0.24);
		border-radius: 20px;
		background:
			linear-gradient(145deg, rgba(30, 41, 59, 0.94), rgba(15, 23, 42, 0.96)),
			var(--color-surface);
		box-shadow: 0 24px 70px rgba(0, 0, 0, 0.38);
		text-align: center;
	}

	.date-range-overlay-icon {
		width: 42px;
		height: 42px;
		margin: 0 auto 12px;
		display: grid;
		place-items: center;
		border: 1px solid rgba(96, 165, 250, 0.36);
		border-radius: 14px;
		background: rgba(37, 99, 235, 0.18);
		color: #bfdbfe;
		font-size: 22px;
		font-weight: 900;
	}

	.date-range-overlay-card h2 {
		margin: 8px 0 8px;
		color: var(--text-primary);
		font-size: 20px;
		line-height: 1.2;
		font-weight: 900;
	}

	.date-range-overlay-card p {
		margin: 0;
		color: #a9b8d0;
		font-size: 13px;
		font-weight: 700;
		line-height: 1.6;
	}

	.date-range-overlay-card strong {
		color: #dbeafe;
		font-weight: 900;
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

	.column-card {
		margin-top: 12px;
		overflow: hidden;
	}

	.column-header {
		min-height: 52px;
		padding: 11px 13px;
		border-bottom: 1px solid #e5edf5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--color-surface);
	}

	.column-header h2,
	.section-header h2 {
		margin: 6px 0 0;
		color: var(--text-primary);
		font-size: 16px;
		font-weight: 900;
	}

	.column-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.column-loading {
		color: var(--text-muted);
		font-size: 10px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.column-actions button {
		height: 28px;
		padding: 0 10px;
		border: 1px solid #cbd5e1;
		background: var(--color-surface);
		color: var(--text-primary);
		font-size: 11px;
		font-weight: 900;
		cursor: pointer;
	}

	.column-warning {
		margin: 10px 12px 0;
		padding: 9px 10px;
		border: 1px solid rgba(251, 191, 36, 0.28);
		border-radius: 12px;
		background: rgba(251, 191, 36, 0.08);
		color: #facc15;
		font-size: 11px;
		font-weight: 800;
	}

	.column-grid {
		padding: 12px;
		display: grid;
		grid-template-columns: repeat(4, minmax(160px, 1fr));
		gap: 8px;
	}

	.column-item {
		min-height: 30px;
		padding: 6px 8px;
		border: 1px solid rgba(148, 163, 184, 0.18);
		border-radius: 10px;
		background: rgba(15, 23, 42, 0.26);
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 11px;
		font-weight: 800;
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background 0.16s ease,
			border-color 0.16s ease,
			box-shadow 0.16s ease,
			color 0.16s ease;
	}

	.column-item:hover {
		border-color: rgba(147, 197, 253, 0.36);
		background: rgba(30, 41, 59, 0.58);
		color: #dbeafe;
	}

	.column-item.is-checked {
		border-color: rgba(96, 165, 250, 0.74);
		background:
			linear-gradient(135deg, rgba(37, 99, 235, 0.24), rgba(14, 165, 233, 0.12)),
			rgba(15, 23, 42, 0.38);
		box-shadow:
			inset 0 0 0 1px rgba(147, 197, 253, 0.12),
			0 0 0 1px rgba(37, 99, 235, 0.16);
		color: #f8fafc;
	}

	.column-item input[type='checkbox'] {
		position: relative;
		width: 18px;
		min-width: 18px;
		height: 18px;
		min-height: 18px;
		margin: 0;
		padding: 0;
		display: inline-grid;
		place-items: center;
		flex: 0 0 auto;
		border: 2px solid rgba(148, 163, 184, 0.62);
		border-radius: 6px;
		background: rgba(15, 23, 42, 0.72);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.06),
			0 0 0 1px rgba(15, 23, 42, 0.2);
		appearance: none;
		-webkit-appearance: none;
		cursor: pointer;
		transition:
			background 0.16s ease,
			border-color 0.16s ease,
			box-shadow 0.16s ease,
			transform 0.16s ease;
	}

	.column-item input[type='checkbox']::after {
		content: '';
		width: 8px;
		height: 4px;
		border-left: 2px solid #ffffff;
		border-bottom: 2px solid #ffffff;
		opacity: 0;
		transform: rotate(-45deg) scale(0.72);
		transition:
			opacity 0.14s ease,
			transform 0.14s ease;
	}

	.column-item input[type='checkbox']:checked {
		border-color: rgba(147, 197, 253, 0.98);
		background: linear-gradient(135deg, #2563eb, #06b6d4);
		box-shadow:
			0 0 0 4px rgba(37, 99, 235, 0.18),
			inset 0 1px 0 rgba(255, 255, 255, 0.24);
	}

	.column-item input[type='checkbox']:checked::after {
		opacity: 1;
		transform: rotate(-45deg) scale(1);
	}

	.column-item input[type='checkbox']:focus-visible {
		outline: 2px solid rgba(147, 197, 253, 0.9);
		outline-offset: 3px;
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

	.section-header > strong {
		padding: 5px 10px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 11px;
		font-weight: 900;
	}

	.data-log-table-wrapper {
		width: 100%;
		max-height: calc(100vh - 430px);
		min-height: 260px;
		overflow: auto;
		background: var(--color-surface);
	}

	.data-log-table {
		width: max-content;
		min-width: 100%;
		border-collapse: separate;
		border-spacing: 0;
		font-size: 11px;
	}

	.data-log-table thead th {
		position: sticky;
		top: 0;
		z-index: 5;
		background: #3478e5;
		color: #ffffff;
		border-right: 1px solid rgba(255, 255, 255, 0.32);
		border-bottom: 1px solid rgba(255, 255, 255, 0.32);
		text-align: center;
		vertical-align: middle;
		padding: 8px 9px;
		font-size: 10.5px;
		line-height: 1.15;
		font-weight: 900;
		white-space: nowrap;
	}

	.data-log-table tbody td {
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

	.data-log-table tbody tr:nth-child(even) td {
		background: var(--color-elevated);
	}

	.data-log-table tbody tr:hover td {
		background: var(--color-elevated);
	}

	.data-log-table .sticky-col {
		position: sticky;
		left: 0;
		z-index: 7;
		min-width: 150px;
		text-align: left;
	}

	.data-log-table thead .sticky-col {
		z-index: 9;
		background: #3478e5 !important;
	}

	.data-log-table tbody .sticky-col {
		background: inherit;
		box-shadow: 1px 0 0 #d7dee8;
	}

	.empty-box {
		padding: 18px 14px;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 800;
	}

	.lazy-load-footer {
		min-height: 42px;
		padding: 8px 12px;
		border-top: 1px solid rgba(148, 163, 184, 0.18);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: rgba(15, 23, 42, 0.38);
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 800;
	}

	.lazy-load-footer span {
		color: var(--text-muted);
	}

	.load-more-btn {
		height: 28px;
		padding: 0 12px;
		border: 1px solid rgba(96, 165, 250, 0.55);
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.2);
		color: #bfdbfe;
		font-size: 11px;
		font-weight: 900;
		cursor: pointer;
	}

	.load-more-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
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

	@media (max-width: 1100px) {
		.column-grid {
			grid-template-columns: repeat(2, minmax(160px, 1fr));
		}
	}

	@media (max-width: 760px) {
		.data-log-page {
			padding: 10px;
		}

		.data-log-header-card {
			flex-direction: column;
			align-items: flex-start;
		}

		.filter-card input,
		.filter-card select {
			min-width: 100%;
		}

		.filter-actions {
			width: 100%;
		}

		.time-preset-row {
			align-items: flex-start;
			flex-direction: column;
			width: 100%;
		}

		.time-preset-list {
			width: 100%;
		}

		.primary-btn,
		.export-btn {
			width: 100%;
		}

		.column-grid {
			grid-template-columns: 1fr;
		}

		.data-log-table-wrapper {
			max-height: calc(100vh - 500px);
		}
	}
</style>
