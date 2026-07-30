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
		importFuelVdor,
		downloadVdorTemplate
	} from '$lib/api/fuelManagementApi.js';
	import { TIMEZONE_MODE_OPTIONS, TIMEZONE_OFFSET_OPTIONS } from '$lib/utils/timezoneOptions.js';

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
	let importLoading = $state(false);

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
			title: 'Per Engine - System / FMS',
			description: 'Fuel usage from system/FMS basis.',
			permission: 'view_fuel_fms',
			columns: [
				{ label: 'Engine', field: 'engine', align: 'left' },
				{ label: 'Source', field: 'source', align: 'left' },
				{ label: 'Metric', field: 'metric', align: 'left' },
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
				{ label: 'Class', field: 'class', align: 'left' },
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
				{ label: 'Class', field: 'class', align: 'left' },
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
				{ label: 'Class', field: 'class', align: 'left' },
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
	let comparison = $derived(perEngine?.comparison || null);
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

	async function submitImportVdor() {
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

		importLoading = true;

		try {
			const fileBase64 = await fileToBase64(selectedImportFile);
			const response = await importFuelVdor({ vesselId: currentVesselId, fileBase64 });

			successMessage = response?.message || 'VDOR imported successfully.';
			selectedImportFile = null;
			selectedImportFileName = '';
			await refreshCurrent();
		} catch (err) {
			console.error('[FUEL_MANAGEMENT][IMPORT_VDOR][ERROR]', err);
			errorMessage = getErrorMessage(
				err,
				'Failed to import VDOR. Make sure the file uses the correct Excel template.'
			);
		} finally {
			importLoading = false;
		}
	}

	async function downloadTemplate() {
		clearMessages();

		if (!canImportVdor) {
			errorMessage = 'This account does not have permission to download the VDOR template.';
			return;
		}

		actionLoading = 'template';

		try {
			const response = await downloadVdorTemplate();

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
			const fileName = encodedFileName
				? decodeURIComponent(encodedFileName)
				: 'vdor_import_template.xlsx';

			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = fileName.toLowerCase().endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			window.setTimeout(() => URL.revokeObjectURL(url), 1000);

			successMessage = 'VDOR template downloaded successfully.';
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
				<small>{report?.timezone || 'fuel_rob'}</small>
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

	<section class="main-grid">
		<article class="panel comparison-panel full-width-panel">
			<div class="panel-header">
				<div>
					<h2>Comparison</h2>
					<p>System total compared with VDOR basis.</p>
				</div>
				{#if report?.timezone}
					<span class="badge">{report.timezone}</span>
				{/if}
			</div>

			{#if loadingData}
				<LoadingSkeleton label="Loading fuel comparison" variant="fuel-comparison" />
			{:else if comparison}
				<div class="comparison-grid">
					<div>
						<span>System Total</span>
						<strong>{formatLiter(comparison.system_total)}</strong>
					</div>
					<div>
						<span>VDOR Basis</span>
						<strong>{formatLiter(comparison.vdor_basis)}</strong>
					</div>
					<div class={deltaClass(comparison.delta)}>
						<span>Delta</span>
						<strong>{formatLiter(comparison.delta)}</strong>
					</div>
					<div class={deltaClass(comparison.delta_percentage)}>
						<span>Delta %</span>
						<strong>{formatNumber(comparison.delta_percentage)}%</strong>
					</div>
				</div>
			{:else}
				<div class="empty-state">
					Comparison data is not available for your permissions or this date.
				</div>
			{/if}
		</article>

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
						<span>Timezone</span>
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
								<div class="mini-form">
									<h3>VDOR Import</h3>
									<label class="file-picker">
										<span>Excel file</span>
										<input type="file" accept=".xlsx" onchange={handleFileInput} />
										<small>{selectedImportFileName || 'No file selected'}</small>
									</label>
									<button type="button" onclick={submitImportVdor} disabled={importLoading}>
										{importLoading ? 'Importing...' : 'Import VDOR'}
									</button>
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
		background: rgba(17, 24, 39, 0.94);
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
		color: var(--text-primary);
	}

	.fuel-toast span {
		font-size: 12px;
		font-weight: 700;
		line-height: 1.35;
		color: var(--text-secondary);
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
		color: var(--text-secondary);
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
		inset: 0;
		z-index: 82;
		display: grid;
		place-items: center;
		padding: 20px;
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
		max-height: min(760px, calc(100vh - 40px));
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
		max-height: calc(min(760px, calc(100vh - 40px)) - 88px);
		overflow: auto;
		padding: 16px;
		background:
			radial-gradient(circle at top left, rgba(37, 99, 235, 0.08), transparent 34%),
			rgba(8, 13, 26, 0.28);
	}

	.modal-operation-grid {
		padding: 0;
		grid-template-columns: repeat(3, minmax(250px, 1fr));
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
		.split-fields {
			grid-template-columns: 1fr;
		}

		.fuel-operation-modal-backdrop {
			padding: 10px;
		}

		.fuel-operation-modal-card {
			width: 100%;
			max-height: calc(100vh - 20px);
			border-radius: 18px;
		}

		.fuel-operation-modal-header {
			padding: 16px;
		}

		.fuel-operation-modal-body {
			max-height: calc(100vh - 118px);
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
