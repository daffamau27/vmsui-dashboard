<script>
	let {
		rows = [],
		summary = {},
		canViewFuelFod = false,
		hasFodUsage = false,
		hasFodSingleOnly = false,
		fodSingleValue = null,
		fodPortValue = null,
		fodStbdValue = null,
		fodTotalValue = 0,
		canShowFuelEcu = false,
		canShowFuelFms = false,
		canShowFuelEmsInternal = false,
		canShowFuelEmsExternal = false,
		canShowFuelEngineMaker = false,
		getFuelSourceLabel = (sourceKey) => sourceKey || '-'
	} = $props();

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

	function formatPlainLiter(value) {
		if (value === undefined || value === null || value === '') return '-';
		if (value === '-') return '-';

		const number = Number(value);
		if (!Number.isFinite(number)) return '-';

		return formatNumber(number, 2);
	}
</script>

<section class="table-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">Fuel</span>
			<h2>Fuel Consumption</h2>
		</div>
		<strong>{rows.length} rows</strong>
	</div>

	{#if canViewFuelFod && hasFodUsage}
		<div class="fod-usage-summary" class:single-fod-layout={hasFodSingleOnly}>
			{#if hasFodSingleOnly}
				<article>
					<span>FOD Single</span>
					<strong>{formatLiter(fodSingleValue)}</strong>
				</article>

				<article class="fod-total-card">
					<span>Total FOD</span>
					<strong>{formatLiter(fodTotalValue)}</strong>
				</article>
			{:else}
				<article>
					<span>FOD Port</span>
					<strong>{formatLiter(fodPortValue)}</strong>
				</article>

				<article>
					<span>FOD STBD</span>
					<strong>{formatLiter(fodStbdValue)}</strong>
				</article>

				<article class="fod-total-card">
					<span>Total FOD</span>
					<strong>{formatLiter(fodTotalValue)}</strong>
				</article>
			{/if}
		</div>
	{/if}

	{#if rows.length}
		<div class="table-wrapper">
			<table>
				<thead>
					<tr>
						<th>Engine</th>
						<th>Type</th>
						{#if canShowFuelEcu}<th>ECU</th>{/if}
						{#if canShowFuelFms}<th>FMS</th>{/if}
						{#if canShowFuelEmsInternal}
							<th>{getFuelSourceLabel('ems_internal')}</th>
						{/if}
						{#if canShowFuelEmsExternal}
							<th>{getFuelSourceLabel('ems_external')}</th>
						{/if}
						{#if canShowFuelEngineMaker}<th>Engine Maker</th>{/if}
					</tr>
				</thead>

				<tbody>
					{#each rows as row, index (index)}
						<tr>
							<td>{row.engine_name || row.engineName || row.engine || row.name || '-'}</td>
							<td>{row.is_main ? 'ME' : 'AE'}</td>

							{#if canShowFuelEcu}
								<td>{formatPlainLiter(row.ecu)}</td>
							{/if}

							{#if canShowFuelFms}
								<td>{formatPlainLiter(row.fms)}</td>
							{/if}

							{#if canShowFuelEmsInternal}
								<td>{formatPlainLiter(row.ems_internal ?? row.emsInternal)}</td>
							{/if}

							{#if canShowFuelEmsExternal}
								<td>{formatPlainLiter(row.ems_external ?? row.emsExternal)}</td>
							{/if}

							{#if canShowFuelEngineMaker}
								<td>{formatPlainLiter(row.engine_maker ?? row.engineMaker)}</td>
							{/if}
						</tr>
					{/each}

					<tr class="total-row">
						<td colspan="2">Grand Total</td>

						{#if canShowFuelEcu}
							<td>{formatPlainLiter(summary?.ecu)}</td>
						{/if}

						{#if canShowFuelFms}
							<td>{formatPlainLiter(summary?.fms)}</td>
						{/if}

						{#if canShowFuelEmsInternal}
							<td>{formatPlainLiter(summary?.ems_internal ?? summary?.emsInternal)}</td>
						{/if}

						{#if canShowFuelEmsExternal}
							<td>{formatPlainLiter(summary?.ems_external ?? summary?.emsExternal)}</td>
						{/if}

						{#if canShowFuelEngineMaker}
							<td>{formatPlainLiter(summary?.engine_maker ?? summary?.engineMaker)}</td>
						{/if}
					</tr>
				</tbody>
			</table>
		</div>
	{:else}
		<div class="empty-box">Fuel data is not available yet.</div>
	{/if}
</section>
