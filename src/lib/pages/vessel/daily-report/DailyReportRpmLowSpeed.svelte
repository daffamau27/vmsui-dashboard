<script>
	let { groups = [], totals = [], grandTotal = 0 } = $props();

	function formatNumber(value, digits = 2, fallback = '-') {
		const number = Number(value);
		if (!Number.isFinite(number)) return fallback;

		return number.toLocaleString('en-US', {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits
		});
	}

	function formatLiter(value) {
		if (value === undefined || value === null || value === '') return '-';
		if (value === '-') return '-';

		const number = Number(value);
		if (!Number.isFinite(number)) return '-';

		return `${formatNumber(number, 2)} L`;
	}

	function formatTimeDot(value) {
		if (!value || value === '-') return '-';

		const text = String(value).trim();

		if (/^\d{2}:\d{2}$/.test(text)) {
			return `${text.replace(':', '.')}.00`;
		}

		if (/^\d{2}:\d{2}:\d{2}$/.test(text)) {
			return text.replaceAll(':', '.');
		}

		return text;
	}
</script>

<section class="table-section low-speed-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">Fuel</span>
			<h2>High RPM Low Speed</h2>
		</div>

		<strong>{groups.length} engines</strong>
	</div>

	{#if groups.length}
		<div class="low-speed-content">
			<p class="low-speed-duration-hint">Red rows indicate durations longer than 30 minutes.</p>
			<div class="low-speed-grid">
				{#each groups as group, groupIndex (groupIndex)}
					<article class="low-speed-card">
						<div class="low-speed-card-header">
							<div>
								<span>Engine</span>
								<strong>{group.engineName}</strong>
							</div>

							<div class="low-speed-total-pill">
								{formatLiter(group.totalFuel)}
							</div>
						</div>

						<div class="low-speed-table-wrapper">
							<table class="low-speed-table">
								<thead>
									<tr>
										<th>Start Time</th>
										<th>End Time</th>
										<th>Duration</th>
										<th>Fuel Used</th>
									</tr>
								</thead>

								<tbody>
									{#each group.rows as row, rowIndex (rowIndex)}
										<tr class:low-speed-long-duration-row={row.isLongDuration}>
											<td>{formatTimeDot(row.startTime)}</td>
											<td>{formatTimeDot(row.endTime)}</td>
											<td>{row.duration}</td>
											<td>{formatLiter(row.fuelUsedL)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</article>
				{/each}
			</div>

			<article class="low-speed-summary-card">
				<div class="low-speed-summary-header">
					<div>
						<span>Summary</span>
						<strong>Total All Engines</strong>
					</div>
				</div>

				<div class="low-speed-table-wrapper">
					<table class="low-speed-table">
						<tbody>
							{#each totals as row, index (index)}
								<tr>
									<td>TOTAL {row.engineName}</td>
									<td>{formatLiter(row.fuelUsedL)}</td>
								</tr>
							{/each}

							<tr class="grand-total-row">
								<td>GRAND TOTAL ALL ENGINES</td>
								<td>{formatLiter(grandTotal)}</td>
							</tr>
						</tbody>
					</table>
				</div>
			</article>
		</div>
	{:else}
		<div class="empty-box">High RPM low speed data is not available yet.</div>
	{/if}
</section>
