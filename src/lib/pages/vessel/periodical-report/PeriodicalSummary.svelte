<script>
	let {
		dataReceivedLabel = '-',
		engineFuelCards = [],
		bunkerFuelLabel = '-',
		totalFuelLabel = '-',
		totalDistanceLabel = null,
		outsideSafetyZoneLabel = null,
		averageSpeedLabel = null,
		maxSpeedLabel = null
	} = $props();
</script>

<section class="data-received-card">
	<span>Data Received</span>
	<strong>{dataReceivedLabel}</strong>
</section>

<section class="summary-grid">
	{#each engineFuelCards as card (card.key)}
		<article class="summary-card engine-fuel-card">
			<span>{card.engineName} Fuel</span>
			<strong>{card.fuelLabel}</strong>
			<small>{card.sourceLabel || 'Fuel data unavailable'}</small>
		</article>
	{/each}

	<article class="summary-card">
		<span>Bunker Fuel</span>
		<strong>{bunkerFuelLabel}</strong>
	</article>

	<article class="summary-card">
		<span>Total Fuel</span>
		<strong>{totalFuelLabel}</strong>
		<small>Engine fuel only</small>
	</article>

	{#if totalDistanceLabel !== null}
		<article class="summary-card">
			<span>Total Distance</span>
			<strong>{totalDistanceLabel}</strong>
		</article>
	{/if}

	{#if outsideSafetyZoneLabel !== null}
		<article class="summary-card">
			<span>Outside Safety Zone</span>
			<strong>{outsideSafetyZoneLabel}</strong>
		</article>
	{/if}

	{#if averageSpeedLabel !== null}
		<article class="summary-card">
			<span>Average Speed</span>
			<strong>{averageSpeedLabel}</strong>
		</article>
	{/if}

	{#if maxSpeedLabel !== null}
		<article class="summary-card">
			<span>Max Speed</span>
			<strong>{maxSpeedLabel}</strong>
		</article>
	{/if}
</section>
