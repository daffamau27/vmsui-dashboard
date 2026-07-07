<script>
	let {
		src = '',
		alt = 'CCTV snapshot',
		filePath = '',
		loading = 'lazy',
		frameKey = '',
		renderTick = 0,
		onLoading = null,
		onReady = null,
		class: className = ''
	} = $props();

	let imageElement;
	let isVisible = $state(false);
	let displaySrc = $state('');
	let readyNotifiedFor = '';

	function notifyReady() {
		if (!displaySrc) return;

		const notifyKey = `${frameKey}|${displaySrc}`;
		if (readyNotifiedFor === notifyKey) return;

		readyNotifiedFor = notifyKey;
		onReady?.({ src, displaySrc, frameKey });
	}

	function loadSnapshot() {
		if (loading === 'lazy' && !isVisible) return;

		readyNotifiedFor = '';
		displaySrc = src || '';

		if (displaySrc) {
			onLoading?.({ src: displaySrc, frameKey });

			requestAnimationFrame(() => {
				notifyReady();
			});
		}
	}

	$effect(() => {
		src;
		filePath;
		frameKey;
		renderTick;
		isVisible;

		loadSnapshot();
	});

	$effect(() => {
		if (!imageElement) return;

		if (loading !== 'lazy') {
			isVisible = true;
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					isVisible = true;
					observer.disconnect();
				}
			},
			{
				rootMargin: '220px'
			}
		);

		observer.observe(imageElement);

		return () => observer.disconnect();
	});
</script>

<span class={`cctv-snapshot-image-host ${className}`} bind:this={imageElement}>
	{#if displaySrc}
		<img
			src={displaySrc}
			alt={alt}
			{loading}
			draggable="false"
			onload={notifyReady}
			onerror={notifyReady}
		/>
	{/if}
</span>

<style>
	.cctv-snapshot-image-host {
		display: block;
	}

	.cctv-snapshot-image-host :global(img) {
		width: 100%;
		height: 100%;
		object-fit: inherit;
		display: block;
	}
</style>
