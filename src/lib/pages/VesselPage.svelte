<script>
	import { onMount, onDestroy } from 'svelte';
	import { activeVesselMenu, setActiveVesselMenu } from '$lib/stores/vesselNavigation.svelte.js';
	import { apiRequest } from '$lib/api/authApi.js';

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

	let menuOpen = $state(false);
	let vesselDropdownOpen = $state(false);

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
	let lastLatestStatusVesselId = $state(null);

	let latestVesselStatus = $state({
		queue: '-',
		sdcard: '-',
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
		dataReceived: activePageStatus?.dataReceived ?? '-',
		queue: latestVesselStatus.queue ?? '-',
		sdcard: latestVesselStatus.sdcard ?? '-',
		online: latestVesselStatus.online ?? false
	});

	function getVesselId(vessel) {
		return vessel?.vesselId || vessel?.id || vessel?.vessel_id || vessel?.dbId || null;
	}

	function formatNumber(value) {
		const number = Number(value);

		if (!Number.isFinite(number)) return '-';

		return number.toLocaleString('en-US');
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

	function normalizeLatestStatus(response) {
		const data = response?.data || response || {};

		return {
			queue: data.queue ?? '-',
			sdcard: formatSdCardStatus(data.sd_card_stats),
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
				online: false
			};
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

		latestStatusInterval = setInterval(() => {
			loadLatestVesselStatus(effectiveVesselId);
		}, 30000);
	}

	function isPageActive(key) {
		return $activeVesselMenu === key;
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
					<span>{activeLabel}</span>
					<span class="arrow">▾</span>
				</button>

				{#if menuOpen}
					<div class="dropdown-menu">
						{#if permissionLoading}
							<div class="dropdown-empty">Loading menu...</div>
						{:else if visibleVesselMenus.length}
							{#each visibleVesselMenus as menu}
								<button
									type="button"
									class="dropdown-item"
									class:active-item={$activeVesselMenu === menu.key}
									onclick={() => selectVesselMenu(menu.key)}
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

			<div class="topbar-item">
				Data Received : {status.dataReceived}
			</div>

			<div class="topbar-item">
				Queue : {status.queue}
			</div>

			<div class="topbar-item">
				SD Card : {status.sdcard}
			</div>

			<div class="topbar-item online-box" class:offline-box={!status.online}>
				<span class="dot"></span>
				{status.online ? 'Online' : 'Offline'}
			</div>
		</div>

		<div class="vessel-dropdown">
			<button
				type="button"
				class="vessel-selector"
				onclick={() => (vesselDropdownOpen = !vesselDropdownOpen)}
			>
				<span>{selectedVessel}</span>
				<span class="arrow">▾</span>
			</button>

			{#if vesselDropdownOpen}
				<div class="vessel-menu">
					{#if vesselLoading}
						<div class="vessel-state">Loading vessels...</div>
					{:else if vesselError}
						<div class="vessel-state error">{vesselError}</div>
					{:else if vessels.length === 0}
						<div class="vessel-state">No vessels available</div>
					{:else}
						{#each vessels as vessel}
							<button
								type="button"
								class="vessel-item"
								class:active-vessel={Number($selectedVesselId) === Number(getVesselId(vessel))}
								onclick={() => selectVessel(vessel)}
							>
								{vessel.vesselName || vessel.name}
							</button>
						{/each}
					{/if}
				</div>
			{/if}
		</div>
	</header>

	<main class="vessel-content">
		{#if permissionLoading}
			<section class="vessel-page active-vessel-page">
				<div class="no-access-card">
					<h2>Loading access...</h2>
					<p>Loading user permissions.</p>
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
		background: #f4f6f8;
	}

	.vessel-content {
		position: relative;
		flex: 1 1 auto;
		min-height: 0;
		min-width: 0;
		overflow: hidden;
		background: #f4f6f8;
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
		height: 36px;
		min-height: 36px;
		background: #eeeeee;
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
		background: #eeeeee;
		font-weight: 700;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		font-size: 13px;
	}

	.dropdown-button:hover {
		background: #e0e0e0;
	}

	.arrow {
		font-size: 11px;
	}

	.dropdown-menu {
		position: absolute;
		top: 36px;
		left: 0;
		min-width: 210px;
		background: white;
		border: 1px solid #bdbdbd;
		box-shadow: 0 8px 18px rgba(0, 0, 0, 0.16);
		z-index: 999;
	}

	.dropdown-item {
		width: 100%;
		padding: 10px 14px;
		border: none;
		background: white;
		text-align: left;
		cursor: pointer;
		font-size: 13px;
	}

	.dropdown-item:hover {
		background: #f1f1f1;
	}

	.active-item {
		background: #e7efff;
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
		background: #d9d9d9;
		font-weight: 700;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		font-size: 13px;
	}

	.vessel-selector:hover {
		background: #cfcfcf;
	}

	.vessel-menu {
		position: absolute;
		top: 36px;
		right: 0;
		min-width: 150px;
		background: white;
		border: 1px solid #bdbdbd;
		box-shadow: 0 8px 18px rgba(0, 0, 0, 0.16);
		z-index: 999;
	}

	.vessel-item {
		width: 100%;
		padding: 10px 14px;
		border: none;
		background: white;
		text-align: left;
		cursor: pointer;
		font-size: 13px;
		font-weight: 600;
	}

	.vessel-item:hover {
		background: #f1f1f1;
	}

	.active-vessel {
		background: #e7efff;
		font-weight: 800;
	}

	.vessel-content {
		position: relative;
		flex: 1;
		min-height: 0;
		min-width: 0;
		overflow: hidden;
		background: #f4f6f8;
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
		background: #ffffff;
		white-space: nowrap;
	}

	.no-access-card {
		width: min(520px, calc(100% - 32px));
		margin: 48px auto;
		padding: 22px 24px;
		border: 1px solid #d1d5db;
		border-radius: 14px;
		background: #ffffff;
		box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
		color: #111827;
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
			background: #eeeeee;
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
			background: #e5e7eb;
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
			background: #eeeeee;
			color: #000000;
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
			background: #e0e0e0;
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
			background: #eeeeee;
			color: #000000;
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
			color: #000000;
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
			background: #ffffff;
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
			background: #ffffff;
			text-align: left;
			cursor: pointer;
			font-size: 11px;
			font-weight: 700;
		}

		.dropdown-item:hover {
			background: #f1f1f1;
		}

		.active-item {
			background: #e7efff;
			font-weight: 800;
		}

		.vessel-menu {
			position: fixed;
			top: 32px;
			right: 4px;
			min-width: 132px;
			max-width: calc(100vw - 16px);
			background: #ffffff;
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
			background: #ffffff;
			text-align: left;
			cursor: pointer;
			font-size: 11px;
			font-weight: 700;
		}

		.vessel-item:hover {
			background: #f1f1f1;
		}

		.active-vessel {
			background: #e7efff;
			font-weight: 800;
		}
	}
</style>
