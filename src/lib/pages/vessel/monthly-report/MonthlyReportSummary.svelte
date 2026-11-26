<script>
	import { Activity, Droplet, Route, Gauge, Clock, Timer } from 'lucide-svelte';

	let {
		dataReceivedLabel = '',
		totalFuelLabel = '',
		totalDistanceLabel = '',
		averageSpeedLabel = '',
		totalOperationHoursLabel = '',
		engineRuntimeEntries = []
	} = $props();

	const summaryCards = $derived([
		{
			key: 'data-received',
			label: 'Data Received',
			value: dataReceivedLabel,
			icon: Activity,
			tone: 'tone-violet'
		},
		{
			key: 'total-fuel',
			label: 'Total Fuel',
			value: totalFuelLabel ? `${totalFuelLabel} L` : '',
			icon: Droplet,
			tone: 'tone-green'
		},
		{
			key: 'total-distance',
			label: 'Total Distance',
			value: totalDistanceLabel,
			icon: Route,
			tone: 'tone-cyan'
		},
		{
			key: 'average-speed',
			label: 'Average Speed',
			value: averageSpeedLabel,
			icon: Gauge,
			tone: 'tone-amber'
		},
		{
			key: 'operation-hours',
			label: 'Total Operation Hours',
			value: totalOperationHoursLabel,
			icon: Clock,
			tone: 'tone-amber'
		}
	].filter((card) => card.value));
</script>

<section class="summary-grid">
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
		</article>
	{/each}

	{#if engineRuntimeEntries.length}
		<article class="summary-card engine-runtime-summary-card">
			<div class="summary-card-head">
				<span class="summary-card-icon tone-cyan" aria-hidden="true">
					<Timer size={14} strokeWidth={2.2} />
				</span>
				<span>Engine Running Hours</span>
			</div>
			<div class="engine-runtime-summary-list">
				{#each engineRuntimeEntries as runtime (runtime.key || runtime.label)}
					<div class="engine-runtime-summary-item">
						<small>{runtime.label}</small>
						<strong>{runtime.value}</strong>
					</div>
				{/each}
			</div>
		</article>
	{/if}
</section>
