<script>
	let { vesselName = '-' } = $props();
</script>

<section class="dashboard-header-card">
	<div>
		<span class="page-kicker">Vessel Dashboard</span>
		<h1>{vesselName}</h1>
		<p>
			Real-time monitoring for vessel status, position, engine RPM, weather, ocean current, and
			daily fuel consumption.
		</p>
	</div>
</section>
