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

	function formatHour(value) {
		if (value === undefined || value === null || value === '') return '-';

		if (typeof value === 'string') {
			if (value.includes('h') || value.includes(':')) return value;
		}

		const number = Number(value);
		if (!Number.isFinite(number)) return '-';

		return `${formatNumber(number, 2)} h`;
	}
</script>

<section class="table-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">Runtime</span>
			<h2>Engine Running Hour</h2>
		</div>
		<strong>{rows.length} rows</strong>
	</div>

	{#if rows.length}
		<div class="table-wrapper">
			<table>
				<thead>
					<tr>
						<th>Engine</th>
						<th>Running Hour</th>
						<th>Runtime Hours</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row, index (index)}
						<tr>
							<td>{row.engine_name || row.engineName || row.engine || row.name || '-'}</td>
							<td
								>{row.runtime_formatted ||
									row.runtimeFormatted ||
									formatHour(row.runtime_hours ?? row.runtimeHours)}</td
							>
							<td>{formatHour(row.runtime_hours ?? row.runtimeHours)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="empty-box">Runtime data is not available yet.</div>
	{/if}
</section>
