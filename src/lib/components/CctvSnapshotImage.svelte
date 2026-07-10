<script>
	import { browser } from '$app/environment';

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
	let displayFrameKey = $state('');
	let previousSrc = $state('');
	let isSwapping = $state(false);
	let requestedKey = '';
	let readyNotifiedFor = '';
	let loadSequence = 0;
	let swapTimer;

	function notifyReady(srcValue = displaySrc, keyValue = displayFrameKey) {
		if (!srcValue) return;

		const notifyKey = `${keyValue}|${srcValue}`;
		if (readyNotifiedFor === notifyKey) return;

		readyNotifiedFor = notifyKey;
		onReady?.({ src: srcValue, displaySrc: srcValue, frameKey: keyValue });
	}

	function preloadImage(imageSrc) {
		if (!browser || !imageSrc) return Promise.resolve();

		return new Promise((resolve) => {
			const image = new Image();

			image.onload = async () => {
				try {
					if (image.decode) await image.decode();
				} catch {
					// Some browsers can reject decode() for an already-loaded image.
				}

				resolve();
			};

			image.onerror = () => resolve();
			image.src = imageSrc;

			if (image.complete) {
				image.onload?.();
			}
		});
	}

	async function loadSnapshot() {
		if (loading === 'lazy' && !isVisible) return;

		const nextSrc = src || '';
		const nextFrameKey = frameKey || nextSrc || filePath || '';
		const nextRequestKey = `${nextFrameKey}|${nextSrc}|${filePath || ''}`;

		if (requestedKey === nextRequestKey) return;
		requestedKey = nextRequestKey;

		if (!nextSrc) {
			loadSequence += 1;
			displaySrc = '';
			displayFrameKey = '';
			previousSrc = '';
			isSwapping = false;
			readyNotifiedFor = '';
			return;
		}

		if (displaySrc === nextSrc && displayFrameKey === nextFrameKey) {
			notifyReady(nextSrc, nextFrameKey);
			return;
		}

		const sequence = ++loadSequence;
		onLoading?.({ src: nextSrc, frameKey: nextFrameKey });

		await preloadImage(nextSrc);
		if (sequence !== loadSequence) return;

		if (displaySrc && displaySrc !== nextSrc) {
			previousSrc = displaySrc;
			isSwapping = true;
			clearTimeout(swapTimer);
			swapTimer = setTimeout(() => {
				previousSrc = '';
				isSwapping = false;
			}, 180);
		}

		readyNotifiedFor = '';
		displaySrc = nextSrc;
		displayFrameKey = nextFrameKey;

		requestAnimationFrame(() => notifyReady(nextSrc, nextFrameKey));
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

		return () => {
			observer.disconnect();
			clearTimeout(swapTimer);
		};
	});
</script>

<span class={`cctv-snapshot-image-host ${className}`} bind:this={imageElement}>
	{#if previousSrc}
		<img
			class="previous-frame"
			src={previousSrc}
			alt=""
			loading="eager"
			draggable="false"
			aria-hidden="true"
		/>
	{/if}

	{#if displaySrc}
		<img
			class:entering-frame={isSwapping}
			src={displaySrc}
			alt={alt}
			{loading}
			draggable="false"
			onload={() => notifyReady()}
			onerror={() => notifyReady()}
		/>
	{/if}
</span>

<style>
	.cctv-snapshot-image-host {
		display: block;
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	.cctv-snapshot-image-host :global(img) {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: inherit;
		display: block;
	}

	.cctv-snapshot-image-host :global(.previous-frame) {
		z-index: 0;
	}

	.cctv-snapshot-image-host :global(img:not(.previous-frame)) {
		z-index: 1;
	}

	.cctv-snapshot-image-host :global(.entering-frame) {
		animation: cctvFrameFadeIn 0.18s ease-out both;
	}

	@keyframes cctvFrameFadeIn {
		from {
			opacity: 0;
		}

		to {
			opacity: 1;
		}
	}
</style>
