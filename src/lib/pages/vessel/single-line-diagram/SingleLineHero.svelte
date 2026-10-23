<script>
	let { vesselName = 'Selected Vessel', overallOnline = false, uptime = '' } = $props();
</script>

<div class="page-hero">
	<div>
		<span class="eyebrow">Single Line Diagram</span>
		<h1>{vesselName}</h1>
		<p>
			Live vessel system topology for MCP, Router, GPS, IP panel, engine signals, fuel source, and
			auxiliary load monitoring.
		</p>
	</div>
	<div class="hero-status {overallOnline ? 'online' : 'offline'}">
		<span class="overall-label"><i></i> Overall status</span>
		<strong>{overallOnline ? 'Online' : 'Offline'}</strong>
		<small>{uptime ? `MCP uptime: ${uptime}` : 'Realtime component state'}</small>
	</div>
</div>
