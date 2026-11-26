<script>
	import { Activity, Tag, MapPin, Gauge, Route } from 'lucide-svelte';

	let {
		statusLabel = '-',
		routePointCount = 0,
		progress = 0,
		progressLabel = '0.00%',
		distanceLabel = '0.00 NM',
		averageSpeedLabel = '-',
		voyageType = ''
	} = $props();

	const summaryCards = $derived([
		{
			key: 'status',
			label: 'Status',
			value: statusLabel,
			icon: Activity,
			tone: 'tone-violet'
		},
		...(voyageType
			? [
					{
						key: 'voyage-type',
						label: 'Voyage Type',
						value: voyageType,
						icon: Tag,
						tone: 'tone-green'
					}
				]
			: []),
		{
			key: 'route-points',
			label: 'Route Points',
			value: routePointCount,
			icon: MapPin,
			tone: 'tone-cyan'
		},
		{
			key: 'total-distance',
			label: 'Total Distance',
			value: distanceLabel,
			icon: Route,
			tone: 'tone-cyan'
		},
		{
			key: 'average-speed',
			label: 'Average Speed',
			value: averageSpeedLabel,
			icon: Gauge,
			tone: 'tone-amber'
		}
	]);
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

	<article class="summary-card progress-summary-card">
		<div class="summary-card-head">
			<span class="summary-card-icon tone-amber" aria-hidden="true">
				<Gauge size={14} strokeWidth={2.2} />
			</span>
			<span>Progress</span>
		</div>
		<strong>{progressLabel}</strong>
		<div class="progress-track">
			<i style={`width: ${progress}%`}></i>
		</div>
	</article>
</section>
