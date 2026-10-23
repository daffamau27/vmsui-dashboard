<script>
	let {
		canViewFuel = false,
		hasVisibleFuelSource = false,
		canShowEmsInternal = false,
		canShowEmsExternal = false,
		canShowFms = false,
		canShowEcu = false,
		vmsLabel = 'EMS',
		fuelSummary = {},
		canShowFodUsage = false,
		fodLabel = '-',
		canShowRob = false
	} = $props();
</script>

<section class="fuel-summary">
	<section class="table-section main-fuel-card">
		<div class="section-header">
			<div>
				<span class="section-kicker">Fuel Monitoring</span>
				<h2>Current Daily Consumption So Far</h2>
			</div>
		</div>

		{#if canViewFuel && hasVisibleFuelSource}
			<div class="fuel-cols">
				{#if canShowEmsInternal}
					<article class="fuel-metric">
						<span class="fuel-label">{vmsLabel}</span>
						<strong class="fuel-value">{fuelSummary.emsInternal}</strong>
					</article>
				{/if}

				{#if canShowEmsExternal}
					<article class="fuel-metric">
						<span class="fuel-label">EMS</span>
						<strong class="fuel-value">{fuelSummary.emsExternal}</strong>
					</article>
				{/if}

				{#if canShowFms}
					<article class="fuel-metric">
						<span class="fuel-label">FMS</span>
						<strong class="fuel-value">{fuelSummary.fms}</strong>
					</article>
				{/if}

				{#if canShowEcu}
					<article class="fuel-metric">
						<span class="fuel-label">ECU</span>
						<strong class="fuel-value">{fuelSummary.ecu}</strong>
					</article>
				{/if}
			</div>
		{:else}
			<div class="empty-box">
				Fuel consumption is not displayed because the view_fuel_consumption_table permission or fuel
				source permission is not available.
			</div>
		{/if}

		{#if canShowFodUsage}
			<div class="fod-usage-summary">
				<article>
					<span>FOD</span>
					<strong>{fodLabel}</strong>
				</article>
			</div>
		{/if}
	</section>

	{#if canShowRob}
		<section class="table-section rob-card">
			<div class="section-header">
				<div>
					<span class="section-kicker">Tank Status</span>
					<h2>Latest ROB</h2>
				</div>
			</div>

			<div class="rob-content">
				<span>Remaining On Board</span>
				<strong class="rob-value">{fuelSummary.latestRob}</strong>
			</div>
		</section>
	{/if}
</section>
