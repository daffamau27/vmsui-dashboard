<script>
	import './avs-page.css';

	let {
		devicesLoading = false,
		loading = false,
		selectedDevicesCount = 0,
		canAccess = true,
		onReload,
		onLoad
	} = $props();
</script>

<section class="avs-header-card">
	<div>
		<div class="page-kicker">All Vessel Summary</div>
		<h1>All Vessel Summary</h1>
		<p>
			Aggregated summary for selected vessels using custom time range, runtime, fuel consumption,
			speed, distance, and data received metrics.
		</p>
	</div>

	<div class="header-actions">
		<button
			type="button"
			class="secondary-btn"
			onclick={() => onReload?.()}
			disabled={devicesLoading || loading || !canAccess}
		>
			{devicesLoading ? 'Loading...' : 'Reload Vessels'}
		</button>

		<button
			type="button"
			class="primary-btn"
			onclick={() => onLoad?.()}
			disabled={loading || !selectedDevicesCount || !canAccess}
		>
			{loading ? 'Loading Summary...' : 'Load Summary'}
		</button>
	</div>
</section>
