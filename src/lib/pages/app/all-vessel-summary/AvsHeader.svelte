<script>
	import { Download, RefreshCw, Ship } from 'lucide-svelte';
	import './avs-page.css';

	let {
		devicesLoading = false,
		loading = false,
		selectedDevicesCount = 0,
		canAccess = true,
		onReload,
		onLoad
	} = $props();
</script>

<section class="avs-header-card">
	<div class="section-heading">
		<span class="section-heading-icon tone-cyan" aria-hidden="true">
			<Ship size={20} strokeWidth={2} />
		</span>
		<div>
			<div class="page-kicker">All Vessel Summary</div>
			<h1>All Vessel Summary</h1>
			<p>
				Aggregated summary for selected vessels using custom time range, runtime, fuel consumption,
				speed, distance, and data received metrics.
			</p>
		</div>
	</div>

	<div class="header-actions">
		<button
			type="button"
			class="secondary-btn"
			onclick={() => onReload?.()}
			disabled={devicesLoading || loading || !canAccess}
		>
			<RefreshCw size={14} strokeWidth={2.4} aria-hidden="true" />
			<span>{devicesLoading ? 'Loading...' : 'Reload Vessels'}</span>
		</button>

		<button
			type="button"
			class="primary-btn"
			onclick={() => onLoad?.()}
			disabled={loading || !selectedDevicesCount || !canAccess}
		>
			<Download size={14} strokeWidth={2.4} aria-hidden="true" />
			<span>{loading ? 'Loading Summary...' : 'Load Summary'}</span>
		</button>
	</div>
</section>
