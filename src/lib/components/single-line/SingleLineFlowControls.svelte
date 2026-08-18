<script>
	import { ControlButton, Controls, useSvelteFlow } from '@xyflow/svelte';

	let { fullscreen = false, onToggleFullscreen = () => {} } = $props();

	const { zoomIn, zoomOut, fitView } = useSvelteFlow();

	const fitOptions = {
		padding: 0.1,
		minZoom: 0.34,
		maxZoom: 1,
		duration: 260
	};

	function handleZoomIn() {
		zoomIn({ duration: 180 });
	}

	function handleZoomOut() {
		zoomOut({ duration: 180 });
	}

	function handleFit() {
		fitView(fitOptions);
	}
</script>

<Controls
	class="sld-custom-flow-controls"
	position="bottom-left"
	showZoom={false}
	showFitView={false}
	showLock={false}
	aria-label="Single line diagram controls"
>
	<ControlButton title="Zoom in" aria-label="Zoom in" onclick={handleZoomIn}>
		<span aria-hidden="true" class="sld-control-icon plus"></span>
	</ControlButton>
	<ControlButton title="Zoom out" aria-label="Zoom out" onclick={handleZoomOut}>
		<span aria-hidden="true" class="sld-control-icon minus"></span>
	</ControlButton>
	<ControlButton
		title={fullscreen ? 'Exit fullscreen' : 'Open fullscreen'}
		aria-label={fullscreen ? 'Exit fullscreen' : 'Open fullscreen'}
		onclick={onToggleFullscreen}
	>
		<span aria-hidden="true" class:active={fullscreen} class="sld-control-icon fullscreen"></span>
	</ControlButton>
	<ControlButton title="Fit diagram" aria-label="Fit diagram" onclick={handleFit}>
		<span aria-hidden="true" class="sld-control-icon fit"></span>
	</ControlButton>
</Controls>

