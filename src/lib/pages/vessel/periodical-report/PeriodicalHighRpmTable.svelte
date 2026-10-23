<script>
	let { show = true, rows = [], total = { durationLabel: '-', fuelLabel: '-' } } = $props();
</script>

{#if show}
	<section class="table-section">
		<div class="section-header">
			<div>
				<span class="section-kicker">SRITI</span>
				<h2>High RPM Low Speed</h2>
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
			<div class="empty-box">High RPM low speed data is not available yet.</div>
		{/if}
	</section>
{/if}
