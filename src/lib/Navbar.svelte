<script>
	import { onMount, onDestroy } from 'svelte';
	import { activeVesselMenu, setActiveVesselMenu } from '$lib/stores/vesselNavigation.svelte.js';
	import {
		selectedVesselId,
		selectedVesselInfo,
		setSelectedVessel,
		restoreSelectedVessel
	} from '$lib/stores/selectedVessel.svelte.js';
	import { apiRequest } from '$lib/api/authApi.js';
	import { getDailyReportData } from '$lib/api/dailyReportApi.js';
	import { pageStatus } from '$lib/stores/pageStatusStore.svelte.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let dropdownOpen = $state(false);
	let vesselDropdownOpen = $state(false);

	let vessels = $state([]);
	let vesselLoading = $state(false);
	let vesselError = $state('');

	let permissionLoading = $state(true);
	let permissionMode = $state('selected');
	let permissions = $state([]);

	const vesselMenus = [
		{
			label: 'Dashboard',
			key: 'dashboard',
			permissions: ['access_dashboard']
		},
		{
			label: 'Daily Report',
			key: 'daily-report',
			permissions: ['access_daily_report']
		},
		{
			label: 'Monthly Report',
			key: 'monthly-report',
			permissions: ['access_monthly_report']
		},
		{
			label: 'Periodical Report',
			key: 'periodical-report',
			permissions: ['access_periodical_report']
		},
		{
			label: 'Voyage Plan',
			key: 'voyage-plan',
			permissions: ['view_voyage_plan_vessel']
		},
		{
			label: 'Trace',
			key: 'trace',
			permissions: ['access_trace']
		},
		{
			label: 'Data Log',
			key: 'data-log',
			permissions: ['access_data_log']
		},
		{
			label: 'Fuel Management',
			key: 'fuel-management',
			permissions: ['access_fuel_management']
		}
	];

	function hasPermission(permissionKeys = []) {
		if (permissionMode === 'all') return true;

		if (!Array.isArray(permissionKeys)) return false;
		if (!permissionKeys.length) return false;

		return permissionKeys.some((permissionKey) => permissions.includes(permissionKey));
	}

	let visibleVesselMenus = $derived(vesselMenus.filter((menu) => hasPermission(menu.permissions)));

	function normalizeMyVessel(item) {
		return {
			id: String(item?.id),
			vesselId: item?.id,
			dbId: item?.id,

			deviceId: item?.deviceId || '',
			vesselName: item?.vesselName || item?.deviceName || '-',
			name: item?.vesselName || item?.deviceName || '-',
			deviceName: item?.deviceName || item?.vesselName || '-',

			companyId: item?.companyId ?? null,
			companyName: item?.companyName || '-',

			// Endpoint /users/my-vessels does not include live status yet
			online: item?.online ?? null,

			raw: item
		};
	}

	async function getMyVessels() {
		const response = await apiRequest('/users/my-vessels', {
			method: 'GET'
		});

		const rows = Array.isArray(response)
			? response
			: Array.isArray(response?.data)
				? response.data
				: [];

		return rows.map(normalizeMyVessel);
	}

	async function loadCurrentUserPermissions() {
		permissionLoading = true;

		try {
			const response = await apiRequest('/users/current-user', {
				method: 'GET'
			});

			const permissionAccess = response?.data?.permissionAccess || {};

			permissionMode = permissionAccess?.mode || 'selected';

			const rawPermissions = Array.isArray(permissionAccess?.permissions)
				? permissionAccess.permissions
				: Array.isArray(permissionAccess?.details)
					? permissionAccess.details
					: [];

			permissions = rawPermissions
				.map((item) => {
					if (typeof item === 'string') return item;

					return (
						item?.key || item?.permissionKey || item?.name || item?.code || item?.permission || ''
					);
				})
				.filter(Boolean);

			console.log('[NAVBAR][CURRENT_USER_PERMISSION]', {
				mode: permissionMode,
				permissions
			});
		} catch (err) {
			console.error('[NAVBAR][CURRENT_USER_PERMISSION][ERROR]', err);

			permissionMode = 'selected';
			permissions = [];
		} finally {
			permissionLoading = false;
		}
	}

	let activeMenu = $derived(
		permissionLoading
			? 'Loading...'
			: visibleVesselMenus.find((menu) => menu.key === $activeVesselMenu)?.label ||
					visibleVesselMenus[0]?.label ||
					'No Access'
	);

	$effect(() => {
		if (permissionLoading) return;

		if (!visibleVesselMenus.length) {
			setActiveVesselMenu('');
			return;
		}

		const activeMenuStillAllowed = visibleVesselMenus.some(
			(menu) => menu.key === $activeVesselMenu
		);

		if (!activeMenuStillAllowed) {
			setActiveVesselMenu(visibleVesselMenus[0].key);
		}
	});

	let selectedVessel = $derived(
		$selectedVesselInfo?.vesselName || $selectedVesselInfo?.name || 'Select Vessel'
	);

	let latestStatusInterval = null;
	let latestStatusRequestId = 0;
	let todayDataReceivedRequestId = 0;
	let lastStatusVesselId = $state(null);
	let todayDataReceived = $state('-');
	let todayDataReceivedStats = $state({
		received: '-',
		total: 1440
	});

	let latestVesselStatus = $state({
		queue: '-',
		sdcard: '-',
		sdCardAvailable: false,
		sdCardUsed: '-',
		sdCardCapacity: '-',
		online: false
	});

	let status = $derived({
		dataReceived: todayDataReceived || $pageStatus?.dataReceived || '-',
		dataReceivedReceived: todayDataReceivedStats.received ?? '-',
		dataReceivedTotal: todayDataReceivedStats.total ?? 1440,
		queue: latestVesselStatus.queue ?? '-',
		sdcard: latestVesselStatus.sdcard ?? '-',
		sdCardAvailable: latestVesselStatus.sdCardAvailable ?? false,
		sdCardUsed: latestVesselStatus.sdCardUsed ?? '-',
		sdCardCapacity: latestVesselStatus.sdCardCapacity ?? '-',
		online: latestVesselStatus.online ?? false,
		sourcePage: $pageStatus?.sourcePage ?? ''
	});

	function padDatePart(value) {
		return String(value).padStart(2, '0');
	}

	function todayDate() {
		const date = new Date();
		return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
	}

	function formatDataReceivedStats(stats = {}) {
		todayDataReceivedStats = {
			received:
				stats?.received_minutes ??
				stats?.receivedMinutes ??
				stats?.received_slots ??
				stats?.receivedSlots ??
				'-',
			total:
				stats?.total_minutes ??
				stats?.totalMinutes ??
				stats?.total_slots ??
				stats?.totalSlots ??
				1440
		};

		if (stats?.received_minutes !== undefined && stats?.total_minutes !== undefined) {
			return `${stats.received_minutes} of ${stats.total_minutes} (${stats.percentage ?? '-' }%)`;
		}

		if (stats?.receivedMinutes !== undefined && stats?.totalMinutes !== undefined) {
			return `${stats.receivedMinutes} of ${stats.totalMinutes} (${stats.percentage ?? '-' }%)`;
		}

		if (stats?.received_slots !== undefined && stats?.total_slots !== undefined) {
			return `${stats.received_slots} of ${stats.total_slots} (${stats.percentage ?? '-' }%)`;
		}

		if (stats?.receivedSlots !== undefined && stats?.totalSlots !== undefined) {
			return `${stats.receivedSlots} of ${stats.totalSlots} (${stats.percentage ?? '-' }%)`;
		}

		return '-';
	}

	function formatSdCardStatus(sdCardStats) {
		if (!sdCardStats || sdCardStats.available === false) {
			return 'Not Available';
		}

		const freePercentage = Number(sdCardStats.sd_card_free_percentage);
		const free = Number(sdCardStats.sd_card_free);
		const total = Number(sdCardStats.sd_card_total);

		if (Number.isFinite(freePercentage)) {
			return `${freePercentage.toFixed(1)}% Free`;
		}

		if (Number.isFinite(free) && Number.isFinite(total) && total > 0) {
			return `${free}/${total} MB Free`;
		}

		return 'Available';
	}

	function formatNumber(value) {
		const number = Number(value);
		if (!Number.isFinite(number)) return '-';
		return number.toLocaleString('en-US');
	}

	function formatStorageFromMb(value) {
		const number = Number(value);
		if (!Number.isFinite(number)) return '-';

		if (number >= 1000) {
			const gb = number / 1000;
			return `${Number.isInteger(gb) ? gb.toFixed(0) : gb.toFixed(1)} GB`;
		}

		return `${formatNumber(number)} MB`;
	}

	function normalizeSdCardDetails(sdCardStats = {}) {
		const total = Number(sdCardStats?.sd_card_total);
		const free = Number(sdCardStats?.sd_card_free);
		const used = Number(
			sdCardStats?.sd_card_used ??
				(Number.isFinite(total) && Number.isFinite(free) ? total - free : NaN)
		);

		return {
			available: Boolean(sdCardStats?.available),
			used: formatStorageFromMb(used),
			capacity: formatStorageFromMb(total)
		};
	}

	function normalizeLatestStatus(response) {
		const data = response?.data?.vessel_id
			? response.data
			: response?.data?.device_id
				? response.data
				: response?.queue !== undefined
					? response
					: response?.data || {};
		const sdCardDetails = normalizeSdCardDetails(data.sd_card_stats);

		return {
			queue: data.queue ?? '-',
			sdcard: formatSdCardStatus(data.sd_card_stats),
			sdCardAvailable: sdCardDetails.available,
			sdCardUsed: sdCardDetails.used,
			sdCardCapacity: sdCardDetails.capacity,
			online: Boolean(data.online)
		};
	}

	async function loadLatestVesselStatus(vesselId) {
		const effectiveVesselId =
			vesselId ||
			$selectedVesselId ||
			$selectedVesselInfo?.vesselId ||
			$selectedVesselInfo?.id ||
			$selectedVesselInfo?.dbId;

		console.log('[NAVBAR][LATEST_STATUS][CALL]', {
			vesselId,
			effectiveVesselId,
			selectedVesselId: $selectedVesselId,
			selectedVesselInfo: $selectedVesselInfo
		});

		if (!effectiveVesselId) {
			console.warn('[NAVBAR][LATEST_STATUS][SKIP] vesselId is empty');

			latestVesselStatus = {
				queue: '-',
				sdcard: '-',
				sdCardAvailable: false,
				sdCardUsed: '-',
				sdCardCapacity: '-',
				online: false
			};

			return;
		}

		const requestId = ++latestStatusRequestId;

		try {
			const response = await apiRequest(`/vessels/${effectiveVesselId}/latest-status`, {
				method: 'GET'
			});

			console.log('[NAVBAR][LATEST_STATUS][RESPONSE]', response);

			if (requestId !== latestStatusRequestId) return;

			latestVesselStatus = normalizeLatestStatus(response);

			console.log('[NAVBAR][LATEST_STATUS][NORMALIZED]', latestVesselStatus);
		} catch (err) {
			console.error('[NAVBAR][LATEST_STATUS][ERROR]', err);

			if (requestId !== latestStatusRequestId) return;

			latestVesselStatus = {
				queue: '-',
				sdcard: '-',
				sdCardAvailable: false,
				sdCardUsed: '-',
				sdCardCapacity: '-',
				online: false
			};
		}
	}

	async function loadTodayDataReceivedStatus(vesselId) {
		const effectiveVesselId =
			vesselId ||
			$selectedVesselId ||
			$selectedVesselInfo?.vesselId ||
			$selectedVesselInfo?.id ||
			$selectedVesselInfo?.dbId;

		if (!effectiveVesselId) {
			todayDataReceived = '-';
			todayDataReceivedStats = { received: '-', total: 1440 };
			return;
		}

		const requestId = ++todayDataReceivedRequestId;
		const date = todayDate();

		try {
			const response = await getDailyReportData({
				vesselId: effectiveVesselId,
				date,
				timezoneMode: 'auto'
			});

			if (requestId !== todayDataReceivedRequestId) return;

			const payload = response?.data || response || {};
			const stats = payload?.data_received_stats || payload?.dataReceivedStats || payload?.stats || {};
			todayDataReceived = formatDataReceivedStats(stats);

			console.log('[NAVBAR][TODAY_DATA_RECEIVED]', {
				vesselId: effectiveVesselId,
				date,
				dataReceived: todayDataReceived,
				stats
			});
		} catch (err) {
			console.error('[NAVBAR][TODAY_DATA_RECEIVED_ERROR]', err);

			if (requestId !== todayDataReceivedRequestId) return;

			todayDataReceived = '-';
			todayDataReceivedStats = { received: '-', total: 1440 };
		}
	}

	function stopLatestStatusPolling() {
		if (latestStatusInterval) {
			clearInterval(latestStatusInterval);
			latestStatusInterval = null;
		}
	}

	function startLatestStatusPolling(vesselId) {
		const effectiveVesselId =
			vesselId ||
			$selectedVesselId ||
			$selectedVesselInfo?.vesselId ||
			$selectedVesselInfo?.id ||
			$selectedVesselInfo?.dbId;

		console.log('[NAVBAR][LATEST_STATUS][START_POLLING]', effectiveVesselId);

		stopLatestStatusPolling();

		if (!effectiveVesselId) {
			console.warn('[NAVBAR][LATEST_STATUS][POLLING_SKIP] vesselId is empty');
			return;
		}

		loadLatestVesselStatus(effectiveVesselId);
		loadTodayDataReceivedStatus(effectiveVesselId);

		latestStatusInterval = setInterval(() => {
			loadLatestVesselStatus(effectiveVesselId);
			loadTodayDataReceivedStatus(effectiveVesselId);
		}, 30000);
	}

	$effect(() => {
		const vesselId =
			$selectedVesselId ||
			$selectedVesselInfo?.vesselId ||
			$selectedVesselInfo?.id ||
			$selectedVesselInfo?.dbId;

		if (!vesselId) return;
		if (String(vesselId) === String(lastStatusVesselId)) return;

		lastStatusVesselId = vesselId;
		startLatestStatusPolling(vesselId);
	});

	async function loadNavbarVessels() {
		vesselLoading = true;
		vesselError = '';

		try {
			console.log('[NAVBAR][LOAD_MY_VESSELS][START]');

			const rows = await getMyVessels();

			console.log('[NAVBAR][LOAD_MY_VESSELS][RESULT]', rows);

			vessels = Array.isArray(rows) ? rows : [];

			const currentId = $selectedVesselId;

			if (currentId && vessels.length) {
				const found = vessels.find((item) => Number(item.vesselId) === Number(currentId));
				const selected = found || vessels[0];

				setSelectedVessel(selected);
				startLatestStatusPolling(selected.vesselId || selected.id || selected.dbId);
			} else if (vessels.length) {
				const selected = vessels[0];

				setSelectedVessel(selected);
				startLatestStatusPolling(selected.vesselId || selected.id || selected.dbId);
			}
		} catch (err) {
			console.error('[NAVBAR][LOAD_MY_VESSELS][ERROR]', err);
			vesselError = err?.message || 'Failed to load vessels from the API.';
			vessels = [];
		} finally {
			vesselLoading = false;
		}
	}

	function selectMenu(menu) {
		if (!hasPermission(menu.permissions)) return;

		dropdownOpen = false;
		setActiveVesselMenu(menu.key);
	}

	function selectVessel(vessel) {
		setSelectedVessel(vessel);
		vesselDropdownOpen = false;

		console.log('[NAVBAR][VESSEL_SELECTED]', vessel);

		const vesselId = vessel?.vesselId || vessel?.id || vessel?.dbId;

		startLatestStatusPolling(vesselId);
	}

	onMount(async () => {
		restoreSelectedVessel();

		setTimeout(() => {
			loadCurrentUserPermissions();
			loadNavbarVessels();
		}, 150);
	});

	onDestroy(() => {
		stopLatestStatusPolling();
	});
</script>

<header class="topbar">
	<div class="topbar-left">
		<div class="dropdown">
			<button class="dropdown-button" onclick={() => (dropdownOpen = !dropdownOpen)}>
				<span>{activeMenu}</span>
				<span class="arrow">▾</span>
			</button>

			{#if dropdownOpen}
				<div class="dropdown-menu">
					{#if permissionLoading}
						<div class="dropdown-empty"><LoadingSkeleton label="Loading menu" variant="list" rows={3} compact /></div>
					{:else if visibleVesselMenus.length}
						{#each visibleVesselMenus as menu}
							<button
								class="dropdown-item"
								class:active-item={$activeVesselMenu === menu.key}
								onclick={() => selectMenu(menu)}
							>
								{menu.label}
							</button>
						{/each}
					{:else}
						<div class="dropdown-empty">No menu access.</div>
					{/if}
				</div>
			{/if}
		</div>

		<div class="topbar-table telemetry-count-card">
			<div class="topbar-table-title">Telemetry Data Count ({status.dataReceivedTotal})</div>
			<div class="topbar-table-grid two-cols">
				<span>Received</span>
				<span>Queue</span>
				<strong>{status.dataReceivedReceived}</strong>
				<strong>{status.queue}</strong>
			</div>
		</div>

		<div class="topbar-table sd-card-card">
			<div class="topbar-table-title">
				<span class:available-dot={status.sdCardAvailable} class:unavailable-dot={!status.sdCardAvailable} class="sd-available-dot"></span>
				SD Card (%)
			</div>
			<div class="topbar-table-grid two-cols">
				<span>Used</span>
				<span>Capacity</span>
				<strong>{status.sdCardUsed}</strong>
				<strong>{status.sdCardCapacity}</strong>
			</div>
		</div>

		<div class="topbar-item online-box" class:offline-box={!status.online}>
			<span class="dot"></span>
			{status.online ? 'Online' : 'Offline'}
		</div>

		{#if status.sourcePage}
			<div class="topbar-item source-box">
				Source : {status.sourcePage}
			</div>
		{/if}
	</div>

	<div class="vessel-dropdown">
		<button
			class="vessel-selector"
			onclick={() => (vesselDropdownOpen = !vesselDropdownOpen)}
			disabled={vesselLoading}
		>
			<span>{vesselLoading ? 'Loading...' : selectedVessel}</span>
			<span class="arrow">▾</span>
		</button>

		{#if vesselDropdownOpen}
			<div class="vessel-menu">
				{#if vesselLoading}
					<div class="vessel-empty"><LoadingSkeleton label="Loading vessels" variant="list" rows={4} compact /></div>
				{:else if vesselError}
					<div class="vessel-empty">{vesselError}</div>
				{:else if vessels.length}
					{#each vessels as vessel}
						<button
							class="vessel-item"
							class:active-vessel={Number($selectedVesselId) === Number(vessel.vesselId)}
							onclick={() => selectVessel(vessel)}
						>
							<strong>{vessel.vesselName || vessel.name}</strong>
							<small>
								{vessel.deviceName || vessel.deviceId || '-'}
							</small>
						</button>
					{/each}
				{:else}
					<div class="vessel-empty">No vessels available.</div>
				{/if}
			</div>
		{/if}
	</div>
</header>

<style>
	.topbar {
		height: 62px;
		padding: 0 10px;
		gap: 10px;
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
		box-shadow: 0 1px 0 rgba(59, 130, 246, 0.08);
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 12px;
		flex-shrink: 0;
		position: relative;
		z-index: 900;
	}

	.topbar-left {
		display: flex;
		align-items: center;
		height: 100%;
		min-width: 0;
		overflow: visible;
		gap: 6px;
	}

	.dropdown {
		position: relative;
		height: auto;
		flex-shrink: 0;
	}

	.dropdown-button {
		height: 34px;
		min-width: 150px;
		padding: 0 14px;
		border: 1px solid rgba(59, 130, 246, 0.25);
		border-radius: 8px;
		background: rgba(59, 130, 246, 0.1);
		color: var(--text-accent);
		font-weight: 700;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		font-size: 12px;
		transition: background var(--duration-fast), border-color var(--duration-fast);
	}

	.dropdown-button:hover {
		background: rgba(59, 130, 246, 0.18);
		border-color: rgba(59, 130, 246, 0.42);
	}

	.arrow {
		font-size: 11px;
	}

	.dropdown-menu {
		position: absolute;
		top: 40px;
		left: 0;
		min-width: 210px;
		padding: 6px;
		background: var(--color-elevated);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		box-shadow: var(--shadow-md);
		backdrop-filter: blur(16px);
		animation: dropdown-in 0.15s ease;
		z-index: 999;
	}

	.dropdown-item {
		width: 100%;
		padding: 9px 12px;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--text-secondary);
		text-align: left;
		cursor: pointer;
		font-size: 12px;
	}

	.dropdown-empty {
		padding: 10px 14px;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
		white-space: nowrap;
	}

	.dropdown-item:hover {
		background: rgba(255, 255, 255, 0.05);
		color: var(--text-primary);
	}

	.active-item {
		background: var(--color-accent-muted);
		color: var(--text-accent);
		font-weight: 700;
	}

	.topbar-item {
		height: 28px;
		padding: 0 10px;
		display: flex;
		align-items: center;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.035);
		color: var(--text-secondary);
		white-space: nowrap;
		font-size: 11px;
		font-weight: 700;
	}

	.topbar-table {
		height: 54px;
		min-width: 210px;
		display: grid;
		grid-template-rows: 21px 1fr;
		border: 1px solid rgba(96, 165, 250, 0.22);
		border-radius: 14px;
		background:
			linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(15, 23, 42, 0.08)),
			rgba(15, 23, 42, 0.42);
		color: var(--text-primary);
		overflow: hidden;
		box-shadow:
			0 10px 26px rgba(2, 6, 23, 0.16),
			inset 0 1px 0 rgba(255, 255, 255, 0.08);
		backdrop-filter: blur(12px);
	}

	.telemetry-count-card {
		min-width: 265px;
		border-color: rgba(96, 165, 250, 0.32);
	}

	.sd-card-card {
		min-width: 210px;
		border-color: rgba(20, 184, 166, 0.26);
		background:
			linear-gradient(135deg, rgba(20, 184, 166, 0.14), rgba(15, 23, 42, 0.08)),
			rgba(15, 23, 42, 0.42);
	}

	.topbar-table-title {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 7px;
		padding: 0 10px;
		border-bottom: 1px solid rgba(148, 163, 184, 0.18);
		color: #bfdbfe;
		font-size: 10px;
		line-height: 1;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.topbar-table-grid {
		display: grid;
		min-height: 0;
	}

	.topbar-table-grid.two-cols {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.topbar-table-grid span,
	.topbar-table-grid strong {
		min-width: 0;
		display: flex;
		align-items: center;
		padding: 0 10px;
		border-right: 1px solid rgba(148, 163, 184, 0.14);
		border-bottom: 1px solid rgba(148, 163, 184, 0.12);
		font-size: 10px;
		line-height: 1;
		white-space: nowrap;
	}

	.topbar-table-grid span {
		color: #94a3b8;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		background: rgba(15, 23, 42, 0.24);
	}

	.topbar-table-grid span:nth-child(2n),
	.topbar-table-grid strong:nth-child(2n) {
		border-right: none;
	}

	.topbar-table-grid strong {
		justify-content: flex-end;
		color: #f8fafc;
		font-size: 14px;
		font-weight: 800;
		letter-spacing: -0.02em;
		background: rgba(15, 23, 42, 0.1);
	}

	.sd-available-dot {
		width: 9px;
		height: 9px;
		border-radius: 999px;
		display: inline-block;
		flex: 0 0 auto;
		background: #94a3b8;
		box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.12);
	}

	.sd-available-dot.available-dot {
		background: #12b886;
		box-shadow:
			0 0 0 3px rgba(18, 184, 134, 0.14),
			0 0 12px rgba(18, 184, 134, 0.46);
	}

	.sd-available-dot.unavailable-dot {
		background: #94a3b8;
	}

	.source-box {
		color: var(--text-secondary);
		font-size: 12px;
	}

	.online-box {
		gap: 6px;
		border-color: rgba(16, 185, 129, 0.2);
		background: var(--color-success-muted);
		color: #34d399;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-success);
		display: inline-block;
		box-shadow: 0 0 8px rgba(16, 185, 129, 0.55);
		animation: pulse-dot 1.8s ease-in-out infinite;
	}

	.offline-box {
		border-color: rgba(100, 116, 139, 0.18);
		background: rgba(100, 116, 139, 0.15);
		color: var(--text-secondary);
	}

	.offline-box .dot {
		background: #94a3b8;
	}

	.vessel-dropdown {
		position: relative;
		height: auto;
		flex-shrink: 0;
	}

	.vessel-selector {
		height: 34px;
		min-width: 190px;
		padding: 0 12px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.04);
		color: var(--text-primary);
		font-weight: 700;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		font-size: 12px;
		transition: background var(--duration-fast), border-color var(--duration-fast);
	}

	.vessel-selector:hover {
		background: var(--color-accent-muted);
		border-color: rgba(59, 130, 246, 0.35);
	}

	.vessel-selector:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.vessel-menu {
		position: absolute;
		top: 40px;
		right: 0;
		min-width: 240px;
		max-height: 420px;
		overflow: auto;
		padding: 6px;
		background: var(--color-elevated);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		box-shadow: var(--shadow-md);
		backdrop-filter: blur(16px);
		z-index: 999;
	}

	.vessel-item {
		width: 100%;
		padding: 9px 12px;
		border: none;
		border: none;
		border-radius: 8px;
		background: transparent;
		text-align: left;
		cursor: pointer;
		display: grid;
		gap: 3px;
	}

	.vessel-item strong {
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 800;
	}

	.vessel-item small {
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 700;
	}

	.vessel-item:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.active-vessel {
		background: var(--color-accent-muted);
	}

	.vessel-empty {
		padding: 12px;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
	}

	@media (max-width: 900px) {
		.topbar {
			overflow-x: auto;
		}

		.vessel-dropdown {
			position: sticky;
			right: 0;
		}
	}

	@keyframes pulse-dot {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.6; transform: scale(0.85); }
	}

	@keyframes dropdown-in {
		from { opacity: 0; transform: translateY(-6px); }
		to { opacity: 1; transform: translateY(0); }
	}
</style>
