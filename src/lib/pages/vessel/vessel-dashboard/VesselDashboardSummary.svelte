<script>
	import { Gauge, Timer, Route } from 'lucide-svelte';

	let { cards = [] } = $props();

	const summaryIconRules = [
		{ keywords: ['top'], icon: Gauge, tone: '' },
		{ keywords: ['average'], icon: Timer, tone: 'tone-green' },
		{ keywords: ['distance'], icon: Route, tone: 'tone-cyan' }
	];

	/** @param {string} key */
	function getSummaryIcon(key = '') {
		const text = String(key).toLowerCase();
		return summaryIconRules.find((entry) => entry.keywords.some((k) => text.includes(k))) ?? summaryIconRules[0];
	}
</script>

{#if cards.length}
	<section class="summary-grid">
		{#each cards as card (card.key)}
			{@const meta = getSummaryIcon(card.key)}
			{@const SummaryIcon = meta.icon}
			<article class="summary-card">
				<div class="summary-card-head">
					<span class="summary-card-icon {meta.tone}" aria-hidden="true">
						<SummaryIcon size={14} strokeWidth={2.2} />
					</span>
					<span>{card.label}</span>
				</div>
				<strong>{card.value}</strong>
			</article>
		{/each}
	</section>
{/if}
