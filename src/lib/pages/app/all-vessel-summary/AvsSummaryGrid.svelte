<script>
	import { Rows3, Ship } from 'lucide-svelte';
	import './avs-page.css';

	let { selectedDevicesCount = 0, loadedRows = 0 } = $props();
</script>

<section class="summary-grid">
	<article class="summary-card">
		<div class="summary-card-head">
			<span class="summary-card-icon tone-cyan" aria-hidden="true">
				<Ship size={13} strokeWidth={2.2} />
			</span>
			<span>Selected Vessels</span>
		</div>
		<strong>{selectedDevicesCount}</strong>
	</article>

	<article class="summary-card">
		<div class="summary-card-head">
			<span class="summary-card-icon tone-violet" aria-hidden="true">
				<Rows3 size={13} strokeWidth={2.2} />
			</span>
			<span>Loaded Rows</span>
		</div>
		<strong>{loadedRows}</strong>
	</article>
</section>
