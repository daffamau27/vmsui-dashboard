<script>
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import './data-log-page.css';

	let {
		loading = false,
		loadingMore = false,
		rows = [],
		columns = [],
		pagination = null,
		page = 1,
		hasNext = false,
		showLegend = false,
		rowHighlightContextError = '',
		rowHighlights = new Map(),
		getColumnLabel,
		formatCellValue,
		getRowColumnValue,
		onScroll,
		onLoadMore
	} = $props();

	function formatDeviationDuration(minutes) {
		const value = Number(minutes);
		if (!Number.isFinite(value) || value <= 0) return '0 min';

		const totalMinutes = Math.round(value);
		const days = Math.floor(totalMinutes / 1440);
		const hours = Math.floor((totalMinutes % 1440) / 60);
		const mins = totalMinutes % 60;
		const parts = [];

		if (days) parts.push(`${days}d`);
		if (hours) parts.push(`${hours}h`);
		if (mins || !parts.length) parts.push(`${mins}m`);

		return parts.join(' ');
	}
</script>

{#if loading && !rows.length}
	<LoadingSkeleton
		label="Loading telemetry log"
		variant="data-log"
		rows={10}
		columns={columns.length || 10}
	/>
{:else}
	<section class="table-section">
		<div class="section-header">
			<div>
				<span class="section-kicker">Telemetry</span>
				<h2>1-Minute Data Log</h2>
			</div>

			<strong>
				{rows.length}
				{#if pagination?.totalItems}
					/ {pagination.totalItems}
				{/if}
				rows
			</strong>
		</div>

		{#if rows.length}
			{#if showLegend}
				<div
					class="row-highlight-legend"
					aria-label="High main engine RPM and low speed row indicators"
				>
					<span>RPM &gt; 1000 on any ME and speed &lt; 2 kn, continuously:</span>
					<span class="warning"><i aria-hidden="true"></i> 5–10 min</span>
					<span class="danger"><i aria-hidden="true"></i> &gt;10 min</span>
					<span>The entire interval uses one color, including its first rows. AE is excluded.</span>
				</div>
				{#if rowHighlightContextError}
					<p class="row-highlight-notice" role="status">{rowHighlightContextError}</p>
				{/if}
			{/if}
			<div class="data-log-table-wrapper" onscroll={(event) => onScroll?.(event)}>
				<table class="data-log-table">
					<thead>
						<tr>
							{#each columns as column (column)}
								<th class:sticky-col={column === 'timestamp'}>
									{getColumnLabel?.(column, columns)}
								</th>
							{/each}
						</tr>
					</thead>

					<tbody>
						{#each rows as row, index (index)}
							{@const highlight = rowHighlights.get(row)}
							<tr
								class:high-rpm-warning={highlight?.level === 'warning'}
								class:high-rpm-danger={highlight?.level === 'danger'}
								title={highlight
									? `Continuous interval with ME RPM > 1000 and speed < 2 kn: ${formatDeviationDuration(highlight.durationMinutes)} | ${highlight.engines.join(', ')}`
									: undefined}
							>
								{#each columns as column (column)}
									<td class:sticky-col={column === 'timestamp'}>
										{formatCellValue?.(getRowColumnValue?.(row, column), column)}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="lazy-load-footer">
				<div>
					Page {pagination?.page || page}
					{#if pagination?.totalPages}
						of {pagination.totalPages}
					{/if}
					{#if loadingMore}
						<span>• Loading older rows...</span>
					{:else if hasNext}
						<span>• Scroll down to load older rows</span>
					{:else}
						<span>• All loaded</span>
					{/if}
				</div>

				{#if hasNext}
					<button
						type="button"
						class="load-more-btn"
						onclick={() => onLoadMore?.()}
						disabled={loadingMore || loading}
					>
						{loadingMore ? 'Loading...' : 'Load more'}
					</button>
				{/if}
			</div>
		{:else}
			<div class="empty-box">Data log is not available for the selected time range.</div>
		{/if}
	</section>
{/if}
