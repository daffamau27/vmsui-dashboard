<script>
	import CopyableCoordinate from '$lib/components/CopyableCoordinate.svelte';

	let { vesselName = '-', online = false, cards = [] } = $props();
</script>

<section class="vessel-panel">
	<div class="section-header">
		<div>
			<span class="section-kicker">Vessel Status</span>
			<h2>{vesselName}</h2>
		</div>

		<div class="online-badge" class:offline-badge={!online}>
			<span></span>
			{online ? 'Online' : 'Offline'}
		</div>
	</div>

	<div class="vessel-info-grid">
		{#each cards as card (card.key)}
			<article class="compact-info-card" class:highlight={card.highlight}>
				<span class="info-label">{card.label}</span>
				<strong>
					{#if card.coordinate}
						<CopyableCoordinate
							value={card.coordinate.value}
							display={card.coordinate.display}
							label={card.label.toLowerCase()}
							compact
						/>
					{:else}
						{card.value}
					{/if}
				</strong>
			</article>
		{/each}
	</div>
</section>
