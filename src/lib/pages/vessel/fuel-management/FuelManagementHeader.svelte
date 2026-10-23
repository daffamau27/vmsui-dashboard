<script>
	let { vesselName = '-', latestRob = '-', loading = false } = $props();
</script>

<header class="fuel-header-card">
	<div>
		<div class="page-kicker">Fuel Management</div>
		<h1>{vesselName}</h1>
		<p>Fuel ROB logs, bunkering transactions, VDOR imports, and fuel comparison by engine.</p>
	</div>

	<div class="header-actions">
		<div class="header-rob-card">
			<span>Latest ROB</span>
			<strong>{loading ? 'Loading...' : latestRob}</strong>
		</div>
	</div>
</header>
