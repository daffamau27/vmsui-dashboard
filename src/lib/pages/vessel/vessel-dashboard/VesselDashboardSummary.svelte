<script>
	let { cards = [] } = $props();
</script>

{#if cards.length}
	<section class="summary-grid">
		{#each cards as card (card.key)}
			<article class="summary-card">
				<span>{card.label}</span>
				<strong>{card.value}</strong>
			</article>
		{/each}
	</section>
{/if}
