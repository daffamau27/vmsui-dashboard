<script>
	let { tables = [], timezone = '' } = $props();

	function formatNumber(value, digits = 2, fallback = '-') {
		const number = Number(value);
		if (!Number.isFinite(number)) return fallback;

		return number.toLocaleString('en-US', {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits
		});
	}
</script>

<section class="table-section hourly-speed-section" aria-labelledby="hourly-speed-title">
	<div class="section-header">
		<div>
			<span class="section-kicker">Speed</span>
			<h2 id="hourly-speed-title">Hourly Average Speed</h2>
			<p>Average speed per hour (knots)</p>
		</div>
		{#if timezone}
			<strong>{timezone}</strong>
		{/if}
	</div>

	{#if tables.some((rows) => rows.length)}
		<div class="hourly-speed-split">
			{#each tables as tableRows, columnIndex (columnIndex)}
				<div class="table-wrapper">
					<table class="hourly-speed-table" aria-labelledby="hourly-speed-title">
						<thead>
							<tr>
								<th scope="col">Time Range</th>
								<th scope="col">Average Speed (kn)</th>
							</tr>
						</thead>
						<tbody>
							{#each tableRows as row, rowIndex (rowIndex)}
								<tr>
									<td>{row.hour}</td>
									<td>
										{#if row.averageSpeed !== null}
											{formatNumber(row.averageSpeed, 2)}
										{:else}
											<span aria-label="No speed data">-</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/each}
		</div>
	{:else}
		<div class="empty-box">Hourly average speed data is not available for this date.</div>
	{/if}
</section>
