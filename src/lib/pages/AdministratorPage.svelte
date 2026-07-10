<script>
	import { onMount, tick } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { getCurrentUserApi } from '$lib/api/authApi.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import {
		getPermissionCatalogApi,
		getAllUsersApi,
		getUserDetailApi,
		createUserApi,
		updateUserApi,
		deactivateUserApi,
		activateUserApi,
		getAllVesselsAdminApi,
		createVesselAdminApi,
		updateVesselAdminApi,
		updateVesselHireStatusAdminApi,
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
		saveAutoReportConfigAdminApi,
		getReportingAssignableUsersAdminApi,
		downloadReportingDailyReportAdminApi,
		sendReportingDailyReportEmailAdminApi,
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
	let engineCurveFileInput;

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
		'view_liter_per_nautical_mile_table',
		'view_high_rpm_outside_safety_zone_table',
		'view_high_rpm_low_speed_table'
	];

	const REPORT_CONTENT_FALLBACK_LABELS = {
		view_engine_runtime_table: 'Engine Runtime Table',
		view_engine_event_status_history: 'Engine Event Status History',
		view_engine_on_off_chart: 'Engine On/Off Chart',
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
		view_liter_per_nautical_mile_table: 'Liter per Nautical Mile Table',
		view_high_rpm_outside_safety_zone_table: 'High RPM Outside Safety Zone Table',
		view_high_rpm_low_speed_table: 'High RPM Low Speed Table'
	};

	let autoReportForm = {
		isEnabled: false,
		sendTime: '08:00',
		timezoneMode: 'auto',
		timezoneOffset: '+07:00',
		reportSections: [],
		picEmails: [],
		ccEmails: [],
		bccEmails: []
	};

	let manualReportDate = new Date().toISOString().slice(0, 10);

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
		return vessel?.vessel_name || vessel?.vesselName || vessel?.name || `Vessel ${vessel?.id || '-'}`;
	}

	function getVesselDeviceLabel(vessel) {
		return vessel?.deviceId || vessel?.device_id || vessel?.deviceName || vessel?.thingsboardName || '-';
	}

	function getVesselHireStatus(vessel) {
		const value =
			vessel?.hireStatus ??
			vessel?.hire_status ??
			vessel?.onHire ??
			vessel?.on_hire ??
			false;

		if (typeof value === 'string') {
			const normalized = value.trim().toLowerCase();
			return ['true', '1', 'on', 'on hire', 'on_hire', 'active'].includes(normalized);
		}

		return Boolean(value);
	}

	function getVesselHireValue(vessel) {
		return getVesselHireStatus(vessel) ? 'true' : 'false';
	}

	function getVesselHireLabel(vesselOrValue) {
		const isOnHire =
			typeof vesselOrValue === 'string'
				? vesselOrValue === 'true'
				: getVesselHireStatus(vesselOrValue);

		return isOnHire ? 'On Hire' : 'Off Hire';
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
		const company = getCompanyById(companyId);

		if (company) return `${getCompanyDisplayName(company)} • ID ${company.id}`;
		if (companyId) return `Company ID ${companyId}`;

		return 'No Company';
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
			content?.sections ||
			content?.permissions ||
			value?.sections ||
			value?.reportSections ||
			[];

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
		const target = String(email || '').trim().toLowerCase();

		if (!field || !target) return false;

		return (autoReportForm[field] || []).some(
			(item) => String(item || '').trim().toLowerCase() === target
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

	function hasTelegramVessel(vesselId) {
		const target = Number(vesselId);

		return normalizeIds(telegramForm.vesselIds).includes(target);
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

	$: telegramVesselOptions = (vessels.length ? vessels : reportingVessels).map((vessel) => ({
		id: Number(vessel?.id),
		label: getVesselDisplayName(vessel),
		sublabel: getVesselDeviceLabel(vessel),
		status: vessel?.status || ''
	})).filter((vessel) => Number.isFinite(vessel.id) && vessel.id > 0);

	$: filteredTelegramVesselOptions = telegramVesselOptions.filter((vessel) => {
		const keyword = telegramVesselSearch.trim().toLowerCase();

		if (!keyword) return true;

		return [vessel.id ? String(vessel.id) : '', vessel.label, vessel.sublabel, vessel.status]
			.filter(Boolean)
			.some((value) => String(value).toLowerCase().includes(keyword));
	});

	$: filteredReportingAssignableUsers = reportingAssignableUsers.filter((user) => {
		const keyword = reportingAssignableSearch.trim().toLowerCase();

		if (!keyword) return true;

		return [user?.fullName, user?.name, user?.username, user?.email, user?.id ? String(user.id) : '']
			.filter(Boolean)
			.some((value) => String(value).toLowerCase().includes(keyword));
	});

	function nullableNumber(value) {
		const text = String(value ?? '').trim();

		if (!text) return null;

		const number = Number(text);

		return Number.isFinite(number) ? number : null;
	}

	async function loadReportingVessels() {
		reportingVesselsLoading = true;

		try {
			reportingVessels = await getReportingVesselsAdminApi(reportingFilters);

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

	$: activeAdminTab, adminTabsElement, scheduleAdminTabIndicatorUpdate();

	function openReportingVessel(vessel, shouldLoadAssignableUsers = true, shouldClearAlert = true) {
		selectedReportingVessel = vessel;
		reportingAssignableSearch = '';

		const autoReport = getAutoReportConfig(vessel);
		const recipients = autoReport?.recipients || {};
		const engineHealth = getEngineHealthConfig(vessel);

		autoReportForm = {
			isEnabled: Boolean(autoReport.is_enabled ?? autoReport.isEnabled),
			sendTime: autoReport.send_time || autoReport.sendTime || '08:00',
			timezoneMode: autoReport.timezone_mode || autoReport.timezoneMode || 'auto',
			timezoneOffset: autoReport.timezone_offset || autoReport.timezoneOffset || '+07:00',
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
		return {
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
			timezoneMode: autoReportForm.timezoneMode || 'auto',
			timezoneOffset: autoReportForm.timezoneOffset || '+07:00'
		};
	}

	function validateAutoReportPayload(payload) {
		if (!/^\d{2}:\d{2}$/.test(payload.sendTime || '')) {
			return 'Send time format must be HH:mm, for example 08:00.';
		}

		if (!['auto', 'manual'].includes(payload.timezoneMode)) {
			return 'Timezone mode must be auto or manual.';
		}

		if (!/^[+-](0\d|1[0-4]):[0-5]\d$/.test(payload.timezoneOffset || '')) {
			return 'Timezone offset must use the format +07:00, -03:00, up to +14:00.';
		}

		if (payload.isEnabled && payload.recipients.pic.length === 0) {
			return 'At least 1 PIC recipient is required when auto-report is enabled.';
		}

		return null;
	}

	async function saveAutoReportConfig() {
		if (!selectedReportingVessel?.id) {
			showAlert('error', 'Please select a vessel first.');
			return;
		}

		const payload = buildAutoReportPayload();
		const errorMessage = validateAutoReportPayload(payload);

		if (errorMessage) {
			showAlert('error', errorMessage);
			return;
		}

		reportingSaving = true;
		clearAlert();

		try {
			const response = await saveAutoReportConfigAdminApi(selectedReportingVessel.id, payload);
			const savedConfig = unwrapApiData(response);

			showAlert('success', 'Auto-report configuration saved successfully.');

			selectedReportingVessel = {
				...selectedReportingVessel,
				auto_report: {
					...(selectedReportingVessel.auto_report || {}),
					...savedConfig,
					is_enabled: savedConfig?.isEnabled ?? payload.isEnabled,
					send_time: savedConfig?.sendTime ?? payload.sendTime,
					timezone_mode: savedConfig?.timezoneMode ?? payload.timezoneMode,
					timezone_offset: savedConfig?.timezoneOffset ?? payload.timezoneOffset,
					recipients: savedConfig?.recipients ?? payload.recipients,
					report_content: savedConfig?.report_content ?? savedConfig?.reportContent ?? payload.reportContent
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

	function createEmptyEngineCurveForm() {
		return {
			vesselId: '',
			curveType: 'engine_maker',
			curveName: '',
			file: null,
			fileName: '',
			activateAfterImport: false
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

		return [
			getCurveId(curve),
			curve?.vessel_id,
			curve?.vessel_name,
			curve?.curve_type,
			curve?.curve_name,
			curve?.meta?.source_file_path
		]
			.filter(Boolean)
			.some((value) => String(value).toLowerCase().includes(keyword));
	});

	function getCurveId(curve) {
		return curve?.curve_id || curve?.curveId || curve?.id || '';
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

	const assetTypeOptions = ['buoy', 'whp', 'jetty', 'shipyard', 'mess', 'office', 'fso', 'anchor', 'rig'];

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

	$: filteredAssets = assets.filter((asset) => {
		const keyword = searchAsset.trim().toLowerCase();

		if (!keyword) return true;

		return [
			asset?.id ? String(asset.id) : '',
			asset?.assetId,
			asset?.assetName,
			getAssetType(asset),
			asset?.thingsboardName
		]
			.filter(Boolean)
			.some((value) => String(value).toLowerCase().includes(keyword));
	});

	function createEmptyVesselForm() {
		return {
			deviceId: '',
			vesselName: '',
			companyId: '',
			hireStatus: 'false'
		};
	}

	let vesselForm = createEmptyVesselForm();

	$: filteredVessels = vessels.filter((vessel) => {
		const keyword = searchVessel.trim().toLowerCase();

		if (!keyword) return true;

		const company = getCompanyById(vessel?.companyId ?? vessel?.company_id);

		return [
			vessel?.id ? String(vessel.id) : '',
			vessel?.deviceId,
			vessel?.vesselName,
			vessel?.companyId ? String(vessel.companyId) : '',
			company?.name,
			getCompanyThingsboardId(company),
			getVesselHireLabel(vessel)
		]
			.filter(Boolean)
			.some((value) => String(value).toLowerCase().includes(keyword));
	});

	$: filteredCctvVessels = vessels.filter((vessel) => {
		const keyword = cctvSearchVessel.trim().toLowerCase();

		if (!keyword) return true;

		const company = getCompanyById(vessel?.companyId ?? vessel?.company_id);

		return [
			vessel?.id ? String(vessel.id) : '',
			vessel?.deviceId,
			vessel?.vesselName,
			getVesselDisplayName(vessel),
			getVesselDeviceLabel(vessel),
			getCompanyDisplayName(company)
		]
			.filter(Boolean)
			.some((value) => String(value).toLowerCase().includes(keyword));
	});

	$: if (activeAdminTab === 'cctv-config' && !cctvSelectedVessel && vessels.length && !cctvConfigLoading) {
		openCctvVessel(vessels[0]);
	}

	$: filteredCompanies = companies.filter((company) => {
		const keyword = searchCompany.trim().toLowerCase();

		if (!keyword) return true;

		return [
			company?.id ? String(company.id) : '',
			getCompanyDisplayName(company),
			getCompanyThingsboardId(company)
		]
			.filter(Boolean)
			.some((value) => String(value).toLowerCase().includes(keyword));
	});

	let assetOptions = [];
	let vesselOptions = [];

	let selectedUser = null;
	let mode = 'create';

	let searchUser = '';
	let searchPermission = '';
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
				label: formatReportContentLabel(permission.label || REPORT_CONTENT_FALLBACK_LABELS[key] || key),
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

		return [user?.name, user?.username, user?.email, user?.id ? String(user.id) : '']
			.filter(Boolean)
			.some((value) => String(value).toLowerCase().includes(keyword));
	});

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
		scheduleAdminTabIndicatorUpdate();
	}

	async function loadCurrentUser() {
		try {
			const response = await getCurrentUserApi();
			const data = response?.data || response;

			currentUser = data;

			const assetDetails = data?.assetAccess?.details || [];
			const vesselDetails = data?.vesselAccess?.details || [];

			assetOptions = assetDetails.map((asset) => ({
				id: Number(asset.id),
				label: asset.assetName || asset.thingsboardName || asset.assetId || `Asset ${asset.id}`,
				sublabel: [
					getAssetType(asset) ? formatAssetType(getAssetType(asset)) : '',
					asset.thingsboardName || asset.assetId || ''
				]
					.filter(Boolean)
					.join(' • ')
			}));

			vesselOptions = vesselDetails.map((vessel) => ({
				id: Number(vessel.id),
				label: vessel.vesselName || vessel.deviceName || vessel.deviceId || `Vessel ${vessel.id}`,
				sublabel: vessel.deviceName || vessel.deviceId || ''
			}));
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

			vesselOptions = vessels.map((vessel) => ({
				id: Number(vessel.id),
				label: vessel.vesselName || vessel.deviceName || vessel.deviceId || `Vessel ${vessel.id}`,
				sublabel: vessel.deviceId || ''
			}));
		} finally {
			vesselsLoading = false;
		}
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
				showAlert('error', `CCTV config for ${getVesselDisplayName(vessel)} is not found yet. Fill the form to create it.`);
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
				detailText || getApiMessage(response, 'Companies, vessels, and engines synchronized successfully.')
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
		vesselMode = 'create';
		selectedVessel = null;
		vesselForm = createEmptyVesselForm();
		clearAlert();
	}

	function openEditVesselForm(vessel) {
		if (!vessel?.id) return;

		vesselMode = 'edit';
		selectedVessel = vessel;

		vesselForm = {
			deviceId: vessel?.deviceId || '',
			vesselName: vessel?.vesselName || '',
			companyId: vessel?.companyId ?? '',
			hireStatus: getVesselHireValue(vessel)
		};

		clearAlert();
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
			companyId: companyIdText ? Number(companyIdText) : null
		};
	}

	function buildVesselHirePayload() {
		return vesselForm.hireStatus === 'true';
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
			const hireStatus = buildVesselHirePayload();

			if (vesselMode === 'create') {
				const created = await createVesselAdminApi(payload);
				const createdId = created?.id;

				if (createdId && hireStatus) {
					await updateVesselHireStatusAdminApi(createdId, hireStatus);
				}

				showAlert(
					'success',
					'Vessel created successfully. Engines will be automatically extracted from ThingsBoard telemetry.'
				);

				await loadVessels();
				const refreshed = vessels.find((vessel) => Number(vessel?.id) === Number(createdId)) || created;
				openEditVesselForm(refreshed);
			} else if (selectedVessel?.id) {
				const updated = await updateVesselAdminApi(selectedVessel.id, payload);
				const currentHireStatus = getVesselHireStatus(selectedVessel);

				if (currentHireStatus !== hireStatus) {
					await updateVesselHireStatusAdminApi(selectedVessel.id, hireStatus);
				}

				showAlert(
					'success',
					'Vessel updated successfully. If the Device ID changes, engines will be refreshed automatically.'
				);

				await loadVessels();
				const refreshed =
					vessels.find((vessel) => Number(vessel?.id) === Number(selectedVessel.id)) || updated;
				openEditVesselForm(refreshed);
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
				id: Number(asset.id),
				label: asset.assetName || asset.thingsboardName || asset.assetId || `Asset ${asset.id}`,
				sublabel: [
					getAssetType(asset) ? formatAssetType(getAssetType(asset)) : '',
					asset.assetId || asset.thingsboardName || ''
				]
					.filter(Boolean)
					.join(' • ')
			}));
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
		engineCurveForm = createEmptyEngineCurveForm();

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
		clearAlert();

		const errorMessage = validateEngineCurveForm();

		if (errorMessage) {
			showAlert('error', errorMessage);
			return;
		}

		engineCurveSaving = true;

		try {
			const fileBase64 = await fileToBase64(engineCurveForm.file);

			const payload = {
				vesselId: Number(engineCurveForm.vesselId),
				curveType: engineCurveForm.curveType,
				curveName: engineCurveForm.curveName.trim(),
				fileBase64,
				fileName: engineCurveForm.fileName || engineCurveForm.file.name,
				activateAfterImport: Boolean(engineCurveForm.activateAfterImport)
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
		clearAlert();

		try {
			selectedEngineCurve = curve;
			selectedEngineCurveDetail = await getEngineCurveDetailAdminApi(curveId);
		} catch (error) {
			showAlert('error', error.message || 'Failed to load engine curve details.');
		} finally {
			selectedEngineCurveLoading = false;
		}
	}

	async function toggleEngineCurve(curve) {
		const curveId = getCurveId(curve);

		if (!curveId) return;

		const nextStatus = !Boolean(curve?.is_active);

		const confirmed = window.confirm(
			nextStatus
				? `Activate curve "${curve.curve_name}"? Other curves with the same type on this vessel will be deactivated.`
				: `Deactivate curve "${curve.curve_name}"?`
		);

		if (!confirmed) return;

		engineCurveActionLoadingId = curveId;
		clearAlert();

		try {
			await toggleEngineCurveActiveAdminApi(curveId, nextStatus);

			showAlert(
				'success',
				nextStatus ? 'Engine curve activated successfully.' : 'Engine curve deactivated successfully.'
			);

			await loadEngineCurves();

			if (selectedEngineCurve && getCurveId(selectedEngineCurve) === curveId) {
				await openEngineCurveDetail({
					...curve,
					is_active: nextStatus
				});
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

		if (mode === 'edit' && form.assetAccessMode === 'selected' && parseIds(form.assetIdsText).length === 0) {
			return 'Selected asset access mode requires at least 1 asset ID.';
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

		// The latest POST /users API endpoint does not accept assetAccess.
		// Asset access is only sent during edit/update so user creation does not fail with 400 Invalid fields.
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

			if (mode === 'create') {
				const response = await createUserApi(payload);
				const created = unwrapApiData(response);

				await loadUsers();

				if (created?.id) {
					await openEditForm({ id: created.id });
				}

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
	<section class="admin-header-card">
		<div>
			<div class="page-kicker">Super Admin</div>
			<h1>Administrator Management</h1>
			<p>
				Manage user accounts, vessel access, asset access, module permissions, and vessel registries from one page.
			</p>
		</div>

		<div class="header-actions">
			<button class="ghost-button" type="button" on:click={initializePage} disabled={bootLoading}>
				Refresh
			</button>

			{#if activeAdminTab === 'users'}
				<button class="primary-button" type="button" on:click={openCreateForm}> + New User </button>
			{:else if activeAdminTab === 'vessels'}
				<button class="primary-button" type="button" on:click={openCreateVesselForm}>
					+ New Vessel
				</button>
			{:else if activeAdminTab === 'assets'}
				<button class="primary-button" type="button" on:click={openCreateAssetForm}>
					+ New Asset
				</button>
			{:else if activeAdminTab === 'engine-curves'}
				<button class="primary-button" type="button" on:click={downloadEngineCurveTemplate}>
					Download Template
				</button>
			{/if}
		</div>
	</section>

	{#if alert}
		<div
			class:success-alert={alert.type === 'success'}
			class:error-alert={alert.type === 'error'}
			class="alert-card"
		>
			<span>{alert.message}</span>
			<button type="button" on:click={clearAlert}>×</button>
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
			<button
				type="button"
				class:active-tab={activeAdminTab === 'alarm'}
				on:click={openAlarmTab}
			>
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
							<LoadingSkeleton label="Loading users" variant="admin-entity-list" rows={6} compact />
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
								placeholder={mode === 'create' ? 'User password' : 'Enter only to change the password'}
								autocomplete="new-password"
							/>

							{#if mode === 'edit'}
								<small class="field-help"> Leave blank if you do not want to change the password. </small>
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
									<div class="option-list">
										{#each assetOptions as asset}
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
								{:else}
									<div class="muted-box">
										Asset list is not available from the current user. Enter the asset ID manually.
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
									<div class="option-list">
										{#each vesselOptions as vessel}
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
								{:else}
									<div class="muted-box">
										Vessel list is not available from the current user. Enter the vessel ID manually.
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

								<button type="button" class="ghost-button small" on:click={selectAllPermissions}>
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
								<LoadingSkeleton label="Loading permission catalog" variant="admin-permission-catalog" rows={5} />
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

					<input
						class="search-input"
						type="search"
						bind:value={searchVessel}
						placeholder="Search vessel, device ID, company name..."
					/>

					<div class="vessel-list">
						{#if vesselsLoading}
							<LoadingSkeleton label="Loading vessels" variant="admin-entity-list" rows={6} compact />
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
								<input type="text" bind:value={vesselForm.vesselName} placeholder="Test Vessel 8" />
							</label>

							<label>
								<span>Company</span>
								<select bind:value={vesselForm.companyId} disabled={companiesLoading}>
									<option value="">No Company</option>
									{#each companies as company}
										<option value={String(company.id)}>
											{getCompanyDisplayName(company)} — ID {company.id}
										</option>
									{/each}
								</select>
								<small class="field-help">Load the company list from GET /companies.</small>
							</label>

							<label>
								<span>Hire Status</span>
								<select bind:value={vesselForm.hireStatus}>
									<option value="true">On Hire</option>
									<option value="false">Off Hire</option>
								</select>
							</label>
						</div>

						<div class="vessel-note">
							<strong>Note:</strong>
							Company is loaded from <code>GET /companies</code>. The <code>Sync Companies</code> button runs <code>POST /companies/sync</code>, while <code>Sync All</code> runs <code>POST /vessels/sync/all</code> to synchronize companies, vessels, and engines sequentially from ThingsBoard.
						</div>

						<div class="editor-footer">
							{#if vesselMode === 'edit' && selectedVessel}
								<button
									type="button"
									class="danger-button"
									on:click={() => deleteVessel(selectedVessel)}
									disabled={vesselActionLoadingId === selectedVessel.id}
								>
									{vesselActionLoadingId === selectedVessel.id ? 'Deleting...' : 'Delete Vessel'}
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

					<section class="company-registry-card">
						<div class="company-registry-head">
							<div>
								<h3>Company Registry</h3>
								<p>{filteredCompanies.length} of {companies.length} local companies</p>
							</div>

							<div class="company-actions">
								<button
									type="button"
									class="ghost-button small"
									on:click={loadCompanies}
									disabled={companiesLoading}
								>
									Refresh
								</button>

								<button
									type="button"
									class="primary-button small"
									on:click={syncCompanies}
									disabled={companiesSyncing}
								>
									{companiesSyncing ? 'Syncing...' : 'Sync Companies'}
								</button>
							</div>
						</div>

						<input
							class="search-input"
							type="search"
							bind:value={searchCompany}
							placeholder="Search company name or ThingsBoard ID..."
						/>

						{#if companiesLoading}
							<LoadingSkeleton label="Loading companies" variant="admin-compact-list" rows={4} />
						{:else if filteredCompanies.length === 0}
							<div class="empty-box">Company not found.</div>
						{:else}
							<div class="company-list">
								{#each filteredCompanies as company}
									<article class="company-row">
										<div>
											<strong>{getCompanyDisplayName(company)}</strong>
											<span>ID {company.id}</span>
											<small>{getCompanyThingsboardId(company)}</small>
										</div>

										<button
											type="button"
											class="danger-button small"
											on:click={() => deleteCompany(company)}
											disabled={companyActionLoadingId === company.id}
										>
											{companyActionLoadingId === company.id ? 'Deleting...' : 'Delete'}
										</button>
									</article>
								{/each}
							</div>
						{/if}
					</section>

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
						placeholder="Search asset name, asset ID, type..."
					/>

					<div class="asset-list">
						{#if assetsLoading}
							<LoadingSkeleton label="Loading assets" variant="admin-entity-list" rows={6} compact />
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
											<span class:empty-asset-type={!getAssetType(asset)} class="asset-type-badge">
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
										<option value={assetForm.assetType}>Current: {formatAssetType(assetForm.assetType)}</option>
									{/if}
									{#each assetTypeOptions as type}
										<option value={type}>{formatAssetType(type)}</option>
									{/each}
								</select>
							</label>
						</div>

						<div class="asset-note">
							<strong>Note:</strong>
							the asset backend accepts <code>assetId</code>, <code>assetName</code>, and <code>assetType</code>. Make sure <code>assetId</code> matches the Asset ID from ThingsBoard.
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
								{assetSaving ? 'Saving...' : assetMode === 'create' ? 'Create Asset' : 'Save Asset'}
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
							<LoadingSkeleton label="Loading engine curves" variant="admin-entity-list" rows={6} compact />
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
								Download the template for the selected vessel, fill in the Excel file, then import it as an engine maker or EMS curve.
							</p>
						</div>
					</div>

					<section class="engine-curve-form-card">
						<div class="form-grid engine-curve-form-grid">
							<label>
								<span>Vessel</span>
								<select bind:value={engineCurveForm.vesselId}>
									<option value="">Select vessel</option>
									{#each vessels as vessel}
										<option value={vessel.id}>
											{vessel.vesselName || `Vessel ${vessel.id}`} — ID {vessel.id}
										</option>
									{/each}
								</select>
							</label>

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
							the template must be generated from the same vessel. Main Engines support RPM ranges, while Auxiliary Engines use one fixed L/H value on the first row.
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
							<LoadingSkeleton label="Loading engine curve details" variant="admin-engine-curve-detail" />
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
									<button
										type="button"
										class="ghost-button small"
										on:click={() => toggleEngineCurve(selectedEngineCurve)}
										disabled={engineCurveActionLoadingId === getCurveId(selectedEngineCurve)}
									>
										{selectedEngineCurve?.is_active ? 'Deactivate' : 'Activate'}
									</button>

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
									<span>Source File</span>
									<strong>{selectedEngineCurveDetail.meta?.source_file_path || '-'}</strong>
								</article>

								<article>
									<span>Uploaded At</span>
									<strong>{formatDate(selectedEngineCurveDetail.meta?.uploaded_at)}</strong>
								</article>
							</div>

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
							<p>{reportingVessels.length} vessel</p>
						</div>

						{#if reportingVesselsLoading}
							<LoadingSkeleton label="Loading reporting vessels" variant="inline" compact />
						{/if}
					</div>

					<div class="reporting-filter-box">
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
							<LoadingSkeleton label="Loading reporting vessels" variant="admin-entity-list" rows={6} compact />
						{:else if reportingVessels.length === 0}
							<div class="empty-box">Reporting vessel not found.</div>
						{:else}
							{#each reportingVessels as vessel}
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
										{isAutoReportEnabled(vessel) ? 'Auto On' : 'Auto Off'}
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
								Select a vessel on the left to configure auto-report and manual daily report.
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
									<h3>Auto Daily Report Email</h3>
									<p>Configure recipients, send time, timezone, and auto-report status.</p>
								</div>

								<label class="switch-line">
									<input type="checkbox" bind:checked={autoReportForm.isEnabled} />
									<span>{autoReportForm.isEnabled ? 'Enabled' : 'Disabled'}</span>
								</label>
							</div>

							<div class="form-grid reporting-form-grid">
								<label>
									<span>Send Time</span>
									<input type="time" bind:value={autoReportForm.sendTime} />
								</label>

								<label>
									<span>Timezone Mode</span>
									<select bind:value={autoReportForm.timezoneMode}>
										<option value="auto">Auto</option>
										<option value="manual">Manual</option>
									</select>
								</label>

								<label>
									<span>Timezone Offset</span>
									<input
										type="text"
										bind:value={autoReportForm.timezoneOffset}
										placeholder="+07:00"
									/>
								</label>
							</div>

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
										<button type="button" class="ghost-button small" on:click={selectAllReportContentSections}>
											Select All
										</button>
										<button type="button" class="ghost-button small" on:click={clearReportContentSections}>
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
									<LoadingSkeleton label="Loading report content catalog" variant="admin-compact-list" rows={4} />
								{:else if visibleReportContentPermissions.length === 0}
									<div class="empty-box">No report content section found.</div>
								{:else}
									<div class="report-content-list">
										{#each visibleReportContentPermissions as permission}
											<label
												class:report-content-item-checked={hasReportContentSection(permission.key)}
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
														{permission.tableLabel || permission.moduleLabel || 'Daily Report'}
													</span>
													<small>{permission.description || permission.key}</small>
												</div>
											</label>
										{/each}
									</div>
								{/if}
							</div>

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
											on:click={() => loadReportingAssignableUsers(selectedReportingVessel.id, reportingAssignablePagination.page || 1)}
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
										<span>Add report recipients manually when they are not listed as assignable users.</span>
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

										<button type="button" class="primary-button" on:click={addManualAutoReportRecipients}>
											Add Email
										</button>
									</div>
								</div>

								{#if reportingAssignableUsersLoading}
									<LoadingSkeleton label="Loading assignable users" variant="admin-compact-list" rows={5} />
								{:else if filteredReportingAssignableUsers.length === 0}
									<div class="empty-box">No users with email are available for this vessel.</div>
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
																toggleAutoReportRecipient(user.email, 'pic', event.currentTarget.checked)}
														/>
														<span>PIC</span>
													</label>

													<label>
														<input
															type="checkbox"
															checked={hasAutoReportRecipient(user.email, 'cc')}
															disabled={!user.email}
															on:change={(event) =>
																toggleAutoReportRecipient(user.email, 'cc', event.currentTarget.checked)}
														/>
														<span>CC</span>
													</label>

													<label>
														<input
															type="checkbox"
															checked={hasAutoReportRecipient(user.email, 'bcc')}
															disabled={!user.email}
															on:change={(event) =>
																toggleAutoReportRecipient(user.email, 'bcc', event.currentTarget.checked)}
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
										on:click={() => goToAssignableUserPage((reportingAssignablePagination.page || 1) - 1)}
										disabled={(reportingAssignablePagination.page || 1) <= 1 || reportingAssignableUsersLoading}
									>
										Previous
									</button>

									<span>{reportingAssignablePagination.totalItems || 0} users</span>

									<button
										type="button"
										class="ghost-button small"
										on:click={() => goToAssignableUserPage((reportingAssignablePagination.page || 1) + 1)}
										disabled={(reportingAssignablePagination.page || 1) >=
											(reportingAssignablePagination.totalPages || 1) || reportingAssignableUsersLoading}
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
												<button type="button" on:click={() => removeAutoReportRecipient('pic', email)}>
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
												<button type="button" on:click={() => removeAutoReportRecipient('cc', email)}>
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
												<button type="button" on:click={() => removeAutoReportRecipient('bcc', email)}>
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
									{reportingSaving ? 'Saving...' : 'Save Auto Report'}
								</button>
							</div>
						</section>

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
									<input type="date" bind:value={manualReportDate} />
								</label>

								<button
									type="button"
									class="ghost-button"
									on:click={downloadManualDailyReport}
									disabled={reportingActionLoadingId === `download-${selectedReportingVessel.id}`}
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
									<LoadingSkeleton label="Loading audit logs" variant="admin-compact-list" rows={4} />
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
						placeholder="Search vessel, device ID..."
					/>

					<div class="cctv-vessel-list">
						{#if vesselsLoading}
							<LoadingSkeleton label="Loading vessels" variant="admin-entity-list" rows={6} compact />
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
							<p>Select a vessel on the left to create or update CCTV camera names and tokens.</p>
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
									<p>Each camera token must be exactly 32 characters. Saving will upsert the configuration.</p>
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
															updateCctvCamera(camera.id, 'camera_name', event.currentTarget.value)}
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
																updateCctvCamera(camera.id, 'camera_token', event.currentTarget.value)}
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
													<small class:token-invalid={camera.camera_token.trim().length > 0 &&
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
							<p>{reportingVessels.length} vessel</p>
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
							<LoadingSkeleton label="Loading alarm vessels" variant="admin-entity-list" rows={6} compact />
						{:else if reportingVessels.length === 0}
							<div class="empty-box">Alarm vessel not found.</div>
						{:else}
							{#each reportingVessels as vessel}
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
								Configure engine health alarms per vessel and Telegram alarm group routing in a separate tab.
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
									<input type="number" step="0.1" bind:value={engineHealthForm.oilPressureMin} />
								</label>

								<label>
									<span>Oil Pressure Max</span>
									<input type="number" step="0.1" bind:value={engineHealthForm.oilPressureMax} />
								</label>

								<label>
									<span>Oil Temp Max</span>
									<input type="number" step="0.1" bind:value={engineHealthForm.oilTemperatureMax} />
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
										<LoadingSkeleton label="Loading Telegram groups" variant="admin-compact-list" rows={4} />
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
											<input type="text" bind:value={telegramForm.name} placeholder="Semar Alarm" />
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
												{#each telegramForm.vesselIds as vesselId}
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
												{#each filteredTelegramVesselOptions as vessel}
													<label class="option-chip">
														<input
															type="checkbox"
															checked={hasTelegramVessel(vessel.id)}
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
								Display all admin/user audit activities globally. The list can be filtered by User ID.
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
							<input type="date" bind:value={globalAuditFilters.startDate} />
						</label>

						<label>
							<span>Export End Date</span>
							<input type="date" bind:value={globalAuditFilters.endDate} />
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
							<LoadingSkeleton label="Loading global audit logs" variant="admin-global-audit-table" rows={6} columns={5} />
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
									Page {globalAuditPagination.page || 1} / {globalAuditPagination.totalPages || 1}
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

<style>
	:global(html),
	:global(body) {
		width: 100%;
		height: 100%;
		margin: 0;
		padding: 0;
		overflow: hidden;
		font-family:
			'Plus Jakarta Sans',
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
		background: var(--color-elevated);
		color: var(--text-primary);
	}

	:global(*) {
		box-sizing: border-box;
	}

	button,
	input,
	textarea,
	select {
		font: inherit;
	}

	button {
		cursor: pointer;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.65;
	}

	h1,
	h2,
	h3,
	h4,
	p {
		margin: 0;
	}

	.administrator-page {
		width: 100%;
		height: 100vh;
		overflow: auto;
		padding: 14px 14px 28px;
		background: var(--color-elevated);
	}

	.admin-header-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 18px;
		padding: 18px 20px;
		border: 1px solid #e2e8f0;
		border-radius: 22px;
		background: var(--color-surface);
		box-shadow: 0 18px 45px rgba(15, 23, 42, 0.07);
	}

	.page-kicker {
		margin-bottom: 6px;
		color: #1d4eda;
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.admin-header-card h1 {
		color: var(--text-primary);
		font-size: 25px;
		font-weight: 900;
		letter-spacing: -0.04em;
	}

	.admin-header-card p {
		max-width: 720px;
		margin-top: 6px;
		color: var(--text-secondary);
		font-size: 13px;
		line-height: 1.55;
	}

	.header-actions,
	.permission-actions,
	.editor-footer,
	.module-buttons {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	.primary-button,
	.ghost-button,
	.danger-button,
	.activate-button {
		min-height: 38px;
		border: 0;
		border-radius: 13px;
		padding: 0 15px;
		font-size: 13px;
		font-weight: 800;
		transition:
			transform 0.18s ease,
			box-shadow 0.18s ease,
			background 0.18s ease;
	}

	.primary-button {
		color: #ffffff;
		background: #1d4eda;
		box-shadow: 0 14px 25px rgba(15, 118, 110, 0.22);
	}

	.primary-button:hover,
	.ghost-button:hover,
	.danger-button:hover,
	.activate-button:hover {
		transform: translateY(-1px);
	}

	.ghost-button {
		color: var(--text-secondary);
		background: var(--color-surface);
		border: 1px solid #dbe4ee;
	}

	.ghost-button.small,
	.primary-button.small,
	.danger-button.small {
		min-height: 34px;
		padding: 0 12px;
		font-size: 12px;
	}

	.danger-button {
		color: #ffffff;
		background: #dc2626;
		box-shadow: 0 14px 25px rgba(220, 38, 38, 0.18);
	}

	.activate-button {
		color: #ffffff;
		background: #16a34a;
		box-shadow: 0 14px 25px rgba(22, 163, 74, 0.18);
	}

	.alert-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		margin-top: 12px;
		padding: 12px 14px;
		border-radius: 16px;
		font-size: 13px;
		font-weight: 700;
	}

	.alert-card button {
		width: 28px;
		height: 28px;
		border: 0;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.65);
		color: inherit;
		font-size: 18px;
		line-height: 1;
	}

	.success-alert {
		color: #14532d;
		background: #dcfce7;
		border: 1px solid #bbf7d0;
	}

	.error-alert {
		color: #7f1d1d;
		background: var(--color-danger-muted);
		border: 1px solid #fecaca;
	}

	.state-card {
		display: grid;
		place-items: center;
		min-height: 320px;
		margin-top: 14px;
		padding: 24px;
		border: 1px solid #e2e8f0;
		border-radius: 22px;
		background: var(--color-surface);
		text-align: center;
		color: var(--text-secondary);
	}

	.state-card h2 {
		margin-bottom: 8px;
		color: var(--text-primary);
		font-size: 22px;
	}

	.danger-state code {
		padding: 2px 6px;
		border-radius: 7px;
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-primary);
	}

	.loader {
		width: 34px;
		height: 34px;
		margin-bottom: 12px;
		border: 4px solid #e2e8f0;
		border-top-color: #1d4eda;
		border-radius: 999px;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 12px;
		margin-top: 14px;
	}

	.summary-card {
		padding: 16px;
		border: 1px solid #e2e8f0;
		border-radius: 18px;
		background: var(--color-surface);
		box-shadow: 0 14px 32px rgba(15, 23, 42, 0.05);
	}

	.summary-card span {
		display: block;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.summary-card strong {
		display: block;
		margin-top: 8px;
		color: var(--text-primary);
		font-size: 25px;
		font-weight: 900;
	}

	.admin-tabs {
		position: relative;
		isolation: isolate;
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 14px;
		padding: 8px;
		border: 1px solid #e2e8f0;
		border-radius: 18px;
		background: var(--color-surface);
		box-shadow: 0 12px 28px rgba(15, 23, 42, 0.05);
		overflow-x: auto;
		scroll-behavior: smooth;
	}

	.admin-tab-indicator {
		position: absolute;
		top: 8px;
		bottom: 8px;
		left: 0;
		z-index: 0;
		pointer-events: none;
		border-radius: 13px;
		background: #1d4eda;
		box-shadow: 0 12px 22px rgba(15, 118, 110, 0.18);
		transition:
			transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
			width 0.28s cubic-bezier(0.22, 1, 0.36, 1),
			opacity 0.16s ease;
	}

	.admin-tabs button {
		position: relative;
		z-index: 1;
		min-height: 38px;
		border: 0;
		border-radius: 13px;
		padding: 0 15px;
		color: var(--text-secondary);
		background: transparent;
		font-size: 13px;
		font-weight: 900;
		transition:
			color 0.2s ease,
			transform 0.2s ease;
	}

	.admin-tabs button:hover {
		color: #253b6e;
		transform: translateY(-1px);
	}

	.admin-tabs button.active-tab {
		color: #ffffff;
		background: transparent;
		box-shadow: none;
	}

	.admin-tabs button.active-tab:hover {
		color: #ffffff;
	}

	.admin-tab-content {
		will-change: transform, opacity;
	}

	.field-help {
		display: block;
		margin-top: 6px;
		color: var(--text-secondary);
		font-size: 11px;
		line-height: 1.35;
	}

	.admin-workspace,
	.vessel-admin-workspace,
	.asset-admin-workspace {
		display: grid;
		gap: 14px;
		margin-top: 14px;
		align-items: start;
	}

	.admin-workspace {
		grid-template-columns: 360px minmax(0, 1fr);
	}

	.engine-curve-admin-workspace {
		display: grid;
		grid-template-columns: 390px minmax(0, 1fr);
		gap: 14px;
		margin-top: 14px;
		align-items: start;
	}

	.engine-curve-list-panel,
	.engine-curve-editor-panel {
		border: 1px solid #e2e8f0;
		border-radius: 22px;
		background: var(--color-surface);
		box-shadow: 0 14px 34px rgba(15, 23, 42, 0.06);
	}

	.engine-curve-list-panel {
		position: sticky;
		top: 14px;
		max-height: calc(100vh - 250px);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.engine-curve-editor-panel {
		min-width: 0;
		padding: 18px;
	}

	.engine-curve-list {
		flex: 1;
		overflow: auto;
		padding: 0 10px 12px;
	}

	.engine-curve-row {
		width: 100%;
		display: flex;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 8px;
		border: 1px solid #e2e8f0;
		border-radius: 16px;
		padding: 12px;
		text-align: left;
		background: var(--color-surface);
		transition:
			border 0.18s ease,
			background 0.18s ease,
			transform 0.18s ease;
	}

	.engine-curve-row:hover,
	.engine-curve-row.selected-user {
		border-color: #99f6e4;
		background: var(--color-success-muted);
		transform: translateY(-1px);
	}

	.engine-curve-row strong,
	.engine-curve-row span,
	.engine-curve-row small {
		display: block;
	}

	.engine-curve-row strong {
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 900;
	}

	.engine-curve-row span {
		margin-top: 3px;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
	}

	.engine-curve-row small {
		margin-top: 3px;
		color: #94a3b8;
		font-size: 11px;
	}

	.engine-curve-row em {
		height: fit-content;
		border-radius: 999px;
		padding: 5px 9px;
		color: #991b1b;
		background: var(--color-danger-muted);
		font-size: 11px;
		font-style: normal;
		font-weight: 900;
		white-space: nowrap;
	}

	.engine-curve-row em.active-curve {
		color: #166534;
		background: #dcfce7;
	}

	.engine-curve-form-card,
	.engine-curve-detail-card {
		border: 1px solid #e2e8f0;
		border-radius: 18px;
		background: var(--color-elevated);
		padding: 14px;
	}

	.engine-curve-form-grid {
		grid-template-columns: 1fr 180px 1fr 1fr;
	}

	.checkbox-line {
		display: flex;
		align-items: center;
		gap: 9px;
		width: fit-content;
		margin-top: 12px;
	}

	.checkbox-line input {
		width: 16px;
		min-width: 16px;
		height: 16px;
		min-height: 16px;
		accent-color: #1d4eda;
	}

	.checkbox-line span {
		margin: 0;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 800;
	}

	.engine-curve-note {
		margin-top: 12px;
		border: 1px dashed #cbd5e1;
		border-radius: 14px;
		padding: 12px;
		color: var(--text-secondary);
		background: var(--color-surface);
		font-size: 12px;
		line-height: 1.55;
	}

	.engine-curve-detail-card {
		margin-top: 14px;
	}

	.engine-curve-detail-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 14px;
	}

	.engine-curve-detail-head h3 {
		color: var(--text-primary);
		font-size: 16px;
		font-weight: 900;
	}

	.engine-curve-detail-head p {
		margin-top: 4px;
		color: var(--text-secondary);
		font-size: 12px;
	}

	.detail-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	.curve-meta-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
		margin-top: 12px;
	}

	.curve-meta-grid article {
		border: 1px solid #e2e8f0;
		border-radius: 14px;
		padding: 12px;
		background: var(--color-surface);
	}

	.curve-meta-grid span,
	.curve-meta-grid strong {
		display: block;
	}

	.curve-meta-grid span {
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.curve-meta-grid strong {
		margin-top: 5px;
		color: var(--text-primary);
		font-size: 12px;
		word-break: break-word;
	}

	.engine-curve-engine-list {
		display: grid;
		gap: 12px;
		margin-top: 12px;
	}

	.engine-curve-engine-card {
		border: 1px solid #e2e8f0;
		border-radius: 16px;
		padding: 12px;
		background: var(--color-surface);
	}

	.engine-curve-engine-card h4 {
		color: var(--text-primary);
		font-size: 14px;
		font-weight: 900;
	}

	.engine-curve-engine-card code {
		display: inline-block;
		margin-top: 5px;
		border-radius: 8px;
		padding: 3px 7px;
		color: #1d4eda;
		background: #ccfbf1;
		font-size: 11px;
		font-weight: 900;
	}

	.range-table-wrap {
		max-height: 280px;
		margin-top: 10px;
		overflow: auto;
		border: 1px solid #e2e8f0;
		border-radius: 12px;
	}

	.range-table-wrap table {
		width: 100%;
		border-collapse: collapse;
		background: var(--color-surface);
	}

	.range-table-wrap th,
	.range-table-wrap td {
		padding: 8px 10px;
		border-bottom: 1px solid #eef2f7;
		text-align: left;
		color: var(--text-secondary);
		font-size: 12px;
	}

	.range-table-wrap th {
		position: sticky;
		top: 0;
		background: var(--color-elevated);
		color: var(--text-primary);
		font-weight: 900;
	}

	.ae-value-box {
		width: fit-content;
		margin-top: 10px;
		border: 1px solid #e2e8f0;
		border-radius: 14px;
		padding: 12px;
		background: var(--color-elevated);
	}

	.ae-value-box span,
	.ae-value-box strong {
		display: block;
	}

	.ae-value-box span {
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 900;
	}

	.ae-value-box strong {
		margin-top: 4px;
		color: var(--text-primary);
		font-size: 18px;
		font-weight: 900;
	}

	.vessel-admin-workspace {
		grid-template-columns: 390px minmax(0, 1fr);
	}

	.asset-admin-workspace {
		grid-template-columns: 390px minmax(0, 1fr);
	}

	.users-panel,
	.editor-panel,
	.vessel-list-panel,
	.vessel-editor-panel,
	.asset-list-panel,
	.asset-editor-panel {
		border: 1px solid #e2e8f0;
		border-radius: 22px;
		background: var(--color-surface);
		box-shadow: 0 14px 34px rgba(15, 23, 42, 0.06);
	}

	.users-panel,
	.vessel-list-panel,
	.asset-list-panel {
		position: sticky;
		top: 14px;
		max-height: calc(100vh - 250px);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-title-row,
	.editor-toolbar,
	.permission-header,
	.access-head,
	.permission-group-head {
		display: flex;
		justify-content: space-between;
		gap: 14px;
	}

	.panel-title-row {
		align-items: flex-start;
		padding: 16px 16px 12px;
	}

	.panel-title-row h2,
	.editor-toolbar h2 {
		color: var(--text-primary);
		font-size: 18px;
		font-weight: 900;
		letter-spacing: -0.03em;
	}

	.panel-title-row p,
	.editor-toolbar p,
	.access-head p,
	.permission-header p,
	.permission-group-head p,
	.engine-preview-card p {
		margin-top: 3px;
		color: var(--text-secondary);
		font-size: 12px;
		line-height: 1.4;
	}

	.mini-loading {
		border-radius: 999px;
		padding: 5px 9px;
		color: #1d4eda;
		background: #ccfbf1;
		font-size: 11px;
		font-weight: 900;
	}

	.search-input {
		width: calc(100% - 32px);
		min-height: 40px;
		margin: 0 16px 12px;
		border: 1px solid #dbe4ee;
		border-radius: 14px;
		padding: 0 12px;
		color: var(--text-primary);
		background: var(--color-elevated);
		outline: none;
	}

	.search-input:focus,
	input:focus,
	textarea:focus,
	select:focus {
		border-color: #1d4eda;
		box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.1);
	}

	.users-list,
	.vessel-list,
	.asset-list {
		flex: 1;
		overflow: auto;
		padding: 0 10px 12px;
	}

	.user-row,
	.vessel-row,
	.asset-row {
		width: 100%;
		display: flex;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 8px;
		border: 1px solid #e2e8f0;
		border-radius: 16px;
		padding: 12px;
		text-align: left;
		background: var(--color-surface);
		transition:
			border 0.18s ease,
			background 0.18s ease,
			transform 0.18s ease;
	}

	.user-row:hover,
	.vessel-row:hover,
	.asset-row:hover,
	.selected-user {
		border-color: #99f6e4;
		background: var(--color-success-muted);
		transform: translateY(-1px);
	}

	.inactive-user {
		opacity: 0.72;
	}

	.user-main strong,
	.user-main span,
	.user-main small,
	.vessel-row strong,
	.vessel-row span,
	.vessel-row small,
	.asset-row strong,
	.asset-row span,
	.asset-row small {
		display: block;
	}

	.user-main strong,
	.vessel-row strong,
	.asset-row strong {
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 900;
	}

	.user-main span,
	.vessel-row span,
	.asset-row span {
		margin-top: 3px;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
	}

	.user-main small,
	.vessel-row small,
	.asset-row small {
		margin-top: 3px;
		color: #94a3b8;
		font-size: 11px;
	}

	.asset-row small {
		max-width: 260px;
		word-break: break-all;
	}

	.vessel-row small {
		max-width: 230px;
		word-break: break-all;
	}

	.vessel-row em {
		height: fit-content;
		border-radius: 999px;
		padding: 5px 9px;
		color: var(--text-secondary);
		background: rgba(255, 255, 255, 0.06);
		font-size: 11px;
		font-style: normal;
		font-weight: 900;
		white-space: nowrap;
	}

	.vessel-row-meta {
		display: inline-flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 7px;
		min-width: 0;
	}

	.hire-status-pill {
		display: inline-flex !important;
		align-items: center;
		gap: 6px;
		width: fit-content;
		margin-top: 0 !important;
		border: 1px solid rgba(148, 163, 184, 0.18);
		border-radius: 999px;
		padding: 5px 9px;
		font-size: 10px !important;
		font-weight: 900 !important;
		line-height: 1;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.hire-status-pill::before {
		content: '';
		width: 7px;
		height: 7px;
		border-radius: 999px;
		background: currentColor;
		box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 18%, transparent);
	}

	.hire-status-pill.on-hire {
		border-color: rgba(34, 197, 94, 0.28);
		background: rgba(34, 197, 94, 0.12);
		color: #86efac !important;
	}

	.hire-status-pill.off-hire {
		border-color: rgba(245, 158, 11, 0.28);
		background: rgba(245, 158, 11, 0.12);
		color: #fbbf24 !important;
	}

	.user-meta {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 7px;
		white-space: nowrap;
	}

	.user-meta small {
		color: #94a3b8;
		font-size: 11px;
		font-weight: 800;
	}

	.active-badge,
	.inactive-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 24px;
		border-radius: 999px;
		padding: 0 9px;
		font-size: 11px;
		font-weight: 900;
	}

	.active-badge {
		color: #166534;
		background: #dcfce7;
	}

	.inactive-badge {
		color: #991b1b;
		background: var(--color-danger-muted);
	}

	.editor-panel,
	.asset-editor-panel,
	.vessel-editor-panel {
		min-width: 0;
		padding: 18px;
	}

	.editor-toolbar {
		align-items: center;
		margin-bottom: 16px;
	}

	.form-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
	}

	.vessel-form-grid {
		grid-template-columns: 1.4fr 1fr 180px;
	}

	.asset-form-grid {
		grid-template-columns: 1.35fr 1fr 180px;
	}

	.asset-row-title {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 7px;
		min-width: 0;
	}

	.asset-row-title strong {
		min-width: 0;
	}

	.asset-row-title .asset-type-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: fit-content;
		min-height: 22px;
		margin-top: 0;
		padding: 0 8px;
		border: 1px solid rgba(96, 165, 250, 0.28);
		border-radius: 999px;
		background: rgba(37, 99, 235, 0.16);
		color: #bfdbfe;
		font-size: 10px;
		font-weight: 800;
		line-height: 1;
		letter-spacing: 0.02em;
		white-space: nowrap;
	}

	.asset-row-title .asset-type-badge.empty-asset-type {
		border-color: rgba(148, 163, 184, 0.18);
		background: rgba(148, 163, 184, 0.1);
		color: var(--text-secondary);
	}

	label span {
		display: block;
		margin-bottom: 6px;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 900;
	}

	input,
	textarea,
	select {
		width: 100%;
		border: 1px solid #dbe4ee;
		border-radius: 13px;
		background: var(--color-surface);
		color: var(--text-primary);
		outline: none;
		transition:
			border 0.18s ease,
			box-shadow 0.18s ease,
			background 0.18s ease;
	}

	input,
	select {
		min-height: 40px;
		padding: 0 11px;
	}

	input[type='checkbox'] {
		position: relative;
		width: 18px;
		min-width: 18px;
		height: 18px;
		min-height: 18px;
		margin: 0;
		padding: 0;
		display: inline-grid;
		place-items: center;
		flex: 0 0 auto;
		border: 2px solid rgba(148, 163, 184, 0.72);
		border-radius: 6px;
		background: rgba(15, 23, 42, 0.22);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.06),
			0 0 0 1px rgba(15, 23, 42, 0.08);
		appearance: none;
		-webkit-appearance: none;
		cursor: pointer;
		transition:
			background 0.16s ease,
			border-color 0.16s ease,
			box-shadow 0.16s ease;
	}

	input[type='checkbox']::after {
		content: '';
		width: 8px;
		height: 4px;
		border-left: 2px solid #ffffff;
		border-bottom: 2px solid #ffffff;
		opacity: 0;
		transform: rotate(-45deg) scale(0.75);
		transition:
			opacity 0.14s ease,
			transform 0.14s ease;
	}

	input[type='checkbox']:checked {
		border-color: rgba(147, 197, 253, 0.95);
		background: linear-gradient(135deg, #2563eb, #06b6d4);
		box-shadow:
			0 0 0 4px rgba(37, 99, 235, 0.18),
			inset 0 1px 0 rgba(255, 255, 255, 0.22);
	}

	input[type='checkbox']:checked::after {
		opacity: 1;
		transform: rotate(-45deg) scale(1);
	}

	input[type='checkbox']:focus-visible {
		outline: 2px solid rgba(147, 197, 253, 0.9);
		outline-offset: 3px;
	}

	textarea {
		min-height: 76px;
		resize: vertical;
		padding: 10px 11px;
	}

	input:disabled {
		background: rgba(255, 255, 255, 0.06);
		color: #94a3b8;
	}

	.access-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
		margin-top: 16px;
	}

	.access-card,
	.permission-panel,
	.vessel-form-card,
	.asset-form-card,
	.engine-preview-card {
		border: 1px solid #e2e8f0;
		border-radius: 18px;
		background: var(--color-elevated);
		padding: 14px;
	}

	.access-head {
		align-items: flex-start;
		margin-bottom: 12px;
	}

	.access-head h3,
	.permission-header h3,
	.engine-preview-card h3 {
		color: var(--text-primary);
		font-size: 15px;
		font-weight: 900;
	}

	.access-head select,
	.permission-actions select {
		width: 126px;
	}

	.option-list {
		display: grid;
		gap: 8px;
		margin-top: 10px;
		max-height: 220px;
		overflow: auto;
		padding-right: 3px;
	}

	.option-chip {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		border: 1px solid #e2e8f0;
		border-radius: 14px;
		padding: 10px;
		background: var(--color-surface);
	}

	.option-chip input,
	.permission-item input {
		width: 16px;
		min-width: 16px;
		height: 16px;
		min-height: 16px;
		margin-top: 2px;
		accent-color: #1d4eda;
	}

	.option-chip strong,
	.option-chip small {
		display: block;
	}

	.option-chip strong {
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 900;
	}

	.option-chip small {
		margin-top: 3px;
		color: var(--text-secondary);
		font-size: 11px;
	}

	.muted-box,
	.empty-box {
		border: 1px dashed #cbd5e1;
		border-radius: 15px;
		padding: 14px;
		color: var(--text-secondary);
		background: var(--color-surface);
		font-size: 12px;
		line-height: 1.5;
	}

	.muted-box.large {
		margin-top: 12px;
		padding: 20px;
	}

	.permission-panel {
		margin-top: 16px;
	}

	.permission-header {
		align-items: center;
		margin-bottom: 12px;
	}

	.permission-filter {
		display: grid;
		grid-template-columns: 220px minmax(0, 1fr);
		gap: 10px;
		margin-bottom: 12px;
	}

	.permission-groups {
		display: grid;
		gap: 12px;
		max-height: 560px;
		overflow: auto;
		padding-right: 4px;
	}

	.permission-group {
		border: 1px solid #e2e8f0;
		border-radius: 16px;
		background: var(--color-surface);
		overflow: hidden;
	}

	.permission-group-head {
		align-items: center;
		padding: 12px;
		border-bottom: 1px solid #e2e8f0;
		background: var(--color-elevated);
	}

	.permission-group-head h4 {
		color: var(--text-primary);
		font-size: 14px;
		font-weight: 900;
	}

	.text-button {
		border: 0;
		background: transparent;
		color: #1d4eda;
		font-size: 12px;
		font-weight: 900;
	}

	.permission-list {
		display: grid;
		gap: 0;
	}

	.permission-item {
		display: grid;
		grid-template-columns: 18px minmax(0, 1fr) auto;
		gap: 11px;
		align-items: flex-start;
		padding: 12px;
		border-bottom: 1px solid #eef2f7;
	}

	.permission-item:last-child {
		border-bottom: 0;
	}

	.permission-item strong,
	.permission-item code,
	.permission-item small {
		display: block;
	}

	.permission-item strong {
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 900;
	}

	.permission-item code {
		width: fit-content;
		margin-top: 5px;
		border-radius: 8px;
		padding: 3px 7px;
		color: #1d4eda;
		background: #ccfbf1;
		font-size: 11px;
		font-weight: 900;
		white-space: normal;
		word-break: break-word;
	}

	.permission-item small {
		margin-top: 6px;
		color: var(--text-secondary);
		font-size: 12px;
		line-height: 1.45;
	}

	.permission-item em {
		border-radius: 999px;
		padding: 4px 8px;
		color: var(--text-secondary);
		background: rgba(255, 255, 255, 0.06);
		font-size: 11px;
		font-style: normal;
		font-weight: 900;
		text-transform: capitalize;
	}

	.vessel-note {
		margin-top: 12px;
		border: 1px dashed #cbd5e1;
		border-radius: 14px;
		padding: 12px;
		color: var(--text-secondary);
		background: var(--color-surface);
		font-size: 12px;
		line-height: 1.55;
	}

	.vessel-note code {
		border-radius: 7px;
		padding: 2px 6px;
		color: #1d4eda;
		background: #ccfbf1;
		font-size: 11px;
		font-weight: 900;
	}

	.asset-note {
		margin-top: 12px;
		border: 1px dashed #cbd5e1;
		border-radius: 14px;
		padding: 12px;
		color: var(--text-secondary);
		background: var(--color-surface);
		font-size: 12px;
		line-height: 1.55;
	}

	.asset-note code {
		border-radius: 7px;
		padding: 2px 6px;
		color: #1d4eda;
		background: #ccfbf1;
		font-size: 11px;
		font-weight: 900;
	}

	.engine-preview-card,
	.company-registry-card {
		margin-top: 14px;
	}

	.vessel-toolbar-actions,
	.company-registry-head,
	.company-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	.vessel-toolbar-actions {
		justify-content: flex-end;
	}

	.company-registry-head {
		justify-content: space-between;
		margin-bottom: 12px;
	}

	.company-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 10px;
		margin-top: 12px;
	}

	.company-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
		border: 1px solid #e2e8f0;
		border-radius: 14px;
		padding: 12px;
		background: var(--color-surface);
	}

	.company-row strong,
	.company-row span,
	.company-row small {
		display: block;
	}

	.company-row span {
		margin-top: 4px;
		color: var(--text-secondary);
		font-size: 12px;
	}

	.company-row small {
		margin-top: 4px;
		max-width: 300px;
		color: var(--text-secondary);
		font-size: 11px;
		word-break: break-all;
	}

	.engine-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
		gap: 10px;
		margin-top: 12px;
	}

	.engine-grid article {
		border: 1px solid #e2e8f0;
		border-radius: 14px;
		padding: 12px;
		background: var(--color-surface);
	}

	.engine-grid strong,
	.engine-grid code,
	.engine-grid small {
		display: block;
	}

	.engine-grid strong {
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 900;
	}

	.engine-grid code {
		width: fit-content;
		margin-top: 6px;
		border-radius: 8px;
		padding: 3px 7px;
		color: #1d4eda;
		background: #ccfbf1;
		font-size: 11px;
		font-weight: 900;
	}

	.engine-grid small {
		margin-top: 6px;
		color: var(--text-secondary);
		font-size: 11px;
	}

	.editor-footer {
		justify-content: flex-end;
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid #e2e8f0;
	}

	.reporting-admin-workspace,
	.cctv-admin-workspace {
		display: grid;
		grid-template-columns: 390px minmax(0, 1fr);
		gap: 14px;
		margin-top: 14px;
		align-items: start;
	}

	.reporting-vessel-panel,
	.reporting-editor-panel,
	.cctv-vessel-panel,
	.cctv-editor-panel {
		border: 1px solid #e2e8f0;
		border-radius: 22px;
		background: var(--color-surface);
		box-shadow: 0 14px 34px rgba(15, 23, 42, 0.06);
	}

	.reporting-vessel-panel,
	.cctv-vessel-panel {
		position: sticky;
		top: 14px;
		max-height: calc(100vh - 250px);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.reporting-editor-panel,
	.cctv-editor-panel {
		min-width: 0;
		padding: 18px;
	}

	.reporting-filter-box {
		display: grid;
		gap: 8px;
		padding: 0 16px 12px;
	}

	.reporting-filter-box input,
	.reporting-filter-box select {
		min-height: 38px;
	}

	.reporting-vessel-list,
	.cctv-vessel-list {
		flex: 1;
		overflow: auto;
		padding: 0 10px 12px;
	}

	.reporting-vessel-row,
	.cctv-vessel-row,
	.telegram-row {
		width: 100%;
		display: flex;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 8px;
		border: 1px solid #e2e8f0;
		border-radius: 16px;
		padding: 12px;
		text-align: left;
		background: var(--color-surface);
		transition:
			border 0.18s ease,
			background 0.18s ease,
			transform 0.18s ease;
	}

	.reporting-vessel-row:hover,
	.cctv-vessel-row:hover,
	.telegram-row:hover,
	.reporting-vessel-row.selected-user,
	.cctv-vessel-row.selected-user,
	.telegram-row.selected-user {
		border-color: #99f6e4;
		background: var(--color-success-muted);
		transform: translateY(-1px);
	}

	.reporting-vessel-row strong,
	.reporting-vessel-row span,
	.reporting-vessel-row small,
	.cctv-vessel-row strong,
	.cctv-vessel-row span,
	.cctv-vessel-row small,
	.telegram-row strong,
	.telegram-row small {
		display: block;
	}

	.reporting-vessel-row strong,
	.cctv-vessel-row strong,
	.telegram-row strong {
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 900;
	}

	.reporting-vessel-row span,
	.cctv-vessel-row span {
		margin-top: 3px;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 800;
	}

	.reporting-vessel-row small,
	.cctv-vessel-row small,
	.telegram-row small {
		margin-top: 4px;
		color: #94a3b8;
		font-size: 11px;
		word-break: break-all;
	}

	.reporting-vessel-row em,
	.cctv-vessel-row em,
	.telegram-row em {
		height: fit-content;
		border-radius: 999px;
		padding: 5px 9px;
		color: #991b1b;
		background: var(--color-danger-muted);
		font-size: 11px;
		font-style: normal;
		font-weight: 900;
		white-space: nowrap;
	}

	.reporting-vessel-row em.active-reporting,
	.telegram-row em.active-reporting {
		color: #166534;
		background: #dcfce7;
	}

	.reporting-empty-card,
	.reporting-section-card,
	.cctv-config-card {
		border: 1px solid #e2e8f0;
		border-radius: 18px;
		background: var(--color-elevated);
		padding: 14px;
	}

	.reporting-empty-card h2,
	.reporting-section-card h3,
	.cctv-config-card h3 {
		color: var(--text-primary);
		font-size: 16px;
		font-weight: 900;
	}

	.reporting-empty-card p,
	.reporting-section-card p,
	.cctv-config-card p {
		margin-top: 4px;
		color: var(--text-secondary);
		font-size: 12px;
		line-height: 1.45;
	}

	.reporting-section-card,
	.cctv-config-card {
		margin-top: 14px;
	}

	.reporting-section-card:first-of-type,
	.cctv-config-card:first-of-type {
		margin-top: 0;
	}

	.reporting-section-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 14px;
		margin-bottom: 12px;
	}

	.cctv-updated-meta {
		display: inline-flex;
		align-items: center;
		min-height: 28px;
		border: 1px solid rgba(96, 165, 250, 0.28);
		border-radius: 999px;
		padding: 0 10px;
		color: #bfdbfe;
		background: rgba(37, 99, 235, 0.14);
		font-size: 11px;
		font-weight: 800;
		white-space: nowrap;
	}

	.cctv-camera-list {
		display: grid;
		gap: 12px;
	}

	.cctv-camera-card {
		border: 1px solid #e2e8f0;
		border-radius: 16px;
		background: var(--color-surface);
		padding: 12px;
	}

	.cctv-camera-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
	}

	.cctv-camera-head span,
	.cctv-camera-head strong {
		display: block;
	}

	.cctv-camera-head span {
		color: #60a5fa;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.cctv-camera-head strong {
		margin-top: 4px;
		color: var(--text-primary);
		font-size: 14px;
		font-weight: 900;
	}

	.cctv-camera-grid {
		grid-template-columns: minmax(180px, 0.8fr) minmax(260px, 1.2fr);
	}

	.cctv-camera-grid small {
		display: block;
		margin-top: 6px;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 800;
	}

	.cctv-camera-grid small.token-invalid {
		color: #fca5a5;
	}

	.token-input-wrap {
		position: relative;
		display: flex;
		align-items: center;
	}

	.token-input-wrap input {
		padding-right: 44px;
	}

	.token-generate-btn {
		position: absolute;
		top: 50%;
		right: 6px;
		width: 28px;
		min-width: 28px;
		height: 28px;
		min-height: 28px;
		border: 1px solid rgba(96, 165, 250, 0.32);
		border-radius: 10px;
		padding: 0;
		background: rgba(37, 99, 235, 0.14);
		color: #bfdbfe;
		font-size: 15px;
		font-weight: 900;
		line-height: 1;
		cursor: pointer;
		transform: translateY(-50%);
	}

	.token-generate-btn:hover {
		border-color: rgba(147, 197, 253, 0.72);
		background: rgba(37, 99, 235, 0.28);
	}

	.reporting-form-grid {
		grid-template-columns: 180px 180px 180px;
	}

	.report-content-card {
		display: grid;
		gap: 12px;
		margin-top: 12px;
		border: 1px solid rgba(96, 165, 250, 0.18);
		border-radius: 18px;
		padding: 14px;
		background:
			linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(14, 165, 233, 0.025)),
			var(--color-surface);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
	}

	.report-content-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	.report-content-head h4 {
		margin: 0;
		color: var(--text-primary);
		font-size: 14px;
		font-weight: 900;
	}

	.report-content-head p {
		max-width: 620px;
	}

	.report-content-actions {
		display: inline-flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		flex-wrap: wrap;
	}

	.report-content-actions span {
		min-height: 30px;
		display: inline-flex;
		align-items: center;
		border: 1px solid rgba(59, 130, 246, 0.24);
		border-radius: 999px;
		padding: 0 10px;
		background: var(--color-accent-muted);
		color: var(--text-accent);
		font-size: 11px;
		font-weight: 900;
		white-space: nowrap;
	}

	.report-content-search {
		display: grid;
		gap: 6px;
	}

	.report-content-search span {
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.report-content-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 10px;
		max-height: 520px;
		overflow: auto;
		padding: 0;
	}

	.report-content-item {
		position: relative;
		display: grid;
		grid-template-columns: 24px minmax(0, 1fr);
		gap: 11px;
		align-items: flex-start;
		min-height: 118px;
		padding: 14px;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 15px;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.01)),
			rgba(15, 23, 42, 0.2);
		cursor: pointer;
		transition:
			background 0.16s ease,
			border-color 0.16s ease,
			box-shadow 0.16s ease,
			transform 0.16s ease;
	}

	.report-content-item:hover {
		border-color: rgba(96, 165, 250, 0.34);
		background: rgba(37, 99, 235, 0.12);
		transform: translateY(-1px);
	}

	.report-content-item.report-content-item-checked {
		border-color: rgba(59, 130, 246, 0.72);
		background:
			linear-gradient(135deg, rgba(37, 99, 235, 0.24), rgba(14, 165, 233, 0.08)),
			rgba(15, 23, 42, 0.22);
		box-shadow:
			inset 3px 0 0 rgba(59, 130, 246, 0.95),
			0 12px 28px rgba(37, 99, 235, 0.1);
	}

	.report-content-item input {
		position: absolute;
		width: 1px;
		min-width: 1px;
		height: 1px;
		min-height: 1px;
		overflow: hidden;
		margin: 0;
		padding: 0;
		border: 0;
		clip: rect(0 0 0 0);
		clip-path: inset(50%);
		white-space: nowrap;
		appearance: none;
	}

	.report-content-checkmark {
		position: relative;
		width: 22px;
		height: 22px;
		display: inline-grid;
		place-items: center;
		margin-top: 1px;
		border: 2px solid rgba(148, 163, 184, 0.62);
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.28);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
		transition:
			background 0.16s ease,
			border-color 0.16s ease,
			box-shadow 0.16s ease;
	}

	.report-content-checkmark::after {
		content: '';
		width: 9px;
		height: 5px;
		border-left: 2px solid #ffffff;
		border-bottom: 2px solid #ffffff;
		opacity: 0;
		transform: rotate(-45deg) scale(0.72);
		transition:
			opacity 0.14s ease,
			transform 0.14s ease;
	}

	.report-content-item.report-content-item-checked .report-content-checkmark {
		border-color: rgba(147, 197, 253, 0.9);
		background: linear-gradient(135deg, #2563eb, #06b6d4);
		box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.18);
	}

	.report-content-item.report-content-item-checked .report-content-checkmark::after {
		opacity: 1;
		transform: rotate(-45deg) scale(1);
	}

	.report-content-item strong,
	.report-content-item small {
		display: block;
		min-width: 0;
	}

	.report-content-item strong {
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 900;
		line-height: 1.25;
	}

	.report-content-meta {
		width: fit-content;
		max-width: 100%;
		overflow: hidden;
		margin-top: 6px;
		border-radius: 999px;
		padding: 4px 8px;
		background: rgba(59, 130, 246, 0.12);
		color: #bfdbfe;
		font-size: 10px;
		font-weight: 900;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.report-content-item small {
		margin-top: 6px;
		color: var(--text-secondary);
		font-size: 11px;
		line-height: 1.35;
	}

	.recipient-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		margin-top: 12px;
	}

	.recipient-picker-card {
		display: grid;
		gap: 12px;
		margin-top: 12px;
		border: 1px solid #e2e8f0;
		border-radius: 16px;
		padding: 12px;
		background: var(--color-surface);
	}

	.recipient-picker-head {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 12px;
		align-items: end;
	}

	.manual-recipient-card {
		display: grid;
		gap: 12px;
		border: 1px solid rgba(96, 165, 250, 0.22);
		border-radius: 16px;
		padding: 12px;
		background:
			linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(20, 184, 166, 0.06)),
			var(--color-elevated);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
	}

	.manual-recipient-card strong,
	.manual-recipient-card span {
		display: block;
	}

	.manual-recipient-card strong {
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 800;
	}

	.manual-recipient-card > div:first-child span {
		margin-top: 4px;
		color: var(--text-secondary);
		font-size: 12px;
		line-height: 1.35;
	}

	.manual-recipient-form {
		display: grid;
		grid-template-columns: minmax(220px, 1fr) 140px auto;
		gap: 10px;
		align-items: end;
	}

	.manual-recipient-form label {
		min-width: 0;
	}

	.manual-recipient-form button {
		min-height: 40px;
		white-space: nowrap;
	}

	.recipient-page-actions,
	.assignable-pagination {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		flex-wrap: wrap;
	}

	.recipient-page-actions span,
	.assignable-pagination span {
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 800;
	}

	.assignable-user-list {
		display: grid;
		gap: 8px;
		max-height: 340px;
		overflow: auto;
	}

	.assignable-user-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 12px;
		align-items: center;
		border: 1px solid #e2e8f0;
		border-radius: 14px;
		padding: 11px 12px;
		background: var(--color-elevated);
	}

	.assignable-user-row strong,
	.assignable-user-row span,
	.assignable-user-row small {
		display: block;
	}

	.assignable-user-row strong {
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 900;
	}

	.assignable-user-row span {
		margin-top: 3px;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 800;
	}

	.assignable-user-row small {
		margin-top: 3px;
		color: var(--text-secondary);
		font-size: 11px;
		word-break: break-all;
	}

	.recipient-role-checks {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.recipient-role-checks label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border: 1px solid #dbe4ee;
		border-radius: 999px;
		padding: 6px 9px;
		background: var(--color-surface);
	}

	.recipient-role-checks input {
		width: 14px;
		min-width: 14px;
		height: 14px;
		min-height: 14px;
		accent-color: #1d4eda;
	}

	.recipient-role-checks span {
		margin: 0;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 900;
	}

	.selected-recipient-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}

	.selected-recipient-grid > div {
		min-height: 74px;
		border: 1px dashed #cbd5e1;
		border-radius: 14px;
		padding: 10px;
		background: var(--color-elevated);
	}

	.selected-recipient-grid span,
	.selected-recipient-grid small {
		display: block;
	}

	.selected-recipient-grid span {
		margin-bottom: 7px;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.selected-recipient-grid small {
		color: #94a3b8;
		font-size: 11px;
	}

	.selected-recipient-grid button {
		display: inline-flex;
		max-width: 100%;
		margin: 0 6px 6px 0;
		border: 0;
		border-radius: 999px;
		padding: 5px 8px;
		color: #1d4eda;
		background: #ccfbf1;
		font-size: 11px;
		font-weight: 900;
		word-break: break-all;
	}

	.manual-report-grid {
		grid-template-columns: 220px 170px 170px;
		align-items: end;
	}

	.health-grid {
		grid-template-columns: repeat(5, minmax(0, 1fr));
	}

	.switch-line {
		display: flex;
		align-items: center;
		gap: 9px;
	}

	.switch-line input {
		width: 16px;
		min-width: 16px;
		height: 16px;
		min-height: 16px;
		accent-color: #1d4eda;
	}

	.switch-line span {
		margin: 0;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 900;
	}

	.boxed-switch {
		min-height: 40px;
		border: 1px solid #dbe4ee;
		border-radius: 13px;
		padding: 0 11px;
		background: var(--color-surface);
	}

	.telegram-layout {
		display: grid;
		grid-template-columns: 320px minmax(0, 1fr);
		gap: 12px;
	}

	.telegram-list {
		max-height: 360px;
		overflow: auto;
	}

	.telegram-form-card {
		border: 1px solid #e2e8f0;
		border-radius: 16px;
		padding: 12px;
		background: var(--color-surface);
	}

	.telegram-form-grid {
		grid-template-columns: 1fr 1fr 150px;
		margin-bottom: 12px;
	}

	.telegram-vessel-picker {
		display: grid;
		gap: 10px;
		border: 1px solid #e2e8f0;
		border-radius: 16px;
		padding: 12px;
		background: var(--color-elevated);
	}

	.telegram-vessel-picker .picker-head {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(180px, 260px);
		gap: 12px;
		align-items: end;
	}

	.telegram-vessel-picker .picker-head span,
	.telegram-vessel-picker .picker-head small {
		display: block;
	}

	.telegram-vessel-picker .picker-head span {
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 900;
	}

	.telegram-vessel-picker .picker-head small {
		margin-top: 3px;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 800;
	}

	.selected-recipient-list {
		display: flex;
		align-items: center;
		gap: 7px;
		flex-wrap: wrap;
	}

	.selected-pill {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		max-width: 100%;
		border-radius: 999px;
		padding: 6px 8px 6px 10px;
		color: #1d4eda;
		background: #ccfbf1;
		font-size: 11px;
		font-weight: 900;
	}

	.selected-pill button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border: 0;
		border-radius: 50%;
		color: #1d4eda;
		background: rgba(17, 24, 39, 0.94);
		cursor: pointer;
	}

	.telegram-vessel-list {
		max-height: 260px;
		overflow: auto;
	}

	.alarm-key-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
		gap: 8px;
		margin-top: 12px;
	}

	.audit-log-list {
		display: grid;
		gap: 10px;
		max-height: 360px;
		overflow: auto;
	}

	.audit-log-row {
		border: 1px solid #e2e8f0;
		border-radius: 14px;
		padding: 12px;
		background: var(--color-surface);
	}

	.audit-log-row strong,
	.audit-log-row span,
	.audit-log-row small {
		display: block;
	}

	.audit-log-row strong {
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 900;
	}

	.audit-log-row span {
		margin-top: 4px;
		color: var(--text-secondary);
		font-size: 12px;
	}

	.audit-change-list {
		display: grid;
		gap: 4px;
		margin-top: 8px;
	}

	.audit-change-list small {
		color: var(--text-secondary);
		font-size: 12px;
	}

	.global-audit-workspace {
		margin-top: 14px;
	}

	.global-audit-panel {
		border: 1px solid #e2e8f0;
		border-radius: 22px;
		background: var(--color-surface);
		box-shadow: 0 14px 34px rgba(15, 23, 42, 0.06);
		padding: 18px;
	}

	.global-audit-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 14px;
	}

	.global-audit-header h2 {
		color: var(--text-primary);
		font-size: 18px;
		font-weight: 900;
		letter-spacing: -0.03em;
	}

	.global-audit-header p {
		margin-top: 4px;
		color: var(--text-secondary);
		font-size: 12px;
		line-height: 1.45;
	}

	.global-audit-filter-card {
		display: grid;
		grid-template-columns: 160px 140px 180px 180px auto;
		gap: 12px;
		align-items: end;
		margin-top: 16px;
		border: 1px solid #e2e8f0;
		border-radius: 18px;
		background: var(--color-elevated);
		padding: 14px;
	}

	.global-audit-filter-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.global-audit-table-card {
		margin-top: 14px;
		border: 1px solid #e2e8f0;
		border-radius: 18px;
		padding: 14px;
	}

	.global-audit-table-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
	}

	.global-audit-table-head div {
		border: 1px solid #e2e8f0;
		border-radius: 14px;
		padding: 10px 12px;
		min-width: 130px;
	}

	.global-audit-table-head strong,
	.global-audit-table-head span {
		display: block;
	}

	.global-audit-table-head strong {
		color: var(--text-primary);
		font-size: 18px;
		font-weight: 900;
	}

	.global-audit-table-head span {
		margin-top: 3px;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 800;
	}

	.global-audit-table-wrap {
		overflow: auto;
		border: 1px solid #e2e8f0;
		border-radius: 14px;
		background: var(--color-surface);
	}

	.global-audit-table-wrap table {
		width: 100%;
		min-width: 780px;
		border-collapse: collapse;
	}

	.global-audit-table-wrap th,
	.global-audit-table-wrap td {
		padding: 11px 12px;
		border-bottom: 1px solid #eef2f7;
		text-align: left;
		color: var(--text-secondary);
		font-size: 12px;
		vertical-align: top;
	}

	.global-audit-table-wrap th {
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--color-elevated);
		color: var(--text-primary);
		font-size: 11px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.global-audit-table-wrap td strong,
	.global-audit-table-wrap td small {
		display: block;
	}

	.global-audit-table-wrap td strong {
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 900;
	}

	.global-audit-table-wrap td small {
		margin-top: 3px;
		color: #94a3b8;
		font-size: 11px;
	}

	.global-audit-table-wrap code {
		display: inline-block;
		max-width: 220px;
		border-radius: 8px;
		padding: 3px 7px;
		color: #1d4eda;
		background: #ccfbf1;
		font-size: 11px;
		font-weight: 900;
		word-break: break-all;
	}

	.action-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 24px;
		border-radius: 999px;
		padding: 0 9px;
		color: var(--text-secondary);
		background: rgba(255, 255, 255, 0.06);
		font-size: 11px;
		font-weight: 900;
	}

	.create-action {
		color: #166534;
		background: #dcfce7;
	}

	.update-action {
		color: #1d4ed8;
		background: var(--color-accent-muted);
	}

	.delete-action {
		color: #991b1b;
		background: var(--color-danger-muted);
	}

	.global-audit-pagination {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
		margin-top: 12px;
	}

	.global-audit-pagination span {
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 800;
	}

	@media (max-width: 1180px) {
		.global-audit-filter-card {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.global-audit-filter-actions {
			grid-column: 1 / -1;
		}
	}

	@media (max-width: 760px) {
		.global-audit-header,
		.global-audit-table-head,
		.global-audit-pagination {
			align-items: stretch;
			flex-direction: column;
		}

		.global-audit-filter-card {
			grid-template-columns: 1fr;
		}

		.global-audit-filter-actions {
			flex-direction: column;
			align-items: stretch;
		}
	}

	@media (max-width: 1180px) {
		.reporting-admin-workspace,
		.cctv-admin-workspace {
			grid-template-columns: 1fr;
		}

		.reporting-vessel-panel,
		.cctv-vessel-panel {
			position: static;
			max-height: 420px;
		}

		.reporting-form-grid,
		.recipient-grid,
		.recipient-picker-head,
		.manual-recipient-form,
		.report-content-list,
		.telegram-vessel-picker .picker-head,
		.selected-recipient-grid,
		.assignable-user-row,
		.manual-report-grid,
		.health-grid,
		.telegram-layout,
		.telegram-form-grid,
		.cctv-camera-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 760px) {
		.reporting-section-head,
		.report-content-head,
		.reporting-vessel-row,
		.cctv-vessel-row,
		.cctv-camera-head,
		.telegram-row {
			flex-direction: column;
		}

		.recipient-page-actions,
		.assignable-pagination,
		.recipient-role-checks {
			justify-content: flex-start;
		}
	}

	@media (max-width: 1180px) {
		.summary-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}

		.admin-workspace,
		.vessel-admin-workspace,
		.asset-admin-workspace {
			grid-template-columns: 1fr;
		}

		.users-panel,
		.vessel-list-panel,
		.asset-list-panel {
			position: static;
			max-height: 420px;
		}

		.form-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.vessel-form-grid,
		.asset-form-grid {
			grid-template-columns: 1fr;
		}
		.engine-curve-admin-workspace {
			grid-template-columns: 1fr;
		}

		.engine-curve-list-panel {
			position: static;
			max-height: 420px;
		}

		.engine-curve-form-grid,
		.curve-meta-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 760px) {
		.administrator-page {
			padding: 10px 10px 24px;
		}

		.admin-header-card,
		.editor-toolbar,
		.permission-header {
			align-items: stretch;
			flex-direction: column;
		}

		.summary-grid,
		.access-grid,
		.form-grid,
		.permission-filter {
			grid-template-columns: 1fr;
		}

		.admin-tabs {
			flex-direction: column;
			align-items: stretch;
		}

		.admin-tabs button {
			width: 100%;
		}

		.permission-actions,
		.header-actions {
			width: 100%;
		}

		.permission-actions select,
		.access-head select,
		.primary-button,
		.ghost-button,
		.danger-button,
		.activate-button {
			width: 100%;
		}

		.permission-item {
			grid-template-columns: 18px minmax(0, 1fr);
		}

		.permission-item em {
			grid-column: 2;
			width: fit-content;
		}

		.vessel-row,
		.asset-row {
			flex-direction: column;
		}

		.vessel-row em {
			width: fit-content;
		}
		.engine-curve-row,
		.engine-curve-detail-head {
			flex-direction: column;
		}

		.detail-actions {
			width: 100%;
		}

		.detail-actions .ghost-button,
		.detail-actions .danger-button {
			width: 100%;
		}
	}

	/* =========================================================
	   Daily Report theme alignment for Administrator Page
	   ========================================================= */
	:global(html),
	:global(body) {
		background: var(--color-base);
		color: var(--text-primary);
	}

	.administrator-page {
		height: 100%;
		max-height: 100%;
		min-height: 0;
		padding: 14px;
		background: var(--color-base);
		color: var(--text-primary);
		overflow-y: auto;
		overflow-x: hidden;
	}

	.admin-header-card,
	.admin-tabs,
	.state-card,
	.summary-card,
	.users-panel,
	.editor-panel,
	.vessel-list-panel,
	.vessel-editor-panel,
	.asset-list-panel,
	.asset-editor-panel,
	.engine-curve-list-panel,
	.engine-curve-editor-panel,
	.reporting-vessel-panel,
	.reporting-editor-panel,
	.global-audit-panel {
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		border-radius: 0;
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
	}

	.admin-header-card {
		padding: 16px;
		gap: 16px;
	}

	.page-kicker {
		display: inline-flex;
		width: fit-content;
		margin-bottom: 0;
		padding: 4px 9px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		color: #1d4ed8;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.admin-header-card h1 {
		margin: 8px 0 0;
		color: var(--text-primary);
		font-size: 22px;
		line-height: 1.2;
		font-weight: 900;
		letter-spacing: 0;
	}

	.admin-header-card p {
		max-width: 760px;
		margin: 7px 0 0;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
		line-height: 1.5;
	}

	.header-actions,
	.permission-actions,
	.editor-footer,
	.module-buttons,
	.detail-actions,
	.global-audit-filter-actions,
	.filter-actions {
		gap: 8px;
	}

	.primary-button,
	.ghost-button,
	.danger-button,
	.activate-button,
	.text-button {
		min-height: 32px;
		border-radius: 0;
		padding: 0 12px;
		font-size: 11px;
		font-weight: 900;
		box-shadow: none;
		letter-spacing: 0;
	}

	.primary-button {
		background: #2563eb;
		color: #ffffff;
	}

	.ghost-button {
		background: rgba(255, 255, 255, 0.06);
		border: 0;
		color: var(--text-primary);
	}

	.ghost-button.small,
	.primary-button.small,
	.danger-button.small {
		min-height: 30px;
		padding: 0 10px;
		font-size: 11px;
	}

	.danger-button {
		background: #dc2626;
		color: #ffffff;
	}

	.activate-button {
		background: #16a34a;
		color: #ffffff;
	}

	.primary-button:hover,
	.ghost-button:hover,
	.danger-button:hover,
	.activate-button:hover,
	.text-button:hover {
		transform: none;
		filter: brightness(0.98);
	}

	.alert-card,
	.status-box {
		margin-top: 14px;
		border-radius: 10px;
		padding: 10px 12px;
		font-size: 12px;
		font-weight: 900;
	}

	.alert-card button {
		width: 24px;
		height: 24px;
		border-radius: 999px;
		font-size: 16px;
	}

	.success-alert {
		background: var(--color-success-muted);
		border: 1px solid #bbf7d0;
		color: #047857;
	}

	.error-alert {
		background: var(--color-danger-muted);
		border: 1px solid #fecaca;
		color: #b91c1c;
	}

	.loader {
		border-color: #dbeafe;
		border-top-color: #2563eb;
	}

	.admin-tabs {
		gap: 8px;
		margin-top: 14px;
		padding: 8px;
		overflow-x: auto;
	}

	.admin-tabs button {
		min-height: 32px;
		border-radius: 0;
		padding: 0 12px;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 900;
		white-space: nowrap;
	}

	.admin-tabs button.active-tab {
		background: transparent;
		color: #ffffff;
		box-shadow: none;
	}

	.summary-grid {
		gap: 14px;
		margin-top: 14px;
	}

	.summary-card {
		min-height: 96px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.summary-card span,
	.data-received-card span,
	.panel-title-row p,
	.editor-toolbar p,
	.access-head p,
	.permission-header p,
	.permission-group-head p,
	.engine-preview-card p,
	.reporting-empty-card p,
	.reporting-section-card p,
	.global-audit-header p,
	.global-audit-table-head span {
		color: var(--text-secondary);
	}

	.summary-card span {
		font-size: 11px;
		font-weight: 900;
	}

	.summary-card strong {
		margin-top: 10px;
		font-size: 22px;
		line-height: 1.1;
		font-weight: 900;
	}

	.admin-workspace,
	.vessel-admin-workspace,
	.asset-admin-workspace,
	.engine-curve-admin-workspace,
	.reporting-admin-workspace,
	.global-audit-workspace {
		gap: 14px;
		margin-top: 14px;
	}

	.users-panel,
	.vessel-list-panel,
	.asset-list-panel,
	.engine-curve-list-panel,
	.reporting-vessel-panel {
		top: 14px;
		max-height: calc(100vh - 238px);
	}

	.panel-title-row,
	.editor-toolbar,
	.global-audit-header,
	.permission-header,
	.access-head,
	.reporting-section-head,
	.engine-curve-detail-head {
		gap: 12px;
	}

	.panel-title-row,
	.editor-toolbar,
	.global-audit-header {
		min-height: 58px;
		padding: 12px 14px;
		border-bottom: 1px solid #e5edf5;
	}

	.editor-panel,
	.asset-editor-panel,
	.vessel-editor-panel,
	.engine-curve-editor-panel,
	.reporting-editor-panel,
	.global-audit-panel {
		padding: 0;
		overflow: hidden;
	}

	.editor-panel > :not(.editor-toolbar),
	.asset-editor-panel > :not(.editor-toolbar),
	.vessel-editor-panel > :not(.editor-toolbar),
	.engine-curve-editor-panel > :not(.editor-toolbar),
	.reporting-editor-panel > :not(.editor-toolbar),
	.global-audit-panel > :not(.global-audit-header) {
		margin-left: 14px;
		margin-right: 14px;
	}

	.editor-panel > :last-child,
	.asset-editor-panel > :last-child,
	.vessel-editor-panel > :last-child,
	.engine-curve-editor-panel > :last-child,
	.reporting-editor-panel > :last-child,
	.global-audit-panel > :last-child {
		margin-bottom: 14px;
	}

	.panel-title-row h2,
	.editor-toolbar h2,
	.global-audit-header h2,
	.reporting-empty-card h2,
	.reporting-section-card h3,
	.access-head h3,
	.permission-header h3,
	.engine-preview-card h3,
	.engine-curve-detail-head h3 {
		color: var(--text-primary);
		font-weight: 900;
		letter-spacing: 0;
	}

	.panel-title-row h2,
	.editor-toolbar h2,
	.global-audit-header h2 {
		font-size: 17px;
	}

	.panel-title-row p,
	.editor-toolbar p,
	.global-audit-header p,
	.reporting-empty-card p,
	.reporting-section-card p,
	.access-head p,
	.permission-header p,
	.permission-group-head p,
	.engine-preview-card p {
		font-size: 12px;
		font-weight: 700;
		line-height: 1.45;
	}

	.search-input,
	.reporting-filter-box input,
	.reporting-filter-box select,
	input,
	textarea,
	select {
		border: 1px solid #cbd5e1;
		border-radius: 0;
		background: var(--color-surface);
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 700;
		box-shadow: none;
	}

	.search-input,
	input,
	select {
		min-height: 32px;
		height: 32px;
		padding: 0 9px;
	}

	textarea {
		min-height: 76px;
		padding: 9px;
	}

	.search-input {
		width: calc(100% - 28px);
		margin: 12px 14px;
	}

	label span,
	.filter-card label span {
		margin-bottom: 5px;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0;
		text-transform: uppercase;
	}

	.search-input:focus,
	input:focus,
	textarea:focus,
	select:focus {
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
	}

	.users-list,
	.vessel-list,
	.asset-list,
	.engine-curve-list,
	.reporting-vessel-list {
		padding: 0 10px 12px;
	}

	.user-row,
	.vessel-row,
	.asset-row,
	.engine-curve-row,
	.reporting-vessel-row,
	.telegram-row,
	.audit-log-row,
	.option-chip,
	.permission-group,
	.engine-grid article,
	.curve-meta-grid article,
	.engine-curve-engine-card,
	.telegram-form-card,
	.global-audit-table-head div {
		border: 1px solid #d9e2ec;
		border-radius: 10px;
		background: var(--color-surface);
		box-shadow: none;
	}

	.user-row,
	.vessel-row,
	.asset-row,
	.engine-curve-row,
	.reporting-vessel-row,
	.telegram-row {
		padding: 10px 12px;
	}

	.user-row:hover,
	.vessel-row:hover,
	.asset-row:hover,
	.engine-curve-row:hover,
	.reporting-vessel-row:hover,
	.telegram-row:hover,
	.selected-user,
	.engine-curve-row.selected-user,
	.reporting-vessel-row.selected-user,
	.telegram-row.selected-user {
		border-color: #bfdbfe;
		background: var(--color-accent-muted);
		transform: none;
	}

	.user-main strong,
	.vessel-row strong,
	.asset-row strong,
	.engine-curve-row strong,
	.reporting-vessel-row strong,
	.telegram-row strong,
	.permission-item strong,
	.engine-grid strong,
	.audit-log-row strong,
	.global-audit-table-wrap td strong {
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 900;
	}

	.user-main span,
	.vessel-row span,
	.asset-row span,
	.engine-curve-row span,
	.reporting-vessel-row span,
	.audit-log-row span {
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
	}

	.user-main small,
	.vessel-row small,
	.asset-row small,
	.engine-curve-row small,
	.reporting-vessel-row small,
	.telegram-row small,
	.global-audit-table-wrap td small {
		color: var(--text-secondary);
		font-size: 11px;
	}

	.active-badge,
	.inactive-badge,
	.action-badge,
	.vessel-row em,
	.engine-curve-row em,
	.reporting-vessel-row em,
	.telegram-row em,
	.permission-item em,
	.global-audit-table-head div,
	.mini-loading {
		border-radius: 999px;
		font-size: 11px;
		font-weight: 900;
	}

	.mini-loading {
		background: var(--color-accent-muted);
		color: #1d4ed8;
	}

	.access-card,
	.permission-panel,
	.vessel-form-card,
	.asset-form-card,
	.engine-preview-card,
	.engine-curve-form-card,
	.engine-curve-detail-card,
	.reporting-empty-card,
	.reporting-section-card,
	.global-audit-filter-card,
	.global-audit-table-card,
	.ae-value-box,
	.muted-box,
	.empty-box,
	.vessel-note,
	.asset-note,
	.engine-curve-note {
		border: 1px solid #d9e2ec;
		border-radius: 12px;
		background: var(--color-elevated);
		box-shadow: none;
	}

	.option-chip,
	.permission-group,
	.engine-grid article,
	.curve-meta-grid article,
	.engine-curve-engine-card,
	.telegram-form-card,
	.audit-log-row,
	.global-audit-table-head div,
	.muted-box,
	.empty-box,
	.vessel-note,
	.asset-note,
	.engine-curve-note {
		background: var(--color-surface);
	}

	.permission-group-head {
		border-bottom: 1px solid #e5edf5;
		background: var(--color-surface);
	}

	.permission-item,
	.global-audit-table-wrap th,
	.global-audit-table-wrap td,
	.range-table-wrap th,
	.range-table-wrap td {
		border-bottom: 1px solid #eef2f7;
	}

	.permission-item code,
	.vessel-note code,
	.asset-note code,
	.engine-grid code,
	.engine-curve-engine-card code,
	.global-audit-table-wrap code {
		border-radius: 6px;
		background: var(--color-accent-muted);
		color: #1d4ed8;
		font-size: 11px;
		font-weight: 900;
	}

	.text-button {
		background: transparent;
		color: #2563eb;
		padding: 0;
	}

	.boxed-switch {
		min-height: 32px;
		border: 1px solid #cbd5e1;
		border-radius: 0;
		background: var(--color-surface);
	}

	.checkbox-line input,
	.option-chip input,
	.permission-item input,
	.switch-line input {
		accent-color: #2563eb;
	}

	.global-audit-filter-card,
	.global-audit-table-card {
		margin-top: 14px;
		padding: 14px;
	}

	.global-audit-table-wrap,
	.range-table-wrap {
		border: 1px solid #d9e2ec;
		border-radius: 12px;
		background: var(--color-surface);
	}

	.global-audit-table-wrap th,
	.range-table-wrap th {
		background: var(--color-elevated);
		color: var(--text-secondary);
		font-size: 10.5px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.global-audit-table-wrap td,
	.range-table-wrap td {
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 700;
	}

	.global-audit-table-wrap tr:hover td,
	.range-table-wrap tr:hover td {
		background: var(--color-elevated);
	}

	.create-action,
	.active-badge,
	.engine-curve-row em.active-curve,
	.reporting-vessel-row em.active-reporting,
	.telegram-row em.active-reporting {
		background: #dcfce7;
		color: #166534;
	}

	.user-row.selected-user,
	.vessel-row.selected-user,
	.asset-row.selected-user,
	.engine-curve-row.selected-user,
	.reporting-vessel-row.selected-user,
	.cctv-vessel-row.selected-user,
	.telegram-row.selected-user {
		position: relative;
		border-color: rgba(59, 130, 246, 0.78) !important;
		background:
			linear-gradient(135deg, rgba(37, 99, 235, 0.26), rgba(14, 165, 233, 0.08)),
			var(--color-accent-muted) !important;
		box-shadow:
			inset 4px 0 0 #3b82f6,
			0 12px 28px rgba(37, 99, 235, 0.16) !important;
		transform: translateY(-1px);
	}

	.user-row.selected-user strong,
	.vessel-row.selected-user strong,
	.asset-row.selected-user strong,
	.engine-curve-row.selected-user strong,
	.reporting-vessel-row.selected-user strong,
	.cctv-vessel-row.selected-user strong,
	.telegram-row.selected-user strong {
		color: #eff6ff !important;
	}

	.update-action {
		background: var(--color-accent-muted);
		color: #1d4ed8;
	}

	.delete-action,
	.inactive-badge {
		background: var(--color-danger-muted);
		color: #991b1b;
	}

	.global-audit-pagination span {
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 800;
	}

	@media (max-width: 760px) {
		.administrator-page {
			padding: 10px;
		}

		.admin-header-card,
		.editor-toolbar,
		.permission-header,
		.global-audit-header {
			align-items: stretch;
			flex-direction: column;
		}

		.admin-tabs {
			flex-direction: column;
			align-items: stretch;
		}

		.admin-tabs button,
		.primary-button,
		.ghost-button,
		.danger-button,
		.activate-button {
			width: 100%;
		}
	}


	@media (max-width: 760px) {
		.admin-tab-indicator {
			display: none;
		}

		.admin-tabs button.active-tab {
			background: #1d4eda;
			box-shadow: 0 10px 18px rgba(15, 118, 110, 0.16);
		}
	}

</style>
