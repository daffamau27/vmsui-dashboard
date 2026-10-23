<script>
	import { onMount, onDestroy, tick } from 'svelte';
	import { activeVesselMenu, setActiveVesselMenu } from '$lib/stores/vesselNavigation.svelte.js';
	import { apiRequest } from '$lib/api/authApi.js';
	import { updateVesselHireStatusAdminApi as updateVesselHireStatusApi } from '$lib/api/administratorApi.js';
	import HireHistoryModal from '$lib/components/HireHistoryModal.svelte';
	import { sortByAlpha } from '$lib/utils/alphaSort.js';
	import VesselTopbar from './VesselTopbar.svelte';
	import VesselHireStatusModal from './VesselHireStatusModal.svelte';
	import './vessel-page.css';

	import VesselDashboardPage from '$lib/pages/vessel/vessel-dashboard/VesselDashboardPage.svelte';
	import DailyReportPage from '$lib/pages/vessel/daily-report/DailyReportPage.svelte';
	import MonthlyReportPage from '$lib/pages/vessel/monthly-report/MonthlyReportPage.svelte';
	import PeriodicalReportPage from '$lib/pages/vessel/periodical-report/PeriodicalReportPage.svelte';
	import VoyagePlanPage from '$lib/pages/vessel/voyage-plan/VoyagePlanPage.svelte';
	import TracePage from '$lib/pages/vessel/trace/TracePage.svelte';
	import DataLogPage from '$lib/pages/vessel/data-log/DataLogPage.svelte';
	import FuelManagementPage from '$lib/pages/vessel/fuel-management/FuelManagementPage.svelte';
	import SingleLineDiagramPage from '$lib/pages/vessel/single-line-diagram/SingleLineDiagramPage.svelte';

	import { getMyVesselsApi } from '$lib/api/authApi.js';
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
	let focusedVesselIndex = $state(-1);
	let vesselMenuElement = $state(null);
	let vesselSearchInputElement = $state(null);

	let vessels = $state([]);
	let vesselLoading = $state(false);
	let vesselError = $state('');
	let hireStatusLoading = $state(false);
	let hireStatusError = $state('');
	let hireStatusModalOpen = $state(false);
	let hireStatusTarget = $state(null);
	let hireHistoryModalOpen = $state(false);
	let hireStatusForm = $state({
		effectiveAt: '',
		reason: '',
		note: ''
	});

	let permissionLoading = $state(true);
	let permissionMode = $state('selected');
	let permissions = $state([]);

	let pageStatusMap = $state({});

	let mountedPages = $state({});

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
		},
		{
			label: 'Single Line Diagram',
			key: 'single-line-diagram',
			permissions: ['access_single_line']
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

	let selectedVesselRecord = $derived(
		vessels.find(
			(vessel) =>
				Number(getVesselId(vessel)) ===
				Number($selectedVesselId || getVesselId($selectedVesselInfo))
		) ||
			$selectedVesselInfo ||
			null
	);

	let latestVesselStatus = $state({
		queue: '-',
		sdcard: '-',
		sdCardAvailable: false,
		sdCardUsed: '-',
		sdCardCapacity: '-',
		online: false,
		hireStatus: null,
		hireUpcoming: null,
		hireUpcomingLabel: 'Upcoming',
		hireChangedBy: '-'
	});

	let selectedHireStatusKnown = $derived(typeof latestVesselStatus.hireStatus === 'boolean');
	let selectedHireIsOn = $derived(latestVesselStatus.hireStatus === true);
	let selectedHireLabel = $derived(
		selectedHireStatusKnown ? (selectedHireIsOn ? 'On Hire' : 'Off Hire') : '-'
	);
	let nextHireStatus = $derived(!selectedHireIsOn);
	let nextHireStatusLabel = $derived(nextHireStatus ? 'On Hire' : 'Off Hire');
	let hireReasonOptions = $derived(
		(hireStatusTarget ?? nextHireStatus)
			? ['New Contract', 'After Docking', 'After Breakdown', 'As Replacement']
			: ['End of Contract', 'Breakdown', 'Docking', 'Replaced']
	);
	let canManageHireStatus = $derived(hasPermission(['manage_hire_status']));
	let hireStatusToggleTitle = $derived(
		permissionLoading
			? 'Loading hire status permission...'
			: !canManageHireStatus
				? 'Requires manage_hire_status permission'
				: hireStatusError ||
					(selectedHireStatusKnown ? `Change to ${nextHireStatusLabel}` : 'Hire status unavailable')
	);

	let vesselPageKey = $derived(
		String($selectedVesselId || getVesselId($selectedVesselInfo) || 'no-vessel')
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

	function getVesselHireRawValue(vessel = {}) {
		const source = vessel?.vessel || vessel?.raw?.vessel || vessel;

		return (
			source?.hireStatus ??
			source?.hire_status ??
			source?.onHire ??
			source?.on_hire ??
			source?.isOnHire ??
			source?.is_on_hire ??
			vessel?.hireStatus ??
			vessel?.hire_status ??
			vessel?.onHire ??
			vessel?.on_hire ??
			vessel?.isOnHire ??
			vessel?.is_on_hire ??
			vessel?.raw?.hireStatus ??
			vessel?.raw?.hire_status ??
			vessel?.raw?.onHire ??
			vessel?.raw?.on_hire ??
			false
		);
	}

	function isOnHireStatus(value) {
		if (typeof value === 'boolean') return value;
		if (typeof value === 'number') return value === 1;

		const normalized = String(value ?? '')
			.trim()
			.toLowerCase()
			.replace(/[_-]+/g, ' ');

		return ['true', '1', 'on', 'on hire', 'onhire', 'active'].includes(normalized);
	}

	function formatHireStatusValue(value) {
		return isOnHireStatus(value) ? 'On Hire' : 'Off Hire';
	}

	function normalizeVesselForSelector(item = {}) {
		const source = item?.vessel || item?.raw?.vessel || item;
		const vesselId =
			source?.id ??
			source?.vesselId ??
			source?.vessel_id ??
			item?.id ??
			item?.vesselId ??
			item?.vessel_id ??
			item?.dbId ??
			null;

		const vesselName =
			source?.vesselName ||
			source?.vessel_name ||
			source?.name ||
			source?.deviceName ||
			item?.vesselName ||
			item?.vessel_name ||
			item?.name ||
			item?.deviceName ||
			(vesselId ? `Vessel ${vesselId}` : 'Vessel');

		const companyName =
			source?.companyName ||
			source?.company_name ||
			source?.company?.name ||
			source?.company?.companyName ||
			item?.companyName ||
			item?.company_name ||
			item?.company?.name ||
			item?.company?.companyName ||
			'-';
		const hireStatus = formatHireStatusValue(getVesselHireRawValue({ ...item, ...source }));

		return {
			...item,
			...source,
			id: vesselId,
			vesselId,
			dbId: vesselId,
			name: vesselName,
			vesselName,
			deviceName: source?.deviceName || item?.deviceName || vesselName,
			deviceId: source?.deviceId || source?.device_id || item?.deviceId || item?.device_id || '',
			companyName,
			hireStatus,
			hire_status: hireStatus,
			timezone:
				source?.timezone || item?.timezone || item?.timezoneOffset || item?.timezone_offset || '',
			engines: Array.isArray(source?.engines)
				? source.engines
				: Array.isArray(item?.engines)
					? item.engines
					: [],
			raw: item
		};
	}

	function extractVesselsFromResponse(response) {
		const data = response?.data ?? response;
		const candidates = [
			data,
			data?.items,
			data?.vessels,
			data?.data,
			data?.data?.items,
			data?.data?.vessels
		];

		const rows = candidates.find((candidate) => Array.isArray(candidate)) || [];

		return sortByAlpha(
			rows.map(normalizeVesselForSelector).filter((vessel) => getVesselId(vessel)),
			getVesselDisplayName,
			getVesselCompanyName
		);
	}

	function getVesselDisplayName(vessel) {
		return (
			vessel?.vesselName ||
			vessel?.vessel_name ||
			vessel?.name ||
			vessel?.deviceName ||
			vessel?.raw?.vesselName ||
			vessel?.raw?.vessel_name ||
			vessel?.raw?.vessel?.vesselName ||
			vessel?.raw?.vessel?.vessel_name ||
			''
		);
	}

	function getVesselCompanyName(vessel) {
		return (
			vessel?.companyName ||
			vessel?.company_name ||
			vessel?.company?.name ||
			vessel?.company?.companyName ||
			vessel?.raw?.companyName ||
			vessel?.raw?.company_name ||
			vessel?.raw?.company?.name ||
			vessel?.raw?.company?.companyName ||
			vessel?.raw?.vessel?.companyName ||
			vessel?.raw?.vessel?.company_name ||
			vessel?.raw?.vessel?.company?.name ||
			vessel?.raw?.vessel?.company?.companyName ||
			vessel?.raw?.detail?.companyName ||
			vessel?.raw?.detail?.company_name ||
			vessel?.raw?.detail?.company?.name ||
			vessel?.raw?.detail?.company?.companyName ||
			''
		);
	}

	let filteredVessels = $derived(
		vessels.filter((vessel) => {
			const keyword = vesselSearch.trim().toLowerCase();
			if (!keyword) return true;

			return [getVesselDisplayName(vessel), getVesselCompanyName(vessel)]
				.filter(Boolean)
				.some((value) => String(value).toLowerCase().includes(keyword));
		})
	);

	function getActiveVesselIndex(list = filteredVessels) {
		if (!Array.isArray(list) || list.length === 0) return -1;

		const selectedId = $selectedVesselId || getVesselId($selectedVesselInfo);
		if (!selectedId) return 0;

		const selectedIndex = list.findIndex(
			(vessel) => Number(getVesselId(vessel)) === Number(selectedId)
		);

		return selectedIndex >= 0 ? selectedIndex : 0;
	}

	async function scrollVesselOptionIntoView(
		index = focusedVesselIndex,
		block = 'nearest',
		behavior = 'smooth'
	) {
		if (!vesselDropdownOpen || index < 0) return;

		await tick();

		const option = vesselMenuElement?.querySelector?.(`[data-vessel-option-index="${index}"]`);

		option?.scrollIntoView?.({
			block,
			inline: 'nearest',
			behavior
		});
	}

	async function prepareVesselDropdown({ focusSearch = false, scrollBlock = 'center' } = {}) {
		await tick();

		focusedVesselIndex = getActiveVesselIndex();

		if (focusSearch) {
			vesselSearchInputElement?.focus?.({ preventScroll: true });
		}

		await scrollVesselOptionIntoView(focusedVesselIndex, scrollBlock, 'auto');
	}

	function openVesselDropdown({ focusSearch = true } = {}) {
		vesselDropdownOpen = true;
		void prepareVesselDropdown({ focusSearch });
	}

	function toggleVesselDropdown() {
		if (vesselDropdownOpen) {
			vesselDropdownOpen = false;
			return;
		}

		openVesselDropdown();
	}

	function moveFocusedVessel(nextIndex) {
		if (!filteredVessels.length) {
			focusedVesselIndex = -1;
			return;
		}

		const maxIndex = filteredVessels.length - 1;
		focusedVesselIndex = Math.max(0, Math.min(maxIndex, nextIndex));
		void scrollVesselOptionIntoView(focusedVesselIndex);
	}

	function handleVesselSelectorKeydown(event) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			openVesselDropdown();
		}
	}

	function handleVesselDropdownKeydown(event) {
		if (!vesselDropdownOpen) return;

		if (event.key === 'Escape') {
			event.preventDefault();
			vesselDropdownOpen = false;
			return;
		}

		if (!filteredVessels.length) return;

		const currentIndex =
			focusedVesselIndex >= 0 ? focusedVesselIndex : getActiveVesselIndex(filteredVessels);

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			moveFocusedVessel(currentIndex + 1);
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			moveFocusedVessel(currentIndex - 1);
			return;
		}

		if (event.key === 'Home') {
			event.preventDefault();
			moveFocusedVessel(0);
			return;
		}

		if (event.key === 'End') {
			event.preventDefault();
			moveFocusedVessel(filteredVessels.length - 1);
			return;
		}

		if (event.key === 'PageDown') {
			event.preventDefault();
			moveFocusedVessel(currentIndex + 6);
			return;
		}

		if (event.key === 'PageUp') {
			event.preventDefault();
			moveFocusedVessel(currentIndex - 6);
			return;
		}

		if (event.key === 'Enter') {
			event.preventDefault();
			const vessel = filteredVessels[currentIndex];
			if (vessel) selectVessel(vessel);
		}
	}

	function handleVesselSearchKeydown(event) {
		handleVesselDropdownKeydown(event);

		if (
			['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp', 'Enter', 'Escape'].includes(
				event.key
			)
		) {
			event.stopPropagation();
		}
	}

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
			return `${stats.received_minutes} of ${stats.total_minutes} (${stats.percentage ?? '-'}%)`;
		}

		if (stats?.receivedMinutes !== undefined && stats?.totalMinutes !== undefined) {
			return `${stats.receivedMinutes} of ${stats.totalMinutes} (${stats.percentage ?? '-'}%)`;
		}

		if (stats?.received_slots !== undefined && stats?.total_slots !== undefined) {
			return `${stats.received_slots} of ${stats.total_slots} (${stats.percentage ?? '-'}%)`;
		}

		if (stats?.receivedSlots !== undefined && stats?.totalSlots !== undefined) {
			return `${stats.receivedSlots} of ${stats.totalSlots} (${stats.percentage ?? '-'}%)`;
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
		const hireStatus = data?.hire_status || {};
		const rawHireStatus = hireStatus?.status;
		const hasKnownHireStatus = typeof rawHireStatus === 'boolean';
		const hireUpcoming = hasKnownHireStatus
			? rawHireStatus
				? hireStatus?.off_hire_upcoming
				: hireStatus?.on_hire_upcoming
			: null;

		return {
			queue: data.queue ?? '-',
			sdcard: formatSdCardStatus(data.sd_card_stats),
			sdCardAvailable: sdCardDetails.available,
			sdCardUsed: sdCardDetails.used,
			sdCardCapacity: sdCardDetails.capacity,
			online: Boolean(data.online),
			hireStatus: hasKnownHireStatus ? rawHireStatus : null,
			hireUpcoming: hireUpcoming || null,
			hireUpcomingLabel: hasKnownHireStatus
				? rawHireStatus
					? 'Off Hire Upcoming'
					: 'On Hire Upcoming'
				: 'Upcoming',
			hireChangedBy: hireStatus?.change_by || '-'
		};
	}

	async function loadLatestVesselStatus(vesselId) {
		const effectiveVesselId = vesselId || $selectedVesselId || getVesselId($selectedVesselInfo);

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
				online: false,
				hireStatus: null,
				hireUpcoming: null,
				hireUpcomingLabel: 'Upcoming',
				hireChangedBy: '-'
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
				online: false,
				hireStatus: null,
				hireUpcoming: null,
				hireUpcomingLabel: 'Upcoming',
				hireChangedBy: '-'
			};
		}
	}

	async function loadTodayDataReceivedStatus(vesselId) {
		const effectiveVesselId = vesselId || $selectedVesselId || getVesselId($selectedVesselInfo);

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
			const stats =
				payload?.data_received_stats || payload?.dataReceivedStats || payload?.stats || {};
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
		const effectiveVesselId = vesselId || $selectedVesselId || getVesselId($selectedVesselInfo);

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

	function resetVesselScopedUiState() {
		hireHistoryModalOpen = false;
		pageStatusMap = {};
		todayDataReceived = '-';
		todayDataReceivedStats = { received: '-', total: 1440 };
		latestVesselStatus = {
			queue: '-',
			sdcard: '-',
			sdCardAvailable: false,
			sdCardUsed: '-',
			sdCardCapacity: '-',
			online: false,
			hireStatus: null,
			hireUpcoming: null,
			hireUpcomingLabel: 'Upcoming',
			hireChangedBy: '-'
		};
		hireStatusModalOpen = false;
		hireStatusTarget = null;
		hireStatusError = '';

		latestStatusRequestId += 1;
		todayDataReceivedRequestId += 1;

		const activeKey = $activeVesselMenu;
		mountedPages = {
			...(activeKey ? { [activeKey]: true } : {})
		};
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
		if (!active || permissionLoading) return;

		if (!visibleVesselMenus.length) {
			return;
		}

		const activeMenuStillAllowed = visibleVesselMenus.some(
			(menu) => menu.key === $activeVesselMenu
		);

		if (!activeMenuStillAllowed) {
			setActiveVesselMenu(visibleVesselMenus[0].key, { replaceState: true });
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
		resetVesselScopedUiState();
		startLatestStatusPolling(vesselId);
	});

	$effect(() => {
		if (!vesselDropdownOpen) {
			focusedVesselIndex = -1;
			return;
		}

		const searchKey = vesselSearch;
		const vesselCount = filteredVessels.length;
		const selectedId = $selectedVesselId || getVesselId($selectedVesselInfo);

		searchKey;
		vesselCount;
		selectedId;

		const nextFocusedIndex = getActiveVesselIndex(filteredVessels);
		focusedVesselIndex = nextFocusedIndex;
		void scrollVesselOptionIntoView(nextFocusedIndex, 'nearest');
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

			const response = await getMyVesselsApi();
			const rows = extractVesselsFromResponse(response);

			console.log('[VESSEL_PAGE][LOAD_VESSELS][RESULT]', rows);

			vessels = sortByAlpha(
				Array.isArray(rows) ? rows : [],
				getVesselDisplayName,
				getVesselCompanyName
			);

			const currentId = $selectedVesselId;

			if (currentId && vessels.length) {
				const found = vessels.find((item) => Number(getVesselId(item)) === Number(currentId));
				const selected = found || vessels[0];

				setSelectedVessel(selected);
			} else if (vessels.length) {
				const selected = vessels[0];

				setSelectedVessel(selected);
			}
		} catch (err) {
			console.error('[VESSEL_PAGE][LOAD_VESSELS][ERROR]', err);
			vesselError = err?.message || 'Failed to load vessels from the API.';
			vessels = [];
		} finally {
			vesselLoading = false;
		}
	}

	function openHireStatusModal() {
		const vesselId = getVesselId(selectedVesselRecord) || $selectedVesselId;

		if (!vesselId || hireStatusLoading) return;
		if (!canManageHireStatus) {
			hireStatusError = 'This account does not have the manage_hire_status permission.';
			return;
		}
		if (!selectedHireStatusKnown) {
			hireStatusError = 'Latest hire status is not available yet.';
			return;
		}

		hireStatusTarget = !selectedHireIsOn;
		hireStatusForm = {
			effectiveAt: '',
			reason: '',
			note: ''
		};
		hireStatusError = '';
		hireStatusModalOpen = true;
	}

	function openSelectedVesselHireHistory() {
		if (
			permissionLoading ||
			!canManageHireStatus ||
			!($selectedVesselId || getVesselId(selectedVesselRecord))
		)
			return;
		menuOpen = false;
		vesselDropdownOpen = false;
		hireHistoryModalOpen = true;
	}

	$effect(() => {
		if (!active || permissionLoading || !canManageHireStatus) hireHistoryModalOpen = false;
	});

	function closeHireStatusModal() {
		if (hireStatusLoading) return;

		hireStatusModalOpen = false;
		hireStatusTarget = null;
		hireStatusError = '';
	}

	function handleHireStatusBackdropClick(event) {
		if (event.target === event.currentTarget) closeHireStatusModal();
	}

	function handleWindowKeydown(event) {
		if (event.key === 'Escape' && hireStatusModalOpen) {
			closeHireStatusModal();
		}
	}

	async function submitSelectedVesselHireStatus(event) {
		event.preventDefault();

		const vesselId = getVesselId(selectedVesselRecord) || $selectedVesselId;
		if (!vesselId || hireStatusLoading || typeof hireStatusTarget !== 'boolean') return;

		const reason = hireStatusForm.reason.trim();
		if (!reason) {
			hireStatusError = 'Reason is required.';
			return;
		}

		const effectiveAt = hireStatusForm.effectiveAt.trim().replace('T', ' ');
		const note = hireStatusForm.note.trim();
		const payload = {
			hireStatus: hireStatusTarget,
			reason,
			...(effectiveAt ? { effectiveAt } : {}),
			...(note ? { note } : {})
		};

		hireStatusLoading = true;
		hireStatusError = '';

		try {
			await updateVesselHireStatusApi(vesselId, payload);
			await loadLatestVesselStatus(vesselId);
			hireStatusModalOpen = false;
			hireStatusTarget = null;
		} catch (error) {
			console.error('[VESSEL_PAGE][HIRE_STATUS_UPDATE][ERROR]', error);
			hireStatusError = error?.message || 'Failed to update hire status.';
		} finally {
			hireStatusLoading = false;
		}
	}

	function selectVesselMenu(event, key) {
		if (!isPageAllowed(key)) {
			event.preventDefault();
			return;
		}
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		menuOpen = false;
	}

	function selectVessel(vessel) {
		setSelectedVessel(vessel);
		vesselDropdownOpen = false;
		vesselSearch = '';

		console.log('[VESSEL_PAGE][VESSEL_SELECTED]', vessel);
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

<svelte:window onkeydown={handleWindowKeydown} />

<section class="vessel-shell">
	<VesselTopbar
		bind:menuOpen
		bind:vesselDropdownOpen
		bind:vesselSearch
		bind:focusedVesselIndex
		bind:vesselMenuElement
		bind:vesselSearchInputElement
		{activeLabel}
		{permissionLoading}
		{visibleVesselMenus}
		activeMenuKey={$activeVesselMenu}
		{status}
		{canManageHireStatus}
		{selectedHireIsOn}
		{selectedHireStatusKnown}
		{hireStatusLoading}
		{selectedHireLabel}
		{hireStatusToggleTitle}
		{latestVesselStatus}
		{selectedVessel}
		selectedVesselId={$selectedVesselId}
		hasSelectedVessel={Boolean(selectedVesselRecord)}
		{vessels}
		{filteredVessels}
		{vesselLoading}
		{vesselError}
		onSelectMenu={selectVesselMenu}
		onToggleVesselDropdown={toggleVesselDropdown}
		onVesselSelectorKeydown={handleVesselSelectorKeydown}
		onVesselDropdownKeydown={handleVesselDropdownKeydown}
		onVesselSearchKeydown={handleVesselSearchKeydown}
		onSelectVessel={selectVessel}
		onOpenHireStatusModal={openHireStatusModal}
		onOpenHireHistory={openSelectedVesselHireHistory}
	/>

	<main class="vessel-content">
		{#if permissionLoading}
			<div class="loading-screen">
				<div class="loading-brand">⚓</div>
				<div class="loading-spinner" aria-hidden="true"></div>
				<span>Initializing...</span>
			</div>
		{:else if !visibleVesselMenus.length}
			<section class="vessel-page active-vessel-page">
				<div class="no-access-card">
					<h2>No Menu Access</h2>
					<p>This user does not have permission to open the vessel page.</p>
				</div>
			</section>
		{:else}
			{#key vesselPageKey}
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

				{#if shouldMountPage('single-line-diagram') && isPageAllowed('single-line-diagram')}
					<section
						class="vessel-page"
						class:active-vessel-page={isPageActive('single-line-diagram')}
					>
						<SingleLineDiagramPage active={isPageActive('single-line-diagram')} />
					</section>
				{/if}
			{/key}
		{/if}
	</main>
</section>

{#if active && !permissionLoading && canManageHireStatus && hireHistoryModalOpen && ($selectedVesselId || getVesselId(selectedVesselRecord))}
	{#key $selectedVesselId || getVesselId(selectedVesselRecord)}
		<HireHistoryModal
			vesselId={$selectedVesselId || getVesselId(selectedVesselRecord)}
			vesselName={selectedVessel}
			onclose={() => (hireHistoryModalOpen = false)}
		/>
	{/key}
{/if}

<VesselHireStatusModal
	open={hireStatusModalOpen}
	target={hireStatusTarget}
	vesselName={selectedVessel}
	loading={hireStatusLoading}
	error={hireStatusError}
	reasonOptions={hireReasonOptions}
	bind:reason={hireStatusForm.reason}
	bind:effectiveAt={hireStatusForm.effectiveAt}
	bind:note={hireStatusForm.note}
	onSubmit={submitSelectedVesselHireStatus}
	onClose={closeHireStatusModal}
	onBackdropClick={handleHireStatusBackdropClick}
/>
