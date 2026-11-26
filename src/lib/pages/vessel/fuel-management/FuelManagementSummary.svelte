<script>
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import { Activity, Database, Droplets, FileSpreadsheet, Fuel, Gauge } from 'lucide-svelte';
	import './fuel-management-page.css';

	let { loading = false, cards = [] } = $props();

	/** @type {Array<{ keywords: string[]; icon: typeof Fuel; tone: string }>} */
	const summaryIconRules = [
		{ keywords: ['vdor'], icon: FileSpreadsheet, tone: 'tone-violet' },
		{ keywords: ['rob'], icon: Database, tone: 'tone-cyan' },
		{ keywords: ['consumption'], icon: Droplets, tone: 'tone-amber' },
		{ keywords: ['received'], icon: Fuel, tone: 'tone-green' },
		{ keywords: ['ems', 'engine maker', 'per engine'], icon: Gauge, tone: 'tone-cyan' }
	];

	function getSummaryIcon(/** @type {{ label?: unknown }} */ card) {
		const label = String(card?.label ?? '').toLowerCase();
		const rule = summaryIconRules.find((entry) =>
			entry.keywords.some((keyword) => label.includes(keyword))
		);
		return { icon: rule?.icon ?? Activity, tone: rule?.tone ?? 'tone-blue' };
	}
</script>

<section class="summary-grid">
	{#if loading}
		<LoadingSkeleton label="Loading fuel summary" variant="fuel-summary" rows={cards.length || 4} />
	{:else}
		{#each cards as card (card.label)}
			{@const summaryIcon = getSummaryIcon(card)}
			{@const SummaryIcon = summaryIcon.icon}
			<article class="summary-card">
				<div class="summary-card-head">
					<span class="summary-card-icon {summaryIcon.tone}" aria-hidden="true">
						<SummaryIcon size={13} strokeWidth={2.2} />
					</span>
					<span>{card.label}</span>
				</div>
				<strong>{card.value}</strong>
				<small>{card.note}</small>
			</article>
		{/each}
	{/if}
</section>
