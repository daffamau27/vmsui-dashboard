<script>
	import { Fuel } from 'lucide-svelte';
	import './fuel-management-page.css';

	let { vesselName = '-', latestRob = '-', loading = false } = $props();
</script>

<header class="fuel-header-card">
	<div class="section-heading">
		<span class="section-heading-icon tone-green" aria-hidden="true">
			<Fuel size={20} strokeWidth={2} />
		</span>
		<div>
			<div class="page-kicker">Fuel Management</div>
			<h1>{vesselName}</h1>
			<p>Fuel ROB logs, bunkering transactions, VDOR imports, and fuel comparison by engine.</p>
		</div>
	</div>

	<div class="header-actions">
		<div class="header-rob-card">
			<span>Latest ROB</span>
			<strong>{loading ? 'Loading...' : latestRob}</strong>
		</div>
	</div>
</header>
