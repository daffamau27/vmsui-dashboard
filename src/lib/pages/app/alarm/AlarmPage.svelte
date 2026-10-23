<script>
	import { onMount, tick } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { apiRequest } from '$lib/api/authApi.js';
	import { sortByAlpha } from '$lib/utils/alphaSort.js';
	import AlarmHeader from './AlarmHeader.svelte';
	import AlarmToasts from './AlarmToasts.svelte';
	import AlarmSummaryCards from './AlarmSummaryCards.svelte';
	import AlarmMonitorSection from './AlarmMonitorSection.svelte';
	import AlarmEventsSection from './AlarmEventsSection.svelte';
	import AlarmDeviationOverlay from './AlarmDeviationOverlay.svelte';

	let { active = false } = $props();

	let loadingMonitor = $state(false);
	let loadingEvents = $state(false);
	let acknowledging = $state(false);
	let error = $state('');
	let successMessage = $state('');

	let monitorRows = $state([]);
	let eventRows = $state([]);
	let deviationRows = $state([]);
	let deviationPagination = $state({
		page: 1,
		pageSize: 20,
		totalItems: 0,
		totalPages: 1,
		hasNext: false,
		hasPrevious: false
	});
	let loadingDeviations = $state(false);
	let showDeviationOverlay = $state(false);
	let deviationAcknowledged = $state(false);
	let deviationAcknowledgeError = $state('');
	let pagination = $state({
		page: 1,
		pageSize: 20,
		totalItems: 0,
		totalPages: 1,
		hasNext: false,
		hasPrevious: false
	});

	let selectedVesselId = $state('');
	let selectedStatus = $state('');
	let selectedAlarmTypes = $state([]);
	let page = $state(1);
	let pageSize = $state(20);
	let alarmEventsSectionElement = $state(null);

	const alarmTypeOptions = [
		{
			value: 'DEVICE_OFFLINE',
			label: 'Device Offline'
		},
		{
			value: 'PANEL_OPEN',
			label: 'Panel Open'
		},
		{
			value: 'LOW_SPEED_HIGH_RPM',
			label: 'Low Speed High RPM'
		},
		{
			value: 'LOW_SPEED_OUTSIDE_BOUNDARY',
			label: 'Low Speed Outside Boundary'
		},
		{
			value: 'ENGINE_HEALTH',
			label: 'Engine Health'
		},
		{
			value: 'VOYAGE_PLAN_DEVIATION',
			label: 'Voyage Plan Deviation'
		},
		{
			value: 'JUMPING_DATA',
			label: 'Jumping Data'
		},
		{
			value: 'SPIKE_RPM',
			label: 'Spike RPM'
		},
		{
			value: 'OUTRANGE_RPM',
			label: 'Outrange RPM'
		},
		{
			value: 'RPM_BLANK',
			label: 'RPM Blank'
		},
		{
			value: 'UNALIGNED_RPM_ENGINES',
			label: 'Unaligned RPM Engines'
		}
	];

	let refreshTimer = null;
	let deviationRefreshTimer = null;

	let activeMonitorRows = $derived(
		monitorRows.filter((row) => String(row?.status || '').toUpperCase() === 'ACTIVE')
	);

	let newAlarmCount = $derived(monitorRows.filter((row) => row?.isNew).length);

	let activeAlarmCount = $derived(activeMonitorRows.length);

	let totalEventCount = $derived(pagination?.totalItems || eventRows.length);

	let vesselOptions = $derived(
		sortByAlpha(
			[...monitorRows, ...eventRows]
				.map((row) => ({
					vesselId: row?.vesselId,
					vesselName:
						row?.vesselName ||
						row?.vessel_name ||
						row?.assetName ||
						row?.deviceName ||
						`Vessel ${row?.vesselId}`
				}))
				.filter((row) => row.vesselId !== undefined && row.vesselId !== null)
				.reduce((items, row) => {
					const exists = items.some((item) => String(item.vesselId) === String(row.vesselId));
					return exists ? items : [...items, row];
				}, []),
			(vessel) => vessel.vesselName
		)
	);

	function closeDeviationOverlay() {
		showDeviationOverlay = false;
	}

	function handleDeviationOverlayKeydown(event) {
		if (event.key !== 'Escape') return;

		if (showDeviationOverlay) closeDeviationOverlay();
	}

	async function viewDeviationHistory() {
		const visibleDeviationTypes = new Set(
			deviationRows
				.map((row) =>
					String(row?.type || '')
						.trim()
						.toUpperCase()
				)
				.filter(Boolean)
		);

		selectedAlarmTypes = alarmTypeOptions
			.map((option) => option.value)
			.filter((type) => visibleDeviationTypes.has(type));
		selectedVesselId = '';
		selectedStatus = '';
		page = 1;
		closeDeviationOverlay();

		await loadAlarmEvents();
		await tick();
		alarmEventsSectionElement?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
	}

	async function handleDeviationAcknowledge() {
		deviationAcknowledgeError = '';

		const acknowledged = await handleMarkAllRead();

		if (acknowledged) {
			deviationAcknowledged = true;
			return;
		}

		deviationAcknowledgeError = error || 'Failed to acknowledge alarms.';
	}

	function buildAlarmEventsQuery() {
		const params = new SvelteURLSearchParams();

		if (selectedVesselId) {
			params.set('vesselId', selectedVesselId);
		}

		if (selectedStatus) {
			params.set('status', selectedStatus);
		}

		if (selectedAlarmTypes.length) {
			params.set('alarmType', selectedAlarmTypes.join(','));
		}

		params.set('page', String(page));
		params.set('pageSize', String(pageSize));

		return params.toString();
	}

	async function loadAlarmMonitor() {
		loadingMonitor = true;
		error = '';

		try {
			const response = await apiRequest('/alarm/monitor', {
				method: 'GET'
			});

			const payload = response?.data || {};

			monitorRows = Array.isArray(payload?.monitor)
				? payload.monitor
				: Array.isArray(response?.monitor)
					? response.monitor
					: Array.isArray(response?.data)
						? response.data
						: Array.isArray(response)
							? response
							: [];
		} catch (err) {
			console.error('[ALARM_MONITOR_ERROR]', err);
			error = err?.message || 'Failed to load alarm monitor.';
			monitorRows = [];
		} finally {
			loadingMonitor = false;
		}
	}

	async function loadMonitorDeviations() {
		if (loadingDeviations) return;

		loadingDeviations = true;

		try {
			const response = await apiRequest('/alarm/monitor-deviations?page=1&pageSize=20', {
				method: 'GET'
			});
			const payload = response?.data || {};

			const nextDeviationRows = Array.isArray(payload?.monitor)
				? payload.monitor
				: Array.isArray(response?.monitor)
					? response.monitor
					: [];

			const nextDeviationPagination = {
				page: payload?.pagination?.page ?? 1,
				pageSize: payload?.pagination?.pageSize ?? 20,
				totalItems: payload?.pagination?.totalItems ?? nextDeviationRows.length,
				totalPages: payload?.pagination?.totalPages ?? 1,
				hasNext: Boolean(payload?.pagination?.hasNext),
				hasPrevious: Boolean(payload?.pagination?.hasPrevious)
			};

			if (nextDeviationRows.length > 0) {
				deviationRows = nextDeviationRows;
				deviationPagination = nextDeviationPagination;
				deviationAcknowledged = false;
				deviationAcknowledgeError = '';
				showDeviationOverlay = true;
			} else if (!showDeviationOverlay) {
				deviationRows = [];
				deviationPagination = nextDeviationPagination;
			}
		} catch (err) {
			if (!showDeviationOverlay) deviationRows = [];

			if (Number(err?.status) !== 403) {
				console.error('[ALARM_MONITOR_DEVIATIONS_ERROR]', err);
			}
		} finally {
			loadingDeviations = false;
		}
	}

	async function loadAlarmEvents() {
		loadingEvents = true;
		error = '';

		try {
			const query = buildAlarmEventsQuery();

			const response = await apiRequest(`/alarm/events?${query}`, {
				method: 'GET'
			});

			const payload = response?.data || {};

			const events = Array.isArray(payload?.events)
				? payload.events
				: Array.isArray(response?.events)
					? response.events
					: [];

			eventRows = events.map((event) => ({
				...event,
				vesselName:
					event?.vesselName ||
					event?.vessel_name ||
					event?.assetName ||
					event?.deviceName ||
					(event?.vesselId ? `Vessel ${event.vesselId}` : '-')
			}));

			pagination = {
				page: payload?.pagination?.page ?? page,
				pageSize: payload?.pagination?.pageSize ?? pageSize,
				totalItems: payload?.pagination?.totalItems ?? eventRows.length,
				totalPages: payload?.pagination?.totalPages ?? 1,
				hasNext: Boolean(payload?.pagination?.hasNext),
				hasPrevious: Boolean(payload?.pagination?.hasPrevious)
			};
		} catch (err) {
			console.error('[ALARM_EVENTS_ERROR]', err);
			error = err?.message || 'Failed to load alarm events.';
			eventRows = [];
			pagination = {
				page,
				pageSize,
				totalItems: 0,
				totalPages: 1,
				hasNext: false,
				hasPrevious: false
			};
		} finally {
			loadingEvents = false;
		}
	}

	async function loadAllAlarmData() {
		await Promise.all([loadAlarmMonitor(), loadAlarmEvents()]);
	}

	async function handleApplyFilter() {
		page = 1;
		await loadAlarmEvents();
	}

	async function handleResetFilter() {
		selectedVesselId = '';
		selectedStatus = '';
		selectedAlarmTypes = [];
		page = 1;
		pageSize = 20;
		await loadAlarmEvents();
	}

	async function handleNextPage() {
		if (!pagination.hasNext) return;

		page = Number(pagination.page || page) + 1;
		await loadAlarmEvents();
	}

	async function handlePreviousPage() {
		if (!pagination.hasPrevious) return;

		page = Math.max(1, Number(pagination.page || page) - 1);
		await loadAlarmEvents();
	}

	async function handleMarkAllRead() {
		acknowledging = true;
		error = '';
		successMessage = '';

		try {
			await apiRequest('/alarm/mark-all-read', {
				method: 'POST'
			});

			successMessage = 'All alarms acknowledged successfully.';

			await loadAllAlarmData();
			return true;
		} catch (err) {
			console.error('[ALARM_MARK_ALL_READ_ERROR]', err);
			error = err?.message || 'Failed to acknowledge all alarms.';
			return false;
		} finally {
			acknowledging = false;
		}
	}

	function startAutoRefresh() {
		stopAutoRefresh();

		refreshTimer = setInterval(() => {
			if (!active) return;
			loadAlarmMonitor();
		}, 10000);
	}

	function stopAutoRefresh() {
		if (refreshTimer) {
			clearInterval(refreshTimer);
			refreshTimer = null;
		}
	}

	function startDeviationAutoRefresh() {
		stopDeviationAutoRefresh();

		deviationRefreshTimer = setInterval(() => {
			loadMonitorDeviations();
		}, 60000);
	}

	function stopDeviationAutoRefresh() {
		if (deviationRefreshTimer) {
			clearInterval(deviationRefreshTimer);
			deviationRefreshTimer = null;
		}
	}

	onMount(() => {
		loadAllAlarmData();
		loadMonitorDeviations();
		startAutoRefresh();
		startDeviationAutoRefresh();

		return () => {
			stopAutoRefresh();
			stopDeviationAutoRefresh();
		};
	});

	$effect(() => {
		if (active) {
			loadAllAlarmData();
			startAutoRefresh();
		} else {
			stopAutoRefresh();
		}
	});
</script>

<svelte:window onkeydown={handleDeviationOverlayKeydown} />

{#if showDeviationOverlay && deviationRows.length}
	<AlarmDeviationOverlay
		rows={deviationRows}
		totalItems={deviationPagination.totalItems}
		{acknowledging}
		acknowledged={deviationAcknowledged}
		acknowledgeError={deviationAcknowledgeError}
		onClose={closeDeviationOverlay}
		onAcknowledge={handleDeviationAcknowledge}
		onViewHistory={viewDeviationHistory}
	/>
{/if}

<section class="alarm-page">
	<AlarmHeader
		{loadingMonitor}
		{loadingEvents}
		{acknowledging}
		onRefresh={loadAllAlarmData}
		onAcknowledgeAll={handleMarkAllRead}
	/>

	<AlarmToasts
		{error}
		{successMessage}
		onCloseError={() => (error = '')}
		onCloseSuccess={() => (successMessage = '')}
	/>

	<AlarmSummaryCards
		vesselCount={monitorRows.length}
		activeCount={activeAlarmCount}
		newCount={newAlarmCount}
		eventCount={totalEventCount}
	/>

	<AlarmMonitorSection rows={monitorRows} loading={loadingMonitor} />

	<div bind:this={alarmEventsSectionElement}>
		<AlarmEventsSection
			rows={eventRows}
			loading={loadingEvents}
			{vesselOptions}
			{alarmTypeOptions}
			{pagination}
			bind:selectedVesselId
			bind:selectedStatus
			bind:selectedAlarmTypes
			bind:pageSize
			onApply={handleApplyFilter}
			onReset={handleResetFilter}
			onPrevious={handlePreviousPage}
			onNext={handleNextPage}
		/>
	</div>
</section>

<style>
	.alarm-page {
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

	@media (max-width: 760px) {
		.alarm-page {
			padding: 10px;
		}
	}
</style>
