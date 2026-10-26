<script>
	import { fourDigitDateYear } from '$lib/actions/fourDigitDateYear.js';
	import { onMount, tick } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { getCurrentUserApi } from '$lib/api/authApi.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import AdministratorHeader from './AdministratorHeader.svelte';
	import './administrator-page.css';
	import { TIMEZONE_MODE_OPTIONS, TIMEZONE_OFFSET_OPTIONS } from '$lib/utils/timezoneOptions.js';
	import { getAutoTimezoneLabelFromSources } from '$lib/utils/autoTimezoneLabel.js';
	import { matchesSearch, sortByAlpha } from '$lib/utils/alphaSort.js';
	import { getAccessCompanyFields, groupAccessOptions } from '$lib/utils/companyAccessGroups.js';
	import {
		getPermissionCatalogApi,
		getAllUsersApi,
		getUserDetailApi,
		createUserApi,
		updateUserApi,
		deactivateUserApi,
		activateUserApi,
		getAllVesselsAdminApi,
		getAvailableVesselFeaturesAdminApi,
		getVesselDetailAdminApi,
		createVesselAdminApi,
		updateVesselAdminApi,
		deleteVesselAdminApi,
		getCctvConfigAdminApi,
		updateCctvConfigAdminApi,
		getAllAssetsAdminApi,
		getAssetDetailAdminApi,
		createAssetAdminApi,
		updateAssetAdminApi,
		deleteAssetAdminApi,
		downloadEngineCurveTemplateAdminApi,
		importEngineCurveAdminApi,
		getAllEngineCurvesAdminApi,
		getEngineCurveDetailAdminApi,
		deleteEngineCurveAdminApi,
		toggleEngineCurveActiveAdminApi,
		getReportingVesselsAdminApi,
		getPeriodicalReportingVesselsAdminApi,
		saveAutoReportConfigAdminApi,
		savePeriodicalAutoReportConfigAdminApi,
		getReportingAssignableUsersAdminApi,
		downloadReportingDailyReportAdminApi,
		sendReportingDailyReportEmailAdminApi,
		downloadReportingPeriodicalReportAdminApi,
		sendReportingPeriodicalReportEmailAdminApi,
		getAutoReportAuditLogsAdminApi,
		exportAutoReportAuditLogsCsvAdminApi,
		getTelegramGroupsAdminApi,
		createTelegramGroupAdminApi,
		getTelegramGroupDetailAdminApi,
		updateTelegramGroupAdminApi,
		deleteTelegramGroupAdminApi,
		saveEngineHealthConfigAdminApi,
		getAllCompaniesAdminApi,
		syncCompaniesAdminApi,
		deleteCompanyAdminApi,
		syncAllVesselsAdminApi,
		getGlobalAuditLogsAdminApi,
		exportGlobalAuditLogsCsvAdminApi
	} from '$lib/api/administratorApi.js';

	let bootLoading = true;
	let usersLoading = false;
	let permissionsLoading = false;
	let selectedUserLoading = false;
	let saving = false;
	let actionLoadingId = null;

	let users = [];
	let modulePermissions = {};
	let currentUser = null;

	export let initialTab = 'users';

	let activeAdminTab = 'users';
	const adminTabOrder = [
		'users',
		'vessels',
		'assets',
		'engine-curves',
		'reporting',
		'cctv-config',
		'alarm',
		'global-audit-logs'
	];
	activeAdminTab = adminTabOrder.includes(initialTab) ? initialTab : 'users';
	let adminTabDirection = 1;
	let adminTabsElement;
	let adminTabIndicatorStyle = 'width: 0px; transform: translateX(0px); opacity: 0;';
	let adminTabIndicatorFrame = null;

	let vessels = [];
	let vesselsLoading = false;
	let vesselSaving = false;
	let vesselActionLoadingId = null;
	let selectedVessel = null;
	let vesselMode = 'create';
	let searchVessel = '';
	let vesselCompanyFilterOpen = false;
	let selectedVesselCompanyIds = [];
	let availableVesselFeatures = [];
	let vesselFeatureCatalogLoading = false;
	let vesselFeatureCatalogLoaded = false;
	let vesselFeatureCatalogError = '';
	let vesselFeaturesLoading = false;
	let vesselFeaturesLoaded = false;
	let vesselFeaturesError = '';
	let vesselFeaturesRequestId = 0;
	const FUEL_CONSUMPTION_SOURCE_OPTIONS = [
		{ value: 'fm', label: 'FM' },
		{ value: 'ecu', label: 'ECU' },
		{ value: 'ems_internal', label: 'VMS' },
		{ value: 'ems_external', label: 'EMS' }
	];

	let cctvSelectedVessel = null;
	let cctvConfigLoading = false;
	let cctvConfigSaving = false;
	let cctvSearchVessel = '';
	let cctvConfigMeta = null;
	let cctvForm = {
		cameras: []
	};

	let companies = [];
	let companiesLoading = false;
	let companiesSyncing = false;
	let companyActionLoadingId = null;
	let syncAllLoading = false;
	let searchCompany = '';

	let assets = [];
	let assetsLoading = false;
	let assetSaving = false;
	let assetActionLoadingId = null;
	let selectedAsset = null;
	let assetMode = 'create';
	let searchAsset = '';

	let engineCurves = [];
	let engineCurvesLoading = false;
	let engineCurveSaving = false;
	let engineCurveActionLoadingId = null;
	let selectedEngineCurve = null;
	let selectedEngineCurveDetail = null;
	let selectedEngineCurveLoading = false;
	let searchEngineCurve = '';
	let searchEngineCurveImportVessel = '';
	let engineCurveImportVesselDropdownOpen = false;
	let engineCurveFileInput;
	let engineCurveValidFromInput;
	let engineCurveActivationDate = getTodayDate();

	let reportingVessels = [];
	let reportingVesselsLoading = false;
	let reportingSaving = false;
	let reportingActionLoadingId = null;
	let selectedReportingVessel = null;
	let reportingAssignableUsers = [];
	let reportingAssignableUsersLoading = false;
	let reportingAssignableSearch = '';
	let manualRecipientEmail = '';
	let manualRecipientRole = 'pic';
	let reportingAssignablePagination = {
		page: 1,
		pageSize: 20,
		totalItems: 0,
		totalPages: 1
	};
	let reportingContentSearch = '';
	let reportingMode = 'daily';

	let globalAuditLogs = [];
	let globalAuditPagination = {
		page: 1,
		pageSize: 20,
		totalItems: 0,
		totalPages: 1,
		hasNext: false,
		hasPrevious: false
	};
	let globalAuditLoading = false;
	let globalAuditExporting = false;

	let globalAuditFilters = {
		userId: '',
		page: 1,
		pageSize: 20,
		startDate: '',
		endDate: ''
	};

	async function loadGlobalAuditLogs(page = globalAuditFilters.page) {
		globalAuditLoading = true;

		try {
			const data = await getGlobalAuditLogsAdminApi({
				userId: globalAuditFilters.userId,
				page,
				pageSize: globalAuditFilters.pageSize
			});

			globalAuditLogs = data?.items || [];
			globalAuditPagination = data?.pagination || {
				page,
				pageSize: globalAuditFilters.pageSize,
				totalItems: 0,
				totalPages: 1,
				hasNext: false,
				hasPrevious: false
			};

			globalAuditFilters = {
				...globalAuditFilters,
				page: globalAuditPagination.page || page
			};
		} catch (error) {
			showAlert('error', error.message || 'Failed to load audit logs.');
		} finally {
			globalAuditLoading = false;
		}
	}

	function applyGlobalAuditFilters() {
		globalAuditFilters = {
			...globalAuditFilters,
			page: 1
		};

		loadGlobalAuditLogs(1);
	}

	function resetGlobalAuditFilters() {
		globalAuditFilters = {
			userId: '',
			page: 1,
			pageSize: 20,
			startDate: '',
			endDate: ''
		};

		loadGlobalAuditLogs(1);
	}

	async function exportGlobalAuditCsv() {
		globalAuditExporting = true;
		clearAlert();

		try {
			await exportGlobalAuditLogsCsvAdminApi({
				userId: globalAuditFilters.userId,
				startDate: globalAuditFilters.startDate,
				endDate: globalAuditFilters.endDate
			});

			showAlert('success', 'Global audit logs CSV downloaded successfully.');
		} catch (error) {
			showAlert('error', error.message || 'Failed to export global audit logs.');
		} finally {
			globalAuditExporting = false;
		}
	}

	function goToGlobalAuditPage(page) {
		const targetPage = Number(page);

		if (!Number.isFinite(targetPage) || targetPage < 1) return;

		loadGlobalAuditLogs(targetPage);
	}

	let reportingFilters = {
		search: '',
		status: 'all',
		autoReport: 'all'
	};

	const REPORT_CONTENT_PERMISSION_KEYS = [
		'view_engine_runtime_table',
		'view_engine_event_status_history',
		'view_engine_on_off_chart',
		'view_clutch_in_chart',
		'view_fuel_consumption_table',
		'view_fuel_fod',
		'view_fuel_ecu',
		'view_fuel_fms',
		'view_fuel_ems_internal',
		'view_fuel_ems_external',
		'view_fuel_engine_maker',
		'view_engine_rpm_stats_table',
		'view_speed_stats_table',
		'view_travel_distance_table',
		'view_daily_path_map',
		'view_rpm_vs_fuel_chart',
		'view_rpm_ranges_runtime_fuel_table',
		'view_liter_per_nautical_mile_table',
		'view_high_rpm_outside_safety_zone_table',
		'view_high_rpm_low_speed_table'
	];

	const REPORT_CONTENT_FALLBACK_LABELS = {
		view_engine_runtime_table: 'Engine Runtime Table',
		view_engine_event_status_history: 'Engine Event Status History',
		view_engine_on_off_chart: 'Engine On/Off Chart',
		view_clutch_in_chart: 'Clutch In Chart',
		view_fuel_consumption_table: 'Fuel Consumption Table',
		view_fuel_fod: 'FOD Fuel',
		view_fuel_ecu: 'ECU Fuel',
		view_fuel_fms: 'FMS Fuel',
		view_fuel_ems_internal: 'VMS Fuel',
		view_fuel_ems_external: 'EMS Fuel',
		view_fuel_engine_maker: 'Engine Maker Fuel',
		view_engine_rpm_stats_table: 'Engine RPM Stats Table',
		view_speed_stats_table: 'Speed Stats Table',
		view_travel_distance_table: 'Travel Distance Table',
		view_daily_path_map: 'Daily Path Map',
		view_rpm_vs_fuel_chart: 'RPM vs Fuel Chart',
		view_rpm_ranges_runtime_fuel_table: 'RPM Ranges Runtime & Fuel Table',
		view_liter_per_nautical_mile_table: 'Liter per Nautical Mile Table',
		view_high_rpm_outside_safety_zone_table: 'High RPM Outside Safety Zone Table',
		view_high_rpm_low_speed_table: 'High RPM Low Speed Table'
	};

	const PERMISSION_EFFECT_HINTS = {
		access_dashboard: 'Shows the Vessel Dashboard menu and dashboard page.',
		access_daily_report: 'Shows the Daily Report menu and daily report page.',
		access_monthly_report: 'Shows the Monthly Report menu and monthly report page.',
		access_periodical_report: 'Shows the Periodical Report menu and periodical report page.',
		access_trace: 'Shows the Trace menu and trace playback page.',
		access_data_log:
			'Shows the Data Log menu, date filters, column picker, table, and export action.',
		access_fuel_management: 'Shows the Fuel Management menu and fuel operation page.',
		access_single_line:
			'Shows the Single Line Diagram menu and vessel electrical diagram workspace.',
		access_fleet_view: 'Shows the Fleet View sidebar menu and fleet monitoring map.',
		access_all_vessel_summary: 'Shows the All Vessel Summary sidebar menu and summary page.',
		access_voyage_plan_fleet:
			'Shows the Voyage Plan Fleet sidebar menu and fleet plan management page.',
		access_alarm: 'Shows the Alarm sidebar menu and alarm page.',
		view_voyage_plan_vessel: 'Shows the vessel Voyage Plan menu and active voyage plan map.',

		view_daily_path_map: 'Shows vessel map, route preview, position panels, and daily trip map.',
		view_engine_runtime_table: 'Shows engine runtime table in Daily Report and reporting content.',
		view_engine_event_status_history:
			'Shows engine status history runtime in Daily Report and reporting content.',
		view_engine_on_off_chart: 'Shows engine activity compact timeline in Daily Report.',
		view_clutch_in_chart: 'Shows clutch activity compact timeline under the engine activity chart.',
		view_engine_rpm_stats_table:
			'Shows Engine RPM Stats in Dashboard, Daily Report, and reporting content.',
		view_speed_stats_table: 'Shows Speed Stats in Dashboard, Daily Report, and reporting content.',
		view_travel_distance_table:
			'Shows Travel Distance summary in Dashboard, Daily Report, and reporting content.',
		view_fuel_consumption_table:
			'Shows Fuel Consumption section/table in Dashboard, Daily Report, and reports.',
		view_rpm_vs_fuel_chart: 'Shows RPM vs Fuel chart in Daily Report and report output.',
		view_rpm_ranges_runtime_fuel_table:
			'Shows RPM Range Runtime & Fuel table in Daily and Periodical Reports.',
		view_liter_per_nautical_mile_table:
			'Shows Liter per Nautical Mile metric/table in Daily Report.',
		view_high_rpm_outside_safety_zone_table:
			'Shows High RPM Outside Safety Zone table in Daily Report.',
		view_high_rpm_low_speed_table: 'Shows High RPM Low Speed table in Daily Report.',

		view_fuel_fod: 'Shows FOD fuel fields in Dashboard, Daily Report, Data Log, and exports.',
		view_fuel_ecu: 'Shows ECU fuel fields in Dashboard, Daily Report, Data Log, and exports.',
		view_fuel_fms: 'Shows FMS fuel fields in Dashboard, Daily Report, Data Log, and exports.',
		view_fuel_ems_internal:
			'Shows VMS fuel fields in Dashboard, Daily Report, Data Log, and exports.',
		view_fuel_ems_external:
			'Shows EMS fuel fields in Dashboard, Daily Report, Data Log, and exports.',
		view_fuel_engine_maker:
			'Shows Engine Maker fuel fields in Dashboard, Daily Report, Data Log, and exports.',

		manage_data_log_override:
			'Enables Data Log Override: download template, import Excel override, and delete override imports.',
		manage_fuel_rob: 'Enables ROB editing in Fuel Management fuel operation.',
		manage_fuel_transactions:
			'Enables fuel transaction add/edit/delete actions in Fuel Management.',
		import_fuel_vdor: 'Enables VDOR Excel template/download/import actions in Fuel Management.',
		manage_voyage_plan_fleet:
			'Enables create/edit/delete/import actions for Voyage Plan Fleet when the plan is editable.',
		assign_voyage_plan_fleet: 'Enables assigning voyage plans to allowed vessels.',
		manage_cctv_config: 'Enables CCTV Config tab actions in Administrator page.'
	};

	let autoReportForm = {
		isEnabled: false,
		sendTime: '08:00',
		periodicalStartDate: new Date().toISOString().slice(0, 10),
		periodicalIntervalDays: 7,
		timezoneMode: 'auto',
		timezoneOffset: '+07:00',
		reportSections: [],
		picEmails: [],
		ccEmails: [],
		bccEmails: []
	};

	let manualReportDate = new Date().toISOString().slice(0, 10);
	let manualPeriodicalStart = `${new Date().toISOString().slice(0, 10)}T00:00`;
	let manualPeriodicalEnd = `${new Date().toISOString().slice(0, 10)}T23:59`;
	let manualPeriodicalFormat = 'excel';

	let engineHealthForm = {
		isEnabled: false,
		oilPressureMin: '',
		oilPressureMax: '',
		oilTemperatureMax: '',
		coolantTemperatureMin: '',
		coolantTemperatureMax: ''
	};

	let telegramGroups = [];
	let telegramGroupsPagination = null;
	let telegramGroupsLoading = false;
	let telegramSaving = false;
	let telegramActionLoadingId = null;
	let selectedTelegramGroup = null;
	let telegramMode = 'create';

	let telegramForm = {
		name: '',
		chatId: '',
		isActive: true,
		vesselIds: [],
		alarmKeys: []
	};
	let telegramVesselSearch = '';

	let autoReportAuditLogs = [];
	let autoReportAuditLoading = false;

	const alarmKeyOptions = [
		'DEVICE_OFFLINE',
		'PANEL_OPEN',
		'LOW_SPEED_HIGH_RPM',
		'LOW_SPEED_OUTSIDE_BOUNDARY',
		'ENGINE_HEALTH'
	];

	function parseTextList(value) {
		return String(value || '')
			.split(/[\n,;]+/)
			.map((item) => item.trim())
			.filter(Boolean);
	}

	function normalizeEmailList(value) {
		const list = Array.isArray(value) ? value : parseTextList(value);
		const seen = new Set();

		return list
			.map((item) => String(item || '').trim())
			.filter(Boolean)
			.filter((email) => {
				const key = email.toLowerCase();

				if (seen.has(key)) return false;

				seen.add(key);
				return true;
			});
	}

	function getVesselDisplayName(vessel) {
		return (
			vessel?.vessel_name || vessel?.vesselName || vessel?.name || `Vessel ${vessel?.id || '-'}`
		);
	}

	function getVesselDeviceLabel(vessel) {
		return (
			vessel?.deviceId || vessel?.device_id || vessel?.deviceName || vessel?.thingsboardName || '-'
		);
	}

	function getVesselHireStatus(vessel) {
		const value =
			vessel?.hireStatus ?? vessel?.hire_status ?? vessel?.onHire ?? vessel?.on_hire ?? false;

		if (typeof value === 'string') {
			const normalized = value.trim().toLowerCase();
			return ['true', '1', 'on', 'on hire', 'on_hire', 'active'].includes(normalized);
		}

		return Boolean(value);
	}

	function getVesselHireLabel(vesselOrValue) {
		const isOnHire =
			typeof vesselOrValue === 'string'
				? vesselOrValue === 'true'
				: getVesselHireStatus(vesselOrValue);

		return isOnHire ? 'On Hire' : 'Off Hire';
	}

	function getFuelConsumptionSourceValue(vesselOrValue) {
		const raw =
			typeof vesselOrValue === 'string'
				? vesselOrValue
				: (vesselOrValue?.fuelConsumptionSource ??
					vesselOrValue?.fuel_consumption_source ??
					vesselOrValue?.fuelConsSource ??
					vesselOrValue?.fuel_cons_source ??
					'fm');
		const normalized = String(raw || 'fm')
			.trim()
			.toLowerCase();
		const allowedValues = new Set(FUEL_CONSUMPTION_SOURCE_OPTIONS.map((option) => option.value));

		return allowedValues.has(normalized) ? normalized : 'fm';
	}

	function getFuelConsumptionSourceLabel(vesselOrValue) {
		const value = getFuelConsumptionSourceValue(vesselOrValue);
		return (
			FUEL_CONSUMPTION_SOURCE_OPTIONS.find((option) => option.value === value)?.label ||
			value.toUpperCase()
		);
	}

	function getCompanyDisplayName(company) {
		return company?.name || company?.companyName || `Company ${company?.id || '-'}`;
	}

	function getCompanyThingsboardId(company) {
		return (
			company?.companyIdThingsboard ||
			company?.company_id_thingsboard ||
			company?.thingsboardId ||
			company?.customerIdThingsboard ||
			'-'
		);
	}

	function getCompanyById(companyId) {
		const id = Number(companyId);

		if (!Number.isFinite(id) || id <= 0) return null;

		return companies.find((company) => Number(company?.id) === id) || null;
	}

	function getVesselCompanyLabel(vessel) {
		const companyId = vessel?.companyId ?? vessel?.company_id;
		const company = vessel?.company || getCompanyById(companyId);

		if (company) return `${getCompanyDisplayName(company)}`;

		return 'No Company';
	}

	function getVesselCompanyId(vessel) {
		const id = Number(vessel?.companyId ?? vessel?.company_id ?? vessel?.company?.id);

		return Number.isFinite(id) && id > 0 ? id : null;
	}

	function isVesselCompanySelected(companyId) {
		const id = Number(companyId);

		return selectedVesselCompanyIds.includes(id);
	}

	function toggleVesselCompanyFilter(companyId) {
		const id = Number(companyId);

		if (!Number.isFinite(id) || id <= 0) return;

		if (isVesselCompanySelected(id)) {
			selectedVesselCompanyIds = selectedVesselCompanyIds.filter((item) => item !== id);
			return;
		}

		selectedVesselCompanyIds = [...selectedVesselCompanyIds, id];
	}

	function selectAllVesselCompanies() {
		selectedVesselCompanyIds = vesselCompanyFilterOptions.map((company) => Number(company.id));
	}

	function clearVesselCompanyFilters() {
		selectedVesselCompanyIds = [];
	}

	function getVesselCompanyFilterLabel() {
		const count = selectedVesselCompanyIds.length;

		if (!count) return 'All Companies';
		if (count === 1) {
			const company = getCompanyById(selectedVesselCompanyIds[0]);
			return getCompanyDisplayName(company || { id: selectedVesselCompanyIds[0] });
		}

		return `${count} Companies`;
	}

	function getAutoReportConfig(vessel) {
		return (
			vessel?.auto_report ||
			vessel?.autoReport ||
			vessel?.autoReportConfig ||
			vessel?.auto_report_config ||
			{}
		);
	}

	function isAutoReportEnabled(vessel) {
		const config = getAutoReportConfig(vessel);

		return Boolean(config.is_enabled ?? config.isEnabled);
	}

	function getAutoReportContentConfig(autoReport = {}) {
		return (
			autoReport?.report_content ||
			autoReport?.reportContent ||
			autoReport?.report_content_config ||
			autoReport?.reportContentConfig ||
			{}
		);
	}

	function normalizeReportSections(value = {}) {
		const content = getAutoReportContentConfig(value);
		const sections =
			content?.sections || content?.permissions || value?.sections || value?.reportSections || [];

		return [...new Set((Array.isArray(sections) ? sections : []).map(String).filter(Boolean))];
	}

	function formatReportContentLabel(value) {
		return String(value || '')
			.replace(/\bEMS\s+(Internal|Int)\b/gi, 'VMS')
			.replace(/\b(Internal|Int)\s+EMS\b/gi, 'VMS')
			.replace(/\bEMS\s+(External|Ext)\b/gi, 'EMS')
			.replace(/\b(External|Ext)\s+EMS\b/gi, 'EMS')
			.replace(/\s+/g, ' ')
			.trim();
	}

	function getEngineHealthConfig(vessel) {
		return vessel?.engine_health || vessel?.engineHealth || vessel?.engineHealthConfig || {};
	}

	function isEngineHealthEnabled(vessel) {
		const config = getEngineHealthConfig(vessel);

		return Boolean(config.is_enabled ?? config.isEnabled);
	}

	function getRecipientField(role) {
		return {
			pic: 'picEmails',
			cc: 'ccEmails',
			bcc: 'bccEmails'
		}[role];
	}

	function hasAutoReportRecipient(email, role) {
		const field = getRecipientField(role);
		const target = String(email || '')
			.trim()
			.toLowerCase();

		if (!field || !target) return false;

		return (autoReportForm[field] || []).some(
			(item) =>
				String(item || '')
					.trim()
					.toLowerCase() === target
		);
	}

	function toggleAutoReportRecipient(email, role, checked) {
		const field = getRecipientField(role);
		const cleanEmail = String(email || '').trim();

		if (!field || !cleanEmail) return;

		const current = normalizeEmailList(autoReportForm[field]);
		const next = checked
			? normalizeEmailList([...current, cleanEmail])
			: current.filter((item) => item.toLowerCase() !== cleanEmail.toLowerCase());

		autoReportForm = {
			...autoReportForm,
			[field]: next
		};
	}

	function removeAutoReportRecipient(role, email) {
		toggleAutoReportRecipient(email, role, false);
	}

	function isValidEmail(value) {
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
	}

	function addManualAutoReportRecipients() {
		const field = getRecipientField(manualRecipientRole);
		const emails = normalizeEmailList(String(manualRecipientEmail || '').split(/[\s,;]+/));

		if (!field) {
			showAlert('error', 'Recipient role is not valid.');
			return;
		}

		if (emails.length === 0) {
			showAlert('error', 'Please enter at least one email address.');
			return;
		}

		const invalidEmails = emails.filter((email) => !isValidEmail(email));

		if (invalidEmails.length > 0) {
			showAlert(
				'error',
				`Invalid email: ${invalidEmails.slice(0, 3).join(', ')}${invalidEmails.length > 3 ? '...' : ''}`
			);
			return;
		}

		autoReportForm = {
			...autoReportForm,
			[field]: normalizeEmailList([...(autoReportForm[field] || []), ...emails])
		};
		manualRecipientEmail = '';
	}

	function getAssignableUserName(user) {
		return user?.fullName || user?.name || user?.username || user?.email || 'Unnamed User';
	}

	function normalizeIds(value) {
		const source = Array.isArray(value) ? value : parseTextList(value);
		const seen = new Set();

		return source
			.map((item) => Number(item))
			.filter((item) => Number.isFinite(item) && item > 0)
			.filter((item) => {
				if (seen.has(item)) return false;

				seen.add(item);
				return true;
			});
	}

	function getTelegramRuleVesselIds(group) {
		const rules = group?.rules || {};

		return normalizeIds(
			rules.vesselIds ||
				rules.vessel_ids ||
				rules.vesselId ||
				rules.vessel_id ||
				group?.vesselIds ||
				group?.vessel_ids ||
				[]
		);
	}

	function hasTelegramVessel(vesselId, selectedVesselIds = telegramForm.vesselIds) {
		const target = Number(vesselId);

		return normalizeIds(selectedVesselIds).includes(target);
	}

	function toggleTelegramVessel(vesselId, checked) {
		const id = Number(vesselId);

		if (!Number.isFinite(id) || id <= 0) return;

		const current = normalizeIds(telegramForm.vesselIds);
		const next = checked ? normalizeIds([...current, id]) : current.filter((item) => item !== id);

		telegramForm = {
			...telegramForm,
			vesselIds: next
		};
	}

	function getTelegramVesselName(vesselId) {
		const id = Number(vesselId);
		const source = [...vessels, ...reportingVessels];
		const vessel = source.find((item) => Number(item?.id) === id);

		return getVesselDisplayName(vessel || { id });
	}

	$: telegramVesselOptions = sortByAlpha(
		(vessels.length ? vessels : reportingVessels)
			.map((vessel) => ({
				id: Number(vessel?.id),
				label: getVesselDisplayName(vessel),
				sublabel: getVesselDeviceLabel(vessel),
				status: vessel?.status || ''
			}))
			.filter((vessel) => Number.isFinite(vessel.id) && vessel.id > 0),
		(vessel) => vessel.label,
		(vessel) => vessel.sublabel
	);

	$: filteredTelegramVesselOptions = telegramVesselOptions.filter((vessel) => {
		const keyword = telegramVesselSearch.trim().toLowerCase();

		if (!keyword) return true;

		return matchesSearch(keyword, [vessel.label, vessel.status]);
	});

	$: filteredReportingAssignableUsers = reportingAssignableUsers.filter((user) => {
		const keyword = reportingAssignableSearch.trim().toLowerCase();

		if (!keyword) return true;

		return matchesSearch(keyword, [user?.fullName, user?.name, user?.username, user?.email]);
	});

	$: filteredReportingVessels = sortByAlpha(
		reportingVessels.filter((vessel) => {
			const keyword = String(reportingFilters.search || '')
				.trim()
				.toLowerCase();
			if (!keyword) return true;

			const company = getCompanyById(vessel?.companyId ?? vessel?.company_id);

			return matchesSearch(keyword, [
				vessel?.vesselName,
				vessel?.vessel_name,
				vessel?.name,
				vessel?.companyName,
				vessel?.company_name,
				company?.name,
				company?.companyName,
				vessel?.status
			]);
		}),
		getVesselDisplayName,
		(vessel) => vessel?.companyName || vessel?.company_name || getVesselCompanyLabel(vessel)
	);

	function nullableNumber(value) {
		const text = String(value ?? '').trim();

		if (!text) return null;

		const number = Number(text);

		return Number.isFinite(number) ? number : null;
	}

	async function loadReportingVessels() {
		reportingVesselsLoading = true;

		try {
			reportingVessels = sortByAlpha(
				reportingMode === 'periodical'
					? await getPeriodicalReportingVesselsAdminApi({ ...reportingFilters, search: '' })
					: await getReportingVesselsAdminApi({ ...reportingFilters, search: '' }),
				getVesselDisplayName,
				getVesselDeviceLabel
			);

			if (selectedReportingVessel?.id) {
				const refreshed = reportingVessels.find(
					(vessel) => Number(vessel.id) === Number(selectedReportingVessel.id)
				);

				if (refreshed) {
					openReportingVessel(refreshed, false, false);
				}
			}
		} finally {
			reportingVesselsLoading = false;
		}
	}

	function setReportingMode(mode) {
		if (!['daily', 'periodical'].includes(mode) || reportingMode === mode) return;

		reportingMode = mode;
		selectedReportingVessel = null;
		reportingAssignableUsers = [];
		reportingAssignableSearch = '';
		clearAlert();
		loadReportingVessels();
	}

	function getAutoReportTimezoneLabel() {
		return getAutoTimezoneLabelFromSources(selectedReportingVessel);
	}

	async function loadReportingAssignableUsers(vesselId, page = 1) {
		if (!vesselId) return;

		reportingAssignableUsersLoading = true;

		try {
			const response = await getReportingAssignableUsersAdminApi(vesselId, {
				page,
				pageSize: reportingAssignablePagination.pageSize || 20
			});
			const data = response?.users
				? response
				: response?.data?.users
					? response.data
					: unwrapApiData(response);

			reportingAssignableUsers = Array.isArray(data?.users) ? data.users : [];
			reportingAssignablePagination = data?.pagination || {
				page,
				pageSize: reportingAssignablePagination.pageSize || 20,
				totalItems: reportingAssignableUsers.length,
				totalPages: 1
			};
		} catch (error) {
			reportingAssignableUsers = [];
			showAlert('error', error.message || 'Failed to load assignable users for this vessel.');
		} finally {
			reportingAssignableUsersLoading = false;
		}
	}

	function goToAssignableUserPage(page) {
		const targetPage = Number(page);
		const totalPages = Number(reportingAssignablePagination.totalPages || 1);

		if (!selectedReportingVessel?.id) return;
		if (!Number.isFinite(targetPage) || targetPage < 1 || targetPage > totalPages) return;

		loadReportingAssignableUsers(selectedReportingVessel.id, targetPage);
	}

	function loadAlarmVessels() {
		reportingFilters = {
			...reportingFilters,
			autoReport: 'all'
		};

		loadReportingVessels();
	}

	function openAlarmTab() {
		setActiveAdminTab('alarm');
		loadAlarmVessels();
	}

	function openCctvConfigTab() {
		setActiveAdminTab('cctv-config');

		if (!cctvSelectedVessel && vessels.length) {
			openCctvVessel(vessels[0]);
		}
	}

	function setActiveAdminTab(tabKey) {
		if (!tabKey || activeAdminTab === tabKey) {
			scheduleAdminTabIndicatorUpdate();
			return;
		}

		const currentIndex = adminTabOrder.indexOf(activeAdminTab);
		const nextIndex = adminTabOrder.indexOf(tabKey);
		adminTabDirection = nextIndex >= currentIndex ? 1 : -1;
		activeAdminTab = tabKey;
		scheduleAdminTabIndicatorUpdate();
	}

	function scheduleAdminTabIndicatorUpdate() {
		if (!adminTabsElement || typeof requestAnimationFrame === 'undefined') return;

		if (adminTabIndicatorFrame) {
			cancelAnimationFrame(adminTabIndicatorFrame);
		}

		adminTabIndicatorFrame = requestAnimationFrame(updateAdminTabIndicator);
	}

	async function updateAdminTabIndicator() {
		await tick();

		const activeButton = adminTabsElement?.querySelector('button.active-tab');

		if (!activeButton) {
			adminTabIndicatorStyle = 'width: 0px; transform: translateX(0px); opacity: 0;';
			return;
		}

		adminTabIndicatorStyle = `width: ${activeButton.offsetWidth}px; transform: translateX(${activeButton.offsetLeft}px); opacity: 1;`;
		activeButton.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
	}

	$: (activeAdminTab, adminTabsElement, scheduleAdminTabIndicatorUpdate());

	function openReportingVessel(vessel, shouldLoadAssignableUsers = true, shouldClearAlert = true) {
		selectedReportingVessel = vessel;
		reportingAssignableSearch = '';

		const autoReport = getAutoReportConfig(vessel);
		const recipients = autoReport?.recipients || {};
		const schedule = autoReport?.schedule || {};
		const engineHealth = getEngineHealthConfig(vessel);

		autoReportForm = {
			isEnabled: Boolean(autoReport.is_enabled ?? autoReport.isEnabled),
			sendTime: schedule.time || autoReport.send_time || autoReport.sendTime || '08:00',
			periodicalStartDate:
				schedule.start_date ||
				schedule.startDate ||
				autoReport.start_date ||
				autoReport.startDate ||
				new Date().toISOString().slice(0, 10),
			periodicalIntervalDays:
				schedule.interval_days ??
				schedule.intervalDays ??
				autoReport.interval_days ??
				autoReport.intervalDays ??
				7,
			timezoneMode:
				schedule.timezone_mode ||
				schedule.timezoneMode ||
				autoReport.timezone_mode ||
				autoReport.timezoneMode ||
				'auto',
			timezoneOffset:
				schedule.timezone_offset ||
				schedule.timezoneOffset ||
				autoReport.timezone_offset ||
				autoReport.timezoneOffset ||
				'+07:00',
			reportSections: normalizeReportSections(autoReport),
			picEmails: normalizeEmailList(recipients.pic),
			ccEmails: normalizeEmailList(recipients.cc),
			bccEmails: normalizeEmailList(recipients.bcc)
		};

		engineHealthForm = {
			isEnabled: Boolean(engineHealth.is_enabled ?? engineHealth.isEnabled),
			oilPressureMin: engineHealth.oil_pressure_min ?? engineHealth.oilPressureMin ?? '',
			oilPressureMax: engineHealth.oil_pressure_max ?? engineHealth.oilPressureMax ?? '',
			oilTemperatureMax: engineHealth.oil_temperature_max ?? engineHealth.oilTemperatureMax ?? '',
			coolantTemperatureMin:
				engineHealth.coolant_temperature_min ?? engineHealth.coolantTemperatureMin ?? '',
			coolantTemperatureMax:
				engineHealth.coolant_temperature_max ?? engineHealth.coolantTemperatureMax ?? ''
		};

		if (shouldClearAlert) {
			clearAlert();
		}

		if (shouldLoadAssignableUsers) {
			loadReportingAssignableUsers(vessel.id, 1);
		}
	}

	function buildAutoReportPayload() {
		const timezoneMode = autoReportForm.timezoneMode || 'auto';
		const payload = {
			isEnabled: Boolean(autoReportForm.isEnabled),
			sendTime: autoReportForm.sendTime || '08:00',
			recipients: {
				pic: normalizeEmailList(autoReportForm.picEmails),
				cc: normalizeEmailList(autoReportForm.ccEmails),
				bcc: normalizeEmailList(autoReportForm.bccEmails)
			},
			reportContent: {
				sections: [...new Set((autoReportForm.reportSections || []).map(String).filter(Boolean))]
			},
			timezoneMode
		};

		if (timezoneMode === 'manual') {
			payload.timezoneOffset = autoReportForm.timezoneOffset || '+07:00';
		}

		return payload;
	}

	function buildPeriodicalAutoReportPayload() {
		const timezoneMode = autoReportForm.timezoneMode || 'auto';
		const payload = {
			isEnabled: Boolean(autoReportForm.isEnabled),
			recipients: {
				pic: normalizeEmailList(autoReportForm.picEmails),
				cc: normalizeEmailList(autoReportForm.ccEmails),
				bcc: normalizeEmailList(autoReportForm.bccEmails)
			},
			schedule: {
				startDate: autoReportForm.periodicalStartDate,
				intervalDays: Number(autoReportForm.periodicalIntervalDays || 0),
				time: autoReportForm.sendTime || '08:00',
				timezoneMode
			}
		};

		if (timezoneMode === 'manual') {
			payload.schedule.timezoneOffset = autoReportForm.timezoneOffset || '+07:00';
		}

		return payload;
	}

	function validateAutoReportPayload(payload) {
		if (!/^\d{2}:\d{2}$/.test(payload.sendTime || '')) {
			return 'Send time format must be HH:mm, for example 08:00.';
		}

		if (!['auto', 'manual'].includes(payload.timezoneMode)) {
			return 'Timezone mode must be auto or manual.';
		}

		if (
			payload.timezoneMode === 'manual' &&
			!/^[+-](0\d|1[0-4]):[0-5]\d$/.test(payload.timezoneOffset || '')
		) {
			return 'Timezone offset must use the format +07:00, -03:00, up to +14:00.';
		}

		if (payload.isEnabled && payload.recipients.pic.length === 0) {
			return 'At least 1 PIC recipient is required when auto-report is enabled.';
		}

		return null;
	}

	function validatePeriodicalAutoReportPayload(payload) {
		if (!payload.schedule.startDate) {
			return 'Periodical report start date is required.';
		}

		if (!Number.isInteger(payload.schedule.intervalDays) || payload.schedule.intervalDays < 1) {
			return 'Interval days must be at least 1 day.';
		}

		if (!/^\d{2}:\d{2}$/.test(payload.schedule.time || '')) {
			return 'Schedule time format must be HH:mm, for example 08:00.';
		}

		if (!['auto', 'manual'].includes(payload.schedule.timezoneMode)) {
			return 'Timezone mode must be auto or manual.';
		}

		if (
			payload.schedule.timezoneMode === 'manual' &&
			!/^[+-](0\d|1[0-4]):[0-5]\d$/.test(payload.schedule.timezoneOffset || '')
		) {
			return 'Timezone offset must use the format +07:00, -03:00, up to +14:00.';
		}

		if (payload.isEnabled && payload.recipients.pic.length === 0) {
			return 'At least 1 PIC recipient is required when periodical auto-report is enabled.';
		}

		return null;
	}

	async function saveAutoReportConfig() {
		if (!selectedReportingVessel?.id) {
			showAlert('error', 'Please select a vessel first.');
			return;
		}

		const isPeriodicalMode = reportingMode === 'periodical';
		const payload = isPeriodicalMode
			? buildPeriodicalAutoReportPayload()
			: buildAutoReportPayload();
		const errorMessage = isPeriodicalMode
			? validatePeriodicalAutoReportPayload(payload)
			: validateAutoReportPayload(payload);

		if (errorMessage) {
			showAlert('error', errorMessage);
			return;
		}

		reportingSaving = true;
		clearAlert();

		try {
			const response = isPeriodicalMode
				? await savePeriodicalAutoReportConfigAdminApi(selectedReportingVessel.id, payload)
				: await saveAutoReportConfigAdminApi(selectedReportingVessel.id, payload);
			const savedConfig = unwrapApiData(response);

			showAlert(
				'success',
				isPeriodicalMode
					? 'Periodical auto-report configuration saved successfully.'
					: 'Auto-report configuration saved successfully.'
			);

			selectedReportingVessel = {
				...selectedReportingVessel,
				auto_report: {
					...(selectedReportingVessel.auto_report || {}),
					...savedConfig,
					is_enabled: savedConfig?.isEnabled ?? payload.isEnabled,
					send_time: isPeriodicalMode
						? (savedConfig?.schedule?.time ?? payload.schedule?.time)
						: (savedConfig?.sendTime ?? payload.sendTime),
					timezone_mode: isPeriodicalMode
						? (savedConfig?.schedule?.timezoneMode ?? payload.schedule?.timezoneMode)
						: (savedConfig?.timezoneMode ?? payload.timezoneMode),
					timezone_offset: isPeriodicalMode
						? (savedConfig?.schedule?.timezoneOffset ??
							payload.schedule?.timezoneOffset ??
							autoReportForm.timezoneOffset)
						: (savedConfig?.timezoneOffset ??
							payload.timezoneOffset ??
							autoReportForm.timezoneOffset),
					recipients: savedConfig?.recipients ?? payload.recipients,
					report_content:
						savedConfig?.report_content ?? savedConfig?.reportContent ?? payload.reportContent,
					schedule: isPeriodicalMode
						? (savedConfig?.schedule ?? payload.schedule)
						: savedConfig?.schedule
				}
			};

			await loadReportingVessels();
		} catch (error) {
			showAlert('error', error.message || 'Failed to save auto-report configuration.');
		} finally {
			reportingSaving = false;
		}
	}

	function buildEngineHealthPayload() {
		return {
			isEnabled: Boolean(engineHealthForm.isEnabled),
			oilPressureMin: nullableNumber(engineHealthForm.oilPressureMin),
			oilPressureMax: nullableNumber(engineHealthForm.oilPressureMax),
			oilTemperatureMax: nullableNumber(engineHealthForm.oilTemperatureMax),
			coolantTemperatureMin: nullableNumber(engineHealthForm.coolantTemperatureMin),
			coolantTemperatureMax: nullableNumber(engineHealthForm.coolantTemperatureMax)
		};
	}

	async function saveEngineHealthConfig() {
		if (!selectedReportingVessel?.id) {
			showAlert('error', 'Please select a vessel first.');
			return;
		}

		reportingSaving = true;
		clearAlert();

		try {
			await saveEngineHealthConfigAdminApi(selectedReportingVessel.id, buildEngineHealthPayload());

			showAlert('success', 'Engine health configuration saved successfully.');
			await loadReportingVessels();
		} catch (error) {
			showAlert('error', error.message || 'Failed to save engine health configuration.');
		} finally {
			reportingSaving = false;
		}
	}

	async function downloadManualDailyReport() {
		if (!selectedReportingVessel?.id) {
			showAlert('error', 'Please select a vessel first.');
			return;
		}

		if (!manualReportDate) {
			showAlert('error', 'Report date is required.');
			return;
		}

		reportingActionLoadingId = `download-${selectedReportingVessel.id}`;
		clearAlert();

		try {
			await downloadReportingDailyReportAdminApi(selectedReportingVessel.id, {
				date: manualReportDate,
				timezoneMode: autoReportForm.timezoneMode,
				timezoneOffset: autoReportForm.timezoneOffset
			});

			showAlert('success', 'Daily report downloaded successfully.');
		} catch (error) {
			showAlert('error', error.message || 'Failed to download daily report.');
		} finally {
			reportingActionLoadingId = null;
		}
	}

	async function sendManualDailyReportEmail() {
		if (!selectedReportingVessel?.id) {
			showAlert('error', 'Please select a vessel first.');
			return;
		}

		reportingActionLoadingId = `send-${selectedReportingVessel.id}`;
		clearAlert();

		try {
			await sendReportingDailyReportEmailAdminApi(selectedReportingVessel.id, {
				date: manualReportDate || undefined
			});

			showAlert('success', 'Daily report sent by email successfully.');
		} catch (error) {
			showAlert('error', error.message || 'Failed to send daily report email.');
		} finally {
			reportingActionLoadingId = null;
		}
	}

	function toApiDateTime(value) {
		if (!value) return '';

		const text = String(value).trim();
		if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return text;
		if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) {
			return `${text.replace('T', ' ')}:00`;
		}
		if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(text)) {
			return text.replace('T', ' ');
		}

		return text;
	}

	function getManualPeriodicalPayload() {
		return {
			start: toApiDateTime(manualPeriodicalStart),
			end: toApiDateTime(manualPeriodicalEnd),
			timezoneMode: autoReportForm.timezoneMode || 'auto',
			timezoneOffset: autoReportForm.timezoneOffset || '+07:00'
		};
	}

	function validateManualPeriodicalPayload(payload) {
		if (!payload.start || !payload.end) {
			return 'Start and end range are required.';
		}

		if (
			new Date(payload.start.replace(' ', 'T')).getTime() >
			new Date(payload.end.replace(' ', 'T')).getTime()
		) {
			return 'Start range must be earlier than end range.';
		}

		return null;
	}

	async function downloadManualPeriodicalReport() {
		if (!selectedReportingVessel?.id) {
			showAlert('error', 'Please select a vessel first.');
			return;
		}

		const payload = getManualPeriodicalPayload();
		const errorMessage = validateManualPeriodicalPayload(payload);

		if (errorMessage) {
			showAlert('error', errorMessage);
			return;
		}

		reportingActionLoadingId = `periodical-download-${selectedReportingVessel.id}`;
		clearAlert();

		try {
			await downloadReportingPeriodicalReportAdminApi(selectedReportingVessel.id, {
				...payload,
				format: manualPeriodicalFormat
			});

			showAlert('success', 'Periodical report downloaded successfully.');
		} catch (error) {
			showAlert('error', error.message || 'Failed to download periodical report.');
		} finally {
			reportingActionLoadingId = null;
		}
	}

	async function sendManualPeriodicalReportEmail() {
		if (!selectedReportingVessel?.id) {
			showAlert('error', 'Please select a vessel first.');
			return;
		}

		const payload = getManualPeriodicalPayload();
		const errorMessage = validateManualPeriodicalPayload(payload);

		if (errorMessage) {
			showAlert('error', errorMessage);
			return;
		}

		reportingActionLoadingId = `periodical-send-${selectedReportingVessel.id}`;
		clearAlert();

		try {
			await sendReportingPeriodicalReportEmailAdminApi(selectedReportingVessel.id, payload);
			showAlert('success', 'Periodical report sent by email successfully.');
		} catch (error) {
			showAlert('error', error.message || 'Failed to send periodical report email.');
		} finally {
			reportingActionLoadingId = null;
		}
	}

	async function loadTelegramGroups() {
		telegramGroupsLoading = true;

		try {
			const data = await getTelegramGroupsAdminApi({ page: 1, pageSize: 50 });

			telegramGroups = data?.items || [];
			telegramGroupsPagination = data?.pagination || null;
		} finally {
			telegramGroupsLoading = false;
		}
	}

	function openCreateTelegramGroupForm() {
		telegramMode = 'create';
		selectedTelegramGroup = null;

		telegramForm = {
			name: '',
			chatId: '',
			isActive: true,
			vesselIds: [],
			alarmKeys: []
		};
		telegramVesselSearch = '';

		clearAlert();
	}

	async function openEditTelegramGroupForm(group) {
		if (!group?.id) return;

		clearAlert();

		try {
			const detail = await getTelegramGroupDetailAdminApi(group.id);

			selectedTelegramGroup = detail;
			telegramMode = 'edit';

			telegramForm = {
				name: detail?.name || '',
				chatId: detail?.chatId || '',
				isActive: Boolean(detail?.isActive),
				vesselIds: getTelegramRuleVesselIds(detail),
				alarmKeys: detail?.rules?.alarmKeys || []
			};
			telegramVesselSearch = '';
		} catch (error) {
			showAlert('error', error.message || 'Failed to load Telegram group details.');
		}
	}

	function toggleTelegramAlarmKey(key) {
		const current = new Set(telegramForm.alarmKeys);

		if (current.has(key)) current.delete(key);
		else current.add(key);

		telegramForm = {
			...telegramForm,
			alarmKeys: [...current]
		};
	}

	function buildTelegramPayload() {
		return {
			name: telegramForm.name.trim(),
			chatId: telegramForm.chatId.trim(),
			isActive: Boolean(telegramForm.isActive),
			rules: {
				vesselId: normalizeIds(telegramForm.vesselIds),
				alarmKeys: telegramForm.alarmKeys
			}
		};
	}

	function validateTelegramForm() {
		if (!telegramForm.name.trim()) return 'Telegram group name is required.';
		if (!telegramForm.chatId.trim()) return 'Chat ID is required.';
		if (normalizeIds(telegramForm.vesselIds).length === 0) {
			return 'At least 1 vessel must be selected.';
		}
		if (telegramForm.alarmKeys.length === 0) {
			return 'At least 1 alarm key must be selected.';
		}

		return null;
	}

	async function saveTelegramGroup() {
		const errorMessage = validateTelegramForm();

		if (errorMessage) {
			showAlert('error', errorMessage);
			return;
		}

		telegramSaving = true;
		clearAlert();

		try {
			const payload = buildTelegramPayload();

			if (telegramMode === 'create') {
				const created = await createTelegramGroupAdminApi(payload);

				showAlert('success', 'Telegram group created successfully.');
				await loadTelegramGroups();
				await openEditTelegramGroupForm(created);
			} else if (selectedTelegramGroup?.id) {
				const updated = await updateTelegramGroupAdminApi(selectedTelegramGroup.id, payload);

				showAlert('success', 'Telegram group updated successfully.');
				await loadTelegramGroups();
				await openEditTelegramGroupForm(updated);
			}

			await loadReportingVessels();
		} catch (error) {
			showAlert('error', error.message || 'Failed to save Telegram group.');
		} finally {
			telegramSaving = false;
		}
	}

	async function deleteTelegramGroup(group) {
		if (!group?.id) return;

		const confirmed = window.confirm(`Delete Telegram group "${group.name}"?`);

		if (!confirmed) return;

		telegramActionLoadingId = group.id;
		clearAlert();

		try {
			await deleteTelegramGroupAdminApi(group.id);

			showAlert('success', 'Telegram group deleted successfully.');

			if (selectedTelegramGroup?.id === group.id) {
				openCreateTelegramGroupForm();
			}

			await loadTelegramGroups();
			await loadReportingVessels();
		} catch (error) {
			showAlert('error', error.message || 'Failed to delete Telegram group.');
		} finally {
			telegramActionLoadingId = null;
		}
	}

	async function loadAutoReportAuditLogs() {
		autoReportAuditLoading = true;

		try {
			autoReportAuditLogs = await getAutoReportAuditLogsAdminApi();
		} finally {
			autoReportAuditLoading = false;
		}
	}

	async function exportAutoReportAuditCsv() {
		clearAlert();

		try {
			await exportAutoReportAuditLogsCsvAdminApi();
			showAlert('success', 'Audit log CSV downloaded successfully.');
		} catch (error) {
			showAlert('error', error.message || 'Failed to export audit log CSV.');
		}
	}

	function getTodayDate() {
		const now = new Date();
		return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
	}

	function createEmptyEngineCurveForm() {
		return {
			vesselId: '',
			curveType: 'engine_maker',
			curveName: '',
			file: null,
			fileName: '',
			activateAfterImport: false,
			validFrom: getTodayDate()
		};
	}

	let engineCurveForm = createEmptyEngineCurveForm();

	function fileToBase64(file) {
		return new Promise((resolve, reject) => {
			if (!file) {
				reject(new Error('Excel file was not found.'));
				return;
			}

			const reader = new FileReader();

			reader.onload = () => {
				const result = String(reader.result || '');

				const base64 = result.includes(',') ? result.split(',').pop() : result;

				resolve(base64);
			};

			reader.onerror = () => {
				reject(new Error('Failed to read Excel file.'));
			};

			reader.readAsDataURL(file);
		});
	}

	function handleEngineCurveFileChange(event) {
		const file = event.currentTarget.files?.[0] || null;

		if (!file) {
			engineCurveForm = {
				...engineCurveForm,
				file: null,
				fileName: ''
			};
			return;
		}

		const allowedExtensions = ['.xlsx', '.xls'];
		const lowerName = file.name.toLowerCase();
		const isExcel = allowedExtensions.some((ext) => lowerName.endsWith(ext));

		if (!isExcel) {
			showAlert('error', 'The file must be an Excel file in .xlsx or .xls format.');

			event.currentTarget.value = '';

			engineCurveForm = {
				...engineCurveForm,
				file: null,
				fileName: ''
			};

			return;
		}

		engineCurveForm = {
			...engineCurveForm,
			file,
			fileName: file.name
		};
	}

	$: filteredEngineCurves = engineCurves.filter((curve) => {
		const keyword = searchEngineCurve.trim().toLowerCase();

		if (!keyword) return true;

		return [curve?.vessel_name, curve?.curve_type, curve?.curve_name]
			.filter(Boolean)
			.some((value) => String(value).toLowerCase().includes(keyword));
	});

	$: filteredEngineCurveImportVessels = sortByAlpha(vessels, getVesselDisplayName, (vessel) => {
		const company = getCompanyById(vessel?.companyId ?? vessel?.company_id);
		return getCompanyDisplayName(company);
	}).filter((vessel) => {
		const keyword = searchEngineCurveImportVessel.trim().toLowerCase();
		const selectedId = String(engineCurveForm.vesselId || '');
		const vesselId = String(vessel?.id || '');

		if (selectedId && vesselId === selectedId) return true;
		if (!keyword) return true;

		const company = getCompanyById(vessel?.companyId ?? vessel?.company_id);

		return matchesSearch(keyword, [
			vessel?.vesselName,
			vessel?.vessel_name,
			vessel?.name,
			company?.name,
			company?.companyName
		]);
	});

	$: selectedEngineCurveImportVessel =
		vessels.find((vessel) => Number(vessel?.id) === Number(engineCurveForm.vesselId)) || null;

	function selectEngineCurveImportVessel(vessel) {
		engineCurveForm = {
			...engineCurveForm,
			vesselId: vessel?.id || ''
		};
		engineCurveImportVesselDropdownOpen = false;
	}

	function getCurveId(curve) {
		return curve?.curve_id || curve?.curveId || curve?.id || '';
	}

	function getCurveDate(value) {
		// Validity is a calendar date: do not shift it to the browser's timezone.
		const dateOnly = String(value ?? '')
			.trim()
			.match(/^\d{4}-\d{2}-\d{2}(?=$|T)/)?.[0];
		if (!dateOnly || dateOnly < '0001-01-01') return '';
		const date = new Date(`${dateOnly}T00:00:00Z`);
		return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dateOnly
			? dateOnly
			: '';
	}

	async function loadEngineCurves() {
		engineCurvesLoading = true;

		try {
			engineCurves = await getAllEngineCurvesAdminApi();
		} finally {
			engineCurvesLoading = false;
		}
	}

	function createEmptyAssetForm() {
		return {
			assetId: '',
			assetName: '',
			assetType: ''
		};
	}

	let assetForm = createEmptyAssetForm();

	const assetTypeOptions = [
		'buoy',
		'whp',
		'jetty',
		'shipyard',
		'mess',
		'office',
		'fso',
		'anchor',
		'rig'
	];

	$: hasCustomAssetType =
		assetForm.assetType.trim() && !assetTypeOptions.includes(assetForm.assetType.trim());

	function getAssetType(asset) {
		return asset?.assetType ?? asset?.asset_type ?? asset?.type ?? '';
	}

	function formatAssetType(value) {
		const text = String(value || '').trim();
		if (!text) return 'Unspecified';

		return text
			.replace(/[_-]+/g, ' ')
			.replace(/\s+/g, ' ')
			.split(' ')
			.map((word) =>
				word.length <= 3 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)
			)
			.join(' ');
	}

	$: filteredAssets = sortByAlpha(
		assets,
		(asset) => asset?.assetName || asset?.thingsboardName || asset?.assetId,
		getAssetType
	).filter((asset) => {
		const keyword = searchAsset.trim().toLowerCase();

		if (!keyword) return true;

		return matchesSearch(keyword, [asset?.assetName, getAssetType(asset)]);
	});

	function createEmptyVesselForm() {
		return {
			deviceId: '',
			vesselName: '',
			companyId: '',
			fuelConsumptionSource: 'fm',
			features: []
		};
	}

	let vesselForm = createEmptyVesselForm();

	$: vesselCompanyFilterOptions = sortByAlpha(companies, getCompanyDisplayName);

	$: filteredVessels = sortByAlpha(vessels, getVesselDisplayName, (vessel) => {
		const company = vessel?.company || getCompanyById(vessel?.companyId ?? vessel?.company_id);
		return getCompanyDisplayName(company);
	}).filter((vessel) => {
		const keyword = searchVessel.trim().toLowerCase();
		const selectedCompanySet = new Set(selectedVesselCompanyIds.map(Number));
		const companyId = getVesselCompanyId(vessel);

		if (selectedCompanySet.size && !selectedCompanySet.has(companyId)) return false;

		if (!keyword) return true;

		const company = vessel?.company || getCompanyById(vessel?.companyId ?? vessel?.company_id);

		return matchesSearch(keyword, [
			vessel?.vesselName,
			vessel?.vessel_name,
			vessel?.name,
			getFuelConsumptionSourceLabel(vessel),
			getFuelConsumptionSourceValue(vessel),
			company?.name,
			company?.companyName,
			getVesselHireLabel(vessel)
		]);
	});

	$: filteredCctvVessels = sortByAlpha(vessels, getVesselDisplayName, (vessel) => {
		const company = getCompanyById(vessel?.companyId ?? vessel?.company_id);
		return getCompanyDisplayName(company);
	}).filter((vessel) => {
		const keyword = cctvSearchVessel.trim().toLowerCase();

		if (!keyword) return true;

		const company = getCompanyById(vessel?.companyId ?? vessel?.company_id);

		return matchesSearch(keyword, [
			vessel?.vesselName,
			vessel?.vessel_name,
			vessel?.name,
			company?.name,
			company?.companyName
		]);
	});

	$: if (
		activeAdminTab === 'cctv-config' &&
		!cctvSelectedVessel &&
		vessels.length &&
		!cctvConfigLoading
	) {
		openCctvVessel(vessels[0]);
	}

	$: filteredCompanies = companies.filter((company) => {
		const keyword = searchCompany.trim().toLowerCase();

		if (!keyword) return true;

		return matchesSearch(keyword, [company?.name, company?.companyName]);
	});

	let assetOptions = [];
	let vesselOptions = [];

	let selectedUser = null;
	let mode = 'create';

	let searchUser = '';
	let searchPermission = '';
	let searchUserAssetAccess = '';
	let searchUserVesselAccess = '';
	let activeModule = 'all';
	let alert = null;

	function createEmptyForm() {
		return {
			name: '',
			username: '',
			password: '',
			email: '',

			assetAccessMode: 'all',
			vesselAccessMode: 'all',
			permissionAccessMode: 'selected',

			assetIdsText: '',
			vesselIdsText: '',

			selectedAssetIds: [],
			selectedVesselIds: [],
			selectedPermissions: []
		};
	}

	let form = createEmptyForm();

	$: isSuperAdmin = currentUser?.permissionAccess?.mode === 'all';

	$: moduleGroups = Object.entries(modulePermissions || {}).map(([moduleKey, item]) => ({
		moduleKey,
		moduleLabel: item?.moduleLabel || prettify(moduleKey),
		permissions: Array.isArray(item?.permissions) ? item.permissions : []
	}));

	$: allPermissions = moduleGroups.flatMap((group) => group.permissions);

	$: reportContentPermissions = REPORT_CONTENT_PERMISSION_KEYS.map((key) => {
		const permission = allPermissions.find((item) => item?.key === key);

		if (permission) {
			return {
				...permission,
				label: formatReportContentLabel(
					permission.label || REPORT_CONTENT_FALLBACK_LABELS[key] || key
				),
				tableLabel: permission.tableLabel || 'Daily Report Content',
				moduleLabel: permission.moduleLabel || 'Reporting'
			};
		}

		return {
			key,
			label: REPORT_CONTENT_FALLBACK_LABELS[key] || prettify(key),
			description: 'Included in the vessel daily report output.',
			moduleLabel: 'Reporting',
			tableLabel: 'Daily Report Content',
			category: 'report_content'
		};
	});

	$: reportingContentKeyword = reportingContentSearch.trim().toLowerCase();

	$: visibleReportContentPermissions = reportContentPermissions.filter((permission) =>
		matchPermission(permission, reportingContentKeyword)
	);

	$: permissionModules = [
		{ moduleKey: 'all', moduleLabel: 'All Permissions' },
		...moduleGroups.map((group) => ({
			moduleKey: group.moduleKey,
			moduleLabel: group.moduleLabel
		}))
	];

	$: permissionSearchKeyword = searchPermission.trim().toLowerCase();

	$: visiblePermissionGroups = moduleGroups
		.filter((group) => activeModule === 'all' || group.moduleKey === activeModule)
		.map((group) => ({
			...group,
			permissions: group.permissions.filter((permission) =>
				matchPermission(permission, permissionSearchKeyword)
			)
		}))
		.filter((group) => group.permissions.length > 0);

	$: filteredUsers = users.filter((user) => {
		const keyword = searchUser.trim().toLowerCase();

		if (!keyword) return true;

		return matchesSearch(keyword, [user?.name, user?.username, user?.email]);
	});

	$: assetAccessKeyword = searchUserAssetAccess.trim().toLowerCase();
	$: vesselAccessKeyword = searchUserVesselAccess.trim().toLowerCase();
	$: assetCompanyGroups = groupAccessOptions(assetOptions, companies, assetAccessKeyword);
	$: vesselCompanyGroups = groupAccessOptions(vesselOptions, companies, vesselAccessKeyword);
	$: filteredAssetOptions = assetCompanyGroups.flatMap((group) => group.visibleOptions);
	$: filteredVesselOptions = vesselCompanyGroups.flatMap((group) => group.visibleOptions);

	$: activeUsers = users.filter((user) => !user.deletedAt).length;
	$: inactiveUsers = users.filter((user) => user.deletedAt).length;

	onMount(() => {
		initializePage();
		scheduleAdminTabIndicatorUpdate();

		if (typeof window === 'undefined') return;

		window.addEventListener('resize', scheduleAdminTabIndicatorUpdate);

		return () => {
			window.removeEventListener('resize', scheduleAdminTabIndicatorUpdate);

			if (adminTabIndicatorFrame) {
				cancelAnimationFrame(adminTabIndicatorFrame);
			}
		};
	});

	async function initializePage() {
		bootLoading = true;
		alert = null;

		const results = await Promise.allSettled([
			loadCurrentUser(),
			loadUsers(),
			loadPermissions(),
			loadVessels(),
			loadCompanies(),
			loadAssets(),
			loadEngineCurves(),
			loadReportingVessels(),
			loadTelegramGroups(),
			loadAutoReportAuditLogs(),
			loadGlobalAuditLogs()
		]);

		const failed = results.find((result) => result.status === 'rejected');

		if (failed) {
			showAlert('error', failed.reason?.message || 'Failed to load some administrator data.');
		}

		bootLoading = false;
		await tick();

		if (initialTab === 'alarm') {
			openAlarmTab();

			if (reportingVessels.length) {
				openReportingVessel(reportingVessels[0], false);
			}
		} else if (initialTab === 'cctv-config') {
			openCctvConfigTab();
		} else if (initialTab === 'reporting' && reportingVessels.length) {
			openReportingVessel(reportingVessels[0]);
		}

		scheduleAdminTabIndicatorUpdate();
	}

	async function loadCurrentUser() {
		try {
			const response = await getCurrentUserApi();
			const data = response?.data || response;

			currentUser = data;

			const assetDetails = data?.assetAccess?.details || [];
			const vesselDetails = data?.vesselAccess?.details || [];

			assetOptions = sortByAlpha(
				assetDetails.map((asset) => ({
					...getAccessCompanyFields(asset),
					id: Number(asset.id),
					label: asset.assetName || asset.thingsboardName || asset.assetId || `Asset ${asset.id}`,
					sublabel: [
						getAssetType(asset) ? formatAssetType(getAssetType(asset)) : '',
						asset.thingsboardName || asset.assetId || ''
					]
						.filter(Boolean)
						.join(' • '),
					searchValues: [asset.assetName, asset.asset_name, formatAssetType(getAssetType(asset))]
				})),
				(asset) => asset.label,
				(asset) => asset.sublabel
			);

			vesselOptions = sortByAlpha(
				vesselDetails.map((vessel) => ({
					...getAccessCompanyFields(vessel),
					id: Number(vessel.id),
					label: vessel.vesselName || vessel.deviceName || vessel.deviceId || `Vessel ${vessel.id}`,
					sublabel: vessel.deviceName || vessel.deviceId || '',
					searchValues: [vessel.vesselName, vessel.vessel_name, vessel.name]
				})),
				(vessel) => vessel.label,
				(vessel) => vessel.sublabel
			);
		} catch (error) {
			currentUser = null;
			assetOptions = [];
			vesselOptions = [];
			throw error;
		}
	}

	async function loadUsers() {
		usersLoading = true;

		try {
			users = await getAllUsersApi();
		} finally {
			usersLoading = false;
		}
	}

	function unwrapApiData(response) {
		return response?.data || response;
	}

	function getApiMessage(response, fallback) {
		return response?.message || response?.data?.message || fallback;
	}

	function normalizePermissionKeys(permissionAccess) {
		if (Array.isArray(permissionAccess?.permissions)) {
			return permissionAccess.permissions
				.map((item) => (typeof item === 'string' ? item : item?.key))
				.filter(Boolean);
		}

		if (Array.isArray(permissionAccess?.details)) {
			return permissionAccess.details
				.map((item) => (typeof item === 'string' ? item : item?.key))
				.filter(Boolean);
		}

		return [];
	}

	async function loadPermissions() {
		permissionsLoading = true;

		try {
			const data = await getPermissionCatalogApi();
			modulePermissions = data?.modulePermissions || {};
		} finally {
			permissionsLoading = false;
		}
	}
	async function loadVessels() {
		vesselsLoading = true;

		try {
			vessels = await getAllVesselsAdminApi();

			vesselOptions = sortByAlpha(
				vessels.map((vessel) => ({
					...getAccessCompanyFields(vessel),
					id: Number(vessel.id),
					label: vessel.vesselName || vessel.deviceName || vessel.deviceId || `Vessel ${vessel.id}`,
					sublabel: vessel.deviceId || '',
					searchValues: [vessel.vesselName, vessel.vessel_name, vessel.name]
				})),
				(vessel) => vessel.label,
				(vessel) => vessel.sublabel
			);
		} finally {
			vesselsLoading = false;
		}
	}

	async function loadVesselFeatureCatalog() {
		if (vesselFeatureCatalogLoading || vesselFeatureCatalogLoaded) return;
		vesselFeatureCatalogLoading = true;
		vesselFeatureCatalogError = '';

		try {
			const features = await getAvailableVesselFeaturesAdminApi();
			if (!Array.isArray(features))
				throw new Error('Unable to load vessel features. Please retry.');
			availableVesselFeatures = sortByAlpha(
				features.filter((feature) => typeof feature?.key === 'string' && feature.key.trim()),
				(feature) => feature.module,
				(feature) => feature.label || feature.key
			);
			vesselFeatureCatalogLoaded = true;
		} catch (error) {
			vesselFeatureCatalogError = error.message || 'Failed to load available vessel features.';
		} finally {
			vesselFeatureCatalogLoading = false;
		}
	}

	async function loadSelectedVesselFeatures() {
		const vesselId = selectedVessel?.id;
		if (vesselMode !== 'edit' || !vesselId || vesselFeaturesLoading) return;
		const requestId = ++vesselFeaturesRequestId;
		vesselFeaturesLoading = true;
		vesselFeaturesError = '';

		try {
			const vessel = await getVesselDetailAdminApi(vesselId);
			if (requestId !== vesselFeaturesRequestId) return;
			vesselForm = {
				...vesselForm,
				features: Array.isArray(vessel?.features) ? [...vessel.features] : []
			};
			vesselFeaturesLoaded = true;
		} catch (error) {
			if (requestId !== vesselFeaturesRequestId) return;
			vesselFeaturesError = error.message || 'Failed to load current vessel features.';
		} finally {
			if (requestId === vesselFeaturesRequestId) vesselFeaturesLoading = false;
		}
	}

	function toggleVesselFeature(key, checked) {
		if (vesselSaving || !vesselFeaturesLoaded || !vesselFeatureCatalogLoaded) return;
		if (!availableVesselFeatures.some((feature) => feature.key === key)) return;
		vesselForm = {
			...vesselForm,
			features: checked
				? [...new Set([...vesselForm.features, key])]
				: vesselForm.features.filter((feature) => feature !== key)
		};
	}

	function createEmptyCctvCamera(index = 0) {
		return {
			id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${index}`,
			camera_name: '',
			camera_token: ''
		};
	}

	function normalizeCctvCameras(cameras = []) {
		if (!Array.isArray(cameras) || cameras.length === 0) {
			return [createEmptyCctvCamera(0)];
		}

		return cameras.map((camera, index) => ({
			id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${index}`,
			camera_name: camera?.camera_name || camera?.cameraName || '',
			camera_token: camera?.camera_token || camera?.cameraToken || ''
		}));
	}

	function resetCctvForm() {
		cctvConfigMeta = null;
		cctvForm = {
			cameras: [createEmptyCctvCamera(0)]
		};
	}

	async function openCctvVessel(vessel) {
		if (!vessel?.id) return;

		cctvSelectedVessel = vessel;
		cctvConfigLoading = true;
		clearAlert();

		try {
			const config = await getCctvConfigAdminApi(vessel.id);
			cctvConfigMeta = config || null;
			cctvForm = {
				cameras: normalizeCctvCameras(config?.cameras)
			};
		} catch (error) {
			if (error?.status === 404) {
				resetCctvForm();
				showAlert(
					'error',
					`CCTV config for ${getVesselDisplayName(vessel)} is not found yet. Fill the form to create it.`
				);
				return;
			}

			resetCctvForm();
			showAlert('error', error.message || 'Failed to load CCTV configuration.');
		} finally {
			cctvConfigLoading = false;
		}
	}

	function addCctvCamera() {
		cctvForm = {
			...cctvForm,
			cameras: [...cctvForm.cameras, createEmptyCctvCamera(cctvForm.cameras.length)]
		};
	}

	function removeCctvCamera(cameraId) {
		const nextCameras = cctvForm.cameras.filter((camera) => camera.id !== cameraId);

		cctvForm = {
			...cctvForm,
			cameras: nextCameras.length ? nextCameras : [createEmptyCctvCamera(0)]
		};
	}

	function updateCctvCamera(cameraId, key, value) {
		cctvForm = {
			...cctvForm,
			cameras: cctvForm.cameras.map((camera) =>
				camera.id === cameraId
					? {
							...camera,
							[key]: value
						}
					: camera
			)
		};
	}

	function generateCctvToken(length = 32) {
		const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		const randomValues = new Uint32Array(length);

		if (globalThis.crypto?.getRandomValues) {
			globalThis.crypto.getRandomValues(randomValues);
		} else {
			for (let index = 0; index < length; index += 1) {
				randomValues[index] = Math.floor(Math.random() * characters.length);
			}
		}

		return Array.from(randomValues, (value) => characters[value % characters.length]).join('');
	}

	function generateCctvCameraToken(cameraId) {
		updateCctvCamera(cameraId, 'camera_token', generateCctvToken(32));
	}

	function validateCctvConfig() {
		if (!cctvSelectedVessel?.id) return 'Please select a vessel first.';

		const cameras = cctvForm.cameras
			.map((camera) => ({
				camera_name: camera.camera_name.trim(),
				camera_token: camera.camera_token.trim()
			}))
			.filter((camera) => camera.camera_name || camera.camera_token);

		if (!cameras.length) return 'At least one camera configuration is required.';

		const duplicateNames = new Set();
		const seenNames = new Set();
		const duplicateTokens = new Set();
		const seenTokens = new Set();

		for (const camera of cameras) {
			if (!camera.camera_name) return 'Every camera must have a camera name.';
			if (!camera.camera_token) return 'Every camera must have a camera token.';
			if (camera.camera_token.length !== 32) {
				return `Camera token for "${camera.camera_name}" must be exactly 32 characters.`;
			}

			const normalizedName = camera.camera_name.toLowerCase();
			if (seenNames.has(normalizedName)) duplicateNames.add(camera.camera_name);
			seenNames.add(normalizedName);

			if (seenTokens.has(camera.camera_token)) duplicateTokens.add(camera.camera_token);
			seenTokens.add(camera.camera_token);
		}

		if (duplicateNames.size) return `Duplicate camera name: ${[...duplicateNames][0]}.`;
		if (duplicateTokens.size) return 'Duplicate camera token is not allowed.';

		return '';
	}

	async function saveCctvConfig() {
		const validationError = validateCctvConfig();

		if (validationError) {
			showAlert('error', validationError);
			return;
		}

		cctvConfigSaving = true;
		clearAlert();

		const payload = {
			cameras: cctvForm.cameras
				.map((camera) => ({
					camera_name: camera.camera_name.trim(),
					camera_token: camera.camera_token.trim()
				}))
				.filter((camera) => camera.camera_name && camera.camera_token)
		};

		try {
			const config = await updateCctvConfigAdminApi(cctvSelectedVessel.id, payload);
			cctvConfigMeta = config || null;
			cctvForm = {
				cameras: normalizeCctvCameras(config?.cameras || payload.cameras)
			};
			showAlert('success', 'CCTV configuration saved successfully.');
		} catch (error) {
			showAlert('error', error.message || 'Failed to save CCTV configuration.');
		} finally {
			cctvConfigSaving = false;
		}
	}

	async function loadCompanies() {
		companiesLoading = true;

		try {
			const response = await getAllCompaniesAdminApi();
			const data = unwrapApiData(response);

			companies = Array.isArray(data) ? data : [];
		} finally {
			companiesLoading = false;
		}
	}

	async function syncCompanies() {
		companiesSyncing = true;
		clearAlert();

		try {
			const response = await syncCompaniesAdminApi();

			showAlert(
				'success',
				getApiMessage(response, 'Company synchronization from ThingsBoard completed successfully.')
			);

			await loadCompanies();
		} catch (error) {
			showAlert('error', error.message || 'Failed to synchronize companies from ThingsBoard.');
		} finally {
			companiesSyncing = false;
		}
	}

	async function syncAllCompaniesVesselsEngines() {
		syncAllLoading = true;
		clearAlert();

		try {
			const response = await syncAllVesselsAdminApi();
			const details = response?.data || {};
			const detailText = [details.companies, details.vessels].filter(Boolean).join(' | ');

			showAlert(
				'success',
				detailText ||
					getApiMessage(response, 'Companies, vessels, and engines synchronized successfully.')
			);

			await Promise.allSettled([loadCompanies(), loadVessels(), loadReportingVessels()]);
		} catch (error) {
			showAlert('error', error.message || 'Failed to synchronize companies, vessels, and engines.');
		} finally {
			syncAllLoading = false;
		}
	}

	async function deleteCompany(company) {
		if (!company?.id) return;

		const confirmed = window.confirm(
			`Delete company "${getCompanyDisplayName(company)}" from the local database?`
		);

		if (!confirmed) return;

		companyActionLoadingId = company.id;
		clearAlert();

		try {
			await deleteCompanyAdminApi(company.id);

			showAlert('success', 'Company deleted successfully.');
			await Promise.allSettled([loadCompanies(), loadVessels()]);
		} catch (error) {
			showAlert('error', error.message || 'Failed to delete company.');
		} finally {
			companyActionLoadingId = null;
		}
	}

	function openCreateVesselForm() {
		vesselFeaturesRequestId += 1;
		vesselFeaturesLoading = false;
		vesselFeaturesLoaded = false;
		vesselFeaturesError = '';
		vesselMode = 'create';
		selectedVessel = null;
		vesselForm = createEmptyVesselForm();
		clearAlert();
	}

	function openEditVesselForm(vessel, shouldClearAlert = true) {
		if (!vessel?.id) return;

		vesselFeaturesRequestId += 1;
		vesselFeaturesLoading = false;
		vesselFeaturesLoaded = Array.isArray(vessel.features);
		vesselFeaturesError = '';
		vesselMode = 'edit';
		selectedVessel = vessel;

		vesselForm = {
			deviceId: vessel?.deviceId || '',
			vesselName: vessel?.vesselName || '',
			companyId: vessel?.companyId ?? '',
			fuelConsumptionSource: getFuelConsumptionSourceValue(vessel),
			features: vesselFeaturesLoaded ? [...vessel.features] : []
		};

		if (shouldClearAlert) clearAlert();
		loadVesselFeatureCatalog();
		if (!vesselFeaturesLoaded) loadSelectedVesselFeatures();
	}

	function validateVesselForm() {
		if (!vesselForm.deviceId.trim()) {
			return 'Device ID is required.';
		}

		if (!vesselForm.vesselName.trim()) {
			return 'Vessel name is required.';
		}

		return null;
	}

	function buildVesselPayload() {
		const companyIdText = String(vesselForm.companyId ?? '').trim();

		return {
			deviceId: vesselForm.deviceId.trim(),
			vesselName: vesselForm.vesselName.trim(),
			companyId: companyIdText ? Number(companyIdText) : null,
			fuelConsumptionSource: getFuelConsumptionSourceValue(vesselForm.fuelConsumptionSource),
			...(vesselMode === 'edit' && vesselFeaturesLoaded
				? { features: [...new Set(vesselForm.features)] }
				: {})
		};
	}

	async function saveVessel() {
		clearAlert();

		const errorMessage = validateVesselForm();

		if (errorMessage) {
			showAlert('error', errorMessage);
			return;
		}

		vesselSaving = true;

		try {
			const payload = buildVesselPayload();

			if (vesselMode === 'create') {
				const created = await createVesselAdminApi(payload);
				const createdId = created?.id;

				showAlert(
					'success',
					'Vessel created successfully. Engines will be automatically extracted from ThingsBoard telemetry.'
				);

				await loadVessels();
				const refreshed =
					vessels.find((vessel) => Number(vessel?.id) === Number(createdId)) || created;
				openEditVesselForm(refreshed);
			} else if (selectedVessel?.id) {
				const vesselId = selectedVessel.id;
				const updated = await updateVesselAdminApi(vesselId, payload);

				showAlert(
					'success',
					'Vessel updated successfully. If the Device ID changes, engines will be refreshed automatically.'
				);

				await loadVessels();
				const refreshed =
					vessels.find((vessel) => Number(vessel?.id) === Number(vesselId)) || updated;
				const savedVessel = {
					...refreshed,
					...updated,
					features: updated?.features ?? payload.features ?? refreshed?.features
				};
				vessels = vessels.map((vessel) =>
					Number(vessel.id) === Number(vesselId) ? savedVessel : vessel
				);
				if (vesselMode === 'edit' && selectedVessel?.id === vesselId) {
					openEditVesselForm(savedVessel, false);
				}
			}
		} catch (error) {
			showAlert('error', error.message || 'Failed to save vessel.');
		} finally {
			vesselSaving = false;
		}
	}

	async function deleteVessel(vessel) {
		if (!vessel?.id) return;

		const confirmed = window.confirm(
			`Delete vessel "${vessel.vesselName}"? Related engines and assignments will also be deleted.`
		);

		if (!confirmed) return;

		vesselActionLoadingId = vessel.id;
		clearAlert();

		try {
			await deleteVesselAdminApi(vessel.id);

			showAlert('success', 'Vessel deleted successfully.');

			if (selectedVessel?.id === vessel.id) {
				openCreateVesselForm();
			}

			await loadVessels();
		} catch (error) {
			showAlert('error', error.message || 'Failed to delete vessel.');
		} finally {
			vesselActionLoadingId = null;
		}
	}

	async function loadAssets() {
		assetsLoading = true;

		try {
			assets = await getAllAssetsAdminApi();

			assetOptions = assets.map((asset) => ({
				...getAccessCompanyFields(asset),
				id: Number(asset.id),
				label: asset.assetName || asset.thingsboardName || asset.assetId || `Asset ${asset.id}`,
				sublabel: [
					getAssetType(asset) ? formatAssetType(getAssetType(asset)) : '',
					asset.assetId || asset.thingsboardName || ''
				]
					.filter(Boolean)
					.join(' • '),
				searchValues: [asset.assetName, asset.asset_name, formatAssetType(getAssetType(asset))]
			}));
			assetOptions = sortByAlpha(
				assetOptions,
				(asset) => asset.label,
				(asset) => asset.sublabel
			);
		} finally {
			assetsLoading = false;
		}
	}

	function openCreateAssetForm() {
		assetMode = 'create';
		selectedAsset = null;
		assetForm = createEmptyAssetForm();
		clearAlert();
	}

	async function openEditAssetForm(asset) {
		if (!asset?.id) return;

		assetMode = 'edit';
		clearAlert();

		try {
			let detail = asset;

			try {
				detail = await getAssetDetailAdminApi(asset.id);
			} catch {
				detail = asset;
			}

			selectedAsset = detail;

			assetForm = {
				assetId: detail?.assetId || '',
				assetName: detail?.assetName || detail?.thingsboardName || '',
				assetType: getAssetType(detail)
			};
		} catch (error) {
			showAlert('error', error.message || 'Failed to load asset details.');
		}
	}

	function validateAssetForm() {
		if (!assetForm.assetId.trim()) {
			return 'Asset ID is required.';
		}

		if (!assetForm.assetName.trim()) {
			return 'Asset name is required.';
		}

		return null;
	}

	function buildAssetPayload() {
		const assetType = assetForm.assetType.trim();

		return {
			assetId: assetForm.assetId.trim(),
			assetName: assetForm.assetName.trim(),
			assetType: assetType || null
		};
	}

	async function saveAsset() {
		clearAlert();

		const errorMessage = validateAssetForm();

		if (errorMessage) {
			showAlert('error', errorMessage);
			return;
		}

		assetSaving = true;

		try {
			const payload = buildAssetPayload();

			if (assetMode === 'create') {
				const created = await createAssetAdminApi(payload);

				showAlert('success', 'Asset created successfully.');
				await loadAssets();
				await openEditAssetForm(created);
			} else if (selectedAsset?.id) {
				const updated = await updateAssetAdminApi(selectedAsset.id, payload);

				showAlert('success', 'Asset updated successfully.');
				await loadAssets();
				await openEditAssetForm(updated);
			}
		} catch (error) {
			showAlert('error', error.message || 'Failed to save asset.');
		} finally {
			assetSaving = false;
		}
	}

	async function deleteAsset(asset) {
		if (!asset?.id) return;

		const confirmed = window.confirm(`Delete asset "${asset.assetName || asset.assetId}"?`);

		if (!confirmed) return;

		assetActionLoadingId = asset.id;
		clearAlert();

		try {
			await deleteAssetAdminApi(asset.id);

			showAlert('success', 'Asset deleted successfully.');

			if (selectedAsset?.id === asset.id) {
				openCreateAssetForm();
			}

			await loadAssets();
		} catch (error) {
			showAlert('error', error.message || 'Failed to delete asset.');
		} finally {
			assetActionLoadingId = null;
		}
	}

	function resetEngineCurveForm() {
		selectedEngineCurve = null;
		selectedEngineCurveDetail = null;
		selectedEngineCurveLoading = false;
		engineCurveActivationDate = getTodayDate();
		engineCurveForm = createEmptyEngineCurveForm();
		searchEngineCurveImportVessel = '';
		engineCurveImportVesselDropdownOpen = false;

		if (engineCurveFileInput) {
			engineCurveFileInput.value = '';
		}

		clearAlert();
	}

	function validateEngineCurveForm() {
		if (!engineCurveForm.vesselId) {
			return 'Vessel is required.';
		}

		if (!engineCurveForm.curveType) {
			return 'Curve type is required.';
		}

		if (!engineCurveForm.curveName.trim()) {
			return 'Curve name is required.';
		}

		if (!engineCurveForm.file) {
			return 'Excel file is required.';
		}

		if (
			engineCurveValidFromInput?.validity.valid === false ||
			(engineCurveForm.validFrom &&
				getCurveDate(engineCurveForm.validFrom) !== engineCurveForm.validFrom)
		) {
			return 'Valid From must be a valid date (YYYY-MM-DD).';
		}

		return null;
	}

	async function downloadEngineCurveTemplate() {
		clearAlert();

		const vesselId = engineCurveForm.vesselId;

		if (!vesselId) {
			showAlert('error', 'Please select a vessel before downloading the template.');
			return;
		}

		try {
			await downloadEngineCurveTemplateAdminApi(vesselId);
			showAlert('success', 'Engine curve template downloaded successfully.');
		} catch (error) {
			showAlert('error', error.message || 'Failed to download the engine curve template.');
		}
	}

	async function importEngineCurve() {
		if (engineCurveSaving) return;
		clearAlert();

		const errorMessage = validateEngineCurveForm();

		if (errorMessage) {
			showAlert('error', errorMessage);
			return;
		}

		engineCurveSaving = true;
		const validFrom = engineCurveForm.validFrom;

		try {
			const fileBase64 = await fileToBase64(engineCurveForm.file);

			const payload = {
				vesselId: Number(engineCurveForm.vesselId),
				curveType: engineCurveForm.curveType,
				curveName: engineCurveForm.curveName.trim(),
				fileBase64,
				fileName: engineCurveForm.fileName || engineCurveForm.file.name,
				activateAfterImport: Boolean(engineCurveForm.activateAfterImport),
				...(validFrom ? { validFrom } : {})
			};

			await importEngineCurveAdminApi(payload);

			showAlert('success', 'Engine curve imported successfully.');

			resetEngineCurveForm();
			await loadEngineCurves();
		} catch (error) {
			showAlert('error', error.message || 'Failed to import engine curve.');
		} finally {
			engineCurveSaving = false;
		}
	}

	async function openEngineCurveDetail(curve) {
		const curveId = getCurveId(curve);

		if (!curveId) return;

		selectedEngineCurveLoading = true;
		selectedEngineCurveDetail = null;
		engineCurveActivationDate = getTodayDate();
		clearAlert();

		try {
			selectedEngineCurve = curve;
			const detail = await getEngineCurveDetailAdminApi(curveId);
			if (getCurveId(selectedEngineCurve) !== curveId) return;
			// Preserve validity fields from GET /engine-curves if detail omits them.
			selectedEngineCurveDetail = { ...curve, ...detail };
		} catch (error) {
			if (getCurveId(selectedEngineCurve) === curveId) {
				showAlert('error', error.message || 'Failed to load engine curve details.');
			}
		} finally {
			if (getCurveId(selectedEngineCurve) === curveId) selectedEngineCurveLoading = false;
		}
	}

	async function toggleEngineCurve(curve) {
		const curveId = getCurveId(curve);

		if (!curveId || engineCurveActionLoadingId) return;

		const nextStatus = !Boolean(curve?.is_active);
		const validFrom = nextStatus ? engineCurveActivationDate : '';
		if (validFrom && getCurveDate(validFrom) !== validFrom) {
			showAlert('error', 'Valid From must be a valid date (YYYY-MM-DD).');
			return;
		}

		const confirmed = window.confirm(
			nextStatus
				? `Activate curve "${curve.curve_name}"${validFrom ? ` from ${validFrom}` : ''}? Other curves with the same type on this vessel will be deactivated.`
				: `Deactivate curve "${curve.curve_name}"?`
		);

		if (!confirmed) return;

		engineCurveActionLoadingId = curveId;
		clearAlert();

		try {
			await toggleEngineCurveActiveAdminApi(curveId, nextStatus, validFrom);

			showAlert(
				'success',
				nextStatus
					? 'Engine curve activated successfully.'
					: 'Engine curve deactivated successfully.'
			);

			await loadEngineCurves();

			if (selectedEngineCurve && getCurveId(selectedEngineCurve) === curveId) {
				const updatedCurve = engineCurves.find((item) => getCurveId(item) === curveId);
				await openEngineCurveDetail(
					updatedCurve || {
						...curve,
						is_active: nextStatus
					}
				);
			}
		} catch (error) {
			showAlert('error', error.message || 'Failed to change engine curve status.');
		} finally {
			engineCurveActionLoadingId = null;
		}
	}

	async function deleteEngineCurve(curve) {
		const curveId = getCurveId(curve);

		if (!curveId) return;

		const confirmed = window.confirm(`Delete engine curve "${curve.curve_name}"?`);

		if (!confirmed) return;

		engineCurveActionLoadingId = curveId;
		clearAlert();

		try {
			await deleteEngineCurveAdminApi(curveId);

			showAlert('success', 'Engine curve deleted successfully.');

			if (selectedEngineCurve && getCurveId(selectedEngineCurve) === curveId) {
				selectedEngineCurve = null;
				selectedEngineCurveDetail = null;
			}

			await loadEngineCurves();
		} catch (error) {
			showAlert('error', error.message || 'Failed to delete engine curve.');
		} finally {
			engineCurveActionLoadingId = null;
		}
	}

	function showAlert(type, message) {
		alert = { type, message };
	}

	function clearAlert() {
		alert = null;
	}

	function prettify(value) {
		return String(value || '')
			.replace(/_/g, ' ')
			.replace(/\b\w/g, (char) => char.toUpperCase());
	}

	function getPermissionEffect(permission = {}) {
		const key = String(permission?.key || permission?.permissionKey || '').trim();
		const moduleLabel = permission?.moduleLabel || prettify(permission?.moduleKey || '');
		const category = String(permission?.category || '').trim();
		const tableLabel = permission?.tableLabel || permission?.columnLabel || '';

		if (PERMISSION_EFFECT_HINTS[key]) return PERMISSION_EFFECT_HINTS[key];

		if (REPORT_CONTENT_PERMISSION_KEYS.includes(key) || category === 'report_content') {
			return `Affects report content visibility${tableLabel ? ` in ${tableLabel}` : ''}.`;
		}

		if (key.startsWith('access_')) {
			return `Shows or opens the ${moduleLabel || prettify(key.replace(/^access_/, ''))} feature/page.`;
		}

		if (key.startsWith('view_')) {
			return `Shows related data, cards, tables, or charts in ${moduleLabel || 'the selected module'}.`;
		}

		if (key.startsWith('manage_')) {
			return `Enables create, update, delete, or configuration actions in ${moduleLabel || 'the selected module'}.`;
		}

		if (key.startsWith('import_')) {
			return `Enables Excel/file import actions in ${moduleLabel || 'the selected module'}.`;
		}

		if (key.startsWith('export_')) {
			return `Enables export/download actions in ${moduleLabel || 'the selected module'}.`;
		}

		if (key.startsWith('assign_')) {
			return `Enables assignment actions in ${moduleLabel || 'the selected module'}.`;
		}

		return moduleLabel
			? `Affects access and actions inside ${moduleLabel}.`
			: 'Affects the related page, section, or action that uses this permission key.';
	}

	function parseIds(value) {
		return String(value || '')
			.split(/[\s,;]+/)
			.map((item) => Number(item))
			.filter((item) => Number.isFinite(item) && item > 0);
	}

	function idsToText(ids) {
		return [...new Set((ids || []).map(Number).filter(Boolean))].join(', ');
	}

	function extractIdsFromAccess(access, idsKey) {
		if (Array.isArray(access?.[idsKey])) {
			return access[idsKey].map(Number).filter(Boolean);
		}

		if (Array.isArray(access?.details)) {
			return access.details.map((item) => Number(item.id)).filter(Boolean);
		}

		return [];
	}

	function formatDate(value) {
		if (!value) return '-';

		const date = new Date(value);

		if (Number.isNaN(date.getTime())) return '-';

		return new Intl.DateTimeFormat('en-US', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(date);
	}

	function matchPermission(permission, keyword = '') {
		if (!keyword) return true;

		return [
			permission?.key,
			permission?.label,
			permission?.description,
			getPermissionEffect(permission),
			permission?.moduleLabel,
			permission?.moduleKey,
			permission?.category,
			permission?.tableLabel,
			permission?.columnLabel
		]
			.filter(Boolean)
			.some((value) => String(value).toLowerCase().includes(keyword));
	}

	function openCreateForm() {
		mode = 'create';
		selectedUser = null;
		form = createEmptyForm();
		searchUserAssetAccess = '';
		searchUserVesselAccess = '';
		clearAlert();
	}

	async function openEditForm(user) {
		if (!user?.id) return;

		selectedUserLoading = true;
		clearAlert();

		try {
			const response = await getUserDetailApi(user.id);
			const detail = unwrapApiData(response);

			selectedUser = detail;
			mode = 'edit';
			searchUserAssetAccess = '';
			searchUserVesselAccess = '';

			const assetIds = extractIdsFromAccess(detail?.assetAccess, 'assetIds');
			const vesselIds = extractIdsFromAccess(detail?.vesselAccess, 'vesselIds');
			const permissions = normalizePermissionKeys(detail?.permissionAccess);

			form = {
				name: detail?.name || '',
				username: detail?.username || '',
				password: '',
				email: detail?.email || '',

				assetAccessMode: detail?.assetAccess?.mode || 'all',
				vesselAccessMode: detail?.vesselAccess?.mode || 'all',
				permissionAccessMode: detail?.permissionAccess?.mode || 'selected',

				assetIdsText: idsToText(assetIds),
				vesselIdsText: idsToText(vesselIds),

				selectedAssetIds: assetIds,
				selectedVesselIds: vesselIds,
				selectedPermissions: permissions
			};
		} catch (error) {
			showAlert('error', error.message || 'Failed to load user details.');
		} finally {
			selectedUserLoading = false;
		}
	}

	function buildAccessPayload(kind) {
		if (kind === 'asset') {
			const payload = { mode: form.assetAccessMode };

			if (form.assetAccessMode === 'selected') {
				payload.assetIds = parseIds(form.assetIdsText);
			}

			return payload;
		}

		if (kind === 'vessel') {
			const payload = { mode: form.vesselAccessMode };

			if (form.vesselAccessMode === 'selected') {
				payload.vesselIds = parseIds(form.vesselIdsText);
			}

			return payload;
		}

		const payload = { mode: form.permissionAccessMode };

		if (form.permissionAccessMode === 'selected') {
			payload.permissions = [...new Set(form.selectedPermissions)];
		}

		return payload;
	}

	function validateForm() {
		if (!form.name.trim()) return 'Name is required.';
		if (!form.username.trim()) return 'Username is required.';

		if (mode === 'create' && !form.password.trim()) {
			return 'Password is required when creating a new user.';
		}

		if (form.vesselAccessMode === 'selected' && parseIds(form.vesselIdsText).length === 0) {
			return 'Selected vessel access mode requires at least 1 vessel ID.';
		}

		if (form.permissionAccessMode === 'selected' && form.selectedPermissions.length === 0) {
			return 'Selected permission access mode requires at least 1 permission.';
		}

		return null;
	}

	function buildPayload() {
		const payload = {
			name: form.name.trim(),
			username: form.username.trim(),
			email: form.email.trim() || null,
			vesselAccess: buildAccessPayload('vessel'),
			permissionAccess: buildAccessPayload('permission')
		};

		if (mode === 'edit') {
			payload.assetAccess = buildAccessPayload('asset');
		}

		const password = String(form.password || '').trim();

		if (mode === 'create') {
			payload.password = password;
		}

		if (mode === 'edit' && password) {
			payload.password = password;
		}

		return payload;
	}

	async function saveUser() {
		clearAlert();

		const errorMessage = validateForm();

		if (errorMessage) {
			showAlert('error', errorMessage);
			return;
		}

		saving = true;

		try {
			const payload = buildPayload();
			const assetAccess = buildAccessPayload('asset');
			const submittedForm = { ...form };

			if (mode === 'create') {
				const response = await createUserApi(payload);
				const created = unwrapApiData(response);

				if (!created?.id) {
					openCreateForm();
					throw new Error(
						'User was created, but the API did not return its ID, so asset access could not be saved. Refresh the user list and edit the created user to set its asset access.'
					);
				}

				selectedUser = created;
				mode = 'edit';
				form = { ...submittedForm, password: '' };

				try {
					await updateUserApi(created.id, { assetAccess });
				} catch (error) {
					showAlert(
						'error',
						`User was created, but asset access could not be saved and may still be All. Your selection is retained; click Save Changes to retry. ${error.message || ''}`
					);
					return;
				}

				await loadUsers();
				await openEditForm({ id: created.id });

				showAlert('success', 'User created successfully.');
			} else if (selectedUser?.id) {
				const response = await updateUserApi(selectedUser.id, payload);
				const updated = unwrapApiData(response);

				selectedUser = updated;
				showAlert('success', 'User updated successfully.');
				await loadUsers();
			}
		} catch (error) {
			showAlert('error', error.message || 'Failed to save user.');
		} finally {
			saving = false;
		}
	}

	async function toggleUserStatus(user) {
		if (!user?.id) return;

		const isInactive = Boolean(user.deletedAt);

		const confirmMessage = isInactive
			? `Reactivate user "${user.name}"?`
			: `Deactivate user "${user.name}"?`;

		const confirmed = window.confirm(confirmMessage);

		if (!confirmed) return;

		actionLoadingId = user.id;
		clearAlert();

		try {
			if (isInactive) {
				await activateUserApi(user.id);
			} else {
				await deactivateUserApi(user.id);
			}

			showAlert(
				'success',
				isInactive ? 'User activated successfully.' : 'User deactivated successfully.'
			);

			await loadUsers();

			if (selectedUser?.id === user.id) {
				await openEditForm({ id: user.id });
			}
		} catch (error) {
			showAlert('error', error.message || 'Failed to change user status.');
		} finally {
			actionLoadingId = null;
		}
	}

	function toggleAccessCompany(type, group, checked) {
		const idsKey = type === 'asset' ? 'selectedAssetIds' : 'selectedVesselIds';
		const textKey = type === 'asset' ? 'assetIdsText' : 'vesselIdsText';
		const selected = new Set(form[idsKey]);
		for (const option of group.options) {
			if (checked) selected.add(option.id);
			else selected.delete(option.id);
		}
		const ids = [...selected];
		form = { ...form, [idsKey]: ids, [textKey]: idsToText(ids) };
	}

	function toggleId(type, id) {
		const numericId = Number(id);

		if (!numericId) return;

		if (type === 'asset') {
			const current = new Set(form.selectedAssetIds);

			if (current.has(numericId)) current.delete(numericId);
			else current.add(numericId);

			const ids = [...current];

			form = {
				...form,
				selectedAssetIds: ids,
				assetIdsText: idsToText(ids)
			};

			return;
		}

		if (type === 'vessel') {
			const current = new Set(form.selectedVesselIds);

			if (current.has(numericId)) current.delete(numericId);
			else current.add(numericId);

			const ids = [...current];

			form = {
				...form,
				selectedVesselIds: ids,
				vesselIdsText: idsToText(ids)
			};
		}
	}

	function syncManualIds(type) {
		if (type === 'asset') {
			form = {
				...form,
				selectedAssetIds: parseIds(form.assetIdsText)
			};

			return;
		}

		form = {
			...form,
			selectedVesselIds: parseIds(form.vesselIdsText)
		};
	}

	function togglePermission(key) {
		const current = new Set(form.selectedPermissions);

		if (current.has(key)) current.delete(key);
		else current.add(key);

		form = {
			...form,
			selectedPermissions: [...current]
		};
	}

	function selectModulePermissions(group) {
		const current = new Set(form.selectedPermissions);

		group.permissions.forEach((permission) => {
			current.add(permission.key);
		});

		form = {
			...form,
			selectedPermissions: [...current]
		};
	}

	function clearModulePermissions(group) {
		const removeKeys = new Set(group.permissions.map((permission) => permission.key));

		form = {
			...form,
			selectedPermissions: form.selectedPermissions.filter((key) => !removeKeys.has(key))
		};
	}

	function selectAllPermissions() {
		form = {
			...form,
			selectedPermissions: [...new Set(allPermissions.map((permission) => permission.key))]
		};
	}

	function clearAllPermissions() {
		form = {
			...form,
			selectedPermissions: []
		};
	}

	function hasReportContentSection(key) {
		return (autoReportForm.reportSections || []).includes(key);
	}

	function toggleReportContentSection(key) {
		if (!key) return;

		const current = new Set(autoReportForm.reportSections || []);

		if (current.has(key)) current.delete(key);
		else current.add(key);

		autoReportForm = {
			...autoReportForm,
			reportSections: [...current]
		};
	}

	function selectAllReportContentSections() {
		autoReportForm = {
			...autoReportForm,
			reportSections: [...REPORT_CONTENT_PERMISSION_KEYS]
		};
	}

	function clearReportContentSections() {
		autoReportForm = {
			...autoReportForm,
			reportSections: []
		};
	}
</script>

<section class="administrator-page">
	<AdministratorHeader
		activeTab={activeAdminTab}
		{bootLoading}
		onRefresh={initializePage}
		onCreateUser={openCreateForm}
		onCreateVessel={openCreateVesselForm}
		onCreateAsset={openCreateAssetForm}
		onDownloadTemplate={downloadEngineCurveTemplate}
	/>

	{#if alert}
		<div class="admin-toast-layer" aria-live="polite">
			<div
				class:success={alert.type === 'success'}
				class:danger={alert.type === 'error'}
				class="admin-toast"
				role={alert.type === 'error' ? 'alert' : 'status'}
			>
				<div class="admin-toast-copy">
					<strong>{alert.type === 'success' ? 'Action success' : 'Action failed'}</strong>
					<span>{alert.message}</span>
				</div>
				<button
					type="button"
					class="admin-toast-close"
					on:click={clearAlert}
					aria-label="Close notification">×</button
				>
			</div>
		</div>
	{/if}

	{#if bootLoading}
		<section class="state-card">
			<LoadingSkeleton label="Loading administrator data" variant="administrator-page" />
		</section>
	{:else if currentUser && !isSuperAdmin}
		<section class="state-card danger-state">
			<h2>Access Denied</h2>
			<p>
				This page is only available for Super Admins. Make sure the logged-in user has
				<code>permissionAccess.mode = all</code>.
			</p>
		</section>
	{:else}
		<section class="admin-tabs" bind:this={adminTabsElement}>
			<span class="admin-tab-indicator" style={adminTabIndicatorStyle}></span>

			<button
				type="button"
				class:active-tab={activeAdminTab === 'users'}
				on:click={() => setActiveAdminTab('users')}
			>
				User Access
			</button>

			<button
				type="button"
				class:active-tab={activeAdminTab === 'vessels'}
				on:click={() => setActiveAdminTab('vessels')}
			>
				Vessel Registry
			</button>

			<button
				type="button"
				class:active-tab={activeAdminTab === 'assets'}
				on:click={() => setActiveAdminTab('assets')}
			>
				Asset Registry
			</button>

			<button
				type="button"
				class:active-tab={activeAdminTab === 'engine-curves'}
				on:click={() => setActiveAdminTab('engine-curves')}
			>
				Engine Curves
			</button>
			<button
				type="button"
				class:active-tab={activeAdminTab === 'reporting'}
				on:click={() => setActiveAdminTab('reporting')}
			>
				Reporting
			</button>
			<button
				type="button"
				class:active-tab={activeAdminTab === 'cctv-config'}
				on:click={openCctvConfigTab}
			>
				CCTV Config
			</button>
			<button type="button" class:active-tab={activeAdminTab === 'alarm'} on:click={openAlarmTab}>
				Alarm
			</button>
			<button
				type="button"
				class:active-tab={activeAdminTab === 'global-audit-logs'}
				on:click={() => setActiveAdminTab('global-audit-logs')}
			>
				Audit Logs
			</button>
		</section>

		{#key activeAdminTab}
			<div
				class="admin-tab-content"
				in:fly={{ x: 18 * adminTabDirection, duration: 220, easing: cubicOut }}
				out:fade={{ duration: 90 }}
			>
				{#if activeAdminTab === 'users'}
					<section class="admin-workspace">
						<aside class="users-panel">
							<div class="panel-title-row">
								<div>
									<h2>Users</h2>
									<p>{filteredUsers.length} of {users.length} user</p>
								</div>

								{#if usersLoading}
									<LoadingSkeleton label="Loading users" variant="inline" compact />
								{/if}
							</div>

							<input
								class="search-input"
								type="search"
								bind:value={searchUser}
								placeholder="Search name, username, email..."
							/>

							<div class="users-list">
								{#if usersLoading}
									<LoadingSkeleton
										label="Loading users"
										variant="admin-entity-list"
										rows={6}
										compact
									/>
								{:else if filteredUsers.length === 0}
									<div class="empty-box">User not found.</div>
								{:else}
									{#each filteredUsers as user}
										<button
											type="button"
											class:selected-user={selectedUser?.id === user.id}
											class:inactive-user={user.deletedAt}
											class="user-row"
											on:click={() => openEditForm(user)}
										>
											<div class="user-main">
												<strong>{user.name || '-'}</strong>
												<span>@{user.username || '-'}</span>
												<small>{user.email || 'No email'}</small>
												<small>Created: {formatDate(user.createdAt)}</small>
											</div>

											<div class="user-meta">
												<span
													class:active-badge={!user.deletedAt}
													class:inactive-badge={user.deletedAt}
												>
													{user.deletedAt ? 'Inactive' : 'Active'}
												</span>

												<small>ID {user.id}</small>
											</div>
										</button>
									{/each}
								{/if}
							</div>
						</aside>

						<main class="editor-panel">
							<div class="editor-toolbar">
								<div>
									<h2>{mode === 'create' ? 'Create New User' : 'Edit User'}</h2>
									<p>
										{mode === 'create'
											? 'Fill in the new user data and define access permissions.'
											: selectedUserLoading
												? 'Loading user details...'
												: `Editing ${selectedUser?.name || 'user'}`}
									</p>
								</div>

								<div class="editor-toolbar-actions">
									{#if selectedUser && mode === 'edit'}
										<button
											type="button"
											class:danger-button={!selectedUser.deletedAt}
											class:activate-button={selectedUser.deletedAt}
											on:click={() => toggleUserStatus(selectedUser)}
											disabled={actionLoadingId === selectedUser.id}
										>
											{selectedUser.deletedAt ? 'Activate' : 'Deactivate'}
										</button>
									{/if}
								</div>
							</div>

							{#if selectedUserLoading}
								<LoadingSkeleton label="Loading user details" variant="admin-detail-form" compact />
							{/if}

							<div class="form-grid">
								<label>
									<span>Name</span>
									<input type="text" bind:value={form.name} placeholder="John Doe" />
								</label>

								<label>
									<span>Username</span>
									<input type="text" bind:value={form.username} placeholder="john.doe" />
								</label>

								<label>
									<span>Email</span>
									<input type="email" bind:value={form.email} placeholder="email@example.com" />
								</label>

								<label>
									<span>{mode === 'create' ? 'Password' : 'New Password'}</span>
									<input
										type="password"
										bind:value={form.password}
										placeholder={mode === 'create'
											? 'User password'
											: 'Enter only to change the password'}
										autocomplete="new-password"
									/>

									{#if mode === 'edit'}
										<small class="field-help">
											Leave blank if you do not want to change the password.
										</small>
									{/if}
								</label>
							</div>

							<section class="access-grid">
								<article class="access-card">
									<div class="access-head">
										<div>
											<h3>Asset Access</h3>
											<p>Use all or selected mode.</p>
										</div>

										<select bind:value={form.assetAccessMode}>
											<option value="all">All</option>
											<option value="selected">Selected</option>
										</select>
									</div>

									{#if form.assetAccessMode === 'selected'}
										{#if assetOptions.length > 0}
											<div class="access-search-row">
												<input
													type="search"
													bind:value={searchUserAssetAccess}
													placeholder="Search asset, type, or company..."
												/>
												<span>{filteredAssetOptions.length} of {assetOptions.length}</span>
											</div>
											<div class="option-list company-access-list">
												{#each assetCompanyGroups as group (group.key)}
													{@const selectedCount = group.options.filter((option) =>
														form.selectedAssetIds.includes(option.id)
													).length}
													<div class="company-access-group">
														<label class="company-access-heading">
															<input
																type="checkbox"
																aria-label={'Select all assets in ' + group.companyName}
																checked={selectedCount === group.options.length}
																indeterminate={selectedCount > 0 &&
																	selectedCount < group.options.length}
																on:change={(event) =>
																	toggleAccessCompany('asset', group, event.currentTarget.checked)}
															/>
															<span>
																<strong>{group.companyName}</strong>
																<small
																	>{selectedCount}/{group.options.length} selected{group
																		.visibleOptions.length < group.options.length
																		? ' · ' + group.visibleOptions.length + ' shown'
																		: ''}</small
																>
															</span>
														</label>
														<div class="company-access-options">
															{#each group.visibleOptions as asset (asset.id)}
																<label class="option-chip">
																	<input
																		type="checkbox"
																		checked={form.selectedAssetIds.includes(asset.id)}
																		on:change={() => toggleId('asset', asset.id)}
																	/>
																	<span>
																		<strong>{asset.label}</strong>
																		<small>
																			ID {asset.id}{asset.sublabel ? ` • ${asset.sublabel}` : ''}
																		</small>
																	</span>
																</label>
															{/each}
														</div>
													</div>
												{/each}
											</div>
											{#if filteredAssetOptions.length === 0}
												<div class="muted-box">No asset matches your search.</div>
											{/if}
										{:else}
											<div class="muted-box">
												Asset list is not available from the current user. Enter the asset ID
												manually.
											</div>
										{/if}
									{:else}
										<div class="muted-box">The user will get access to all assets.</div>
									{/if}
								</article>

								<article class="access-card">
									<div class="access-head">
										<div>
											<h3>Vessel Access</h3>
											<p>Restrict the user by vessel.</p>
										</div>

										<select bind:value={form.vesselAccessMode}>
											<option value="all">All</option>
											<option value="selected">Selected</option>
										</select>
									</div>

									{#if form.vesselAccessMode === 'selected'}
										{#if vesselOptions.length > 0}
											<div class="access-search-row">
												<input
													type="search"
													bind:value={searchUserVesselAccess}
													placeholder="Search vessel or company name..."
												/>
												<span>{filteredVesselOptions.length} of {vesselOptions.length}</span>
											</div>
											<div class="option-list company-access-list">
												{#each vesselCompanyGroups as group (group.key)}
													{@const selectedCount = group.options.filter((option) =>
														form.selectedVesselIds.includes(option.id)
													).length}
													<div class="company-access-group">
														<label class="company-access-heading">
															<input
																type="checkbox"
																aria-label={'Select all vessels in ' + group.companyName}
																checked={selectedCount === group.options.length}
																indeterminate={selectedCount > 0 &&
																	selectedCount < group.options.length}
																on:change={(event) =>
																	toggleAccessCompany('vessel', group, event.currentTarget.checked)}
															/>
															<span>
																<strong>{group.companyName}</strong>
																<small
																	>{selectedCount}/{group.options.length} selected{group
																		.visibleOptions.length < group.options.length
																		? ' · ' + group.visibleOptions.length + ' shown'
																		: ''}</small
																>
															</span>
														</label>
														<div class="company-access-options">
															{#each group.visibleOptions as vessel (vessel.id)}
																<label class="option-chip">
																	<input
																		type="checkbox"
																		checked={form.selectedVesselIds.includes(vessel.id)}
																		on:change={() => toggleId('vessel', vessel.id)}
																	/>
																	<span>
																		<strong>{vessel.label}</strong>
																		<small>
																			ID {vessel.id}{vessel.sublabel ? ` • ${vessel.sublabel}` : ''}
																		</small>
																	</span>
																</label>
															{/each}
														</div>
													</div>
												{/each}
											</div>
											{#if filteredVesselOptions.length === 0}
												<div class="muted-box">No vessel matches your search.</div>
											{/if}
										{:else}
											<div class="muted-box">
												Vessel list is not available from the current user. Enter the vessel ID
												manually.
											</div>
										{/if}
									{:else}
										<div class="muted-box">The user will get access to all vessels.</div>
									{/if}
								</article>
							</section>

							<section class="permission-panel">
								<div class="permission-header">
									<div>
										<h3>Permission Access</h3>
										<p>
											Selected: <strong>{form.selectedPermissions.length}</strong> permission.
										</p>
									</div>

									<div class="permission-actions">
										<select bind:value={form.permissionAccessMode}>
											<option value="all">All</option>
											<option value="selected">Selected</option>
										</select>

										<button
											type="button"
											class="ghost-button small"
											on:click={selectAllPermissions}
										>
											Select All
										</button>

										<button type="button" class="ghost-button small" on:click={clearAllPermissions}>
											Clear
										</button>
									</div>
								</div>

								{#if form.permissionAccessMode === 'selected'}
									<div class="permission-filter">
										<select bind:value={activeModule}>
											{#each permissionModules as module}
												<option value={module.moduleKey}>{module.moduleLabel}</option>
											{/each}
										</select>

										<input
											type="search"
											bind:value={searchPermission}
											placeholder="Search permission key, label, description..."
										/>
									</div>

									{#if permissionsLoading}
										<LoadingSkeleton
											label="Loading permission catalog"
											variant="admin-permission-catalog"
											rows={5}
										/>
									{:else if visiblePermissionGroups.length === 0}
										<div class="empty-box">Permission not found.</div>
									{:else}
										<div class="permission-groups">
											{#each visiblePermissionGroups as group}
												<article class="permission-group">
													<div class="permission-group-head">
														<div>
															<h4>{group.moduleLabel}</h4>
															<p>{group.permissions.length} permission</p>
														</div>

														<div class="module-buttons">
															<button
																type="button"
																class="text-button"
																on:click={() => selectModulePermissions(group)}
															>
																Select module
															</button>

															<button
																type="button"
																class="text-button"
																on:click={() => clearModulePermissions(group)}
															>
																Clear module
															</button>
														</div>
													</div>

													<div class="permission-list">
														{#each group.permissions as permission}
															<label class="permission-item">
																<input
																	type="checkbox"
																	checked={form.selectedPermissions.includes(permission.key)}
																	on:change={() => togglePermission(permission.key)}
																/>

																<span>
																	<strong>{permission.label || permission.key}</strong>
																	<code>{permission.key}</code>
																	<small>{permission.description || '-'}</small>
																	<small class="permission-effect">
																		<b>Affects</b>
																		{getPermissionEffect(permission)}
																	</small>
																</span>

																<em>{permission.category}</em>
															</label>
														{/each}
													</div>
												</article>
											{/each}
										</div>
									{/if}
								{:else}
									<div class="muted-box large">The user will get all permissions.</div>
								{/if}
							</section>

							<div class="editor-footer">
								<button type="button" class="ghost-button" on:click={openCreateForm}>
									Reset Form
								</button>

								<button type="button" class="primary-button" on:click={saveUser} disabled={saving}>
									{saving ? 'Saving...' : mode === 'create' ? 'Create User' : 'Save Changes'}
								</button>
							</div>
						</main>
					</section>
				{:else if activeAdminTab === 'vessels'}
					<section class="vessel-admin-workspace">
						<aside class="vessel-list-panel">
							<div class="panel-title-row">
								<div>
									<h2>Vessels</h2>
									<p>{filteredVessels.length} of {vessels.length} vessel</p>
								</div>

								{#if vesselsLoading}
									<LoadingSkeleton label="Loading vessels" variant="inline" compact />
								{/if}
							</div>

							<div class="vessel-filter-row">
								<input
									class="search-input"
									type="search"
									bind:value={searchVessel}
									placeholder="Search vessel..."
								/>

								<div class="vessel-company-filter">
									<button
										type="button"
										class="company-filter-trigger"
										class:is-active={selectedVesselCompanyIds.length > 0}
										on:click={() => (vesselCompanyFilterOpen = !vesselCompanyFilterOpen)}
									>
										<span>Company</span>
										<strong>{getVesselCompanyFilterLabel()}</strong>
									</button>

									{#if vesselCompanyFilterOpen}
										<div class="company-filter-menu" transition:fade={{ duration: 120 }}>
											<div class="company-filter-actions">
												<button type="button" on:click={selectAllVesselCompanies}>All</button>
												<button type="button" on:click={clearVesselCompanyFilters}>Clear</button>
											</div>

											{#if companiesLoading}
												<LoadingSkeleton label="Loading companies" variant="inline" compact />
											{:else if vesselCompanyFilterOptions.length === 0}
												<div class="company-filter-empty">No companies found.</div>
											{:else}
												<div class="company-filter-options">
													{#each vesselCompanyFilterOptions as company}
														<label
															class="company-filter-option"
															class:is-selected={isVesselCompanySelected(company.id)}
														>
															<input
																type="checkbox"
																checked={isVesselCompanySelected(company.id)}
																on:change={() => toggleVesselCompanyFilter(company.id)}
															/>
															<span>{getCompanyDisplayName(company)}</span>
														</label>
													{/each}
												</div>
											{/if}
										</div>
									{/if}
								</div>
							</div>

							<div class="vessel-list">
								{#if vesselsLoading}
									<LoadingSkeleton
										label="Loading vessels"
										variant="admin-entity-list"
										rows={6}
										compact
									/>
								{:else if filteredVessels.length === 0}
									<div class="empty-box">Vessel not found.</div>
								{:else}
									{#each filteredVessels as vessel}
										<button
											type="button"
											class:selected-user={selectedVessel?.id === vessel.id}
											class="vessel-row"
											on:click={() => openEditVesselForm(vessel)}
										>
											<div>
												<strong>{vessel.vesselName || '-'}</strong>
												<span>ID {vessel.id}</span>
												<small>{getVesselDeviceLabel(vessel)}</small>
											</div>

											<div class="vessel-row-meta">
												<em>{getVesselCompanyLabel(vessel)}</em>
												<span class="fuel-source-pill">
													{getFuelConsumptionSourceLabel(vessel)}
												</span>
												<span
													class:on-hire={getVesselHireStatus(vessel)}
													class:off-hire={!getVesselHireStatus(vessel)}
													class="hire-status-pill"
												>
													{getVesselHireLabel(vessel)}
												</span>
											</div>
										</button>
									{/each}
								{/if}
							</div>
						</aside>

						<main class="vessel-editor-panel">
							<div class="editor-toolbar">
								<div>
									<h2>{vesselMode === 'create' ? 'Create New Vessel' : 'Edit Vessel'}</h2>
									<p>
										{vesselMode === 'create'
											? 'Register a new vessel using a ThingsBoard Device ID.'
											: `Editing ${selectedVessel?.vesselName || 'vessel'}`}
									</p>
								</div>

								<div class="vessel-toolbar-actions">
									<button
										type="button"
										class="ghost-button small"
										on:click={syncCompanies}
										disabled={companiesSyncing}
									>
										{companiesSyncing ? 'Syncing Companies...' : 'Sync Companies'}
									</button>

									<button
										type="button"
										class="primary-button small"
										on:click={syncAllCompaniesVesselsEngines}
										disabled={syncAllLoading}
									>
										{syncAllLoading ? 'Syncing All...' : 'Sync All'}
									</button>

									<button class="primary-button" type="button" on:click={openCreateVesselForm}>
										+ New Vessel
									</button>
								</div>
							</div>

							<div class="vessel-form-card">
								<div class="form-grid vessel-form-grid">
									<label>
										<span>Device ID</span>
										<input
											type="text"
											bind:value={vesselForm.deviceId}
											placeholder="8846c370-6603-11f1-aa56-7f0d7e55addc"
										/>
									</label>

									<label>
										<span>Vessel Name</span>
										<input
											type="text"
											bind:value={vesselForm.vesselName}
											placeholder="Test Vessel 8"
										/>
									</label>

									<label>
										<span>Fuel Cons Source</span>
										<select bind:value={vesselForm.fuelConsumptionSource}>
											{#each FUEL_CONSUMPTION_SOURCE_OPTIONS as option}
												<option value={option.value}>{option.label}</option>
											{/each}
										</select>
										<small class="field-help"
											>Saved as <code>fuelConsumptionSource</code> on <code>/vessels</code>.</small
										>
									</label>
								</div>

								{#if vesselMode === 'edit'}
									<section class="vessel-features" aria-labelledby="vessel-features-title">
										<div class="vessel-features-heading">
											<div>
												<h3 id="vessel-features-title">Vessel Features</h3>
												<p>
													Select the features available for this vessel, then save your changes.
												</p>
											</div>
											{#if vesselFeaturesLoaded}
												<span class="vessel-features-count"
													>{vesselForm.features.length} enabled</span
												>
											{/if}
										</div>

										{#if vesselFeatureCatalogLoading || vesselFeaturesLoading}
											<LoadingSkeleton label="Loading vessel features" variant="inline" compact />
										{:else if vesselFeatureCatalogError || vesselFeaturesError}
											<div class="vessel-features-feedback" role="status">
												<p>{vesselFeatureCatalogError || vesselFeaturesError}</p>
												<button
													type="button"
													class="ghost-button small"
													on:click={() => {
														loadVesselFeatureCatalog();
														if (!vesselFeaturesLoaded) loadSelectedVesselFeatures();
													}}
													disabled={vesselSaving}>Retry</button
												>
											</div>
										{:else if !availableVesselFeatures.length}
											<p class="vessel-features-feedback">
												No vessel features are currently available.
											</p>
										{:else}
											<div class="vessel-feature-list">
												{#each availableVesselFeatures as feature (feature.key)}
													<label
														class="vessel-feature-option"
														class:checked={vesselForm.features.includes(feature.key)}
													>
														<input
															type="checkbox"
															checked={vesselForm.features.includes(feature.key)}
															on:change={(event) =>
																toggleVesselFeature(feature.key, event.currentTarget.checked)}
															disabled={vesselSaving || !vesselFeaturesLoaded}
														/>
														<span class="vessel-feature-copy">
															<strong>{feature.label || prettify(feature.key)}</strong>
															{#if feature.module}<small class="vessel-feature-module"
																	>{prettify(feature.module)}</small
																>{/if}
															{#if feature.description}<small>{feature.description}</small>{/if}
														</span>
													</label>
												{/each}
											</div>
										{/if}
									</section>
								{/if}

								<div class="vessel-note">
									<strong>Note:</strong>
									Company is loaded from <code>GET /companies</code>. The
									<code>Sync Companies</code>
									button runs <code>POST /companies/sync</code>, while <code>Sync All</code> runs
									<code>POST /vessels/sync/all</code> to synchronize companies, vessels, and engines sequentially
									from ThingsBoard.
								</div>

								<div class="editor-footer">
									{#if vesselMode === 'edit' && selectedVessel}
										<button
											type="button"
											class="danger-button"
											on:click={() => deleteVessel(selectedVessel)}
											disabled={vesselActionLoadingId === selectedVessel.id}
										>
											{vesselActionLoadingId === selectedVessel.id
												? 'Deleting...'
												: 'Delete Vessel'}
										</button>
									{/if}

									<button type="button" class="ghost-button" on:click={openCreateVesselForm}>
										Reset Form
									</button>

									<button
										type="button"
										class="primary-button"
										on:click={saveVessel}
										disabled={vesselSaving}
									>
										{vesselSaving
											? 'Saving...'
											: vesselMode === 'create'
												? 'Create Vessel'
												: 'Save Vessel'}
									</button>
								</div>
							</div>

							{#if selectedVessel?.engines?.length}
								<section class="engine-preview-card">
									<div>
										<h3>Detected Engines</h3>
										<p>Engines extracted from ThingsBoard telemetry keys.</p>
									</div>

									<div class="engine-grid">
										{#each selectedVessel.engines as engine}
											<article>
												<strong>{engine.engineName}</strong>
												<code>{engine.engineKeyThingsboard}</code>
												<small>Engine ID {engine.id}</small>
											</article>
										{/each}
									</div>
								</section>
							{/if}
						</main>
					</section>
				{:else if activeAdminTab === 'assets'}
					<section class="asset-admin-workspace">
						<aside class="asset-list-panel">
							<div class="panel-title-row">
								<div>
									<h2>Assets</h2>
									<p>{filteredAssets.length} of {assets.length} asset</p>
								</div>

								{#if assetsLoading}
									<LoadingSkeleton label="Loading assets" variant="inline" compact />
								{/if}
							</div>

							<input
								class="search-input"
								type="search"
								bind:value={searchAsset}
								placeholder="Search asset name or type..."
							/>

							<div class="asset-list">
								{#if assetsLoading}
									<LoadingSkeleton
										label="Loading assets"
										variant="admin-entity-list"
										rows={6}
										compact
									/>
								{:else if filteredAssets.length === 0}
									<div class="empty-box">Asset not found.</div>
								{:else}
									{#each filteredAssets as asset}
										<button
											type="button"
											class:selected-user={selectedAsset?.id === asset.id}
											class="asset-row"
											on:click={() => openEditAssetForm(asset)}
										>
											<div>
												<div class="asset-row-title">
													<strong>{asset.assetName || asset.thingsboardName || '-'}</strong>
													<span
														class:empty-asset-type={!getAssetType(asset)}
														class="asset-type-badge"
													>
														{formatAssetType(getAssetType(asset))}
													</span>
												</div>
												<span>ID {asset.id}</span>
												<small>{asset.assetId || '-'}</small>
											</div>
										</button>
									{/each}
								{/if}
							</div>
						</aside>

						<main class="asset-editor-panel">
							<div class="editor-toolbar">
								<div>
									<h2>{assetMode === 'create' ? 'Create New Asset' : 'Edit Asset'}</h2>
									<p>
										{assetMode === 'create'
											? 'Register a new asset using a ThingsBoard Asset ID.'
											: `Editing ${selectedAsset?.assetName || selectedAsset?.assetId || 'asset'}`}
									</p>
								</div>

								<button class="primary-button" type="button" on:click={openCreateAssetForm}>
									+ New Asset
								</button>
							</div>

							<div class="asset-form-card">
								<div class="form-grid asset-form-grid">
									<label>
										<span>Asset ID</span>
										<input
											type="text"
											bind:value={assetForm.assetId}
											placeholder="29e1d920-6606-11f1-aa56-7f0d7e55addc"
										/>
									</label>

									<label>
										<span>Asset Name</span>
										<input type="text" bind:value={assetForm.assetName} placeholder="RIG 1 Test" />
									</label>

									<label>
										<span>Asset Type</span>
										<select bind:value={assetForm.assetType}>
											<option value="">Select type</option>
											{#if hasCustomAssetType}
												<option value={assetForm.assetType}
													>Current: {formatAssetType(assetForm.assetType)}</option
												>
											{/if}
											{#each assetTypeOptions as type}
												<option value={type}>{formatAssetType(type)}</option>
											{/each}
										</select>
									</label>
								</div>

								<div class="asset-note">
									<strong>Note:</strong>
									the asset backend accepts <code>assetId</code>, <code>assetName</code>, and
									<code>assetType</code>. Make sure <code>assetId</code> matches the Asset ID from ThingsBoard.
								</div>

								<div class="editor-footer">
									{#if assetMode === 'edit' && selectedAsset}
										<button
											type="button"
											class="danger-button"
											on:click={() => deleteAsset(selectedAsset)}
											disabled={assetActionLoadingId === selectedAsset.id}
										>
											{assetActionLoadingId === selectedAsset.id ? 'Deleting...' : 'Delete Asset'}
										</button>
									{/if}

									<button type="button" class="ghost-button" on:click={openCreateAssetForm}>
										Reset Form
									</button>

									<button
										type="button"
										class="primary-button"
										on:click={saveAsset}
										disabled={assetSaving}
									>
										{assetSaving
											? 'Saving...'
											: assetMode === 'create'
												? 'Create Asset'
												: 'Save Asset'}
									</button>
								</div>
							</div>
						</main>
					</section>
				{:else if activeAdminTab === 'engine-curves'}
					<section class="engine-curve-admin-workspace">
						<aside class="engine-curve-list-panel">
							<div class="panel-title-row">
								<div>
									<h2>Engine Curves</h2>
									<p>{filteredEngineCurves.length} of {engineCurves.length} curve</p>
								</div>

								{#if engineCurvesLoading}
									<LoadingSkeleton label="Loading engine curves" variant="inline" compact />
								{/if}
							</div>

							<input
								class="search-input"
								type="search"
								bind:value={searchEngineCurve}
								placeholder="Search curve, vessel, type..."
							/>

							<div class="engine-curve-list">
								{#if engineCurvesLoading}
									<LoadingSkeleton
										label="Loading engine curves"
										variant="admin-entity-list"
										rows={6}
										compact
									/>
								{:else if filteredEngineCurves.length === 0}
									<div class="empty-box">Engine curve not found.</div>
								{:else}
									{#each filteredEngineCurves as curve}
										<button
											type="button"
											class:selected-user={getCurveId(selectedEngineCurve) === getCurveId(curve)}
											class="engine-curve-row"
											on:click={() => openEngineCurveDetail(curve)}
										>
											<div>
												<strong>{curve.curve_name || '-'}</strong>
												<span>{curve.vessel_name || `Vessel ${curve.vessel_id}`}</span>
												<small>{curve.curve_type || '-'}</small>
												<small>Valid From: {getCurveDate(curve.valid_from) || '-'}</small>
												<small>Valid To: {getCurveDate(curve.valid_to) || '-'}</small>
											</div>

											<em class:active-curve={curve.is_active}>
												{curve.is_active ? 'Active' : 'Inactive'}
											</em>
										</button>
									{/each}
								{/if}
							</div>
						</aside>

						<main class="engine-curve-editor-panel">
							<div class="editor-toolbar">
								<div>
									<h2>Import Engine Curve</h2>
									<p>
										Download the template for the selected vessel, fill in the Excel file, then
										import it as an engine maker or EMS curve.
									</p>
								</div>
							</div>

							<section class="engine-curve-form-card">
								<div class="form-grid engine-curve-form-grid">
									<div class="engine-curve-vessel-picker">
										<span>Vessel</span>
										<div class="engine-curve-vessel-dropdown">
											<button
												type="button"
												class="engine-curve-vessel-selector"
												class:has-selection={selectedEngineCurveImportVessel}
												on:click={() =>
													(engineCurveImportVesselDropdownOpen =
														!engineCurveImportVesselDropdownOpen)}
											>
												<span class="selector-copy">
													<strong>
														{selectedEngineCurveImportVessel
															? getVesselDisplayName(selectedEngineCurveImportVessel)
															: 'Select vessel'}
													</strong>
												</span>
												<span class="selector-chevron">v</span>
											</button>

											{#if engineCurveImportVesselDropdownOpen}
												<div class="engine-curve-vessel-menu">
													<div class="engine-curve-vessel-search-box">
														<input
															type="search"
															placeholder="Search vessel..."
															aria-label="Search vessel"
															bind:value={searchEngineCurveImportVessel}
														/>
														{#if searchEngineCurveImportVessel}
															<button
																type="button"
																class="engine-curve-vessel-search-clear"
																aria-label="Clear vessel search"
																on:click={() => (searchEngineCurveImportVessel = '')}
															>
															</button>
														{/if}
													</div>

													{#if vesselsLoading}
														<div class="engine-curve-vessel-state">
															<LoadingSkeleton
																label="Loading vessels"
																variant="list"
																rows={4}
																compact
															/>
														</div>
													{:else if vessels.length === 0}
														<div class="engine-curve-vessel-state">No vessels available.</div>
													{:else if filteredEngineCurveImportVessels.length === 0}
														<div class="engine-curve-vessel-state">No vessel found.</div>
													{:else}
														<div class="engine-curve-vessel-items">
															{#each filteredEngineCurveImportVessels as vessel}
																<button
																	type="button"
																	class="engine-curve-vessel-item"
																	class:active-vessel={Number(engineCurveForm.vesselId) ===
																		Number(vessel.id)}
																	on:click={() => selectEngineCurveImportVessel(vessel)}
																>
																	<span class="vessel-item-copy">
																		<strong>{getVesselDisplayName(vessel)}</strong>
																		<small>{getVesselCompanyLabel(vessel)} - ID {vessel.id}</small>
																	</span>
																	{#if Number(engineCurveForm.vesselId) === Number(vessel.id)}
																		<span class="active-check">Selected</span>
																	{/if}
																</button>
															{/each}
														</div>
													{/if}
												</div>
											{/if}
										</div>
									</div>

									<label>
										<span>Curve Type</span>
										<select bind:value={engineCurveForm.curveType}>
											<option value="engine_maker">Engine Maker</option>
											<option value="ems_internal">EMS Internal</option>
											<option value="ems_external">EMS External</option>
										</select>
									</label>

									<label>
										<span>Curve Name</span>
										<input
											type="text"
											bind:value={engineCurveForm.curveName}
											placeholder="ME Maker Specs v1"
										/>
									</label>

									<label>
										<span>Valid From (optional)</span>
										<input
											type="date"
											use:fourDigitDateYear
											bind:this={engineCurveValidFromInput}
											bind:value={engineCurveForm.validFrom}
											disabled={engineCurveSaving}
										/>
									</label>

									<label class="engine-curve-file-field">
										<span>Excel File</span>
										<input
											bind:this={engineCurveFileInput}
											type="file"
											accept=".xlsx,.xls"
											on:change={handleEngineCurveFileChange}
										/>
									</label>
								</div>

								<label class="checkbox-line">
									<input type="checkbox" bind:checked={engineCurveForm.activateAfterImport} />
									<span>Activate curve after import</span>
								</label>

								<div class="engine-curve-note">
									<strong>Note:</strong>
									the template must be generated from the same vessel. Main Engines support RPM ranges,
									while Auxiliary Engines use one fixed L/H value on the first row.
								</div>

								<div class="editor-footer">
									<button type="button" class="ghost-button" on:click={resetEngineCurveForm}>
										Reset Form
									</button>

									<button type="button" class="ghost-button" on:click={downloadEngineCurveTemplate}>
										Download Template
									</button>

									<button
										type="button"
										class="primary-button"
										on:click={importEngineCurve}
										disabled={engineCurveSaving}
									>
										{engineCurveSaving ? 'Importing...' : 'Import Curve'}
									</button>
								</div>
							</section>

							{#if selectedEngineCurveLoading}
								<section class="engine-curve-detail-card">
									<LoadingSkeleton
										label="Loading engine curve details"
										variant="admin-engine-curve-detail"
									/>
								</section>
							{:else if selectedEngineCurveDetail}
								<section class="engine-curve-detail-card">
									<div class="engine-curve-detail-head">
										<div>
											<h3>{selectedEngineCurveDetail.curve_name || '-'}</h3>
											<p>
												{selectedEngineCurveDetail.vessel_name || '-'} •
												{selectedEngineCurveDetail.curve_type || '-'}
											</p>
										</div>

										<div class="detail-actions">
											{#if selectedEngineCurve?.is_active}
												<button
													type="button"
													class="ghost-button small"
													on:click={() => toggleEngineCurve(selectedEngineCurve)}
													disabled={engineCurveActionLoadingId === getCurveId(selectedEngineCurve)}
												>
													Deactivate
												</button>
											{/if}

											<button
												type="button"
												class="danger-button"
												on:click={() => deleteEngineCurve(selectedEngineCurve)}
												disabled={engineCurveActionLoadingId === getCurveId(selectedEngineCurve)}
											>
												Delete
											</button>
										</div>
									</div>

									<div class="curve-meta-grid">
										<article>
											<span>Status</span>
											<strong>{selectedEngineCurveDetail.is_active ? 'Active' : 'Inactive'}</strong>
										</article>

										<article>
											<span>Valid From</span>
											<strong>{getCurveDate(selectedEngineCurveDetail.valid_from) || '-'}</strong>
										</article>

										<article>
											<span>Valid To</span>
											<strong>{getCurveDate(selectedEngineCurveDetail.valid_to) || '-'}</strong>
										</article>

										<article>
											<span>Source File</span>
											<strong>{selectedEngineCurveDetail.meta?.source_file_path || '-'}</strong>
										</article>

										<article>
											<span>Uploaded At</span>
											<strong>{formatDate(selectedEngineCurveDetail.meta?.uploaded_at)}</strong>
										</article>
									</div>

									{#if !selectedEngineCurve?.is_active}
										<form
											class="curve-activation-form"
											on:submit|preventDefault={() => toggleEngineCurve(selectedEngineCurve)}
										>
											<label>
												<span>Valid From (optional)</span>
												<input
													type="date"
													use:fourDigitDateYear
													bind:value={engineCurveActivationDate}
													disabled={Boolean(engineCurveActionLoadingId)}
												/>
											</label>
											<p>
												Choose the effective date before activating this curve. Leave blank to omit
												the date.
											</p>
											<button
												type="submit"
												class="primary-button"
												disabled={Boolean(engineCurveActionLoadingId)}
											>
												{engineCurveActionLoadingId === getCurveId(selectedEngineCurve)
													? 'Activating...'
													: 'Activate'}
											</button>
										</form>
									{/if}

									<div class="engine-curve-engine-list">
										{#each selectedEngineCurveDetail.engines || [] as engine}
											<article class="engine-curve-engine-card">
												<div>
													<h4>{engine.engine_name || '-'}</h4>
													<code>{engine.engine_key_thingsboard || '-'}</code>
												</div>

												{#if engine.ranges?.length}
													<div class="range-table-wrap">
														<table>
															<thead>
																<tr>
																	<th>RPM Min</th>
																	<th>RPM Max</th>
																	<th>L/H</th>
																</tr>
															</thead>
															<tbody>
																{#each engine.ranges as range}
																	<tr>
																		<td>{range.rpm_min}</td>
																		<td>{range.rpm_max}</td>
																		<td>{range.value_lh}</td>
																	</tr>
																{/each}
															</tbody>
														</table>
													</div>
												{:else}
													<div class="ae-value-box">
														<span>Fixed L/H</span>
														<strong>{engine.value_lh ?? '-'}</strong>
													</div>
												{/if}
											</article>
										{/each}
									</div>
								</section>
							{/if}
						</main>
					</section>
				{:else if activeAdminTab === 'reporting'}
					<section class="reporting-admin-workspace">
						<aside class="reporting-vessel-panel">
							<div class="panel-title-row">
								<div>
									<h2>Reporting Vessels</h2>
									<p>
										{reportingMode === 'periodical'
											? 'Periodical auto-report'
											: 'Daily auto-report'} of {reportingVessels.length} vessel
									</p>
								</div>

								{#if reportingVesselsLoading}
									<LoadingSkeleton label="Loading reporting vessels" variant="inline" compact />
								{/if}
							</div>

							<div class="reporting-filter-box">
								<div class="reporting-mode-switch">
									<button
										type="button"
										class:active-mode={reportingMode === 'daily'}
										on:click={() => setReportingMode('daily')}
									>
										Daily
									</button>
									<button
										type="button"
										class:active-mode={reportingMode === 'periodical'}
										on:click={() => setReportingMode('periodical')}
									>
										Periodical
									</button>
								</div>

								<input
									type="search"
									bind:value={reportingFilters.search}
									placeholder="Search vessel..."
								/>

								<select bind:value={reportingFilters.status}>
									<option value="all">All Status</option>
									<option value="online">Online</option>
									<option value="offline">Offline</option>
								</select>

								<select bind:value={reportingFilters.autoReport}>
									<option value="all">All Auto Report</option>
									<option value="enabled">Enabled</option>
									<option value="disabled">Disabled</option>
								</select>

								<button type="button" class="ghost-button small" on:click={loadReportingVessels}>
									Apply
								</button>
							</div>

							<div class="reporting-vessel-list">
								{#if reportingVesselsLoading}
									<LoadingSkeleton
										label="Loading reporting vessels"
										variant="admin-entity-list"
										rows={6}
										compact
									/>
								{:else if filteredReportingVessels.length === 0}
									<div class="empty-box">Reporting vessel not found.</div>
								{:else}
									{#each filteredReportingVessels as vessel (vessel.id)}
										<button
											type="button"
											class:selected-user={selectedReportingVessel?.id === vessel.id}
											class="reporting-vessel-row"
											on:click={() => openReportingVessel(vessel)}
										>
											<div>
												<strong>{getVesselDisplayName(vessel)}</strong>
												<span>ID {vessel.id} • {vessel.status || '-'}</span>
												<small>{getVesselDeviceLabel(vessel)}</small>
											</div>

											<em class:active-reporting={isAutoReportEnabled(vessel)}>
												{isAutoReportEnabled(vessel)
													? reportingMode === 'periodical'
														? 'Periodical On'
														: 'Auto On'
													: reportingMode === 'periodical'
														? 'Periodical Off'
														: 'Auto Off'}
											</em>
										</button>
									{/each}
								{/if}
							</div>
						</aside>

						<main class="reporting-editor-panel">
							{#if !selectedReportingVessel}
								<section class="reporting-empty-card">
									<h2>Select Vessel</h2>
									<p>
										Select a vessel on the left to configure
										{reportingMode === 'periodical'
											? 'periodical auto-report'
											: 'auto-report and manual daily report'}.
									</p>
								</section>
							{:else}
								<div class="editor-toolbar">
									<div>
										<h2>{getVesselDisplayName(selectedReportingVessel)}</h2>
										<p>
											{getVesselDeviceLabel(selectedReportingVessel)} • Status:
											{selectedReportingVessel.status || '-'}
										</p>
									</div>
								</div>

								<section class="reporting-section-card">
									<div class="reporting-section-head">
										<div>
											<h3>
												{reportingMode === 'periodical'
													? 'Auto Periodical Report Email'
													: 'Auto Daily Report Email'}
											</h3>
											<p>
												{reportingMode === 'periodical'
													? 'Configure periodical schedule, recipients, timezone, and auto-report status.'
													: 'Configure recipients, send time, timezone, and auto-report status.'}
											</p>
										</div>

										<label class="switch-line">
											<input type="checkbox" bind:checked={autoReportForm.isEnabled} />
											<span>{autoReportForm.isEnabled ? 'Enabled' : 'Disabled'}</span>
										</label>
									</div>

									<div class="form-grid reporting-form-grid">
										{#if reportingMode === 'periodical'}
											<label>
												<span>Start Date</span>
												<input
													type="date"
													use:fourDigitDateYear
													bind:value={autoReportForm.periodicalStartDate}
												/>
											</label>

											<label>
												<span>Interval Days</span>
												<input
													type="number"
													min="1"
													step="1"
													bind:value={autoReportForm.periodicalIntervalDays}
												/>
											</label>
										{/if}

										<label>
											<span>{reportingMode === 'periodical' ? 'Schedule Time' : 'Send Time'}</span>
											<input type="time" bind:value={autoReportForm.sendTime} />
										</label>

										<label>
											<span class="field-label-row">
												Timezone Mode
												{#if autoReportForm.timezoneMode === 'auto'}
													<small class="timezone-auto-pill"
														>Auto • {getAutoReportTimezoneLabel()}</small
													>
												{/if}
											</span>
											<select bind:value={autoReportForm.timezoneMode}>
												{#each TIMEZONE_MODE_OPTIONS as option}
													<option value={option.value}>{option.label}</option>
												{/each}
											</select>
										</label>

										{#if autoReportForm.timezoneMode === 'manual'}
											<label>
												<span>Timezone Offset</span>
												<select bind:value={autoReportForm.timezoneOffset}>
													{#each TIMEZONE_OFFSET_OPTIONS as option}
														<option value={option.value}>{option.label}</option>
													{/each}
												</select>
											</label>
										{/if}
									</div>

									{#if reportingMode === 'daily'}
										<div class="report-content-card">
											<div class="report-content-head">
												<div>
													<h4>Report Content per Vessel</h4>
													<p>
														Choose which daily report sections are included for
														{getVesselDisplayName(selectedReportingVessel)}.
													</p>
												</div>

												<div class="report-content-actions">
													<span>{autoReportForm.reportSections.length} selected</span>
													<button
														type="button"
														class="ghost-button small"
														on:click={selectAllReportContentSections}
													>
														Select All
													</button>
													<button
														type="button"
														class="ghost-button small"
														on:click={clearReportContentSections}
													>
														Clear
													</button>
												</div>
											</div>

											<label class="report-content-search">
												<span>Search Section</span>
												<input
													type="search"
													bind:value={reportingContentSearch}
													placeholder="Search report section, table, or permission key..."
												/>
											</label>

											{#if permissionsLoading}
												<LoadingSkeleton
													label="Loading report content catalog"
													variant="admin-compact-list"
													rows={4}
												/>
											{:else if visibleReportContentPermissions.length === 0}
												<div class="empty-box">No report content section found.</div>
											{:else}
												<div class="report-content-list">
													{#each visibleReportContentPermissions as permission}
														<label
															class:report-content-item-checked={hasReportContentSection(
																permission.key
															)}
															class="report-content-item"
														>
															<input
																type="checkbox"
																checked={hasReportContentSection(permission.key)}
																on:change={() => toggleReportContentSection(permission.key)}
															/>
															<span class="report-content-checkmark" aria-hidden="true"></span>
															<div>
																<strong>{permission.label || prettify(permission.key)}</strong>
																<span class="report-content-meta">
																	{permission.tableLabel ||
																		permission.moduleLabel ||
																		'Daily Report'}
																</span>
																<small>{permission.description || permission.key}</small>
															</div>
														</label>
													{/each}
												</div>
											{/if}
										</div>
									{/if}

									<div class="recipient-picker-card">
										<div class="recipient-picker-head">
											<label>
												<span>Assignable Users</span>
												<input
													type="search"
													bind:value={reportingAssignableSearch}
													placeholder="Search name, username, or email..."
												/>
											</label>

											<div class="recipient-page-actions">
												<button
													type="button"
													class="ghost-button small"
													on:click={() =>
														loadReportingAssignableUsers(
															selectedReportingVessel.id,
															reportingAssignablePagination.page || 1
														)}
													disabled={reportingAssignableUsersLoading}
												>
													Refresh Users
												</button>

												<span>
													Page {reportingAssignablePagination.page || 1} /
													{reportingAssignablePagination.totalPages || 1}
												</span>
											</div>
										</div>

										<div class="manual-recipient-card">
											<div>
												<strong>Manual Email Assignment</strong>
												<span
													>Add report recipients manually when they are not listed as assignable
													users.</span
												>
											</div>

											<div class="manual-recipient-form">
												<label>
													<span>Email Address</span>
													<input
														type="text"
														bind:value={manualRecipientEmail}
														placeholder="captain@example.com, owner@example.com"
														on:keydown={(event) => {
															if (event.key === 'Enter') {
																event.preventDefault();
																addManualAutoReportRecipients();
															}
														}}
													/>
												</label>

												<label>
													<span>Role</span>
													<select bind:value={manualRecipientRole}>
														<option value="pic">PIC</option>
														<option value="cc">CC</option>
														<option value="bcc">BCC</option>
													</select>
												</label>

												<button
													type="button"
													class="primary-button"
													on:click={addManualAutoReportRecipients}
												>
													Add Email
												</button>
											</div>
										</div>

										{#if reportingAssignableUsersLoading}
											<LoadingSkeleton
												label="Loading assignable users"
												variant="admin-compact-list"
												rows={5}
											/>
										{:else if filteredReportingAssignableUsers.length === 0}
											<div class="empty-box">
												No users with email are available for this vessel.
											</div>
										{:else}
											<div class="assignable-user-list">
												{#each filteredReportingAssignableUsers as user}
													<article class="assignable-user-row">
														<div>
															<strong>{getAssignableUserName(user)}</strong>
															<span>@{user.username || '-'} • ID {user.id ?? '-'}</span>
															<small>{user.email || 'No email'}</small>
														</div>

														<div class="recipient-role-checks">
															<label>
																<input
																	type="checkbox"
																	checked={hasAutoReportRecipient(user.email, 'pic')}
																	disabled={!user.email}
																	on:change={(event) =>
																		toggleAutoReportRecipient(
																			user.email,
																			'pic',
																			event.currentTarget.checked
																		)}
																/>
																<span>PIC</span>
															</label>

															<label>
																<input
																	type="checkbox"
																	checked={hasAutoReportRecipient(user.email, 'cc')}
																	disabled={!user.email}
																	on:change={(event) =>
																		toggleAutoReportRecipient(
																			user.email,
																			'cc',
																			event.currentTarget.checked
																		)}
																/>
																<span>CC</span>
															</label>

															<label>
																<input
																	type="checkbox"
																	checked={hasAutoReportRecipient(user.email, 'bcc')}
																	disabled={!user.email}
																	on:change={(event) =>
																		toggleAutoReportRecipient(
																			user.email,
																			'bcc',
																			event.currentTarget.checked
																		)}
																/>
																<span>BCC</span>
															</label>
														</div>
													</article>
												{/each}
											</div>
										{/if}

										<div class="assignable-pagination">
											<button
												type="button"
												class="ghost-button small"
												on:click={() =>
													goToAssignableUserPage((reportingAssignablePagination.page || 1) - 1)}
												disabled={(reportingAssignablePagination.page || 1) <= 1 ||
													reportingAssignableUsersLoading}
											>
												Previous
											</button>

											<span>{reportingAssignablePagination.totalItems || 0} users</span>

											<button
												type="button"
												class="ghost-button small"
												on:click={() =>
													goToAssignableUserPage((reportingAssignablePagination.page || 1) + 1)}
												disabled={(reportingAssignablePagination.page || 1) >=
													(reportingAssignablePagination.totalPages || 1) ||
													reportingAssignableUsersLoading}
											>
												Next
											</button>
										</div>

										<div class="selected-recipient-grid">
											<div>
												<span>PIC</span>
												{#if autoReportForm.picEmails.length === 0}
													<small>Not selected</small>
												{:else}
													{#each autoReportForm.picEmails as email}
														<button
															type="button"
															on:click={() => removeAutoReportRecipient('pic', email)}
														>
															{email} ×
														</button>
													{/each}
												{/if}
											</div>

											<div>
												<span>CC</span>
												{#if autoReportForm.ccEmails.length === 0}
													<small>Not selected</small>
												{:else}
													{#each autoReportForm.ccEmails as email}
														<button
															type="button"
															on:click={() => removeAutoReportRecipient('cc', email)}
														>
															{email} ×
														</button>
													{/each}
												{/if}
											</div>

											<div>
												<span>BCC</span>
												{#if autoReportForm.bccEmails.length === 0}
													<small>Not selected</small>
												{:else}
													{#each autoReportForm.bccEmails as email}
														<button
															type="button"
															on:click={() => removeAutoReportRecipient('bcc', email)}
														>
															{email} ×
														</button>
													{/each}
												{/if}
											</div>
										</div>
									</div>

									<div class="editor-footer">
										<button
											type="button"
											class="primary-button"
											on:click={saveAutoReportConfig}
											disabled={reportingSaving}
										>
											{reportingSaving
												? 'Saving...'
												: reportingMode === 'periodical'
													? 'Save Periodical Auto Report'
													: 'Save Auto Report'}
										</button>
									</div>
								</section>

								{#if reportingMode === 'periodical'}
									<section class="reporting-section-card">
										<div class="reporting-section-head">
											<div>
												<h3>Manual Periodical Report</h3>
												<p>
													Download Excel/PDF or send the configured periodical report email
													manually.
												</p>
											</div>
										</div>

										<div class="form-grid manual-report-grid periodical-manual-grid">
											<label>
												<span>Start</span>
												<input
													type="datetime-local"
													use:fourDigitDateYear
													bind:value={manualPeriodicalStart}
												/>
											</label>

											<label>
												<span>End</span>
												<input
													type="datetime-local"
													use:fourDigitDateYear
													bind:value={manualPeriodicalEnd}
												/>
											</label>

											<label>
												<span>Download Format</span>
												<select bind:value={manualPeriodicalFormat}>
													<option value="excel">Excel</option>
													<option value="pdf">PDF</option>
												</select>
											</label>

											<button
												type="button"
												class="ghost-button"
												on:click={downloadManualPeriodicalReport}
												disabled={reportingActionLoadingId ===
													`periodical-download-${selectedReportingVessel.id}`}
											>
												Download Report
											</button>

											<button
												type="button"
												class="primary-button"
												on:click={sendManualPeriodicalReportEmail}
												disabled={reportingActionLoadingId ===
													`periodical-send-${selectedReportingVessel.id}`}
											>
												Send Email
											</button>
										</div>
									</section>
								{:else}
									<section class="reporting-section-card">
										<div class="reporting-section-head">
											<div>
												<h3>Manual Daily Report</h3>
												<p>Download Excel or send the daily report email manually.</p>
											</div>
										</div>

										<div class="form-grid manual-report-grid">
											<label>
												<span>Report Date</span>
												<input type="date" use:fourDigitDateYear bind:value={manualReportDate} />
											</label>

											<button
												type="button"
												class="ghost-button"
												on:click={downloadManualDailyReport}
												disabled={reportingActionLoadingId ===
													`download-${selectedReportingVessel.id}`}
											>
												Download Excel
											</button>

											<button
												type="button"
												class="primary-button"
												on:click={sendManualDailyReportEmail}
												disabled={reportingActionLoadingId === `send-${selectedReportingVessel.id}`}
											>
												Send Email
											</button>
										</div>
									</section>
								{/if}

								<section class="reporting-section-card">
									<div class="reporting-section-head">
										<div>
											<h3>Auto Report Audit Logs</h3>
											<p>Auto-report configuration change history.</p>
										</div>

										<div class="detail-actions">
											<button
												type="button"
												class="ghost-button small"
												on:click={loadAutoReportAuditLogs}
											>
												Refresh Logs
											</button>

											<button
												type="button"
												class="primary-button small"
												on:click={exportAutoReportAuditCsv}
											>
												Export CSV
											</button>
										</div>
									</div>

									<div class="audit-log-list">
										{#if autoReportAuditLoading}
											<LoadingSkeleton
												label="Loading audit logs"
												variant="admin-compact-list"
												rows={4}
											/>
										{:else if autoReportAuditLogs.length === 0}
											<div class="empty-box">No audit logs yet.</div>
										{:else}
											{#each autoReportAuditLogs as log}
												<article class="audit-log-row">
													<div>
														<strong>{log.action || '-'} • {log.module || '-'}</strong>
														<span>{log.user?.username || '-'} • {formatDate(log.logged_at)}</span>
													</div>

													<div class="audit-change-list">
														{#each log.changes || [] as change}
															<small>
																{change.fields}: {change.old_value} → {change.new_value}
															</small>
														{/each}
													</div>
												</article>
											{/each}
										{/if}
									</div>
								</section>
							{/if}
						</main>
					</section>
				{:else if activeAdminTab === 'cctv-config'}
					<section class="cctv-admin-workspace">
						<aside class="cctv-vessel-panel">
							<div class="panel-title-row">
								<div>
									<h2>CCTV Vessels</h2>
									<p>{filteredCctvVessels.length} of {vessels.length} vessel</p>
								</div>

								{#if vesselsLoading}
									<LoadingSkeleton label="Loading vessels" variant="inline" compact />
								{/if}
							</div>

							<input
								class="search-input"
								type="search"
								bind:value={cctvSearchVessel}
								placeholder="Search vessel or company name..."
							/>

							<div class="cctv-vessel-list">
								{#if vesselsLoading}
									<LoadingSkeleton
										label="Loading vessels"
										variant="admin-entity-list"
										rows={6}
										compact
									/>
								{:else if filteredCctvVessels.length === 0}
									<div class="empty-box">Vessel not found.</div>
								{:else}
									{#each filteredCctvVessels as vessel}
										<button
											type="button"
											class:selected-user={cctvSelectedVessel?.id === vessel.id}
											class="cctv-vessel-row"
											on:click={() => openCctvVessel(vessel)}
										>
											<div>
												<strong>{getVesselDisplayName(vessel)}</strong>
												<span>ID {vessel.id} • {getVesselCompanyLabel(vessel)}</span>
												<small>{getVesselDeviceLabel(vessel)}</small>
											</div>

											<em>{cctvSelectedVessel?.id === vessel.id ? 'Selected' : 'Config'}</em>
										</button>
									{/each}
								{/if}
							</div>
						</aside>

						<main class="cctv-editor-panel">
							{#if !cctvSelectedVessel}
								<section class="reporting-empty-card">
									<h2>Select Vessel</h2>
									<p>
										Select a vessel on the left to create or update CCTV camera names and tokens.
									</p>
								</section>
							{:else}
								<div class="editor-toolbar">
									<div>
										<h2>{getVesselDisplayName(cctvSelectedVessel)}</h2>
										<p>
											{getVesselDeviceLabel(cctvSelectedVessel)} • ID {cctvSelectedVessel.id}
										</p>
									</div>

									<div class="detail-actions">
										<button
											type="button"
											class="ghost-button small"
											on:click={() => openCctvVessel(cctvSelectedVessel)}
											disabled={cctvConfigLoading}
										>
											Refresh Config
										</button>

										<button type="button" class="primary-button small" on:click={addCctvCamera}>
											+ Camera
										</button>
									</div>
								</div>

								<section class="cctv-config-card">
									<div class="reporting-section-head">
										<div>
											<h3>CCTV Camera Configuration</h3>
											<p>
												Each camera token must be exactly 32 characters. Saving will upsert the
												configuration.
											</p>
										</div>

										{#if cctvConfigMeta?.updatedAt}
											<small class="cctv-updated-meta">
												Updated {formatDate(cctvConfigMeta.updatedAt)}
											</small>
										{/if}
									</div>

									{#if cctvConfigLoading}
										<LoadingSkeleton label="Loading CCTV config" variant="admin-form" rows={4} />
									{:else}
										<div class="cctv-camera-list">
											{#each cctvForm.cameras as camera, index}
												<article class="cctv-camera-card">
													<div class="cctv-camera-head">
														<div>
															<span>Camera {index + 1}</span>
															<strong>{camera.camera_name || 'Unnamed camera'}</strong>
														</div>

														<button
															type="button"
															class="danger-button small"
															on:click={() => removeCctvCamera(camera.id)}
															disabled={cctvForm.cameras.length <= 1}
														>
															Remove
														</button>
													</div>

													<div class="form-grid cctv-camera-grid">
														<label>
															<span>Camera Name</span>
															<input
																type="text"
																value={camera.camera_name}
																placeholder="Front Camera"
																on:input={(event) =>
																	updateCctvCamera(
																		camera.id,
																		'camera_name',
																		event.currentTarget.value
																	)}
															/>
														</label>

														<label>
															<span>Camera Token</span>
															<div class="token-input-wrap">
																<input
																	type="text"
																	value={camera.camera_token}
																	maxlength="32"
																	placeholder="12345678901234567890123456789012"
																	on:input={(event) =>
																		updateCctvCamera(
																			camera.id,
																			'camera_token',
																			event.currentTarget.value
																		)}
																/>

																<button
																	type="button"
																	class="token-generate-btn"
																	on:click={() => generateCctvCameraToken(camera.id)}
																	title="Generate random token"
																	aria-label="Generate random token"
																>
																	⚂
																</button>
															</div>
															<small
																class:token-invalid={camera.camera_token.trim().length > 0 &&
																	camera.camera_token.trim().length !== 32}
															>
																{camera.camera_token.trim().length}/32 characters
															</small>
														</label>
													</div>
												</article>
											{/each}
										</div>

										<div class="editor-footer">
											<button type="button" class="ghost-button" on:click={addCctvCamera}>
												+ Add Camera
											</button>

											<button
												type="button"
												class="primary-button"
												on:click={saveCctvConfig}
												disabled={cctvConfigSaving}
											>
												{cctvConfigSaving ? 'Saving...' : 'Save CCTV Config'}
											</button>
										</div>
									{/if}
								</section>
							{/if}
						</main>
					</section>
				{:else if activeAdminTab === 'alarm'}
					<section class="reporting-admin-workspace">
						<aside class="reporting-vessel-panel">
							<div class="panel-title-row">
								<div>
									<h2>Alarm Vessels</h2>
									<p>{filteredReportingVessels.length} of {reportingVessels.length} vessel</p>
								</div>

								{#if reportingVesselsLoading}
									<LoadingSkeleton label="Loading alarm vessels" variant="inline" compact />
								{/if}
							</div>

							<div class="reporting-filter-box">
								<input
									type="search"
									bind:value={reportingFilters.search}
									placeholder="Search alarm vessel..."
								/>

								<select bind:value={reportingFilters.status}>
									<option value="all">All Status</option>
									<option value="online">Online</option>
									<option value="offline">Offline</option>
								</select>

								<button type="button" class="ghost-button small" on:click={loadAlarmVessels}>
									Apply
								</button>
							</div>

							<div class="reporting-vessel-list">
								{#if reportingVesselsLoading}
									<LoadingSkeleton
										label="Loading alarm vessels"
										variant="admin-entity-list"
										rows={6}
										compact
									/>
								{:else if filteredReportingVessels.length === 0}
									<div class="empty-box">Alarm vessel not found.</div>
								{:else}
									{#each filteredReportingVessels as vessel (vessel.id)}
										<button
											type="button"
											class:selected-user={selectedReportingVessel?.id === vessel.id}
											class="reporting-vessel-row"
											on:click={() => openReportingVessel(vessel, false)}
										>
											<div>
												<strong>{vessel.vessel_name || '-'}</strong>
												<span>ID {vessel.id} • {vessel.status || '-'}</span>
												<small>{vessel.deviceId || '-'}</small>
											</div>

											<em class:active-reporting={isEngineHealthEnabled(vessel)}>
												{isEngineHealthEnabled(vessel) ? 'Health On' : 'Health Off'}
											</em>
										</button>
									{/each}
								{/if}
							</div>
						</aside>

						<main class="reporting-editor-panel">
							<div class="editor-toolbar">
								<div>
									<h2>Alarm Configuration</h2>
									<p>
										Configure engine health alarms per vessel and Telegram alarm group routing in a
										separate tab.
									</p>
								</div>
							</div>

							{#if !selectedReportingVessel}
								<section class="reporting-empty-card">
									<h2>Select Vessel</h2>
									<p>Select a vessel on the left to configure the Engine Health Alarm.</p>
								</section>
							{:else}
								<section class="reporting-section-card">
									<div class="reporting-section-head">
										<div>
											<h3>Engine Health Alarm</h3>
											<p>Thresholds for the ENGINE_HEALTH alarm.</p>
										</div>

										<label class="switch-line">
											<input type="checkbox" bind:checked={engineHealthForm.isEnabled} />
											<span>{engineHealthForm.isEnabled ? 'Enabled' : 'Disabled'}</span>
										</label>
									</div>

									<div class="form-grid health-grid">
										<label>
											<span>Oil Pressure Min</span>
											<input
												type="number"
												step="0.1"
												bind:value={engineHealthForm.oilPressureMin}
											/>
										</label>

										<label>
											<span>Oil Pressure Max</span>
											<input
												type="number"
												step="0.1"
												bind:value={engineHealthForm.oilPressureMax}
											/>
										</label>

										<label>
											<span>Oil Temp Max</span>
											<input
												type="number"
												step="0.1"
												bind:value={engineHealthForm.oilTemperatureMax}
											/>
										</label>

										<label>
											<span>Coolant Temp Min</span>
											<input
												type="number"
												step="0.1"
												bind:value={engineHealthForm.coolantTemperatureMin}
											/>
										</label>

										<label>
											<span>Coolant Temp Max</span>
											<input
												type="number"
												step="0.1"
												bind:value={engineHealthForm.coolantTemperatureMax}
											/>
										</label>
									</div>

									<div class="editor-footer">
										<button
											type="button"
											class="primary-button"
											on:click={saveEngineHealthConfig}
											disabled={reportingSaving}
										>
											Save Engine Health
										</button>
									</div>
								</section>
							{/if}

							<section class="reporting-section-card">
								<div class="reporting-section-head">
									<div>
										<h3>Telegram Alarm Groups</h3>
										<p>Route alarm notifications to Telegram groups.</p>
									</div>

									<button
										type="button"
										class="ghost-button small"
										on:click={openCreateTelegramGroupForm}
									>
										+ New Group
									</button>
								</div>

								<div class="telegram-layout">
									<div class="telegram-list">
										{#if telegramGroupsLoading}
											<LoadingSkeleton
												label="Loading Telegram groups"
												variant="admin-compact-list"
												rows={4}
											/>
										{:else if telegramGroups.length === 0}
											<div class="empty-box">No Telegram groups are available yet.</div>
										{:else}
											{#each telegramGroups as group}
												<button
													type="button"
													class:selected-user={selectedTelegramGroup?.id === group.id}
													class="telegram-row"
													on:click={() => openEditTelegramGroupForm(group)}
												>
													<div>
														<strong>{group.name || '-'}</strong>
														<small>{group.chatId || '-'}</small>
													</div>

													<em class:active-reporting={group.isActive}>
														{group.isActive ? 'Active' : 'Inactive'}
													</em>
												</button>
											{/each}
										{/if}
									</div>

									<div class="telegram-form-card">
										<div class="form-grid telegram-form-grid">
											<label>
												<span>Group Name</span>
												<input
													type="text"
													bind:value={telegramForm.name}
													placeholder="Semar Alarm"
												/>
											</label>

											<label>
												<span>Chat ID</span>
												<input
													type="text"
													bind:value={telegramForm.chatId}
													placeholder="-5222391022"
												/>
											</label>

											<label class="switch-line boxed-switch">
												<input type="checkbox" bind:checked={telegramForm.isActive} />
												<span>{telegramForm.isActive ? 'Active' : 'Inactive'}</span>
											</label>
										</div>

										<div class="telegram-vessel-picker">
											<div class="picker-head">
												<div>
													<span>Vessel Access</span>
													<small>{telegramForm.vesselIds.length} vessels selected</small>
												</div>

												<input
													type="search"
													bind:value={telegramVesselSearch}
													placeholder="Search vessel..."
												/>
											</div>

											{#if telegramForm.vesselIds.length > 0}
												<div class="selected-recipient-list">
													{#each telegramForm.vesselIds as vesselId (vesselId)}
														<span class="selected-pill">
															{getTelegramVesselName(vesselId)}
															<button
																type="button"
																on:click={() => toggleTelegramVessel(vesselId, false)}
															>
																×
															</button>
														</span>
													{/each}
												</div>
											{/if}

											<div class="option-list telegram-vessel-list">
												{#if telegramVesselOptions.length === 0}
													<div class="empty-box">Vessel list is not available yet.</div>
												{:else if filteredTelegramVesselOptions.length === 0}
													<div class="empty-box">Vessel not found.</div>
												{:else}
													{#each filteredTelegramVesselOptions as vessel (vessel.id)}
														<label class="option-chip">
															<input
																type="checkbox"
																checked={hasTelegramVessel(vessel.id, telegramForm.vesselIds)}
																on:change={(event) =>
																	toggleTelegramVessel(vessel.id, event.currentTarget.checked)}
															/>
															<span>
																<strong>{vessel.label}</strong>
																<small>
																	ID {vessel.id}{vessel.sublabel ? ` • ${vessel.sublabel}` : ''}
																</small>
															</span>
														</label>
													{/each}
												{/if}
											</div>
										</div>

										<div class="alarm-key-grid">
											{#each alarmKeyOptions as alarmKey}
												<label class="option-chip">
													<input
														type="checkbox"
														checked={telegramForm.alarmKeys.includes(alarmKey)}
														on:change={() => toggleTelegramAlarmKey(alarmKey)}
													/>
													<span>
														<strong>{alarmKey}</strong>
													</span>
												</label>
											{/each}
										</div>

										<div class="editor-footer">
											{#if telegramMode === 'edit' && selectedTelegramGroup}
												<button
													type="button"
													class="danger-button"
													on:click={() => deleteTelegramGroup(selectedTelegramGroup)}
													disabled={telegramActionLoadingId === selectedTelegramGroup.id}
												>
													Delete
												</button>
											{/if}

											<button
												type="button"
												class="ghost-button"
												on:click={openCreateTelegramGroupForm}
											>
												Reset
											</button>

											<button
												type="button"
												class="primary-button"
												on:click={saveTelegramGroup}
												disabled={telegramSaving}
											>
												{telegramSaving
													? 'Saving...'
													: telegramMode === 'create'
														? 'Create Group'
														: 'Save Group'}
											</button>
										</div>
									</div>
								</div>
							</section>
						</main>
					</section>
				{:else if activeAdminTab === 'global-audit-logs'}
					<section class="global-audit-workspace">
						<section class="global-audit-panel">
							<div class="global-audit-header">
								<div>
									<h2>Global Audit Logs</h2>
									<p>
										Display all admin/user audit activities globally. The list can be filtered by
										User ID.
									</p>
								</div>

								<div class="detail-actions">
									<button
										type="button"
										class="ghost-button small"
										on:click={() => loadGlobalAuditLogs(globalAuditFilters.page)}
										disabled={globalAuditLoading}
									>
										Refresh
									</button>

									<button
										type="button"
										class="primary-button small"
										on:click={exportGlobalAuditCsv}
										disabled={globalAuditExporting}
									>
										{globalAuditExporting ? 'Exporting...' : 'Export CSV'}
									</button>
								</div>
							</div>

							<div class="global-audit-filter-card">
								<label>
									<span>User ID</span>
									<input
										type="number"
										bind:value={globalAuditFilters.userId}
										placeholder="Leave blank for all users"
									/>
								</label>

								<label>
									<span>Page Size</span>
									<select bind:value={globalAuditFilters.pageSize}>
										<option value="20">20</option>
										<option value="50">50</option>
										<option value="100">100</option>
									</select>
								</label>

								<label>
									<span>Export Start Date</span>
									<input
										type="date"
										use:fourDigitDateYear
										bind:value={globalAuditFilters.startDate}
									/>
								</label>

								<label>
									<span>Export End Date</span>
									<input
										type="date"
										use:fourDigitDateYear
										bind:value={globalAuditFilters.endDate}
									/>
								</label>

								<div class="global-audit-filter-actions">
									<button type="button" class="ghost-button" on:click={resetGlobalAuditFilters}>
										Reset
									</button>

									<button type="button" class="primary-button" on:click={applyGlobalAuditFilters}>
										Apply Filter
									</button>
								</div>
							</div>

							<div class="global-audit-table-card">
								<div class="global-audit-table-head">
									<div>
										<strong>{globalAuditPagination.totalItems || 0}</strong>
										<span>Total logs</span>
									</div>

									<div>
										<strong>{globalAuditPagination.page || 1}</strong>
										<span>Page of {globalAuditPagination.totalPages || 1}</span>
									</div>
								</div>

								{#if globalAuditLoading}
									<LoadingSkeleton
										label="Loading global audit logs"
										variant="admin-global-audit-table"
										rows={6}
										columns={5}
									/>
								{:else if globalAuditLogs.length === 0}
									<div class="empty-box">Audit log not found.</div>
								{:else}
									<div class="global-audit-table-wrap">
										<table>
											<thead>
												<tr>
													<th>Time</th>
													<th>User</th>
													<th>Action</th>
													<th>Module</th>
													<th>Log ID</th>
												</tr>
											</thead>

											<tbody>
												{#each globalAuditLogs as log}
													<tr>
														<td>{formatDate(log.logged_at)}</td>
														<td>
															<strong>{log.user?.username || '-'}</strong>
															<small>ID {log.user?.user_id ?? '-'}</small>
														</td>
														<td>
															<span
																class:create-action={log.action === 'CREATE'}
																class:update-action={log.action === 'UPDATE'}
																class:delete-action={log.action === 'DELETE'}
																class="action-badge"
															>
																{log.action || '-'}
															</span>
														</td>
														<td>{log.module || '-'}</td>
														<td><code>{log.id || '-'}</code></td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>

									<div class="global-audit-pagination">
										<button
											type="button"
											class="ghost-button small"
											on:click={() => goToGlobalAuditPage((globalAuditPagination.page || 1) - 1)}
											disabled={!globalAuditPagination.hasPrevious || globalAuditLoading}
										>
											Previous
										</button>

										<span>
											Page {globalAuditPagination.page || 1} / {globalAuditPagination.totalPages ||
												1}
										</span>

										<button
											type="button"
											class="ghost-button small"
											on:click={() => goToGlobalAuditPage((globalAuditPagination.page || 1) + 1)}
											disabled={!globalAuditPagination.hasNext || globalAuditLoading}
										>
											Next
										</button>
									</div>
								{/if}
							</div>
						</section>
					</section>
				{/if}
			</div>
		{/key}
	{/if}
</section>
