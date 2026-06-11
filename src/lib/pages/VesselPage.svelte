<script>
	import { onMount } from 'svelte';
	import { activeVesselMenu, setActiveVesselMenu } from '$lib/stores/vesselNavigation.svelte.js';

	import VesselDashboardPage from '$lib/pages/vessel/VesselDashboardPage.svelte';
	import DailyReportPage from '$lib/pages/vessel/DailyReportPage.svelte';
	import MonthlyReportPage from '$lib/pages/vessel/MonthlyReportPage.svelte';
	import PeriodicalReportPage from '$lib/pages/vessel/PeriodicalReportPage.svelte';
	import VoyagePlanPage from '$lib/pages/vessel/VoyagePlanPage.svelte';
	import TracePage from '$lib/pages/vessel/TracePage.svelte';
	import DataLogPage from '$lib/pages/vessel/DataLogPage.svelte';

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

	let mountedPages = $state({
		dashboard: true
	});

	const vesselMenus = [
		{ label: 'Dashboard', key: 'dashboard' },
		{ label: 'Daily Report', key: 'daily-report' },
		{ label: 'Monthly Report', key: 'monthly-report' },
		{ label: 'Periodical Report', key: 'periodical-report' },
		{ label: 'Voyage Plan', key: 'voyage-plan' },
		{ label: 'Trace', key: 'trace' },
		{ label: 'Data Log', key: 'datalog' }
	];

	let activeLabel = $derived(
		vesselMenus.find((menu) => menu.key === $activeVesselMenu)?.label || 'Dashboard'
	);

	let selectedVessel = $derived(
		$selectedVesselInfo?.vesselName || $selectedVesselInfo?.name || 'Select Vessel'
	);

	let status = $derived($pageStatus);

	function isPageActive(key) {
		return $activeVesselMenu === key;
	}

	function shouldMountPage(key) {
		return Boolean(mountedPages[key]);
	}

	$effect(() => {
		const key = $activeVesselMenu;

		if (!key) return;

		if (!mountedPages[key]) {
			mountedPages = {
				...mountedPages,
				[key]: true
			};
		}
	});

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
				const found = vessels.find((item) => Number(item.vesselId) === Number(currentId));

				if (found) {
					setSelectedVessel(found);
				}
			} else if (vessels.length) {
				setSelectedVessel(vessels[0]);
			}
		} catch (err) {
			console.error('[VESSEL_PAGE][LOAD_VESSELS][ERROR]', err);
			vesselError = err?.message || 'Gagal memuat vessel dari API.';
			vessels = [];
		} finally {
			vesselLoading = false;
		}
	}

	function selectVesselMenu(key) {
		setActiveVesselMenu(key);
		menuOpen = false;
	}

	function selectVessel(vessel) {
		setSelectedVessel(vessel);
		vesselDropdownOpen = false;

		console.log('[VESSEL_PAGE][VESSEL_SELECTED]', vessel);
	}

	onMount(() => {
		restoreSelectedVessel();

		setTimeout(() => {
			loadVesselsFromApi();
		}, 150);
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
						{#each vesselMenus as menu}
							<button
								type="button"
								class="dropdown-item"
								class:active-item={$activeVesselMenu === menu.key}
								onclick={() => selectVesselMenu(menu.key)}
							>
								{menu.label}
							</button>
						{/each}
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

			<div class="topbar-item online-box">
				<span class="dot"></span>
				Online
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
						<div class="vessel-state">No vessel available</div>
					{:else}
						{#each vessels as vessel}
							<button
								type="button"
								class="vessel-item"
								class:active-vessel={Number($selectedVesselId) === Number(vessel.vesselId)}
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
		{#if shouldMountPage('dashboard')}
			<section class="vessel-page" class:active-vessel-page={isPageActive('dashboard')}>
				<VesselDashboardPage active={isPageActive('dashboard')} />
			</section>
		{/if}

		{#if shouldMountPage('daily-report')}
			<section class="vessel-page" class:active-vessel-page={isPageActive('daily-report')}>
				<DailyReportPage active={isPageActive('daily-report')} />
			</section>
		{/if}

		{#if shouldMountPage('monthly-report')}
			<section class="vessel-page" class:active-vessel-page={isPageActive('monthly-report')}>
				<MonthlyReportPage active={isPageActive('monthly-report')} />
			</section>
		{/if}

		{#if shouldMountPage('periodical-report')}
			<section class="vessel-page" class:active-vessel-page={isPageActive('periodical-report')}>
				<PeriodicalReportPage active={isPageActive('periodical-report')} />
			</section>
		{/if}

		{#if shouldMountPage('voyage-plan')}
			<section class="vessel-page" class:active-vessel-page={isPageActive('voyage-plan')}>
				<VoyagePlanPage active={isPageActive('voyage-plan')} />
			</section>
		{/if}

		{#if shouldMountPage('trace')}
			<section class="vessel-page" class:active-vessel-page={isPageActive('trace')}>
				<TracePage active={isPageActive('trace')} />
			</section>
		{/if}

		{#if shouldMountPage('datalog')}
			<section class="vessel-page" class:active-vessel-page={isPageActive('datalog')}>
				<DataLogPage active={isPageActive('datalog')} />
			</section>
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
