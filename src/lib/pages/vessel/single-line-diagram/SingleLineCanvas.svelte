<script>
	import { SvelteFlow, ConnectionLineType } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import SingleLineFlowControls from '$lib/components/single-line/SingleLineFlowControls.svelte';
	import SingleLineWireEdge from '$lib/components/single-line/SingleLineWireEdge.svelte';
	import SingleLineNode from '$lib/components/single-line/SingleLineNode.svelte';
	import SingleLineSectionNode from '$lib/components/single-line/SingleLineSectionNode.svelte';

	let {
		nodes = [],
		edges = [],
		fullscreen = false,
		onToggleFullscreen,
		onRefresh,
		shellElement = $bindable(null)
	} = $props();

	const nodeTypes = {
		sldNode: SingleLineNode,
		sldSection: SingleLineSectionNode
	};

	const edgeTypes = {
		sldWire: SingleLineWireEdge
	};
</script>

<div class="diagram-shell" class:diagram-fullscreen={fullscreen} bind:this={shellElement}>
	<div class="flow-canvas" aria-label="Single line diagram flow">
		<button type="button" class="refresh-btn sld-floating-refresh" onclick={() => onRefresh?.()}>
			Refresh
		</button>
		<SvelteFlow
			id="single-line-diagram-flow"
			{nodes}
			{edges}
			{nodeTypes}
			{edgeTypes}
			fitView
			fitViewOptions={{ padding: 0.1, minZoom: 0.34, maxZoom: 1.0, duration: 260 }}
			minZoom={0.28}
			maxZoom={1.8}
			nodesDraggable={false}
			nodesConnectable={false}
			elementsSelectable={false}
			nodesFocusable={false}
			edgesFocusable={false}
			connectionLineType={ConnectionLineType.SmoothStep}
			proOptions={{ hideAttribution: true }}
		>
			<SingleLineFlowControls {fullscreen} {onToggleFullscreen} />
		</SvelteFlow>
	</div>
</div>
