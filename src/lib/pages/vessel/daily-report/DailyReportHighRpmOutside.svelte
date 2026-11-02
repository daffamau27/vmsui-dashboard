<script>
	let { rows = [], groups = [] } = $props();

	function formatNumber(value, digits = 2, fallback = '-') {
		const number = Number(value);
		if (!Number.isFinite(number)) return fallback;

		return number.toLocaleString('en-US', {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits
		});
	}

	function formatPercent(value) {
		if (value === undefined || value === null || value === '' || value === '-') {
			return '-';
		}

		if (typeof value === 'string' && value.includes('%')) {
			return value;
		}

		const number = Number(value);
		if (!Number.isFinite(number)) return '-';

		return `${formatNumber(number, 1)}%`;
	}

	function formatSpeed(value) {
		if (value === undefined || value === null || value === '' || value === '-') {
			return '-';
		}

		const number = Number(value);
		if (!Number.isFinite(number)) return '-';

		return `${formatNumber(number, 2)} kn`;
	}
</script>

<section class="table-section high-rpm-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">RPM</span>
			<h2>High RPM Outside Safety Zone</h2>
		</div>

		<strong>{rows.length} rows</strong>
	</div>

	{#if groups.length}
		<div class="high-rpm-group-list">
			{#each groups as group, groupIndex (groupIndex)}
				<article class="high-rpm-card">
					<div class="high-rpm-title">
						{group.rule}
					</div>

					<div class="high-rpm-table-wrapper">
						<table class="high-rpm-table">
							<thead>
								<tr>
									<th>Engine (ME)</th>
									<th>Duration</th>
									<th>% RH</th>
									<th>Avg Speed</th>
									<th>Highest Speed</th>
									<th>Lowest Speed</th>
								</tr>
							</thead>

							<tbody>
								{#each group.rows as row, rowIndex (rowIndex)}
									<tr>
										<td>{row.engine}</td>
										<td>{row.duration}</td>
										<td>{formatPercent(row.percentageRh)}</td>
										<td>{formatSpeed(row.avgSpeed)}</td>
										<td>{formatSpeed(row.highestSpeed)}</td>
										<td>{formatSpeed(row.lowestSpeed)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</article>
			{/each}
		</div>
	{:else}
		<div class="empty-box">High RPM outside safety zone data is not available yet.</div>
	{/if}
</section>
