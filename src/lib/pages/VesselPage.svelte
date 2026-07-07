<script>
	import { onMount, onDestroy } from 'svelte';
	import { activeVesselMenu, setActiveVesselMenu } from '$lib/stores/vesselNavigation.svelte.js';
	import { apiRequest } from '$lib/api/authApi.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	import VesselDashboardPage from '$lib/pages/vessel/VesselDashboardPage.svelte';
	import DailyReportPage from '$lib/pages/vessel/DailyReportPage.svelte';
	import MonthlyReportPage from '$lib/pages/vessel/MonthlyReportPage.svelte';
	import PeriodicalReportPage from '$lib/pages/vessel/PeriodicalReportPage.svelte';
	import VoyagePlanPage from '$lib/pages/vessel/VoyagePlanPage.svelte';
	import TracePage from '$lib/pages/vessel/TracePage.svelte';
	import DataLogPage from '$lib/pages/vessel/DataLogPage.svelte';
	import FuelManagementPage from '$lib/pages/vessel/FuelManagementPage.svelte';

	import { getFleetVesselsWithEngines } from '$lib/api/fleetApi.js';
	import {
		selectedVesselId,
		selectedVesselInfo,
		setSelectedVessel,
		restoreSelectedVessel
	} from '$lib/stores/selectedVessel.svelte.js';
	import { pageStatus } from '$lib/stores/pageStatusStore.svelte.js';
	import { getDailyReportData } from '$lib/api/dailyReportApi.js';

	let { active = true } = $props();

	let menuOpen = $state(false);
	let vesselDropdownOpen = $state(false);
	let vesselSearch = $state('');

	let vessels = $state([]);
	let vesselLoading = $state(false);
	let vesselError = $state('');

	let permissionLoading = $state(true);
	let permissionMode = $state('selected');
	let permissions = $state([]);

	let pageStatusMap = $state({});	

	let mountedPages = $state({
		dashboard: true
	});

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
			permissions: ['view_voyage_planvessel']
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

	function normalizePermissions(permissionAccess = {}) {
		const rawPermissions = Array.isArray(permissionAccess?.permissions)
			? permissionAccess.permissions
			: Array.isArray(permissionAccess?.details)
				? permissionAccess.details
				: [];

		return rawPermissions
			.map((item) => {
				if (typeof item === 'string') return item;

				return (
					item?.key || item?.permissionKey || item?.name || item?.code || item?.permission || ''
				);
			})
			.filter(Boolean);
	}

	function hasPermission(permissionKeys = []) {
		if (permissionMode === 'all') return true;

		if (!Array.isArray(permissionKeys)) return false;
		if (!permissionKeys.length) return false;

		return permissionKeys.some((permissionKey) => permissions.includes(permissionKey));
	}

	function isPageAllowed(key) {
		const menu = vesselMenus.find((item) => item.key === key);
		if (!menu) return false;

		return hasPermission(menu.permissions);
	}

	let visibleVesselMenus = $derived(vesselMenus.filter((menu) => hasPermission(menu.permissions)));

	let activeLabel = $derived(
		permissionLoading
			? 'Loading...'
			: visibleVesselMenus.find((menu) => menu.key === $activeVesselMenu)?.label ||
					visibleVesselMenus[0]?.label ||
					'No Access'
	);

	let selectedVessel = $derived(
		$selectedVesselInfo?.vesselName || $selectedVesselInfo?.name || 'Select Vessel'
	);

	let latestStatusInterval = null;
	let latestStatusRequestId = 0;
	let todayDataReceivedRequestId = 0;
	let lastLatestStatusVesselId = $state(null);
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

	function normalizeStatusPageKey(rawStatus = {}) {
		const pageKey = rawStatus?.pageKey || rawStatus?.key;

		if (pageKey) return pageKey;

		const sourcePage = String(rawStatus?.sourcePage || '').toLowerCase();

		if (sourcePage.includes('daily')) return 'daily-report';
		if (sourcePage.includes('monthly')) return 'monthly-report';
		if (sourcePage.includes('periodical')) return 'periodical-report';
		if (sourcePage.includes('data log')) return 'data-log';
		if (sourcePage.includes('fuel')) return 'fuel-management';
		if (sourcePage.includes('dashboard')) return 'dashboard';
		if (sourcePage.includes('trace')) return 'trace';
		if (sourcePage.includes('voyage')) return 'voyage-plan';

		return $activeVesselMenu || 'dashboard';
	}

	let activePageStatus = $derived(pageStatusMap[$activeVesselMenu] || {});

	let status = $derived({
		dataReceived: todayDataReceived || activePageStatus?.dataReceived || '-',
		dataReceivedReceived: todayDataReceivedStats.received ?? '-',
		dataReceivedTotal: todayDataReceivedStats.total ?? 1440,
		queue: latestVesselStatus.queue ?? '-',
		sdcard: latestVesselStatus.sdcard ?? '-',
		sdCardAvailable: latestVesselStatus.sdCardAvailable ?? false,
		sdCardUsed: latestVesselStatus.sdCardUsed ?? '-',
		sdCardCapacity: latestVesselStatus.sdCardCapacity ?? '-',
		online: latestVesselStatus.online ?? false
	});

	function getVesselId(vessel) {
		return vessel?.vesselId || vessel?.id || vessel?.vessel_id || vessel?.dbId || null;
	}

	let filteredVessels = $derived(
		vessels.filter((vessel) => {
			const keyword = vesselSearch.trim().toLowerCase();
			if (!keyword) return true;

			return [
				vessel?.vesselName,
				vessel?.name,
				vessel?.companyName,
				vessel?.deviceName,
				vessel?.deviceId,
				getVesselId(vessel)
			]
				.filter(Boolean)
				.some((value) => String(value).toLowerCase().includes(keyword));
		})
	);

	function formatNumber(value) {
		const number = Number(value);

		if (!Number.isFinite(number)) return '-';

		return number.toLocaleString('en-US');
	}

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
		const used = Number(sdCardStats.sd_card_used);

		if (Number.isFinite(free) && Number.isFinite(total) && total > 0) {
			const percentageText = Number.isFinite(freePercentage)
				? ` (${freePercentage.toFixed(1)}%)`
				: '';

			return `${formatNumber(free)} of ${formatNumber(total)} MB Free${percentageText}`;
		}

		if (Number.isFinite(used) && Number.isFinite(total) && total > 0) {
			return `${formatNumber(used)} of ${formatNumber(total)} MB Used`;
		}

		if (Number.isFinite(freePercentage)) {
			return `${freePercentage.toFixed(1)}% Free`;
		}

		return 'Available';
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
		const data = response?.data || response || {};
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
			getVesselId($selectedVesselInfo);

		console.log('[VESSEL_PAGE][LATEST_STATUS][CALL]', {
			vesselId,
			effectiveVesselId,
			selectedVesselId: $selectedVesselId,
			selectedVesselInfo: $selectedVesselInfo
		});

		if (!effectiveVesselId) {
			console.warn('[VESSEL_PAGE][LATEST_STATUS][SKIP] vesselId is empty');

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

			console.log('[VESSEL_PAGE][LATEST_STATUS][RESPONSE]', response);

			if (requestId !== latestStatusRequestId) return;

			latestVesselStatus = normalizeLatestStatus(response);

			console.log('[VESSEL_PAGE][LATEST_STATUS][NORMALIZED]', latestVesselStatus);
		} catch (err) {
			console.error('[VESSEL_PAGE][LATEST_STATUS][ERROR]', err);

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
			getVesselId($selectedVesselInfo);

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

			console.log('[VESSEL_PAGE][TODAY_DATA_RECEIVED]', {
				vesselId: effectiveVesselId,
				date,
				dataReceived: todayDataReceived,
				stats
			});
		} catch (err) {
			console.error('[VESSEL_PAGE][TODAY_DATA_RECEIVED_ERROR]', err);

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
			getVesselId($selectedVesselInfo);

		console.log('[VESSEL_PAGE][LATEST_STATUS][START_POLLING]', effectiveVesselId);

		stopLatestStatusPolling();

		if (!effectiveVesselId) {
			console.warn('[VESSEL_PAGE][LATEST_STATUS][POLLING_SKIP] vesselId is empty');
			return;
		}

		loadLatestVesselStatus(effectiveVesselId);
		loadTodayDataReceivedStatus(effectiveVesselId);

		latestStatusInterval = setInterval(() => {
			loadLatestVesselStatus(effectiveVesselId);
			loadTodayDataReceivedStatus(effectiveVesselId);
		}, 30000);
	}

	function isPageActive(key) {
		return active && $activeVesselMenu === key;
	}

	function shouldMountPage(key) {
		return Boolean(mountedPages[key]);
	}

	$effect(() => {
		const rawStatus = $pageStatus;

		if (!rawStatus) return;

		const pageKey = normalizeStatusPageKey(rawStatus);

		if (!pageKey) return;

		const nextStatus = {
			dataReceived: rawStatus?.dataReceived ?? '-',
			sourcePage: rawStatus?.sourcePage ?? ''
		};

		const currentStatus = pageStatusMap[pageKey];

		if (
			currentStatus?.dataReceived === nextStatus.dataReceived &&
			currentStatus?.sourcePage === nextStatus.sourcePage
		) {
			return;
		}

		pageStatusMap[pageKey] = nextStatus;
	});

	$effect(() => {
		if (permissionLoading) return;

		if (!visibleVesselMenus.length) {
			if ($activeVesselMenu) {
				setActiveVesselMenu('');
			}
			return;
		}

		const activeMenuStillAllowed = visibleVesselMenus.some(
			(menu) => menu.key === $activeVesselMenu
		);

		if (!activeMenuStillAllowed) {
			setActiveVesselMenu(visibleVesselMenus[0].key);
		}
	});

	$effect(() => {
		const key = $activeVesselMenu;

		if (permissionLoading) return;
		if (!key) return;
		if (!isPageAllowed(key)) return;

		if (!mountedPages[key]) {
			mountedPages = {
				...mountedPages,
				[key]: true
			};
		}
	});

	$effect(() => {
		const vesselId = $selectedVesselId || getVesselId($selectedVesselInfo);

		if (!vesselId) return;
		if (String(vesselId) === String(lastLatestStatusVesselId)) return;

		lastLatestStatusVesselId = vesselId;
		startLatestStatusPolling(vesselId);
	});

	async function loadCurrentUserPermissions() {
		permissionLoading = true;

		try {
			const response = await apiRequest('/users/current-user', {
				method: 'GET'
			});

			const permissionAccess = response?.data?.permissionAccess || {};

			permissionMode = permissionAccess?.mode || 'selected';
			permissions = normalizePermissions(permissionAccess);

			console.log('[VESSEL_PAGE][CURRENT_USER_PERMISSION]', {
				mode: permissionMode,
				permissions
			});
		} catch (err) {
			console.error('[VESSEL_PAGE][CURRENT_USER_PERMISSION][ERROR]', err);

			permissionMode = 'selected';
			permissions = [];
		} finally {
			permissionLoading = false;
		}
	}

	async function loadVesselsFromApi() {
		vesselLoading = true;
		vesselError = '';

		try {
			console.log('[VESSEL_PAGE][LOAD_VESSELS][START]');

			const rows = await getFleetVesselsWithEngines();

			console.log('[VESSEL_PAGE][LOAD_VESSELS][RESULT]', rows);

			vessels = Array.isArray(rows) ? rows : [];

			const currentId = $selectedVesselId;

			if (currentId && vessels.length) {
				const found = vessels.find((item) => Number(getVesselId(item)) === Number(currentId));
				const selected = found || vessels[0];

				setSelectedVessel(selected);
				startLatestStatusPolling(getVesselId(selected));
			} else if (vessels.length) {
				const selected = vessels[0];

				setSelectedVessel(selected);
				startLatestStatusPolling(getVesselId(selected));
			}
		} catch (err) {
			console.error('[VESSEL_PAGE][LOAD_VESSELS][ERROR]', err);
			vesselError = err?.message || 'Failed to load vessels from the API.';
			vessels = [];
		} finally {
			vesselLoading = false;
		}
	}

	function selectVesselMenu(key) {
		if (!isPageAllowed(key)) return;

		setActiveVesselMenu(key);
		menuOpen = false;
	}

	function selectVessel(vessel) {
		setSelectedVessel(vessel);
		vesselDropdownOpen = false;
		vesselSearch = '';

		console.log('[VESSEL_PAGE][VESSEL_SELECTED]', vessel);

		startLatestStatusPolling(getVesselId(vessel));
	}

	onMount(() => {
		restoreSelectedVessel();

		setTimeout(() => {
			loadCurrentUserPermissions();
			loadVesselsFromApi();
		}, 150);
	});

	onDestroy(() => {
		stopLatestStatusPolling();
	});
</script>

<section class="vessel-shell">
	<header class="vessel-topbar">
		<div class="topbar-left">
			<div class="dropdown">
				<button type="button" class="dropdown-button" onclick={() => (menuOpen = !menuOpen)}>
					<span class="menu-icon" aria-hidden="true">▦</span>
					<span class="selector-copy">
						<small>Workspace</small>
						<strong>{activeLabel}</strong>
					</span>
					<span>▾</span>
				</button>

				{#if menuOpen}
					<div class="dropdown-menu">
						{#if permissionLoading}
							<div class="dropdown-empty"><LoadingSkeleton label="Loading menu" variant="list" rows={3} compact /></div>
						{:else if visibleVesselMenus.length}
							{#each visibleVesselMenus as menu}
								<button
									type="button"
									class="dropdown-item"
									class:active-item={$activeVesselMenu === menu.key}
									onclick={() => selectVesselMenu(menu.key)}
								>
									<span>{menu.label}</span>
									{#if $activeVesselMenu === menu.key}
										<span class="active-check">✓</span>
									{/if}
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
					SD Card
				</div>
				<div class="topbar-table-grid two-cols">
					<span>Used</span>
					<span>Capacity</span>
					<strong>{status.sdCardUsed}</strong>
					<strong>{status.sdCardCapacity}</strong>
				</div>
			</div>

			{#if false}
			<div class="topbar-item data-status">
				<span class="status-icon" aria-hidden="true">↙</span>
				<span class="status-copy">
					<small>Data received</small>
					<strong>{status.dataReceived}</strong>
				</span>
			</div>

			<div class="topbar-item">
				<span class="status-icon" aria-hidden="true">≡</span>
				<span class="status-copy">
					<small>Queue</small>
					<strong>{status.queue}</strong>
				</span>
			</div>

			<div class="topbar-item storage-status">
				<span class="status-icon" aria-hidden="true">▣</span>
				<span class="status-copy">
					<small>SD card</small>
					<strong>{status.sdcard}</strong>
				</span>
			</div>

			{/if}

			<div class="topbar-item online-box" class:offline-box={!status.online}>
				<span class="dot"></span>
				<span class="status-copy">
					<small>Connection</small>
					<strong>{status.online ? 'Online' : 'Offline'}</strong>
				</span>
			</div>
		</div>

		<div class="vessel-dropdown">
			<button
				type="button"
				class="vessel-selector"
				onclick={() => (vesselDropdownOpen = !vesselDropdownOpen)}
			>
				<span class="vessel-selector-icon" aria-hidden="true">⚓</span>
				<span class="selector-copy">
					<small>Active vessel</small>
					<strong>{selectedVessel}</strong>
				</span>
				<span>▾</span>
			</button>

			{#if vesselDropdownOpen}
				<div class="vessel-menu">
					{#if vesselLoading}
						<div class="vessel-state"><LoadingSkeleton label="Loading vessels" variant="list" rows={4} compact /></div>
					{:else if vesselError}
						<div class="vessel-state error">{vesselError}</div>
					{:else if vessels.length === 0}
						<div class="vessel-state">No vessels available</div>
					{:else}
						<div class="vessel-search-box">
							<input
								type="search"
								placeholder="Search vessel..."
								aria-label="Search vessel"
								bind:value={vesselSearch}
							/>
							{#if vesselSearch}
								<button
									type="button"
									class="vessel-search-clear"
									aria-label="Clear vessel search"
									onclick={() => (vesselSearch = '')}
								>
								</button>
							{/if}
						</div>

						{#if filteredVessels.length === 0}
							<div class="vessel-state">No vessel found.</div>
						{:else}
							{#each filteredVessels as vessel}
							<button
								type="button"
								class="vessel-item"
								class:active-vessel={Number($selectedVesselId) === Number(getVesselId(vessel))}
								onclick={() => selectVessel(vessel)}
							>
								<span class="vessel-item-icon" aria-hidden="true">⚓</span>
								<span class="vessel-item-copy">
									<strong>{vessel.vesselName || vessel.name}</strong>
									<small>{vessel.companyName || vessel.deviceName || 'Vessel monitoring'}</small>
								</span>
								{#if Number($selectedVesselId) === Number(getVesselId(vessel))}
									<span class="active-check">✓</span>
								{/if}
							</button>
							{/each}
						{/if}
					{/if}
				</div>
			{/if}
		</div>
	</header>

	<main class="vessel-content">
		{#if permissionLoading}
			<section class="vessel-page active-vessel-page">
				<div class="no-access-card">
					<LoadingSkeleton label="Loading vessel access" variant="card" rows={3} />
				</div>
			</section>
		{:else if !visibleVesselMenus.length}
			<section class="vessel-page active-vessel-page">
				<div class="no-access-card">
					<h2>No Menu Access</h2>
					<p>This user does not have permission to open the vessel page.</p>
				</div>
			</section>
		{:else}
			{#if shouldMountPage('dashboard') && isPageAllowed('dashboard')}
				<section class="vessel-page" class:active-vessel-page={isPageActive('dashboard')}>
					<VesselDashboardPage active={isPageActive('dashboard')} />
				</section>
			{/if}

			{#if shouldMountPage('daily-report') && isPageAllowed('daily-report')}
				<section class="vessel-page" class:active-vessel-page={isPageActive('daily-report')}>
					<DailyReportPage active={isPageActive('daily-report')} />
				</section>
			{/if}

			{#if shouldMountPage('monthly-report') && isPageAllowed('monthly-report')}
				<section class="vessel-page" class:active-vessel-page={isPageActive('monthly-report')}>
					<MonthlyReportPage active={isPageActive('monthly-report')} />
				</section>
			{/if}

			{#if shouldMountPage('periodical-report') && isPageAllowed('periodical-report')}
				<section class="vessel-page" class:active-vessel-page={isPageActive('periodical-report')}>
					<PeriodicalReportPage active={isPageActive('periodical-report')} />
				</section>
			{/if}

			{#if shouldMountPage('voyage-plan') && isPageAllowed('voyage-plan')}
				<section class="vessel-page" class:active-vessel-page={isPageActive('voyage-plan')}>
					<VoyagePlanPage active={isPageActive('voyage-plan')} />
				</section>
			{/if}

			{#if shouldMountPage('trace') && isPageAllowed('trace')}
				<section class="vessel-page" class:active-vessel-page={isPageActive('trace')}>
					<TracePage active={isPageActive('trace')} />
				</section>
			{/if}

			{#if shouldMountPage('data-log') && isPageAllowed('data-log')}
				<section class="vessel-page" class:active-vessel-page={isPageActive('data-log')}>
					<DataLogPage active={isPageActive('data-log')} />
				</section>
			{/if}

			{#if shouldMountPage('fuel-management') && isPageAllowed('fuel-management')}
				<section class="vessel-page" class:active-vessel-page={isPageActive('fuel-management')}>
					<FuelManagementPage active={isPageActive('fuel-management')} />
				</section>
			{/if}
		{/if}
	</main>
</section>

<style>
	.vessel-shell {
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--color-base);
	}

	.vessel-content {
		position: relative;
		flex: 1 1 auto;
		min-height: 0;
		min-width: 0;
		overflow: hidden;
		background: var(--color-base);
	}

	.vessel-page {
		position: absolute;
		inset: 0;
		z-index: 0;
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}

	.vessel-page.active-vessel-page {
		z-index: 10;
		opacity: 1;
		visibility: visible;
		pointer-events: auto;
	}

	.vessel-page :global(.dashboard-content),
	.vessel-page :global(.daily-report-page),
	.vessel-page :global(.monthly-report-page),
	.vessel-page :global(.periodical-page),
	.vessel-page :global(.page-content) {
		height: 100%;
		min-height: 0;
		overflow: auto;
		box-sizing: border-box;
	}

	.vessel-topbar {
		height: 58px;
		min-height: 58px;
		background: rgba(255, 255, 255, 0.06);
		border-bottom: 1px solid #bdbdbd;
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 13px;
		flex-shrink: 0;
		position: relative;
		z-index: 900;
	}

	.topbar-left {
		display: flex;
		align-items: center;
		height: 100%;
		min-width: 0;
	}

	.dropdown {
		position: relative;
		height: 100%;
	}

	.dropdown-button {
		height: 100%;
		min-width: 145px;
		padding: 0 12px;
		border: none;
		border-right: 1px solid #c4c4c4;
		background: rgba(255, 255, 255, 0.06);
		font-weight: 700;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		font-size: 13px;
	}

	.dropdown-button:hover {
		background: var(--color-elevated);
	}

	.arrow {
		font-size: 11px;
	}

	.dropdown-menu {
		position: absolute;
		top: 58px;
		left: 0;
		min-width: 210px;
		background: var(--color-surface);
		border: 1px solid #bdbdbd;
		box-shadow: 0 8px 18px rgba(0, 0, 0, 0.16);
		z-index: 999;
	}

	.dropdown-item {
		width: 100%;
		padding: 10px 14px;
		border: none;
		background: var(--color-surface);
		text-align: left;
		cursor: pointer;
		font-size: 13px;
	}

	.dropdown-item:hover {
		background: var(--color-elevated);
	}

	.active-item {
		background: var(--color-accent-muted);
		font-weight: 700;
	}

	.topbar-item {
		height: 100%;
		padding: 0 12px;
		display: flex;
		align-items: center;
		border-right: 1px solid #c4c4c4;
		white-space: nowrap;
		font-weight: 600;
	}

	.topbar-table {
		height: 52px;
		min-width: 210px;
		display: grid;
		grid-template-rows: 20px 1fr;
		margin-left: 8px;
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
		gap: 0;
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

	.online-box {
		gap: 6px;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #12b886;
		display: inline-block;
	}

	.offline-box .dot {
		background: #ef4444;
	}

	.vessel-dropdown {
		position: relative;
		height: 100%;
		flex-shrink: 0;
	}

	.vessel-selector {
		height: 100%;
		min-width: 120px;
		padding: 0 12px;
		border: none;
		border-left: 1px solid #bdbdbd;
		font-weight: 700;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		font-size: 13px;
	}

	.vessel-selector:hover {
		background: #d0d0d0;
	}

	.vessel-menu {
		position: absolute;
		top: 58px;
		right: 0;
		min-width: 150px;
		background: var(--color-surface);
		border: 1px solid #bdbdbd;
		box-shadow: 0 8px 18px rgba(0, 0, 0, 0.16);
		z-index: 999;
	}

	.vessel-item {
		width: 100%;
		padding: 10px 14px;
		border: none;
		background: var(--color-surface);
		text-align: left;
		cursor: pointer;
		font-size: 13px;
		font-weight: 600;
	}

	.vessel-item:hover {
		background: var(--color-elevated);
	}

	.active-vessel {
		background: var(--color-accent-muted);
		font-weight: 800;
	}

	.vessel-content {
		position: relative;
		flex: 1;
		min-height: 0;
		min-width: 0;
		overflow: hidden;
		background: var(--color-base);
	}

	.vessel-page {
		position: absolute;
		inset: 0;
		z-index: 0;
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
		overflow: hidden;
		min-width: 0;
		min-height: 0;
	}

	.vessel-page.active-vessel-page {
		z-index: 10;
		opacity: 1;
		visibility: visible;
		pointer-events: auto;
	}

	.dropdown-empty {
		padding: 10px 14px;
		font-size: 13px;
		font-weight: 600;
		color: #6b7280;
		background: var(--color-surface);
		white-space: nowrap;
	}

	.no-access-card {
		width: min(520px, calc(100% - 32px));
		margin: 48px auto;
		padding: 22px 24px;
		border: 1px solid #d1d5db;
		border-radius: 14px;
		background: var(--color-surface);
		box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
		color: var(--text-primary);
	}

	.no-access-card h2 {
		margin: 0 0 8px;
		font-size: 18px;
		font-weight: 800;
	}

	.no-access-card p {
		margin: 0;
		font-size: 13px;
		color: #6b7280;
		line-height: 1.5;
	}

	@media (max-width: 900px) {
		.vessel-topbar {
			overflow: visible;
		}

		.vessel-dropdown {
			position: relative;
			right: auto;
		}
	}

	@media (max-width: 760px) {
		.vessel-topbar,
		.topbar {
			height: 32px;
			min-height: 32px;
			display: flex;
			align-items: center;
			justify-content: space-between;
			background: rgba(255, 255, 255, 0.06);
			border-bottom: 1px solid #bdbdbd;
			overflow-x: auto;
			overflow-y: visible;
			scrollbar-width: thin;
		}

		.vessel-topbar::-webkit-scrollbar,
		.topbar::-webkit-scrollbar {
			height: 4px;
		}

		.vessel-topbar::-webkit-scrollbar-track,
		.topbar::-webkit-scrollbar-track {
			background: var(--color-elevated);
		}

		.vessel-topbar::-webkit-scrollbar-thumb,
		.topbar::-webkit-scrollbar-thumb {
			background: #9ca3af;
			border-radius: 999px;
		}

		.topbar-left {
			display: flex;
			align-items: center;
			height: 100%;
			min-width: max-content;
			flex: 0 0 auto;
		}

		.dropdown {
			height: 100%;
			position: relative;
			flex: 0 0 auto;
		}

		.dropdown-button {
			height: 100%;
			min-width: 116px;
			max-width: 132px;
			padding: 0 9px;
			border: none;
			border-right: 1px solid #c4c4c4;
			background: rgba(255, 255, 255, 0.06);
			color: var(--text-primary);
			font-size: 11px;
			font-weight: 800;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 7px;
			cursor: pointer;
		}

		.dropdown-button span:first-child {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.dropdown-button:hover {
			background: var(--color-elevated);
		}

		.arrow {
			font-size: 9px;
			flex-shrink: 0;
		}

		.topbar-item {
			height: 100%;
			padding: 0 10px;
			border-right: 1px solid #c4c4c4;
			display: flex;
			align-items: center;
			background: rgba(255, 255, 255, 0.06);
			color: var(--text-primary);
			font-size: 11px;
			font-weight: 700;
			white-space: nowrap;
			flex: 0 0 auto;
		}

		.online-box {
			gap: 6px;
		}

		.dot {
			width: 7px;
			height: 7px;
			border-radius: 50%;
			background: #12b886;
			display: inline-block;
			flex-shrink: 0;
		}

		.offline-box .dot {
			background: #ef4444;
		}

		.vessel-dropdown {
			height: 100%;
			position: sticky;
			right: 0;
			flex: 0 0 auto;
			z-index: 950;
		}

		.vessel-selector {
			height: 100%;
			min-width: 104px;
			padding: 0 10px;
			border: none;
			border-left: 1px solid #bdbdbd;
			background: #d9d9d9;
			color: var(--text-primary);
			font-size: 11px;
			font-weight: 800;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
			cursor: pointer;
		}

		.vessel-selector span:first-child {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.vessel-selector:hover {
			background: #cfcfcf;
		}

		.dropdown-menu {
			position: fixed;
			top: 32px;
			left: 52px;
			min-width: 170px;
			max-width: calc(100vw - 16px);
			background: var(--color-surface);
			border: 1px solid #bdbdbd;
			border-radius: 0 0 8px 8px;
			box-shadow: 0 8px 18px rgba(0, 0, 0, 0.16);
			overflow: hidden;
			z-index: 3000;
		}

		.dropdown-item {
			width: 100%;
			padding: 9px 12px;
			border: none;
			background: var(--color-surface);
			text-align: left;
			cursor: pointer;
			font-size: 11px;
			font-weight: 700;
		}

		.dropdown-item:hover {
			background: var(--color-elevated);
		}

		.active-item {
			background: var(--color-accent-muted);
			font-weight: 800;
		}

		.vessel-menu {
			position: fixed;
			top: 32px;
			right: 4px;
			min-width: 132px;
			max-width: calc(100vw - 16px);
			background: var(--color-surface);
			border: 1px solid #bdbdbd;
			border-radius: 0 0 8px 8px;
			box-shadow: 0 8px 18px rgba(0, 0, 0, 0.16);
			overflow: hidden;
			z-index: 3000;
		}

		.vessel-item {
			width: 100%;
			padding: 9px 12px;
			border: none;
			background: var(--color-surface);
			text-align: left;
			cursor: pointer;
			font-size: 11px;
			font-weight: 700;
		}

		.vessel-item:hover {
			background: var(--color-elevated);
		}

		.active-vessel {
			background: var(--color-accent-muted);
			font-weight: 800;
		}
	}

	/* Vessel workspace navigation */
	.vessel-topbar {
		height: 58px;
		min-height: 58px;
		padding: 0 10px;
		gap: 8px;
		background: rgba(10, 14, 26, 0.96);
		border-bottom: 1px solid var(--color-border);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
		backdrop-filter: blur(18px) saturate(1.25);
	}

	.topbar-left {
		flex: 1 1 auto;
		gap: 6px;
		overflow: visible;
	}

	.dropdown {
		z-index: 20;
	}

	.dropdown,
	.vessel-dropdown {
		height: auto;
		flex: 0 0 auto;
	}

	.dropdown-button,
	.vessel-selector {
		height: 42px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.04);
		color: var(--text-primary);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
		transition:
			border-color 120ms ease,
			background 120ms ease,
			transform 120ms ease;
	}

	.dropdown-button {
		min-width: 180px;
		padding: 0 11px;
		border-color: rgba(59, 130, 246, 0.24);
		background: rgba(59, 130, 246, 0.09);
	}

	.dropdown-button:hover,
	.vessel-selector:hover {
		border-color: rgba(59, 130, 246, 0.4);
		background: rgba(59, 130, 246, 0.14);
		transform: translateY(-1px);
	}

	.menu-icon,
	.vessel-selector-icon,
	.status-icon {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		color: #60a5fa;
	}

	.menu-icon,
	.vessel-selector-icon {
		width: 26px;
		height: 26px;
		border-radius: 8px;
		background: rgba(59, 130, 246, 0.13);
		font-size: 13px;
	}

	.selector-copy,
	.status-copy,
	.vessel-item-copy {
		min-width: 0;
		display: grid;
		text-align: left;
	}

	.selector-copy {
		flex: 1 1 auto;
		gap: 1px;
	}

	.selector-copy small,
	.status-copy small {
		color: var(--text-muted);
		font-size: 8px;
		font-weight: 900;
		letter-spacing: 0.08em;
		line-height: 1.1;
		text-transform: uppercase;
	}

	.selector-copy strong {
		overflow: hidden;
		color: var(--text-primary);
		font-size: 11px;
		font-weight: 900;
		line-height: 1.25;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.arrow {
		flex: 0 0 auto;
		color: var(--text-secondary);
		font-size: 0;
	}

	.arrow::before {
		content: '⌄';
		font-size: 12px;
	}

	.topbar-item {
		height: 42px;
		min-width: 78px;
		padding: 0 10px;
		gap: 7px;
		border: 1px solid rgba(255, 255, 255, 0.065);
		border-radius: 11px;
		background: rgba(255, 255, 255, 0.028);
		color: var(--text-secondary);
	}

	.topbar-item.data-status {
		min-width: 145px;
	}

	.topbar-item.storage-status {
		min-width: 190px;
	}

	.status-icon {
		width: 21px;
		height: 21px;
		border-radius: 7px;
		background: rgba(255, 255, 255, 0.045);
		font-size: 11px;
	}

	.status-copy {
		gap: 2px;
	}

	.status-copy strong {
		overflow: hidden;
		color: var(--text-primary);
		font-size: 10px;
		font-weight: 800;
		line-height: 1.15;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.online-box {
		min-width: 96px;
		border-color: rgba(16, 185, 129, 0.18);
		background: rgba(16, 185, 129, 0.08);
		color: #34d399;
	}

	.online-box .status-copy strong {
		color: #34d399;
	}

	.offline-box {
		border-color: rgba(239, 68, 68, 0.18);
		background: rgba(239, 68, 68, 0.08);
	}

	.offline-box .status-copy strong {
		color: #f87171;
	}

	.dot {
		width: 8px;
		height: 8px;
		box-shadow: 0 0 10px rgba(16, 185, 129, 0.65);
		animation: vesselStatusPulse 1.8s ease-in-out infinite;
	}

	.offline-box .dot {
		box-shadow: 0 0 10px rgba(239, 68, 68, 0.4);
	}

	.vessel-selector {
		width: 210px;
		min-width: 210px;
		padding: 0 10px;
		border-left: 1px solid rgba(255, 255, 255, 0.08);
	}

	.dropdown-menu,
	.vessel-menu {
		top: calc(100% + 8px);
		padding: 6px;
		border: 1px solid rgba(255, 255, 255, 0.09);
		border-radius: 13px;
		background: rgba(17, 24, 39, 0.98);
		box-shadow: 0 18px 48px rgba(0, 0, 0, 0.48);
		backdrop-filter: blur(18px);
		animation: vesselMenuIn 150ms ease;
		z-index: 3200;
	}

	.dropdown-menu {
		min-width: 220px;
	}

	.vessel-menu {
		width: 280px;
		max-height: min(420px, calc(100vh - 90px));
		overflow-y: auto;
	}

	.vessel-search-box {
		position: sticky;
		top: 0;
		z-index: 2;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 7px;
		margin-bottom: 6px;
		padding: 6px;
		border-radius: 10px;
		background: rgba(10, 15, 28, 0.96);
		border: 1px solid rgba(148, 163, 184, 0.14);
		box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
	}

	.vessel-search-box input {
		width: 100%;
		min-width: 0;
		height: 34px;
		padding: 0 10px;
		border: 1px solid rgba(148, 163, 184, 0.16);
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.96);
		color: var(--text-primary);
		font-size: 11px;
		font-weight: 600;
		outline: none;
	}

	.vessel-search-box input::placeholder {
		color: rgba(148, 163, 184, 0.78);
	}

	.vessel-search-box input:focus {
		border-color: rgba(59, 130, 246, 0.58);
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.14);
	}

	.vessel-search-clear {
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		border: 1px solid rgba(148, 163, 184, 0.16);
		border-radius: 8px;
		background: rgba(30, 41, 59, 0.9);
		color: var(--text-secondary);
		font-size: 0;
		font-weight: 800;
		line-height: 1;
		transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
	}

	.vessel-search-clear::before {
		content: 'X';
		font-size: 11px;
	}

	.vessel-search-clear:hover {
		border-color: rgba(96, 165, 250, 0.36);
		background: rgba(37, 99, 235, 0.18);
		color: #dbeafe;
	}

	.dropdown-item,
	.vessel-item {
		min-height: 40px;
		padding: 8px 10px;
		border: 1px solid transparent;
		border-radius: 9px;
		background: transparent;
		color: var(--text-secondary);
		transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		font-size: 11px;
		font-weight: 800;
	}

	.vessel-item {
		display: grid;
		grid-template-columns: 30px minmax(0, 1fr) auto;
		align-items: center;
		gap: 9px;
	}

	.dropdown-item:hover,
	.vessel-item:hover {
		border-color: rgba(255, 255, 255, 0.06);
		background: rgba(255, 255, 255, 0.05);
		color: var(--text-primary);
	}

	.dropdown-item.active-item,
	.vessel-item.active-vessel {
		border-color: rgba(59, 130, 246, 0.18);
		background: var(--color-accent-muted);
		color: var(--text-accent);
	}

	.vessel-item-icon {
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border-radius: 9px;
		background: rgba(59, 130, 246, 0.1);
		color: #60a5fa;
		font-size: 13px;
	}

	.vessel-item-copy {
		gap: 2px;
	}

	.vessel-item-copy strong {
		overflow: hidden;
		color: var(--text-primary);
		font-size: 11px;
		font-weight: 900;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vessel-item-copy small {
		overflow: hidden;
		color: var(--text-secondary);
		font-size: 8px;
		font-weight: 700;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.active-check {
		color: #60a5fa;
		font-size: 11px;
		font-weight: 900;
	}

	.vessel-state,
	.dropdown-empty {
		padding: 12px;
		border-radius: 9px;
		background: rgba(255, 255, 255, 0.025);
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 700;
	}

	.vessel-state.error {
		background: var(--color-danger-muted);
		color: #fca5a5;
	}

	@keyframes vesselMenuIn {
		from {
			opacity: 0;
			transform: translateY(-5px) scale(0.985);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	@keyframes vesselStatusPulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.62; transform: scale(0.86); }
	}

	@media (max-width: 1180px) {
		.topbar-item.storage-status {
			max-width: 160px;
			min-width: 150px;
		}

		.vessel-selector {
			width: 185px;
			min-width: 185px;
		}
	}

	@media (max-width: 900px) {
		.vessel-topbar {
			height: 54px;
			min-height: 54px;
			overflow-x: auto;
			overflow-y: hidden;
			scrollbar-width: none;
		}

		.vessel-topbar::-webkit-scrollbar {
			display: none;
		}

		.topbar-left {
			min-width: max-content;
			overflow: visible;
		}

		.dropdown-button,
		.vessel-selector,
		.topbar-item {
			height: 38px;
		}

		.dropdown-button {
			min-width: 150px;
		}

		.topbar-item.data-status {
			min-width: 126px;
		}

		.topbar-item.storage-status {
			min-width: 145px;
		}

		.vessel-dropdown {
			position: sticky;
			right: 0;
			padding-left: 5px;
			background: linear-gradient(90deg, transparent, rgba(10, 14, 26, 0.98) 16%);
		}

		.vessel-selector {
			width: 165px;
			min-width: 165px;
		}

		.dropdown-menu,
		.vessel-menu {
			position: fixed;
			top: 58px;
		}

		.dropdown-menu {
			left: 70px;
		}

		.vessel-menu {
			right: 8px;
			width: min(280px, calc(100vw - 16px));
		}
	}

	@media (max-width: 560px) {
		.vessel-topbar {
			height: 50px;
			min-height: 50px;
			padding-inline: 6px;
		}

		.dropdown-button,
		.vessel-selector,
		.topbar-item {
			height: 36px;
		}

		.dropdown-button {
			min-width: 132px;
			max-width: 132px;
		}

		.menu-icon,
		.vessel-selector-icon,
		.status-icon {
			display: none;
		}

		.selector-copy small,
		.status-copy small {
			display: none;
		}

		.topbar-item {
			min-width: auto;
			padding-inline: 9px;
		}

		.topbar-item.data-status,
		.topbar-item.storage-status {
			min-width: auto;
			max-width: 145px;
		}

		.online-box {
			min-width: auto;
		}

		.vessel-selector {
			width: 128px;
			min-width: 128px;
		}

		.dropdown-menu,
		.vessel-menu {
			top: 54px;
		}
	}
</style>
