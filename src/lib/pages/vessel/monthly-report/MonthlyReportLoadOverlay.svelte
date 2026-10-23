<script>
	let { visible = false } = $props();
</script>

{#if visible}
	<div class="load-required-overlay">
		<div class="load-required-card">
			<div class="load-required-icon">!</div>
			<span class="section-kicker">Waiting for date range</span>
			<h2>Choose a monthly range first</h2>
			<p>
				Select month, date range, and timezone above, then click
				<strong>Load Data</strong> to display the monthly report.
			</p>
		</div>
	</div>
{/if}
