<script>
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let { loading = false, cards = [] } = $props();
</script>

<section class="summary-grid">
	{#if loading}
		<LoadingSkeleton label="Loading fuel summary" variant="fuel-summary" rows={cards.length || 4} />
	{:else}
		{#each cards as card (card.label)}
			<article class="summary-card">
				<span>{card.label}</span>
				<strong>{card.value}</strong>
				<small>{card.note}</small>
			</article>
		{/each}
	{/if}
</section>
