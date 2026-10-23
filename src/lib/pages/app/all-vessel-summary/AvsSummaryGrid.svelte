<script>
	import './avs-page.css';

	let { selectedDevicesCount = 0, loadedRows = 0 } = $props();
</script>

<section class="summary-grid">
	<article class="summary-card">
		<span>Selected Vessels</span>
		<strong>{selectedDevicesCount}</strong>
	</article>

	<article class="summary-card">
		<span>Loaded Rows</span>
		<strong>{loadedRows}</strong>
	</article>
</section>
