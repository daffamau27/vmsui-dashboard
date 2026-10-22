<script>
	import './avs-page.css';

	let {
		loading = false,
		loadingStatus = 'Preparing',
		completed = 0,
		selectedDevicesCount = 0,
		progress = 0
	} = $props();
</script>

{#if loading}
	<section class="table-section">
		<div class="loading-row">
			<div>
				<strong>{loadingStatus}</strong>
				<span>{completed}/{selectedDevicesCount} vessels completed</span>
			</div>

			<div class="progress-track">
				<div class="progress-fill" style={`width: ${progress}%;`}></div>
			</div>
		</div>
	</section>
{/if}
