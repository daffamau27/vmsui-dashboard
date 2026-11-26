<script>
	import { CircuitBoard } from 'lucide-svelte';
	import './single-line-page.css';

	let { vesselName = 'Selected Vessel', overallOnline = false, uptime = '' } = $props();
</script>

<div class="page-hero">
	<div class="section-heading">
		<span class="section-heading-icon tone-cyan" aria-hidden="true">
			<CircuitBoard size={20} strokeWidth={2} />
		</span>
		<div>
			<span class="eyebrow">Single Line Diagram</span>
			<h1>{vesselName}</h1>
			<p>
				Live vessel system topology for MCP, Router, GPS, IP panel, engine signals, fuel source, and
				auxiliary load monitoring.
			</p>
		</div>
	</div>
	<div class="hero-status {overallOnline ? 'online' : 'offline'}">
		<span class="overall-label"><i></i> Overall status</span>
		<strong>{overallOnline ? 'Online' : 'Offline'}</strong>
		<small>{uptime ? `MCP uptime: ${uptime}` : 'Realtime component state'}</small>
	</div>
</div>
