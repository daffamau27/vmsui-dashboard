<script>
	import { Ship } from 'lucide-svelte';

	let { vesselName = '-', online = false } = $props();
</script>

<section class="dashboard-header-card">
	<div class="section-heading">
		<span class="section-heading-icon" aria-hidden="true">
			<Ship size={20} strokeWidth={2} />
		</span>
		<div>
			<span class="page-kicker">Vessel Dashboard</span>
			<h1>{vesselName}</h1>
			<p>
				Real-time monitoring for vessel status, position, engine RPM, weather, ocean current, and
				daily fuel consumption.
			</p>
		</div>
	</div>
</section>
