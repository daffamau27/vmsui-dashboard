<script>
	import { Clock, Gauge, Droplet, Route, ShieldAlert } from 'lucide-svelte';

	let { cards = [], speedCards = [] } = $props();

	const summaryIconRules = [
		{ keywords: ['operation'], icon: Clock, tone: 'tone-amber' },
		{ keywords: ['top'], icon: Gauge, tone: 'tone-amber' },
		{ keywords: ['average'], icon: Gauge, tone: 'tone-green' },
		{ keywords: ['nm', 'fuel'], icon: Droplet, tone: 'tone-green' },
		{ keywords: ['distance'], icon: Route, tone: 'tone-cyan' },
		{ keywords: ['zone'], icon: ShieldAlert, tone: 'tone-violet' }
	];

	/** @param {string} key */
	function getSummaryMeta(key = '') {
		const text = String(key).toLowerCase();
		return (
			summaryIconRules.find((entry) => entry.keywords.some((keyword) => text.includes(keyword))) ??
			summaryIconRules[0]
		);
	}
</script>

<section class="summary-grid">
	{#each cards as card (card.key)}
		{@const meta = getSummaryMeta(card.key)}
		{@const SummaryIcon = meta.icon}
		<article class="summary-card">
			<div class="summary-card-head">
				<span class="summary-card-icon {meta.tone}" aria-hidden="true">
					<SummaryIcon size={14} strokeWidth={2.2} />
				</span>
				<span>{card.label}</span>
			</div>
			<strong>{card.value}</strong>
			{#if card.hint}
				<button type="button" class="card-hint" aria-label={card.hint}>
					i
					<span class="card-hint-tooltip" role="tooltip">{card.hint}</span>
				</button>
			{/if}
		</article>
	{/each}
</section>

{#if speedCards.length}
	<section class="speed-detail-grid">
		{#each speedCards as card (card.key)}
			{@const meta = getSummaryMeta(card.key)}
			{@const SpeedIcon = meta.icon}
			<article>
				<div class="summary-card-head">
					<span class="summary-card-icon {meta.tone}" aria-hidden="true">
						<SpeedIcon size={14} strokeWidth={2.2} />
					</span>
					<span>{card.label}</span>
				</div>
				<strong>{card.value}</strong>
			</article>
		{/each}
	</section>
{/if}
