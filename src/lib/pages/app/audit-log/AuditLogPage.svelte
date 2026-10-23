<script>
	import { onMount } from 'svelte';
	import { apiRequest } from '$lib/api/authApi.js';
	import AuditLogExportCard from './AuditLogExportCard.svelte';
	import AuditLogTable from './AuditLogTable.svelte';
	import AuditLogDetailModal from './AuditLogDetailModal.svelte';
	import './audit-log-page.css';

	let { active = true, refreshToken = 0 } = $props();

	let loading = $state(false);
	let detailLoading = $state(false);
	let exporting = $state(false);

	let error = $state('');
	let successMessage = $state('');

	let currentUser = $state(null);
	let currentUserLoading = $state(false);

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

	async function loadCurrentUser() {
		if (currentUser || currentUserLoading) return currentUser;

		currentUserLoading = true;

		try {
			const response = await apiRequest('/users/current-user', {
				method: 'GET'
			});

			currentUser = response?.data || response?.user || response || null;

			console.log('[AUDIT_LOG][CURRENT_USER]', currentUser);

			return currentUser;
		} catch (err) {
			console.error('[AUDIT_LOG][CURRENT_USER_ERROR]', err);
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

	<AuditLogExportCard
		{isSuperAdmin}
		bind:auditScope
		bind:userIdFilter
		bind:exportStartDate
		bind:exportEndDate
		bind:pageSize
		{exporting}
		onScopeChange={handleAuditScopeChange}
		onUserIdChange={() => {
			page = 1;
			loadAuditLogs();
		}}
		onPageSizeChange={handleApplyPageSize}
		onExport={handleExportCsv}
	/>

	<AuditLogTable
		{loading}
		title={isSuperAdmin && auditScope === 'all' ? 'All Audit Logs' : 'My Audit Logs'}
		{logs}
		{pagination}
		{formatDateTime}
		{formatModule}
		{getActionClass}
		onOpenDetail={openDetail}
		onPrevious={handlePreviousPage}
		onNext={handleNextPage}
	/>

	<AuditLogDetailModal
		open={detailOpen}
		loading={detailLoading}
		detail={selectedDetail}
		{formatDateTime}
		{formatModule}
		onClose={closeDetail}
	/>
</section>
