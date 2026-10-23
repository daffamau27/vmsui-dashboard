<script>
	import { fourDigitDateYear } from '$lib/actions/fourDigitDateYear.js';
	import { selectedVesselId, selectedVesselInfo } from '$lib/stores/selectedVessel.svelte.js';
	import { setPageStatus } from '$lib/stores/pageStatusStore.svelte.js';
	import { apiRequest } from '$lib/api/authApi.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import FuelManagementHeader from './FuelManagementHeader.svelte';
	import FuelManagementToast from './FuelManagementToast.svelte';
	import FuelManagementSummary from './FuelManagementSummary.svelte';
	import FuelManagementTables from './FuelManagementTables.svelte';
	import FuelManagementHistory from './FuelManagementHistory.svelte';
	import './fuel-management-page.css';
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
		vdorPreviewSystemComparison?.dailySystem || vdorPreviewSystemComparison?.daily_system || null
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
		const normalized = String(value || '')
			.trim()
			.toLowerCase();

		if (['fm', 'fms'].includes(normalized)) return 'FM';
		if (normalized === 'ecu') return 'ECU';
		if (['ems_internal', 'vms'].includes(normalized)) return 'VMS';
		if (['ems_external', 'ems'].includes(normalized)) return 'EMS';

		return normalized ? normalized.toUpperCase().replace(/_/g, ' ') : '-';
	}

	function isDailyConsumptionAction(action) {
		return String(action || '')
			.trim()
			.toLowerCase()
			.includes('daily consumption');
	}

	function isFuelSourceChangeAction(action) {
		return String(action || '')
			.trim()
			.toLowerCase()
			.includes('fuel source change');
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
	let shouldShowDateRangeOverlay = $derived(
		!hasLoadedDateRange || !historyStartDate || !historyEndDate
	);
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

	let fuelTableCards = $derived(
		tableConfigs.filter(canViewTableConfig).map((config) => {
			const section = getSection(config.key);

			return {
				key: config.key,
				title: getTableTitle(config),
				description: getTableDescription(config),
				columns: config.columns,
				rows: getRows(config.key).map((row) =>
					config.columns.map((column) => ({
						text: formatValue(row?.[column.field], column.type),
						right: column.align === 'right'
					}))
				),
				totalLabel: section?.grand_total !== undefined ? formatLiter(section.grand_total) : '',
				subtotalAeLabel: section?.subtotal_ae !== undefined ? formatLiter(section.subtotal_ae) : '',
				subtotalMeLabel: section?.subtotal_me !== undefined ? formatLiter(section.subtotal_me) : '',
				grandTotalLabel: section?.grand_total !== undefined ? formatLiter(section.grand_total) : '-'
			};
		})
	);

	let fuelHistoryViewRows = $derived(
		historyRows.map((item, index) => ({
			key: item.id || `${item.date}-${index}`,
			raw: item,
			dateLabel: formatHistoryDate(item.date),
			periodLabel: item.period_label,
			action: item.action || '-',
			source: getHistoryActionSource(item),
			isSourceChange: isFuelSourceChangeAction(item.action),
			user: item.user || '-',
			receivedLabel: hasPositiveFuelValue(item.received) ? formatLiter(item.received) : '',
			consumptionLabel:
				!hasPositiveFuelValue(item.received) && hasPositiveFuelValue(item.consumption)
					? formatLiter(item.consumption)
					: '',
			robAfter: item.rob_after || '-',
			hasNote: hasHistoryNote(item)
		}))
	);

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
							sourceItem?.consumption_l ?? sourceItem?.consumptionL ?? sourceItem?.consumption ?? 0,
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
								dayItem?.consumption ?? dayItem?.consumption_l ?? dayItem?.consumptionL ?? 0,
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
				const type = String(
					transaction?.transaction_type || transaction?.transactionType || ''
				).toUpperCase();
				const isConsumption = ['BOUT', 'CONSUMPTION', 'OUT'].includes(type);

				return {
					date: transaction?.timestamp || dayItem?.date || '-',
					action: transaction?.action || transaction?.transaction_type || '-',
					user: transaction?.user || '-',
					received: !isConsumption && quantity > 0 ? quantity : 0,
					consumption: isConsumption && quantity > 0 ? quantity : 0,
					rob_after: transaction?.rob_after ?? transaction?.robAfter ?? dayItem?.rob_end ?? '-',
					rob_before:
						transaction?.rob_before ?? transaction?.robBefore ?? dayItem?.rob_start ?? '-',
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

	async function loadHistoryFor({
		vesselId,
		startDate,
		endDate,
		mode,
		offset,
		page = 1,
		limit = 10
	}) {
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
			const vdorValue = optionalFuelNumber(item?.vdor_consumption_l ?? item?.vdorConsumptionL) ?? 0;
			const systemValue =
				optionalFuelNumber(
					item?.daily_system_consumption_l ??
						item?.dailySystemConsumptionL ??
						item?.system_consumption_l ??
						item?.systemConsumptionL
				) ?? 0;

			return {
				label:
					item?.label ||
					item?.engine_name ||
					item?.engineName ||
					item?.tank_name ||
					item?.tankName ||
					'-',
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
				label:
					item?.label ||
					item?.engineName ||
					item?.engine_name ||
					item?.tankName ||
					item?.tank_name ||
					'-',
				consumption_l:
					optionalFuelNumber(item?.consumption_l ?? item?.consumptionL ?? item?.consumption) ?? 0
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
					item?.label ||
					item?.engine_name ||
					item?.engineName ||
					item?.tank_name ||
					item?.tankName ||
					'-';

				return {
					key: `${key}:${String(label).trim().toLowerCase()}`,
					label,
					value:
						optionalFuelNumber(item?.consumption_l ?? item?.consumptionL ?? item?.consumption) ?? 0
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
	<FuelManagementHeader
		vesselName={currentVesselName}
		latestRob={latestRobHeader}
		loading={loadingData}
	/>

	<FuelManagementToast
		showNoVessel={!currentVesselId && !hideNoVesselNotice}
		{errorMessage}
		{successMessage}
		onCloseNoVessel={() => (hideNoVesselNotice = true)}
		onCloseError={() => (errorMessage = '')}
		onCloseSuccess={() => (successMessage = '')}
	/>

	<FuelManagementSummary loading={loadingData} cards={summaryCards} />

	<FuelManagementTables loading={loadingData} cards={fuelTableCards} />

	<FuelManagementHistory
		bind:startDate={historyStartDate}
		bind:endDate={historyEndDate}
		bind:timezoneMode
		bind:timezoneOffset
		{autoTimezoneLabel}
		error={historyError}
		loading={loadingHistory}
		rows={fuelHistoryViewRows}
		page={historyPage}
		totalPages={Number(historyPagination?.total_pages || 1)}
		{shouldShowDateRangeOverlay}
		onLoad={() => loadHistoryCurrent(1)}
		onPage={loadHistoryPage}
		onOpenOperations={openFuelOperationOverlay}
		onOpenNote={openHistoryNote}
		onFilterChange={markDateFilterDirty}
	/>

	{#if showFuelOperationOverlay}
		<div
			class="fuel-operation-modal-backdrop"
			role="presentation"
			onclick={closeFuelOperationOverlay}
		>
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
										<input
											type="datetime-local"
											use:fourDigitDateYear
											bind:value={robForm.datetime}
										/>
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
										<input
											type="text"
											bind:value={robForm.note}
											placeholder="Initial tank sounding"
										/>
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
										<input
											type="datetime-local"
											use:fourDigitDateYear
											bind:value={transactionForm.datetime}
										/>
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
											<p>
												Review an existing comparison by date, or preview a new VDOR file before
												saving it.
											</p>
										</div>
										<span class="vdor-step-badge">Comparison workspace</span>
									</div>

									<section class="vdor-date-context">
										<div class="vdor-context-copy">
											<span class="vdor-context-icon" aria-hidden="true">01</span>
											<div>
												<strong>Existing comparison</strong>
												<small
													>Select a date to compare the saved VDOR against the system calculation
													for that day.</small
												>
											</div>
										</div>

										<div class="vdor-context-actions">
											<label>
												<span>VDOR date</span>
												<input
													type="date"
													use:fourDigitDateYear
													bind:value={vdorDate}
													onchange={handleVdorDateChange}
												/>
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
												<p>
													When VDOR data exists, its fuel is compared label-by-label with the daily
													system calculation.
												</p>
											</div>
											{#if vdorStoredComparisonData}
												<div class="vdor-comparison-badges">
													<span>{vdorStoredIsFod ? 'Tank basis' : 'Engine basis'}</span>
													<span
														>Source: {formatFuelSourceLabel(
															vdorStoredSystem?.fuel_source ?? vdorStoredSystem?.fuelSource
														)}</span
													>
													<span class:available={Boolean(vdorStoredVdor?.present)}>
														{vdorStoredVdor?.present ? 'VDOR available' : 'No VDOR'}
													</span>
												</div>
											{/if}
										</header>

										{#if vdorComparisonLoading}
											<LoadingSkeleton
												label="Loading VDOR and system data"
												variant="fuel-comparison"
											/>
										{:else if vdorComparisonError}
											<div class="vdor-comparison-state error">
												<div>
													<strong>Data unavailable</strong><span>{vdorComparisonError}</span>
												</div>
												<button
													type="button"
													class="secondary-button"
													onclick={refreshStoredVdorComparison}>Try Again</button
												>
											</div>
										{:else if vdorStoredComparisonData}
											<div class="vdor-stored-metrics">
												<article class="vdor-comparison-metric">
													<span>VDOR Total Consumption</span><strong
														>{formatLiter(vdorStoredVdorTotal)}</strong
													>
													<small
														>{vdorStoredVdor?.present
															? 'Imported crew report'
															: 'Not imported'}</small
													>
												</article>
												<article class="vdor-comparison-metric">
													<span>System Total Consumption</span><strong
														>{formatLiter(vdorStoredSystemTotal)}</strong
													>
													<small
														>{formatFuelSourceLabel(
															vdorStoredSystem?.fuel_source ?? vdorStoredSystem?.fuelSource
														)} calculation</small
													>
												</article>
												<article
													class="vdor-comparison-metric"
													class:variance={Boolean(
														vdorStoredVariance?.has_variance ?? vdorStoredVariance?.hasVariance
													)}
												>
													<span>Total Difference</span><strong
														>{formatLiter(vdorStoredDifference)}</strong
													>
													<small
														>{(vdorStoredVariance?.has_variance ?? vdorStoredVariance?.hasVariance)
															? 'Variance detected'
															: 'No variance detected'}</small
													>
												</article>
												<article
													class="vdor-comparison-metric"
													class:variance={Boolean(
														vdorStoredVariance?.has_variance ?? vdorStoredVariance?.hasVariance
													)}
												>
													<span>Difference %</span><strong
														>{vdorStoredPercentDifference === null
															? '-'
															: `${formatNumber(vdorStoredPercentDifference)}%`}</strong
													>
													<small>VDOR against system</small>
												</article>
											</div>

											{#if !vdorStoredVdor?.present}
												<div class="vdor-missing-guide">
													<div class="vdor-missing-guide-copy">
														<strong>No VDOR imported for {vdorDate}</strong>
														<span
															>A comparison cannot be created until a VDOR file is imported.</span
														>
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
														{actionLoading === 'template'
															? 'Downloading...'
															: 'Download VDOR Template'}
													</button>
												</div>
											{:else if vdorStoredDifferenceRows.length}
												<div class="vdor-difference-table-wrap">
													<table class="vdor-difference-table">
														<thead
															><tr
																><th>{vdorStoredIsFod ? 'Tank' : 'Engine'}</th><th>VDOR</th><th
																	>System</th
																><th>Difference</th></tr
															></thead
														>
														<tbody>
															{#each vdorStoredDifferenceRows as row}
																<tr
																	><td>{row.label}</td><td>{formatLiter(row.vdor)}</td><td
																		>{formatLiter(row.system)}</td
																	><td class={deltaClass(row.difference)}
																		>{formatLiter(row.difference)}</td
																	></tr
																>
															{/each}
														</tbody>
													</table>
												</div>
											{/if}

											{#if vdorStoredSystem?.opening_rob_l !== undefined || vdorStoredSystem?.openingRobL !== undefined || vdorStoredSystem?.closing_rob_l !== undefined || vdorStoredSystem?.closingRobL !== undefined}
												<div class="vdor-system-context">
													<div>
														<span>System Opening ROB</span><strong
															>{formatLiter(
																vdorStoredSystem?.opening_rob_l ?? vdorStoredSystem?.openingRobL
															)}</strong
														>
													</div>
													<div>
														<span>System Closing ROB</span><strong
															>{formatLiter(
																vdorStoredSystem?.closing_rob_l ?? vdorStoredSystem?.closingRobL
															)}</strong
														>
													</div>
												</div>
											{/if}
										{:else}
											<div class="vdor-comparison-state empty">
												<div>
													<strong>Ready to compare</strong><span
														>Select a date and click Get Comparison to load VDOR and system values.</span
													>
												</div>
											</div>
										{/if}
									</section>

									<section class="vdor-upload-workflow">
										<div class="vdor-workflow-heading">
											<span>02</span>
											<div>
												<strong>Preview a new comparison</strong>
												<small
													>Upload a completed VDOR Excel file. Its report date is read from the file
													and compared with system data.</small
												>
											</div>
										</div>

										<div class="vdor-workflow-actions preview-actions">
											<label class="vdor-file-picker">
												<input
													type="file"
													accept=".xlsx"
													onchange={handleFileInput}
													disabled={importPreviewLoading || importSaveLoading}
												/>
												<span>Choose Excel</span>
												<strong>{selectedImportFileName || 'No file selected'}</strong>
											</label>
											<button
												type="button"
												class="vdor-preview-button"
												onclick={previewImportVdor}
												disabled={importPreviewLoading || importSaveLoading || !selectedImportFile}
											>
												{importPreviewLoading ? 'Generating...' : 'Preview VDOR'}
											</button>
										</div>
									</section>

									{#if importPreviewLoading}
										<LoadingSkeleton
											label="Parsing VDOR and preparing comparison"
											variant="fuel-comparison"
										/>
									{:else if vdorPreviewData}
										<section class="vdor-preview-panel">
											<div class="vdor-preview-header">
												<div>
													<span class="section-kicker">New import preview</span>
													<h4>
														{currentVesselName} · {getVdorPreviewDate() || 'Date unavailable'}
													</h4>
												</div>
												<strong
													>{formatLiter(
														buildVdorConsumptionForSave().totalEnginesConsumption
													)}</strong
												>
											</div>

											<section class="vdor-source-selection">
												<header class="vdor-source-selection-heading">
													<div>
														<span class="section-kicker">Daily values comparison</span>
														<h4>VDOR vs System daily values</h4>
														<p>
															Compare the daily values side by side. System values are used when the
															VDOR is saved.
														</p>
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
																<div class="selected">
																	<span>System</span><strong>{formatLiter(row.system)}</strong>
																</div>
																<div class="vdor-reference">
																	<span>VDOR</span><strong>{formatLiter(row.vdor)}</strong>
																</div>
															</div>
														</article>
													{/each}
												</div>

												<div class="vdor-midnight-reference">
													<div>
														<span>Midnight ROB</span><small
															>Reference only; it is not sent as a save option.</small
														>
													</div>
													<div>
														<span>VDOR</span><strong
															>{formatLiter(
																getVdorDailyValue('midnightRob', 'midnight_rob')
															)}</strong
														>
													</div>
													<div>
														<span>System</span><strong
															>{formatLiter(getPreviewSystemValue('midnightRob'))}</strong
														>
													</div>
												</div>
											</section>

											<section class="vdor-preview-comparison">
												<header class="vdor-preview-comparison-heading">
													<div>
														<span class="section-kicker">Import preview comparison</span>
														<h4>Excel VDOR vs Daily System</h4>
														<p>
															This comparison comes from the uploaded file date, before anything is
															saved.
														</p>
													</div>
													<div class="vdor-comparison-badges">
														<span>Preview only</span>
														<span>{vdorPreviewIsFod ? 'Tank basis' : 'Engine basis'}</span>
														<span
															>Source: {formatFuelSourceLabel(
																vdorPreviewSystemComparison?.system_fuel_source ??
																	vdorPreviewSystemComparison?.systemFuelSource ??
																	vdorPreviewSystemDaily?.fuel_source
															)}</span
														>
													</div>
												</header>

												<div class="vdor-stored-metrics preview-metrics">
													<article class="vdor-comparison-metric">
														<span>Excel VDOR</span><strong
															>{formatLiter(vdorPreviewVdorTotal)}</strong
														><small>Uploaded file</small>
													</article>
													<article class="vdor-comparison-metric">
														<span>Daily System</span><strong
															>{formatLiter(vdorPreviewSystemTotal)}</strong
														><small
															>{formatFuelSourceLabel(
																vdorPreviewSystemComparison?.system_fuel_source ??
																	vdorPreviewSystemComparison?.systemFuelSource ??
																	vdorPreviewSystemDaily?.fuel_source
															)} calculation</small
														>
													</article>
													<article
														class="vdor-comparison-metric"
														class:variance={vdorPreviewDifference !== 0}
													>
														<span>Difference</span><strong
															>{formatLiter(vdorPreviewDifference)}</strong
														><small
															>{vdorPreviewDifference === 0
																? 'Values match'
																: 'Review variance'}</small
														>
													</article>
													<article
														class="vdor-comparison-metric"
														class:variance={vdorPreviewDifference !== 0}
													>
														<span>Difference %</span><strong
															>{vdorPreviewDifferencePercent === null
																? '-'
																: `${formatNumber(vdorPreviewDifferencePercent)}%`}</strong
														><small>Excel against system</small>
													</article>
												</div>

												{#if vdorPreviewDifferenceRows.length}
													<div class="vdor-difference-table-wrap">
														<table class="vdor-difference-table">
															<thead
																><tr
																	><th>{vdorPreviewIsFod ? 'Tank' : 'Engine'}</th><th>Excel VDOR</th
																	><th>System</th><th>Difference</th></tr
																></thead
															>
															<tbody>
																{#each vdorPreviewDifferenceRows as row}
																	<tr
																		><td>{row.label}</td><td>{formatLiter(row.vdor)}</td><td
																			>{formatLiter(row.system)}</td
																		><td class={deltaClass(row.difference)}
																			>{formatLiter(row.difference)}</td
																		></tr
																	>
																{/each}
															</tbody>
														</table>
													</div>
												{:else}
													<div class="vdor-comparison-empty">
														No per-{vdorPreviewIsFod ? 'tank' : 'engine'} comparison rows were returned.
													</div>
												{/if}
											</section>

											<section class="vdor-save-workflow">
												<div class="vdor-workflow-heading compact">
													<span>03</span>
													<div>
														<strong>Save reviewed VDOR</strong><small
															>Save only after the VDOR and system differences have been reviewed.</small
														>
													</div>
												</div>
												<div class="vdor-confirm-row">
													<label>
														<span>Import note</span>
														<input type="text" bind:value={vdorImportNote} />
													</label>
													<button
														type="button"
														onclick={submitImportVdor}
														disabled={importSaveLoading}
													>
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
						<p>
							{selectedHistoryNote.formattedDate || selectedHistoryNote.date} • {selectedHistoryNote.user}
						</p>
					</div>
					<button
						type="button"
						class="note-modal-close"
						onclick={closeHistoryNote}
						aria-label="Close note"
					>
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
