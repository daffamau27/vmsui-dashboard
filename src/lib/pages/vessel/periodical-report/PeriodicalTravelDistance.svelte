<script>
	let { totalDistanceLabel = null, outsideSafetyZoneLabel = null, literPerNmCards = [] } = $props();
</script>

<section class="table-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">Distance</span>
			<h2>Travel Distance &amp; Fuel Efficiency</h2>
		</div>
	</div>

	<div class="speed-detail-grid">
		{#if totalDistanceLabel !== null}
			<article>
				<span>Total Distance</span>
				<strong>{totalDistanceLabel}</strong>
			</article>
		{/if}

		{#if outsideSafetyZoneLabel !== null}
			<article>
				<span>Outside Safety Zone</span>
				<strong>{outsideSafetyZoneLabel}</strong>
			</article>
		{/if}

		{#each literPerNmCards as card (card.key)}
			<article>
				<span>{card.label} Fuel per NM</span>
				<strong>{card.valueLabel}</strong>
			</article>
		{/each}
	</div>
</section>
