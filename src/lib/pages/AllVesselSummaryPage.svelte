<script>
	import { onMount } from 'svelte';
	import { apiRequest } from '$lib/api/authApi.js';

	const TIME_RANGE_PRESETS = [
		{ id: 'midnight', label: '00:00 - 06:00', startTime: '00:00', endTime: '06:00' },
		{ id: 'day', label: '06:00 - 18:00', startTime: '06:00', endTime: '18:00' },
		{ id: 'night', label: '18:00 - 24:00', startTime: '18:00', endTime: '23:59' }
	];

	const TIMEZONE_OPTIONS = [
		{ label: 'UTC+7', value: '+07:00' },
		{ label: 'UTC+8', value: '+08:00' },
		{ label: 'UTC+9', value: '+09:00' },
		{ label: 'UTC+0', value: '+00:00' }
	];

	let devices = $state([]);
	let devicesLoading = $state(false);
	let devicesError = $state('');

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

			console.log('[ALL_VESSEL][CURRENT_USER_PERMISSION]', currentUser);

			return currentUser;
		} catch (err) {
			console.error('[ALL_VESSEL][CURRENT_USER_PERMISSION_ERROR]', err);
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

	let canAccessAllVesselSummary = $derived(hasPermission('access_all_vessel_summary'));

	let canViewEngineRuntimeTable = $derived(hasPermission('view_engine_runtime_table'));

	let canViewFuelConsumptionTable = $derived(hasPermission('view_fuel_consumption_table'));

	let canViewSpeedStatsTable = $derived(hasPermission('view_speed_stats_table'));

	let canViewTravelDistanceTable = $derived(hasPermission('view_travel_distance_table'));

	let canViewHighRpmLowSpeedTable = $derived(hasPermission('view_high_rpm_low_speed_table'));

	let canViewFuelEcu = $derived(hasPermission('view_fuel_ecu'));
	let canViewFuelFms = $derived(hasPermission('view_fuel_fms'));
	let canViewFuelEmsInternal = $derived(hasPermission('view_fuel_ems_internal'));
	let canViewFuelEmsExternal = $derived(hasPermission('view_fuel_ems_external'));
	let canViewFuelEngineMaker = $derived(hasPermission('view_fuel_engine_maker'));

	let canViewAnyFuel = $derived(
		canViewFuelConsumptionTable &&
			(canViewFuelEcu ||
				canViewFuelFms ||
				canViewFuelEmsInternal ||
				canViewFuelEmsExternal ||
				canViewFuelEngineMaker)
	);

	const staticReportColumns = [
		{ id: 'data_received', label: 'DATA RECEIVED', type: 'percent', group: 'Additional' },
		{ id: 'total_fuel', label: 'TOTAL FUEL', type: 'total', group: 'Additional' },
		{ id: 'avg_speed', label: 'AVG SPEED', type: 'additional', group: 'Additional' },
		{ id: 'max_speed', label: 'MAX SPEED', type: 'additional', group: 'Additional' },
		{ id: 'distance', label: 'DISTANCE', type: 'additional', group: 'Additional' },
		{ id: 'utc', label: 'UTC', type: 'utc', group: 'Additional' }
	];

	const defaultColumnIds = [
		'data_received',
		'total_fuel',
		'avg_speed',
		'max_speed',
		'distance',
		'utc'
	];

	let vesselReportRows = $state([]);

	let selectedDeviceIds = $state([]);
	let vesselSearch = $state('');

	let defaultStartDate = $state(getTodayDateTime('00:00'));
	let defaultEndDate = $state(getTodayDateTime(getCurrentTime()));
	let vesselRanges = $state({});
	let defaultTimezoneOffset = $state('+07:00');
	let defaultTimezoneMode = $state('manual');
	let vesselTimezones = $state({});

	let activeDefaultPresetId = $state('custom');
	let showColumnSelector = $state(false);
	let visibleColumnIds = $state([...defaultColumnIds]);

	let hasLoadedReport = $state(false);
	let loading = $state(false);
	let loadingStatus = $state('Preparing');
	let completed = $state(0);
	let reportError = $state('');

	function makeEngineColumnId(metric, engineKey) {
		return `engine__${metric}__${engineKey}`;
	}

	function parseEngineColumnId(columnId) {
		const parts = String(columnId || '').split('__');

		if (parts.length !== 3 || parts[0] !== 'engine') {
			return null;
		}

		return {
			metric: parts[1],
			engineKey: parts[2]
		};
	}

	function buildDynamicEngineColumns(rows) {
		const engineMap = new Map();

		rows.forEach((row) => {
			const engines = Array.isArray(row?.engines) ? row.engines : [];

			engines.forEach((engine) => {
				if (!engine?.key) return;

				if (!engineMap.has(engine.key)) {
					engineMap.set(engine.key, {
						key: engine.key,
						name: engine.name || engine.key
					});
				}
			});
		});

		const engines = Array.from(engineMap.values());

		const runtimeColumns = engines.map((engine) => ({
			id: makeEngineColumnId('runtime', engine.key),
			label: `${engine.name} RH`,
			type: 'runtime',
			group: 'Runtime / RH',
			engineKey: engine.key
		}));

		const fuelEmsColumns = engines.map((engine) => ({
			id: makeEngineColumnId('fuel_ems', engine.key),
			label: `${engine.name} FC (EMS)`,
			type: 'fuel',
			group: 'Fuel / FC',
			engineKey: engine.key
		}));

		const fuelEcuColumns = engines.map((engine) => ({
			id: makeEngineColumnId('fuel_ecu', engine.key),
			label: `${engine.name} FC (ECU)`,
			type: 'fuel',
			group: 'Fuel / FC',
			engineKey: engine.key
		}));

		const sritiColumns = engines.map((engine) => ({
			id: makeEngineColumnId('sriti', engine.key),
			label: `SRITI ${engine.name}`,
			type: 'additional',
			group: 'Additional',
			engineKey: engine.key
		}));

		return [...runtimeColumns, ...fuelEmsColumns, ...fuelEcuColumns, ...sritiColumns];
	}

	function getEngineByKey(row, engineKey) {
		const engines = Array.isArray(row?.engines) ? row.engines : [];

		return engines.find((engine) => String(engine?.key) === String(engineKey));
	}

	function canViewReportColumn(columnId) {
		const engineColumn = parseEngineColumnId(columnId);

		if (engineColumn) {
			if (engineColumn.metric === 'runtime') {
				return canViewEngineRuntimeTable;
			}

			if (engineColumn.metric === 'fuel_ems') {
				return canViewFuelConsumptionTable && (canViewFuelEmsInternal || canViewFuelEmsExternal);
			}

			if (engineColumn.metric === 'fuel_ecu') {
				return (
					canViewFuelConsumptionTable &&
					(canViewFuelEcu || canViewFuelFms || canViewFuelEngineMaker)
				);
			}

			if (engineColumn.metric === 'sriti') {
				return canViewHighRpmLowSpeedTable;
			}
		}

		if (columnId === 'data_received') return canAccessAllVesselSummary;

		if (columnId === 'total_fuel') {
			return canViewAnyFuel;
		}

		if (['avg_speed', 'max_speed'].includes(columnId)) {
			return canViewSpeedStatsTable;
		}

		if (columnId === 'distance') {
			return canViewTravelDistanceTable;
		}

		if (columnId === 'utc') {
			return true;
		}

		return true;
	}

	let selectedDevicesCount = $derived(selectedDeviceIds.length);

	let selectAllDevices = $derived(
		devices.length > 0 && selectedDeviceIds.length === devices.length
	);

	let selectedColumnCount = $derived(visibleColumnIds.length);

	let filteredDevices = $derived(
		devices.filter((device) => device.name.toLowerCase().includes(vesselSearch.toLowerCase()))
	);

	let selectedDevices = $derived(devices.filter((device) => selectedDeviceIds.includes(device.id)));

	let dynamicEngineColumns = $derived(buildDynamicEngineColumns(vesselReportRows));

	let reportColumns = $derived([...dynamicEngineColumns, ...staticReportColumns]);

	let permittedReportColumns = $derived(reportColumns.filter((col) => canViewReportColumn(col.id)));

	let visibleDataColumns = $derived(
		permittedReportColumns.filter((col) => visibleColumnIds.includes(col.id))
	);

	let runtimeColumns = $derived(
		permittedReportColumns.filter((col) => col.group === 'Runtime / RH')
	);

	let fuelColumns = $derived(permittedReportColumns.filter((col) => col.group === 'Fuel / FC'));

	let controlColumns = $derived(permittedReportColumns.filter((col) => col.group === 'Additional'));

	let selectedRangeSummary = $derived(
		`${defaultStartDate.replace('T', ' ')} → ${defaultEndDate.replace('T', ' ')}`
	);

	let selectedDeviceRangesValid = $derived(Boolean(defaultStartDate && defaultEndDate));

	let activeDefaultPresetLabel = $derived(
		TIME_RANGE_PRESETS.find((item) => item.id === activeDefaultPresetId)?.label || 'Custom'
	);

	let progress = $derived(
		selectedDevicesCount > 0 ? Math.min(100, (completed / selectedDevicesCount) * 100) : 0
	);

	let totalFuelSummary = $derived(
		vesselReportRows.reduce(
			(sum, row) => sum + numberValue(getCellValue(row, { id: 'total_fuel' })),
			0
		)
	);

	let avgSpeedSummary = $derived(() => {
		const speeds = vesselReportRows
			.map((row) => numberValue(getCellValue(row, { id: 'avg_speed' })))
			.filter((value) => value > 0);

		if (!speeds.length) return 0;

		return speeds.reduce((sum, value) => sum + value, 0) / speeds.length;
	});

	function getTodayDateTime(time) {
		const today = new Date();
		const year = today.getFullYear();
		const month = String(today.getMonth() + 1).padStart(2, '0');
		const day = String(today.getDate()).padStart(2, '0');

		return `${year}-${month}-${day}T${time}`;
	}

	function getCurrentTime() {
		const now = new Date();
		const hour = String(now.getHours()).padStart(2, '0');
		const minute = String(now.getMinutes()).padStart(2, '0');

		return `${hour}:${minute}`;
	}

	function numberValue(value) {
		const numeric = Number(value);
		return Number.isFinite(numeric) ? numeric : 0;
	}

	function formatNumber(value, digits = 2) {
		const numeric = Number(value);

		if (!Number.isFinite(numeric)) return '-';

		return numeric.toLocaleString('en-US', {
			minimumFractionDigits: 0,
			maximumFractionDigits: digits
		});
	}

	function formatDateTimeForApi(value) {
		if (!value) return '';

		const [datePart, timePart = '00:00'] = value.split('T');
		const [year, month, day] = datePart.split('-');

		return `${day}/${month}/${year} ${timePart}`;
	}

	function formatRangeLabel(row) {
		return `${row?.range?.start || '-'} → ${row?.range?.end || '-'}`;
	}

	function getVesselRange(deviceId) {
		return (
			vesselRanges[deviceId] || {
				start: defaultStartDate,
				end: defaultEndDate
			}
		);
	}

	function setVesselRange(deviceId, field, value) {
		const currentRange = getVesselRange(deviceId);

		vesselRanges = {
			...vesselRanges,
			[deviceId]: {
				...currentRange,
				[field]: value
			}
		};
	}

	function getVesselTimezone(deviceId) {
		return (
			vesselTimezones[deviceId] || {
				mode: defaultTimezoneMode,
				offset: defaultTimezoneOffset
			}
		);
	}

	function setVesselTimezone(deviceId, field, value) {
		const currentTimezone = getVesselTimezone(deviceId);

		vesselTimezones = {
			...vesselTimezones,
			[deviceId]: {
				...currentTimezone,
				[field]: value
			}
		};
	}

	function applyDefaultTimezoneToSelectedVessels() {
		const nextTimezones = { ...vesselTimezones };

		selectedDevices.forEach((device) => {
			nextTimezones[device.id] = {
				mode: defaultTimezoneMode,
				offset: defaultTimezoneOffset
			};
		});

		vesselTimezones = nextTimezones;
	}

	function ensureVesselTimezone(deviceId) {
		if (vesselTimezones[deviceId]) return;

		vesselTimezones = {
			...vesselTimezones,
			[deviceId]: {
				mode: defaultTimezoneMode,
				offset: defaultTimezoneOffset
			}
		};
	}

	function applyDefaultRangeToSelectedVessels() {
		const nextRanges = { ...vesselRanges };

		selectedDevices.forEach((device) => {
			nextRanges[device.id] = {
				start: defaultStartDate,
				end: defaultEndDate
			};
		});

		vesselRanges = nextRanges;
	}

	function ensureVesselRange(deviceId) {
		if (vesselRanges[deviceId]) return;

		vesselRanges = {
			...vesselRanges,
			[deviceId]: {
				start: defaultStartDate,
				end: defaultEndDate
			}
		};
	}

	function getTotalFuel(row) {
		const grand = row?.totals?.grand || {};
		let total = 0;

		if (canViewFuelEcu) {
			total += numberValue(grand.ecu);
		}

		if (canViewFuelFms) {
			total += numberValue(grand.fms);
		}

		if (canViewFuelEmsInternal) {
			total += numberValue(grand.ems_internal);
		}

		if (canViewFuelEmsExternal) {
			total += numberValue(grand.ems_external);
		}

		if (canViewFuelEngineMaker) {
			total += numberValue(grand.engine_maker);
		}

		return total;
	}

	function getCellValue(row, col) {
		const engineColumn = parseEngineColumnId(col.id);

		if (engineColumn) {
			const engine = getEngineByKey(row, engineColumn.engineKey);

			if (!engine) return '-';

			if (engineColumn.metric === 'runtime') {
				return engine.runtime_formatted || '0h 0m';
			}

			if (engineColumn.metric === 'fuel_ems') {
				const fuel = engine.fuel || {};

				const value =
					(canViewFuelEmsInternal ? numberValue(fuel.ems_internal) : 0) +
					(canViewFuelEmsExternal ? numberValue(fuel.ems_external) : 0);

				return formatNumber(value);
			}

			if (engineColumn.metric === 'fuel_ecu') {
				const fuel = engine.fuel || {};

				const value =
					(canViewFuelEcu ? numberValue(fuel.ecu) : 0) +
					(canViewFuelFms ? numberValue(fuel.fms) : 0) +
					(canViewFuelEngineMaker ? numberValue(fuel.engine_maker) : 0);

				return formatNumber(value);
			}

			if (engineColumn.metric === 'sriti') {
				return engine.sriti_formatted || formatNumber(engine.sriti_duration || 0);
			}
		}

		switch (col.id) {
			case 'data_received':
				return `${formatNumber(row?.data_received?.percentage || 0, 1)}%`;

			case 'total_fuel':
				return formatNumber(getTotalFuel(row));

			case 'avg_speed':
				return formatNumber(row?.speed?.avg_running_speed || 0);

			case 'max_speed':
				return formatNumber(row?.speed?.top_speed || 0);

			case 'distance':
				return formatNumber(row?.distance || 0);

			case 'utc':
				return row?.range?.timezone || '-';

			default:
				return '-';
		}
	}

	function isTotalColumn(col) {
		return col.type === 'total' || col.id.includes('total');
	}

	function toggleAllDevices(checked) {
		if (checked) {
			selectedDeviceIds = devices.map((device) => device.id);

			const nextRanges = { ...vesselRanges };
			const nextTimezones = { ...vesselTimezones };

			devices.forEach((device) => {
				if (!nextRanges[device.id]) {
					nextRanges[device.id] = {
						start: defaultStartDate,
						end: defaultEndDate
					};
				}

				if (!nextTimezones[device.id]) {
					nextTimezones[device.id] = {
						mode: defaultTimezoneMode,
						offset: defaultTimezoneOffset
					};
				}
			});

			vesselRanges = nextRanges;
			vesselTimezones = nextTimezones;
		} else {
			selectedDeviceIds = [];
		}
	}

	function toggleSingleDevice(deviceId, checked) {
		if (checked) {
			selectedDeviceIds = [...new Set([...selectedDeviceIds, deviceId])];
			ensureVesselRange(deviceId);
			ensureVesselTimezone(deviceId);
		} else {
			selectedDeviceIds = selectedDeviceIds.filter((id) => id !== deviceId);
		}
	}

	function applyDefaultRangePreset(preset) {
		const datePart = defaultStartDate.split('T')[0] || new Date().toISOString().slice(0, 10);

		defaultStartDate = `${datePart}T${preset.startTime}`;
		defaultEndDate = `${datePart}T${preset.endTime}`;
		activeDefaultPresetId = preset.id;
	}

	function setAllColumnsVisibility(value) {
		visibleColumnIds = value ? permittedReportColumns.map((col) => col.id) : [];
	}

	function resetVisibleColumns() {
		visibleColumnIds = defaultColumnIds.filter((id) =>
			permittedReportColumns.some((col) => col.id === id)
		);
	}

	function setColumnVisibility(columnId, checked) {
		if (checked) {
			visibleColumnIds = [...new Set([...visibleColumnIds, columnId])];
		} else {
			visibleColumnIds = visibleColumnIds.filter((id) => id !== columnId);
		}
	}

	function getGroupVisibleCount(columns) {
		return columns.filter((col) => visibleColumnIds.includes(col.id)).length;
	}

	async function loadDeviceList() {
		devicesLoading = true;
		devicesError = '';

		try {
			console.log('[ALL_VESSEL][LOAD_VESSELS][START]');

			const response = await apiRequest('/all-vessel-summary/vessels', {
				method: 'GET'
			});

			const rows = response?.data || [];

			console.log('[ALL_VESSEL][LOAD_VESSELS][RESULT]', rows);

			devices = Array.isArray(rows)
				? rows.map((item) => ({
						id: String(item.id),
						vesselId: item.id,
						deviceId: item.deviceId || '',
						name: item.vesselName || '-',
						vesselName: item.vesselName || '-',
						engines: item.engines || [],
						raw: item
					}))
				: [];

			if (!selectedDeviceIds.length && devices.length) {
				const firstDeviceId = devices[0].id;

				selectedDeviceIds = [firstDeviceId];

				vesselRanges = {
					...vesselRanges,
					[firstDeviceId]: {
						start: defaultStartDate,
						end: defaultEndDate
					}
				};

				vesselTimezones = {
					...vesselTimezones,
					[firstDeviceId]: {
						mode: defaultTimezoneMode,
						offset: defaultTimezoneOffset
					}
				};
			}
		} catch (err) {
			console.error('[ALL_VESSEL][LOAD_VESSELS][ERROR]', err);
			devicesError = err?.message || 'Failed to load the vessel list from the API.';
			devices = [];
		} finally {
			devicesLoading = false;
		}
	}

	function isValidDateTimeRange(start, end) {
		if (!start || !end) return false;

		const startTime = new Date(start).getTime();
		const endTime = new Date(end).getTime();

		if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return false;

		return startTime <= endTime;
	}

	async function loadReport() {
		if (!canAccessAllVesselSummary) {
			reportError = 'You do not have the access_all_vessel_summary permission.';
			return;
		}

		if (!selectedDeviceRangesValid) {
			reportError = 'Default start date dan end date wajib diisi.';
			return;
		}

		if (!selectedDevices.length) {
			reportError = 'Select at least one vessel.';
			return;
		}

		const invalidRange = selectedDevices.find((device) => {
			const range = getVesselRange(device.id);
			return !range.start || !range.end;
		});

		if (invalidRange) {
			reportError = `The range for ${invalidRange.name} is incomplete.`;
			return;
		}

		const invalidDateOrder = selectedDevices.find((device) => {
			const range = getVesselRange(device.id);
			return !isValidDateTimeRange(range.start, range.end);
		});

		if (invalidDateOrder) {
			reportError = `The range for ${invalidDateOrder.name} is invalid. Start must not be later than End.`;
			return;
		}

		loading = true;
		hasLoadedReport = false;
		completed = 0;
		reportError = '';
		loadingStatus = 'Preparing request';

		try {
			const groupedRequests = new Map();

			selectedDevices.forEach((device) => {
				const range = getVesselRange(device.id);
				const timezone = getVesselTimezone(device.id);

				const timezoneMode = timezone.mode === 'auto' ? 'auto' : 'manual';
				const timezoneOffset = timezone.offset || '+07:00';
				const groupKey = timezoneMode === 'auto' ? 'auto' : `manual__${timezoneOffset}`;

				if (!groupedRequests.has(groupKey)) {
					groupedRequests.set(groupKey, {
						timezoneMode,
						timezoneOffset,
						ranges: []
					});
				}

				groupedRequests.get(groupKey).ranges.push({
					vesselId: Number(device.vesselId),
					start: formatDateTimeForApi(range.start),
					end: formatDateTimeForApi(range.end)
				});
			});

			const requestGroups = Array.from(groupedRequests.values());

			loadingStatus = `Loading ${selectedDevices.length} vessel summary`;

			const responses = [];

			for (const requestGroup of requestGroups) {
				const requestBody = {
					timezoneMode: requestGroup.timezoneMode,
					ranges: requestGroup.ranges
				};

				if (requestGroup.timezoneMode === 'manual') {
					requestBody.timezoneOffset = requestGroup.timezoneOffset;
				}

				const response = await apiRequest('/all-vessel-summary/data', {
					method: 'POST',
					body: JSON.stringify(requestBody)
				});

				responses.push(response);

				completed += requestGroup.ranges.length;
			}

			const mergedRows = responses.flatMap((response) => {
				const payload = response?.data || {};
				return Array.isArray(payload.rows) ? payload.rows : [];
			});

			vesselReportRows = mergedRows.map((row) => ({
				...row,
				id: String(row.vessel_id)
			}));

			const dynamicDefaultColumnIds = buildDynamicEngineColumns(vesselReportRows)
				.filter((col) => ['runtime', 'fuel'].includes(col.type) || col.id.includes('sriti'))
				.map((col) => col.id);

			visibleColumnIds = [...new Set([...dynamicDefaultColumnIds, ...defaultColumnIds])];
			
			hasLoadedReport = true;
			loadingStatus = 'Completed';
		} catch (err) {
			console.error('[ALL_VESSEL][LOAD_REPORT][ERROR]', err);
			reportError = err?.message || 'Failed to load the all vessel summary.';
			vesselReportRows = [];
			hasLoadedReport = true;
		} finally {
			loading = false;
		}
	}

	onMount(async () => {
		const user = await loadCurrentUser();

		if (hasPermissionForUser(user, 'access_all_vessel_summary')) {
			await loadDeviceList();
		}
	});
</script>

<section class="avs-page">
	{#if currentUserLoading}
		<div class="status-box">Loading user permissions...</div>
	{:else if currentUserError}
		<div class="status-box error-box">{currentUserError}</div>
	{:else if currentUser && !canAccessAllVesselSummary}
		<div class="status-box error-box">
			You do not have permission to access All Vessel Summary.
		</div>
	{/if}

	{#if canAccessAllVesselSummary}
		<section class="avs-header-card">
			<div>
				<div class="page-kicker">All Vessel Summary</div>
				<h1>All Vessel Summary</h1>
				<p>
					Aggregated summary for selected vessels using custom time range, runtime, fuel
					consumption, speed, distance, and data received metrics.
				</p>
			</div>

			<div class="header-actions">
				<button
					type="button"
					class="secondary-btn"
					onclick={loadDeviceList}
					disabled={devicesLoading || loading || !canAccessAllVesselSummary}
				>
					{devicesLoading ? 'Loading...' : 'Reload Vessels'}
				</button>

				<button
					type="button"
					class="primary-btn"
					onclick={loadReport}
					disabled={loading || !selectedDevicesCount || !canAccessAllVesselSummary}
				>
					{loading ? 'Loading Summary...' : 'Load Summary'}
				</button>
			</div>
		</section>
	{/if}

	{#if devicesError}
		<div class="status-box error-box">{devicesError}</div>
	{/if}

	{#if reportError}
		<div class="status-box error-box">{reportError}</div>
	{/if}

	<section class="summary-grid">
		<article class="summary-card">
			<span>Selected Vessels</span>
			<strong>{selectedDevicesCount}</strong>
		</article>

		<article class="summary-card">
			<span>Loaded Rows</span>
			<strong>{vesselReportRows.length}</strong>
		</article>

		<article class="summary-card">
			<span>Total Fuel</span>
			<strong>{formatNumber(totalFuelSummary)} L</strong>
		</article>

		<article class="summary-card">
			<span>Avg Running Speed</span>
			<strong>{formatNumber(avgSpeedSummary(), 2)} kt</strong>
		</article>
	</section>

	<section class="layout-grid">
		<aside class="vessel-panel">
			<div class="section-header">
				<div>
					<span class="section-kicker">Vessels</span>
					<h2>Select Vessel</h2>
				</div>

				<strong>{selectedDevicesCount}/{devices.length}</strong>
			</div>

			<div class="vessel-tools">
				<input type="search" placeholder="Search vessel..." bind:value={vesselSearch} />

				<label class="check-row">
					<input
						type="checkbox"
						checked={selectAllDevices}
						onchange={(event) => toggleAllDevices(event.currentTarget.checked)}
					/>
					<span>Select all vessels</span>
				</label>
			</div>

			<div class="vessel-list">
				{#if devicesLoading}
					<div class="empty-box">Loading vessels...</div>
				{:else if filteredDevices.length}
					{#each filteredDevices as device}
						<label class="vessel-check-card">
							<input
								type="checkbox"
								checked={selectedDeviceIds.includes(device.id)}
								onchange={(event) => toggleSingleDevice(device.id, event.currentTarget.checked)}
							/>

							<span class="vessel-info">
								<strong>{device.name}</strong>
							</span>
						</label>
					{/each}
				{:else}
					<div class="empty-box">No vessels available.</div>
				{/if}
			</div>
		</aside>

		<section class="control-panel">
			<section class="table-section summary-request-section">
				<div class="section-header summary-request-header">
					<div>
						<span class="section-kicker">Range & UTC</span>
						<h2>Summary Request</h2>
					</div>

					<strong>{activeDefaultPresetLabel}</strong>
				</div>

				<div class="summary-request-body">
					<div class="request-config-card">
						<div class="request-config-head">
							<div class="request-title-block">
								<div class="request-icon">↔</div>

								<div>
									<h3>Default Request</h3>
									<p>Set the main range and UTC, then apply them to the selected vessels.</p>
								</div>
							</div>

							<span class="request-badge">
								{defaultTimezoneMode === 'auto' ? 'Auto UTC' : defaultTimezoneOffset}
							</span>
						</div>

						<div class="request-config-grid">
							<label class="request-field">
								<span>Start</span>
								<input
									type="datetime-local"
									bind:value={defaultStartDate}
									onchange={() => (activeDefaultPresetId = 'custom')}
								/>
							</label>

							<label class="request-field">
								<span>End</span>
								<input
									type="datetime-local"
									bind:value={defaultEndDate}
									onchange={() => (activeDefaultPresetId = 'custom')}
								/>
							</label>

							<label class="request-field">
								<span>Default UTC Mode</span>
								<select bind:value={defaultTimezoneMode}>
									<option value="manual">Manual</option>
									<option value="auto">Auto</option>
								</select>
							</label>

							<label class="request-field">
								<span>Default UTC</span>
								<select bind:value={defaultTimezoneOffset} disabled={defaultTimezoneMode === 'auto'}>
									{#each TIMEZONE_OPTIONS as option}
										<option value={option.value}>{option.label}</option>
									{/each}
								</select>
							</label>
						</div>

						<div class="request-presets">
							<span>Quick range</span>

							<div class="request-preset-buttons">
								{#each TIME_RANGE_PRESETS as preset}
									<button
										type="button"
										class:active-preset={activeDefaultPresetId === preset.id}
										onclick={() => applyDefaultRangePreset(preset)}
									>
										{preset.label}
									</button>
								{/each}
							</div>
						</div>

						<div class="request-actions">
							<button
								type="button"
								class="secondary-btn"
								onclick={applyDefaultRangeToSelectedVessels}
								disabled={!selectedDevicesCount}
							>
								Apply Range
							</button>

							<button
								type="button"
								class="secondary-btn"
								onclick={applyDefaultTimezoneToSelectedVessels}
								disabled={!selectedDevicesCount}
							>
								Apply UTC
							</button>
						</div>
					</div>

					<div class="request-summary-strip">
						<div class="request-summary-item">
							<span>Default Range</span>
							<strong>{selectedRangeSummary}</strong>
						</div>

						<div class="request-summary-item">
							<span>Default UTC</span>
							<strong>{defaultTimezoneMode === 'auto' ? 'Auto UTC' : defaultTimezoneOffset}</strong>
						</div>

						<div class="request-summary-item">
							<span>Selected Vessel</span>
							<strong>{selectedDevicesCount}</strong>
						</div>

						<div class="request-summary-item">
							<span>Preset</span>
							<strong>{activeDefaultPresetLabel}</strong>
						</div>
					</div>

					<div class="vessel-request-panel">
						<div class="vessel-request-head">
							<div>
								<h3>Request per Vessel</h3>
								<p>Each vessel can use a different range and UTC setting.</p>
							</div>

							<strong>{selectedDevicesCount} selected</strong>
						</div>

						{#if selectedDevices.length}
							<div class="vessel-request-list">
								{#each selectedDevices as device}
									<article class="vessel-request-card">
										<div class="vessel-request-title">
											<div class="vessel-avatar">
												{device.name?.slice(0, 1).toUpperCase() || 'V'}
											</div>

											<div class="vessel-request-name">
												<strong>{device.name}</strong>
												<small>{device.deviceId || 'No device id'}</small>
											</div>

											<span class="vessel-utc-pill">
												{getVesselTimezone(device.id).mode === 'auto'
													? 'Auto UTC'
													: getVesselTimezone(device.id).offset}
											</span>
										</div>

										<div class="vessel-request-fields">
											<label class="request-field">
												<span>Start</span>
												<input
													type="datetime-local"
													value={getVesselRange(device.id).start}
													onchange={(event) =>
														setVesselRange(device.id, 'start', event.currentTarget.value)}
												/>
											</label>

											<label class="request-field">
												<span>End</span>
												<input
													type="datetime-local"
													value={getVesselRange(device.id).end}
													onchange={(event) =>
														setVesselRange(device.id, 'end', event.currentTarget.value)}
												/>
											</label>

											<label class="request-field">
												<span>UTC Mode</span>
												<select
													value={getVesselTimezone(device.id).mode}
													onchange={(event) =>
														setVesselTimezone(device.id, 'mode', event.currentTarget.value)}
												>
													<option value="manual">Manual</option>
													<option value="auto">Auto</option>
												</select>
											</label>

											<label class="request-field">
												<span>UTC</span>
												<select
													value={getVesselTimezone(device.id).offset}
													onchange={(event) =>
														setVesselTimezone(device.id, 'offset', event.currentTarget.value)}
													disabled={getVesselTimezone(device.id).mode === 'auto'}
												>
													{#each TIMEZONE_OPTIONS as option}
														<option value={option.value}>{option.label}</option>
													{/each}
												</select>
											</label>
										</div>
									</article>
								{/each}
							</div>
						{:else}
							<div class="empty-box">Select a vessel first.</div>
						{/if}
					</div>
				</div>
			</section>

			<section class="table-section">
				<div class="section-header">
					<div>
						<span class="section-kicker">Columns</span>
						<h2>Visible Columns</h2>
					</div>

					<button
						type="button"
						class="secondary-btn"
						onclick={() => (showColumnSelector = !showColumnSelector)}
					>
						{selectedColumnCount} Selected
					</button>
				</div>

				{#if showColumnSelector}
					<div class="column-selector">
						<div class="column-toolbar">
							<button
								type="button"
								class="secondary-btn"
								onclick={() => setAllColumnsVisibility(true)}
							>
								Select All
							</button>

							<button
								type="button"
								class="secondary-btn"
								onclick={() => setAllColumnsVisibility(false)}
							>
								Clear
							</button>

							<button type="button" class="secondary-btn" onclick={resetVisibleColumns}>
								Default
							</button>
						</div>

						<div class="column-groups">
							<div class="column-group">
								<h3>Runtime / RH <span>{getGroupVisibleCount(runtimeColumns)}</span></h3>

								{#each runtimeColumns as col}
									<label class="check-row">
										<input
											type="checkbox"
											checked={visibleColumnIds.includes(col.id)}
											onchange={(event) => setColumnVisibility(col.id, event.currentTarget.checked)}
										/>
										<span>{col.label}</span>
									</label>
								{/each}
							</div>

							<div class="column-group">
								<h3>Fuel / FC <span>{getGroupVisibleCount(fuelColumns)}</span></h3>

								{#each fuelColumns as col}
									<label class="check-row">
										<input
											type="checkbox"
											checked={visibleColumnIds.includes(col.id)}
											onchange={(event) => setColumnVisibility(col.id, event.currentTarget.checked)}
										/>
										<span>{col.label}</span>
									</label>
								{/each}
							</div>

							<div class="column-group">
								<h3>Additional <span>{getGroupVisibleCount(controlColumns)}</span></h3>

								{#each controlColumns as col}
									<label class="check-row">
										<input
											type="checkbox"
											checked={visibleColumnIds.includes(col.id)}
											onchange={(event) => setColumnVisibility(col.id, event.currentTarget.checked)}
										/>
										<span>{col.label}</span>
									</label>
								{/each}
							</div>
						</div>
					</div>
				{/if}
			</section>
		</section>
	</section>

	{#if loading}
		<section class="table-section">
			<div class="loading-row">
				<div>
					<strong>{loadingStatus}</strong>
					<span>{completed}/{selectedDevicesCount} vessels completed</span>
				</div>

				<div class="progress-track">
					<div class="progress-fill" style={`width: ${progress}%;`}></div>
				</div>
			</div>
		</section>
	{/if}

	<section class="table-section">
		<div class="section-header">
			<div>
				<span class="section-kicker">Result</span>
				<h2>Summary Table</h2>
			</div>

			<strong>{vesselReportRows.length} rows</strong>
		</div>

		{#if !hasLoadedReport && !loading}
			<div class="empty-box">Click Load Summary to retrieve data.</div>
		{:else if loading}
			<div class="empty-box">Summary is loading...</div>
		{:else if vesselReportRows.length}
			<div class="table-wrapper">
				<table>
					<thead>
						<tr>
							<th>No</th>
							<th>Vessel</th>
							<th>Range</th>

							{#each visibleDataColumns as col}
								<th class:total-column={isTotalColumn(col)}>
									{col.label}
								</th>
							{/each}
						</tr>
					</thead>

					<tbody>
						{#each vesselReportRows as row, index}
							<tr>
								<td>{index + 1}</td>
								<td>
									<div class="vessel-name-cell">
										<strong>{row.vessel_name}</strong>
										<span>{row.device_id}</span>
									</div>
								</td>
								<td>{formatRangeLabel(row)}</td>

								{#each visibleDataColumns as col}
									<td class:total-cell={isTotalColumn(col)}>
										{getCellValue(row, col)}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="empty-box">No summary data is available for the selected range.</div>
		{/if}
	</section>
</section>

<style>
	.avs-page {
		min-height: 100vh;
		padding: 16px;
		background: #f3f6fa;
		color: #0f172a;
		display: grid;
		gap: 14px;
		box-sizing: border-box;
	}

	.avs-header-card,
	.table-section,
	.summary-card,
	.vessel-panel,
	.status-box {
		background: #ffffff;
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
	}

	.avs-header-card {
		padding: 18px 22px;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 18px;
	}

	.page-kicker,
	.section-kicker {
		display: inline-flex;
		padding: 4px 10px;
		border-radius: 999px;
		background: #dbeafe;
		color: #1d4ed8;
		font-size: 11px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.avs-header-card h1 {
		margin: 10px 0 4px;
		font-size: 24px;
		font-weight: 900;
	}

	.avs-header-card p {
		margin: 0;
		color: #64748b;
		font-size: 13px;
		font-weight: 700;
	}

	.header-actions {
		display: flex;
		gap: 10px;
		align-items: center;
	}

	.primary-btn,
	.secondary-btn {
		height: 40px;
		padding: 0 16px;
		border: none;
		font-size: 13px;
		font-weight: 900;
		cursor: pointer;
	}

	.primary-btn {
		background: #2563eb;
		color: #ffffff;
	}

	.secondary-btn {
		background: #f8fafc;
		color: #0f172a;
		border: 1px solid #cbd5e1;
	}

	.primary-btn:disabled,
	.secondary-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.status-box {
		padding: 12px 16px;
		font-size: 13px;
		font-weight: 900;
	}

	.error-box {
		background: #fef2f2;
		color: #b91c1c;
		border-color: #fecaca;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
	}

	.summary-card {
		min-height: 88px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.summary-card span {
		color: #64748b;
		font-size: 11px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.summary-card strong {
		margin-top: 8px;
		font-size: 22px;
		font-weight: 900;
	}

	.layout-grid {
		display: grid;
		grid-template-columns: 320px minmax(0, 1fr);
		gap: 14px;
	}

	.vessel-panel {
		min-height: 420px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.section-header {
		min-height: 58px;
		padding: 12px 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid #e2e8f0;
	}

	.section-header h2 {
		margin: 6px 0 0;
		font-size: 18px;
		font-weight: 900;
	}

	.section-header strong {
		padding: 5px 10px;
		border-radius: 999px;
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 11px;
		font-weight: 900;
	}

	.vessel-tools {
		padding: 12px;
		display: grid;
		gap: 10px;
		background: #f8fafc;
		border-bottom: 1px solid #e2e8f0;
	}

	.vessel-tools input,
	.filter-grid input,
	.filter-grid select {
		height: 40px;
		padding: 0 10px;
		border: 1px solid #cbd5e1;
		background: #ffffff;
		color: #0f172a;
		font-size: 13px;
		font-weight: 800;
		box-sizing: border-box;
	}

	.vessel-list {
		flex: 1;
		overflow: auto;
		padding: 10px;
		display: grid;
		align-content: start;
		gap: 8px;
	}

	.vessel-check-card {
		padding: 10px;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
		border: 1px solid #e2e8f0;
		background: #ffffff;
		cursor: pointer;
	}

	.vessel-info {
		display: grid;
		gap: 3px;
		min-width: 0;
	}

	.vessel-info strong {
		font-size: 12px;
		font-weight: 900;
	}

	.vessel-info small {
		color: #64748b;
		font-size: 11px;
		font-weight: 800;
	}

	.status-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: #cbd5e1;
	}

	.online-dot {
		background: #22c55e;
	}

	.control-panel {
		display: grid;
		gap: 14px;
		align-content: start;
		min-width: 0;
	}

	.summary-request-section {
		overflow: visible;
	}

	.summary-request-section {
		overflow: hidden;
	}

	.summary-request-header {
		background:
			linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(14, 165, 233, 0.04)),
			#ffffff;
	}

	.summary-request-body {
		padding: 14px;
		display: grid;
		gap: 12px;
		background: #f8fafc;
	}

	.request-config-card {
		padding: 14px;
		background: #ffffff;
		border: 1px solid #d9e2ec;
		box-shadow: 0 1px 4px rgba(15, 23, 42, 0.04);
		display: grid;
		gap: 14px;
	}

	.request-config-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	.request-title-block {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		min-width: 0;
	}

	.request-icon {
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		border-radius: 10px;
		background: #dbeafe;
		color: #1d4ed8;
		font-size: 18px;
		font-weight: 900;
		flex: 0 0 auto;
	}

	.request-title-block h3,
	.vessel-request-head h3 {
		margin: 0;
		color: #0f172a;
		font-size: 15px;
		font-weight: 900;
	}

	.request-title-block p,
	.vessel-request-head p {
		margin: 4px 0 0;
		color: #64748b;
		font-size: 12px;
		font-weight: 700;
	}

	.request-badge,
	.vessel-request-head strong,
	.vessel-utc-pill {
		padding: 6px 10px;
		border-radius: 999px;
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 11px;
		font-weight: 900;
		white-space: nowrap;
	}

	.request-config-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 10px;
	}

	.request-field {
		display: grid;
		gap: 6px;
		min-width: 0;
	}

	.request-field span {
		color: #475569;
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.request-field input,
	.request-field select {
		width: 100%;
		height: 40px;
		padding: 0 10px;
		border: 1px solid #cbd5e1;
		background: #ffffff;
		color: #0f172a;
		font-size: 12px;
		font-weight: 800;
		box-sizing: border-box;
		outline: none;
	}

	.request-field input:focus,
	.request-field select:focus {
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
	}

	.request-field select:disabled {
		background: #f1f5f9;
		color: #94a3b8;
		cursor: not-allowed;
	}

	.request-presets {
		padding: 10px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
	}

	.request-presets > span {
		color: #475569;
		font-size: 11px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		white-space: nowrap;
	}

	.request-preset-buttons {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.request-preset-buttons button {
		height: 34px;
		padding: 0 12px;
		border: 1px solid #cbd5e1;
		background: #ffffff;
		color: #0f172a;
		font-size: 12px;
		font-weight: 900;
		cursor: pointer;
	}

	.request-preset-buttons button.active-preset {
		border-color: #2563eb;
		background: #dbeafe;
		color: #1d4ed8;
	}

	.request-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.request-actions .secondary-btn {
		width: auto;
		height: 36px;
		padding: 0 14px;
		background: #ffffff;
	}

	.request-summary-strip {
		display: grid;
		grid-template-columns: 1.7fr 0.8fr 0.7fr 0.7fr;
		gap: 10px;
	}

	.request-summary-item {
		min-width: 0;
		padding: 12px;
		background: #ffffff;
		border: 1px solid #d9e2ec;
		display: grid;
		gap: 5px;
	}

	.request-summary-item span {
		color: #64748b;
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.request-summary-item strong {
		color: #0f172a;
		font-size: 12px;
		font-weight: 900;
		overflow-wrap: anywhere;
	}

	.vessel-request-panel {
		padding: 14px;
		background: #ffffff;
		border: 1px solid #d9e2ec;
		display: grid;
		gap: 12px;
	}

	.vessel-request-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	.vessel-request-list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
		max-height: 420px;
		overflow: auto;
		padding-right: 2px;
	}

	.vessel-request-card {
		padding: 12px;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		display: grid;
		gap: 12px;
	}

	.vessel-request-title {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
	}

	.vessel-avatar {
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		border-radius: 10px;
		background: #0f172a;
		color: #ffffff;
		font-size: 13px;
		font-weight: 900;
	}

	.vessel-request-name {
		display: grid;
		gap: 3px;
		min-width: 0;
	}

	.vessel-request-name strong {
		color: #0f172a;
		font-size: 12px;
		font-weight: 900;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vessel-request-name small {
		color: #64748b;
		font-size: 10px;
		font-weight: 800;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vessel-request-fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}

	@media (max-width: 1200px) {
		.request-config-grid,
		.request-summary-strip {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.vessel-request-list {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 760px) {
		.request-config-head,
		.request-presets,
		.vessel-request-head {
			flex-direction: column;
			align-items: stretch;
		}

		.request-config-grid,
		.request-summary-strip,
		.vessel-request-fields {
			grid-template-columns: 1fr;
		}

		.request-preset-buttons,
		.request-actions {
			justify-content: stretch;
		}

		.request-preset-buttons button,
		.request-actions .secondary-btn {
			width: 100%;
		}

		.vessel-request-title {
			grid-template-columns: auto minmax(0, 1fr);
		}

		.vessel-utc-pill {
			grid-column: 1 / -1;
			width: fit-content;
		}
	}

	.column-selector {
		padding: 14px;
		background: #f8fafc;
	}

	.column-toolbar {
		display: flex;
		gap: 8px;
		margin-bottom: 12px;
		flex-wrap: wrap;
	}

	.column-groups {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
	}

	.column-group {
		padding: 12px;
		background: #ffffff;
		border: 1px solid #d9e2ec;
	}

	.column-group h3 {
		margin: 0 0 10px;
		display: flex;
		justify-content: space-between;
		font-size: 13px;
		font-weight: 900;
	}

	.check-row {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #334155;
		font-size: 12px;
		font-weight: 800;
		cursor: pointer;
	}

	.column-group .check-row + .check-row {
		margin-top: 8px;
	}

	.loading-row {
		padding: 14px;
		display: grid;
		gap: 10px;
	}

	.loading-row strong {
		display: block;
		font-size: 13px;
		font-weight: 900;
	}

	.loading-row span {
		color: #64748b;
		font-size: 12px;
		font-weight: 800;
	}

	.progress-track {
		height: 9px;
		background: #e2e8f0;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: #2563eb;
		transition: width 0.25s ease;
	}

	.table-section {
		min-width: 0;
		overflow: hidden;
	}

	.table-wrapper {
		display: block;
		width: 100%;
		max-width: 100%;
		max-height: 62vh;
		overflow-x: auto;
		overflow-y: auto;
		border-top: 1px solid #e2e8f0;
		-webkit-overflow-scrolling: touch;
	}

	.table-wrapper table {
		width: max-content;
		min-width: 1800px;
		border-collapse: separate;
		border-spacing: 0;
		font-size: 12px;
	}

	.table-wrapper thead th {
		position: sticky;
		top: 0;
		z-index: 5;
	}

	.table-wrapper th,
	.table-wrapper td {
		min-width: 120px;
	}

	.table-wrapper th:nth-child(1),
	.table-wrapper td:nth-child(1) {
		position: sticky;
		left: 0;
		z-index: 6;
		min-width: 54px;
		width: 54px;
		background: #ffffff;
	}

	.table-wrapper th:nth-child(2),
	.table-wrapper td:nth-child(2) {
		position: sticky;
		left: 54px;
		z-index: 6;
		min-width: 180px;
		width: 180px;
		background: #ffffff;
	}

	.table-wrapper th:nth-child(3),
	.table-wrapper td:nth-child(3) {
		position: sticky;
		left: 234px;
		z-index: 6;
		min-width: 300px;
		width: 300px;
		background: #ffffff;
	}

	.table-wrapper thead th:nth-child(1),
	.table-wrapper thead th:nth-child(2),
	.table-wrapper thead th:nth-child(3) {
		z-index: 8;
		background: #f1f5f9;
	}

	.table-wrapper tbody td:nth-child(1),
	.table-wrapper tbody td:nth-child(2),
	.table-wrapper tbody td:nth-child(3) {
		box-shadow: 2px 0 0 rgba(226, 232, 240, 0.9);
	}

	.table-wrapper th {
		padding: 10px 12px;
		background: #f1f5f9;
		border-bottom: 1px solid #d9e2ec;
		color: #334155;
		font-size: 11px;
		font-weight: 900;
		text-align: left;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.table-wrapper td {
		padding: 10px 12px;
		border-bottom: 1px solid #edf2f7;
		color: #0f172a;
		font-weight: 800;
		white-space: nowrap;
		background: #ffffff;
	}

	.total-cell {
		background: #f0f9ff;
		color: #0369a1;
		font-weight: 900;
	}

	.vessel-name-cell {
		display: grid;
		gap: 3px;
	}

	.vessel-name-cell strong {
		font-size: 12px;
		font-weight: 900;
	}

	.vessel-name-cell span {
		color: #64748b;
		font-size: 10px;
		font-weight: 800;
	}

	.empty-box {
		padding: 18px;
		color: #64748b;
		font-weight: 800;
	}

	@media (max-width: 1100px) {
		.layout-grid,
		.summary-grid,
		.filter-grid,
		.column-groups {
			grid-template-columns: 1fr;
		}

		.avs-header-card,
		.header-actions {
			flex-direction: column;
			align-items: stretch;
		}

		.primary-btn,
		.secondary-btn {
			width: 100%;
		}
	}
</style>
