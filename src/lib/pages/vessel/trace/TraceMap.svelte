<script>
	import CopyableCoordinate from '$lib/components/CopyableCoordinate.svelte';
	import VesselMap from '$lib/components/VesselMap.svelte';
	import { formatNumber } from '$lib/utils/periodicalFormat.js';
	import { getVesselTypeIconUrl, getVesselTypeIconScale, getVesselIconLayout } from '$lib/utils/vesselIcons.js';

	let {
		active = false,
		vesselInfo = {},
		tracePoints = [],
		activeTraceIndex = 0,
		renderTick = 0,
		gpsUnavailable = false,
		usingPreviousPosition = false,
		isFullscreen = false,
		onToggleFullscreen = null
	} = $props();

	// Trace selalu pakai ikon tugboat biasa, apa pun sub-tipe tugboat-nya.
	const traceIconType = $derived(getVesselIconLayout(vesselInfo?.type) ? 'tugboat' : vesselInfo?.type);
</script>

<section class="monitor-card map-card">
	<div class="card-header map-header">
		<div>
			<div class="card-title">Vessel Position</div>
			<div class="card-subtitle">
				{vesselInfo.lastUpdate}
				{#if tracePoints.length && gpsUnavailable}
					<span> · GPS unavailable at this time</span>
				{:else if usingPreviousPosition}
					<span> · Using previous GPS position</span>
				{/if}
			</div>
		</div>

		<div class="coordinate-badge">
			<CopyableCoordinate
				value={formatNumber(vesselInfo.latitude, 6)}
				display={formatNumber(vesselInfo.latitude, 6)}
				label="latitude"
				compact
			/>
			<span class="coordinate-separator">,</span>
			<CopyableCoordinate
				value={formatNumber(vesselInfo.longitude, 6)}
				display={formatNumber(vesselInfo.longitude, 6)}
				label="longitude"
				compact
			/>
		</div>
	</div>

	<div class="map-panel">
		{#if active}
			<VesselMap
				latitude={vesselInfo.latitude}
				longitude={vesselInfo.longitude}
				heading={vesselInfo.heading}
				vesselName={vesselInfo.vesselName}
				speed={vesselInfo.currentSpeed}
				lastUpdate={vesselInfo.lastUpdate}
				iconUrl={getVesselTypeIconUrl(traceIconType)}
				iconScale={getVesselTypeIconScale(traceIconType)}
				zoom={12}
				{tracePoints}
				activeIndex={activeTraceIndex}
				renderKey={renderTick}
				showTraceLine={true}
				followActivePoint={false}
				enableMeasurement={true}
				{isFullscreen}
				{onToggleFullscreen}
			/>
		{/if}
	</div>
</section>
