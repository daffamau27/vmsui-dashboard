<script>
	let { averageSpeedLabel = null, maxSpeedLabel = null } = $props();
</script>

<section class="table-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">Speed</span>
			<h2>Speed Statistics</h2>
		</div>
	</div>

	<div class="speed-detail-grid">
		{#if averageSpeedLabel !== null}
			<article>
				<span>Average Speed</span>
				<strong>{averageSpeedLabel}</strong>
			</article>
		{/if}

		{#if maxSpeedLabel !== null}
			<article>
				<span>Max Speed</span>
				<strong>{maxSpeedLabel}</strong>
			</article>
		{/if}
	</div>
</section>
