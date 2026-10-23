<script>
	let { message = '', onRetry } = $props();
</script>

<section class="empty-card">
	<span class="eyebrow">Unable to load</span>
	<h2>Single line diagram is not available</h2>
	<p>{message}</p>
	<button type="button" onclick={() => onRetry?.()}>Retry</button>
</section>
