<script>
	let {
		statusLabel = '-',
		routePointCount = 0,
		progress = 0,
		progressLabel = '0.00%',
		distanceLabel = '0.00 NM',
		averageSpeedLabel = '-',
		voyageType = ''
	} = $props();
</script>

<section class="summary-grid">
	<article class="summary-card">
		<span>Status</span>
		<strong>{statusLabel}</strong>
	</article>

	{#if voyageType}
		<article class="summary-card">
			<span>Voyage Type</span>
			<strong>{voyageType}</strong>
		</article>
	{/if}

	<article class="summary-card">
		<span>Route Points</span>
		<strong>{routePointCount}</strong>
	</article>

	<article class="summary-card progress-summary-card">
		<span>Progress</span>
		<strong>{progressLabel}</strong>
		<div class="progress-track">
			<i style={`width: ${progress}%`}></i>
		</div>
	</article>

	<article class="summary-card">
		<span>Total Distance</span>
		<strong>{distanceLabel}</strong>
	</article>

	<article class="summary-card">
		<span>Average Speed</span>
		<strong>{averageSpeedLabel}</strong>
	</article>
</section>
