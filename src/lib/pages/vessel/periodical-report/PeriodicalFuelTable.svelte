<script>
	import { Fuel, Droplet } from 'lucide-svelte';

	let { sources = [], rows = [], robBunkerCards = [], hasRobBunkerData = false } = $props();
</script>

<section class="table-section fuel-section">
	<div class="section-header">
		<div class="section-heading">
			<span class="section-heading-icon tone-green" aria-hidden="true">
				<Fuel size={20} strokeWidth={2} />
			</span>
			<div>
				<span class="section-kicker">Fuel</span>
				<h2>Fuel Consumption</h2>
			</div>
		</div>

		<strong>{sources.length} sources</strong>
	</div>

	{#if hasRobBunkerData}
		<div class="fod-usage-summary">
			{#each robBunkerCards as card (card.key)}
				<article class:fod-total-card={card.total}>
					<div class="fod-head">
						<span class="fod-icon" aria-hidden="true">
							<Droplet size={13} strokeWidth={2.2} />
						</span>
						<span>{card.label}</span>
					</div>
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
