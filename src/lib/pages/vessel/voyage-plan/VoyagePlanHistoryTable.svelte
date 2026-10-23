<script>
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let {
		rows = [],
		pagination = { totalItems: 0, page: 1, totalPages: 1, hasPrevious: false, hasNext: false },
		historyLoading = false,
		detailLoading = false,
		selectedHistoryId = null,
		onView,
		onPrev,
		onNext
	} = $props();
</script>

<section class="table-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">Assignment History</span>
			<h2>Voyage Plan History</h2>
		</div>

		<strong>{pagination.totalItems || 0} rows</strong>
	</div>

	{#if rows.length}
		{#if historyLoading}
			<LoadingSkeleton label="Loading voyage plan history" variant="voyage-history-table" />
		{/if}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>ID</th>
						<th>Plan ID</th>
						<th>Start Date</th>
						<th>End Date</th>
						<th>Assigned At</th>
						<th>User</th>
						<th class="right">Action</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as item (item.key)}
						<tr class:active-row={selectedHistoryId === item.id}>
							<td>#{item.id}</td>
							<td>#{item.voyagePlanId}</td>
							<td>{item.startDateLabel}</td>
							<td>{item.endDateLabel}</td>
							<td>{item.assignedAtLabel}</td>
							<td>{item.userLabel}</td>
							<td class="right">
								<button
									type="button"
									class="table-action-btn"
									onclick={() => onView?.(item.id)}
									disabled={detailLoading}
								>
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
				disabled={!pagination.hasPrevious || historyLoading}
				onclick={() => onPrev?.()}
			>
				Previous
			</button>

			<span>Page {pagination.page || 1} of {pagination.totalPages || 1}</span>

			<button
				type="button"
				disabled={!pagination.hasNext || historyLoading}
				onclick={() => onNext?.()}
			>
				Next
			</button>
		</div>
	{:else}
		<div class="empty-box">Voyage plan history is not available yet.</div>
	{/if}
</section>
