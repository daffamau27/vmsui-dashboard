<script>
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import './avs-page.css';

	let {
		hasLoadedReport = false,
		loading = false,
		rows = [],
		tableLayout = { headerRows: [], columns: [] },
		visibleDataColumns = [],
		formatRangeLabel,
		isTotalColumn,
		getCellValue
	} = $props();
</script>

<section class="table-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">Result</span>
			<h2>Summary Table</h2>
		</div>

		<strong>{rows.length} rows</strong>
	</div>

	{#if !hasLoadedReport && !loading}
		<div class="empty-box">Click Load Summary to retrieve data.</div>
	{:else if loading}
		<LoadingSkeleton
			label="Loading summary table"
			variant="all-vessel-summary-table"
			rows={7}
			columns={Math.max(6, visibleDataColumns.length + 3)}
		/>
	{:else if rows.length}
		<div class="table-wrapper">
			<table>
				<thead>
					{#each tableLayout.headerRows as cells, level (level)}
						<tr style={`--header-level: ${level}`}>
							{#if level === 0}
								<th class="frozen-column number-column" rowspan="3" scope="col">No</th>
								<th class="frozen-column vessel-column" rowspan="3" scope="col">Vessel</th>
								<th class="frozen-column range-column" rowspan="3" scope="col">Range</th>
							{/if}
							{#each cells as cell (cell.id)}
								<th
									colspan={cell.colspan}
									rowspan={cell.rowspan}
									scope={cell.column ? 'col' : 'colgroup'}
									title={cell.column?.label}
									data-column-id={cell.column?.id}
								>
									{cell.label}
								</th>
							{/each}
						</tr>
					{/each}
				</thead>

				<tbody>
					{#each rows as row, index (row.id)}
						<tr>
							<td class="frozen-column number-column">{index + 1}</td>
							<td class="frozen-column vessel-column">
								<div class="vessel-name-cell">
									<strong>{row.vessel_name}</strong>
								</div>
							</td>
							<td class="frozen-column range-column">{formatRangeLabel?.(row)}</td>

							{#each visibleDataColumns as col (col.id)}
								<td class:total-cell={isTotalColumn?.(col)} data-column-id={col.id}>
									{getCellValue?.(row, col)}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="empty-box">No summary data is available for the selected range.</div>
	{/if}
</section>
