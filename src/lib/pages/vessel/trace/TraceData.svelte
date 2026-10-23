<script>
	let { cards = [], rpmEntries = [] } = $props();
</script>

<section class="bottom-data-grid">
	<div class="compact-info-grid">
		{#each cards as card (card.key)}
			<article class="info-card">
				<span>{card.label}</span>
				<strong>{card.value}</strong>
			</article>
		{/each}
	</div>

	<section class="rpm-panel">
		<div class="rpm-header">
			<span>Engine RPM</span>
			<strong>{rpmEntries.length} engines</strong>
		</div>

		{#if rpmEntries.length}
			<div class="rpm-grid">
				{#each rpmEntries as entry (entry.key)}
					<article class="rpm-card">
						<span>{entry.label}</span>
						<strong>{entry.value}</strong>
					</article>
				{/each}
			</div>
		{:else}
			<div class="rpm-empty">RPM data is not available.</div>
		{/if}
	</section>
</section>
