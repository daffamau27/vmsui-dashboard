<script>
	import { selectedVesselId, selectedVesselInfo } from '$lib/stores/selectedVessel.svelte.js';
	import { setPageStatus } from '$lib/stores/pageStatusStore.svelte.js';
	import { apiRequest } from '$lib/api/authApi.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import {
		getFuelManagementData,
		getFuelManagementHistory,
		saveFuelRob,
		applyFuelTransaction,
		deleteFuelTransaction,
		previewFuelVdor,
		saveFuelVdorImport,
		downloadVdorTemplate,
		getFuelVdorComparison
	} from '$lib/api/fuelManagementApi.js';
	import { TIMEZONE_MODE_OPTIONS, TIMEZONE_OFFSET_OPTIONS } from '$lib/utils/timezoneOptions.js';
	import { getAutoTimezoneLabelFromSources } from '$lib/utils/autoTimezoneLabel.js';

	let { active = true } = $props();

	let historyStartDate = $state(daysAgoDate(30));
	let historyEndDate = $state(todayDate());
	let timezoneMode = $state('auto');
	let timezoneOffset = $state('+07:00');
	let hasLoadedDateRange = $state(false);

	let loadingData = $state(false);
	let loadingHistory = $state(false);
	let currentUser = $state(null);
	let currentUserLoading = $state(false);
	let currentUserError = $state('');
	let actionLoading = $state('');
	let importPreviewLoading = $state(false);
	let importSaveLoading = $state(false);
	let vdorComparisonLoading = $state(false);

	let dashboardData = $state(null);
	let historyRows = $state([]);
	let historyPagination = $state({ total_items: 0, page: 1, limit: 10, total_pages: 1 });
	let historyPage = $state(1);
	let historyLimit = $state(10);

	let errorMessage = $state('');
	let historyError = $state('');
	let successMessage = $state('');
	let hideNoVesselNotice = $state(false);
	let selectedHistoryNote = $state(null);
	let showFuelOperationOverlay = $state(false);

	let robForm = $state({
		datetime: datetimeInputValue(),
		rob: '',
		note: ''
	});

	let transactionForm = $state({
		datetime: datetimeInputValue(),
		received: '',
		consumption: '',
		note: ''
	});

	let selectedImportFile = $state(null);
	let selectedImportFileName = $state('');
	let vdorDate = $state(todayDate());
	let vdorPreview = $state(null);
	let vdorStoredComparison = $state(null);
	let vdorComparisonError = $state('');
	let vdorImportNote = $state('Import VDOR Crew Report');
	let vdorPreviewRequestId = 0;
	let vdorComparisonRequestId = 0;
	let vdorFormVesselId = $state(0);
	let lastDashboardLoadKey = $state('');
	$effect(() => {
		if (!active) return;

		setPageStatus({
			pageKey: 'fuel-management',
			dataReceived: '-',
			sourcePage: 'Fuel Management'
		});
	});

	const tableConfigs = [
		{
			key: 'per_engine_system',
			title: 'Per Engine - System',
			description: 'Fuel usage from system basis.',
			permission: 'view_fuel_fms',
			columns: [
				{ label: 'Engine', field: 'engine', align: 'left' },
				{ label: 'Total', field: 'total', type: 'liter', align: 'right' }
			]
		},
		{
			key: 'per_engine_ems_internal',
			title: 'Per Engine - VMS',
			description: 'VMS fuel consumption by engine.',
			permission: 'view_fuel_ems_internal',
			columns: [
				{ label: 'Engine', field: 'engine', align: 'left' },
				{ label: 'Total', field: 'total', type: 'liter', align: 'right' }
			]
		},
		{
			key: 'per_engine_ems_external',
			title: 'Per Engine - EMS',
			description: 'EMS fuel consumption by engine.',
			permission: 'view_fuel_ems_external',
			columns: [
				{ label: 'Engine', field: 'engine', align: 'left' },
				{ label: 'Total', field: 'total', type: 'liter', align: 'right' }
			]
		},
		{
			key: 'per_engine_maker',
			title: 'Per Engine - Engine Maker',
			description: 'Fuel consumption from engine maker data.',
			permission: 'view_fuel_engine_maker',
			columns: [
				{ label: 'Engine', field: 'engine', align: 'left' },
				{ label: 'Total', field: 'total', type: 'liter', align: 'right' }
			]
		}
	];

	let currentVesselId = $derived(
		Number($selectedVesselId || $selectedVesselInfo?.vesselId || $selectedVesselInfo?.id || 0)
	);

	let currentVesselName = $derived(
		$selectedVesselInfo?.vesselName ||
			$selectedVesselInfo?.name ||
			dashboardData?.vessel_name ||
			'-'
	);

	let report = $derived(dashboardData || null);
	let fuelConsumption = $derived(report?.fuel_consumption || {});
	let perEngine = $derived(report?.fuel_consumption_per_engine || {});
	let vdorPreviewData = $derived(vdorPreview?.data || vdorPreview || null);
	let vdorPreviewConsumption = $derived(
		vdorPreviewData?.vdorConsumption ||
			vdorPreviewData?.vdor_consumption ||
			vdorPreviewData?.consumptionBreakdown ||
			vdorPreviewData?.consumption_breakdown ||
			vdorPreviewData?.parsed?.vdorConsumption ||
			vdorPreviewData?.parsed?.vdor_consumption ||
			null
	);
	let vdorPreviewDailyBlock = $derived(
		vdorPreviewData?.dailyConsumption ||
			vdorPreviewData?.daily_consumption ||
			vdorPreviewData?.vdorDailyConsumption ||
			vdorPreviewData?.vdor_daily_consumption ||
			vdorPreviewData?.dailyConsumptionBlock ||
			vdorPreviewData?.daily_consumption_block ||
			vdorPreviewData?.dailyBlock ||
			vdorPreviewData?.daily_block ||
			vdorPreviewData?.parsed?.dailyConsumption ||
			vdorPreviewData?.parsed?.daily_consumption ||
			null
	);
	let vdorPreviewLegacyComparison = $derived(
		normalizeVdorComparison(
			vdorPreviewData?.comparison || vdorPreviewData?.parsed?.comparison || null
		)
	);
	let vdorPreviewSystemComparison = $derived(
		vdorPreviewData?.systemComparison ||
			vdorPreviewData?.system_comparison ||
			vdorPreviewData?.parsed?.systemComparison ||
			vdorPreviewData?.parsed?.system_comparison ||
			null
	);
	let vdorPreviewSystemDaily = $derived(
		vdorPreviewSystemComparison?.dailySystem ||
			vdorPreviewSystemComparison?.daily_system ||
			null
	);
	let vdorPreviewIsFod = $derived(
		Boolean(
			vdorPreviewData?.isFod ??
				vdorPreviewData?.is_fod ??
				vdorPreviewSystemDaily?.isFod ??
				vdorPreviewSystemDaily?.is_fod
		)
	);
	let vdorPreviewVdorTotal = $derived(getStoredComparisonTotal(vdorPreviewConsumption || {}));
	let vdorPreviewSystemTotal = $derived(
		firstFuelNumber(
			vdorPreviewSystemComparison?.system_consumption_l,
			vdorPreviewSystemComparison?.systemConsumptionL,
			vdorPreviewSystemComparison?.daily_system_l,
			vdorPreviewSystemComparison?.dailySystemL,
			vdorPreviewLegacyComparison?.system_total,
			getStoredComparisonTotal(vdorPreviewSystemDaily || {})
		) ?? 0
	);
	let vdorPreviewDifference = $derived(
		firstFuelNumber(vdorPreviewLegacyComparison?.delta) ??
			vdorPreviewVdorTotal - vdorPreviewSystemTotal
	);
	let vdorPreviewDifferencePercent = $derived(
		firstFuelNumber(vdorPreviewLegacyComparison?.delta_percentage) ??
			(vdorPreviewSystemTotal
				? (vdorPreviewDifference / vdorPreviewSystemTotal) * 100
				: vdorPreviewDifference === 0
					? 0
					: null)
	);
	let vdorPreviewDifferenceRows = $derived(
		getPreviewComparisonRows(
			vdorPreviewConsumption || {},
			vdorPreviewSystemDaily || {},
			vdorPreviewIsFod
		)
	);
	let vdorDailySourceRows = $derived.by(() => [
		{
			key: 'lastNightRob',
			label: 'Fuel Last Night ROB',
			vdor: optionalFuelNumber(getVdorDailyValue('lastNightRob', 'last_night_rob')),
			system: optionalFuelNumber(getPreviewSystemValue('lastNightRob'))
		},
		{
			key: 'consumption',
			label: 'Consumption',
			vdor: optionalFuelNumber(getVdorDailyValue('consumption', 'consumption')),
			system: optionalFuelNumber(getPreviewSystemValue('consumption'))
		},
		{
			key: 'received',
			label: 'Received',
			vdor: optionalFuelNumber(getVdorDailyValue('received', 'received')),
			system: optionalFuelNumber(getPreviewSystemValue('received'))
		}
	]);
	let vdorStoredComparisonData = $derived(
		vdorStoredComparison?.data || vdorStoredComparison || null
	);
	let vdorStoredVdor = $derived(vdorStoredComparisonData?.vdor || {});
	let vdorStoredSystem = $derived(
		vdorStoredComparisonData?.daily_system || vdorStoredComparisonData?.dailySystem || {}
	);
	let vdorStoredVariance = $derived(vdorStoredComparisonData?.comparison || {});
	let vdorStoredIsFod = $derived(
		Boolean(vdorStoredComparisonData?.is_fod ?? vdorStoredComparisonData?.isFod)
	);
	let vdorStoredVdorTotal = $derived(getStoredComparisonTotal(vdorStoredVdor));
	let vdorStoredSystemTotal = $derived(getStoredComparisonTotal(vdorStoredSystem));
	let vdorStoredDifference = $derived(
		vdorStoredVariance?.total_difference_l ??
			vdorStoredVariance?.totalDifferenceL ??
			vdorStoredVdorTotal - vdorStoredSystemTotal
	);
	let vdorStoredPercentDifference = $derived(
		vdorStoredVariance?.total_percent_diff ?? vdorStoredVariance?.totalPercentDiff ?? null
	);
	let vdorStoredDifferenceRows = $derived(getStoredComparisonRows(vdorStoredVariance));
	let latestRobHeader = $derived(formatLiter(fuelConsumption?.fuel_rob));

	let canAccessDailyReport = $derived(hasPermission('access_daily_report'));

	let canViewFuelConsumptionTable = $derived(hasPermission('view_fuel_consumption_table'));

	let canViewFuelEcu = $derived(hasPermission('view_fuel_ecu'));
	let canViewFuelFms = $derived(hasPermission('view_fuel_fms'));
	let canViewFuelFod = $derived(hasPermission('view_fuel_fod'));
	let canViewFuelEmsInternal = $derived(hasPermission('view_fuel_ems_internal'));
	let canViewFuelEmsExternal = $derived(hasPermission('view_fuel_ems_external'));
	let canViewFuelEngineMaker = $derived(hasPermission('view_fuel_engine_maker'));

	let visibleEmsSourceCount = $derived.by(() => {
		let count = 0;

		if (canViewFuelEmsInternal) count += 1;
		if (canViewFuelEmsExternal) count += 1;

		return count;
	});

	function shouldShowEmsVariantName() {
		return Number(visibleEmsSourceCount || 0) > 1;
	}

	function getEmsDisplayLabel(type) {
		if (!shouldShowEmsVariantName()) return 'EMS';

		if (type === 'internal') return 'VMS';
		if (type === 'external') return 'EMS';

		return 'EMS';
	}

	function getTableTitle(config) {
		if (config?.key === 'per_engine_ems_internal') {
			return `Per Engine - ${getEmsDisplayLabel('internal')}`;
		}

		if (config?.key === 'per_engine_ems_external') {
			return `Per Engine - ${getEmsDisplayLabel('external')}`;
		}

		return config?.title || '-';
	}

	function getTableDescription(config) {
		if (
			!shouldShowEmsVariantName() &&
			(config?.key === 'per_engine_ems_internal' || config?.key === 'per_engine_ems_external')
		) {
			return 'EMS fuel consumption by engine.';
		}

		return config?.description || '';
	}

	function formatFuelSourceLabel(value) {
		const normalized = String(value || '').trim().toLowerCase();

		if (['fm', 'fms'].includes(normalized)) return 'FM';
		if (normalized === 'ecu') return 'ECU';
		if (['ems_internal', 'vms'].includes(normalized)) return 'VMS';
		if (['ems_external', 'ems'].includes(normalized)) return 'EMS';

		return normalized ? normalized.toUpperCase().replace(/_/g, ' ') : '-';
	}

	function isDailyConsumptionAction(action) {
		return String(action || '').trim().toLowerCase().includes('daily consumption');
	}

	function isFuelSourceChangeAction(action) {
		return String(action || '').trim().toLowerCase().includes('fuel source change');
	}

	function getHistoryActionSource(item) {
		if (isFuelSourceChangeAction(item?.action)) return item?.source || '';
		if (!isDailyConsumptionAction(item?.action)) return '';
		const label = formatFuelSourceLabel(item?.source);
		return label === '-' ? '' : label;
	}

	function formatHistoryDate(value) {
		if (!value || value === '-') return '-';
		const raw = String(value).trim();
		const timezone = raw.match(/\((UTC[+-]\d{1,2}(?::\d{2})?)\)/i)?.[1] || '';
		const cleaned = raw.replace(/\s*\(UTC[+-]\d{1,2}(?::\d{2})?\)\s*/i, '').trim();
		const dateOnlyMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);

		if (dateOnlyMatch) {
			const [, year, month, day] = dateOnlyMatch;
			const date = new Date(Number(year), Number(month) - 1, Number(day));

			if (!Number.isNaN(date.getTime())) {
				return new Intl.DateTimeFormat('en-US', {
					day: '2-digit',
					month: 'short',
					year: 'numeric'
				}).format(date);
			}
		}

		const localMatch = cleaned.match(
			/^(\d{1,2})\/(\d{1,2})\/(\d{4})[\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?/
		);
		const yearFirstLocalMatch = cleaned.match(
			/^(\d{4})-(\d{2})-(\d{2})[\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?/
		);

		if (localMatch) {
			const [, day, month, year, hour, minute, second = '00'] = localMatch;
			const date = new Date(
				Number(year),
				Number(month) - 1,
				Number(day),
				Number(hour),
				Number(minute),
				Number(second)
			);

			if (!Number.isNaN(date.getTime())) {
				const formatted = new Intl.DateTimeFormat('en-US', {
					day: '2-digit',
					month: 'short',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit',
					second: '2-digit',
					hour12: false
				}).format(date);
				return timezone ? `${formatted} ${timezone}` : formatted;
			}
		}

		if (yearFirstLocalMatch) {
			const [, year, month, day, hour, minute, second = '00'] = yearFirstLocalMatch;
			const date = new Date(
				Number(year),
				Number(month) - 1,
				Number(day),
				Number(hour),
				Number(minute),
				Number(second)
			);

			if (!Number.isNaN(date.getTime())) {
				const formatted = new Intl.DateTimeFormat('en-US', {
					day: '2-digit',
					month: 'short',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit',
					second: '2-digit',
					hour12: false
				}).format(date);
				return timezone ? `${formatted} ${timezone}` : formatted;
			}
		}

		const parsed = new Date(raw);
		if (!Number.isNaN(parsed.getTime())) {
			return new Intl.DateTimeFormat('en-US', {
				day: '2-digit',
				month: 'short',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				hour12: false
			}).format(parsed);
		}

		return raw;
	}

	let canManageRob = $derived(hasPermission('manage_fuel_rob'));
	let canManageTransactions = $derived(hasPermission('manage_fuel_transactions'));
	let canImportVdor = $derived(hasPermission('import_fuel_vdor'));
	let canManageFuelOperations = $derived(canManageRob || canManageTransactions || canImportVdor);
	let shouldShowDateRangeOverlay = $derived(!hasLoadedDateRange || !historyStartDate || !historyEndDate);
	let autoTimezoneLabel = $derived(
		getAutoTimezoneLabelFromSources(dashboardData, dashboardData?.data, $selectedVesselInfo)
	);

	function canViewTableConfig(config) {
		if (!canViewFuelConsumptionTable) return false;
		if (!config?.permission) return true;

		return hasPermission(config.permission);
	}

	let summaryCards = $derived.by(() => {
		const cards = [];

		if (canViewFuelConsumptionTable) {
			cards.push(
				{
					label: 'VDOR Consumption',
					value: formatLiter(fuelConsumption?.cons_vdor),
					note: 'Manual report basis'
				},
				{
					label: 'Daily Consumption',
					value: formatLiter(fuelConsumption?.daily_system),
					note: `Source: ${formatFuelSourceLabel(fuelConsumption?.daily_system_source)}`
				}
			);
		}

		if (canViewFuelEmsInternal) {
			cards.push({
				label: getEmsDisplayLabel('internal'),
				value: formatLiter(fuelConsumption?.fuel_ems_internal?.total),
				note: `AE ${formatNumber(fuelConsumption?.fuel_ems_internal?.ae)} L • ME ${formatNumber(
					fuelConsumption?.fuel_ems_internal?.me
				)} L`
			});
		}

		if (canViewFuelEmsExternal) {
			cards.push({
				label: getEmsDisplayLabel('external'),
				value: formatLiter(fuelConsumption?.fuel_ems_external?.total),
				note: `AE ${formatNumber(fuelConsumption?.fuel_ems_external?.ae)} L • ME ${formatNumber(
					fuelConsumption?.fuel_ems_external?.me
				)} L`
			});
		}

		if (canViewFuelEngineMaker) {
			cards.push({
				label: 'Engine Maker',
				value: formatLiter(fuelConsumption?.fuel_engine_maker?.total),
				note: `AE ${formatNumber(fuelConsumption?.fuel_engine_maker?.ae)} L • ME ${formatNumber(
					fuelConsumption?.fuel_engine_maker?.me
				)} L`
			});
		}

		return cards;
	});

	$effect(() => {
		if (!active) return;
		if (currentUser || currentUserLoading) return;

		loadCurrentUser();
	});

	$effect(() => {
		if (!active || !currentVesselId) return;

		const dashboardLoadKey = [
			currentVesselId,
			timezoneMode,
			timezoneMode === 'manual' ? timezoneOffset : 'auto'
		].join('|');

		if (lastDashboardLoadKey === dashboardLoadKey) return;

		lastDashboardLoadKey = dashboardLoadKey;
		loadDashboardCurrent();
	});

	$effect(() => {
		const vesselId = Number(currentVesselId || 0);
		if (vesselId === vdorFormVesselId) return;

		vdorFormVesselId = vesselId;
		vdorPreviewRequestId += 1;
		vdorComparisonRequestId += 1;
		importPreviewLoading = false;
		vdorComparisonLoading = false;
		selectedImportFile = null;
		selectedImportFileName = '';
		vdorPreview = null;
		vdorStoredComparison = null;
		vdorComparisonError = '';
	});

	function todayDate() {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function daysAgoDate(days = 0) {
		const date = new Date();
		date.setDate(date.getDate() - Number(days || 0));
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function datetimeInputValue(date = new Date()) {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hour = String(date.getHours()).padStart(2, '0');
		const minute = String(date.getMinutes()).padStart(2, '0');
		return `${year}-${month}-${day}T${hour}:${minute}`;
	}

	function toApiDatetime(value) {
		if (!value) return '';
		const normalized = value.replace('T', ' ');
		return normalized.length === 16 ? `${normalized}:00` : normalized;
	}

	function clearMessages() {
		errorMessage = '';
		historyError = '';
		successMessage = '';
	}

	function markDateFilterDirty() {
		hasLoadedDateRange = false;
		historyPage = 1;
	}

	function hasHistoryNote(item) {
		const note = String(item?.note ?? '').trim();
		return note !== '' && note !== '-';
	}

	function openHistoryNote(item) {
		if (!hasHistoryNote(item)) return;
		selectedHistoryNote = {
			date: item?.date || '-',
			formattedDate: formatHistoryDate(item?.date),
			action: item?.action || '-',
			user: item?.user || '-',
			note: String(item?.note || '').trim()
		};
	}

	function closeHistoryNote() {
		selectedHistoryNote = null;
	}

	function openFuelOperationOverlay() {
		showFuelOperationOverlay = true;
	}

	function closeFuelOperationOverlay() {
		showFuelOperationOverlay = false;
	}

	function getErrorMessage(err, fallback = 'An error occurred.') {
		return err?.data?.message || err?.response?.data?.message || err?.message || fallback;
	}

	function unwrapFuelHistoryPayload(response) {
		const payload = response?.data?.data || response?.data || response || {};
		const rawHistory = Array.isArray(payload?.history)
			? payload.history
			: Array.isArray(payload?.items)
				? payload.items
				: Array.isArray(payload)
					? payload
					: [];
		const history = normalizeFuelHistoryRows(rawHistory, payload?.timezone || '');
		const rawPagination = payload?.pagination || {};
		const totalItems = Number(
			rawPagination?.total_items ?? rawPagination?.totalItems ?? history.length
		);
		const currentPage = Number(rawPagination?.page ?? rawPagination?.currentPage ?? 1);
		const limitValue = Number(rawPagination?.limit ?? rawPagination?.pageSize ?? historyLimit);
		const totalPages = Number(rawPagination?.total_pages ?? rawPagination?.totalPages ?? 1);

		return {
			history,
			pagination: {
				total_items: Number.isFinite(totalItems) ? totalItems : history.length,
				page: Number.isFinite(currentPage) ? currentPage : 1,
				limit: Number.isFinite(limitValue) ? limitValue : historyLimit,
				total_pages: Number.isFinite(totalPages) ? totalPages : 1
			}
		};
	}

	function normalizeFuelHistoryRows(history = [], timezone = '') {
		return history.flatMap((dayItem) => {
			const transactions = Array.isArray(dayItem?.transactions) ? dayItem.transactions : [];
			const sources = Array.isArray(dayItem?.sources) ? dayItem.sources : [];
			const fallbackFuelSource =
				dayItem?.fuel_source ||
				dayItem?.fuelSource ||
				dayItem?.source ||
				dayItem?.daily_system_source ||
				dayItem?.dailySystemSource ||
				dayItem?.consumption_source ||
				dayItem?.consumptionSource ||
				'-';
			const dayStart = getHistoryDayBoundary(dayItem?.date, 'start', timezone);
			const dayEnd = getHistoryDayBoundary(dayItem?.date, 'end', timezone);
			const rawSourceSegments = sources
				.map((sourceItem) => ({
					...sourceItem,
					recorded_from: sourceItem?.recorded_from || sourceItem?.recordedFrom || '',
					recorded_until: sourceItem?.recorded_until || sourceItem?.recordedUntil || '',
					normalized_source: sourceItem?.fuel_source || sourceItem?.fuelSource || fallbackFuelSource
				}))
				.sort((a, b) => {
					const aTime = toHistorySortTime(a.recorded_from || a.recorded_until || dayStart);
					const bTime = toHistorySortTime(b.recorded_from || b.recorded_until || dayStart);
					return aTime - bTime;
				});
			const sourceSegments = rawSourceSegments.map((sourceItem, index) => {
				const previousSource = rawSourceSegments[index - 1] || null;
				const nextSource = rawSourceSegments[index + 1] || null;
				const resolvedFrom =
					sourceItem.recorded_from ||
					previousSource?.recorded_until ||
					previousSource?.recordedUntil ||
					dayStart;
				const resolvedUntil =
					sourceItem.recorded_until ||
					nextSource?.recorded_from ||
					nextSource?.recordedFrom ||
					dayEnd;

				return {
					...sourceItem,
					resolved_from: resolvedFrom || dayStart,
					resolved_until: resolvedUntil || dayEnd
				};
			});

			const dailyRows = sourceSegments.length
				? sourceSegments.map((sourceItem) => ({
						date: sourceItem.resolved_from || dayItem?.date || dayItem?.timestamp || '-',
						action: dayItem?.action || 'Daily Consumption',
						user: dayItem?.user || '-',
						received: 0,
						consumption:
							sourceItem?.consumption_l ??
							sourceItem?.consumptionL ??
							sourceItem?.consumption ??
							0,
						rob_after: dayItem?.rob_after ?? dayItem?.rob_end ?? dayItem?.robEnd ?? '-',
						rob_before: dayItem?.rob_before ?? dayItem?.rob_start ?? dayItem?.robStart ?? '-',
						note:
							sourceItem?.note ||
							dayItem?.note ||
							formatSourceRecordedRange(sourceItem.resolved_from, sourceItem.resolved_until),
						is_deletable: Boolean(dayItem?.is_deletable ?? false),
						id: dayItem?.id || '',
						source: sourceItem.normalized_source,
						recorded_from: sourceItem.resolved_from,
						recorded_until: sourceItem.resolved_until,
						period_label: formatSourceRecordedRange(
							sourceItem.resolved_from,
							sourceItem.resolved_until,
							'compact'
						),
						sort_time: toHistorySortTime(sourceItem.resolved_from || dayItem?.date)
					}))
				: [
						{
							date: dayStart || dayItem?.date || dayItem?.timestamp || '-',
							action: dayItem?.action || 'Daily Consumption',
							user: dayItem?.user || '-',
							received: dayItem?.received ?? 0,
							consumption:
								dayItem?.consumption ??
								dayItem?.consumption_l ??
								dayItem?.consumptionL ??
								0,
							rob_after: dayItem?.rob_after ?? dayItem?.rob_end ?? dayItem?.robEnd ?? '-',
							rob_before: dayItem?.rob_before ?? dayItem?.rob_start ?? dayItem?.robStart ?? '-',
							note: dayItem?.note || '-',
							is_deletable: Boolean(dayItem?.is_deletable ?? false),
							id: dayItem?.id || '',
							source: fallbackFuelSource,
							recorded_from: dayStart || '',
							recorded_until: dayEnd || '',
							period_label: formatSourceRecordedRange(dayStart, dayEnd, 'compact'),
							sort_time: toHistorySortTime(dayStart || dayItem?.date)
						}
					];

			const sourceChangeRows = sourceSegments.slice(1).map((sourceItem, index) => {
				const previousSource = sourceSegments[index];
				const previousLabel = formatFuelSourceLabel(previousSource?.normalized_source);
				const nextLabel = formatFuelSourceLabel(sourceItem?.normalized_source);
				const changeTime =
					sourceItem.recorded_from ||
					sourceItem.resolved_from ||
					previousSource?.recorded_until ||
					previousSource?.resolved_until ||
					dayItem?.date ||
					'-';

				return {
					date: changeTime,
					action: 'Fuel Source Change',
					user: '-',
					received: 0,
					consumption: 0,
					rob_after: dayItem?.rob_after ?? dayItem?.rob_end ?? dayItem?.robEnd ?? '-',
					rob_before: dayItem?.rob_before ?? dayItem?.rob_start ?? dayItem?.robStart ?? '-',
					note: `Fuel source changed from ${previousLabel} to ${nextLabel}.`,
					is_deletable: false,
					id: `source-change-${dayItem?.date || index}-${index}`,
					source: `${previousLabel} → ${nextLabel}`,
					recorded_from: changeTime,
					recorded_until: changeTime,
					sort_time: toHistorySortTime(changeTime) - 1
				};
			});

			const transactionRows = transactions.map((transaction) => {
				const quantity = Number(transaction?.quantity_l ?? transaction?.quantityL ?? 0);
				const type = String(transaction?.transaction_type || transaction?.transactionType || '').toUpperCase();
				const isConsumption = ['BOUT', 'CONSUMPTION', 'OUT'].includes(type);

				return {
					date: transaction?.timestamp || dayItem?.date || '-',
					action: transaction?.action || transaction?.transaction_type || '-',
					user: transaction?.user || '-',
					received: !isConsumption && quantity > 0 ? quantity : 0,
					consumption: isConsumption && quantity > 0 ? quantity : 0,
					rob_after: transaction?.rob_after ?? transaction?.robAfter ?? dayItem?.rob_end ?? '-',
					rob_before: transaction?.rob_before ?? transaction?.robBefore ?? dayItem?.rob_start ?? '-',
					note: transaction?.note || '-',
					is_deletable: Boolean(
						transaction?.is_deletable ?? transaction?.isDeletable ?? transaction?.id
					),
					id: transaction?.id || '',
					source:
						transaction?.fuel_source ||
						transaction?.fuelSource ||
						transaction?.source ||
						fallbackFuelSource,
					sort_time: toHistorySortTime(transaction?.timestamp || dayItem?.date)
				};
			});

			return [...dailyRows, ...sourceChangeRows, ...transactionRows].sort(
				(a, b) => Number(b?.sort_time || 0) - Number(a?.sort_time || 0)
			);
		});
	}

	function getHistoryDayBoundary(day, boundary = 'start', timezone = '') {
		const match = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
		if (!match) return '';

		const time = boundary === 'end' ? '23:59:59' : '00:00:00';
		const suffix = timezone ? ` (${timezone})` : '';
		return `${match[1]}-${match[2]}-${match[3]} ${time}${suffix}`;
	}

	function formatSourceRecordedRange(recordedFrom, recordedUntil, mode = 'sentence') {
		if (!recordedFrom && !recordedUntil) return '-';

		const from = recordedFrom ? formatHistoryDate(recordedFrom) : '-';
		const until = recordedUntil ? formatHistoryDate(recordedUntil) : '-';

		if (mode === 'compact') return `${from} - ${until}`;

		return `Recorded from ${from} until ${until}`;
	}

	function toHistorySortTime(value) {
		if (!value || value === '-') return 0;
		const raw = String(value).trim();
		const cleaned = raw.replace(/\s*\(UTC[+-]\d{1,2}(?::\d{2})?\)\s*/i, '').trim();
		const dateOnlyMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
		const dateTimeMatch = cleaned.match(
			/^(\d{4})-(\d{2})-(\d{2})[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?/
		);

		if (dateTimeMatch) {
			const [, year, month, day, hour, minute, second = '00'] = dateTimeMatch;
			return new Date(
				Number(year),
				Number(month) - 1,
				Number(day),
				Number(hour),
				Number(minute),
				Number(second)
			).getTime();
		}

		if (dateOnlyMatch) {
			const [, year, month, day] = dateOnlyMatch;
			return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
		}

		const parsed = new Date(raw).getTime();
		return Number.isFinite(parsed) ? parsed : 0;
	}

	async function loadCurrentUser() {
		if (currentUser || currentUserLoading) return currentUser;

		currentUserLoading = true;
		currentUserError = '';

		try {
			const response = await apiRequest('/users/current-user', {
				method: 'GET'
			});

			currentUser = response?.data || response?.user || response || null;

			console.log('[CURRENT_USER_PERMISSION][FUEL_MANAGEMENT]', currentUser);

			return currentUser;
		} catch (err) {
			console.error('[CURRENT_USER_PERMISSION_ERROR][FUEL_MANAGEMENT]', err);
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

	async function loadDashboardFor({ vesselId, mode, offset }) {
		loadingData = true;
		errorMessage = '';

		try {
			const response = await getFuelManagementData({
				vesselId,
				timezoneMode: mode,
				timezoneOffset: offset
			});

			dashboardData = response?.data || response || null;
		} catch (err) {
			console.error('[FUEL_MANAGEMENT][DATA][ERROR]', err);
			dashboardData = null;
			errorMessage = getErrorMessage(err, 'Failed to load Fuel Management data.');
		} finally {
			loadingData = false;
		}
	}

	async function loadHistoryFor({ vesselId, startDate, endDate, mode, offset, page = 1, limit = 10 }) {
		loadingHistory = true;
		historyError = '';

		try {
			const response = await getFuelManagementHistory({
				vesselId,
				startDate,
				endDate,
				timezoneMode: mode,
				timezoneOffset: offset,
				page,
				limit
			});
			const payload = unwrapFuelHistoryPayload(response);

			historyRows = Array.isArray(payload?.history) ? payload.history : [];
			historyPagination = payload?.pagination || {
				total_items: historyRows.length,
				page,
				limit,
				total_pages: 1
			};
			historyPage = Number(historyPagination?.page || page || 1);
		} catch (err) {
			console.error('[FUEL_MANAGEMENT][HISTORY][ERROR]', err);
			historyRows = [];
			historyPagination = { total_items: 0, page, limit, total_pages: 1 };
			historyError = getErrorMessage(err, 'Failed to load Fuel Management history.');
		} finally {
			loadingHistory = false;
		}
	}

	async function loadDashboardCurrent() {
		if (!currentVesselId) {
			dashboardData = null;
			return;
		}

		await loadDashboardFor({
			vesselId: currentVesselId,
			mode: timezoneMode,
			offset: timezoneOffset
		});
	}

	async function loadHistoryCurrent(page = historyPage) {
		if (!currentVesselId || !historyStartDate || !historyEndDate) {
			hasLoadedDateRange = false;
			return;
		}

		historyPage = Number(page || 1);

		await loadHistoryFor({
			vesselId: currentVesselId,
			startDate: historyStartDate,
			endDate: historyEndDate,
			mode: timezoneMode,
			offset: timezoneOffset,
			page: historyPage,
			limit: historyLimit
		});

		hasLoadedDateRange = true;
	}

	async function refreshCurrent(page = historyPage) {
		await Promise.all([loadDashboardCurrent(), loadHistoryCurrent(page)]);
	}

	async function submitRob() {
		clearMessages();

		if (!canManageRob) {
			errorMessage = 'This account does not have permission to manage Fuel ROB.';
			return;
		}

		if (!currentVesselId) {
			errorMessage = 'Please select a vessel first.';
			return;
		}

		if (!robForm.datetime || robForm.rob === '' || Number.isNaN(Number(robForm.rob))) {
			errorMessage = 'Datetime and ROB value must be filled in correctly.';
			return;
		}

		actionLoading = 'rob';

		try {
			const response = await saveFuelRob({
				vesselId: currentVesselId,
				datetime: toApiDatetime(robForm.datetime),
				rob: robForm.rob,
				note: robForm.note
			});

			successMessage = response?.message || 'Fuel ROB saved successfully.';
			robForm.rob = '';
			robForm.note = '';
			await refreshCurrent();
		} catch (err) {
			console.error('[FUEL_MANAGEMENT][SAVE_ROB][ERROR]', err);
			errorMessage = getErrorMessage(err, 'Failed to save Fuel ROB.');
		} finally {
			actionLoading = '';
		}
	}

	async function submitTransaction() {
		clearMessages();

		if (!canManageTransactions) {
			errorMessage = 'This account does not have permission to manage fuel transactions.';
			return;
		}

		if (!currentVesselId) {
			errorMessage = 'Please select a vessel first.';
			return;
		}

		const received = Number(transactionForm.received || 0);
		const consumption = Number(transactionForm.consumption || 0);

		if (!transactionForm.datetime) {
			errorMessage = 'Transaction datetime is required.';
			return;
		}

		if (received <= 0 && consumption <= 0) {
			errorMessage =
				'Fill in one value only: Received for Bunkering In or Consumption for Bunkering Out.';
			return;
		}

		if (received > 0 && consumption > 0) {
			errorMessage =
				'Use only one field. Received is for Bunkering In, while Consumption is for Bunkering Out.';
			return;
		}

		actionLoading = 'transaction';

		try {
			const response = await applyFuelTransaction({
				vesselId: currentVesselId,
				datetime: toApiDatetime(transactionForm.datetime),
				received,
				consumption,
				note: transactionForm.note
			});

			successMessage = response?.message || 'Fuel transaction saved successfully.';
			transactionForm.received = '';
			transactionForm.consumption = '';
			transactionForm.note = '';
			await refreshCurrent();
		} catch (err) {
			console.error('[FUEL_MANAGEMENT][TRANSACTION][ERROR]', err);
			errorMessage = getErrorMessage(err, 'Failed to save fuel transaction.');
		} finally {
			actionLoading = '';
		}
	}

	async function removeTransaction(item) {
		clearMessages();

		if (!canManageTransactions) {
			errorMessage = 'This account does not have permission to manage fuel transactions.';
			return;
		}

		if (!item?.id || !item?.is_deletable) return;
		if (!window.confirm(`Delete transaction ${item.action} on ${item.date}?`)) return;

		actionLoading = `delete-${item.id}`;

		try {
			const response = await deleteFuelTransaction(item.id);
			successMessage = response?.message || 'Transaction deleted successfully.';
			await refreshCurrent();
		} catch (err) {
			console.error('[FUEL_MANAGEMENT][DELETE][ERROR]', err);
			errorMessage = getErrorMessage(err, 'Failed to delete transaction.');
		} finally {
			actionLoading = '';
		}
	}

	function handleFileInput(event) {
		const file = event?.target?.files?.[0];
		selectedImportFile = file || null;
		selectedImportFileName = file?.name || '';
		vdorPreviewRequestId += 1;
		importPreviewLoading = false;
		vdorPreview = null;
	}

	function handleVdorDateChange() {
		clearMessages();
		vdorStoredComparison = null;
		vdorComparisonError = '';
	}

	async function loadStoredVdorComparison(vesselId = currentVesselId, date = vdorDate) {
		const effectiveVesselId = Number(vesselId || 0);
		const effectiveDate = String(date || '').trim();

		if (!effectiveVesselId || !effectiveDate || !canImportVdor) return;

		const requestId = ++vdorComparisonRequestId;
		vdorComparisonLoading = true;
		vdorComparisonError = '';

		try {
			const response = await getFuelVdorComparison({
				vesselId: effectiveVesselId,
				date: effectiveDate
			});

			if (requestId !== vdorComparisonRequestId) return;
			vdorStoredComparison = response;
		} catch (err) {
			if (requestId !== vdorComparisonRequestId) return;
			console.error('[FUEL_MANAGEMENT][VDOR_COMPARISON][ERROR]', err);
			vdorStoredComparison = null;
			vdorComparisonError = getErrorMessage(
				err,
				'Failed to load VDOR and system data for this date.'
			);
		} finally {
			if (requestId === vdorComparisonRequestId) vdorComparisonLoading = false;
		}
	}

	function refreshStoredVdorComparison() {
		if (!currentVesselId || !vdorDate || vdorComparisonLoading) return;

		void loadStoredVdorComparison(currentVesselId, vdorDate);
	}

	function fileToBase64(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				const result = String(reader.result || '');
				resolve(result.includes(',') ? result.split(',')[1] : result);
			};
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(file);
		});
	}

	function normalizeDateOnly(value) {
		const text = String(value || '').trim();
		if (!text) return '';

		const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
		if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

		const localMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
		if (localMatch) {
			return `${localMatch[3]}-${String(localMatch[2]).padStart(2, '0')}-${String(localMatch[1]).padStart(2, '0')}`;
		}

		return '';
	}

	function getVdorPreviewDate(payload = vdorPreviewData) {
		return normalizeDateOnly(
			payload?.date ||
				payload?.reportDate ||
				payload?.report_date ||
				payload?.targetDate ||
				payload?.target_date ||
				payload?.dailyConsumption?.date ||
				payload?.daily_consumption?.date ||
				payload?.parsed?.date ||
				payload?.parsed?.reportDate ||
				payload?.parsed?.report_date
		);
	}

	function optionalFuelNumber(value) {
		const number = parseFuelNumber(value);
		return Number.isFinite(number) ? number : null;
	}

	function firstFuelNumber(...values) {
		for (const value of values) {
			const number = optionalFuelNumber(value);
			if (number !== null) return number;
		}

		return null;
	}

	function getVdorDetail(source, camelKey, snakeKey) {
		return source?.[camelKey] || source?.[snakeKey] || {};
	}

	function getVdorBreakdown(detail) {
		return Array.isArray(detail?.breakdown)
			? detail.breakdown
			: Array.isArray(detail?.details)
				? detail.details
				: [];
	}

	function getStoredComparisonTotal(source) {
		return (
			optionalFuelNumber(
				source?.total_consumption_l ??
					source?.totalConsumptionL ??
					source?.total_engines_consumption_l ??
					source?.totalEnginesConsumptionL ??
					source?.total_fuel_consumption_l ??
					source?.totalFuelConsumptionL ??
					source?.total_tank_consumption_l ??
					source?.totalTankConsumptionL ??
					source?.total_tanks_consumption_l ??
					source?.totalTanksConsumptionL
			) ?? 0
		);
	}

	function getStoredComparisonRows(comparison) {
		const rows =
			comparison?.per_engine_diff ??
			comparison?.perEngineDiff ??
			comparison?.per_tank_diff ??
			comparison?.perTankDiff ??
			[];

		if (!Array.isArray(rows)) return [];

		return rows.map((item) => {
			const vdorValue =
				optionalFuelNumber(item?.vdor_consumption_l ?? item?.vdorConsumptionL) ?? 0;
			const systemValue =
				optionalFuelNumber(
					item?.daily_system_consumption_l ??
						item?.dailySystemConsumptionL ??
						item?.system_consumption_l ??
						item?.systemConsumptionL
				) ?? 0;

			return {
				label: item?.label || item?.engine_name || item?.engineName || item?.tank_name || item?.tankName || '-',
				vdor: vdorValue,
				system: systemValue,
				difference:
					optionalFuelNumber(item?.difference_l ?? item?.differenceL) ?? vdorValue - systemValue
			};
		});
	}

	function normalizeVdorDetailForSave(detail, includeHours = false) {
		const breakdown = getVdorBreakdown(detail).map((item) => {
			const normalized = {
				label: item?.label || item?.engineName || item?.engine_name || item?.tankName || item?.tank_name || '-',
				consumption_l: optionalFuelNumber(
					item?.consumption_l ?? item?.consumptionL ?? item?.consumption
				) ?? 0
			};

			if (includeHours) normalized.hours = String(item?.hours ?? item?.runtime ?? '');
			return normalized;
		});

		return {
			total:
				optionalFuelNumber(detail?.total ?? detail?.total_l ?? detail?.totalL) ??
				breakdown.reduce((sum, item) => sum + Number(item.consumption_l || 0), 0),
			breakdown
		};
	}

	function buildVdorConsumptionForSave() {
		const source = vdorPreviewConsumption || vdorPreviewData || {};
		const mainEnginesDetail = normalizeVdorDetailForSave(
			getVdorDetail(source, 'mainEnginesDetail', 'main_engines_detail'),
			true
		);
		const otherEnginesDetail = normalizeVdorDetailForSave(
			getVdorDetail(source, 'otherEnginesDetail', 'other_engines_detail'),
			true
		);
		const tankDetail = normalizeVdorDetailForSave(
			getVdorDetail(source, 'tankDetail', 'tank_detail')
		);
		const calculatedTotal = mainEnginesDetail.total + otherEnginesDetail.total + tankDetail.total;

		return {
			totalEnginesConsumption:
				optionalFuelNumber(
					source?.totalEnginesConsumption ??
						source?.total_engines_consumption ??
						source?.totalConsumption ??
						source?.total_consumption
				) ?? calculatedTotal,
			mainEnginesDetail,
			otherEnginesDetail,
			tankDetail
		};
	}

	function normalizeVdorComparison(value) {
		if (!value || typeof value !== 'object') return null;

		return {
			system_total:
				value?.system_total ??
				value?.systemTotal ??
				value?.current_system_total ??
				value?.currentSystemTotal ??
				value?.system_consumption_l ??
				value?.systemConsumptionL,
			vdor_basis:
				value?.vdor_basis ??
				value?.vdorBasis ??
				value?.vdor_consumption_l ??
				value?.vdorConsumptionL ??
				value?.vdor_total ??
				value?.vdorTotal,
			delta: value?.delta ?? value?.difference_l ?? value?.differenceL ?? value?.difference,
			delta_percentage:
				value?.delta_percentage ??
				value?.deltaPercentage ??
				value?.difference_percentage ??
				value?.differencePercentage
		};
	}

	function getVdorDailyValue(camelKey, snakeKey) {
		const directValue =
			vdorPreviewDailyBlock?.[camelKey] ??
			vdorPreviewDailyBlock?.[snakeKey] ??
			vdorPreviewData?.[camelKey] ??
			vdorPreviewData?.[snakeKey];

		if (directValue !== undefined && directValue !== null) return directValue;

		if (camelKey === 'consumption') {
			return (
				vdorPreviewDailyBlock?.consumptionTransaction ??
				vdorPreviewDailyBlock?.consumption_transaction ??
				null
			);
		}

		if (camelKey === 'received') {
			return (
				vdorPreviewDailyBlock?.receivedTransaction ??
				vdorPreviewDailyBlock?.received_transaction ??
				null
			);
		}

		return null;
	}

	function getPreviewSystemValue(key) {
		if (key === 'lastNightRob') {
			return firstFuelNumber(
				vdorPreviewSystemComparison?.system_opening_rob,
				vdorPreviewSystemComparison?.systemOpeningRob,
				vdorPreviewSystemDaily?.opening_rob_l,
				vdorPreviewSystemDaily?.openingRobL
			);
		}

		if (key === 'consumption') {
			return firstFuelNumber(
				vdorPreviewSystemComparison?.system_consumption_l,
				vdorPreviewSystemComparison?.systemConsumptionL,
				vdorPreviewSystemComparison?.daily_system_l,
				vdorPreviewSystemComparison?.dailySystemL,
				vdorPreviewSystemDaily?.total_consumption_l,
				vdorPreviewSystemDaily?.totalConsumptionL
			);
		}

		if (key === 'received') {
			return firstFuelNumber(
				vdorPreviewSystemComparison?.system_received_l,
				vdorPreviewSystemComparison?.systemReceivedL,
				vdorPreviewSystemDaily?.received_l,
				vdorPreviewSystemDaily?.receivedL,
				vdorPreviewSystemDaily?.received
			);
		}

		if (key === 'midnightRob') {
			return firstFuelNumber(
				vdorPreviewSystemComparison?.system_closing_rob,
				vdorPreviewSystemComparison?.systemClosingRob,
				vdorPreviewSystemDaily?.closing_rob_l,
				vdorPreviewSystemDaily?.closingRobL
			);
		}

		return null;
	}

	function getSystemDailyValue(key) {
		const row = vdorDailySourceRows.find((item) => item.key === key);
		return row?.system ?? null;
	}

	async function previewImportVdor() {
		clearMessages();

		if (!canImportVdor) {
			errorMessage = 'This account does not have permission to import VDOR.';
			return;
		}

		if (!currentVesselId) {
			errorMessage = 'Please select a vessel first.';
			return;
		}

		if (!selectedImportFile) {
			errorMessage = 'Please select a VDOR Excel file first.';
			return;
		}

		importPreviewLoading = true;
		vdorPreview = null;
		const requestId = ++vdorPreviewRequestId;

		try {
			const fileBase64 = await fileToBase64(selectedImportFile);
			const response = await previewFuelVdor({ vesselId: currentVesselId, fileBase64 });
			if (requestId !== vdorPreviewRequestId) return;

			vdorPreview = response;
			successMessage = response?.message || 'VDOR preview generated successfully.';
		} catch (err) {
			if (requestId !== vdorPreviewRequestId) return;
			console.error('[FUEL_MANAGEMENT][PREVIEW_VDOR][ERROR]', err);
			errorMessage = getErrorMessage(
				err,
				'Failed to preview VDOR. Make sure the file uses the correct Excel template.'
			);
		} finally {
			if (requestId === vdorPreviewRequestId) importPreviewLoading = false;
		}
	}

	async function submitImportVdor() {
		clearMessages();

		if (!canImportVdor || !currentVesselId || !vdorPreviewData) {
			errorMessage = 'Generate and review the VDOR preview before importing.';
			return;
		}

		const previewDate = getVdorPreviewDate();
		if (!previewDate) {
			errorMessage = 'The VDOR preview does not contain a valid report date.';
			return;
		}

		importSaveLoading = true;

		try {
			const lastNightRob = getSystemDailyValue('lastNightRob');
			const consumptionTransaction = getSystemDailyValue('consumption');
			const receivedTransaction = getSystemDailyValue('received');

			const response = await saveFuelVdorImport({
				vesselId: Number(currentVesselId),
				date: previewDate,
				vdorConsumption: buildVdorConsumptionForSave(),
				lastNightRob,
				consumptionTransaction,
				receivedTransaction,
				note: vdorImportNote.trim() || 'Import VDOR Crew Report'
			});

			successMessage = response?.message || 'VDOR data saved successfully.';
			selectedImportFile = null;
			selectedImportFileName = '';
			vdorPreview = null;
			vdorDate = previewDate;
			await refreshCurrent();
			await loadStoredVdorComparison(currentVesselId, previewDate);
		} catch (err) {
			console.error('[FUEL_MANAGEMENT][SAVE_VDOR][ERROR]', err);
			errorMessage = getErrorMessage(err, 'Failed to save the VDOR import.');
		} finally {
			importSaveLoading = false;
		}
	}

	async function downloadTemplate() {
		clearMessages();

		if (!canImportVdor) {
			errorMessage = 'This account does not have permission to download the VDOR template.';
			return;
		}

		if (!currentVesselId || !vdorDate) {
			errorMessage = 'Please select a vessel and VDOR date first.';
			return;
		}

		actionLoading = 'template';

		try {
			const response = await downloadVdorTemplate({
				vesselId: currentVesselId,
				date: vdorDate,
				timezoneMode,
				timezoneOffset
			});

			if (!(response instanceof Response)) {
				throw new Error('The VDOR template endpoint did not return a file response.');
			}

			const contentType = String(response.headers.get('content-type') || '').toLowerCase();
			const contentDisposition = response.headers.get('content-disposition') || '';
			const blob = await response.blob();

			if (
				contentType.includes('application/json') ||
				contentType.includes('text/html') ||
				contentType.includes('text/plain')
			) {
				const text = await blob.text();
				let message = text;

				try {
					const payload = JSON.parse(text);
					message = payload?.message || payload?.error || text;
				} catch {
					// Use the plain response text as the error message.
				}

				throw new Error(message || 'The server returned an invalid VDOR template response.');
			}

			const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
			const isZipXlsx =
				signature[0] === 0x50 &&
				signature[1] === 0x4b &&
				(signature[2] === 0x03 || signature[2] === 0x05 || signature[2] === 0x07) &&
				(signature[3] === 0x04 || signature[3] === 0x06 || signature[3] === 0x08);

			if (!isZipXlsx) {
				throw new Error('The server response is not a valid XLSX file.');
			}

			const encodedFileName =
				contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1] ||
				contentDisposition.match(/filename="?([^";]+)"?/i)?.[1];
			const safeVesselName = String(currentVesselName || 'vessel')
				.replace(/[^a-z0-9_-]+/gi, '_')
				.replace(/^_+|_+$/g, '');
			const fileName = encodedFileName
				? decodeURIComponent(encodedFileName)
				: `vdor_${safeVesselName || 'vessel'}_${vdorDate}.xlsx`;

			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = fileName.toLowerCase().endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			window.setTimeout(() => URL.revokeObjectURL(url), 1000);

			successMessage = `VDOR template for ${vdorDate} downloaded. Complete it, then upload the file in step 02.`;
		} catch (err) {
			console.error('[FUEL_MANAGEMENT][DOWNLOAD_TEMPLATE][ERROR]', err);
			errorMessage = getErrorMessage(err, 'Failed to download the VDOR template.');
		} finally {
			actionLoading = '';
		}
	}

	function loadHistoryPage(page) {
		if (!currentVesselId || !historyStartDate || !historyEndDate) return;
		const safePage = Math.max(
			1,
			Math.min(Number(page || 1), Number(historyPagination?.total_pages || 1))
		);
		loadHistoryCurrent(safePage);
	}

	function getSection(key) {
		return perEngine?.[key] || null;
	}

	function getRows(key) {
		const rows = getSection(key)?.details;
		return Array.isArray(rows) ? rows : [];
	}

	function hasSectionRows(key) {
		return getRows(key).length > 0;
	}

	function formatValue(value, type = 'text') {
		if (type === 'liter') return formatLiter(value);
		if (value === null || value === undefined || value === '') return '-';
		return value;
	}

	function formatNumber(value, digits = 2) {
		if (value === null || value === undefined || value === '') return '-';
		const number = parseFuelNumber(value);
		if (!Number.isFinite(number)) return '-';
		return number.toLocaleString('en-US', {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits
		});
	}

	function formatLiter(value) {
		const formatted = formatNumber(value);
		return formatted === '-' ? '-' : `${formatted} L`;
	}

	function parseFuelNumber(value) {
		if (value === null || value === undefined || value === '') return NaN;
		if (typeof value === 'number') return value;

		const normalized = String(value)
			.trim()
			.replace(/,/g, '')
			.replace(/\s*l(?:iter|itre)?s?\.?\s*$/i, '');
		const number = Number(normalized);

		return Number.isFinite(number) ? number : NaN;
	}

	function hasPositiveFuelValue(value) {
		const number = parseFuelNumber(value);
		return Number.isFinite(number) && number > 0;
	}

	function flattenVdorComparisonRows(source, isFod = false) {
		const groups = isFod
			? [{ key: 'tank', detail: getVdorDetail(source, 'tankDetail', 'tank_detail') }]
			: [
					{
						key: 'main',
						detail: getVdorDetail(source, 'mainEnginesDetail', 'main_engines_detail')
					},
					{
						key: 'other',
						detail: getVdorDetail(source, 'otherEnginesDetail', 'other_engines_detail')
					}
				];

		return groups.flatMap(({ key, detail }) =>
			getVdorBreakdown(detail).map((item) => {
				const label =
					item?.label || item?.engine_name || item?.engineName || item?.tank_name || item?.tankName || '-';

				return {
					key: `${key}:${String(label).trim().toLowerCase()}`,
					label,
					value:
						optionalFuelNumber(
							item?.consumption_l ?? item?.consumptionL ?? item?.consumption
						) ?? 0
				};
			})
		);
	}

	function getPreviewComparisonRows(vdorSource, systemSource, isFod = false) {
		const vdorRows = flattenVdorComparisonRows(vdorSource, isFod);
		const systemRows = flattenVdorComparisonRows(systemSource, isFod);
		const rowsByKey = new Map();

		for (const row of vdorRows) {
			rowsByKey.set(row.key, { label: row.label, vdor: row.value, system: 0 });
		}

		for (const row of systemRows) {
			const existing = rowsByKey.get(row.key) || { label: row.label, vdor: 0, system: 0 };
			existing.system = row.value;
			rowsByKey.set(row.key, existing);
		}

		return [...rowsByKey.values()].map((row) => ({
			...row,
			difference: Number(row.vdor || 0) - Number(row.system || 0)
		}));
	}

	function deltaClass(value) {
		const number = Number(value || 0);
		if (number > 0) return 'positive';
		if (number < 0) return 'negative';
		return 'neutral';
	}
</script>

<section class="fuel-management-page">
	<header class="fuel-header-card">
		<div>
			<div class="page-kicker">Fuel Management</div>
			<h1>{currentVesselName}</h1>
			<p>Fuel ROB logs, bunkering transactions, VDOR imports, and fuel comparison by engine.</p>
		</div>

		<div class="header-actions">
			<div class="header-rob-card">
				<span>Latest ROB</span>
				<strong>{loadingData ? 'Loading...' : latestRobHeader}</strong>
			</div>
		</div>
	</header>

	{#if (!currentVesselId && !hideNoVesselNotice) || errorMessage || successMessage}
		<div class="fuel-toast-layer" aria-live="polite">
			{#if !currentVesselId && !hideNoVesselNotice}
				<div class="fuel-toast warning">
					<div>
						<strong>No vessel selected</strong>
						<span>Please select a vessel first to display Fuel Management data.</span>
					</div>
					<button
						type="button"
						class="toast-close"
						onclick={() => (hideNoVesselNotice = true)}
						aria-label="Close notification">×</button
					>
				</div>
			{/if}

			{#if errorMessage}
				<div class="fuel-toast danger">
					<div>
						<strong>Action failed</strong>
						<span>{errorMessage}</span>
					</div>
					<button
						type="button"
						class="toast-close"
						onclick={() => (errorMessage = '')}
						aria-label="Close notification">×</button
					>
				</div>
			{/if}

			{#if successMessage}
				<div class="fuel-toast success">
					<div>
						<strong>Action success</strong>
						<span>{successMessage}</span>
					</div>
					<button
						type="button"
						class="toast-close"
						onclick={() => (successMessage = '')}
						aria-label="Close notification">×</button
					>
				</div>
			{/if}
		</div>
	{/if}

	<section class="summary-grid">
		{#if loadingData}
			<LoadingSkeleton
				label="Loading fuel summary"
				variant="fuel-summary"
				rows={summaryCards.length || 4}
			/>
		{:else}
			{#each summaryCards as card}
				<article class="summary-card">
					<span>{card.label}</span>
					<strong>{card.value}</strong>
					<small>{card.note}</small>
				</article>
			{/each}
		{/if}
	</section>

	<section class="table-grid">
		{#each tableConfigs.filter(canViewTableConfig) as config}
			<article class="panel table-panel">
				<div class="panel-header">
					<div>
						<h2>{getTableTitle(config)}</h2>
						<p>{getTableDescription(config)}</p>
					</div>
					{#if getSection(config.key)?.grand_total !== undefined}
						<span class="badge">Total {formatLiter(getSection(config.key)?.grand_total)}</span>
					{/if}
				</div>

				{#if loadingData}
					<LoadingSkeleton
						label={`Loading ${getTableTitle(config)}`}
						variant="fuel-table"
						rows={5}
						columns={config.columns.length}
					/>
				{:else if hasSectionRows(config.key)}
					<div class="table-wrap">
						<table>
							<thead>
								<tr>
									{#each config.columns as column}
										<th class:right={column.align === 'right'}>{column.label}</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each getRows(config.key) as row}
									<tr>
										{#each config.columns as column}
											<td class:right={column.align === 'right'}
												>{formatValue(row?.[column.field], column.type)}</td
											>
										{/each}
									</tr>
								{/each}
							</tbody>
							<tfoot>
								{#if getSection(config.key)?.subtotal_ae !== undefined}
									<tr>
										<td colspan={config.columns.length - 1}>Subtotal AE</td>
										<td class="right">{formatLiter(getSection(config.key)?.subtotal_ae)}</td>
									</tr>
								{/if}
								{#if getSection(config.key)?.subtotal_me !== undefined}
									<tr>
										<td colspan={config.columns.length - 1}>Subtotal ME</td>
										<td class="right">{formatLiter(getSection(config.key)?.subtotal_me)}</td>
									</tr>
								{/if}
								<tr>
									<td colspan={config.columns.length - 1}>Grand Total</td>
									<td class="right">{formatLiter(getSection(config.key)?.grand_total)}</td>
								</tr>
							</tfoot>
						</table>
					</div>
				{:else}
					<div class="empty-state">
						Data is not available or permission for this table has not been granted.
					</div>
				{/if}
			</article>
		{/each}
	</section>

	<section class="panel history-panel">
		<div class="panel-header">
			<div>
				<h2>Fuel History Timeline</h2>
				<p>ROB transactions, carry over, daily consumption, and deletable bunkering logs.</p>
			</div>

			<div class="history-toolbar">
				<div class="history-filters">
					<label>
						<span>Start Date</span>
						<input type="date" bind:value={historyStartDate} onchange={markDateFilterDirty} />
					</label>

					<label>
						<span>End Date</span>
						<input type="date" bind:value={historyEndDate} onchange={markDateFilterDirty} />
					</label>

					<label>
						<span class="field-label-row">
							Timezone
							{#if timezoneMode === 'auto'}
								<small class="timezone-auto-pill">Auto • {autoTimezoneLabel}</small>
							{/if}
						</span>
						<select bind:value={timezoneMode} onchange={markDateFilterDirty}>
							{#each TIMEZONE_MODE_OPTIONS as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</label>

					{#if timezoneMode === 'manual'}
						<label class="offset-field">
							<span>Offset</span>
							<select bind:value={timezoneOffset} onchange={markDateFilterDirty}>
								{#each TIMEZONE_OFFSET_OPTIONS as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</label>
					{/if}
				</div>

				<button
					class="primary-button history-load-button"
					type="button"
					onclick={() => loadHistoryCurrent(1)}
					disabled={loadingHistory || !historyStartDate || !historyEndDate}
				>
					{loadingHistory ? 'Loading...' : 'Load History'}
				</button>

				<button
					class="secondary-button history-operation-button"
					type="button"
					onclick={openFuelOperationOverlay}
				>
					Fuel Operations
				</button>
			</div>
		</div>

		<div class="history-load-area load-required-area" class:is-locked={shouldShowDateRangeOverlay}>
			{#if historyError}
				<div class="alert danger compact">{historyError}</div>
			{/if}

			{#if loadingHistory}
				<LoadingSkeleton label="Loading fuel history" variant="fuel-history" rows={6} columns={7} />
			{:else if historyRows.length}
				<div class="table-wrap">
					<table>
						<thead>
							<tr>
								<th>Date</th>
								<th>Action</th>
								<th>User</th>
								<th class="right">Fuel Movement</th>
								<th class="right">ROB After</th>
								<th>Note</th>
								<!-- <th class="right">Action</th> -->
							</tr>
						</thead>
						<tbody>
							{#each historyRows as item}
								<tr>
									<td>
										<div class="history-date-cell">
											<strong>{formatHistoryDate(item.date)}</strong>
											{#if item.period_label}
												<small>{item.period_label}</small>
											{/if}
										</div>
									</td>
									<td>
										<span
											class="action-chip"
											class:has-source={getHistoryActionSource(item)}
											class:is-source-change={isFuelSourceChangeAction(item.action)}
										>
											<strong>{item.action || '-'}</strong>
											{#if getHistoryActionSource(item)}
												<small>{getHistoryActionSource(item)}</small>
											{/if}
										</span>
									</td>
									<td>{item.user || '-'}</td>
									<td class="right">
										{#if hasPositiveFuelValue(item.received)}
											<div class="fuel-movement-chip received">
												<span>Received</span>
												<strong>{formatLiter(item.received)}</strong>
											</div>
										{:else if hasPositiveFuelValue(item.consumption)}
											<div class="fuel-movement-chip consumption">
												<span>Consumption</span>
												<strong>{formatLiter(item.consumption)}</strong>
											</div>
										{:else}
											<span class="muted">-</span>
										{/if}
									</td>
									<td class="right"><strong>{item.rob_after || '-'}</strong></td>
									<td>
										{#if hasHistoryNote(item)}
											<button type="button" class="note-view-button" onclick={() => openHistoryNote(item)}>
												View note
											</button>
										{:else}
											<span class="muted">-</span>
										{/if}
									</td>
									<!-- <td class="right">
										{#if item.is_deletable && item.id && canManageTransactions}
											<button
												type="button"
												class="danger-button"
												onclick={() => removeTransaction(item)}
												disabled={actionLoading === `delete-${item.id}`}
											>
												{actionLoading === `delete-${item.id}` ? 'Deleting...' : 'Delete'}
											</button>
										{:else}
											<span class="muted">-</span>
										{/if}
									</td> -->
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="history-control history-control-bottom">
					<button
						type="button"
						onclick={() => loadHistoryPage(historyPage - 1)}
						disabled={loadingHistory || historyPage <= 1}
					>
						Prev
					</button>
					<span>Page {historyPage} / {historyPagination?.total_pages || 1}</span>
					<button
						type="button"
						onclick={() => loadHistoryPage(historyPage + 1)}
						disabled={loadingHistory || historyPage >= Number(historyPagination?.total_pages || 1)}
					>
						Next
					</button>
				</div>
			{:else}
				<div class="empty-state">History is not available for this date range.</div>
			{/if}

		{#if shouldShowDateRangeOverlay}
			<div class="load-required-overlay">
				<div class="load-required-card">
					<div class="load-required-icon">!</div>
					<span class="section-kicker">Waiting for date</span>
					<h2>Choose a fuel history range first</h2>
					<p>
						Select the fuel history range and timezone in the history header, then click <strong>Load History</strong>
						to display the timeline.
					</p>
				</div>
			</div>
		{/if}
		</div>
	</section>

	{#if showFuelOperationOverlay}
		<div class="fuel-operation-modal-backdrop" role="presentation" onclick={closeFuelOperationOverlay}>
			<section
				class="fuel-operation-modal-card"
				role="dialog"
				aria-modal="true"
				aria-label="Fuel operations"
				onclick={(event) => event.stopPropagation()}
			>
				<header class="fuel-operation-modal-header">
					<div>
						<span class="page-kicker">Fuel Operation</span>
						<h2>Fuel Operations</h2>
						<p>Manual ROB adjustment, bunkering transaction, and VDOR import.</p>
					</div>
					<button
						type="button"
						class="note-modal-close"
						onclick={closeFuelOperationOverlay}
						aria-label="Close fuel operations"
					>
						×
					</button>
				</header>

				<div class="fuel-operation-modal-body">
					{#if currentUserLoading}
						<LoadingSkeleton label="Loading fuel operation permissions" variant="fuel-operations" />
					{:else if currentUserError}
						<div class="empty-state">{currentUserError}</div>
					{:else if canManageFuelOperations}
						<div class="operation-grid modal-operation-grid">
							{#if canManageRob}
								<form
									class="mini-form"
									onsubmit={(event) => {
										event.preventDefault();
										submitRob();
									}}
								>
									<h3>Save / Adjust ROB</h3>
									<label>
										<span>Datetime</span>
										<input type="datetime-local" bind:value={robForm.datetime} />
									</label>
									<label>
										<span>ROB (L)</span>
										<input
											type="number"
											min="0"
											step="0.01"
											bind:value={robForm.rob}
											placeholder="52000.50"
										/>
									</label>
									<label>
										<span>Note</span>
										<input type="text" bind:value={robForm.note} placeholder="Initial tank sounding" />
									</label>
									<button type="submit" disabled={actionLoading === 'rob'}>
										{actionLoading === 'rob' ? 'Saving...' : 'Save ROB'}
									</button>
								</form>
							{/if}

							{#if canManageTransactions}
								<form
									class="mini-form"
									onsubmit={(event) => {
										event.preventDefault();
										submitTransaction();
									}}
								>
									<h3>Bunkering Transaction</h3>
									<label>
										<span>Datetime</span>
										<input type="datetime-local" bind:value={transactionForm.datetime} />
									</label>
									<div class="split-fields">
										<label>
											<span>Received (L)</span>
											<input
												type="number"
												min="0"
												step="0.01"
												bind:value={transactionForm.received}
												placeholder="15000"
											/>
										</label>
										<label>
											<span>Consumption (L)</span>
											<input
												type="number"
												min="0"
												step="0.01"
												bind:value={transactionForm.consumption}
												placeholder="0"
											/>
										</label>
									</div>
									<label>
										<span>Note</span>
										<input
											type="text"
											bind:value={transactionForm.note}
											placeholder="Bunkering receipt"
										/>
									</label>
									<button type="submit" disabled={actionLoading === 'transaction'}>
										{actionLoading === 'transaction' ? 'Saving...' : 'Apply Transaction'}
									</button>
								</form>
							{/if}

							{#if canImportVdor}
								<div class="mini-form vdor-import-form">
									<div class="vdor-import-heading">
										<div>
											<h3>VDOR vs System</h3>
											<p>Review an existing comparison by date, or preview a new VDOR file before saving it.</p>
										</div>
										<span class="vdor-step-badge">Comparison workspace</span>
									</div>

									<section class="vdor-date-context">
										<div class="vdor-context-copy">
											<span class="vdor-context-icon" aria-hidden="true">01</span>
											<div>
												<strong>Existing comparison</strong>
												<small>Select a date to compare the saved VDOR against the system calculation for that day.</small>
											</div>
										</div>

										<div class="vdor-context-actions">
											<label>
												<span>VDOR date</span>
												<input type="date" bind:value={vdorDate} onchange={handleVdorDateChange} />
											</label>
											<button
												type="button"
												class="vdor-refresh-button"
												onclick={refreshStoredVdorComparison}
												disabled={vdorComparisonLoading || !vdorDate}
											>
												{vdorComparisonLoading ? 'Comparing...' : 'Get Comparison'}
											</button>
										</div>
									</section>

									<section class="vdor-stored-comparison">
										<header class="vdor-stored-heading">
											<div>
												<span class="section-kicker">Existing VDOR lookup</span>
												<h4>{currentVesselName} · {vdorStoredComparisonData?.date || vdorDate}</h4>
												<p>When VDOR data exists, its fuel is compared label-by-label with the daily system calculation.</p>
											</div>
											{#if vdorStoredComparisonData}
												<div class="vdor-comparison-badges">
													<span>{vdorStoredIsFod ? 'Tank basis' : 'Engine basis'}</span>
													<span>Source: {formatFuelSourceLabel(vdorStoredSystem?.fuel_source ?? vdorStoredSystem?.fuelSource)}</span>
													<span class:available={Boolean(vdorStoredVdor?.present)}>
														{vdorStoredVdor?.present ? 'VDOR available' : 'No VDOR'}
													</span>
												</div>
											{/if}
										</header>

										{#if vdorComparisonLoading}
											<LoadingSkeleton label="Loading VDOR and system data" variant="fuel-comparison" />
										{:else if vdorComparisonError}
											<div class="vdor-comparison-state error">
												<div><strong>Data unavailable</strong><span>{vdorComparisonError}</span></div>
												<button type="button" class="secondary-button" onclick={refreshStoredVdorComparison}>Try Again</button>
											</div>
										{:else if vdorStoredComparisonData}
											<div class="vdor-stored-metrics">
												<article class="vdor-comparison-metric">
													<span>VDOR Total Consumption</span><strong>{formatLiter(vdorStoredVdorTotal)}</strong>
													<small>{vdorStoredVdor?.present ? 'Imported crew report' : 'Not imported'}</small>
												</article>
												<article class="vdor-comparison-metric">
													<span>System Total Consumption</span><strong>{formatLiter(vdorStoredSystemTotal)}</strong>
													<small>{formatFuelSourceLabel(vdorStoredSystem?.fuel_source ?? vdorStoredSystem?.fuelSource)} calculation</small>
												</article>
												<article class="vdor-comparison-metric" class:variance={Boolean(vdorStoredVariance?.has_variance ?? vdorStoredVariance?.hasVariance)}>
													<span>Total Difference</span><strong>{formatLiter(vdorStoredDifference)}</strong>
													<small>{vdorStoredVariance?.has_variance ?? vdorStoredVariance?.hasVariance ? 'Variance detected' : 'No variance detected'}</small>
												</article>
												<article class="vdor-comparison-metric" class:variance={Boolean(vdorStoredVariance?.has_variance ?? vdorStoredVariance?.hasVariance)}>
													<span>Difference %</span><strong>{vdorStoredPercentDifference === null ? '-' : `${formatNumber(vdorStoredPercentDifference)}%`}</strong>
													<small>VDOR against system</small>
												</article>
											</div>

											{#if !vdorStoredVdor?.present}
												<div class="vdor-missing-guide">
													<div class="vdor-missing-guide-copy">
														<strong>No VDOR imported for {vdorDate}</strong>
														<span>A comparison cannot be created until a VDOR file is imported.</span>
														<div class="vdor-missing-steps">
															<span><b>1</b> Download the template for this date</span>
															<span><b>2</b> Complete the VDOR values in Excel</span>
															<span><b>3</b> Upload it in Preview Excel below</span>
														</div>
													</div>
													<button
														type="button"
														class="vdor-empty-download-button"
														onclick={downloadTemplate}
														disabled={actionLoading === 'template' || !vdorDate}
													>
														{actionLoading === 'template' ? 'Downloading...' : 'Download VDOR Template'}
													</button>
												</div>
											{:else if vdorStoredDifferenceRows.length}
												<div class="vdor-difference-table-wrap">
													<table class="vdor-difference-table">
														<thead><tr><th>{vdorStoredIsFod ? 'Tank' : 'Engine'}</th><th>VDOR</th><th>System</th><th>Difference</th></tr></thead>
														<tbody>
															{#each vdorStoredDifferenceRows as row}
																<tr><td>{row.label}</td><td>{formatLiter(row.vdor)}</td><td>{formatLiter(row.system)}</td><td class={deltaClass(row.difference)}>{formatLiter(row.difference)}</td></tr>
															{/each}
														</tbody>
													</table>
												</div>
											{/if}

											{#if vdorStoredSystem?.opening_rob_l !== undefined || vdorStoredSystem?.openingRobL !== undefined || vdorStoredSystem?.closing_rob_l !== undefined || vdorStoredSystem?.closingRobL !== undefined}
												<div class="vdor-system-context">
													<div><span>System Opening ROB</span><strong>{formatLiter(vdorStoredSystem?.opening_rob_l ?? vdorStoredSystem?.openingRobL)}</strong></div>
													<div><span>System Closing ROB</span><strong>{formatLiter(vdorStoredSystem?.closing_rob_l ?? vdorStoredSystem?.closingRobL)}</strong></div>
												</div>
											{/if}
														{:else}
															<div class="vdor-comparison-state empty"><div><strong>Ready to compare</strong><span>Select a date and click Get Comparison to load VDOR and system values.</span></div></div>
														{/if}
									</section>

									<section class="vdor-upload-workflow">
										<div class="vdor-workflow-heading">
											<span>02</span>
											<div>
												<strong>Preview a new comparison</strong>
												<small>Upload a completed VDOR Excel file. Its report date is read from the file and compared with system data.</small>
											</div>
										</div>

										<div class="vdor-workflow-actions preview-actions">
											<label class="vdor-file-picker">
												<input type="file" accept=".xlsx" onchange={handleFileInput} disabled={importPreviewLoading || importSaveLoading} />
												<span>Choose Excel</span>
												<strong>{selectedImportFileName || 'No file selected'}</strong>
											</label>
											<button type="button" class="vdor-preview-button" onclick={previewImportVdor} disabled={importPreviewLoading || importSaveLoading || !selectedImportFile}>
												{importPreviewLoading ? 'Generating...' : 'Preview VDOR'}
											</button>
										</div>
									</section>

									{#if importPreviewLoading}
										<LoadingSkeleton label="Parsing VDOR and preparing comparison" variant="fuel-comparison" />
									{:else if vdorPreviewData}
										<section class="vdor-preview-panel">
											<div class="vdor-preview-header">
												<div>
													<span class="section-kicker">New import preview</span>
													<h4>{currentVesselName} · {getVdorPreviewDate() || 'Date unavailable'}</h4>
												</div>
												<strong>{formatLiter(buildVdorConsumptionForSave().totalEnginesConsumption)}</strong>
											</div>

											<section class="vdor-source-selection">
												<header class="vdor-source-selection-heading">
													<div>
														<span class="section-kicker">Daily values comparison</span>
														<h4>VDOR vs System daily values</h4>
														<p>Compare the daily values side by side. System values are used when the VDOR is saved.</p>
													</div>
													<span class="vdor-source-help">System used on save</span>
												</header>

												<div class="vdor-source-grid">
													{#each vdorDailySourceRows as row}
														<article class="vdor-source-option uses-system">
															<div class="vdor-source-option-head">
																<span>{row.label}</span>
																<span class="vdor-system-badge">System</span>
															</div>

															<div class="vdor-source-values">
																<div class="selected"><span>System</span><strong>{formatLiter(row.system)}</strong></div>
																<div class="vdor-reference"><span>VDOR</span><strong>{formatLiter(row.vdor)}</strong></div>
															</div>
														</article>
													{/each}
												</div>

												<div class="vdor-midnight-reference">
													<div><span>Midnight ROB</span><small>Reference only; it is not sent as a save option.</small></div>
													<div><span>VDOR</span><strong>{formatLiter(getVdorDailyValue('midnightRob', 'midnight_rob'))}</strong></div>
													<div><span>System</span><strong>{formatLiter(getPreviewSystemValue('midnightRob'))}</strong></div>
												</div>
											</section>

											<section class="vdor-preview-comparison">
												<header class="vdor-preview-comparison-heading">
													<div>
														<span class="section-kicker">Import preview comparison</span>
														<h4>Excel VDOR vs Daily System</h4>
														<p>This comparison comes from the uploaded file date, before anything is saved.</p>
													</div>
													<div class="vdor-comparison-badges">
														<span>Preview only</span>
														<span>{vdorPreviewIsFod ? 'Tank basis' : 'Engine basis'}</span>
														<span>Source: {formatFuelSourceLabel(vdorPreviewSystemComparison?.system_fuel_source ?? vdorPreviewSystemComparison?.systemFuelSource ?? vdorPreviewSystemDaily?.fuel_source)}</span>
													</div>
												</header>

												<div class="vdor-stored-metrics preview-metrics">
													<article class="vdor-comparison-metric">
														<span>Excel VDOR</span><strong>{formatLiter(vdorPreviewVdorTotal)}</strong><small>Uploaded file</small>
													</article>
													<article class="vdor-comparison-metric">
														<span>Daily System</span><strong>{formatLiter(vdorPreviewSystemTotal)}</strong><small>{formatFuelSourceLabel(vdorPreviewSystemComparison?.system_fuel_source ?? vdorPreviewSystemComparison?.systemFuelSource ?? vdorPreviewSystemDaily?.fuel_source)} calculation</small>
													</article>
													<article class="vdor-comparison-metric" class:variance={vdorPreviewDifference !== 0}>
														<span>Difference</span><strong>{formatLiter(vdorPreviewDifference)}</strong><small>{vdorPreviewDifference === 0 ? 'Values match' : 'Review variance'}</small>
													</article>
													<article class="vdor-comparison-metric" class:variance={vdorPreviewDifference !== 0}>
														<span>Difference %</span><strong>{vdorPreviewDifferencePercent === null ? '-' : `${formatNumber(vdorPreviewDifferencePercent)}%`}</strong><small>Excel against system</small>
													</article>
												</div>

												{#if vdorPreviewDifferenceRows.length}
													<div class="vdor-difference-table-wrap">
														<table class="vdor-difference-table">
															<thead><tr><th>{vdorPreviewIsFod ? 'Tank' : 'Engine'}</th><th>Excel VDOR</th><th>System</th><th>Difference</th></tr></thead>
															<tbody>
																{#each vdorPreviewDifferenceRows as row}
																	<tr><td>{row.label}</td><td>{formatLiter(row.vdor)}</td><td>{formatLiter(row.system)}</td><td class={deltaClass(row.difference)}>{formatLiter(row.difference)}</td></tr>
																{/each}
															</tbody>
														</table>
													</div>
												{:else}
													<div class="vdor-comparison-empty">No per-{vdorPreviewIsFod ? 'tank' : 'engine'} comparison rows were returned.</div>
												{/if}
											</section>

											<section class="vdor-save-workflow">
												<div class="vdor-workflow-heading compact">
													<span>03</span>
													<div><strong>Save reviewed VDOR</strong><small>Save only after the VDOR and system differences have been reviewed.</small></div>
												</div>
												<div class="vdor-confirm-row">
													<label>
														<span>Import note</span>
														<input type="text" bind:value={vdorImportNote} />
													</label>
													<button type="button" onclick={submitImportVdor} disabled={importSaveLoading}>
														{importSaveLoading ? 'Saving...' : 'Save VDOR'}
													</button>
												</div>
											</section>
										</section>
									{:else}
										<div class="vdor-preview-placeholder">
											Comparison and parsed VDOR values will appear here after preview.
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{:else}
						<div class="empty-state">This feature is locked.</div>
					{/if}
				</div>
			</section>
		</div>
	{/if}

	{#if selectedHistoryNote}
		<div class="note-modal-backdrop" role="presentation" onclick={closeHistoryNote}>
			<section
				class="note-modal-card"
				role="dialog"
				aria-modal="true"
				aria-label="Fuel history note"
				onclick={(event) => event.stopPropagation()}
			>
				<header class="note-modal-header">
					<div>
						<span class="page-kicker">Fuel Note</span>
						<h2>{selectedHistoryNote.action}</h2>
						<p>{selectedHistoryNote.formattedDate || selectedHistoryNote.date} • {selectedHistoryNote.user}</p>
					</div>
					<button type="button" class="note-modal-close" onclick={closeHistoryNote} aria-label="Close note">
						×
					</button>
				</header>

				<div class="note-modal-body">
					<p>{selectedHistoryNote.note}</p>
				</div>
			</section>
		</div>
	{/if}
</section>

<style>
	:global(*) {
		box-sizing: border-box;
	}

	.fuel-management-page {
		width: 100%;
		height: 100%;
		max-height: 100%;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 14px;
		background: var(--color-base);
		color: var(--text-primary);
	}

	h1,
	h2,
	h3,
	p {
		margin: 0;
	}

	.fuel-header-card,
	.panel,
	.summary-card {
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
	}

	.fuel-header-card {
		padding: 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 14px;
	}

	.page-kicker {
		display: inline-flex;
		width: fit-content;
		padding: 4px 9px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		color: #1d4ed8;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.fuel-header-card h1 {
		margin-top: 8px;
		font-size: 22px;
		line-height: 1.2;
		font-weight: 900;
		color: var(--text-primary);
	}

	.fuel-header-card p {
		margin-top: 7px;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
		line-height: 1.45;
	}

	.header-actions {
		display: flex;
		align-items: end;
		justify-content: flex-end;
		gap: 10px;
		flex-wrap: wrap;
		min-width: 230px;
	}

	.header-rob-card {
		min-width: 220px;
		padding: 12px 14px;
		border: 1px solid rgba(34, 197, 94, 0.28);
		border-radius: 16px;
		background:
			linear-gradient(135deg, rgba(16, 185, 129, 0.16), rgba(37, 99, 235, 0.08)),
			rgba(15, 23, 42, 0.5);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
	}

	.header-rob-card span,
	.header-rob-card small {
		display: block;
		color: #9fb0c9;
		font-size: 10px;
		font-weight: 850;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.header-rob-card strong {
		display: block;
		margin-top: 6px;
		color: #ecfdf5;
		font-size: 22px;
		font-weight: 900;
		line-height: 1.05;
	}

	.header-rob-card small {
		margin-top: 7px;
		color: #86efac;
	}

	.history-toolbar {
		display: flex;
		align-items: flex-end;
		justify-content: flex-end;
		gap: 10px;
		flex-wrap: wrap;
	}

	.history-filters {
		display: flex;
		align-items: flex-end;
		gap: 9px;
		flex-wrap: wrap;
	}

	.history-load-button {
		height: 32px;
		padding: 0 13px;
	}

	.history-operation-button {
		height: 32px;
		padding: 0 13px;
		border-color: rgba(147, 197, 253, 0.34);
		background:
			linear-gradient(135deg, rgba(37, 99, 235, 0.18), rgba(14, 165, 233, 0.08)),
			rgba(15, 23, 42, 0.42);
		color: #dbeafe;
	}

	.history-operation-button:hover:not(:disabled) {
		border-color: rgba(147, 197, 253, 0.72);
		background:
			linear-gradient(135deg, rgba(37, 99, 235, 0.3), rgba(14, 165, 233, 0.14)),
			rgba(15, 23, 42, 0.58);
		color: #ffffff;
	}

	.history-load-area {
		min-height: 260px;
		margin-top: 0;
	}

	.history-load-area .load-required-overlay {
		border-top-left-radius: 0;
		border-top-right-radius: 0;
	}

	label {
		display: grid;
		gap: 5px;
	}

	label span {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.field-label-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.timezone-auto-pill {
		display: inline-flex;
		align-items: center;
		min-height: 18px;
		padding: 2px 7px;
		border: 1px solid rgba(96, 165, 250, 0.28);
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.1);
		color: #bfdbfe;
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0;
		text-transform: none;
		white-space: nowrap;
	}

	input,
	select {
		height: 32px;
		min-width: 140px;
		border: 1px solid #cbd5e1;
		background: var(--color-surface);
		padding: 0 9px;
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 700;
		outline: none;
	}

	input:focus,
	select:focus {
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
	}

	.offset-field select {
		min-width: 118px;
		width: 118px;
	}

	button {
		height: 32px;
		border: none;
		padding: 0 12px;
		font-size: 11px;
		font-weight: 900;
		cursor: pointer;
		transition:
			background 0.16s ease,
			opacity 0.16s ease;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.primary-button,
	.mini-form button:not(.secondary-button),
	.history-control button {
		background: #2563eb;
		color: #ffffff;
	}

	.primary-button:hover:not(:disabled),
	.mini-form button:not(.secondary-button):hover:not(:disabled),
	.history-control button:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.secondary-button {
		border: 1px solid #cbd5e1;
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-primary);
	}

	.secondary-button:hover:not(:disabled) {
		background: #cbd5e1;
	}

	.danger-button {
		height: 28px;
		border: 1px solid #fecaca;
		background: var(--color-danger-muted);
		color: #be123c;
	}

	.danger-button:hover:not(:disabled) {
		background: var(--color-danger-muted);
	}

	.fuel-toast-layer {
		position: fixed;
		top: 68px;
		right: 18px;
		z-index: 9999;
		display: grid;
		gap: 10px;
		width: min(390px, calc(100vw - 36px));
		pointer-events: none;
	}

	.fuel-toast {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 10px;
		align-items: flex-start;
		padding: 11px 12px;
		border: 1px solid #d9e2ec;
		border-radius: 12px;
		background: rgba(248, 250, 252, 0.98);
		box-shadow: 0 14px 34px rgba(15, 23, 42, 0.14);
		backdrop-filter: blur(10px);
		pointer-events: auto;
		animation: fuel-toast-in 0.22s ease both;
	}

	.fuel-toast div {
		display: grid;
		gap: 3px;
		min-width: 0;
	}

	.fuel-toast strong {
		font-size: 12px;
		font-weight: 900;
		color: #0f172a !important;
	}

	.fuel-toast span {
		font-size: 12px;
		font-weight: 700;
		line-height: 1.35;
		color: #334155 !important;
		text-transform: none;
	}

	.fuel-toast.warning {
		border-color: #fde68a;
		background: rgba(255, 251, 235, 0.96);
	}

	.fuel-toast.warning strong,
	.fuel-toast.warning span {
		color: #92400e;
	}

	.fuel-toast.danger {
		border-color: #fecaca;
		background: rgba(255, 241, 242, 0.96);
	}

	.fuel-toast.danger strong,
	.fuel-toast.danger span {
		color: #be123c;
	}

	.fuel-toast.success {
		border-color: #bbf7d0;
		background: rgba(240, 253, 244, 0.96);
	}

	.fuel-toast.success strong,
	.fuel-toast.success span {
		color: #166534;
	}

	.toast-close {
		width: 24px;
		height: 24px;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.08);
		color: #334155 !important;
		font-size: 17px;
		font-weight: 900;
		line-height: 1;
	}

	.toast-close:hover:not(:disabled) {
		background: rgba(15, 23, 42, 0.14);
	}

	@keyframes fuel-toast-in {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.alert {
		padding: 10px 12px;
		font-size: 12px;
		font-weight: 900;
		margin-bottom: 12px;
	}

	.alert.compact {
		margin: 10px 0;
	}

	.alert.warning {
		border: 1px solid #fde68a;
		background: var(--color-warning-muted);
		color: #92400e;
	}

	.alert.danger {
		border: 1px solid #fecaca;
		background: var(--color-danger-muted);
		color: #be123c;
	}

	.alert.success {
		border: 1px solid #bbf7d0;
		background: var(--color-success-muted);
		color: #166534;
	}

	.summary-grid {
		margin-top: 14px;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 14px;
		margin-bottom: 14px;
	}

	.summary-card {
		min-height: 96px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		min-width: 0;
	}

	.summary-card span,
	.comparison-grid span {
		display: block;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.summary-card strong,
	.comparison-grid strong {
		display: block;
		margin-top: 10px;
		color: var(--text-primary);
		font-size: 22px;
		line-height: 1.1;
		font-weight: 900;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.summary-card small {
		display: block;
		margin-top: 8px;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.main-grid {
		display: grid;
		grid-template-columns: minmax(320px, 0.9fr) minmax(460px, 1.4fr);
		gap: 14px;
		margin-bottom: 14px;
	}

	.full-width-panel {
		grid-column: 1 / -1;
	}

	.table-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(360px, 1fr));
		gap: 14px;
		margin-bottom: 14px;
	}

	.panel {
		padding: 0;
		overflow: hidden;
		min-width: 0;
	}

	.panel-header {
		min-height: 58px;
		padding: 12px 14px;
		border-bottom: 1px solid #e5edf5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--color-surface);
	}

	.panel-header h2 {
		color: var(--text-primary);
		font-size: 17px;
		font-weight: 900;
		line-height: 1.2;
	}

	.panel-header p {
		margin-top: 5px;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
		line-height: 1.4;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 25px;
		padding: 5px 10px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 11px;
		font-weight: 900;
		white-space: nowrap;
	}

	.comparison-grid {
		padding: 14px;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
		background: var(--color-elevated);
	}

	.comparison-grid > div {
		min-width: 0;
		padding: 14px;
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		border-radius: 10px;
	}

	.comparison-grid > div.positive {
		border-color: #bbf7d0;
		background: var(--color-success-muted);
	}

	.comparison-grid > div.negative {
		border-color: #fecaca;
		background: var(--color-danger-muted);
	}

	.comparison-grid > div.neutral {
		border-color: #d9e2ec;
		background: var(--color-surface);
	}

	.operation-grid {
		padding: 14px;
		display: grid;
		grid-template-columns: repeat(3, minmax(190px, 1fr));
		gap: 12px;
		background: var(--color-elevated);
	}

	.mini-form {
		display: grid;
		align-content: start;
		gap: 9px;
		min-width: 0;
		padding: 12px;
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		border-radius: 10px;
	}

	.mini-form h3 {
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 900;
	}

	.vdor-import-form {
		grid-column: 1 / -1;
		gap: 14px;
		padding: 16px;
		border-color: rgba(96, 165, 250, 0.28);
		background:
			linear-gradient(135deg, rgba(37, 99, 235, 0.09), transparent 38%),
			var(--color-surface);
	}

	.vdor-import-heading,
	.vdor-preview-header,
	.vdor-comparison-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 14px;
	}

	.vdor-import-heading p,
	.vdor-comparison-heading p {
		margin: 5px 0 0;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 650;
		line-height: 1.45;
	}

	.vdor-step-badge {
		flex: 0 0 auto;
		padding: 5px 9px;
		border: 1px solid rgba(96, 165, 250, 0.34);
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.14);
		color: #93c5fd;
		font-size: 10px;
		font-weight: 850;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.vdor-flow-rail {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}

	.vdor-flow-rail > div {
		display: flex;
		align-items: center;
		gap: 9px;
		min-width: 0;
		padding: 9px 10px;
		border: 1px solid rgba(148, 163, 184, 0.14);
		border-radius: 10px;
		background: rgba(15, 23, 42, 0.28);
		opacity: 0.68;
	}

	.vdor-flow-rail > div.active {
		border-color: rgba(96, 165, 250, 0.34);
		background: rgba(37, 99, 235, 0.09);
		opacity: 1;
	}

	.vdor-flow-rail > div > span {
		flex: 0 0 25px;
		display: grid;
		place-items: center;
		width: 25px;
		height: 25px;
		border-radius: 50%;
		background: rgba(71, 85, 105, 0.7);
		color: #cbd5e1;
		font-size: 9px;
		font-weight: 900;
	}

	.vdor-flow-rail > div.active > span {
		background: #2563eb;
		color: #ffffff;
	}

	.vdor-flow-rail > div > div {
		min-width: 0;
		display: grid;
		gap: 2px;
	}

	.vdor-flow-rail strong,
	.vdor-flow-rail small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vdor-flow-rail strong {
		color: var(--text-primary);
		font-size: 10px;
		font-weight: 900;
	}

	.vdor-flow-rail small {
		color: var(--text-secondary);
		font-size: 9px;
		font-weight: 650;
	}

	.vdor-date-context {
		min-width: 0;
		display: grid;
		grid-template-columns: minmax(240px, 1fr) minmax(300px, auto);
		align-items: end;
		gap: 16px;
		padding: 14px;
		border: 1px solid rgba(96, 165, 250, 0.28);
		border-radius: 14px;
		background:
			linear-gradient(120deg, rgba(37, 99, 235, 0.13), transparent 52%),
			rgba(15, 23, 42, 0.38);
	}

	.vdor-context-copy {
		min-width: 0;
		display: flex;
		align-items: flex-start;
		gap: 11px;
	}

	.vdor-context-icon {
		flex: 0 0 34px;
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border: 1px solid rgba(96, 165, 250, 0.36);
		border-radius: 10px;
		background: rgba(37, 99, 235, 0.18);
		color: #bfdbfe;
		font-size: 11px;
		font-weight: 900;
	}

	.vdor-context-copy > div {
		min-width: 0;
		display: grid;
		gap: 4px;
	}

	.vdor-context-copy strong {
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 900;
	}

	.vdor-context-copy small {
		max-width: 560px;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 650;
		line-height: 1.45;
	}

	.vdor-context-actions {
		display: grid;
		grid-template-columns: minmax(160px, 1fr) auto;
		align-items: end;
		gap: 8px;
	}

	.vdor-context-actions > button {
		min-height: 38px;
		padding-inline: 13px;
		white-space: nowrap;
	}

	.vdor-refresh-button {
		border: 1px solid rgba(96, 165, 250, 0.36) !important;
		background: linear-gradient(135deg, #2563eb, #1d4ed8) !important;
		color: #ffffff !important;
	}

	.vdor-stored-comparison {
		display: grid;
		gap: 12px;
		padding: 14px;
		border: 1px solid rgba(148, 163, 184, 0.18);
		border-radius: 14px;
		background: rgba(2, 6, 23, 0.24);
	}

	.vdor-stored-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 14px;
	}

	.vdor-stored-heading h4 {
		margin: 4px 0 0;
		color: var(--text-primary);
		font-size: 14px;
		font-weight: 900;
	}

	.vdor-stored-heading p {
		margin: 5px 0 0;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 650;
		line-height: 1.45;
	}

	.vdor-comparison-badges {
		display: flex;
		justify-content: flex-end;
		gap: 6px;
		flex-wrap: wrap;
	}

	.vdor-comparison-badges span {
		padding: 5px 8px;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 999px;
		background: rgba(30, 41, 59, 0.72);
		color: #cbd5e1;
		font-size: 9px;
		font-weight: 850;
		white-space: nowrap;
	}

	.vdor-comparison-badges span.available {
		border-color: rgba(52, 211, 153, 0.34);
		background: rgba(16, 185, 129, 0.13);
		color: #6ee7b7;
	}

	.vdor-stored-metrics {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 8px;
	}

	.vdor-comparison-metric {
		min-width: 0;
		padding: 11px;
		border: 1px solid rgba(148, 163, 184, 0.16);
		border-radius: 11px;
		background: rgba(30, 41, 59, 0.48);
	}

	.vdor-comparison-metric > span,
	.vdor-system-context span {
		color: var(--text-secondary);
		font-size: 9px;
		font-weight: 850;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.vdor-comparison-metric strong {
		display: block;
		margin-top: 7px;
		color: var(--text-primary);
		font-size: 16px;
		font-weight: 900;
	}

	.vdor-comparison-metric small {
		display: block;
		margin-top: 5px;
		color: var(--text-secondary);
		font-size: 9px;
		font-weight: 650;
	}

	.vdor-comparison-metric.variance {
		border-color: rgba(251, 146, 60, 0.35);
		background: rgba(194, 65, 12, 0.12);
	}

	.vdor-comparison-state {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px;
		border: 1px dashed rgba(96, 165, 250, 0.3);
		border-radius: 11px;
		background: rgba(37, 99, 235, 0.08);
	}

	.vdor-comparison-state > div {
		display: grid;
		gap: 3px;
	}

	.vdor-comparison-state strong {
		color: #dbeafe;
		font-size: 11px;
		font-weight: 900;
	}

	.vdor-comparison-state span {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 650;
	}

	.vdor-comparison-state.error {
		border-color: rgba(248, 113, 113, 0.32);
		background: rgba(127, 29, 29, 0.14);
	}

	.vdor-comparison-state.error strong {
		color: #fecaca;
	}

	.vdor-missing-guide {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 14px;
		border: 1px solid rgba(251, 191, 36, 0.28);
		border-radius: 12px;
		background: linear-gradient(120deg, rgba(180, 83, 9, 0.13), rgba(15, 23, 42, 0.28));
	}

	.vdor-missing-guide-copy {
		min-width: 0;
		display: grid;
		gap: 5px;
	}

	.vdor-missing-guide-copy > strong {
		color: #fde68a;
		font-size: 12px;
		font-weight: 900;
	}

	.vdor-missing-guide-copy > span {
		color: #cbd5e1;
		font-size: 10px;
		font-weight: 650;
	}

	.vdor-missing-steps {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 5px;
	}

	.vdor-missing-steps span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 5px 7px;
		border: 1px solid rgba(251, 191, 36, 0.17);
		border-radius: 7px;
		background: rgba(15, 23, 42, 0.32);
		color: #dbeafe;
		font-size: 9px;
		font-weight: 750;
	}

	.vdor-missing-steps b {
		display: grid;
		place-items: center;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #d97706;
		color: #ffffff;
		font-size: 8px;
		font-weight: 900;
	}

	.vdor-empty-download-button {
		flex: 0 0 auto;
		min-height: 38px;
		padding-inline: 14px;
		border: 1px solid rgba(251, 191, 36, 0.42) !important;
		background: linear-gradient(135deg, #d97706, #b45309) !important;
		color: #ffffff !important;
		white-space: nowrap;
	}

	.vdor-difference-table-wrap {
		overflow: auto;
		border: 1px solid rgba(148, 163, 184, 0.14);
		border-radius: 11px;
	}

	.vdor-difference-table {
		width: 100%;
		min-width: 560px;
		border-collapse: collapse;
	}

	.vdor-difference-table th,
	.vdor-difference-table td {
		padding: 9px 11px;
		border-bottom: 1px solid rgba(148, 163, 184, 0.11);
		font-size: 10px;
		text-align: right;
	}

	.vdor-difference-table th:first-child,
	.vdor-difference-table td:first-child {
		text-align: left;
	}

	.vdor-difference-table th {
		background: rgba(30, 41, 59, 0.82);
		color: #94a3b8;
		font-size: 9px;
		font-weight: 850;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.vdor-difference-table td {
		color: #cbd5e1;
		font-weight: 700;
	}

	.vdor-difference-table td.positive,
	.vdor-difference-table td.negative {
		color: #fca5a5;
		font-weight: 900;
	}

	.vdor-difference-table td.neutral {
		color: #86efac;
	}

	.vdor-system-context {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}

	.vdor-system-context > div {
		padding: 9px 11px;
		border: 1px solid rgba(148, 163, 184, 0.13);
		border-radius: 10px;
		background: rgba(15, 23, 42, 0.32);
	}

	.vdor-system-context strong {
		display: block;
		margin-top: 5px;
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 900;
	}

	.vdor-upload-workflow {
		min-width: 0;
		display: grid;
		grid-template-columns: minmax(230px, 0.72fr) minmax(380px, 1.28fr);
		align-items: center;
		gap: 16px;
		padding: 13px;
		border: 1px solid rgba(148, 163, 184, 0.17);
		border-radius: 12px;
		background: rgba(15, 23, 42, 0.32);
	}

	.vdor-workflow-heading {
		display: flex;
		align-items: flex-start;
		gap: 10px;
	}

	.vdor-workflow-heading > span {
		flex: 0 0 24px;
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: #2563eb;
		color: #ffffff;
		font-size: 11px;
		font-weight: 900;
	}

	.vdor-workflow-heading div {
		min-width: 0;
		display: grid;
		gap: 3px;
	}

	.vdor-workflow-heading strong {
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 900;
	}

	.vdor-workflow-heading small {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 650;
		line-height: 1.4;
	}

	.vdor-workflow-actions {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		gap: 8px;
	}

	.vdor-workflow-actions > button {
		min-height: 38px;
		padding-inline: 14px;
		white-space: nowrap;
	}

	.vdor-file-picker {
		position: relative;
		min-width: 0;
		min-height: 38px;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 9px;
		padding: 4px;
		border: 1px solid rgba(148, 163, 184, 0.24);
		border-radius: 9px;
		background: rgba(15, 23, 42, 0.38);
		cursor: pointer;
		box-sizing: border-box;
	}

	.vdor-file-picker input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}

	.vdor-file-picker:has(input:disabled) {
		opacity: 0.58;
		cursor: not-allowed;
	}

	.vdor-file-picker > span {
		padding: 6px 9px;
		background: rgba(51, 65, 85, 0.88);
		color: #dbeafe;
		font-size: 10px;
		font-weight: 850;
		white-space: nowrap;
	}

	.vdor-file-picker > strong {
		min-width: 0;
		overflow: hidden;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 700;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vdor-preview-button {
		background: linear-gradient(135deg, #2563eb, #1d4ed8) !important;
		color: #ffffff !important;
	}

	.vdor-preview-panel {
		display: grid;
		gap: 12px;
		padding: 14px;
		border: 1px solid rgba(45, 212, 191, 0.28);
		border-radius: 14px;
		background:
			linear-gradient(145deg, rgba(13, 148, 136, 0.08), transparent 38%),
			rgba(15, 23, 42, 0.35);
	}

	.vdor-preview-header {
		align-items: center;
	}

	.vdor-preview-header h4,
	.vdor-comparison-heading h4 {
		margin: 4px 0 0;
		color: var(--text-primary);
		font-size: 14px;
		font-weight: 900;
	}

	.vdor-preview-header > strong {
		color: #86efac;
		font-size: 18px;
		font-weight: 900;
		white-space: nowrap;
	}

	.vdor-source-selection {
		display: grid;
		gap: 10px;
		padding: 12px;
		border: 1px solid rgba(45, 212, 191, 0.18);
		border-radius: 12px;
		background: rgba(2, 6, 23, 0.22);
	}

	.vdor-source-selection-heading,
	.vdor-preview-comparison-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	.vdor-source-selection-heading h4,
	.vdor-preview-comparison-heading h4 {
		margin: 4px 0 0;
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 900;
	}

	.vdor-source-selection-heading p,
	.vdor-preview-comparison-heading p {
		margin: 4px 0 0;
		color: var(--text-secondary);
		font-size: 10.5px;
		font-weight: 650;
		line-height: 1.45;
	}

	.vdor-source-help {
		flex: 0 0 auto;
		padding: 5px 8px;
		border: 1px solid rgba(45, 212, 191, 0.3);
		border-radius: 999px;
		background: rgba(13, 148, 136, 0.12);
		color: #99f6e4;
		font-size: 9px;
		font-weight: 850;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.vdor-source-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 9px;
	}

	.vdor-source-option {
		display: grid;
		gap: 9px;
		min-width: 0;
		padding: 10px;
		border: 1px solid rgba(148, 163, 184, 0.17);
		border-radius: 10px;
		background: rgba(30, 41, 59, 0.46);
		transition: border-color 150ms ease, background 150ms ease;
	}

	.vdor-source-option.uses-system {
		border-color: rgba(96, 165, 250, 0.32);
		background: rgba(37, 99, 235, 0.07);
	}

	.vdor-source-option-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.vdor-source-option-head > span {
		color: var(--text-secondary);
		font-size: 9px;
		font-weight: 850;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.vdor-system-badge {
		display: inline-flex;
		align-items: center;
		min-height: 22px;
		padding: 3px 7px;
		border: 1px solid rgba(96, 165, 250, 0.34);
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.1);
		color: #bfdbfe;
		font-size: 9px;
		font-weight: 900;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.vdor-source-values {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px;
	}

	.vdor-source-values > div {
		min-width: 0;
		padding: 7px;
		border: 1px solid rgba(148, 163, 184, 0.12);
		border-radius: 8px;
		background: rgba(2, 6, 23, 0.2);
		opacity: 0.64;
	}

	.vdor-source-values > div.selected {
		border-color: rgba(96, 165, 250, 0.34);
		background: rgba(37, 99, 235, 0.1);
		opacity: 1;
	}

	.vdor-source-values > div.vdor-reference {
		border-color: rgba(45, 212, 191, 0.3);
		background: rgba(13, 148, 136, 0.09);
		opacity: 1;
	}

	.vdor-source-values > div.vdor-reference span {
		color: #99f6e4;
	}

	.vdor-source-values span,
	.vdor-source-selected span,
	.vdor-midnight-reference span {
		display: block;
		color: var(--text-secondary);
		font-size: 8.5px;
		font-weight: 850;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.vdor-source-values strong {
		display: block;
		margin-top: 4px;
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 900;
		white-space: nowrap;
	}

	.vdor-source-selected {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 7px;
		padding-top: 8px;
		border-top: 1px solid rgba(148, 163, 184, 0.12);
	}

	.vdor-source-selected strong {
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 900;
		white-space: nowrap;
	}

	.vdor-source-selected small {
		padding: 3px 5px;
		border-radius: 5px;
		background: rgba(45, 212, 191, 0.13);
		color: #99f6e4;
		font-size: 8px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.uses-system .vdor-source-selected small {
		background: rgba(59, 130, 246, 0.14);
		color: #bfdbfe;
	}

	.vdor-midnight-reference {
		display: grid;
		grid-template-columns: minmax(180px, 1fr) auto auto;
		align-items: center;
		gap: 20px;
		padding: 9px 10px;
		border: 1px dashed rgba(148, 163, 184, 0.22);
		border-radius: 9px;
		background: rgba(15, 23, 42, 0.32);
	}

	.vdor-midnight-reference small {
		display: block;
		margin-top: 3px;
		color: var(--text-secondary);
		font-size: 9px;
	}

	.vdor-midnight-reference strong {
		display: block;
		margin-top: 3px;
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 900;
		white-space: nowrap;
	}

	.vdor-preview-comparison {
		display: grid;
		gap: 10px;
		padding: 12px;
		border: 1px solid rgba(96, 165, 250, 0.2);
		border-radius: 12px;
		background: rgba(15, 23, 42, 0.28);
	}

	.vdor-preview-comparison-heading {
		padding-bottom: 10px;
		border-bottom: 1px solid rgba(148, 163, 184, 0.12);
	}

	.vdor-comparison-card {
		overflow: hidden;
		border: 1px solid rgba(148, 163, 184, 0.18);
		border-radius: 12px;
		background: rgba(2, 6, 23, 0.2);
	}

	.vdor-comparison-heading {
		padding: 11px 12px;
		border-bottom: 1px solid rgba(148, 163, 184, 0.14);
	}

	.vdor-comparison-card .comparison-grid {
		padding: 10px;
		background: transparent;
	}

	.vdor-comparison-empty,
	.vdor-preview-placeholder {
		padding: 13px;
		border: 1px dashed rgba(148, 163, 184, 0.28);
		border-radius: 10px;
		background: rgba(15, 23, 42, 0.25);
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 700;
		text-align: center;
	}

	.vdor-comparison-empty {
		margin: 10px;
	}

	.vdor-save-workflow {
		display: grid;
		gap: 11px;
		padding: 12px;
		border: 1px solid rgba(34, 197, 94, 0.24);
		border-radius: 12px;
		background: rgba(22, 163, 74, 0.06);
	}

	.vdor-workflow-heading.compact {
		align-items: center;
	}

	.vdor-workflow-heading.compact > span {
		background: #16a34a;
	}

	.vdor-confirm-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		gap: 10px;
	}

	.vdor-confirm-row button {
		min-height: 38px;
		padding-inline: 18px;
		background: linear-gradient(135deg, #16a34a, #15803d) !important;
		color: #ffffff !important;
		white-space: nowrap;
	}

	.split-fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}

	.file-picker input {
		padding-top: 6px;
	}

	.file-picker small {
		font-size: 11px;
		font-weight: 700;
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.table-wrap {
		width: 100%;
		overflow: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
		min-width: 520px;
	}

	th,
	td {
		text-align: left;
		white-space: nowrap;
	}

	th {
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--color-elevated);
		color: var(--text-secondary);
		font-size: 10.5px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 10px 12px;
		border-bottom: 1px solid #e2e8f0;
	}

	td {
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 700;
		padding: 10px 12px;
		border-bottom: 1px solid #eef2f7;
	}

	tbody tr:hover td {
		background: var(--color-elevated);
	}

	tfoot td {
		background: var(--color-accent-muted);
		color: var(--text-primary);
		font-weight: 900;
	}

	.right {
		text-align: right;
	}

	.history-panel table {
		min-width: 720px;
	}

	.fuel-movement-chip {
		width: 178px;
		display: inline-grid;
		grid-template-columns: 74px minmax(0, 1fr);
		align-items: center;
		gap: 10px;
		padding: 5px 10px;
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.18);
		border: 1px solid rgba(148, 163, 184, 0.18);
		color: var(--text-muted);
	}

	.fuel-movement-chip.received {
		background: rgba(34, 197, 94, 0.12);
		border-color: rgba(34, 197, 94, 0.28);
		color: #bbf7d0;
	}

	.fuel-movement-chip.consumption {
		background: rgba(248, 113, 113, 0.1);
		border-color: rgba(248, 113, 113, 0.26);
		color: #fecaca;
	}

	.fuel-movement-chip span {
		font-size: 10px;
		font-weight: 850;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		text-align: left;
	}

	.fuel-movement-chip strong {
		color: var(--text-primary);
		font-size: 11.5px;
		font-weight: 850;
		text-align: right;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.note-view-button {
		min-height: 28px;
		padding: 0 11px;
		border: 1px solid rgba(96, 165, 250, 0.34);
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.12);
		color: #bfdbfe;
		font-size: 11px;
		font-weight: 850;
		cursor: pointer;
		transition:
			transform 0.16s ease,
			border-color 0.16s ease,
			background 0.16s ease,
			color 0.16s ease;
	}

	.note-view-button:hover {
		transform: translateY(-1px);
		border-color: rgba(147, 197, 253, 0.72);
		background: rgba(37, 99, 235, 0.26);
		color: #ffffff;
	}

	.note-modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-items: center;
		padding: 18px;
		background: rgba(3, 7, 18, 0.66);
		backdrop-filter: blur(8px);
	}

	.fuel-operation-modal-backdrop {
		position: fixed;
		inset: var(--vessel-topbar-height, 62px) 0 0;
		z-index: 82;
		display: grid;
		place-items: start center;
		padding: 16px 20px 20px;
		overflow-y: auto;
		background: rgba(3, 7, 18, 0.68);
		backdrop-filter: blur(9px);
	}

	.note-modal-card {
		width: min(520px, 100%);
		max-height: min(620px, calc(100vh - 36px));
		overflow: hidden;
		border: 1px solid rgba(148, 163, 184, 0.22);
		border-radius: 22px;
		background:
			linear-gradient(145deg, rgba(30, 41, 59, 0.96), rgba(15, 23, 42, 0.98)),
			var(--color-surface);
		box-shadow: 0 26px 80px rgba(0, 0, 0, 0.46);
	}

	.fuel-operation-modal-card {
		width: min(1120px, calc(100vw - 40px));
		max-height: min(760px, calc(100dvh - var(--vessel-topbar-height, 62px) - 36px));
		overflow: hidden;
		border: 1px solid rgba(148, 163, 184, 0.24);
		border-radius: 24px;
		background:
			linear-gradient(145deg, rgba(30, 41, 59, 0.96), rgba(15, 23, 42, 0.98)),
			var(--color-surface);
		box-shadow: 0 30px 90px rgba(0, 0, 0, 0.52);
	}

	.note-modal-header {
		padding: 18px 18px 15px;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		border-bottom: 1px solid rgba(148, 163, 184, 0.14);
	}

	.fuel-operation-modal-header {
		padding: 20px 20px 16px;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		border-bottom: 1px solid rgba(148, 163, 184, 0.16);
		background:
			linear-gradient(135deg, rgba(37, 99, 235, 0.12), transparent 48%),
			rgba(15, 23, 42, 0.24);
	}

	.note-modal-header h2 {
		margin: 6px 0 5px;
		color: var(--text-primary);
		font-size: 18px;
		font-weight: 850;
	}

	.fuel-operation-modal-header h2 {
		margin: 6px 0 5px;
		color: var(--text-primary);
		font-size: 22px;
		font-weight: 850;
	}

	.note-modal-header p {
		margin: 0;
		color: #9fb0c9;
		font-size: 12px;
		font-weight: 700;
	}

	.fuel-operation-modal-header p {
		margin: 0;
		color: #9fb0c9;
		font-size: 13px;
		font-weight: 700;
	}

	.note-modal-close {
		width: 34px;
		height: 34px;
		min-width: 34px;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 12px;
		background: rgba(15, 23, 42, 0.5);
		color: #cbd5e1;
		font-size: 22px;
		line-height: 1;
		cursor: pointer;
	}

	.note-modal-close:hover {
		background: rgba(239, 68, 68, 0.16);
		color: #fecaca;
		border-color: rgba(248, 113, 113, 0.36);
	}

	.note-modal-body {
		padding: 18px;
		max-height: 420px;
		overflow: auto;
	}

	.fuel-operation-modal-body {
		max-height: calc(
			min(700px, calc(100dvh - var(--vessel-topbar-height, 62px) - 36px)) - 88px
		);
		overflow: auto;
		padding: 16px;
		background:
			radial-gradient(circle at top left, rgba(37, 99, 235, 0.08), transparent 34%),
			rgba(8, 13, 26, 0.28);
	}

	.modal-operation-grid {
		padding: 0;
		grid-template-columns: repeat(2, minmax(280px, 1fr));
		background: transparent;
	}

	.note-modal-body p {
		margin: 0;
		padding: 14px;
		border: 1px solid rgba(148, 163, 184, 0.16);
		border-radius: 16px;
		background: rgba(15, 23, 42, 0.38);
		color: #e2e8f0;
		font-size: 13px;
		font-weight: 650;
		line-height: 1.65;
		white-space: pre-wrap;
	}

	.history-control {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		font-weight: 900;
		color: var(--text-secondary);
	}

	.history-control-bottom {
		justify-content: flex-end;
		padding: 10px 14px;
		border-top: 1px solid rgba(148, 163, 184, 0.16);
		background: rgba(15, 23, 42, 0.22);
	}

	.history-control button {
		height: 30px;
		padding: 0 10px;
	}

	.history-date-cell {
		display: grid;
		gap: 4px;
		min-width: 190px;
	}

	.history-date-cell strong {
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 800;
		line-height: 1.2;
	}

	.history-date-cell small {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 700;
		line-height: 1.35;
		white-space: normal;
	}

	.action-chip {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-width: 52px;
		min-height: 24px;
		gap: 2px;
		padding: 5px 10px;
		border-radius: 12px;
		background: var(--color-accent-muted);
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.action-chip strong {
		color: inherit;
		font-size: 10px;
		font-weight: 900;
		line-height: 1.1;
	}

	.action-chip small {
		color: #93c5fd;
		font-size: 9px;
		font-weight: 900;
		letter-spacing: 0.08em;
		line-height: 1;
	}

	.action-chip.has-source {
		align-items: flex-start;
		min-width: 132px;
		background:
			linear-gradient(135deg, rgba(37, 99, 235, 0.18), rgba(14, 165, 233, 0.08)),
			rgba(15, 23, 42, 0.34);
		border-color: rgba(147, 197, 253, 0.34);
		color: #dbeafe;
	}

	.action-chip.is-source-change {
		background:
			linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(251, 191, 36, 0.08)),
			rgba(69, 26, 3, 0.32);
		border-color: rgba(251, 191, 36, 0.48);
		color: #fde68a;
	}

	.action-chip.is-source-change small {
		color: #fbbf24;
	}

	.empty-state {
		margin: 14px;
		padding: 18px 14px;
		border: 1px dashed #cbd5e1;
		border-radius: 10px;
		background: var(--color-surface);
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 800;
		text-align: center;
	}

	.comparison-grid + .empty-state,
	.operation-grid + .empty-state {
		margin-top: 0;
	}

	.muted {
		color: #94a3b8;
	}

	@media (max-width: 1280px) {
		.summary-grid {
			grid-template-columns: repeat(3, minmax(160px, 1fr));
		}

		.main-grid,
		.table-grid {
			grid-template-columns: 1fr;
		}

		.vdor-date-context,
		.vdor-upload-workflow {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 760px) {
		.fuel-management-page {
			padding: 10px;
		}

		.fuel-header-card {
			display: grid;
			align-items: stretch;
			gap: 12px;
		}

		.header-actions {
			justify-content: stretch;
			min-width: 0;
		}

		.header-rob-card,
		.history-toolbar,
		.history-filters,
		.history-filters label,
		.history-filters input,
		.history-filters select,
		.history-operation-button,
		.history-load-button {
			width: 100%;
		}

		.history-toolbar {
			justify-content: stretch;
		}

		.summary-grid,
		.operation-grid,
		.comparison-grid,
		.vdor-flow-rail,
		.vdor-source-grid,
		.vdor-confirm-row,
		.vdor-workflow-actions,
		.vdor-context-actions,
		.vdor-system-context,
		.vdor-midnight-reference,
		.split-fields {
			grid-template-columns: 1fr;
		}

		.vdor-import-heading,
		.vdor-preview-header,
		.vdor-comparison-heading,
		.vdor-stored-heading,
		.vdor-source-selection-heading,
		.vdor-preview-comparison-heading {
			align-items: stretch;
			flex-direction: column;
		}

		.vdor-comparison-badges {
			justify-content: flex-start;
		}

		.vdor-comparison-state,
		.vdor-missing-guide {
			align-items: stretch;
			flex-direction: column;
		}

		.vdor-comparison-state > button,
		.vdor-missing-guide > button {
			width: 100%;
		}

		.vdor-step-badge {
			align-self: flex-start;
		}

		.fuel-operation-modal-backdrop {
			padding: 10px;
		}

		.fuel-operation-modal-card {
			width: 100%;
			max-height: calc(100dvh - var(--vessel-topbar-height, 56px) - 20px);
			border-radius: 18px;
		}

		.fuel-operation-modal-header {
			padding: 16px;
		}

		.fuel-operation-modal-body {
			max-height: calc(100dvh - var(--vessel-topbar-height, 56px) - 118px);
			padding: 12px;
		}

		.fuel-header-card h1 {
			font-size: 19px;
		}

		.panel-header {
			display: grid;
			align-items: start;
		}

		.history-control {
			flex-wrap: wrap;
		}
	}
</style>
