<script>
	import { Ship } from 'lucide-svelte';

	let { vesselName = '-', loading = false, disabled = false, onRefresh } = $props();
</script>

<section class="voyage-header-card">
	<div class="header-copy">
		<div class="section-heading">
			<span class="section-heading-icon" aria-hidden="true">
				<Ship size={20} strokeWidth={2} />
			</span>
			<div>
				<div class="page-kicker">Vessel Voyage Plan</div>
				<h1>{vesselName}</h1>
				<p>Active voyage route and assignment history for the selected vessel.</p>
			</div>
		</div>
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
