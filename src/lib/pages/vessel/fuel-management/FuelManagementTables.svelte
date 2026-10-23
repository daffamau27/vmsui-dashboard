<script>
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let { loading = false, cards = [] } = $props();
</script>

<section class="table-grid">
	{#each cards as card (card.key)}
		<article class="panel table-panel">
			<div class="panel-header">
				<div>
					<h2>{card.title}</h2>
					<p>{card.description}</p>
				</div>
				{#if card.totalLabel}
					<span class="badge">Total {card.totalLabel}</span>
				{/if}
			</div>

			{#if loading}
				<LoadingSkeleton
					label={`Loading ${card.title}`}
					variant="fuel-table"
					rows={5}
					columns={card.columns.length}
				/>
			{:else if card.rows.length}
				<div class="table-wrap">
					<table>
						<thead>
							<tr>
								{#each card.columns as column (column.label)}
									<th class:right={column.align === 'right'}>{column.label}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each card.rows as row, rowIndex (rowIndex)}
								<tr>
									{#each row as cell, cellIndex (cellIndex)}
										<td class:right={cell.right}>{cell.text}</td>
									{/each}
								</tr>
							{/each}
						</tbody>
						<tfoot>
							{#if card.subtotalAeLabel}
								<tr>
									<td colspan={card.columns.length - 1}>Subtotal AE</td>
									<td class="right">{card.subtotalAeLabel}</td>
								</tr>
							{/if}
							{#if card.subtotalMeLabel}
								<tr>
									<td colspan={card.columns.length - 1}>Subtotal ME</td>
									<td class="right">{card.subtotalMeLabel}</td>
								</tr>
							{/if}
							<tr>
								<td colspan={card.columns.length - 1}>Grand Total</td>
								<td class="right">{card.grandTotalLabel}</td>
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
