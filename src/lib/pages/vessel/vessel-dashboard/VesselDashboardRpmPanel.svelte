<script>
	import RpmCard from '$lib/components/RpmCard.svelte';
	import { Gauge } from 'lucide-svelte';

	let { visible = true, cards = [] } = $props();
</script>

{#if visible}
	<section class="rpm-panel">
		<div class="section-header">
			<div class="section-heading">
				<span class="section-heading-icon tone-amber" aria-hidden="true">
					<Gauge size={20} strokeWidth={2} />
				</span>
				<div>
					<span class="section-kicker">Engine Monitoring</span>
					<h2>RPM Overview</h2>
				</div>
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
