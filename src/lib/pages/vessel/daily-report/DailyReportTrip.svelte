<script>
	import CopyableCoordinate from '$lib/components/CopyableCoordinate.svelte';
	import { Route, MapPin } from 'lucide-svelte';

	let {
		summary = {},
		startCoordinate = '-',
		endCoordinate = '-',
		literPerNauticalMile = null,
		fuelSourceLabel = '-',
		canViewFuelPerNm = false,
		canViewMap = false,
		active = false,
		mapAction,
		mapPoints = [],
		mapZones = [],
		mapAssets = [],
		legendTypes = []
	} = $props();
</script>

<section class="table-section trip-summary-section">
	<div class="section-header">
		<div class="section-heading">
			<span class="section-heading-icon tone-cyan" aria-hidden="true">
				<Route size={20} strokeWidth={2} />
			</span>
			<div>
				<span class="section-kicker">Trip</span>
				<h2>Daily Trip Summary</h2>
			</div>
		</div>

		<strong>{summary.totalPoints} points</strong>
	</div>

	{#if canViewMap && summary.totalPoints}
		<div class="trip-summary-content">
			<article class="trip-route-card">
				<div class="trip-route-header">
					<div>
						<span>Route Preview</span>
						<strong>{summary.startTime} - {summary.endTime}</strong>
					</div>
				</div>

				<div class="trip-route-map">
					{#if active}
						<div
							class="trip-leaflet-map"
							use:mapAction={{ points: mapPoints, zones: mapZones, assets: mapAssets }}
						></div>
					{/if}
				</div>

				{#if mapZones.length || legendTypes.length}
					<div class="trip-zone-legend" aria-label="Zone legend">
						{#each mapZones as zone (zone.name)}
							<span>
								<i
									style={`--zone-color: ${zone.color}; --zone-fill: ${zone.fillColor};`}
									aria-hidden="true"
								></i>
								{zone.name}
							</span>
						{/each}

						{#each legendTypes as assetType (assetType.key ?? assetType.label)}
							<span class="trip-asset-legend-item asset-type-{assetType.key ?? 'asset'}">
								<img src={assetType.icon} alt={`${assetType.label} icon`} />
								{assetType.label}
							</span>
						{/each}
					</div>
				{/if}
			</article>

			<article class="trip-summary-card">
				<div class="trip-summary-list">
					<div>
						<span>Total Distance</span>
						<strong>{summary.totalDistanceLabel} NM</strong>
					</div>

					{#if canViewFuelPerNm}
						<div>
							<span>Fuel per Nautical Mile</span>
							<strong>
								{literPerNauticalMile === null
									? '-'
									: `${literPerNauticalMile} L/NM (${fuelSourceLabel})`}
							</strong>
						</div>
					{/if}

					<div>
						<span>Outside Safety Zone</span>
						<strong>{summary.outsideDistanceLabel} NM</strong>
					</div>

					<div>
						<span>Outside Points</span>
						<strong>{summary.outsidePoints}</strong>
					</div>

					<div>
						<span>Start Coordinate</span>
						<strong class="coordinate-pair">
							<MapPin size={12} strokeWidth={2.2} aria-hidden="true" />
							<CopyableCoordinate
								value={startCoordinate}
								display={startCoordinate}
								label="start coordinate"
								compact
							/>
						</strong>
					</div>

					<div>
						<span>End Coordinate</span>
						<strong class="coordinate-pair">
							<MapPin size={12} strokeWidth={2.2} aria-hidden="true" />
							<CopyableCoordinate
								value={endCoordinate}
								display={endCoordinate}
								label="end coordinate"
								compact
							/>
						</strong>
					</div>
				</div>
			</article>
		</div>
	{:else}
		<div class="empty-box">Daily trip path is not available yet.</div>
	{/if}
</section>
