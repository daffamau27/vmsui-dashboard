<script>
	import { RotateCcw, Unplug } from 'lucide-svelte';
	import './single-line-page.css';

	let { message = '', onRetry } = $props();
</script>

<section class="empty-card">
	<div class="section-heading">
		<span class="section-heading-icon tone-red" aria-hidden="true">
			<Unplug size={20} strokeWidth={2} />
		</span>
		<div>
			<span class="eyebrow">Unable to load</span>
			<h2>Single line diagram is not available</h2>
			<p>{message}</p>
		</div>
	</div>
	<button type="button" onclick={() => onRetry?.()}>
		<RotateCcw size={14} strokeWidth={2.4} aria-hidden="true" />
		<span>Retry</span>
	</button>
</section>
