<script>
	let { data = {} } = $props();

	let width = $derived(data?.width || 320);
	let height = $derived(data?.height || 220);
</script>

<div
	class="sld-section-node {data?.variant || 'main'}"
	style="--section-width: {width}px; --section-height: {height}px;"
>
	<h2>{data?.title}</h2>
	{#if data?.subtitle}
		<span>{data.subtitle}</span>
	{/if}
</div>

<style>
	.sld-section-node {
		box-sizing: border-box;
		width: var(--section-width);
		height: var(--section-height);
		border: 2px dashed rgba(191, 219, 254, 0.72);
		background: rgba(11, 18, 32, 0.34);
		color: #f4f7fb;
		pointer-events: none;
		box-shadow:
			inset 0 0 0 1px rgba(30, 64, 175, 0.22),
			0 0 18px rgba(59, 130, 246, 0.08);
	}

	.sld-section-node h2 {
		margin: 10px 0 0 24px;
		font-size: 1.75rem;
		font-weight: 800;
		letter-spacing: -0.04em;
		line-height: 1;
		color: #f8fafc;
	}

	.sld-section-node.group {
		border-color: rgba(147, 197, 253, 0.58);
		background: rgba(11, 18, 32, 0.22);
		box-shadow: inset 0 0 0 1px rgba(147, 197, 253, 0.12);
	}

	.sld-section-node.group h2 {
		display: inline-flex;
		margin: -11px 0 0 14px;
		padding: 0 7px;
		background: #0f172a;
		color: #bfdbfe;
		font-size: 0.78rem;
		font-weight: 750;
		letter-spacing: 0.08em;
		line-height: 1;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.sld-section-node span {
		display: inline-flex;
		margin: 8px 0 0 24px;
		color: #93c5fd;
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}
</style>
