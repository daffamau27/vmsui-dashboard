<script>
	import RpmCard from '$lib/components/RpmCard.svelte';

	let { visible = true, cards = [] } = $props();
</script>

{#if visible}
	<section class="rpm-panel">
		<div class="section-header">
			<div>
				<span class="section-kicker">Engine Monitoring</span>
				<h2>RPM Overview</h2>
			</div>

			<strong>{cards.length} engines</strong>
		</div>

		<div class="rpm-grid">
			{#each cards as card (card.title)}
				<RpmCard
					title={card.title}
					status={card.status}
					lastData={card.lastData}
					value={card.value}
					avg={card.avg}
					top={card.top}
					max={2200}
				/>
			{/each}
		</div>
	</section>
{:else}
	<section class="rpm-panel permission-empty">
		<strong>RPM Overview is not displayed</strong>
		<span>The user does not have the view_engine_rpm_stats_table permission.</span>
	</section>
{/if}
