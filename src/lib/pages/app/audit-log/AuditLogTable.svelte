<script>
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import './audit-log-page.css';

	let {
		loading = false,
		title = 'My Audit Logs',
		logs = [],
		pagination = {},
		formatDateTime,
		formatModule,
		getActionClass,
		onOpenDetail,
		onPrevious,
		onNext
	} = $props();
</script>

<section class="table-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">History</span>
			<h2>{title}</h2>
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
					{#each logs as row, index (row.id ?? index)}
						<tr>
							<td>{((pagination.page || 1) - 1) * (pagination.pageSize || 20) + index + 1}</td>
							<td>{formatDateTime?.(row.logged_at)}</td>
							<td>
								<div class="user-cell">
									<strong>{row.user?.username || '-'}</strong>
									<span>ID: {row.user?.user_id ?? '-'}</span>
								</div>
							</td>
							<td>
								<span class={`action-pill ${getActionClass?.(row.action)}`}>
									{row.action || '-'}
								</span>
							</td>
							<td>{formatModule?.(row.module)}</td>
							<td>
								<code>{row.id || '-'}</code>
							</td>
							<td>
								<button type="button" class="small-btn" onclick={() => onOpenDetail?.(row.id)}>
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
				onclick={() => onPrevious?.()}
				disabled={!pagination.hasPrevious || loading}
			>
				Previous
			</button>

			<span>Page {pagination.page || 1} of {pagination.totalPages || 1}</span>

			<button
				type="button"
				class="secondary-btn"
				onclick={() => onNext?.()}
				disabled={!pagination.hasNext || loading}
			>
				Next
			</button>
		</div>
	{:else}
		<div class="empty-box">No audit logs are available for this user.</div>
	{/if}
</section>
