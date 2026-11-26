<script>
	import CopyableCoordinate from '$lib/components/CopyableCoordinate.svelte';
	import { Ship, MapPin, Clock, Gauge, Compass, CloudSun, Activity, Waves } from 'lucide-svelte';

	let { vesselName = '-', online = false, cards = [] } = $props();

	const infoIconRules = [
		{ keywords: ['latitude', 'longitude'], icon: MapPin },
		{ keywords: ['time'], icon: Clock },
		{ keywords: ['speed'], icon: Gauge },
		{ keywords: ['heading'], icon: Compass },
		{ keywords: ['weather'], icon: CloudSun },
		{ keywords: ['data received', 'data'], icon: Activity },
		{ keywords: ['current'], icon: Waves }
	];

	function getInfoIcon(key = '', label = '') {
		const text = `${key} ${label}`.toLowerCase();

		const rule = infoIconRules.find((entry) =>
			entry.keywords.some((keyword) => text.includes(keyword))
		);

		return rule?.icon ?? Ship;
	}
</script>

<section class="vessel-panel">
	<div class="section-header">
		<div class="section-heading">
			<span class="section-heading-icon tone-cyan" aria-hidden="true">
				<Ship size={20} strokeWidth={2} />
			</span>
			<div>
				<span class="section-kicker">Vessel Status</span>
				<h2>{vesselName}</h2>
			</div>
		</div>
	</div>

	<div class="vessel-info-grid">
		{#each cards as card (card.key)}
			{@const InfoIcon = getInfoIcon(card.key, card.label)}
			{@const iconColor = card.coordinate
				? 'color: #a78bfa; background: rgba(167, 139, 250, 0.12); border-color: rgba(167, 139, 250, 0.28);'
				: ''}
			<article class="compact-info-card" class:highlight={card.highlight}>
				<div class="compact-info-head">
					<span class="compact-info-icon" style={iconColor} aria-hidden="true">
						<InfoIcon size={13} strokeWidth={2.2} />
					</span>
					<span class="info-label">{card.label}</span>
				</div>
				<strong>
					{#if card.coordinate}
						<CopyableCoordinate
							value={card.coordinate.value}
							display={card.coordinate.display}
							label={card.label.toLowerCase()}
							compact
						/>
					{:else}
						{card.value}
					{/if}
				</strong>
			</article>
		{/each}
	</div>
</section>
