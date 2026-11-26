<script>
	import { Gauge, Timer } from 'lucide-svelte';

	let { averageSpeedLabel = null, maxSpeedLabel = null } = $props();

	const speedStats = $derived([
		...(averageSpeedLabel !== null
			? [{ key: 'average', label: 'Average Speed', value: averageSpeedLabel, icon: Gauge, tone: 'tone-amber' }]
			: []),
		...(maxSpeedLabel !== null
			? [{ key: 'max', label: 'Max Speed', value: maxSpeedLabel, icon: Timer, tone: 'tone-amber' }]
			: [])
	]);
</script>

<section class="table-section">
	<div class="section-header">
		<div class="section-heading">
			<span class="section-heading-icon tone-cyan" aria-hidden="true">
				<Gauge size={20} strokeWidth={2} />
			</span>
			<div>
				<span class="section-kicker">Speed</span>
				<h2>Speed Statistics</h2>
			</div>
		</div>
	</div>

	<div class="speed-detail-grid">
		{#each speedStats as stat (stat.key)}
			{@const StatIcon = stat.icon}
			<article>
				<div class="summary-card-head">
					<span class="summary-card-icon {stat.tone}" aria-hidden="true">
						<StatIcon size={14} strokeWidth={2.2} />
					</span>
					<span>{stat.label}</span>
				</div>
				<strong>{stat.value}</strong>
			</article>
		{/each}
	</div>
</section>
