<script>
	import { onMount } from 'svelte';
	import { selectedVesselId, selectedVesselInfo } from '$lib/stores/selectedVessel.svelte.js';
	import {
		getPeriodicalReportData,
		getPeriodicalReportExcelUrl
	} from '$lib/api/periodicalReportApi.js';
	import { apiRequest, downloadApiFile } from '$lib/api/authApi.js';
	import { setPageStatus } from '$lib/stores/pageStatusStore.svelte.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import { getAutoTimezoneLabelFromSources } from '$lib/utils/autoTimezoneLabel.js';
	import { buildPeriodicalEngineFuelSummary } from '$lib/utils/periodicalReport.js';
	import {
		formatLiter,
		formatNumber,
		formatRuntimeFromMinutes,
		toFuelNumber
	} from '$lib/utils/periodicalFormat.js';
	import PeriodicalHeader from './PeriodicalHeader.svelte';
	import PeriodicalSummary from './PeriodicalSummary.svelte';
	import PeriodicalTravelDistance from './PeriodicalTravelDistance.svelte';
	import PeriodicalRuntimeTable from './PeriodicalRuntimeTable.svelte';
	import PeriodicalRpmTable from './PeriodicalRpmTable.svelte';
	import PeriodicalFuelTable from './PeriodicalFuelTable.svelte';
	import PeriodicalHighRpmTable from './PeriodicalHighRpmTable.svelte';
	import PeriodicalSpeedStats from './PeriodicalSpeedStats.svelte';
	import PeriodicalLoadOverlay from './PeriodicalLoadOverlay.svelte';
	import './periodical-page.css';

	let loading = $state(false);
	let exporting = $state(false);
	let error = $state('');
	let reportData = $state(null);

	let startDateTime = $state('');
	let endDateTime = $state('');
	let timezoneMode = $state('auto');
	let timezoneOffset = $state('+07:00');
	let hasLoadedDateRange = $state(false);
	let selectedRpmRuntimeFuelTableKey = $state('');
	let currentUser = $state(null);
	let currentUserLoading = $state(false);
	let currentUserLoaded = $state(false);

	let { active = false } = $props();
	let shouldShowDateRangeOverlay = $derived(!hasLoadedDateRange || !startDateTime || !endDateTime);

	async function loadCurrentUser() {
		if (currentUser || currentUserLoading) return currentUser;

		currentUserLoading = true;

		try {
			const response = await apiRequest('/users/current-user', { method: 'GET' });
			currentUser = response?.data || response?.user || response || null;
			return currentUser;
		} catch (permissionError) {
			console.error('[PERIODICAL_CURRENT_USER_PERMISSION_ERROR]', permissionError);
			currentUser = null;
			return null;
		} finally {
			currentUserLoading = false;
			currentUserLoaded = true;
		}
	}

	function hasPermission(permissionKey) {
		if (!permissionKey) return true;

		const permissionAccess = currentUser?.permissionAccess || {};
		if (permissionAccess?.mode === 'all') return true;

		if (permissionAccess?.mode === 'selected') {
			const permissions = Array.isArray(permissionAccess?.permissions)
				? permissionAccess.permissions
				: [];
			return permissions.includes(permissionKey);
		}

		return false;
	}

	function pad(value) {
		return String(value).padStart(2, '0');
	}

	function toLocalInputValue(date) {
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
			date.getHours()
		)}:${pad(date.getMinutes())}`;
	}

	function markDateFilterDirty() {
		hasLoadedDateRange = false;
	}

	function toApiDateTime(value) {
		if (!value) return '';

		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;

		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
			date.getHours()
		)}:${pad(date.getMinutes())}:00`;
	}

	function pickArray(...values) {
		for (const value of values) {
			if (Array.isArray(value)) return value;
		}

		return [];
	}

	function getConsumptionPerRangeRows(data) {
		return pickArray(
			data?.consumption_per_range?.detail,
			data?.consumption_per_range?.details,
			data?.consumption_per_range?.items,
			data?.consumptionPerRange?.detail,
			data?.consumptionPerRange?.details,
			data?.consumptionPerRange?.items
		);
	}

	function getRpmFuelValue(row, sourceKey) {
		if (sourceKey === 'fms') return row?.fuel_fms ?? row?.fuelFms ?? row?.fms;
		if (sourceKey === 'ecu') return row?.fuel_ecu ?? row?.fuelEcu ?? row?.ecu;

		return row?.fuel_estimated_l ?? row?.fuelEstimatedL ?? row?.fuel ?? row?.fuelUsed;
	}

	function hasPresentRpmFuelValue(row, sourceKey) {
		const value = getRpmFuelValue(row, sourceKey);

		if (value === undefined || value === null || value === '' || value === '-') return false;

		const number = Number(value);
		return Number.isFinite(number);
	}

	function getRpmSourceLabel(sourceKey) {
		if (sourceKey === 'ems_internal') return 'VMS';
		if (sourceKey === 'ems_external') return 'EMS';
		if (sourceKey === 'engine_maker') return 'Engine Maker';
		if (sourceKey === 'fms') return 'FMS';
		if (sourceKey === 'ecu') return 'ECU';

		return sourceKey || '-';
	}

	function normalizeEngineName(value) {
		return String(value || '')
			.replace(/_/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.toUpperCase();
	}

	function normalizeFuelSourceLabel(sourceKey, visibleSources = []) {
		const key = String(sourceKey || '').toLowerCase();

		const hasInternal = visibleSources.some((source) => source.key === 'ems_internal');

		const hasExternal = visibleSources.some((source) => source.key === 'ems_external');

		if (key === 'ecu') return 'ECU';
		if (key === 'fms') return 'FMS';

		if (key === 'ems_internal') {
			return hasInternal && hasExternal ? 'VMS' : 'EMS';
		}

		if (key === 'ems_external') {
			return 'EMS';
		}

		if (key === 'engine_maker') return 'Engine Maker';

		return sourceKey || '-';
	}

	function hasObject(value) {
		return Boolean(value && typeof value === 'object' && !Array.isArray(value));
	}

	let vesselName = $derived(
		normalizedData?.vessel_name ||
			normalizedData?.vesselName ||
			$selectedVesselInfo?.name ||
			$selectedVesselInfo?.vesselName ||
			'Selected Vessel'
	);

	let normalizedData = $derived(reportData?.data || reportData || {});
	let autoTimezoneLabel = $derived(
		getAutoTimezoneLabelFromSources(normalizedData, reportData, $selectedVesselInfo)
	);

	let dataReceivedStats = $derived(
		normalizedData?.data_received_stats || normalizedData?.dataReceivedStats || {}
	);

	let engineRuntimeRows = $derived(
		Array.isArray(normalizedData?.engine_runtimes)
			? normalizedData.engine_runtimes
			: Array.isArray(normalizedData?.engineRuntimes)
				? normalizedData.engineRuntimes
				: []
	);

	let fuelConsumption = $derived(
		normalizedData?.fuel_consumption || normalizedData?.fuelConsumption || {}
	);

	let robBunker = $derived(fuelConsumption?.rob_bunker || fuelConsumption?.robBunker || {});

	const engineFuelSourceKeys = ['ecu', 'fms', 'ems_internal', 'ems_external', 'engine_maker'];

	function getFuelSourceObject(sourceKey) {
		return fuelConsumption?.[sourceKey] || {};
	}

	function getFuelSourceEngines(sourceKey) {
		const source = getFuelSourceObject(sourceKey);

		return Array.isArray(source?.engines)
			? source.engines
			: Array.isArray(source?.engine_details)
				? source.engine_details
				: Array.isArray(source?.engineDetails)
					? source.engineDetails
					: [];
	}

	function getFuelSourceTotal(sourceKey) {
		const source = getFuelSourceObject(sourceKey);

		return toFuelNumber(
			source?.total_l ??
				source?.totalL ??
				source?.total ??
				source?.grand_total ??
				source?.grandTotal
		);
	}

	function hasFuelSourceValue(sourceKey) {
		if (hasObject(fuelConsumption?.[sourceKey])) return true;

		const total = getFuelSourceTotal(sourceKey);
		const engines = getFuelSourceEngines(sourceKey);

		return (
			total > 0 ||
			engines.some((engine) => {
				return toFuelNumber(engine?.fuel_l ?? engine?.fuelL ?? engine?.fuel) > 0;
			})
		);
	}

	let rawVisibleFuelSources = $derived(
		engineFuelSourceKeys
			.filter((key) => hasFuelSourceValue(key))
			.map((key) => ({
				key,
				total: getFuelSourceTotal(key),
				engines: getFuelSourceEngines(key)
			}))
	);

	let visibleFuelSources = $derived(
		rawVisibleFuelSources.map((source) => ({
			...source,
			label: normalizeFuelSourceLabel(source.key, rawVisibleFuelSources)
		}))
	);

	function getFuelForEngine(source, engineName) {
		const engines = Array.isArray(source?.engines) ? source.engines : [];
		const target = normalizeEngineName(engineName);

		const found = engines.find((item) => {
			return normalizeEngineName(item?.engine_name || item?.engineName) === target;
		});

		return toFuelNumber(found?.fuel_l ?? found?.fuelL ?? found?.fuel);
	}

	let engineFuelSummary = $derived(
		buildPeriodicalEngineFuelSummary(engineRuntimeRows, visibleFuelSources)
	);

	let totalRobBunkerFuel = $derived(
		toFuelNumber(robBunker?.total_fod_l ?? robBunker?.totalFodL) +
			toFuelNumber(robBunker?.bunker_l ?? robBunker?.bunkerL)
	);

	let totalFuel = $derived(
		engineFuelSummary.some((engine) => engine.fuel !== null)
			? engineFuelSummary.reduce((sum, engine) => sum + (engine.fuel ?? 0), 0)
			: null
	);

	let hasRobBunkerData = $derived(
		toFuelNumber(robBunker?.fod_port_l ?? robBunker?.fodPortL) > 0 ||
			toFuelNumber(robBunker?.fod_stbd_l ?? robBunker?.fodStbdL) > 0 ||
			toFuelNumber(robBunker?.fod_single_l ?? robBunker?.fodSingleL) > 0 ||
			toFuelNumber(robBunker?.total_fod_l ?? robBunker?.totalFodL) > 0 ||
			toFuelNumber(robBunker?.bunker_l ?? robBunker?.bunkerL) > 0
	);

	let travelDistance = $derived(
		normalizedData?.travel_distance || normalizedData?.travelDistance || {}
	);

	let totalDistanceNm = $derived(
		Number(
			travelDistance?.total_distance_nm ??
				travelDistance?.totalDistanceNm ??
				travelDistance?.totalDistance
		)
	);

	let outsideSafetyZoneDistanceNm = $derived(
		Number(
			travelDistance?.outside_safety_zone_distance_nm ??
				travelDistance?.outsideSafetyZoneDistanceNm ??
				travelDistance?.outsideSafetyZoneDistance
		)
	);

	let hasTravelDistance = $derived(
		Number.isFinite(totalDistanceNm) || Number.isFinite(outsideSafetyZoneDistanceNm)
	);

	function getRpmRangePayload() {
		const consumptionRows = getConsumptionPerRangeRows(normalizedData);
		const hasFmsRows = consumptionRows.some((row) => hasPresentRpmFuelValue(row, 'fms'));
		const hasEcuRows = consumptionRows.some((row) => hasPresentRpmFuelValue(row, 'ecu'));
		const consumptionSourceKeys = [...(hasFmsRows ? ['fms'] : []), ...(hasEcuRows ? ['ecu'] : [])];

		const candidates = [
			{
				key: 'ems_internal',
				label: 'VMS',
				sourceKeys: ['ems_internal'],
				showLh: true,
				value: normalizedData?.rpm_ranges_ems_internal || normalizedData?.rpmRangesEmsInternal
			},
			{
				key: 'ems_external',
				label: 'EMS',
				sourceKeys: ['ems_external'],
				showLh: true,
				value: normalizedData?.rpm_ranges_ems_external || normalizedData?.rpmRangesEmsExternal
			},
			{
				key: 'engine_maker',
				label: 'Engine Maker',
				sourceKeys: ['engine_maker'],
				showLh: true,
				value: normalizedData?.rpm_ranges_maker || normalizedData?.rpmRangesMaker
			}
		];

		const tables = candidates
			.map((candidate) => ({
				...candidate,
				details: Array.isArray(candidate.value?.details) ? candidate.value.details : [],
				grandTotal: candidate.value?.grand_total || candidate.value?.grandTotal || {}
			}))
			.filter((candidate) => candidate.details.length);

		if (consumptionSourceKeys.length) {
			tables.push({
				key: 'fms_ecu',
				label: consumptionSourceKeys.map(getRpmSourceLabel).join(' / '),
				sourceKeys: consumptionSourceKeys,
				showLh: false,
				details: consumptionRows,
				grandTotal:
					normalizedData?.consumption_per_range?.grand_total ||
					normalizedData?.consumptionPerRange?.grandTotal ||
					{}
			});
		}

		return tables;
	}

	let rpmRangeTables = $derived(getRpmRangePayload());

	let highRpmLowSpeed = $derived(
		normalizedData?.high_rpm_low_speed || normalizedData?.highRpmLowSpeed || {}
	);

	let highRpmLowSpeedRows = $derived(
		Array.isArray(highRpmLowSpeed?.engines) ? highRpmLowSpeed.engines : []
	);

	let canViewHighRpmLowSpeedTable = $derived(hasPermission('view_high_rpm_low_speed_table'));

	let canViewRpmRangeRuntimeFuelTable = $derived(
		hasPermission('view_rpm_ranges_runtime_fuel_table')
	);

	let literPerNauticalMile = $derived(
		normalizedData?.liter_per_nautical_mile || normalizedData?.literPerNauticalMile || {}
	);

	let literPerNmCards = $derived(
		Object.entries(literPerNauticalMile || {})
			.filter(([, value]) => Number.isFinite(Number(value)))
			.map(([key, value]) => ({
				label: normalizeFuelSourceLabel(key, rawVisibleFuelSources),
				value
			}))
	);

	let robBunkerCards = $derived([
		...(robBunker?.fod_port_l !== undefined || robBunker?.fodPortL !== undefined
			? [
					{
						label: 'FOD Port',
						value: robBunker?.fod_port_l ?? robBunker?.fodPortL,
						total: false
					}
				]
			: []),
		...(robBunker?.fod_stbd_l !== undefined || robBunker?.fodStbdL !== undefined
			? [
					{
						label: 'FOD STBD',
						value: robBunker?.fod_stbd_l ?? robBunker?.fodStbdL,
						total: false
					}
				]
			: []),
		...(robBunker?.fod_single_l !== undefined || robBunker?.fodSingleL !== undefined
			? [
					{
						label: 'FOD Single',
						value: robBunker?.fod_single_l ?? robBunker?.fodSingleL,
						total: false
					}
				]
			: []),
		...(robBunker?.total_fod_l !== undefined || robBunker?.totalFodL !== undefined
			? [
					{
						label: 'Total FOD',
						value: robBunker?.total_fod_l ?? robBunker?.totalFodL,
						total: true
					}
				]
			: []),
		...(robBunker?.bunker_l !== undefined || robBunker?.bunkerL !== undefined
			? [
					{
						label: 'Bunker',
						value: robBunker?.bunker_l ?? robBunker?.bunkerL,
						total: false
					}
				]
			: [])
	]);

	let averageSpeed = $derived(
		Number(
			normalizedData?.speed_statistics?.average_speed ??
				normalizedData?.speedStatistics?.averageSpeed ??
				normalizedData?.speed_stats?.average_speed ??
				normalizedData?.speedStats?.averageSpeed ??
				normalizedData?.average_speed ??
				normalizedData?.averageSpeed
		)
	);

	let maxSpeed = $derived(
		Number(
			normalizedData?.speed_statistics?.max_speed ??
				normalizedData?.speedStatistics?.maxSpeed ??
				normalizedData?.speed_stats?.max_speed ??
				normalizedData?.speedStats?.maxSpeed ??
				normalizedData?.max_speed ??
				normalizedData?.maxSpeed
		)
	);

	let hasAverageSpeed = $derived(Number.isFinite(averageSpeed));
	let hasMaxSpeed = $derived(Number.isFinite(maxSpeed));

	let periodicalFuelSkeletonColumns = $derived(Math.max(visibleFuelSources.length + 2, 4));

	let periodicalTableSkeletonRows = $derived(Math.max(engineRuntimeRows.length + 1, 4));

	let dataReceivedLabel = $derived(
		dataReceivedStats?.received_minutes !== undefined &&
			dataReceivedStats?.total_minutes !== undefined
			? `${dataReceivedStats.received_minutes} of ${dataReceivedStats.total_minutes} (${dataReceivedStats.percentage ?? '-'}%)`
			: '-'
	);

	let engineFuelCards = $derived(
		engineFuelSummary.map((engine) => ({
			key: engine.key,
			engineName: engine.engineName,
			fuelLabel: engine.fuel === null ? '-' : formatLiter(engine.fuel),
			sourceLabel: engine.sourceLabel
		}))
	);

	let totalFuelLabel = $derived(totalFuel === null ? '-' : formatLiter(totalFuel));

	let bunkerFuelLabel = $derived(formatLiter(totalRobBunkerFuel));

	let totalDistanceLabel = $derived(
		Number.isFinite(totalDistanceNm) ? `${formatNumber(totalDistanceNm, 3)} NM` : null
	);

	let outsideSafetyZoneLabel = $derived(
		Number.isFinite(outsideSafetyZoneDistanceNm)
			? `${formatNumber(outsideSafetyZoneDistanceNm, 3)} NM`
			: null
	);

	let averageSpeedLabel = $derived(
		hasAverageSpeed ? `${formatNumber(averageSpeed, 2)} knot` : null
	);

	let maxSpeedLabel = $derived(hasMaxSpeed ? `${formatNumber(maxSpeed, 2)} knot` : null);

	let literPerNmCardLabels = $derived(
		literPerNmCards.map((card, index) => ({
			key: index,
			label: card.label,
			valueLabel: `${formatNumber(card.value, 2)} L/NM`
		}))
	);

	let engineRuntimeTableRows = $derived(
		engineRuntimeRows.map((row, index) => ({
			key: index,
			engineName: row.engine_name || row.engineName || '-',
			runtimeFormatted: row.runtime_formatted || row.runtimeFormatted || '-',
			runtimeHoursLabel: formatNumber(row.runtime_hours ?? row.runtimeHours, 2)
		}))
	);

	let fuelTableSources = $derived(
		visibleFuelSources.map((source) => ({
			key: source.key,
			label: source.label,
			totalLabel: formatLiter(source.total)
		}))
	);

	let fuelTableRows = $derived(
		engineRuntimeRows.map((engine, index) => {
			const engineName = engine.engine_name || engine.engineName;

			return {
				key: index,
				engineName: engineName || '-',
				values: visibleFuelSources.map((source) => ({
					key: source.key,
					label: formatLiter(getFuelForEngine(source, engineName))
				}))
			};
		})
	);

	let robBunkerCardLabels = $derived(
		robBunkerCards.map((card, index) => ({
			key: index,
			label: card.label,
			valueLabel: formatLiter(card.value),
			total: card.total
		}))
	);

	let highRpmLowSpeedTableRows = $derived(
		highRpmLowSpeedRows.map((row, index) => ({
			key: index,
			engineName: row.engine_name || row.engineName || '-',
			durationLabel:
				row.duration_formatted ||
				row.durationFormatted ||
				formatRuntimeFromMinutes(row.duration_minutes ?? row.durationMinutes),
			fuelLabel: formatLiter(row.fuel_used_l ?? row.fuelUsedL ?? row.fuel)
		}))
	);

	let highRpmLowSpeedTotal = $derived({
		durationLabel:
			highRpmLowSpeed?.grand_total_duration_formatted ||
			highRpmLowSpeed?.grandTotalDurationFormatted ||
			formatRuntimeFromMinutes(
				highRpmLowSpeed?.grand_total_duration_minutes ?? highRpmLowSpeed?.grandTotalDurationMinutes
			),
		fuelLabel: formatLiter(highRpmLowSpeed?.grand_total_l ?? highRpmLowSpeed?.grandTotalL)
	});

	async function loadPeriodicalReport() {
		if (!$selectedVesselId) {
			error = 'No vessel has been selected from Fleet View.';
			reportData = null;
			hasLoadedDateRange = false;
			return;
		}

		if (!startDateTime || !endDateTime) {
			error = 'Start and End are required.';
			reportData = null;
			hasLoadedDateRange = false;
			return;
		}

		loading = true;
		error = '';

		try {
			const result = await getPeriodicalReportData({
				vesselId: $selectedVesselId,
				start: toApiDateTime(startDateTime),
				end: toApiDateTime(endDateTime),
				timezoneMode,
				timezoneOffset
			});

			reportData = result;
			hasLoadedDateRange = true;

			const payload = result?.data || result || {};
			const stats = payload?.data_received_stats || payload?.dataReceivedStats || {};

			setPageStatus({
				dataReceived:
					stats?.received_minutes !== undefined && stats?.total_minutes !== undefined
						? `${stats.received_minutes} of ${stats.total_minutes} (${stats.percentage ?? '-'}%)`
						: '-',
				queue: payload?.queue ?? '-',
				sdcard: payload?.sdcard ?? '-',
				online: Boolean($selectedVesselInfo?.online),
				sourcePage: 'Periodical Report'
			});

			console.log('[PERIODICAL_REPORT_DATA]', result);
		} catch (err) {
			console.error('[PERIODICAL_REPORT_ERROR]', err);
			error = err?.message || 'Failed to load the periodical report.';
			reportData = null;
			hasLoadedDateRange = false;
		} finally {
			loading = false;
		}
	}

	async function handleExportExcel() {
		if (!$selectedVesselId) {
			error = 'No vessel has been selected.';
			return;
		}

		if (!startDateTime || !endDateTime) {
			error = 'Start and End are required.';
			return;
		}

		exporting = true;
		error = '';

		try {
			const url = getPeriodicalReportExcelUrl({
				vesselId: $selectedVesselId,
				start: toApiDateTime(startDateTime),
				end: toApiDateTime(endDateTime),
				timezoneMode,
				timezoneOffset
			});

			const safeVesselName = String(vesselName || 'vessel')
				.replace(/[^\w\s-]/g, '')
				.replace(/\s+/g, '_');

			const safeStart = toApiDateTime(startDateTime).replace(/[:\s]/g, '-');
			const safeEnd = toApiDateTime(endDateTime).replace(/[:\s]/g, '-');

			await downloadApiFile(
				url,
				`Periodical_Report_${safeVesselName}_${safeStart}_${safeEnd}.xlsx`
			);
		} catch (err) {
			console.error('[PERIODICAL_EXPORT_ERROR]', err);
			error = err?.message || 'Failed to export the periodical report to Excel.';
		} finally {
			exporting = false;
		}
	}

	onMount(() => {
		const now = new Date();

		const start = new Date(now);
		start.setHours(8, 0, 0, 0);

		const end = new Date(now);
		end.setHours(17, 0, 0, 0);

		startDateTime = toLocalInputValue(start);
		endDateTime = toLocalInputValue(end);
	});

	$effect(() => {
		if (!active || currentUserLoaded || currentUserLoading) return;
		loadCurrentUser();
	});
</script>

<section class="periodical-page">
	<PeriodicalHeader
		bind:startDateTime
		bind:endDateTime
		bind:timezoneMode
		bind:timezoneOffset
		{vesselName}
		{autoTimezoneLabel}
		{loading}
		{exporting}
		exportDisabled={shouldShowDateRangeOverlay}
		onLoad={loadPeriodicalReport}
		onExport={handleExportExcel}
		onFilterChange={markDateFilterDirty}
	/>

	<div class="load-required-area" class:is-locked={shouldShowDateRangeOverlay}>
		{#if error}
			<div class="status-box error-box">
				{error}
			</div>
		{/if}

		{#if loading}
			<LoadingSkeleton
				label="Loading periodical report data"
				variant="periodical-report"
				rows={periodicalTableSkeletonRows}
				columns={periodicalFuelSkeletonColumns}
			/>
		{:else}
			<PeriodicalSummary
				{dataReceivedLabel}
				{engineFuelCards}
				{bunkerFuelLabel}
				{totalFuelLabel}
				{totalDistanceLabel}
				{outsideSafetyZoneLabel}
				{averageSpeedLabel}
				{maxSpeedLabel}
			/>

			{#if hasTravelDistance || literPerNmCards.length}
				<PeriodicalTravelDistance
					{totalDistanceLabel}
					{outsideSafetyZoneLabel}
					literPerNmCards={literPerNmCardLabels}
				/>
			{/if}

			<PeriodicalRuntimeTable rows={engineRuntimeTableRows} />

			<PeriodicalRpmTable
				tables={rpmRangeTables}
				bind:selectedKey={selectedRpmRuntimeFuelTableKey}
				show={canViewRpmRangeRuntimeFuelTable}
			/>

			<PeriodicalFuelTable
				sources={fuelTableSources}
				rows={fuelTableRows}
				robBunkerCards={robBunkerCardLabels}
				{hasRobBunkerData}
			/>

			<PeriodicalHighRpmTable
				show={canViewHighRpmLowSpeedTable}
				rows={highRpmLowSpeedTableRows}
				total={highRpmLowSpeedTotal}
			/>

			<PeriodicalSpeedStats {averageSpeedLabel} {maxSpeedLabel} />
		{/if}

		{#if shouldShowDateRangeOverlay}
			<PeriodicalLoadOverlay />
		{/if}
	</div>
</section>
