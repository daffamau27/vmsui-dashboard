<script>
	import { TriangleAlert } from 'lucide-svelte';

	let { show = true, rows = [], total = { durationLabel: '-', fuelLabel: '-' } } = $props();
</script>

{#if show}
	<section class="table-section">
		<div class="section-header">
			<div class="section-heading">
				<span class="section-heading-icon tone-red" aria-hidden="true">
					<TriangleAlert size={20} strokeWidth={2} />
				</span>
				<div>
					<span class="section-kicker">SRITI</span>
					<h2>High RPM Low Speed</h2>
				</div>
			</div>

			<strong>{rows.length} engines</strong>
		</div>

		{#if rows.length}
			<div class="table-wrapper">
				<table>
					<thead>
						<tr>
							<th>Engine</th>
							<th>Duration</th>
							<th>Fuel Used</th>
						</tr>
					</thead>

					<tbody>
						{#each rows as row (row.key)}
							<tr>
								<td>{row.engineName}</td>
								<td>{row.durationLabel}</td>
								<td>{row.fuelLabel}</td>
							</tr>
						{/each}

						<tr class="total-row">
							<td>Grand Total</td>
							<td>{total.durationLabel}</td>
							<td>{total.fuelLabel}</td>
						</tr>
					</tbody>
				</table>
			</div>
		{:else}
			<div class="empty-box">SRITI data is not available yet.</div>
		{/if}
	</section>
{/if}
