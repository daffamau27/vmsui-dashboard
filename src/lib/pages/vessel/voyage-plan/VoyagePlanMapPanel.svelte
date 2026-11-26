<script>
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import { MapPin } from 'lucide-svelte';

	let {
		planName = 'No Active Route',
		routePointCount = 0,
		assetsCount = 0,
		assetsLoading = false,
		assetsError = '',
		activeAssignment = false,
		activeLoading = false,
		detailLoading = false,
		active = false,
		zones = [],
		legendTypes = [],
		onFit,
		onShowActivePlan,
		mapContainer = $bindable(null)
	} = $props();
</script>

<section class="map-panel">
	<div class="section-header map-section-header">
		<div class="map-title">
			<div class="section-heading">
				<span class="section-heading-icon tone-cyan" aria-hidden="true">
					<MapPin size={20} strokeWidth={2} />
				</span>
				<div>
					<span class="section-kicker">Route Map</span>
					<h2>{planName}</h2>
					<div class="map-meta-line">
						<span>{routePointCount} route points</span>
						<span>{assetsLoading ? 'Loading assets...' : `${assetsCount} assets`}</span>
						{#if assetsError}
							<span class="asset-error">{assetsError}</span>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<div class="section-actions map-actions">
			<button type="button" onclick={() => onFit?.()}>Fit Map</button>
			{#if activeAssignment}
				<button type="button" onclick={() => onShowActivePlan?.()} disabled={detailLoading}
					>Show Active Plan</button
				>
			{/if}
		</div>
	</div>

	<div class="map-shell">
		{#if active}
			<div class="route-map" bind:this={mapContainer}></div>
		{/if}

		{#if activeLoading || detailLoading || assetsLoading}
			<div class="map-loading-overlay">
				<LoadingSkeleton label="Loading route map data" variant="voyage-route-map" compact />
			</div>
		{/if}

		{#if !routePointCount}
			<div class="map-empty">
				<strong>No route data</strong>
				<span>Select a vessel or history item that has route points.</span>
			</div>
		{/if}
	</div>

	<div class="route-map-legend" aria-label="Route map legend">
		<div class="legend-group">
			<span class="legend-title">Route</span>
			<span class="legend-item">
				<i class="legend-route-dot start"></i>
				Start
			</span>
			<span class="legend-item">
				<i class="legend-route-dot pending"></i>
				Pending
			</span>
			<span class="legend-item">
				<i class="legend-route-dot completed"></i>
				Completed
			</span>
			<span class="legend-item">
				<i class="legend-route-dot manual"></i>
				Manual
			</span>
			<span class="legend-item">
				<i class="legend-route-dot skipped"></i>
				Skipped
			</span>
			<span class="legend-item">
				<i class="legend-route-dot finish"></i>
				Finish
			</span>
		</div>

		{#if legendTypes.length}
			<div class="legend-group">
				<span class="legend-title">Assets</span>
				{#each legendTypes as assetType (assetType.key ?? assetType.label)}
					<span class="legend-item asset-legend-item asset-type-{assetType.key ?? 'asset'}">
						<img
							class="legend-asset-icon"
							src={assetType.icon}
							alt={`${assetType.label} icon`}
						/>
						{assetType.label}
					</span>
				{/each}
			</div>
		{/if}

		{#if zones.length}
			<div class="legend-group">
				<span class="legend-title">Zones</span>
				{#each zones as zone (zone.key || zone.name)}
					<span class="legend-item">
						<i
							class="legend-zone-swatch"
							style={`--zone-color: ${zone.color}; --zone-fill: ${zone.fillColor};`}
						></i>
						{zone.name}
					</span>
				{/each}
			</div>
		{/if}
	</div>
</section>
