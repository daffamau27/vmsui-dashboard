<script>
	import {
		Gauge,
		Route,
		Compass,
		Fuel,
		CloudSun,
		Cloud,
		CloudRain,
		CloudDrizzle,
		CloudLightning,
		CloudSnow,
		CloudFog,
		Sun,
		Waves,
		MapPin
	} from 'lucide-svelte';

	let { cards = [], rpmEntries = [] } = $props();

	const weatherIconRules = [
		{ keywords: ['thunder', 'storm', 'lightning'], icon: CloudLightning },
		{ keywords: ['drizzle', 'shower'], icon: CloudDrizzle },
		{ keywords: ['rain', 'wet', 'monsoon'], icon: CloudRain },
		{ keywords: ['snow', 'sleet', 'blizzard', 'ice', 'hail'], icon: CloudSnow },
		{ keywords: ['fog', 'mist', 'haze', 'smoke', 'dust'], icon: CloudFog },
		{ keywords: ['overcast', 'cloud', 'gloomy'], icon: Cloud },
		{ keywords: ['partly', 'broken', 'scattered', 'interval'], icon: CloudSun },
		{ keywords: ['sun', 'clear', 'hot'], icon: Sun }
	];

	const cardIconRules = [
		{ keywords: ['speed'], icon: Gauge, tone: 'tone-amber' },
		{ keywords: ['distance'], icon: Route, tone: 'tone-cyan' },
		{ keywords: ['heading'], icon: Compass, tone: 'tone-cyan' },
		{ keywords: ['l/h', 'fuel'], icon: Fuel, tone: 'tone-green' },
		{ keywords: ['weather'], icon: null, tone: 'tone-amber' },
		{ keywords: ['ocean'], icon: Waves, tone: 'tone-cyan' },
		{ keywords: ['point'], icon: MapPin, tone: 'tone-violet' }
	];

	function getCardIcon(/** @type {{ label?: unknown; value?: unknown }} */ card) {
		const label = String(card?.label ?? '').toLowerCase();

		if (label.includes('weather')) {
			const value = String(card?.value ?? '').toLowerCase();
			const rule = weatherIconRules.find((entry) =>
				entry.keywords.some((keyword) => value.includes(keyword))
			);
			return { icon: rule?.icon ?? CloudSun, tone: 'tone-amber' };
		}

		const rule = cardIconRules.find((entry) =>
			entry.keywords.some((keyword) => label.includes(keyword))
		);
		return { icon: rule?.icon ?? MapPin, tone: rule?.tone ?? 'tone-violet' };
	}
</script>

<section class="bottom-data-grid">
	<div class="compact-info-grid">
		{#each cards as card (card.key)}
			{@const cardIcon = getCardIcon(card)}
			{@const CardIcon = cardIcon.icon}
			<article class="info-card">
				<div class="info-card-head">
					<span class="info-card-icon {cardIcon.tone}" aria-hidden="true">
						<CardIcon size={12} strokeWidth={2.2} />
					</span>
					<span>{card.label}</span>
				</div>
				<strong>{card.value}</strong>
			</article>
		{/each}
	</div>

	<section class="rpm-panel">
		<div class="rpm-header">
			<div class="rpm-heading">
				<span class="rpm-heading-icon" aria-hidden="true">
					<Gauge size={13} strokeWidth={2.2} />
				</span>
				<span>Engine RPM</span>
			</div>
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
