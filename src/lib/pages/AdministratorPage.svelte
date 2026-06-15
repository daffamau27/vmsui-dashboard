<script>
	import { onMount } from 'svelte';
	import { getCurrentUserApi } from '$lib/api/authApi.js';
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
		deleteVesselAdminApi,
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

	let vessels = [];
	let vesselsLoading = false;
	let vesselSaving = false;
	let vesselActionLoadingId = null;
	let selectedVessel = null;
	let vesselMode = 'create';
	let searchVessel = '';

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
			showAlert('error', error.message || 'Gagal memuat audit logs.');
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

			showAlert('success', 'CSV global audit logs berhasil diunduh.');
		} catch (error) {
			showAlert('error', error.message || 'Gagal export global audit logs.');
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

	let autoReportForm = {
		isEnabled: false,
		sendTime: '08:00',
		timezoneMode: 'auto',
		timezoneOffset: '+00:00',
		picText: '',
		ccText: '',
		bccText: ''
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
		vesselIdsText: '',
		alarmKeys: []
	};

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
					(vessel) => vessel.id === selectedReportingVessel.id
				);

				if (refreshed) {
					openReportingVessel(refreshed);
				}
			}
		} finally {
			reportingVesselsLoading = false;
		}
	}

	function openReportingVessel(vessel) {
		selectedReportingVessel = vessel;

		const autoReport = vessel?.auto_report || {};
		const recipients = autoReport?.recipients || {};
		const engineHealth = vessel?.engine_health || {};

		autoReportForm = {
			isEnabled: Boolean(autoReport.is_enabled),
			sendTime: autoReport.send_time || '08:00',
			timezoneMode: autoReport.timezone_mode || 'auto',
			timezoneOffset: autoReport.timezone_offset || '+00:00',
			picText: (recipients.pic || []).join(', '),
			ccText: (recipients.cc || []).join(', '),
			bccText: (recipients.bcc || []).join(', ')
		};

		engineHealthForm = {
			isEnabled: Boolean(engineHealth.is_enabled),
			oilPressureMin: engineHealth.oil_pressure_min ?? '',
			oilPressureMax: engineHealth.oil_pressure_max ?? '',
			oilTemperatureMax: engineHealth.oil_temperature_max ?? '',
			coolantTemperatureMin: engineHealth.coolant_temperature_min ?? '',
			coolantTemperatureMax: engineHealth.coolant_temperature_max ?? ''
		};

		clearAlert();
	}

	function buildAutoReportPayload() {
		return {
			isEnabled: Boolean(autoReportForm.isEnabled),
			sendTime: autoReportForm.sendTime || '08:00',
			recipients: {
				pic: parseTextList(autoReportForm.picText),
				cc: parseTextList(autoReportForm.ccText),
				bcc: parseTextList(autoReportForm.bccText)
			},
			timezoneMode: autoReportForm.timezoneMode || 'auto',
			timezoneOffset: autoReportForm.timezoneOffset || '+00:00'
		};
	}

	async function saveAutoReportConfig() {
		if (!selectedReportingVessel?.id) {
			showAlert('error', 'Pilih vessel terlebih dahulu.');
			return;
		}

		reportingSaving = true;
		clearAlert();

		try {
			await saveAutoReportConfigAdminApi(selectedReportingVessel.id, buildAutoReportPayload());

			showAlert('success', 'Konfigurasi auto-report berhasil disimpan.');
			await loadReportingVessels();
		} catch (error) {
			showAlert('error', error.message || 'Gagal menyimpan konfigurasi auto-report.');
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
			showAlert('error', 'Pilih vessel terlebih dahulu.');
			return;
		}

		reportingSaving = true;
		clearAlert();

		try {
			await saveEngineHealthConfigAdminApi(selectedReportingVessel.id, buildEngineHealthPayload());

			showAlert('success', 'Konfigurasi engine health berhasil disimpan.');
			await loadReportingVessels();
		} catch (error) {
			showAlert('error', error.message || 'Gagal menyimpan konfigurasi engine health.');
		} finally {
			reportingSaving = false;
		}
	}

	async function downloadManualDailyReport() {
		if (!selectedReportingVessel?.id) {
			showAlert('error', 'Pilih vessel terlebih dahulu.');
			return;
		}

		if (!manualReportDate) {
			showAlert('error', 'Tanggal report wajib diisi.');
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

			showAlert('success', 'Daily report berhasil diunduh.');
		} catch (error) {
			showAlert('error', error.message || 'Gagal download daily report.');
		} finally {
			reportingActionLoadingId = null;
		}
	}

	async function sendManualDailyReportEmail() {
		if (!selectedReportingVessel?.id) {
			showAlert('error', 'Pilih vessel terlebih dahulu.');
			return;
		}

		reportingActionLoadingId = `send-${selectedReportingVessel.id}`;
		clearAlert();

		try {
			await sendReportingDailyReportEmailAdminApi(selectedReportingVessel.id, {
				date: manualReportDate || undefined
			});

			showAlert('success', 'Daily report berhasil dikirim via email.');
		} catch (error) {
			showAlert('error', error.message || 'Gagal mengirim daily report email.');
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
			vesselIdsText: '',
			alarmKeys: []
		};

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
				vesselIdsText: (detail?.rules?.vesselId || []).join(', '),
				alarmKeys: detail?.rules?.alarmKeys || []
			};
		} catch (error) {
			showAlert('error', error.message || 'Gagal mengambil detail Telegram group.');
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
				vesselId: parseIds(telegramForm.vesselIdsText),
				alarmKeys: telegramForm.alarmKeys
			}
		};
	}

	function validateTelegramForm() {
		if (!telegramForm.name.trim()) return 'Nama Telegram group wajib diisi.';
		if (!telegramForm.chatId.trim()) return 'Chat ID wajib diisi.';
		if (parseIds(telegramForm.vesselIdsText).length === 0) {
			return 'Minimal 1 vessel ID wajib dipilih.';
		}
		if (telegramForm.alarmKeys.length === 0) {
			return 'Minimal 1 alarm key wajib dipilih.';
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

				showAlert('success', 'Telegram group berhasil dibuat.');
				await loadTelegramGroups();
				await openEditTelegramGroupForm(created);
			} else if (selectedTelegramGroup?.id) {
				const updated = await updateTelegramGroupAdminApi(selectedTelegramGroup.id, payload);

				showAlert('success', 'Telegram group berhasil diperbarui.');
				await loadTelegramGroups();
				await openEditTelegramGroupForm(updated);
			}

			await loadReportingVessels();
		} catch (error) {
			showAlert('error', error.message || 'Gagal menyimpan Telegram group.');
		} finally {
			telegramSaving = false;
		}
	}

	async function deleteTelegramGroup(group) {
		if (!group?.id) return;

		const confirmed = window.confirm(`Hapus Telegram group "${group.name}"?`);

		if (!confirmed) return;

		telegramActionLoadingId = group.id;
		clearAlert();

		try {
			await deleteTelegramGroupAdminApi(group.id);

			showAlert('success', 'Telegram group berhasil dihapus.');

			if (selectedTelegramGroup?.id === group.id) {
				openCreateTelegramGroupForm();
			}

			await loadTelegramGroups();
			await loadReportingVessels();
		} catch (error) {
			showAlert('error', error.message || 'Gagal menghapus Telegram group.');
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
			showAlert('success', 'CSV audit log berhasil diunduh.');
		} catch (error) {
			showAlert('error', error.message || 'Gagal export CSV audit log.');
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
				reject(new Error('File Excel tidak ditemukan.'));
				return;
			}

			const reader = new FileReader();

			reader.onload = () => {
				const result = String(reader.result || '');

				const base64 = result.includes(',') ? result.split(',').pop() : result;

				resolve(base64);
			};

			reader.onerror = () => {
				reject(new Error('Gagal membaca file Excel.'));
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
			showAlert('error', 'File harus berupa Excel dengan format .xlsx atau .xls.');

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
			assetName: ''
		};
	}

	let assetForm = createEmptyAssetForm();

	$: filteredAssets = assets.filter((asset) => {
		const keyword = searchAsset.trim().toLowerCase();

		if (!keyword) return true;

		return [
			asset?.id ? String(asset.id) : '',
			asset?.assetId,
			asset?.assetName,
			asset?.thingsboardName
		]
			.filter(Boolean)
			.some((value) => String(value).toLowerCase().includes(keyword));
	});

	function createEmptyVesselForm() {
		return {
			deviceId: '',
			vesselName: '',
			companyId: ''
		};
	}

	let vesselForm = createEmptyVesselForm();

	$: filteredVessels = vessels.filter((vessel) => {
		const keyword = searchVessel.trim().toLowerCase();

		if (!keyword) return true;

		return [
			vessel?.id ? String(vessel.id) : '',
			vessel?.deviceId,
			vessel?.vesselName,
			vessel?.companyId ? String(vessel.companyId) : ''
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

	$: permissionModules = [
		{ moduleKey: 'all', moduleLabel: 'All Permissions' },
		...moduleGroups.map((group) => ({
			moduleKey: group.moduleKey,
			moduleLabel: group.moduleLabel
		}))
	];

	$: visiblePermissionGroups = moduleGroups
		.filter((group) => activeModule === 'all' || group.moduleKey === activeModule)
		.map((group) => ({
			...group,
			permissions: group.permissions.filter((permission) => matchPermission(permission))
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
	});

	async function initializePage() {
		bootLoading = true;
		alert = null;

		const results = await Promise.allSettled([
			loadCurrentUser(),
			loadUsers(),
			loadPermissions(),
			loadVessels(),
			loadAssets(),
			loadEngineCurves(),
			loadReportingVessels(),
			loadTelegramGroups(),
			loadAutoReportAuditLogs(),
			loadGlobalAuditLogs()
		]);

		const failed = results.find((result) => result.status === 'rejected');

		if (failed) {
			showAlert('error', failed.reason?.message || 'Gagal memuat sebagian data administrator.');
		}

		bootLoading = false;
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
				sublabel: asset.thingsboardName || asset.assetId || ''
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
			companyId: vessel?.companyId ?? ''
		};

		clearAlert();
	}

	function validateVesselForm() {
		if (!vesselForm.deviceId.trim()) {
			return 'Device ID wajib diisi.';
		}

		if (!vesselForm.vesselName.trim()) {
			return 'Vessel name wajib diisi.';
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

				showAlert(
					'success',
					'Vessel berhasil dibuat. Engine akan otomatis diekstrak dari telemetry ThingsBoard.'
				);

				await loadVessels();
				openEditVesselForm(created);
			} else if (selectedVessel?.id) {
				const updated = await updateVesselAdminApi(selectedVessel.id, payload);

				showAlert(
					'success',
					'Vessel berhasil diperbarui. Jika Device ID berubah, engine otomatis direfresh.'
				);

				await loadVessels();
				openEditVesselForm(updated);
			}
		} catch (error) {
			showAlert('error', error.message || 'Gagal menyimpan vessel.');
		} finally {
			vesselSaving = false;
		}
	}

	async function deleteVessel(vessel) {
		if (!vessel?.id) return;

		const confirmed = window.confirm(
			`Hapus vessel "${vessel.vesselName}"? Engine dan assignment terkait akan ikut terhapus.`
		);

		if (!confirmed) return;

		vesselActionLoadingId = vessel.id;
		clearAlert();

		try {
			await deleteVesselAdminApi(vessel.id);

			showAlert('success', 'Vessel berhasil dihapus.');

			if (selectedVessel?.id === vessel.id) {
				openCreateVesselForm();
			}

			await loadVessels();
		} catch (error) {
			showAlert('error', error.message || 'Gagal menghapus vessel.');
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
				sublabel: asset.assetId || asset.thingsboardName || ''
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
				assetName: detail?.assetName || detail?.thingsboardName || ''
			};
		} catch (error) {
			showAlert('error', error.message || 'Gagal mengambil detail asset.');
		}
	}

	function validateAssetForm() {
		if (!assetForm.assetId.trim()) {
			return 'Asset ID wajib diisi.';
		}

		if (!assetForm.assetName.trim()) {
			return 'Asset name wajib diisi.';
		}

		return null;
	}

	function buildAssetPayload() {
		return {
			assetId: assetForm.assetId.trim(),
			assetName: assetForm.assetName.trim()
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

				showAlert('success', 'Asset berhasil dibuat.');
				await loadAssets();
				await openEditAssetForm(created);
			} else if (selectedAsset?.id) {
				const updated = await updateAssetAdminApi(selectedAsset.id, payload);

				showAlert('success', 'Asset berhasil diperbarui.');
				await loadAssets();
				await openEditAssetForm(updated);
			}
		} catch (error) {
			showAlert('error', error.message || 'Gagal menyimpan asset.');
		} finally {
			assetSaving = false;
		}
	}

	async function deleteAsset(asset) {
		if (!asset?.id) return;

		const confirmed = window.confirm(`Hapus asset "${asset.assetName || asset.assetId}"?`);

		if (!confirmed) return;

		assetActionLoadingId = asset.id;
		clearAlert();

		try {
			await deleteAssetAdminApi(asset.id);

			showAlert('success', 'Asset berhasil dihapus.');

			if (selectedAsset?.id === asset.id) {
				openCreateAssetForm();
			}

			await loadAssets();
		} catch (error) {
			showAlert('error', error.message || 'Gagal menghapus asset.');
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
			return 'Vessel wajib dipilih.';
		}

		if (!engineCurveForm.curveType) {
			return 'Curve type wajib dipilih.';
		}

		if (!engineCurveForm.curveName.trim()) {
			return 'Curve name wajib diisi.';
		}

		if (!engineCurveForm.file) {
			return 'File Excel wajib dipilih.';
		}

		return null;
	}

	async function downloadEngineCurveTemplate() {
		clearAlert();

		const vesselId = engineCurveForm.vesselId;

		if (!vesselId) {
			showAlert('error', 'Pilih vessel terlebih dahulu untuk download template.');
			return;
		}

		try {
			await downloadEngineCurveTemplateAdminApi(vesselId);
			showAlert('success', 'Template engine curve berhasil diunduh.');
		} catch (error) {
			showAlert('error', error.message || 'Gagal download template engine curve.');
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

			showAlert('success', 'Engine curve berhasil diimport.');

			resetEngineCurveForm();
			await loadEngineCurves();
		} catch (error) {
			showAlert('error', error.message || 'Gagal import engine curve.');
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
			showAlert('error', error.message || 'Gagal mengambil detail engine curve.');
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
				? `Aktifkan curve "${curve.curve_name}"? Curve lain dengan tipe yang sama pada vessel ini akan dinonaktifkan.`
				: `Nonaktifkan curve "${curve.curve_name}"?`
		);

		if (!confirmed) return;

		engineCurveActionLoadingId = curveId;
		clearAlert();

		try {
			await toggleEngineCurveActiveAdminApi(curveId, nextStatus);

			showAlert(
				'success',
				nextStatus ? 'Engine curve berhasil diaktifkan.' : 'Engine curve berhasil dinonaktifkan.'
			);

			await loadEngineCurves();

			if (selectedEngineCurve && getCurveId(selectedEngineCurve) === curveId) {
				await openEngineCurveDetail({
					...curve,
					is_active: nextStatus
				});
			}
		} catch (error) {
			showAlert('error', error.message || 'Gagal mengubah status engine curve.');
		} finally {
			engineCurveActionLoadingId = null;
		}
	}

	async function deleteEngineCurve(curve) {
		const curveId = getCurveId(curve);

		if (!curveId) return;

		const confirmed = window.confirm(`Hapus engine curve "${curve.curve_name}"?`);

		if (!confirmed) return;

		engineCurveActionLoadingId = curveId;
		clearAlert();

		try {
			await deleteEngineCurveAdminApi(curveId);

			showAlert('success', 'Engine curve berhasil dihapus.');

			if (selectedEngineCurve && getCurveId(selectedEngineCurve) === curveId) {
				selectedEngineCurve = null;
				selectedEngineCurveDetail = null;
			}

			await loadEngineCurves();
		} catch (error) {
			showAlert('error', error.message || 'Gagal menghapus engine curve.');
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

		return new Intl.DateTimeFormat('id-ID', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(date);
	}

	function matchPermission(permission) {
		const keyword = searchPermission.trim().toLowerCase();

		if (!keyword) return true;

		return [
			permission?.key,
			permission?.label,
			permission?.description,
			permission?.moduleLabel,
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
			const detail = await getUserDetailApi(user.id);

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
			showAlert('error', error.message || 'Gagal mengambil detail user.');
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
		if (!form.name.trim()) return 'Nama wajib diisi.';
		if (!form.username.trim()) return 'Username wajib diisi.';

		if (mode === 'create' && !form.password.trim()) {
			return 'Password wajib diisi saat membuat user baru.';
		}

		if (form.assetAccessMode === 'selected' && parseIds(form.assetIdsText).length === 0) {
			return 'Asset access mode selected membutuhkan minimal 1 asset ID.';
		}

		if (form.vesselAccessMode === 'selected' && parseIds(form.vesselIdsText).length === 0) {
			return 'Vessel access mode selected membutuhkan minimal 1 vessel ID.';
		}

		if (form.permissionAccessMode === 'selected' && form.selectedPermissions.length === 0) {
			return 'Permission access mode selected membutuhkan minimal 1 permission.';
		}

		return null;
	}

	function buildPayload() {
		const payload = {
			name: form.name.trim(),
			username: form.username.trim(),
			email: form.email.trim() || null,
			assetAccess: buildAccessPayload('asset'),
			vesselAccess: buildAccessPayload('vessel'),
			permissionAccess: buildAccessPayload('permission')
		};

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
				const created = await createUserApi(payload);

				showAlert('success', 'User berhasil dibuat.');
				await loadUsers();
				await openEditForm(created);
			} else if (selectedUser?.id) {
				const updated = await updateUserApi(selectedUser.id, payload);

				selectedUser = updated;
				showAlert('success', 'User berhasil diperbarui.');
				await loadUsers();
			}
		} catch (error) {
			showAlert('error', error.message || 'Gagal menyimpan user.');
		} finally {
			saving = false;
		}
	}

	async function toggleUserStatus(user) {
		if (!user?.id) return;

		const isInactive = Boolean(user.deletedAt);

		const confirmMessage = isInactive
			? `Aktifkan kembali user "${user.name}"?`
			: `Nonaktifkan user "${user.name}"?`;

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
				isInactive ? 'User berhasil diaktifkan.' : 'User berhasil dinonaktifkan.'
			);

			await loadUsers();

			if (selectedUser?.id === user.id) {
				await openEditForm({ id: user.id });
			}
		} catch (error) {
			showAlert('error', error.message || 'Gagal mengubah status user.');
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
</script>

<section class="administrator-page">
	<section class="admin-header-card">
		<div>
			<div class="page-kicker">Super Admin</div>
			<h1>Administrator Management</h1>
			<p>
				Kelola akun user, akses vessel, akses asset, permission module, dan registry vessel dari
				satu halaman.
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
			<div class="loader"></div>
			<p>Memuat data administrator...</p>
		</section>
	{:else if currentUser && !isSuperAdmin}
		<section class="state-card danger-state">
			<h2>Akses Ditolak</h2>
			<p>
				Halaman ini hanya untuk Super Admin. Pastikan user login memiliki
				<code>permissionAccess.mode = all</code>.
			</p>
		</section>
	{:else}
		<section class="admin-tabs">
			<button
				type="button"
				class:active-tab={activeAdminTab === 'users'}
				on:click={() => (activeAdminTab = 'users')}
			>
				User Access
			</button>

			<button
				type="button"
				class:active-tab={activeAdminTab === 'vessels'}
				on:click={() => (activeAdminTab = 'vessels')}
			>
				Vessel Registry
			</button>

			<button
				type="button"
				class:active-tab={activeAdminTab === 'assets'}
				on:click={() => (activeAdminTab = 'assets')}
			>
				Asset Registry
			</button>

			<button
				type="button"
				class:active-tab={activeAdminTab === 'engine-curves'}
				on:click={() => (activeAdminTab = 'engine-curves')}
			>
				Engine Curves
			</button>
			<button
				type="button"
				class:active-tab={activeAdminTab === 'reporting'}
				on:click={() => (activeAdminTab = 'reporting')}
			>
				Reporting
			</button>
			<button
				type="button"
				class:active-tab={activeAdminTab === 'global-audit-logs'}
				on:click={() => (activeAdminTab = 'global-audit-logs')}
			>
				Audit Logs
			</button>
		</section>

		{#if activeAdminTab === 'users'}
			<section class="admin-workspace">
				<aside class="users-panel">
					<div class="panel-title-row">
						<div>
							<h2>Users</h2>
							<p>{filteredUsers.length} dari {users.length} user</p>
						</div>

						{#if usersLoading}
							<span class="mini-loading">Loading</span>
						{/if}
					</div>

					<input
						class="search-input"
						type="search"
						bind:value={searchUser}
						placeholder="Cari nama, username, email..."
					/>

					<div class="users-list">
						{#if filteredUsers.length === 0}
							<div class="empty-box">User tidak ditemukan.</div>
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
									? 'Isi data user baru dan tentukan aksesnya.'
									: selectedUserLoading
										? 'Memuat detail user...'
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
								placeholder={mode === 'create' ? 'Password user' : 'Isi jika ingin ubah password'}
								autocomplete="new-password"
							/>

							{#if mode === 'edit'}
								<small class="field-help"> Kosongkan jika tidak ingin mengubah password. </small>
							{/if}
						</label>
					</div>

					<section class="access-grid">
						<article class="access-card">
							<div class="access-head">
								<div>
									<h3>Asset Access</h3>
									<p>Gunakan mode all atau selected.</p>
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
										Daftar asset tidak tersedia dari current-user. Masukkan ID asset secara manual.
									</div>
								{/if}
							{:else}
								<div class="muted-box">User akan mendapat akses ke semua asset.</div>
							{/if}
						</article>

						<article class="access-card">
							<div class="access-head">
								<div>
									<h3>Vessel Access</h3>
									<p>Batasi user berdasarkan vessel.</p>
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
										Daftar vessel tidak tersedia dari current-user. Masukkan ID vessel secara
										manual.
									</div>
								{/if}
							{:else}
								<div class="muted-box">User akan mendapat akses ke semua vessel.</div>
							{/if}
						</article>
					</section>

					<section class="permission-panel">
						<div class="permission-header">
							<div>
								<h3>Permission Access</h3>
								<p>
									Dipilih: <strong>{form.selectedPermissions.length}</strong> permission.
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
									placeholder="Cari permission key, label, deskripsi..."
								/>
							</div>

							{#if permissionsLoading}
								<div class="empty-box">Memuat katalog permission...</div>
							{:else if visiblePermissionGroups.length === 0}
								<div class="empty-box">Permission tidak ditemukan.</div>
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
							<div class="muted-box large">User akan mendapat semua permission.</div>
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
							<p>{filteredVessels.length} dari {vessels.length} vessel</p>
						</div>

						{#if vesselsLoading}
							<span class="mini-loading">Loading</span>
						{/if}
					</div>

					<input
						class="search-input"
						type="search"
						bind:value={searchVessel}
						placeholder="Cari vessel, device ID, company ID..."
					/>

					<div class="vessel-list">
						{#if filteredVessels.length === 0}
							<div class="empty-box">Vessel tidak ditemukan.</div>
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
										<small>{vessel.deviceId || '-'}</small>
									</div>

									<em>{vessel.companyId ?? 'No Company'}</em>
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
									? 'Daftarkan vessel baru berdasarkan Device ID ThingsBoard.'
									: `Editing ${selectedVessel?.vesselName || 'vessel'}`}
							</p>
						</div>

						<button class="primary-button" type="button" on:click={openCreateVesselForm}>
							+ New Vessel
						</button>
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
								<span>Company ID</span>
								<input
									type="number"
									bind:value={vesselForm.companyId}
									placeholder="Kosongkan jika null"
								/>
							</label>
						</div>

						<div class="vessel-note">
							<strong>Catatan:</strong>
							saat create/update vessel, backend hanya menerima
							<code>deviceId</code>, <code>vesselName</code>, dan <code>companyId</code>. Engine
							akan otomatis diambil dari telemetry ThingsBoard.
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

					{#if selectedVessel?.engines?.length}
						<section class="engine-preview-card">
							<div>
								<h3>Detected Engines</h3>
								<p>Engine hasil ekstraksi dari ThingsBoard telemetry keys.</p>
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
							<p>{filteredAssets.length} dari {assets.length} asset</p>
						</div>

						{#if assetsLoading}
							<span class="mini-loading">Loading</span>
						{/if}
					</div>

					<input
						class="search-input"
						type="search"
						bind:value={searchAsset}
						placeholder="Cari asset name, asset ID..."
					/>

					<div class="asset-list">
						{#if filteredAssets.length === 0}
							<div class="empty-box">Asset tidak ditemukan.</div>
						{:else}
							{#each filteredAssets as asset}
								<button
									type="button"
									class:selected-user={selectedAsset?.id === asset.id}
									class="asset-row"
									on:click={() => openEditAssetForm(asset)}
								>
									<div>
										<strong>{asset.assetName || asset.thingsboardName || '-'}</strong>
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
									? 'Daftarkan asset baru berdasarkan Asset ID ThingsBoard.'
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
						</div>

						<div class="asset-note">
							<strong>Catatan:</strong>
							backend asset menerima <code>assetId</code> dan <code>assetName</code>. Pastikan
							<code>assetId</code> sesuai dengan Asset ID dari ThingsBoard.
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
							<p>{filteredEngineCurves.length} dari {engineCurves.length} curve</p>
						</div>

						{#if engineCurvesLoading}
							<span class="mini-loading">Loading</span>
						{/if}
					</div>

					<input
						class="search-input"
						type="search"
						bind:value={searchEngineCurve}
						placeholder="Cari curve, vessel, type..."
					/>

					<div class="engine-curve-list">
						{#if filteredEngineCurves.length === 0}
							<div class="empty-box">Engine curve tidak ditemukan.</div>
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
								Download template sesuai vessel, isi Excel, lalu import sebagai engine maker atau
								EMS curve.
							</p>
						</div>
					</div>

					<section class="engine-curve-form-card">
						<div class="form-grid engine-curve-form-grid">
							<label>
								<span>Vessel</span>
								<select bind:value={engineCurveForm.vesselId}>
									<option value="">Pilih vessel</option>
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
							<span>Aktifkan curve setelah import</span>
						</label>

						<div class="engine-curve-note">
							<strong>Catatan:</strong>
							template harus dibuat dari vessel yang sama. Main Engine mendukung RPM range, sedangkan
							Auxiliary Engine memakai satu nilai L/H tetap pada baris pertama.
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
							<div class="loader"></div>
							<p>Memuat detail engine curve...</p>
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
							<span class="mini-loading">Loading</span>
						{/if}
					</div>

					<div class="reporting-filter-box">
						<input
							type="search"
							bind:value={reportingFilters.search}
							placeholder="Cari vessel..."
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
						{#if reportingVessels.length === 0}
							<div class="empty-box">Vessel reporting tidak ditemukan.</div>
						{:else}
							{#each reportingVessels as vessel}
								<button
									type="button"
									class:selected-user={selectedReportingVessel?.id === vessel.id}
									class="reporting-vessel-row"
									on:click={() => openReportingVessel(vessel)}
								>
									<div>
										<strong>{vessel.vessel_name || '-'}</strong>
										<span>ID {vessel.id} • {vessel.status || '-'}</span>
										<small>{vessel.deviceId || '-'}</small>
									</div>

									<em class:active-reporting={vessel.auto_report?.is_enabled}>
										{vessel.auto_report?.is_enabled ? 'Auto On' : 'Auto Off'}
									</em>
								</button>
							{/each}
						{/if}
					</div>
				</aside>

				<main class="reporting-editor-panel">
					{#if !selectedReportingVessel}
						<section class="reporting-empty-card">
							<h2>Pilih Vessel</h2>
							<p>
								Pilih vessel di sebelah kiri untuk mengatur auto-report, Telegram alarm, dan engine
								health.
							</p>
						</section>
					{:else}
						<div class="editor-toolbar">
							<div>
								<h2>{selectedReportingVessel.vessel_name || 'Reporting Config'}</h2>
								<p>
									{selectedReportingVessel.deviceId || '-'} • Status:
									{selectedReportingVessel.status || '-'}
								</p>
							</div>
						</div>

						<section class="reporting-section-card">
							<div class="reporting-section-head">
								<div>
									<h3>Auto Daily Report Email</h3>
									<p>Atur penerima, jam kirim, timezone, dan status auto-report.</p>
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

							<div class="form-grid recipient-grid">
								<label>
									<span>PIC Recipients</span>
									<textarea
										bind:value={autoReportForm.picText}
										placeholder="pic@example.com, pic2@example.com"
									></textarea>
								</label>

								<label>
									<span>CC</span>
									<textarea bind:value={autoReportForm.ccText} placeholder="cc@example.com"
									></textarea>
								</label>

								<label>
									<span>BCC</span>
									<textarea bind:value={autoReportForm.bccText} placeholder="bcc@example.com"
									></textarea>
								</label>
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
									<p>Download Excel atau kirim email daily report secara manual.</p>
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
									<h3>Engine Health Alarm</h3>
									<p>Threshold untuk alarm ENGINE_HEALTH.</p>
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

						<section class="reporting-section-card">
							<div class="reporting-section-head">
								<div>
									<h3>Telegram Alarm Groups</h3>
									<p>Routing notifikasi alarm ke Telegram group.</p>
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
										<div class="empty-box">Memuat Telegram group...</div>
									{:else if telegramGroups.length === 0}
										<div class="empty-box">Telegram group belum tersedia.</div>
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

									<label>
										<span>Vessel IDs</span>
										<textarea bind:value={telegramForm.vesselIdsText} placeholder="1, 2, 3"
										></textarea>
									</label>

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

						<section class="reporting-section-card">
							<div class="reporting-section-head">
								<div>
									<h3>Auto Report Audit Logs</h3>
									<p>Riwayat perubahan konfigurasi auto-report.</p>
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
									<div class="empty-box">Memuat audit log...</div>
								{:else if autoReportAuditLogs.length === 0}
									<div class="empty-box">Belum ada audit log.</div>
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
		{:else if activeAdminTab === 'global-audit-logs'}
			<section class="global-audit-workspace">
				<section class="global-audit-panel">
					<div class="global-audit-header">
						<div>
							<h2>Global Audit Logs</h2>
							<p>
								Menampilkan semua aktivitas admin/user audit secara global. Bisa difilter
								berdasarkan User ID.
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
								placeholder="Kosongkan untuk semua user"
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
								<span>Page dari {globalAuditPagination.totalPages || 1}</span>
							</div>
						</div>

						{#if globalAuditLoading}
							<div class="empty-box">Memuat global audit logs...</div>
						{:else if globalAuditLogs.length === 0}
							<div class="empty-box">Audit log tidak ditemukan.</div>
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
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
		background: #f3f6f9;
		color: #111827;
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
		background: #f3f6f9;
	}

	.admin-header-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 18px;
		padding: 18px 20px;
		border: 1px solid #e2e8f0;
		border-radius: 22px;
		background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
		box-shadow: 0 18px 45px rgba(15, 23, 42, 0.07);
	}

	.page-kicker {
		margin-bottom: 6px;
		color: #0f766e;
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.admin-header-card h1 {
		color: #0f172a;
		font-size: 25px;
		font-weight: 900;
		letter-spacing: -0.04em;
	}

	.admin-header-card p {
		max-width: 720px;
		margin-top: 6px;
		color: #64748b;
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
		background: #0f766e;
		box-shadow: 0 14px 25px rgba(15, 118, 110, 0.22);
	}

	.primary-button:hover,
	.ghost-button:hover,
	.danger-button:hover,
	.activate-button:hover {
		transform: translateY(-1px);
	}

	.ghost-button {
		color: #334155;
		background: #ffffff;
		border: 1px solid #dbe4ee;
	}

	.ghost-button.small {
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
		background: #fee2e2;
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
		background: #ffffff;
		text-align: center;
		color: #64748b;
	}

	.state-card h2 {
		margin-bottom: 8px;
		color: #0f172a;
		font-size: 22px;
	}

	.danger-state code {
		padding: 2px 6px;
		border-radius: 7px;
		background: #f1f5f9;
		color: #0f172a;
	}

	.loader {
		width: 34px;
		height: 34px;
		margin-bottom: 12px;
		border: 4px solid #e2e8f0;
		border-top-color: #0f766e;
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
		background: #ffffff;
		box-shadow: 0 14px 32px rgba(15, 23, 42, 0.05);
	}

	.summary-card span {
		display: block;
		color: #64748b;
		font-size: 12px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.summary-card strong {
		display: block;
		margin-top: 8px;
		color: #0f172a;
		font-size: 25px;
		font-weight: 900;
	}

	.admin-tabs {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 14px;
		padding: 8px;
		border: 1px solid #e2e8f0;
		border-radius: 18px;
		background: #ffffff;
		box-shadow: 0 12px 28px rgba(15, 23, 42, 0.05);
	}

	.admin-tabs button {
		min-height: 38px;
		border: 0;
		border-radius: 13px;
		padding: 0 15px;
		color: #475569;
		background: transparent;
		font-size: 13px;
		font-weight: 900;
		transition:
			background 0.18s ease,
			color 0.18s ease,
			box-shadow 0.18s ease;
	}

	.admin-tabs button.active-tab {
		color: #ffffff;
		background: #0f766e;
		box-shadow: 0 12px 22px rgba(15, 118, 110, 0.18);
	}

	.field-help {
		display: block;
		margin-top: 6px;
		color: #64748b;
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
		background: #ffffff;
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
		background: #ffffff;
		transition:
			border 0.18s ease,
			background 0.18s ease,
			transform 0.18s ease;
	}

	.engine-curve-row:hover,
	.engine-curve-row.selected-user {
		border-color: #99f6e4;
		background: #f0fdfa;
		transform: translateY(-1px);
	}

	.engine-curve-row strong,
	.engine-curve-row span,
	.engine-curve-row small {
		display: block;
	}

	.engine-curve-row strong {
		color: #0f172a;
		font-size: 13px;
		font-weight: 900;
	}

	.engine-curve-row span {
		margin-top: 3px;
		color: #334155;
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
		background: #fee2e2;
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
		background: #f8fafc;
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
		accent-color: #0f766e;
	}

	.checkbox-line span {
		margin: 0;
		color: #334155;
		font-size: 12px;
		font-weight: 800;
	}

	.engine-curve-note {
		margin-top: 12px;
		border: 1px dashed #cbd5e1;
		border-radius: 14px;
		padding: 12px;
		color: #64748b;
		background: #ffffff;
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
		color: #0f172a;
		font-size: 16px;
		font-weight: 900;
	}

	.engine-curve-detail-head p {
		margin-top: 4px;
		color: #64748b;
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
		background: #ffffff;
	}

	.curve-meta-grid span,
	.curve-meta-grid strong {
		display: block;
	}

	.curve-meta-grid span {
		color: #64748b;
		font-size: 11px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.curve-meta-grid strong {
		margin-top: 5px;
		color: #0f172a;
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
		background: #ffffff;
	}

	.engine-curve-engine-card h4 {
		color: #0f172a;
		font-size: 14px;
		font-weight: 900;
	}

	.engine-curve-engine-card code {
		display: inline-block;
		margin-top: 5px;
		border-radius: 8px;
		padding: 3px 7px;
		color: #0f766e;
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
		background: #ffffff;
	}

	.range-table-wrap th,
	.range-table-wrap td {
		padding: 8px 10px;
		border-bottom: 1px solid #eef2f7;
		text-align: left;
		color: #334155;
		font-size: 12px;
	}

	.range-table-wrap th {
		position: sticky;
		top: 0;
		background: #f8fafc;
		color: #0f172a;
		font-weight: 900;
	}

	.ae-value-box {
		width: fit-content;
		margin-top: 10px;
		border: 1px solid #e2e8f0;
		border-radius: 14px;
		padding: 12px;
		background: #f8fafc;
	}

	.ae-value-box span,
	.ae-value-box strong {
		display: block;
	}

	.ae-value-box span {
		color: #64748b;
		font-size: 11px;
		font-weight: 900;
	}

	.ae-value-box strong {
		margin-top: 4px;
		color: #0f172a;
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
		background: #ffffff;
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
		color: #0f172a;
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
		color: #64748b;
		font-size: 12px;
		line-height: 1.4;
	}

	.mini-loading {
		border-radius: 999px;
		padding: 5px 9px;
		color: #0f766e;
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
		color: #0f172a;
		background: #f8fafc;
		outline: none;
	}

	.search-input:focus,
	input:focus,
	textarea:focus,
	select:focus {
		border-color: #0f766e;
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
		background: #ffffff;
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
		background: #f0fdfa;
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
		color: #0f172a;
		font-size: 13px;
		font-weight: 900;
	}

	.user-main span,
	.vessel-row span,
	.asset-row span {
		margin-top: 3px;
		color: #334155;
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
		color: #475569;
		background: #f1f5f9;
		font-size: 11px;
		font-style: normal;
		font-weight: 900;
		white-space: nowrap;
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
		background: #fee2e2;
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
		grid-template-columns: 1.3fr 1fr;
	}

	label span {
		display: block;
		margin-bottom: 6px;
		color: #334155;
		font-size: 12px;
		font-weight: 900;
	}

	input,
	textarea,
	select {
		width: 100%;
		border: 1px solid #dbe4ee;
		border-radius: 13px;
		background: #ffffff;
		color: #0f172a;
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

	textarea {
		min-height: 76px;
		resize: vertical;
		padding: 10px 11px;
	}

	input:disabled {
		background: #f1f5f9;
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
		background: #f8fafc;
		padding: 14px;
	}

	.access-head {
		align-items: flex-start;
		margin-bottom: 12px;
	}

	.access-head h3,
	.permission-header h3,
	.engine-preview-card h3 {
		color: #0f172a;
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
		background: #ffffff;
	}

	.option-chip input,
	.permission-item input {
		width: 16px;
		min-width: 16px;
		height: 16px;
		min-height: 16px;
		margin-top: 2px;
		accent-color: #0f766e;
	}

	.option-chip strong,
	.option-chip small {
		display: block;
	}

	.option-chip strong {
		color: #0f172a;
		font-size: 12px;
		font-weight: 900;
	}

	.option-chip small {
		margin-top: 3px;
		color: #64748b;
		font-size: 11px;
	}

	.muted-box,
	.empty-box {
		border: 1px dashed #cbd5e1;
		border-radius: 15px;
		padding: 14px;
		color: #64748b;
		background: #ffffff;
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
		background: #ffffff;
		overflow: hidden;
	}

	.permission-group-head {
		align-items: center;
		padding: 12px;
		border-bottom: 1px solid #e2e8f0;
		background: #f8fafc;
	}

	.permission-group-head h4 {
		color: #0f172a;
		font-size: 14px;
		font-weight: 900;
	}

	.text-button {
		border: 0;
		background: transparent;
		color: #0f766e;
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
		color: #0f172a;
		font-size: 13px;
		font-weight: 900;
	}

	.permission-item code {
		width: fit-content;
		margin-top: 5px;
		border-radius: 8px;
		padding: 3px 7px;
		color: #0f766e;
		background: #ccfbf1;
		font-size: 11px;
		font-weight: 900;
		white-space: normal;
		word-break: break-word;
	}

	.permission-item small {
		margin-top: 6px;
		color: #64748b;
		font-size: 12px;
		line-height: 1.45;
	}

	.permission-item em {
		border-radius: 999px;
		padding: 4px 8px;
		color: #475569;
		background: #f1f5f9;
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
		color: #64748b;
		background: #ffffff;
		font-size: 12px;
		line-height: 1.55;
	}

	.vessel-note code {
		border-radius: 7px;
		padding: 2px 6px;
		color: #0f766e;
		background: #ccfbf1;
		font-size: 11px;
		font-weight: 900;
	}

	.asset-note {
		margin-top: 12px;
		border: 1px dashed #cbd5e1;
		border-radius: 14px;
		padding: 12px;
		color: #64748b;
		background: #ffffff;
		font-size: 12px;
		line-height: 1.55;
	}

	.asset-note code {
		border-radius: 7px;
		padding: 2px 6px;
		color: #0f766e;
		background: #ccfbf1;
		font-size: 11px;
		font-weight: 900;
	}

	.engine-preview-card {
		margin-top: 14px;
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
		background: #ffffff;
	}

	.engine-grid strong,
	.engine-grid code,
	.engine-grid small {
		display: block;
	}

	.engine-grid strong {
		color: #0f172a;
		font-size: 13px;
		font-weight: 900;
	}

	.engine-grid code {
		width: fit-content;
		margin-top: 6px;
		border-radius: 8px;
		padding: 3px 7px;
		color: #0f766e;
		background: #ccfbf1;
		font-size: 11px;
		font-weight: 900;
	}

	.engine-grid small {
		margin-top: 6px;
		color: #64748b;
		font-size: 11px;
	}

	.editor-footer {
		justify-content: flex-end;
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid #e2e8f0;
	}

	.reporting-admin-workspace {
		display: grid;
		grid-template-columns: 390px minmax(0, 1fr);
		gap: 14px;
		margin-top: 14px;
		align-items: start;
	}

	.reporting-vessel-panel,
	.reporting-editor-panel {
		border: 1px solid #e2e8f0;
		border-radius: 22px;
		background: #ffffff;
		box-shadow: 0 14px 34px rgba(15, 23, 42, 0.06);
	}

	.reporting-vessel-panel {
		position: sticky;
		top: 14px;
		max-height: calc(100vh - 250px);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.reporting-editor-panel {
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

	.reporting-vessel-list {
		flex: 1;
		overflow: auto;
		padding: 0 10px 12px;
	}

	.reporting-vessel-row,
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
		background: #ffffff;
		transition:
			border 0.18s ease,
			background 0.18s ease,
			transform 0.18s ease;
	}

	.reporting-vessel-row:hover,
	.telegram-row:hover,
	.reporting-vessel-row.selected-user,
	.telegram-row.selected-user {
		border-color: #99f6e4;
		background: #f0fdfa;
		transform: translateY(-1px);
	}

	.reporting-vessel-row strong,
	.reporting-vessel-row span,
	.reporting-vessel-row small,
	.telegram-row strong,
	.telegram-row small {
		display: block;
	}

	.reporting-vessel-row strong,
	.telegram-row strong {
		color: #0f172a;
		font-size: 13px;
		font-weight: 900;
	}

	.reporting-vessel-row span {
		margin-top: 3px;
		color: #334155;
		font-size: 12px;
		font-weight: 800;
	}

	.reporting-vessel-row small,
	.telegram-row small {
		margin-top: 4px;
		color: #94a3b8;
		font-size: 11px;
		word-break: break-all;
	}

	.reporting-vessel-row em,
	.telegram-row em {
		height: fit-content;
		border-radius: 999px;
		padding: 5px 9px;
		color: #991b1b;
		background: #fee2e2;
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
	.reporting-section-card {
		border: 1px solid #e2e8f0;
		border-radius: 18px;
		background: #f8fafc;
		padding: 14px;
	}

	.reporting-empty-card h2,
	.reporting-section-card h3 {
		color: #0f172a;
		font-size: 16px;
		font-weight: 900;
	}

	.reporting-empty-card p,
	.reporting-section-card p {
		margin-top: 4px;
		color: #64748b;
		font-size: 12px;
		line-height: 1.45;
	}

	.reporting-section-card {
		margin-top: 14px;
	}

	.reporting-section-card:first-of-type {
		margin-top: 0;
	}

	.reporting-section-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 14px;
		margin-bottom: 12px;
	}

	.reporting-form-grid {
		grid-template-columns: 180px 180px 180px;
	}

	.recipient-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		margin-top: 12px;
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
		accent-color: #0f766e;
	}

	.switch-line span {
		margin: 0;
		color: #334155;
		font-size: 12px;
		font-weight: 900;
	}

	.boxed-switch {
		min-height: 40px;
		border: 1px solid #dbe4ee;
		border-radius: 13px;
		padding: 0 11px;
		background: #ffffff;
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
		background: #ffffff;
	}

	.telegram-form-grid {
		grid-template-columns: 1fr 1fr 150px;
		margin-bottom: 12px;
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
		background: #ffffff;
	}

	.audit-log-row strong,
	.audit-log-row span,
	.audit-log-row small {
		display: block;
	}

	.audit-log-row strong {
		color: #0f172a;
		font-size: 13px;
		font-weight: 900;
	}

	.audit-log-row span {
		margin-top: 4px;
		color: #64748b;
		font-size: 12px;
	}

	.audit-change-list {
		display: grid;
		gap: 4px;
		margin-top: 8px;
	}

	.audit-change-list small {
		color: #334155;
		font-size: 12px;
	}

	.global-audit-workspace {
		margin-top: 14px;
	}

	.global-audit-panel {
		border: 1px solid #e2e8f0;
		border-radius: 22px;
		background: #ffffff;
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
		color: #0f172a;
		font-size: 18px;
		font-weight: 900;
		letter-spacing: -0.03em;
	}

	.global-audit-header p {
		margin-top: 4px;
		color: #64748b;
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
		background: #f8fafc;
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
		background: #f8fafc;
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
		background: #ffffff;
		padding: 10px 12px;
		min-width: 130px;
	}

	.global-audit-table-head strong,
	.global-audit-table-head span {
		display: block;
	}

	.global-audit-table-head strong {
		color: #0f172a;
		font-size: 18px;
		font-weight: 900;
	}

	.global-audit-table-head span {
		margin-top: 3px;
		color: #64748b;
		font-size: 11px;
		font-weight: 800;
	}

	.global-audit-table-wrap {
		overflow: auto;
		border: 1px solid #e2e8f0;
		border-radius: 14px;
		background: #ffffff;
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
		color: #334155;
		font-size: 12px;
		vertical-align: top;
	}

	.global-audit-table-wrap th {
		position: sticky;
		top: 0;
		z-index: 1;
		background: #f8fafc;
		color: #0f172a;
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
		color: #0f172a;
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
		color: #0f766e;
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
		color: #475569;
		background: #f1f5f9;
		font-size: 11px;
		font-weight: 900;
	}

	.create-action {
		color: #166534;
		background: #dcfce7;
	}

	.update-action {
		color: #1d4ed8;
		background: #dbeafe;
	}

	.delete-action {
		color: #991b1b;
		background: #fee2e2;
	}

	.global-audit-pagination {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
		margin-top: 12px;
	}

	.global-audit-pagination span {
		color: #64748b;
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
		.reporting-admin-workspace {
			grid-template-columns: 1fr;
		}

		.reporting-vessel-panel {
			position: static;
			max-height: 420px;
		}

		.reporting-form-grid,
		.recipient-grid,
		.manual-report-grid,
		.health-grid,
		.telegram-layout,
		.telegram-form-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 760px) {
		.reporting-section-head,
		.reporting-vessel-row,
		.telegram-row {
			flex-direction: column;
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
		background: #f4f6f8;
		color: #0f172a;
	}

	.administrator-page {
		height: 100%;
		max-height: 100%;
		min-height: 0;
		padding: 14px;
		background: #f4f6f8;
		color: #0f172a;
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
		background: #ffffff;
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
		background: #dbeafe;
		color: #1d4ed8;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.admin-header-card h1 {
		margin: 8px 0 0;
		color: #0f172a;
		font-size: 22px;
		line-height: 1.2;
		font-weight: 900;
		letter-spacing: 0;
	}

	.admin-header-card p {
		max-width: 760px;
		margin: 7px 0 0;
		color: #64748b;
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
		background: #e2e8f0;
		border: 0;
		color: #0f172a;
	}

	.ghost-button.small {
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
		background: #ecfdf5;
		border: 1px solid #bbf7d0;
		color: #047857;
	}

	.error-alert {
		background: #fef2f2;
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
		color: #475569;
		font-size: 11px;
		font-weight: 900;
		white-space: nowrap;
	}

	.admin-tabs button.active-tab {
		background: #2563eb;
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
		color: #64748b;
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
		background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
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
		color: #0f172a;
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
		background: #ffffff;
		color: #0f172a;
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
		color: #475569;
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
		background: #ffffff;
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
		background: #eff6ff;
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
		color: #0f172a;
		font-size: 13px;
		font-weight: 900;
	}

	.user-main span,
	.vessel-row span,
	.asset-row span,
	.engine-curve-row span,
	.reporting-vessel-row span,
	.audit-log-row span {
		color: #334155;
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
		color: #64748b;
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
		background: #dbeafe;
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
		background: #f8fafc;
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
		background: #ffffff;
	}

	.permission-group-head {
		border-bottom: 1px solid #e5edf5;
		background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
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
		background: #dbeafe;
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
		background: #ffffff;
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
		background: #ffffff;
	}

	.global-audit-table-wrap th,
	.range-table-wrap th {
		background: #f8fafc;
		color: #475569;
		font-size: 10.5px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.global-audit-table-wrap td,
	.range-table-wrap td {
		color: #0f172a;
		font-size: 12px;
		font-weight: 700;
	}

	.global-audit-table-wrap tr:hover td,
	.range-table-wrap tr:hover td {
		background: #f8fafc;
	}

	.create-action,
	.active-badge,
	.engine-curve-row em.active-curve,
	.reporting-vessel-row em.active-reporting,
	.telegram-row em.active-reporting {
		background: #dcfce7;
		color: #166534;
	}

	.update-action {
		background: #dbeafe;
		color: #1d4ed8;
	}

	.delete-action,
	.inactive-badge {
		background: #fee2e2;
		color: #991b1b;
	}

	.global-audit-pagination span {
		color: #64748b;
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

</style>
