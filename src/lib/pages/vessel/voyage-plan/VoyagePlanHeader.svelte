<script>
	let { vesselName = '-', loading = false, disabled = false, onRefresh } = $props();
</script>

<section class="voyage-header-card">
	<div class="header-copy">
		<div class="page-kicker">Vessel Voyage Plan</div>
		<h1>{vesselName}</h1>
		<p>Active voyage route and assignment history for the selected vessel.</p>
	</div>

	<button
		type="button"
		class="primary-button header-refresh-button"
		onclick={() => onRefresh?.()}
		{disabled}
	>
		{loading ? 'Loading...' : 'Refresh Data'}
	</button>
</section>
