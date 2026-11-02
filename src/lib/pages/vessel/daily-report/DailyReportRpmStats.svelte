<script>
	let { rows = [] } = $props();

	function formatNumber(value, digits = 2, fallback = '-') {
		const number = Number(value);
		if (!Number.isFinite(number)) return fallback;

		return number.toLocaleString('en-US', {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits
		});
	}
</script>

<section class="table-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">RPM</span>
			<h2>Engine RPM Statistics</h2>
		</div>

		<strong>{rows.length} engines</strong>
	</div>

	{#if rows.length}
		<div class="table-wrapper">
			<table>
				<thead>
					<tr>
						<th>Engine</th>
						<th>Top RPM</th>
						<th>Avg RPM</th>
					</tr>
				</thead>

				<tbody>
					{#each rows as row, index (index)}
						<tr>
							<td>{row.engine_name || row.engineName || row.engine || row.name || '-'}</td>
							<td>{formatNumber(row.top_rpm ?? row.topRpm ?? row.top ?? 0, 0)}</td>
							<td>{formatNumber(row.avg_rpm ?? row.avgRpm ?? row.average ?? 0, 1)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="empty-box">RPM statistics data is not available yet.</div>
	{/if}
</section>
