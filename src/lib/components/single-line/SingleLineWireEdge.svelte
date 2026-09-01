<script>
	let {
		id,
		sourceX = 0,
		sourceY = 0,
		targetX = 0,
		targetY = 0,
		sourcePosition,
		targetPosition,
		style,
		markerStart,
		markerEnd,
		interactionWidth = 18,
		pathOptions = {}
	} = $props();

	function numeric(value, fallback = 0) {
		const numberValue = Number(value);
		return Number.isFinite(numberValue) ? numberValue : fallback;
	}

	function clamp(value, min, max) {
		return Math.min(max, Math.max(min, value));
	}

	function isVerticalRoute() {
		return (
			sourcePosition === 'top' ||
			sourcePosition === 'bottom' ||
			targetPosition === 'top' ||
			targetPosition === 'bottom'
		);
	}

	let path = $derived.by(() => {
		const sx = numeric(sourceX);
		const sy = numeric(sourceY);
		const tx = numeric(targetX);
		const ty = numeric(targetY);
		const dx = tx - sx;
		const dy = ty - sy;
		const absDx = Math.abs(dx);
		const absDy = Math.abs(dy);
		const firstBendOffset = Math.max(18, numeric(pathOptions?.offset, 34));
		const stub = Math.max(10, numeric(pathOptions?.stub, 18));

		if (isVerticalRoute()) {
			const direction = dy >= 0 ? 1 : -1;
			const firstBendY = sy + direction * clamp(firstBendOffset, 18, Math.max(18, absDy - stub));

			return [
				`M ${sx} ${sy}`,
				`L ${sx} ${firstBendY}`,
				`L ${tx} ${firstBendY}`,
				`L ${tx} ${ty}`
			].join(' ');
		}

		const direction = dx >= 0 ? 1 : -1;
		const firstBendX = sx + direction * clamp(firstBendOffset, 18, Math.max(18, absDx - stub));

		return [
			`M ${sx} ${sy}`,
			`L ${firstBendX} ${sy}`,
			`L ${firstBendX} ${ty}`,
			`L ${tx} ${ty}`
		].join(' ');
	});
</script>

<path
	{id}
	d={path}
	class="svelte-flow__edge-path sld-wire-edge"
	marker-start={markerStart}
	marker-end={markerEnd}
	fill="none"
	{style}
/>

{#if interactionWidth > 0}
	<path
		d={path}
		stroke-opacity="0"
		stroke-width={interactionWidth}
		fill="none"
		class="svelte-flow__edge-interaction"
	/>
{/if}
