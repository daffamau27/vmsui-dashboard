<script>
	import { onMount } from 'svelte';
	import { apiRequest } from '$lib/api/authApi.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let { active = true, refreshToken = 0 } = $props();

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
	let auditPageMounted = false;
	let lastRefreshToken = refreshToken;
	let wasActive = active;

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
			currentUserError = err?.message || 'Failed to load user data.';
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
				error = 'The All Audit Logs endpoint can only be accessed by Super Admin.';
			} else {
				error = err?.message || 'Failed to load audit logs.';
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
			error = err?.message || 'Failed to load audit log detail.';
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
				error = 'Exporting All Audit Logs is only available for Super Admin.';
			} else {
				error = err?.message || 'Failed to export audit log CSV.';
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
		auditPageMounted = true;
	});

	$effect(() => {
		if (!auditPageMounted) return;

		if (refreshToken !== lastRefreshToken) {
			lastRefreshToken = refreshToken;
			loadAuditLogs();
		}

		if (active && !wasActive) {
			loadAuditLogs();
		}

		wasActive = active;
	});
</script>

<section class="audit-page">
	<!-- <section class="audit-header-card">
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
	</section> -->

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
			<LoadingSkeleton label="Loading audit logs" variant="audit-log-table" rows={6} columns={7} />
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
			<div class="empty-box">No audit logs are available for this user.</div>
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
				<LoadingSkeleton label="Loading audit detail" variant="audit-log-detail" />
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
							<div class="empty-box">No change details are available.</div>
						{/if}
					</div>
				</div>
			{/if}
		</section>
	</div>
{/if}

<style>
	.audit-page {
		width: 100%;
		height: 100vh;
		height: 100dvh;
		max-height: 100vh;
		max-height: 100dvh;
		min-height: 0;
		padding: 14px 14px 32px;
		background: var(--color-base);
		color: var(--text-primary);
		overflow-y: auto;
		overflow-x: hidden;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 14px;
		-webkit-overflow-scrolling: touch;
		overscroll-behavior: contain;
	}

	.audit-header-card,
	.table-section,
	.summary-card {
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
	}

	.audit-header-card {
		padding: 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
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

	.audit-header-card h1 {
		margin: 8px 0 0;
		color: var(--text-primary);
		font-size: 22px;
		line-height: 1.2;
		font-weight: 900;
	}

	.audit-header-card p {
		max-width: 720px;
		margin: 7px 0 0;
		color: var(--text-secondary);
		font-size: 12px;
		line-height: 1.5;
		font-weight: 700;
	}

	.header-actions {
		display: flex;
		gap: 8px;
		align-items: center;
		justify-content: flex-end;
		flex-wrap: wrap;
	}

	.primary-btn,
	.secondary-btn,
	.small-btn {
		height: 32px;
		padding: 0 12px;
		border: none;
		font-size: 11px;
		font-weight: 900;
		cursor: pointer;
		white-space: nowrap;
	}

	.primary-btn {
		background: #2563eb;
		color: #ffffff;
	}

	.secondary-btn {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-primary);
	}

	.small-btn {
		height: 30px;
		padding: 0 11px;
		background: var(--color-accent-muted);
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
	}

	.primary-btn:hover:not(:disabled),
	.secondary-btn:hover:not(:disabled),
	.small-btn:hover:not(:disabled) {
		filter: brightness(0.98);
	}

	.primary-btn:disabled,
	.secondary-btn:disabled,
	.small-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.status-box {
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

	.success-box {
		background: var(--color-success-muted);
		color: #047857;
		border: 1px solid #bbf7d0;
	}

	.audit-summary-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 14px;
	}

	.summary-card {
		min-height: 96px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.summary-card span {
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.summary-card strong {
		margin-top: 10px;
		color: var(--text-primary);
		font-size: 22px;
		line-height: 1.1;
		font-weight: 900;
	}

	.table-section {
		overflow: visible;
	}

	.section-header {
		min-height: 58px;
		padding: 12px 14px;
		border-bottom: 1px solid #e5edf5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--color-surface);
	}

	.section-header.compact {
		min-height: unset;
		padding: 12px 14px;
	}

	.section-header h2 {
		margin: 7px 0 0;
		color: var(--text-primary);
		font-size: 17px;
		font-weight: 900;
	}

	.section-header > strong {
		padding: 5px 10px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 11px;
		font-weight: 900;
		white-space: nowrap;
	}

	.audit-filter-card {
		padding: 12px;
		display: flex;
		align-items: end;
		gap: 10px;
		flex-wrap: wrap;
		background: var(--color-elevated);
		border-bottom: 1px solid #e5edf5;
	}

	.audit-filter-card label {
		display: grid;
		gap: 5px;
	}

	.audit-filter-card label span {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
	}

	.audit-filter-card input,
	.audit-filter-card select {
		height: 32px;
		min-width: 150px;
		border: 1px solid #cbd5e1;
		background: var(--color-surface);
		padding: 0 9px;
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 700;
		outline: none;
	}

	.audit-filter-card input:focus,
	.audit-filter-card select:focus {
		border-color: #2563eb;
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
	}

	.filter-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.table-wrapper {
		width: 100%;
		overflow-x: auto;
		overflow-y: visible;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}

	th {
		background: var(--color-elevated);
		color: var(--text-secondary);
		font-size: 10.5px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		text-align: left;
		padding: 10px 12px;
		border-bottom: 1px solid #e2e8f0;
		white-space: nowrap;
	}

	td {
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 700;
		padding: 10px 12px;
		border-bottom: 1px solid #eef2f7;
		white-space: nowrap;
	}

	tr:hover td {
		background: var(--color-elevated);
	}

	code {
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 900;
	}

	.user-cell {
		display: grid;
		gap: 3px;
	}

	.user-cell strong {
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 900;
	}

	.user-cell span {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
	}

	.action-pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 82px;
		padding: 5px 9px;
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
		background: var(--color-accent-muted);
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
	}

	.action-delete {
		background: var(--color-danger-muted);
		border: 1px solid #fecaca;
		color: #b91c1c;
	}

	.action-recalculate {
		background: var(--color-warning-muted);
		border: 1px solid #fde68a;
		color: #92400e;
	}

	.action-neutral {
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid #cbd5e1;
		color: var(--text-secondary);
	}

	.pagination-bar {
		padding: 12px 14px;
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 12px;
		background: var(--color-elevated);
	}

	.pagination-bar span {
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 900;
	}

	.empty-box {
		padding: 18px 14px;
		color: var(--text-secondary);
		font-size: 12px;
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
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		box-shadow: 0 24px 80px rgba(15, 23, 42, 0.22);
	}

	.detail-header {
		min-height: 58px;
		padding: 12px 14px;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		border-bottom: 1px solid #e5edf5;
		background: var(--color-surface);
	}

	.detail-header h2 {
		margin: 7px 0 0;
		color: var(--text-primary);
		font-size: 17px;
		font-weight: 900;
	}

	.close-btn {
		width: 32px;
		height: 32px;
		border: none;
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-primary);
		font-size: 22px;
		line-height: 1;
		font-weight: 900;
		cursor: pointer;
	}

	.detail-body {
		display: grid;
		gap: 14px;
		padding: 14px;
		background: var(--color-elevated);
	}

	.detail-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	.detail-grid div,
	.changes-card {
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
	}

	.detail-grid div {
		min-height: 76px;
		padding: 14px;
	}

	.detail-grid span {
		display: block;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.detail-grid strong {
		display: block;
		margin-top: 6px;
		color: var(--text-primary);
		font-size: 12px;
		line-height: 1.4;
		font-weight: 900;
		word-break: break-word;
	}

	pre {
		margin: 0;
		padding: 12px;
		max-height: 380px;
		overflow: auto;
		background: #0f172a;
		color: #e2e8f0;
		font-size: 11px;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
	}

	@media (max-width: 900px) {
		.audit-header-card {
			align-items: stretch;
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
		.secondary-btn,
		.small-btn {
			width: 100%;
		}

		.section-header,
		.pagination-bar {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
