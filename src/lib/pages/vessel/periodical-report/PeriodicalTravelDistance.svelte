<script>
	import { Route, ShieldAlert, Droplet } from 'lucide-svelte';

	let { totalDistanceLabel = null, outsideSafetyZoneLabel = null, literPerNmCards = [] } = $props();
</script>

<section class="table-section">
	<div class="section-header">
		<div class="section-heading">
			<span class="section-heading-icon tone-cyan" aria-hidden="true">
				<Route size={20} strokeWidth={2} />
			</span>
			<div>
				<span class="section-kicker">Distance</span>
				<h2>Travel Distance &amp; Fuel Efficiency</h2>
			</div>
		</div>
	</div>

	<div class="speed-detail-grid">
		{#if totalDistanceLabel !== null}
			<article>
				<div class="summary-card-head">
					<span class="summary-card-icon tone-cyan" aria-hidden="true">
						<Route size={14} strokeWidth={2.2} />
					</span>
					<span>Total Distance</span>
				</div>
				<strong>{totalDistanceLabel}</strong>
			</article>
		{/if}

		{#if outsideSafetyZoneLabel !== null}
			<article>
				<div class="summary-card-head">
					<span class="summary-card-icon tone-violet" aria-hidden="true">
						<ShieldAlert size={14} strokeWidth={2.2} />
					</span>
					<span>Outside Safety Zone</span>
				</div>
				<strong>{outsideSafetyZoneLabel}</strong>
			</article>
		{/if}

		{#each literPerNmCards as card (card.key)}
			<article>
				<div class="summary-card-head">
					<span class="summary-card-icon tone-green" aria-hidden="true">
						<Droplet size={14} strokeWidth={2.2} />
					</span>
					<span>{card.label} Fuel per NM</span>
				</div>
				<strong>{card.valueLabel}</strong>
			</article>
		{/each}
	</div>
</section>
