<script>
	let { cards = [], speedCards = [] } = $props();
</script>

<section class="summary-grid">
	{#each cards as card (card.key)}
		<article class="summary-card">
			<span>{card.label}</span>
			<strong>{card.value}</strong>
		</article>
	{/each}
</section>

{#if speedCards.length}
	<section class="speed-detail-grid">
		{#each speedCards as card (card.key)}
			<article>
				<span>{card.label}</span>
				<strong>{card.value}</strong>
			</article>
		{/each}
	</section>
{/if}
