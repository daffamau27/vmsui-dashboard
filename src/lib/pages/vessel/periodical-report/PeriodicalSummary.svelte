<script>
	import {
		Activity,
		Droplet,
		Fuel,
		Droplets,
		Route,
		ShieldAlert,
		Gauge,
		Timer
	} from 'lucide-svelte';

	let {
		dataReceivedLabel = '-',
		engineFuelCards = [],
		bunkerFuelLabel = '-',
		totalFuelLabel = '-',
		totalDistanceLabel = null,
		outsideSafetyZoneLabel = null,
		averageSpeedLabel = null,
		maxSpeedLabel = null
	} = $props();

	const summaryCards = $derived([
		{
			key: 'bunker-fuel',
			label: 'Bunker Fuel',
			value: bunkerFuelLabel,
			icon: Fuel,
			tone: 'tone-green'
		},
		{
			key: 'total-fuel',
			label: 'Total Fuel',
			value: totalFuelLabel,
			hint: 'Engine fuel only',
			icon: Droplets,
			tone: 'tone-green'
		},
		...(totalDistanceLabel !== null
			? [
					{
						key: 'total-distance',
						label: 'Total Distance',
						value: totalDistanceLabel,
						icon: Route,
						tone: 'tone-cyan'
					}
				]
			: []),
		...(outsideSafetyZoneLabel !== null
			? [
					{
						key: 'outside-safety-zone',
						label: 'Outside Safety Zone',
						value: outsideSafetyZoneLabel,
						icon: ShieldAlert,
						tone: 'tone-violet'
					}
				]
			: []),
		...(averageSpeedLabel !== null
			? [
					{
						key: 'average-speed',
						label: 'Average Speed',
						value: averageSpeedLabel,
						icon: Gauge,
						tone: 'tone-amber'
					}
				]
			: []),
		...(maxSpeedLabel !== null
			? [
					{
						key: 'max-speed',
						label: 'Max Speed',
						value: maxSpeedLabel,
						icon: Timer,
						tone: 'tone-amber'
					}
				]
			: [])
	]);
</script>

<section class="data-received-card">
	<div class="data-received-copy">
		<span class="data-received-icon" aria-hidden="true">
			<Activity size={16} strokeWidth={2.2} />
		</span>
		<span>Data Received</span>
	</div>
	<strong>{dataReceivedLabel}</strong>
</section>

<section class="summary-grid">
	{#each engineFuelCards as card (card.key)}
		<article class="summary-card engine-fuel-card">
			<div class="summary-card-head">
				<span class="summary-card-icon tone-green" aria-hidden="true">
					<Droplet size={14} strokeWidth={2.2} />
				</span>
				<span>{card.engineName} Fuel</span>
			</div>
			<strong>{card.fuelLabel}</strong>
			<small>{card.sourceLabel || 'Fuel data unavailable'}</small>
		</article>
	{/each}

	{#each summaryCards as card (card.key)}
		{@const CardIcon = card.icon}
		<article class="summary-card">
			<div class="summary-card-head">
				<span class="summary-card-icon {card.tone}" aria-hidden="true">
					<CardIcon size={14} strokeWidth={2.2} />
				</span>
				<span>{card.label}</span>
			</div>
			<strong>{card.value}</strong>
			{#if card.hint}<small>{card.hint}</small>{/if}
		</article>
	{/each}
</section>
