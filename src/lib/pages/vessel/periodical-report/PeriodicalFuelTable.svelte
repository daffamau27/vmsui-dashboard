<script>
	let { sources = [], rows = [], robBunkerCards = [], hasRobBunkerData = false } = $props();
</script>

<section class="table-section fuel-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">Fuel</span>
			<h2>Fuel Consumption</h2>
		</div>

		<strong>{sources.length} sources</strong>
	</div>

	{#if hasRobBunkerData}
		<div class="fod-usage-summary">
			{#each robBunkerCards as card (card.key)}
				<article class:fod-total-card={card.total}>
					<span>{card.label}</span>
					<strong>{card.valueLabel}</strong>
				</article>
			{/each}
		</div>
	{/if}

	{#if sources.length}
		<div class="table-wrapper">
			<table>
				<thead>
					<tr>
						<th>Engine</th>

						{#each sources as source (source.key)}
							<th>{source.label}</th>
						{/each}
					</tr>
				</thead>

				<tbody>
					{#each rows as row (row.key)}
						<tr>
							<td>{row.engineName}</td>

							{#each row.values as value (value.key)}
								<td>{value.label}</td>
							{/each}
						</tr>
					{/each}

					<tr class="total-row">
						<td>Grand Total</td>

						{#each sources as source (source.key)}
							<td>{source.totalLabel}</td>
						{/each}
					</tr>
				</tbody>
			</table>
		</div>
	{:else}
		<div class="empty-box">Fuel consumption data is not available yet.</div>
	{/if}
</section>
