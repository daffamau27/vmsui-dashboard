<script>
	import { selectedVesselId, selectedVesselInfo } from '$lib/stores/selectedVessel.svelte.js';
	import { setPageStatus } from '$lib/stores/pageStatusStore.svelte.js';
	import { apiRequest } from '$lib/api/authApi.js';
	import {
		getFuelManagementData,
		getFuelManagementHistory,
		saveFuelRob,
		applyFuelTransaction,
		deleteFuelTransaction,
		importFuelVdor,
		downloadVdorTemplate
	} from '$lib/api/fuelManagementApi.js';

	let { active = true } = $props();

	let selectedDate = $state(todayDate());
	let timezoneMode = $state('auto');
	let timezoneOffset = $state('+07:00');

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
	let autoLoadKey = $state('');

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
			title: 'Per Engine - EMS Internal',
			description: 'Internal EMS fuel consumption by engine.',
			permission: 'view_fuel_ems_internal',
			columns: [
				{ label: 'Engine', field: 'engine', align: 'left' },
				{ label: 'Class', field: 'class', align: 'left' },
				{ label: 'Total', field: 'total', type: 'liter', align: 'right' }
			]
		},
		{
			key: 'per_engine_ems_external',
			title: 'Per Engine - EMS External',
			description: 'External EMS fuel consumption by engine.',
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

		if (type === 'internal') return 'EMS Internal';
		if (type === 'external') return 'EMS External';

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

	let canManageRob = $derived(canViewFuelConsumptionTable);
	let canManageTransactions = $derived(canViewFuelConsumptionTable);
	let canImportVdor = $derived(canViewFuelConsumptionTable);

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
					label: 'Fuel ROB',
					value: formatLiter(fuelConsumption?.fuel_rob),
					note: 'Remaining on Board'
				},
				{
					label: 'VDOR Consumption',
					value: formatLiter(fuelConsumption?.cons_vdor),
					note: 'Manual report basis'
				},
				{
					label: 'Daily System',
					value: formatLiter(fuelConsumption?.daily_system),
					note: 'System daily consumption'
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
		const isActive = active;
		const vesselId = currentVesselId;
		const date = selectedDate;
		const mode = timezoneMode;
		const offset = timezoneOffset;

		if (!isActive || !vesselId || !date) return;

		const key = `${vesselId}|${date}|${mode}|${offset}`;
		if (autoLoadKey === key) return;

		autoLoadKey = key;
		loadDashboardFor({ vesselId, date, mode, offset });
		loadHistoryFor({ vesselId, date, page: 1, limit: historyLimit });
	});

	$effect(() => {
		if (!active) return;
		if (currentUser || currentUserLoading) return;

		loadCurrentUser();
	});

	function todayDate() {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');
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

	function getErrorMessage(err, fallback = 'An error occurred.') {
		return err?.data?.message || err?.response?.data?.message || err?.message || fallback;
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

	async function loadDashboardFor({ vesselId, date, mode, offset }) {
		loadingData = true;
		errorMessage = '';

		try {
			const response = await getFuelManagementData({
				vesselId,
				date,
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

	async function loadHistoryFor({ vesselId, date, page = 1, limit = 10 }) {
		loadingHistory = true;
		historyError = '';

		try {
			const response = await getFuelManagementHistory({ vesselId, date, page, limit });
			const payload = response?.data || response || {};

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

	async function refreshCurrent() {
		if (!currentVesselId || !selectedDate) return;
		await Promise.all([
			loadDashboardFor({
				vesselId: currentVesselId,
				date: selectedDate,
				mode: timezoneMode,
				offset: timezoneOffset
			}),
			loadHistoryFor({
				vesselId: currentVesselId,
				date: selectedDate,
				page: historyPage,
				limit: historyLimit
			})
		]);
	}

	async function submitRob() {
		clearMessages();

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
		actionLoading = 'template';

		try {
			const raw = await downloadVdorTemplate();
			let blob;

			if (raw instanceof Blob) {
				blob = raw;
			} else if (typeof raw?.blob === 'function') {
				blob = await raw.blob();
			} else {
				blob = new Blob([raw], {
					type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
				});
			}

			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = 'vdor_import_template.xlsx';
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
		} catch (err) {
			console.error('[FUEL_MANAGEMENT][DOWNLOAD_TEMPLATE][ERROR]', err);
			errorMessage = getErrorMessage(err, 'Failed to download the VDOR template.');
		} finally {
			actionLoading = '';
		}
	}

	function loadHistoryPage(page) {
		if (!currentVesselId || !selectedDate) return;
		const safePage = Math.max(
			1,
			Math.min(Number(page || 1), Number(historyPagination?.total_pages || 1))
		);
		loadHistoryFor({
			vesselId: currentVesselId,
			date: selectedDate,
			page: safePage,
			limit: historyLimit
		});
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
		const number = Number(value);
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
			<label>
				<span>Date</span>
				<input type="date" bind:value={selectedDate} />
			</label>

			<label>
				<span>Timezone</span>
				<select bind:value={timezoneMode}>
					<option value="auto">Auto</option>
					<option value="manual">Manual</option>
				</select>
			</label>

			{#if timezoneMode === 'manual'}
				<label class="offset-field">
					<span>Offset</span>
					<input type="text" bind:value={timezoneOffset} placeholder="+07:00" />
				</label>
			{/if}

			<button
				class="primary-button"
				type="button"
				onclick={refreshCurrent}
				disabled={loadingData || loadingHistory}
			>
				{loadingData || loadingHistory ? 'Loading...' : 'Refresh'}
			</button>
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
		{#each summaryCards as card}
			<article class="summary-card">
				<span>{card.label}</span>
				<strong>{card.value}</strong>
				<small>{card.note}</small>
			</article>
		{/each}
	</section>

	<section class="main-grid">
		<article class="panel comparison-panel">
			<div class="panel-header">
				<div>
					<h2>Comparison</h2>
					<p>System total compared with VDOR basis.</p>
				</div>
				{#if report?.timezone}
					<span class="badge">{report.timezone}</span>
				{/if}
			</div>

			{#if comparison}
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

		<article class="panel action-panel">
			<div class="panel-header">
				<div>
					<h2>Fuel Operations</h2>
					<p>Manual ROB adjustment, bunkering transaction, and VDOR import.</p>
				</div>
			</div>

			{#if currentUserLoading}
				<div class="empty-state">Loading permission...</div>
			{:else if currentUserError}
				<div class="empty-state">{currentUserError}</div>
			{:else if canViewFuelConsumptionTable}
				<div class="operation-grid">
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
							<button
								type="button"
								class="secondary-button"
								onclick={downloadTemplate}
								disabled={actionLoading === 'template'}
							>
								{actionLoading === 'template' ? 'Downloading...' : 'Download Template'}
							</button>
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
				<div class="empty-state">
					This account does not have permission to manage ROB, transactions, or VDOR imports.
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

				{#if hasSectionRows(config.key)}
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
			<div class="history-control">
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
		</div>

		{#if historyError}
			<div class="alert danger compact">{historyError}</div>
		{/if}

		{#if loadingHistory}
			<div class="empty-state">Loading history...</div>
		{:else if historyRows.length}
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Date</th>
							<th>Action</th>
							<th>User</th>
							<th class="right">Received</th>
							<th class="right">Consumption</th>
							<th class="right">ROB After</th>
							<th class="right">Action</th>
						</tr>
					</thead>
					<tbody>
						{#each historyRows as item}
							<tr>
								<td>{item.date || '-'}</td>
								<td><span class="action-chip">{item.action || '-'}</span></td>
								<td>{item.user || '-'}</td>
								<td class="right">{item.received || '-'}</td>
								<td class="right">{item.consumption || '-'}</td>
								<td class="right"><strong>{item.rob_after || '-'}</strong></td>
								<td class="right">
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
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="empty-state">History is not available for this date.</div>
		{/if}
	</section>
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
		background: #f4f6f8;
		color: #0f172a;
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
		background: #ffffff;
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
		background: #dbeafe;
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
		color: #0f172a;
	}

	.fuel-header-card p {
		margin-top: 7px;
		color: #64748b;
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
		min-width: 390px;
	}

	label {
		display: grid;
		gap: 5px;
	}

	label span {
		color: #475569;
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
	}

	input,
	select {
		height: 32px;
		min-width: 140px;
		border: 1px solid #cbd5e1;
		background: #ffffff;
		padding: 0 9px;
		color: #0f172a;
		font-size: 12px;
		font-weight: 700;
		outline: none;
	}

	input:focus,
	select:focus {
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
	}

	.offset-field input {
		min-width: 86px;
		width: 86px;
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
		background: #e2e8f0;
		color: #0f172a;
	}

	.secondary-button:hover:not(:disabled) {
		background: #cbd5e1;
	}

	.danger-button {
		height: 28px;
		border: 1px solid #fecaca;
		background: #fff1f2;
		color: #be123c;
	}

	.danger-button:hover:not(:disabled) {
		background: #ffe4e6;
	}

	.fuel-toast-layer {
		position: fixed;
		top: 48px;
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
		background: rgba(255, 255, 255, 0.96);
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
		color: #0f172a;
	}

	.fuel-toast span {
		font-size: 12px;
		font-weight: 700;
		line-height: 1.35;
		color: #475569;
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
		color: #334155;
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
		background: #fffbeb;
		color: #92400e;
	}

	.alert.danger {
		border: 1px solid #fecaca;
		background: #fff1f2;
		color: #be123c;
	}

	.alert.success {
		border: 1px solid #bbf7d0;
		background: #f0fdf4;
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
		color: #64748b;
		font-size: 11px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.summary-card strong,
	.comparison-grid strong {
		display: block;
		margin-top: 10px;
		color: #0f172a;
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
		color: #64748b;
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
		background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
	}

	.panel-header h2 {
		color: #0f172a;
		font-size: 17px;
		font-weight: 900;
		line-height: 1.2;
	}

	.panel-header p {
		margin-top: 5px;
		color: #64748b;
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
		background: #eff6ff;
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
		background: #f8fafc;
	}

	.comparison-grid > div {
		min-width: 0;
		padding: 14px;
		background: #ffffff;
		border: 1px solid #d9e2ec;
		border-radius: 10px;
	}

	.comparison-grid > div.positive {
		border-color: #bbf7d0;
		background: #f0fdf4;
	}

	.comparison-grid > div.negative {
		border-color: #fecaca;
		background: #fff1f2;
	}

	.comparison-grid > div.neutral {
		border-color: #d9e2ec;
		background: #ffffff;
	}

	.operation-grid {
		padding: 14px;
		display: grid;
		grid-template-columns: repeat(3, minmax(190px, 1fr));
		gap: 12px;
		background: #f8fafc;
	}

	.mini-form {
		display: grid;
		align-content: start;
		gap: 9px;
		min-width: 0;
		padding: 12px;
		background: #ffffff;
		border: 1px solid #d9e2ec;
		border-radius: 10px;
	}

	.mini-form h3 {
		color: #0f172a;
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
		color: #64748b;
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
		background: #f8fafc;
		color: #475569;
		font-size: 10.5px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 10px 12px;
		border-bottom: 1px solid #e2e8f0;
	}

	td {
		color: #0f172a;
		font-size: 12px;
		font-weight: 700;
		padding: 10px 12px;
		border-bottom: 1px solid #eef2f7;
	}

	tbody tr:hover td {
		background: #f8fafc;
	}

	tfoot td {
		background: #eff6ff;
		color: #0f172a;
		font-weight: 900;
	}

	.right {
		text-align: right;
	}

	.history-panel table {
		min-width: 780px;
	}

	.history-control {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		font-weight: 900;
		color: #475569;
	}

	.history-control button {
		height: 30px;
		padding: 0 10px;
	}

	.action-chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 52px;
		min-height: 24px;
		padding: 0 10px;
		border-radius: 999px;
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.empty-state {
		margin: 14px;
		padding: 18px 14px;
		border: 1px dashed #cbd5e1;
		border-radius: 10px;
		background: #ffffff;
		color: #64748b;
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

		.header-actions label,
		.header-actions button,
		.header-actions input,
		.header-actions select {
			width: 100%;
		}

		.summary-grid,
		.operation-grid,
		.comparison-grid,
		.split-fields {
			grid-template-columns: 1fr;
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
