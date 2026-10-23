<script>
	import { onMount } from 'svelte';
	import { apiRequest } from '$lib/api/authApi.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import { getAutoTimezoneLabelFromSources } from '$lib/utils/autoTimezoneLabel.js';
	import { sortByAlpha } from '$lib/utils/alphaSort.js';
	import {
		buildAllVesselSummaryColumns,
		buildAllVesselSummaryTable,
		groupAllVesselSummaryColumns,
		getAllVesselSummaryCellValue
	} from '$lib/utils/allVesselSummary.js';
	import AvsHeader from './AvsHeader.svelte';
	import AvsSummaryGrid from './AvsSummaryGrid.svelte';
	import AvsVesselPanel from './AvsVesselPanel.svelte';
	import AvsRequestPanel from './AvsRequestPanel.svelte';
	import AvsColumnsPanel from './AvsColumnsPanel.svelte';
	import AvsProgressSection from './AvsProgressSection.svelte';
	import AvsReportTable from './AvsReportTable.svelte';
	import './avs-page.css';

	const TIME_RANGE_PRESETS = [
		{ id: 'midnight', label: '00:00 - 06:00', startTime: '00:00', endTime: '06:00' },
		{ id: 'day', label: '06:00 - 18:00', startTime: '06:00', endTime: '18:00' },
		{ id: 'night', label: '18:00 - 24:00', startTime: '18:00', endTime: '23:59' }
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
	let visibleColumnIds = $state([]);

	let hasLoadedReport = $state(false);
	let loading = $state(false);
	let loadingStatus = $state('Preparing');
	let completed = $state(0);
	let reportError = $state('');

	function canViewReportColumn(column) {
		return column.permissions.every((permission) => hasPermission(permission));
	}

	let selectedDevicesCount = $derived(selectedDeviceIds.length);

	let selectAllDevices = $derived(
		devices.length > 0 && selectedDeviceIds.length === devices.length
	);

	let selectedColumnCount = $derived(visibleDataColumns.length);

	let filteredDevices = $derived(
		sortByAlpha(
			devices.filter((device) => device.name.toLowerCase().includes(vesselSearch.toLowerCase())),
			(device) => device.name,
			(device) => device.companyName
		)
	);

	let selectedDevices = $derived(devices.filter((device) => selectedDeviceIds.includes(device.id)));

	let reportColumns = $derived(buildAllVesselSummaryColumns(vesselReportRows));

	let permittedReportColumns = $derived(reportColumns.filter(canViewReportColumn));

	let tableLayout = $derived(
		buildAllVesselSummaryTable(
			permittedReportColumns.filter((col) => visibleColumnIds.includes(col.id))
		)
	);
	let visibleDataColumns = $derived(tableLayout.columns);

	let columnGroups = $derived(groupAllVesselSummaryColumns(permittedReportColumns));

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

	function getDeviceAutoTimezoneLabel(device = null) {
		return getAutoTimezoneLabelFromSources(device);
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
		visibleColumnIds = permittedReportColumns
			.filter((col) => col.defaultVisible)
			.map((col) => col.id);
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
				? sortByAlpha(
						rows.map((item) => ({
							id: String(item.id),
							vesselId: item.id,
							deviceId: item.deviceId || '',
							name: item.vesselName || '-',
							vesselName: item.vesselName || '-',
							companyName: item.companyName || '',
							engines: item.engines || [],
							raw: item
						})),
						(device) => device.name,
						(device) => device.companyName
					)
				: [];

			const availableDeviceIds = new Set(devices.map((device) => device.id));
			selectedDeviceIds = selectedDeviceIds.filter((deviceId) => availableDeviceIds.has(deviceId));
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

			visibleColumnIds = buildAllVesselSummaryColumns(vesselReportRows)
				.filter(canViewReportColumn)
				.map((col) => col.id);

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
		<LoadingSkeleton label="Loading all vessel summary page" variant="all-vessel-summary-page" />
	{:else if currentUserError}
		<div class="status-box error-box">{currentUserError}</div>
	{:else if currentUser && !canAccessAllVesselSummary}
		<div class="status-box error-box">You do not have permission to access All Vessel Summary.</div>
	{/if}

	{#if canAccessAllVesselSummary}
		<AvsHeader
			{devicesLoading}
			{loading}
			{selectedDevicesCount}
			canAccess={canAccessAllVesselSummary}
			onReload={loadDeviceList}
			onLoad={loadReport}
		/>
	{/if}

	{#if devicesError}
		<div class="status-box error-box">{devicesError}</div>
	{/if}

	{#if reportError}
		<div class="status-box error-box">{reportError}</div>
	{/if}

	<AvsSummaryGrid {selectedDevicesCount} loadedRows={vesselReportRows.length} />

	<section class="layout-grid">
		<AvsVesselPanel
			{devices}
			{filteredDevices}
			{selectedDeviceIds}
			{selectAllDevices}
			{devicesLoading}
			bind:search={vesselSearch}
			onToggleAll={toggleAllDevices}
			onToggleSingle={toggleSingleDevice}
		/>

		<section class="control-panel">
			<AvsRequestPanel
				presets={TIME_RANGE_PRESETS}
				{activeDefaultPresetId}
				{activeDefaultPresetLabel}
				bind:defaultStartDate
				bind:defaultEndDate
				bind:defaultTimezoneMode
				bind:defaultTimezoneOffset
				autoTimezoneLabel={getDeviceAutoTimezoneLabel()}
				{selectedRangeSummary}
				{selectedDevicesCount}
				{selectedDevices}
				{getVesselRange}
				{getVesselTimezone}
				{getDeviceAutoTimezoneLabel}
				onDefaultDateChange={() => (activeDefaultPresetId = 'custom')}
				onApplyPreset={applyDefaultRangePreset}
				onApplyRange={applyDefaultRangeToSelectedVessels}
				onApplyTimezone={applyDefaultTimezoneToSelectedVessels}
				onSetVesselRange={setVesselRange}
				onSetVesselTimezone={setVesselTimezone}
			/>

			<AvsColumnsPanel
				{columnGroups}
				{visibleColumnIds}
				{selectedColumnCount}
				bind:showColumnSelector
				{getGroupVisibleCount}
				onToggleColumn={setColumnVisibility}
				onSelectAll={() => setAllColumnsVisibility(true)}
				onClear={() => setAllColumnsVisibility(false)}
				onReset={resetVisibleColumns}
			/>
		</section>
	</section>

	<AvsProgressSection {loading} {loadingStatus} {completed} {selectedDevicesCount} {progress} />

	<AvsReportTable
		{hasLoadedReport}
		{loading}
		rows={vesselReportRows}
		{tableLayout}
		{visibleDataColumns}
		{formatRangeLabel}
		{isTotalColumn}
		getCellValue={getAllVesselSummaryCellValue}
	/>
</section>
