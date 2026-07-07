<script>
	import { onMount } from 'svelte';
	import { selectedVesselId, selectedVesselInfo } from '$lib/stores/selectedVessel.svelte.js';
	import { getDataLogData, getDataLogExcelUrl } from '$lib/api/dataLogApi.js';

	import { setPageStatus } from '$lib/stores/pageStatusStore.svelte.js';
	import { downloadApiFile, apiRequest } from '$lib/api/authApi.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let loading = $state(false);
	let exporting = $state(false);
	let error = $state('');
	let logData = $state(null);

	let startDateTime = $state('');
	let endDateTime = $state('');
	let timezoneMode = $state('auto');
	let timezoneOffset = $state('+07:00');

	let { active = false } = $props();
	let loadedKeys = $state({});

	let currentUser = $state(null);
	let currentUserLoading = $state(false);
	let currentUserError = $state('');

	async function loadCurrentUser() {
		if (currentUser || currentUserLoading) return currentUser;

		currentUserLoading = true;
		currentUserError = '';

		try {
			const response = await apiRequest('/users/current-user', {
				method: 'GET'
			});

			currentUser = response?.data || response?.user || response || null;

			console.log('[DATA_LOG_CURRENT_USER_PERMISSION]', currentUser);

			return currentUser;
		} catch (err) {
			console.error('[DATA_LOG_CURRENT_USER_PERMISSION_ERROR]', err);
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

	let permissionReady = $derived(Boolean(currentUser) || Boolean(currentUserError));

	let canViewFuelEcu = $derived(hasPermission('view_fuel_ecu'));
	let canViewFuelFms = $derived(hasPermission('view_fuel_fms'));
	let canViewFuelFod = $derived(hasPermission('view_fuel_fod'));
	let canViewFuelEmsInternal = $derived(hasPermission('view_fuel_ems_internal'));
	let canViewFuelEmsExternal = $derived(hasPermission('view_fuel_ems_external'));
	let canViewFuelEngineMaker = $derived(hasPermission('view_fuel_engine_maker'));
	let canManageDataLogOverride = $derived(hasPermission('manage_data_log_override'));

	let overrideDownloadingTemplate = $state(false);
	let overrideImporting = $state(false);
	let overrideDeleting = $state(false);

	let overrideFile = $state(null);
	let overrideFileInput = $state(null);
	let overrideSourceFilePath = $state('');
	let overrideMessage = $state('');
	let overrideError = $state('');

	let canViewAnyEngineFuelSource = $derived(
		canViewFuelEcu ||
			canViewFuelFms ||
			canViewFuelEmsInternal ||
			canViewFuelEmsExternal ||
			canViewFuelEngineMaker
	);

	function normalizeColumnKey(key) {
		return String(key || '')
			.trim()
			.toLowerCase();
	}

	function isFuelRelatedColumn(columnKey) {
		const key = normalizeColumnKey(columnKey);

		return (
			key.includes('fuel') ||
			key.includes('_f_used') ||
			key.includes('_f_consump') ||
			key.includes('_f_rate') ||
			key.includes('_fm_') ||
			key.startsWith('fm_') ||
			key.includes('fms') ||
			key.includes('ecu') ||
			key.includes('ems') ||
			key.includes('flowmeter') ||
			key.includes('flow_meter') ||
			key.includes('volume_used') ||
			key.includes('volume_total') ||
			key.includes('bunker') ||
			key.includes('engine_maker') ||
			key.includes('enginemaker')
		);
	}

	function getFuelSourceFromColumn(columnKey) {
		const key = normalizeColumnKey(columnKey);

		if (!isFuelRelatedColumn(key)) return null;

		if (key.includes('fod')) return 'fod';

		if (
			key.includes('ems_external') ||
			key.includes('emsexternal') ||
			key.includes('ems_ext') ||
			key.includes('external_ems')
		) {
			return 'ems_external';
		}

		if (
			key.includes('ems_internal') ||
			key.includes('emsinternal') ||
			key.includes('ems_int') ||
			key.includes('internal_ems')
		) {
			return 'ems_internal';
		}

		if (key.includes('engine_maker') || key.includes('enginemaker')) {
			return 'engine_maker';
		}

		if (
			key.includes('fms') ||
			key.startsWith('fm_') ||
			key.includes('_fm_') ||
			key.includes('flowmeter') ||
			key.includes('flow_meter') ||
			key.includes('_f_consump') ||
			key.includes('fuel_consump')
		) {
			return 'fms';
		}

		if (key.includes('ecu')) return 'ecu';

		return 'generic_engine_fuel';
	}

	function canShowFuelColumn(columnKey) {
		const source = getFuelSourceFromColumn(columnKey);

		if (!source) return true;
		if (source === 'ecu') return canViewFuelEcu;
		if (source === 'fms') return canViewFuelFms;
		if (source === 'fod') return canViewFuelFod;
		if (source === 'ems_internal') return canViewFuelEmsInternal;
		if (source === 'ems_external') return canViewFuelEmsExternal;
		if (source === 'engine_maker') return canViewFuelEngineMaker;

		return canViewAnyEngineFuelSource;
	}

	function prettifyColumnLabel(key) {
		return String(key || '-')
			.replaceAll('_', ' ')
			.replace(/\b\w/g, (char) => char.toUpperCase());
	}

	const hiddenDisplayColumns = new Set(['timestamp_utc']);

	function isDisplayColumn(key) {
		const normalizedKey = normalizeColumnKey(key);

		return !hiddenDisplayColumns.has(normalizedKey) && canShowFuelColumn(normalizedKey);
	}

	function filterDisplayColumns(columns = []) {
		return Array.isArray(columns) ? columns.filter(isDisplayColumn) : [];
	}

	let selectedColumns = $state([
		'timestamp',
		'latitude',
		'longitude',
		'course',
		'speed',
		'rig',
		'me_port_run',
		'me_port_rpm',
		'me_port_load',
		'me_port_f_used',
		'me_stbd_run',
		'me_stbd_rpm',
		'me_stbd_load',
		'me_stbd_f_used',
		'ae_port_run',
		'ae_port_rpm',
		'ae_port_load',
		'ae_port_f_used',
		'ae_stbd_run',
		'ae_stbd_rpm',
		'ae_stbd_load',
		'ae_stbd_f_used'
	]);

	let apiAvailableColumns = $derived(
		filterDisplayColumns(
			Array.isArray(normalizedData?.available_columns) ? normalizedData.available_columns : []
		)
	);

	let visibleColumns = $derived(
		apiAvailableColumns.length ? apiAvailableColumns : filterDisplayColumns(selectedColumns)
	);

	let displaySelectedColumns = $derived(filterDisplayColumns(selectedColumns));

	function parseRowTimestamp(row) {
		const value = row?.timestamp_utc || row?.timestamp || row?.ts || row?.time || row?.datetime;

		if (!value) return 0;

		// If this is a Unix timestamp
		if (/^\d+$/.test(String(value))) {
			return Number(value);
		}

		// Clean formats such as: 2026-05-24 00:00:00 (UTC+7)
		const cleaned = String(value)
			.replace(/\s*\(UTC[+-]?\d{1,2}(?::?\d{2})?\)\s*/i, '')
			.replace(' ', 'T');

		const time = new Date(cleaned).getTime();

		return Number.isFinite(time) ? time : 0;
	}

	function pad(value) {
		return String(value).padStart(2, '0');
	}

	function toLocalInputValue(date) {
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
			date.getHours()
		)}:${pad(date.getMinutes())}`;
	}

	function toApiDateTime(value) {
		if (!value) return '';

		const date = new Date(value);

		if (Number.isNaN(date.getTime())) return value;

		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
			date.getHours()
		)}:${pad(date.getMinutes())}:00`;
	}

	function formatValue(value) {
		if (value === undefined || value === null || value === '') return '-';

		if (typeof value === 'number') {
			return Number.isInteger(value) ? String(value) : value.toFixed(2);
		}

		if (typeof value === 'boolean') {
			return value ? 'ON' : 'OFF';
		}

		return value;
	}

	function formatCellValue(value, column) {
		if (String(column || '').toLowerCase() === 'timestamp') {
			const formatted = formatValue(value);

			if (formatted === '-') return formatted;

			return String(formatted).replace(/\s*\(UTC[+-]?\d{1,2}(?::?\d{2})?\)\s*/i, '');
		}

		return formatValue(value);
	}

	function pickArray(...values) {
		for (const value of values) {
			if (Array.isArray(value)) return value;
		}

		return [];
	}

	function getEmsVariantSource(columnKey) {
		const source = getFuelSourceFromColumn(columnKey);

		if (source === 'ems_internal') return 'ems_internal';
		if (source === 'ems_external') return 'ems_external';

		return null;
	}

	function getEmsSourceCount(columns = []) {
		const sources = new Set();

		for (const column of columns) {
			const source = getEmsVariantSource(column);

			if (source) {
				sources.add(source);
			}
		}

		return sources.size;
	}

	function formatColumnAcronyms(label) {
		return String(label || '')
			.replace(/\bMe\b/g, 'ME')
			.replace(/\bAe\b/g, 'AE')
			.replace(/\bRpm\b/g, 'RPM')
			.replace(/\bStbd\b/g, 'STBD')
			.replace(/\bEms\b/g, 'EMS')
			.replace(/\bEcu\b/g, 'ECU')
			.replace(/\bFms\b/g, 'FMS')
			.replace(/\bFod\b/g, 'FOD');
	}

	function getColumnLabel(key, contextColumns = visibleColumns) {
		let label = formatColumnAcronyms(prettifyColumnLabel(key));

		const emsSource = getEmsVariantSource(key);
		const emsSourceCount = getEmsSourceCount(contextColumns);

		if (emsSource && emsSourceCount <= 1) {
			label = label
				.replace(/\bEMS\s+(Internal|External|Int|Ext)\b/gi, 'EMS')
				.replace(/\b(Internal|External|Int|Ext)\s+EMS\b/gi, 'EMS')
				.replace(/\b(Internal|External|Int|Ext)\b/gi, '')
				.replace(/\s+/g, ' ')
				.trim();
		} else if (emsSource === 'ems_internal') {
			label = label
				.replace(/\bEMS\s+(Internal|Int)\b/gi, 'VMS')
				.replace(/\b(Internal|Int)\s+EMS\b/gi, 'VMS')
				.replace(/\b(Internal|Int)\b/gi, 'VMS')
				.replace(/\s+/g, ' ')
				.trim();
		} else if (emsSource === 'ems_external') {
			label = label
				.replace(/\bEMS\s+(External|Ext)\b/gi, 'EMS')
				.replace(/\b(External|Ext)\s+EMS\b/gi, 'EMS')
				.replace(/\b(External|Ext)\b/gi, '')
				.replace(/\s+/g, ' ')
				.trim();
		}

		return label;
	}

	function toggleColumn(key) {
		if (selectedColumns.includes(key)) {
			selectedColumns = selectedColumns.filter((item) => item !== key);
		} else {
			selectedColumns = [...selectedColumns, key];
		}
	}

	function selectAllColumns() {
		selectedColumns = [...visibleColumns];
	}

	function clearColumns() {
		selectedColumns = ['timestamp', 'course', 'latitude', 'longitude', 'speed', 'rig'].filter(
			(key) => visibleColumns.includes(key)
		);
	}

	let vesselName = $derived(
		$selectedVesselInfo?.name || $selectedVesselInfo?.vesselName || 'Selected Vessel'
	);

	let normalizedData = $derived(logData?.data || logData || {});

	let dataRows = $derived(
		pickArray(
			normalizedData?.details,
			normalizedData?.rows,
			normalizedData?.logs,
			normalizedData?.items,
			normalizedData?.data,
			normalizedData?.table,
			Array.isArray(normalizedData) ? normalizedData : []
		)
			.slice()
			.sort((a, b) => parseRowTimestamp(b) - parseRowTimestamp(a))
	);

	let hasRawData = $derived(Boolean(logData));

	async function loadDataLog() {
		if (!$selectedVesselId) {
			error = 'No vessel has been selected from Fleet View.';
			logData = null;
			return;
		}

		await loadCurrentUser();

		const requestedColumns = filterDisplayColumns(selectedColumns);

		loading = true;
		error = '';

		try {
			const result = await getDataLogData({
				vesselId: $selectedVesselId,
				start: toApiDateTime(startDateTime),
				end: toApiDateTime(endDateTime),
				timezoneMode,
				timezoneOffset,
				columns: requestedColumns.join(',')
			});

			logData = result;

			const payload = result?.data || result || {};
			const stats = payload?.stats || {};

			setPageStatus({
				pageKey: 'data-log',
				dataReceived:
					stats?.received_slots !== undefined && stats?.total_slots !== undefined
						? `${stats.received_slots} of ${stats.total_slots} (${stats.percentage ?? '-'}%)`
						: `${payload?.details?.length ?? 0} rows`,
				sourcePage: 'Data Log'
			});

			if (Array.isArray(payload.available_columns) && payload.available_columns.length) {
				selectedColumns = filterDisplayColumns(payload.available_columns);
			}
			console.log('[DATA_LOG_DATA]', result);
		} catch (err) {
			console.error('[DATA_LOG_ERROR]', err);
			error = err?.message || 'Failed to load data log.';
			logData = null;
		} finally {
			loading = false;
		}
	}

	async function handleExportExcel() {
		if (!$selectedVesselId) {
			error = 'No vessel has been selected.';
			return;
		}

		await loadCurrentUser();

		const requestedColumns = filterDisplayColumns(selectedColumns);

		exporting = true;
		error = '';

		try {
			const url = getDataLogExcelUrl({
				vesselId: $selectedVesselId,
				start: toApiDateTime(startDateTime),
				end: toApiDateTime(endDateTime),
				timezoneMode,
				timezoneOffset,
				columns: requestedColumns.join(',')
			});

			const safeVesselName = String(vesselName || 'vessel')
				.replace(/[^\w\s-]/g, '')
				.replace(/\s+/g, '_');

			await downloadApiFile(
				url,
				`Data_Log_${safeVesselName}_${toApiDateTime(startDateTime).slice(0, 10)}.xlsx`
			);
		} catch (err) {
			console.error('[DATA_LOG_EXPORT_ERROR]', err);
			error = err?.message || 'Failed to export data log to Excel.';
		} finally {
			exporting = false;
		}
	}

	function getOverrideResponseMessage(response, fallback = 'Override operation completed successfully.') {
		return response?.message || response?.data?.message || fallback;
	}

	function getImportedSourceFilePath(response) {
		return (
			response?.data?.sourceFilePath ||
			response?.data?.source_file_path ||
			response?.data?.source_file ||
			response?.sourceFilePath ||
			response?.source_file_path ||
			''
		);
	}

	function handleOverrideFileChange(event) {
		overrideFile = event?.currentTarget?.files?.[0] || null;
		overrideMessage = '';
		overrideError = '';
	}

	function resetOverrideFileInput() {
		overrideFile = null;

		if (overrideFileInput) {
			overrideFileInput.value = '';
		}
	}

	function fileToBase64(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();

			reader.onload = () => {
				const result = String(reader.result || '');
				const base64 = result.includes(',') ? result.split(',').pop() : result;
				resolve(base64);
			};

			reader.onerror = () => {
				reject(new Error('Failed to read the Excel file.'));
			};

			reader.readAsDataURL(file);
		});
	}

	async function handleDownloadOverrideTemplate() {
		await loadCurrentUser();

		if (!canManageDataLogOverride) {
			overrideError = 'You do not have the manage_data_log_override permission.';
			return;
		}

		overrideDownloadingTemplate = true;
		overrideMessage = '';
		overrideError = '';

		try {
			await downloadApiFile(
				'/data-logs/overrides/template',
				'data_log_override_template.xlsx'
			);

			overrideMessage = 'Data log override template downloaded successfully.';
		} catch (err) {
			console.error('[DATA_LOG_OVERRIDE_TEMPLATE_ERROR]', err);
			overrideError = err?.message || 'Failed to download the data log override template.';
		} finally {
			overrideDownloadingTemplate = false;
		}
	}

	async function handleImportOverrideFile() {
		if (!$selectedVesselId) {
			overrideError = 'No vessel has been selected.';
			return;
		}

		await loadCurrentUser();

		if (!canManageDataLogOverride) {
			overrideError = 'You do not have the manage_data_log_override permission.';
			return;
		}

		if (!overrideFile) {
			overrideError = 'Select an override Excel file first.';
			return;
		}

		const allowedExtension = /\.xlsx$/i.test(overrideFile.name);

		if (!allowedExtension) {
			overrideError = 'The override file must be in .xlsx format.';
			return;
		}

		overrideImporting = true;
		overrideMessage = '';
		overrideError = '';

		try {
			const fileBase64 = await fileToBase64(overrideFile);

			const response = await apiRequest('/data-logs/overrides/import', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					vesselId: Number($selectedVesselId),
					fileName: overrideFile.name,
					fileBase64
				})
			});

			const importedSourceFilePath = getImportedSourceFilePath(response);

			if (importedSourceFilePath) {
				overrideSourceFilePath = importedSourceFilePath;
			}

			overrideMessage = getOverrideResponseMessage(
				response,
				'Data log override file imported successfully.'
			);

			resetOverrideFileInput();

			await loadDataLog();
		} catch (err) {
			console.error('[DATA_LOG_OVERRIDE_IMPORT_ERROR]', err);
			overrideError =
				err?.message ||
				'Failed to import data log override. Make sure the permission and vessel access are correct.';
		} finally {
			overrideImporting = false;
		}
	}

	async function handleDeleteOverrideImport() {
		if (!$selectedVesselId) {
			overrideError = 'No vessel has been selected.';
			return;
		}

		await loadCurrentUser();

		if (!canManageDataLogOverride) {
			overrideError = 'You do not have the manage_data_log_override permission.';
			return;
		}

		if (!overrideSourceFilePath.trim()) {
			overrideError = 'Enter the source file path to delete.';
			return;
		}

		const confirmed = window.confirm(
			'Are you sure you want to delete all overrides from this imported file?'
		);

		if (!confirmed) return;

		overrideDeleting = true;
		overrideMessage = '';
		overrideError = '';

		try {
			const query = new URLSearchParams({
				vesselId: String($selectedVesselId),
				sourceFilePath: overrideSourceFilePath.trim()
			});

			const response = await apiRequest(`/data-logs/overrides/imports?${query.toString()}`, {
				method: 'DELETE'
			});

			overrideMessage = getOverrideResponseMessage(
				response,
				'Imported override file deleted successfully.'
			);

			overrideSourceFilePath = '';

			await loadDataLog();
		} catch (err) {
			console.error('[DATA_LOG_OVERRIDE_DELETE_ERROR]', err);
			overrideError =
				err?.message ||
				'Failed to delete override import. Make sure sourceFilePath and vessel access are correct.';
		} finally {
			overrideDeleting = false;
		}
	}

	onMount(() => {
		const now = new Date();
		const start = new Date(now);
		start.setHours(0, 0, 0, 0);

		startDateTime = toLocalInputValue(start);
		endDateTime = toLocalInputValue(now);
		loadCurrentUser();
	});

	$effect(() => {
		if (!active) return;
		if (!$selectedVesselId) return;
		if (!startDateTime || !endDateTime) return;

		if (!permissionReady) {
			if (!currentUserLoading) loadCurrentUser();
			return;
		}

		const key = `${$selectedVesselId}|${startDateTime}|${endDateTime}|${timezoneMode}|${timezoneOffset}`;
		if (loadedKeys[key]) return;

		loadedKeys = {
			...loadedKeys,
			[key]: true
		};

		loadDataLog();
	});
</script>

<section class="data-log-page">
	<section class="data-log-header-card">
		<div>
			<div class="page-kicker">Data Log</div>
			<h1>{vesselName}</h1>
			<p>
				Granular 1-minute telemetry log with position, speed, runtime, RPM, load, and fuel data.
			</p>
		</div>
	</section>

	<section class="filter-card">
		<label>
			<span>Start</span>
			<input type="datetime-local" bind:value={startDateTime} />
		</label>

		<label>
			<span>End</span>
			<input type="datetime-local" bind:value={endDateTime} />
		</label>

		<label>
			<span>Timezone Mode</span>
			<select bind:value={timezoneMode}>
				<option value="auto">Auto</option>
				<option value="manual">Manual</option>
			</select>
		</label>

		{#if timezoneMode === 'manual'}
			<label>
				<span>Timezone Offset</span>
				<input type="text" bind:value={timezoneOffset} placeholder="+07:00" />
			</label>
		{/if}

		<div class="filter-actions">
			<button type="button" class="primary-btn" onclick={loadDataLog} disabled={loading}>
				{loading ? 'Loading...' : 'Load Data'}
			</button>

			<button type="button" class="export-btn" onclick={handleExportExcel} disabled={exporting}>
				{exporting ? 'Exporting...' : 'Export Excel'}
			</button>
		</div>
	</section>

	{#if canManageDataLogOverride}
		<section class="override-card">
			<div class="override-header">
				<div>
					<span class="section-kicker">Override</span>
					<h2>Data Log Override</h2>
				</div>
			</div>

			<div class="override-grid">
				<label class="override-field">
					<span>Import Excel Override</span>
					<input
						bind:this={overrideFileInput}
						type="file"
						accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
						onchange={handleOverrideFileChange}
					/>
					<small>
						The file must use the system template and .xlsx format.
					</small>
				</label>

				<div class="override-actions">
					<button
						type="button"
						class="primary-btn"
						onclick={handleImportOverrideFile}
						disabled={overrideImporting || !overrideFile}
					>
						{overrideImporting ? 'Importing...' : 'Import Override'}
					</button>

					{#if overrideFile}
						<button type="button" class="ghost-btn" onclick={resetOverrideFileInput}>
							Clear File
						</button>
					{/if}
				</div>
			</div>

			<div class="override-delete-row">
				<label class="override-field">
					<span>Source File Path</span>
					<input
						type="text"
						bind:value={overrideSourceFilePath}
						placeholder="Enter the source_file_path from the import result"
					/>
				</label>

				<button
					type="button"
					class="danger-btn"
					onclick={handleDeleteOverrideImport}
					disabled={overrideDeleting || !overrideSourceFilePath.trim()}
				>
					{overrideDeleting ? 'Deleting...' : 'Delete Import'}
				</button>
			</div>

			{#if overrideMessage}
				<div class="status-box success-box">{overrideMessage}</div>
			{/if}

			{#if overrideError}
				<div class="status-box error-box">{overrideError}</div>
			{/if}
		</section>
	{/if}

	<section class="column-card">
		<div class="column-header">
			<div>
				<span class="section-kicker">Columns</span>
				<h2>Visible Data Columns</h2>
			</div>

			<div class="column-actions">
				<button type="button" onclick={selectAllColumns}>Select All</button>
				<button type="button" onclick={clearColumns}>Basic</button>
			</div>
		</div>

		<div class="column-grid">
			{#each visibleColumns as column}
				<label class="column-item">
					<input
						type="checkbox"
						checked={selectedColumns.includes(column)}
						onchange={() => toggleColumn(column)}
					/>
					<span>{getColumnLabel(column, visibleColumns)}</span>
				</label>
			{/each}
		</div>
	</section>

	{#if error}
		<div class="status-box error-box">{error}</div>
	{/if}

	{#if currentUserLoading}
		<LoadingSkeleton label="Loading data log permissions" variant="card" rows={2} compact />
	{/if}

	{#if currentUserError}
		<div class="status-box error-box">{currentUserError}</div>
	{/if}

	{#if loading}
		<LoadingSkeleton
			label="Loading telemetry log"
			variant="data-log"
			rows={10}
			columns={displaySelectedColumns.length || 10}
		/>
	{:else}
		<section class="table-section">
			<div class="section-header">
				<div>
					<span class="section-kicker">Telemetry</span>
					<h2>1-Minute Data Log</h2>
				</div>

				<strong>{dataRows.length} rows</strong>
			</div>

			{#if dataRows.length}
				<div class="data-log-table-wrapper">
					<table class="data-log-table">
						<thead>
							<tr>
								{#each displaySelectedColumns as column}
									<th class:sticky-col={column === 'timestamp'}>
										{getColumnLabel(column, displaySelectedColumns)}
									</th>
								{/each}
							</tr>
						</thead>

						<tbody>
							{#each dataRows as row}
								<tr>
									{#each displaySelectedColumns as column}
										<td class:sticky-col={column === 'timestamp'}>
											{formatCellValue(row?.[column], column)}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="empty-box">Data log is not available for the selected time range.</div>
			{/if}
		</section>
	{/if}

	{#if hasRawData && !loading}
		<details class="raw-box">
			<summary>Raw Data Log Response</summary>
			<pre>{JSON.stringify(logData, null, 2)}</pre>
		</details>
	{/if}
</section>

<style>
	.data-log-page {
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

	.data-log-header-card,
	.filter-card,
	.column-card,
	.table-section,
	.raw-box {
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
	}

	.data-log-header-card {
		padding: 14px 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.override-card {
		display: grid;
		gap: 16px;
		margin-top: 16px;
		padding: 18px;
		border: 1px solid rgba(15, 23, 42, 0.1);
		border-radius: 18px;
		background: var(--color-surface);
		box-shadow: 0 14px 30px rgba(15, 23, 42, 0.06);
	}

	.override-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}

	.override-header h2 {
		margin: 2px 0 4px;
		font-size: 18px;
		font-weight: 800;
		color: var(--text-primary);
	}

	.override-header p {
		max-width: 720px;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-secondary);
	}

	.override-grid,
	.override-delete-row {
		display: grid;
		grid-template-columns: minmax(260px, 1fr) auto;
		align-items: end;
		gap: 14px;
	}

	.override-field {
		display: grid;
		gap: 7px;
	}

	.override-field span {
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 0.04em;
		color: var(--text-secondary);
		text-transform: uppercase;
	}

	.override-field input[type='text'],
	.override-field input[type='file'] {
		width: 100%;
		min-height: 42px;
		border: 1px solid rgba(15, 23, 42, 0.14);
		border-radius: 12px;
		background: var(--color-elevated);
		color: var(--text-primary);
		font-size: 13px;
	}

	.override-field input[type='text'] {
		padding: 0 12px;
	}

	.override-field input[type='file'] {
		padding: 9px 12px;
	}

	.override-field small {
		font-size: 12px;
		color: var(--text-secondary);
	}

	.override-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.ghost-btn,
	.danger-btn {
		min-height: 42px;
		border: 0;
		border-radius: 12px;
		padding: 0 14px;
		font-size: 13px;
		font-weight: 800;
		cursor: pointer;
	}

	.ghost-btn {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-primary);
	}

	.danger-btn {
		background: #ef4444;
		color: #ffffff;
	}

	.ghost-btn:disabled,
	.danger-btn:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.success-box {
		border: 1px solid rgba(22, 163, 74, 0.2);
		background: var(--color-success-muted);
		color: #166534;
	}

	@media (max-width: 760px) {
		.override-header,
		.override-actions {
			align-items: stretch;
			flex-direction: column;
		}

		.override-grid,
		.override-delete-row {
			grid-template-columns: 1fr;
		}
	}

	.page-kicker,
	.section-kicker {
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

	.data-log-header-card h1 {
		margin: 8px 0 0;
		font-size: 21px;
		line-height: 1.2;
		font-weight: 900;
		color: var(--text-primary);
	}

	.data-log-header-card p {
		margin: 7px 0 0;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
	}

	.header-meta {
		min-width: 120px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--color-elevated);
		border: 1px solid #e2e8f0;
		text-align: right;
	}

	.header-meta span {
		display: block;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.header-meta strong {
		display: block;
		margin-top: 5px;
		color: var(--text-primary);
		font-size: 18px;
		font-weight: 900;
	}

	.filter-card {
		margin-top: 12px;
		padding: 12px;
		display: flex;
		align-items: end;
		gap: 10px;
		flex-wrap: wrap;
	}

	.filter-card label {
		display: grid;
		gap: 5px;
	}

	.filter-card label span {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.filter-card input,
	.filter-card select {
		height: 32px;
		min-width: 160px;
		border: 1px solid #cbd5e1;
		background: var(--color-surface);
		padding: 0 9px;
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 700;
		outline: none;
	}

	.filter-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.primary-btn,
	.export-btn {
		height: 32px;
		padding: 0 12px;
		border: none;
		font-size: 11px;
		font-weight: 900;
		cursor: pointer;
	}

	.primary-btn {
		background: #2563eb;
		color: #ffffff;
	}

	.export-btn {
		background: #16a34a;
		color: #ffffff;
	}

	.primary-btn:disabled,
	.export-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.column-card {
		margin-top: 12px;
		overflow: hidden;
	}

	.column-header {
		min-height: 52px;
		padding: 11px 13px;
		border-bottom: 1px solid #e5edf5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--color-surface);
	}

	.column-header h2,
	.section-header h2 {
		margin: 6px 0 0;
		color: var(--text-primary);
		font-size: 16px;
		font-weight: 900;
	}

	.column-actions {
		display: flex;
		gap: 8px;
	}

	.column-actions button {
		height: 28px;
		padding: 0 10px;
		border: 1px solid #cbd5e1;
		background: var(--color-surface);
		color: var(--text-primary);
		font-size: 11px;
		font-weight: 900;
		cursor: pointer;
	}

	.column-grid {
		padding: 12px;
		display: grid;
		grid-template-columns: repeat(4, minmax(160px, 1fr));
		gap: 8px;
	}

	.column-item {
		min-height: 30px;
		padding: 6px 8px;
		border: 1px solid #e2e8f0;
		background: var(--color-elevated);
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 11px;
		font-weight: 800;
		color: var(--text-secondary);
	}

	.status-box {
		margin-top: 12px;
		padding: 10px 12px;
		border-radius: 10px;
		font-size: 12px;
		font-weight: 900;
	}

	.error-box {
		background: var(--color-danger-muted);
		color: #b91c1c;
		border: 1px solid #fecaca;
	}

	.table-section {
		margin-top: 12px;
		overflow: hidden;
	}

	.section-header {
		min-height: 54px;
		padding: 11px 13px;
		border-bottom: 1px solid #e5edf5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--color-surface);
	}

	.section-header > strong {
		padding: 5px 10px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 11px;
		font-weight: 900;
	}

	.data-log-table-wrapper {
		width: 100%;
		max-height: calc(100vh - 430px);
		min-height: 260px;
		overflow: auto;
		background: var(--color-surface);
	}

	.data-log-table {
		width: max-content;
		min-width: 100%;
		border-collapse: separate;
		border-spacing: 0;
		font-size: 11px;
	}

	.data-log-table thead th {
		position: sticky;
		top: 0;
		z-index: 5;
		background: #3478e5;
		color: #ffffff;
		border-right: 1px solid rgba(255, 255, 255, 0.32);
		border-bottom: 1px solid rgba(255, 255, 255, 0.32);
		text-align: center;
		vertical-align: middle;
		padding: 8px 9px;
		font-size: 10.5px;
		line-height: 1.15;
		font-weight: 900;
		white-space: nowrap;
	}

	.data-log-table tbody td {
		border-right: 1px solid #d7dee8;
		border-bottom: 1px solid #d7dee8;
		padding: 7px 9px;
		text-align: center;
		white-space: nowrap;
		font-size: 11px;
		font-weight: 700;
		color: var(--text-primary);
		background: var(--color-surface);
	}

	.data-log-table tbody tr:nth-child(even) td {
		background: var(--color-elevated);
	}

	.data-log-table tbody tr:hover td {
		background: var(--color-elevated);
	}

	.data-log-table .sticky-col {
		position: sticky;
		left: 0;
		z-index: 7;
		min-width: 150px;
		text-align: left;
	}

	.data-log-table thead .sticky-col {
		z-index: 9;
		background: #3478e5 !important;
	}

	.data-log-table tbody .sticky-col {
		background: inherit;
		box-shadow: 1px 0 0 #d7dee8;
	}

	.empty-box {
		padding: 18px 14px;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 800;
	}

	.raw-box {
		margin-top: 12px;
		padding: 12px 14px;
	}

	.raw-box summary {
		cursor: pointer;
		font-size: 12px;
		font-weight: 900;
		color: #1d4ed8;
	}

	.raw-box pre {
		margin-top: 12px;
		padding: 12px;
		max-height: 360px;
		overflow: auto;
		background: #0f172a;
		color: #e2e8f0;
		font-size: 11px;
		line-height: 1.5;
	}

	@media (max-width: 1100px) {
		.column-grid {
			grid-template-columns: repeat(2, minmax(160px, 1fr));
		}
	}

	@media (max-width: 760px) {
		.data-log-page {
			padding: 10px;
		}

		.data-log-header-card {
			flex-direction: column;
			align-items: flex-start;
		}

		.filter-card input,
		.filter-card select {
			min-width: 100%;
		}

		.filter-actions {
			width: 100%;
		}

		.primary-btn,
		.export-btn {
			width: 100%;
		}

		.column-grid {
			grid-template-columns: 1fr;
		}

		.data-log-table-wrapper {
			max-height: calc(100vh - 500px);
		}
	}
</style>
