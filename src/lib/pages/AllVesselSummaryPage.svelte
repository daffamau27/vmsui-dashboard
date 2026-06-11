<script>
	import { onMount } from 'svelte';
	import { getFleetVessels } from '$lib/api/fleetApi.js';
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
			currentUserError = err?.message || 'Gagal memuat permission user.';
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
	let timezoneOffset = $state('+07:00');
	let timezoneMode = $state('manual');

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
				return row?.range?.timezone || timezoneOffset;

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

			devices.forEach((device) => {
				if (!nextRanges[device.id]) {
					nextRanges[device.id] = {
						start: defaultStartDate,
						end: defaultEndDate
					};
				}
			});

			vesselRanges = nextRanges;
		} else {
			selectedDeviceIds = [];
		}
	}

	function toggleSingleDevice(deviceId, checked) {
		if (checked) {
			selectedDeviceIds = [...new Set([...selectedDeviceIds, deviceId])];
			ensureVesselRange(deviceId);
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
			console.log('[ALL_VESSEL][LOAD_DEVICES][START]');

			const rows = await getFleetVessels();

			console.log('[ALL_VESSEL][LOAD_DEVICES][RESULT]', rows);

			devices = Array.isArray(rows)
				? rows.map((item) => ({
						id: String(item.vesselId || item.id),
						vesselId: item.vesselId || item.id,
						deviceId: item.deviceId || '',
						name: item.vesselName || item.name || '-',
						vesselName: item.vesselName || item.name || '-',
						online: Boolean(item.online),
						raw: item
					}))
				: [];

			if (!selectedDeviceIds.length && devices.length) {
				selectedDeviceIds = [devices[0].id];

				vesselRanges = {
					...vesselRanges,
					[devices[0].id]: {
						start: defaultStartDate,
						end: defaultEndDate
					}
				};
			}
		} catch (err) {
			console.error('[ALL_VESSEL][LOAD_DEVICES][ERROR]', err);
			devicesError = err?.message || 'Gagal memuat vessel list dari API.';
			devices = [];
		} finally {
			devicesLoading = false;
		}
	}

	async function loadReport() {
		if (!canAccessAllVesselSummary) {
			reportError = 'Anda tidak memiliki permission access_all_vessel_summary.';
			return;
		}

		if (!selectedDeviceRangesValid) {
			reportError = 'Default start date dan end date wajib diisi.';
			return;
		}

		if (!selectedDevices.length) {
			reportError = 'Pilih minimal satu vessel.';
			return;
		}

		const invalidRange = selectedDevices.find((device) => {
			const range = getVesselRange(device.id);
			return !range.start || !range.end;
		});

		if (invalidRange) {
			reportError = `Range untuk ${invalidRange.name} belum lengkap.`;
			return;
		}

		loading = true;
		hasLoadedReport = false;
		completed = 0;
		reportError = '';
		loadingStatus = 'Preparing request';

		try {
			const ranges = selectedDevices.map((device) => {
				const range = getVesselRange(device.id);

				return {
					vesselId: Number(device.vesselId),
					start: formatDateTimeForApi(range.start),
					end: formatDateTimeForApi(range.end)
				};
			});

			loadingStatus = `Loading ${ranges.length} vessel summary`;

			const response = await apiRequest('/all-vessel-summary/data', {
				method: 'POST',
				body: JSON.stringify({
					timezoneMode,
					timezoneOffset,
					ranges
				})
			});

			const payload = response?.data || {};

			vesselReportRows = Array.isArray(payload.rows)
				? payload.rows.map((row) => ({
						...row,
						id: String(row.vessel_id)
					}))
				: [];

			const dynamicDefaultColumnIds = buildDynamicEngineColumns(vesselReportRows)
				.filter((col) => ['runtime', 'fuel'].includes(col.type) || col.id.includes('sriti'))
				.map((col) => col.id);

			visibleColumnIds = [...new Set([...dynamicDefaultColumnIds, ...defaultColumnIds])];

			completed = ranges.length;
			hasLoadedReport = true;
			loadingStatus = 'Completed';
		} catch (err) {
			console.error('[ALL_VESSEL][LOAD_REPORT][ERROR]', err);
			reportError = err?.message || 'Gagal memuat all vessel summary.';
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
		<div class="status-box">Memuat permission user...</div>
	{:else if currentUserError}
		<div class="status-box error-box">{currentUserError}</div>
	{:else if currentUser && !canAccessAllVesselSummary}
		<div class="status-box error-box">
			Anda tidak memiliki permission untuk mengakses All Vessel Summary.
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
					<div class="empty-box">Tidak ada vessel.</div>
				{/if}
			</div>
		</aside>

		<section class="control-panel">
			<section class="table-section">
				<div class="section-header">
					<div>
						<span class="section-kicker">Range</span>
						<h2>Summary Request</h2>
					</div>

					<strong>{activeDefaultPresetLabel}</strong>
				</div>

				<div class="filter-grid">
					<label>
						<span>Start</span>
						<input
							type="datetime-local"
							bind:value={defaultStartDate}
							onchange={() => (activeDefaultPresetId = 'custom')}
						/>
					</label>

					<label>
						<span>End</span>
						<input
							type="datetime-local"
							bind:value={defaultEndDate}
							onchange={() => (activeDefaultPresetId = 'custom')}
						/>
					</label>

					<label>
						<span>Timezone</span>
						<select bind:value={timezoneOffset}>
							{#each TIMEZONE_OPTIONS as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</label>

					<label>
						<span>Timezone Mode</span>
						<select bind:value={timezoneMode}>
							<option value="manual">Manual</option>
							<option value="auto">Auto</option>
						</select>
					</label>
				</div>

				<div class="preset-row">
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

				<div class="range-note">
					Selected range: <strong>{selectedRangeSummary}</strong>
				</div>

				<div class="range-actions">
					<button
						type="button"
						class="secondary-btn"
						onclick={applyDefaultRangeToSelectedVessels}
						disabled={!selectedDevicesCount}
					>
						Apply Default Range to Selected Vessels
					</button>
				</div>

				<div class="vessel-range-summary">
					<div class="vessel-range-head">
						<span>Vessel</span>
						<span>Start</span>
						<span>End</span>
					</div>

					{#if selectedDevices.length}
						{#each selectedDevices as device}
							<div class="vessel-range-row">
								<div class="vessel-range-name">
									<strong>{device.name}</strong>
								</div>

								<input
									type="datetime-local"
									value={getVesselRange(device.id).start}
									onchange={(event) =>
										setVesselRange(device.id, 'start', event.currentTarget.value)}
								/>

								<input
									type="datetime-local"
									value={getVesselRange(device.id).end}
									onchange={(event) => setVesselRange(device.id, 'end', event.currentTarget.value)}
								/>
							</div>
						{/each}
					{:else}
						<div class="empty-box">Pilih vessel terlebih dahulu.</div>
					{/if}
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
			<div class="empty-box">Klik Load Summary untuk mengambil data.</div>
		{:else if loading}
			<div class="empty-box">Summary sedang dimuat...</div>
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
			<div class="empty-box">Tidak ada data summary pada range yang dipilih.</div>
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

	.filter-grid {
		padding: 14px;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
		background: #f8fafc;
	}

	.filter-grid label {
		display: grid;
		gap: 6px;
	}

	.filter-grid label span {
		color: #475569;
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.preset-row {
		padding: 0 14px 14px;
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		background: #f8fafc;
	}

	.preset-row button {
		height: 34px;
		padding: 0 12px;
		border: 1px solid #cbd5e1;
		background: #ffffff;
		color: #0f172a;
		font-size: 12px;
		font-weight: 900;
		cursor: pointer;
	}

	.preset-row button.active-preset {
		border-color: #2563eb;
		background: #dbeafe;
		color: #1d4ed8;
	}

	.range-actions {
		padding: 0 14px 14px;
		background: #f8fafc;
	}

	.vessel-range-summary {
		padding: 14px;
		background: #f8fafc;
		border-top: 1px solid #e2e8f0;
		display: grid;
		gap: 8px;
		max-height: 280px;
		overflow: auto;
	}

	.vessel-range-head,
	.vessel-range-row {
		display: grid;
		grid-template-columns: minmax(180px, 1.2fr) minmax(180px, 1fr) minmax(180px, 1fr);
		gap: 10px;
		align-items: center;
	}

	.vessel-range-head {
		position: sticky;
		top: 0;
		z-index: 2;
		padding: 8px 10px;
		background: #f1f5f9;
		border: 1px solid #d9e2ec;
	}

	.vessel-range-head span {
		color: #334155;
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.vessel-range-row {
		padding: 10px;
		background: #ffffff;
		border: 1px solid #d9e2ec;
	}

	.vessel-range-name {
		display: grid;
		gap: 3px;
		min-width: 0;
	}

	.vessel-range-name strong {
		color: #0f172a;
		font-size: 12px;
		font-weight: 900;
	}

	.vessel-range-name small {
		color: #64748b;
		font-size: 10px;
		font-weight: 800;
	}

	.vessel-range-row input {
		width: 100%;
		height: 38px;
		padding: 0 10px;
		border: 1px solid #cbd5e1;
		background: #ffffff;
		color: #0f172a;
		font-size: 12px;
		font-weight: 800;
		box-sizing: border-box;
	}

	@media (max-width: 900px) {
		.vessel-range-head,
		.vessel-range-row {
			grid-template-columns: 1fr;
		}
	}

	.range-note {
		padding: 12px 14px;
		border-top: 1px solid #e2e8f0;
		color: #475569;
		font-size: 12px;
		font-weight: 800;
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
