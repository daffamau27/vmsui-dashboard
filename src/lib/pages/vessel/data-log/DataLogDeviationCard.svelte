<script>
	import './data-log-page.css';

	let {
		skipped = false,
		loading = false,
		error = '',
		deviation = null,
		categories = [],
		rows = [],
		totalCount = 0,
		totalDuration = 0,
		rpmLimits = null
	} = $props();

	function formatValue(value) {
		if (value === undefined || value === null || value === '') return '-';

		if (typeof value === 'number') {
			if (Number.isNaN(value)) return 'nan';
			if (!Number.isFinite(value)) return String(value);
			return Number.isInteger(value) ? String(value) : value.toFixed(2);
		}

		if (typeof value === 'string') {
			const trimmed = value.trim();
			const normalized = trimmed.toLowerCase();

			if (
				normalized === 'null' ||
				normalized === 'undefined' ||
				normalized === 'infinity' ||
				normalized === '-infinity'
			) {
				return '-';
			}

			return trimmed || '-';
		}

		if (typeof value === 'boolean') {
			return value ? 'ON' : 'OFF';
		}

		return value;
	}

	function formatCellValue(value, column) {
		if (String(column || '').toLowerCase() === 'timestamp') {
			const formatted = formatValue(value);

			if (formatted === '-') return formatted;

			return String(formatted).replace(/\s*\(UTC[+-]?\d{1,2}(?::?\d{2})?\)\s*/i, '');
		}

		return formatValue(value);
	}

	function formatDeviationDuration(minutes) {
		const value = Number(minutes);
		if (!Number.isFinite(value) || value <= 0) return '0 min';

		const totalMinutes = Math.round(value);
		const days = Math.floor(totalMinutes / 1440);
		const hours = Math.floor((totalMinutes % 1440) / 60);
		const mins = totalMinutes % 60;
		const parts = [];

		if (days) parts.push(`${days}d`);
		if (hours) parts.push(`${hours}h`);
		if (mins || !parts.length) parts.push(`${mins}m`);

		return parts.join(' ');
	}
</script>

<section class="deviation-card">
	<div class="section-header deviation-header">
		<div>
			<span class="section-kicker">Deviation</span>
			<h2>Data Deviation</h2>
		</div>

		<strong>
			{totalCount}
			{totalCount === 1 ? 'event' : 'events'}
		</strong>
	</div>

	{#if skipped}
		<div class="empty-box">
			Data deviation is skipped for date ranges longer than 14 days to keep data log loading light.
			Use a shorter range to view deviation details.
		</div>
	{:else if loading && !deviation}
		<div class="deviation-loading">Loading data deviation...</div>
	{:else if error}
		<div class="status-box error-box">{error}</div>
	{:else if deviation}
		<div class="deviation-overview">
			<div class="deviation-metric-band">
				<article class="deviation-total-card">
					<span>Total Duration</span>
					<strong>{formatDeviationDuration(totalDuration)}</strong>
				</article>

				{#if rpmLimits}
					<div class="rpm-limit-strip" aria-label="RPM deviation limits">
						<span class="rpm-limit-title">RPM Limits</span>
						<div>
							<span>Low RPM</span>
							<strong>{formatValue(rpmLimits.low)}</strong>
						</div>
						<div>
							<span>High RPM</span>
							<strong>{formatValue(rpmLimits.high)}</strong>
						</div>
						<div>
							<span>Lower Limit</span>
							<strong>{formatValue(rpmLimits.lower_limit)}</strong>
						</div>
						<div>
							<span>Upper Limit</span>
							<strong>{formatValue(rpmLimits.upper_limit)}</strong>
						</div>
					</div>
				{/if}
			</div>

			<div class="deviation-summary-grid">
				{#each categories as item (item.key)}
					<article class="deviation-summary-item" data-deviation={item.key}>
						<div>
							<span>{item.label}</span>
							<p>{item.description}</p>
						</div>
						<div class="deviation-summary-value">
							<strong>{item.count}</strong>
							<small>{formatDeviationDuration(item.totalDurationMinutes)}</small>
						</div>
					</article>
				{/each}
			</div>

			{#if rows.length}
				<div class="deviation-table-wrapper">
					<table class="deviation-table">
						<thead>
							<tr>
								<th>Type</th>
								<th>Start</th>
								<th>End</th>
								<th>Duration</th>
							</tr>
						</thead>
						<tbody>
							{#each rows as row, index (`${row.key}-${row.start ?? index}`)}
								<tr>
									<td>
										<span class="deviation-type-chip" data-deviation={row.key}>{row.type}</span>
									</td>
									<td>{formatCellValue(row?.start, 'timestamp')}</td>
									<td>{formatCellValue(row?.end, 'timestamp')}</td>
									<td>{formatDeviationDuration(row?.duration_minutes ?? row?.durationMinutes)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="empty-box">No data deviation found for the selected date range.</div>
			{/if}
		</div>
	{:else}
		<div class="empty-box">
			Data deviation will be shown after you choose a date range and click Load Data.
		</div>
	{/if}
</section>
