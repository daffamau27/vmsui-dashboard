<script>
	import { onMount } from 'svelte';
	import { apiRequest } from '$lib/api/authApi.js';

	let { active = true } = $props();

	let loading = $state(false);
	let detailLoading = $state(false);
	let exporting = $state(false);

	let error = $state('');
	let successMessage = $state('');

	let currentUser = $state(null);
	let currentUserLoading = $state(false);
	let currentUserError = $state('');

	let logs = $state([]);
	let selectedDetail = $state(null);
	let detailOpen = $state(false);

	let page = $state(1);
	let pageSize = $state(20);

	let auditScope = $state('my');
	let userIdFilter = $state('');

	let exportStartDate = $state('');
	let exportEndDate = $state('');

	let pagination = $state({
		page: 1,
		pageSize: 20,
		totalItems: 0,
		totalPages: 1,
		hasNext: false,
		hasPrevious: false
	});

	let totalLogCount = $derived(pagination?.totalItems || logs.length);

	let createCount = $derived(
		logs.filter((row) => String(row?.action || '').toUpperCase() === 'CREATE').length
	);

	let updateCount = $derived(
		logs.filter((row) => String(row?.action || '').toUpperCase() === 'UPDATE').length
	);

	let deleteCount = $derived(
		logs.filter((row) => String(row?.action || '').toUpperCase() === 'DELETE').length
	);

	async function loadCurrentUser() {
		if (currentUser || currentUserLoading) return currentUser;

		currentUserLoading = true;
		currentUserError = '';

		try {
			const response = await apiRequest('/users/current-user', {
				method: 'GET'
			});

			currentUser = response?.data || response?.user || response || null;

			console.log('[AUDIT_LOG][CURRENT_USER]', currentUser);

			return currentUser;
		} catch (err) {
			console.error('[AUDIT_LOG][CURRENT_USER_ERROR]', err);
			currentUserError = err?.message || 'Gagal memuat data user.';
			currentUser = null;
			return null;
		} finally {
			currentUserLoading = false;
		}
	}

	let isSuperAdmin = $derived(currentUser?.permissionAccess?.mode === 'all');

	function formatDateTime(value) {
		if (!value && value !== 0) return '-';

		const timestamp = Number(value);
		if (!Number.isFinite(timestamp)) return String(value);

		const date = new Date(timestamp);
		if (Number.isNaN(date.getTime())) return '-';

		return date.toLocaleString('en-GB', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function formatModule(value) {
		return String(value || '-')
			.replace(/_/g, ' ')
			.replace(/-/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.toUpperCase();
	}

	function getActionClass(action) {
		const normalized = String(action || '').toUpperCase();

		if (normalized === 'CREATE') return 'action-create';
		if (normalized === 'UPDATE') return 'action-update';
		if (normalized === 'DELETE') return 'action-delete';
		if (normalized === 'RECALCULATE') return 'action-recalculate';

		return 'action-neutral';
	}

	function dateInputToTimestamp(value, endOfDay = false) {
		if (!value) return '';

		const date = new Date(value);

		if (endOfDay) {
			date.setHours(23, 59, 59, 999);
		} else {
			date.setHours(0, 0, 0, 0);
		}

		return date.getTime();
	}

	function buildAuditQuery() {
		const params = new URLSearchParams();

		params.set('page', String(page));
		params.set('pageSize', String(pageSize));

		if (isSuperAdmin && auditScope === 'all' && userIdFilter) {
			params.set('userId', String(userIdFilter));
		}

		return params.toString();
	}

	function getAuditListEndpoint(query) {
		if (isSuperAdmin && auditScope === 'all') {
			return `/audit-logs${query ? `?${query}` : ''}`;
		}

		return `/audit-logs/my${query ? `?${query}` : ''}`;
	}

	function getAuditExportEndpoint(query) {
		if (isSuperAdmin && auditScope === 'all') {
			return `/audit-logs/export-csv${query ? `?${query}` : ''}`;
		}

		return `/audit-logs/my/export-csv${query ? `?${query}` : ''}`;
	}

	async function loadAuditLogs() {
		loading = true;
		error = '';

		try {
			const query = buildAuditQuery();
			const endpoint = getAuditListEndpoint(query);

			const response = await apiRequest(endpoint, {
				method: 'GET'
			});

			const payload = response?.data || {};

			logs = Array.isArray(payload?.items)
				? payload.items
				: Array.isArray(response?.items)
					? response.items
					: [];

			pagination = {
				page: payload?.pagination?.page ?? page,
				pageSize: payload?.pagination?.pageSize ?? pageSize,
				totalItems: payload?.pagination?.totalItems ?? logs.length,
				totalPages: payload?.pagination?.totalPages ?? 1,
				hasNext: Boolean(payload?.pagination?.hasNext),
				hasPrevious: Boolean(payload?.pagination?.hasPrevious)
			};
		} catch (err) {
			console.error('[AUDIT_LOG][LOAD_ERROR]', err);

			if (auditScope === 'all' && String(err?.message || '').includes('Forbidden')) {
				error = 'Endpoint All Audit Logs hanya dapat diakses oleh Super Admin.';
			} else {
				error = err?.message || 'Gagal memuat audit log.';
			}

			logs = [];
			pagination = {
				page,
				pageSize,
				totalItems: 0,
				totalPages: 1,
				hasNext: false,
				hasPrevious: false
			};
		} finally {
			loading = false;
		}
	}

	async function openDetail(id) {
		if (!id) return;

		detailOpen = true;
		detailLoading = true;
		selectedDetail = null;
		error = '';

		try {
			const response = await apiRequest(`/audit-logs/${id}`, {
				method: 'GET'
			});

			selectedDetail = response?.data || null;
		} catch (err) {
			console.error('[AUDIT_LOG][DETAIL_ERROR]', err);
			error = err?.message || 'Gagal memuat detail audit log.';
			detailOpen = false;
		} finally {
			detailLoading = false;
		}
	}

	function closeDetail() {
		detailOpen = false;
		selectedDetail = null;
	}

	async function handleRefresh() {
		await loadAuditLogs();
	}

	async function handleApplyPageSize() {
		page = 1;
		await loadAuditLogs();
	}

	async function handleNextPage() {
		if (!pagination.hasNext) return;

		page = Number(pagination.page || page) + 1;
		await loadAuditLogs();
	}

	async function handlePreviousPage() {
		if (!pagination.hasPrevious) return;

		page = Math.max(1, Number(pagination.page || page) - 1);
		await loadAuditLogs();
	}

	async function handleExportCsv() {
		exporting = true;
		error = '';
		successMessage = '';

		try {
			const params = new URLSearchParams();

			const startDate = dateInputToTimestamp(exportStartDate, false);
			const endDate = dateInputToTimestamp(exportEndDate, true);

			if (isSuperAdmin && auditScope === 'all' && userIdFilter) {
				params.set('userId', String(userIdFilter));
			}

			if (startDate) params.set('startDate', String(startDate));
			if (endDate) params.set('endDate', String(endDate));

			const query = params.toString();
			const endpoint = getAuditExportEndpoint(query);

			const response = await apiRequest(endpoint, {
				method: 'GET',
				headers: {
					Accept: 'text/csv'
				},
				rawResponse: true
			});

			const blob = await response.blob();
			const downloadUrl = window.URL.createObjectURL(blob);

			const fallbackName =
				isSuperAdmin && auditScope === 'all'
					? `audit_logs_${Date.now()}.csv`
					: `my_audit_logs_${Date.now()}.csv`;

			const fileName =
				response.headers.get('content-disposition')?.match(/filename="?([^"]+)"?/)?.[1] ||
				fallbackName;

			const link = document.createElement('a');
			link.href = downloadUrl;
			link.download = fileName;
			document.body.appendChild(link);
			link.click();
			link.remove();

			window.URL.revokeObjectURL(downloadUrl);

			successMessage =
				auditScope === 'all'
					? 'All audit logs CSV exported successfully.'
					: 'My audit logs CSV exported successfully.';
		} catch (err) {
			console.error('[AUDIT_LOG][EXPORT_ERROR]', err);

			if (auditScope === 'all' && String(err?.message || '').includes('Forbidden')) {
				error = 'Export All Audit Logs hanya dapat diakses oleh Super Admin.';
			} else {
				error = err?.message || 'Gagal export audit log CSV.';
			}
		} finally {
			exporting = false;
		}
	}

	async function handleAuditScopeChange() {
		if (!isSuperAdmin) {
			auditScope = 'my';
			userIdFilter = '';
		}

		page = 1;
		logs = [];

		pagination = {
			page: 1,
			pageSize,
			totalItems: 0,
			totalPages: 1,
			hasNext: false,
			hasPrevious: false
		};

		await loadAuditLogs();
	}

	onMount(async () => {
		const user = await loadCurrentUser();

		if (user?.permissionAccess?.mode !== 'all') {
			auditScope = 'my';
			userIdFilter = '';
		}

		await loadAuditLogs();
	});

	$effect(() => {
		if (active) {
			loadAuditLogs();
		}
	});
</script>

<section class="audit-page">
	<section class="audit-header-card">
		<div>
			<div class="page-kicker">Audit Log</div>
			<h1>Audit Log Page</h1>
			<p>
				Activity history for the current authenticated user, including create, update, delete, and
				recalculation actions.
			</p>
		</div>

		<div class="header-actions">
			<button type="button" class="secondary-btn" onclick={handleRefresh} disabled={loading}>
				{loading ? 'Refreshing...' : 'Refresh'}
			</button>

			<button type="button" class="primary-btn" onclick={handleExportCsv} disabled={exporting}>
				{exporting ? 'Exporting...' : 'Export CSV'}
			</button>
		</div>
	</section>

	{#if error}
		<div class="status-box error-box">
			{error}
		</div>
	{/if}

	{#if successMessage}
		<div class="status-box success-box">
			{successMessage}
		</div>
	{/if}

	<section class="audit-summary-grid">
		<article class="summary-card">
			<span>Total Logs</span>
			<strong>{totalLogCount}</strong>
		</article>

		<article class="summary-card">
			<span>Create</span>
			<strong>{createCount}</strong>
		</article>

		<article class="summary-card">
			<span>Update</span>
			<strong>{updateCount}</strong>
		</article>

		<article class="summary-card">
			<span>Delete</span>
			<strong>{deleteCount}</strong>
		</article>
	</section>

	<section class="table-section">
		<div class="section-header">
			<div>
				<span class="section-kicker">Export</span>
				<h2>{isSuperAdmin && auditScope === 'all' ? 'Export All Audit Logs' : 'Export My Audit Logs'}</h2>
			</div>

			<strong>CSV</strong>
		</div>

		<div class="audit-filter-card">
			{#if isSuperAdmin}
				<label>
					<span>Audit Scope</span>
					<select bind:value={auditScope} onchange={handleAuditScopeChange}>
						<option value="my">My Audit Logs</option>
						<option value="all">All Audit Logs</option>
					</select>
				</label>
			{/if}

            {#if isSuperAdmin && auditScope === "all"}
                <label>
                    <span>User ID</span>
                    <input
                    type="number"
                    min="1"
                    placeholder="Optional"
                    bind:value={userIdFilter}
                    onchange={() => {
                        page = 1;
                        loadAuditLogs();
                    }}
                    />
                </label>
            {/if}
			<label>
				<span>Start Date</span>
				<input type="date" bind:value={exportStartDate} />
			</label>

			<label>
				<span>End Date</span>
				<input type="date" bind:value={exportEndDate} />
			</label>

			<label>
				<span>Page Size</span>
				<select bind:value={pageSize} onchange={handleApplyPageSize}>
					<option value={10}>10</option>
					<option value={20}>20</option>
					<option value={50}>50</option>
					<option value={100}>100</option>
				</select>
			</label>

			<div class="filter-actions">
				<button type="button" class="primary-btn" onclick={handleExportCsv} disabled={exporting}>
					Export
				</button>

				<button
					type="button"
					class="secondary-btn"
					onclick={() => {
						exportStartDate = '';
						exportEndDate = '';
					}}
					disabled={exporting}
				>
					Reset
				</button>
			</div>
		</div>
	</section>

	<section class="table-section">
		<div class="section-header">
			<div>
				<span class="section-kicker">History</span>
				<h2>{isSuperAdmin && auditScope === "all" ? "All Audit Logs" : "My Audit Logs"}</h2>
			</div>

			<strong>{pagination.totalItems || 0} records</strong>
		</div>

		{#if loading}
			<div class="empty-box">Loading audit logs...</div>
		{:else if logs.length}
			<div class="table-wrapper">
				<table>
					<thead>
						<tr>
							<th>No</th>
							<th>Logged At</th>
							<th>User</th>
							<th>Action</th>
							<th>Module</th>
							<th>Audit ID</th>
							<th>Detail</th>
						</tr>
					</thead>

					<tbody>
						{#each logs as row, index}
							<tr>
								<td>{(pagination.page - 1) * pagination.pageSize + index + 1}</td>
								<td>{formatDateTime(row.logged_at)}</td>
								<td>
									<div class="user-cell">
										<strong>{row.user?.username || '-'}</strong>
										<span>ID: {row.user?.user_id ?? '-'}</span>
									</div>
								</td>
								<td>
									<span class={`action-pill ${getActionClass(row.action)}`}>
										{row.action || '-'}
									</span>
								</td>
								<td>{formatModule(row.module)}</td>
								<td>
									<code>{row.id || '-'}</code>
								</td>
								<td>
									<button type="button" class="small-btn" onclick={() => openDetail(row.id)}>
										View
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="pagination-bar">
				<button
					type="button"
					class="secondary-btn"
					onclick={handlePreviousPage}
					disabled={!pagination.hasPrevious || loading}
				>
					Previous
				</button>

				<span>
					Page {pagination.page || page} of {pagination.totalPages || 1}
				</span>

				<button
					type="button"
					class="secondary-btn"
					onclick={handleNextPage}
					disabled={!pagination.hasNext || loading}
				>
					Next
				</button>
			</div>
		{:else}
			<div class="empty-box">Tidak ada audit log untuk user ini.</div>
		{/if}
	</section>
</section>

{#if detailOpen}
	<div class="detail-overlay" role="presentation" onclick={closeDetail}>
		<section
			class="detail-modal"
			role="dialog"
			aria-modal="true"
			onclick={(event) => event.stopPropagation()}
		>
			<div class="detail-header">
				<div>
					<span class="section-kicker">Detail</span>
					<h2>Audit Log Detail</h2>
				</div>

				<button type="button" class="close-btn" onclick={closeDetail}> × </button>
			</div>

			{#if detailLoading}
				<div class="empty-box">Loading audit detail...</div>
			{:else if selectedDetail}
				<div class="detail-body">
					<div class="detail-grid">
						<div>
							<span>Audit ID</span>
							<strong>{selectedDetail.id || '-'}</strong>
						</div>

						<div>
							<span>User</span>
							<strong>{selectedDetail.user?.username || '-'}</strong>
						</div>

						<div>
							<span>Action</span>
							<strong>{selectedDetail.action || '-'}</strong>
						</div>

						<div>
							<span>Module</span>
							<strong>{formatModule(selectedDetail.module)}</strong>
						</div>

						<div>
							<span>Entity Name</span>
							<strong>{selectedDetail.entity?.entity_name || '-'}</strong>
						</div>

						<div>
							<span>Entity ID</span>
							<strong>{selectedDetail.entity?.entity_id || '-'}</strong>
						</div>

						<div>
							<span>Logged At</span>
							<strong>{formatDateTime(selectedDetail.logged_at)}</strong>
						</div>
					</div>

					<div class="changes-card">
						<div class="section-header compact">
							<div>
								<span class="section-kicker">Changes</span>
								<h2>Modification Detail</h2>
							</div>

							<strong>{selectedDetail.changes?.length || 0} items</strong>
						</div>

						{#if selectedDetail.changes?.length}
							<pre>{JSON.stringify(selectedDetail.changes, null, 2)}</pre>
						{:else}
							<div class="empty-box">Tidak ada detail perubahan.</div>
						{/if}
					</div>
				</div>
			{/if}
		</section>
	</div>
{/if}

<style>
	.audit-page {
		min-height: 100vh;
		padding: 16px;
		background: #f3f6fa;
		color: #0f172a;
		display: grid;
		gap: 14px;
	}

	.audit-header-card,
	.table-section,
	.status-box,
	.summary-card {
		background: #ffffff;
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
	}

	.audit-header-card {
		padding: 18px 22px;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 18px;
	}

	.page-kicker,
	.section-kicker {
		display: inline-flex;
		padding: 4px 10px;
		border-radius: 999px;
		background: #dbeafe;
		color: #1d4ed8;
		font-size: 11px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.audit-header-card h1 {
		margin: 10px 0 4px;
		font-size: 24px;
		font-weight: 900;
	}

	.audit-header-card p {
		margin: 0;
		color: #64748b;
		font-size: 13px;
		font-weight: 700;
	}

	.header-actions {
		display: flex;
		gap: 10px;
		align-items: center;
	}

	.primary-btn,
	.secondary-btn,
	.small-btn {
		height: 40px;
		padding: 0 16px;
		border: none;
		font-size: 13px;
		font-weight: 900;
		cursor: pointer;
	}

	.primary-btn {
		background: #2563eb;
		color: #ffffff;
	}

	.secondary-btn {
		background: #f8fafc;
		color: #0f172a;
		border: 1px solid #cbd5e1;
	}

	.small-btn {
		height: 32px;
		padding: 0 12px;
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
	}

	.primary-btn:disabled,
	.secondary-btn:disabled,
	.small-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.status-box {
		padding: 12px 16px;
		font-size: 13px;
		font-weight: 900;
	}

	.error-box {
		background: #fef2f2;
		color: #b91c1c;
		border-color: #fecaca;
	}

	.success-box {
		background: #f0fdf4;
		color: #15803d;
		border-color: #bbf7d0;
	}

	.audit-summary-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
	}

	.summary-card {
		min-height: 88px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.summary-card span {
		color: #64748b;
		font-size: 11px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.summary-card strong {
		margin-top: 8px;
		font-size: 24px;
		font-weight: 900;
	}

	.section-header {
		min-height: 58px;
		padding: 12px 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid #e2e8f0;
	}

	.section-header.compact {
		min-height: unset;
		padding: 12px 14px;
	}

	.section-header h2 {
		margin: 6px 0 0;
		font-size: 18px;
		font-weight: 900;
	}

	.section-header strong {
		padding: 5px 10px;
		border-radius: 999px;
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 11px;
		font-weight: 900;
	}

	.audit-filter-card {
		padding: 14px;
		display: flex;
		align-items: end;
		gap: 12px;
		flex-wrap: wrap;
		background: #f8fafc;
		border-bottom: 1px solid #e2e8f0;
	}

	.audit-filter-card label {
		display: grid;
		gap: 6px;
	}

	.audit-filter-card label span {
		color: #475569;
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.audit-filter-card input,
	.audit-filter-card select {
		height: 40px;
		min-width: 170px;
		padding: 0 10px;
		border: 1px solid #cbd5e1;
		background: #ffffff;
		color: #0f172a;
		font-size: 13px;
		font-weight: 800;
	}

	.filter-actions {
		display: flex;
		gap: 8px;
	}

	.table-wrapper {
		width: 100%;
		overflow: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}

	th {
		padding: 10px 12px;
		background: #f1f5f9;
		border-bottom: 1px solid #d9e2ec;
		color: #334155;
		font-size: 11px;
		font-weight: 900;
		text-align: left;
		text-transform: uppercase;
		white-space: nowrap;
	}

	td {
		padding: 10px 12px;
		border-bottom: 1px solid #edf2f7;
		color: #0f172a;
		font-weight: 800;
		white-space: nowrap;
	}

	code {
		color: #334155;
		font-size: 11px;
		font-weight: 900;
	}

	.user-cell {
		display: grid;
		gap: 3px;
	}

	.user-cell strong {
		font-size: 12px;
		font-weight: 900;
	}

	.user-cell span {
		color: #64748b;
		font-size: 10px;
		font-weight: 900;
	}

	.action-pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 86px;
		padding: 5px 8px;
		border-radius: 999px;
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.action-create {
		background: #dcfce7;
		border: 1px solid #bbf7d0;
		color: #15803d;
	}

	.action-update {
		background: #dbeafe;
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
	}

	.action-delete {
		background: #fee2e2;
		border: 1px solid #fecaca;
		color: #b91c1c;
	}

	.action-recalculate {
		background: #fef3c7;
		border: 1px solid #fde68a;
		color: #92400e;
	}

	.action-neutral {
		background: #f1f5f9;
		border: 1px solid #cbd5e1;
		color: #475569;
	}

	.pagination-bar {
		padding: 12px 14px;
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 12px;
		background: #f8fafc;
	}

	.pagination-bar span {
		color: #475569;
		font-size: 12px;
		font-weight: 900;
	}

	.empty-box {
		padding: 18px;
		color: #64748b;
		font-weight: 800;
	}

	.detail-overlay {
		position: fixed;
		inset: 0;
		z-index: 1000;
		padding: 18px;
		display: grid;
		place-items: center;
		background: rgba(15, 23, 42, 0.48);
	}

	.detail-modal {
		width: min(780px, 100%);
		max-height: 90vh;
		overflow: auto;
		background: #ffffff;
		border: 1px solid #d9e2ec;
		box-shadow: 0 24px 80px rgba(15, 23, 42, 0.22);
	}

	.detail-header {
		min-height: 58px;
		padding: 12px 16px;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		border-bottom: 1px solid #e2e8f0;
		background: #ffffff;
	}

	.detail-header h2 {
		margin: 6px 0 0;
		font-size: 18px;
		font-weight: 900;
	}

	.close-btn {
		width: 38px;
		height: 38px;
		border: 1px solid #cbd5e1;
		background: #f8fafc;
		color: #0f172a;
		font-size: 24px;
		font-weight: 900;
		cursor: pointer;
	}

	.detail-body {
		display: grid;
		gap: 14px;
		padding: 14px;
		background: #f8fafc;
	}

	.detail-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	.detail-grid div {
		padding: 14px;
		background: #ffffff;
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
	}

	.detail-grid span {
		display: block;
		color: #64748b;
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.detail-grid strong {
		display: block;
		margin-top: 6px;
		color: #0f172a;
		font-size: 12px;
		font-weight: 900;
		word-break: break-word;
	}

	.changes-card {
		background: #ffffff;
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
	}

	pre {
		margin: 0;
		padding: 14px;
		overflow: auto;
		background: #0f172a;
		color: #e5e7eb;
		font-size: 12px;
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-word;
	}

	@media (max-width: 900px) {
		.audit-header-card {
			flex-direction: column;
		}

		.header-actions,
		.audit-filter-card,
		.filter-actions {
			width: 100%;
			flex-direction: column;
			align-items: stretch;
		}

		.audit-summary-grid,
		.detail-grid {
			grid-template-columns: 1fr;
		}

		.audit-filter-card input,
		.audit-filter-card select,
		.primary-btn,
		.secondary-btn {
			width: 100%;
		}
	}
</style>
