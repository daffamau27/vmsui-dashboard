<script>
	import { Handle, Position } from '@xyflow/svelte';

	let { data = {} } = $props();

	let status = $derived(
		data?.online === true ? 'online' : data?.online === false ? 'offline' : 'unknown'
	);
	let statusLabel = $derived(status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'N/A');
	let width = $derived(data?.width || 130);
	let height = $derived(data?.height || 64);
	let customHandles = $derived(Array.isArray(data?.handles) ? data.handles : []);

	function getHandlePosition(side) {
		if (side === 'top') return Position.Top;
		if (side === 'bottom') return Position.Bottom;
		if (side === 'left') return Position.Left;
		return Position.Right;
	}

	function getHandleStyle(handle) {
		const offset = Number.isFinite(Number(handle?.offset)) ? Number(handle.offset) : 50;
		const side = handle?.side || 'right';

		if (side === 'top' || side === 'bottom') {
			return `left: ${offset}%;`;
		}

		return `top: ${offset}%;`;
	}
</script>

<div
	class="sld-node {data?.variant || 'device'} {status} {data?.icon ? 'has-icon' : ''}"
	style="--sld-node-width: {width}px; --sld-node-height: {height}px;"
>
	<Handle id="top-target" type="target" position={Position.Top} class="sld-handle" />
	<Handle id="left-target" type="target" position={Position.Left} class="sld-handle" />
	<Handle id="right-source" type="source" position={Position.Right} class="sld-handle" />
	<Handle id="bottom-source" type="source" position={Position.Bottom} class="sld-handle" />
	<Handle id="bottom-target" type="target" position={Position.Bottom} class="sld-handle" />

	{#each customHandles as handle (handle.id)}
		<Handle
			id={handle.id}
			type={handle.type === 'target' ? 'target' : 'source'}
			position={getHandlePosition(handle.side)}
			class="sld-port-handle {handle.type === 'target' ? 'target' : 'source'} {handle.side || 'right'}"
			style={getHandleStyle(handle)}
		/>
	{/each}

	{#if data?.showStatus !== false}
		<span class="status-dot {status}" title={statusLabel} aria-label={statusLabel}></span>
	{/if}

	<div class="node-copy node-title">
		<strong>{data?.label || 'Component'}</strong>
	</div>

	{#if data?.logo}
		<img class="node-logo" src={data.logo} alt="" aria-hidden="true" />
	{/if}

	{#if data?.icon}
		<span class="node-icon-shell" aria-hidden="true">
			<img class="node-icon" src={data.icon} alt="" />
		</span>
	{/if}

	{#if data?.subtitle || data?.meta}
		<div class="node-copy node-meta">
		{#if data?.subtitle}
			<span>{data.subtitle}</span>
		{/if}
		{#if data?.meta}
			<small>{data.meta}</small>
		{/if}
		</div>
	{/if}
</div>

<style>
	.sld-node {
		position: relative;
		display: grid;
		place-items: center;
		box-sizing: border-box;
		width: var(--sld-node-width);
		height: var(--sld-node-height);
		gap: 7px;
		padding: 12px 13px;
		border: 1.5px solid rgba(186, 230, 253, 0.88);
		background: linear-gradient(180deg, rgba(248, 250, 252, 0.99), rgba(219, 234, 254, 0.97));
		color: #0f172a;
		text-align: center;
		box-shadow:
			0 16px 32px rgba(0, 0, 0, 0.26),
			inset 0 0 0 1px rgba(255, 255, 255, 0.64);
	}

	.sld-node.panel {
		border-radius: 0 !important;
		min-height: 190px;
	}

	.sld-node.device {
		border-radius: 0;
	}

	.sld-node.sensor {
		border-radius: 0;
	}

	.sld-node.online {
		border-color: rgba(34, 197, 94, 0.72);
	}

	.sld-node.offline {
		border-color: rgba(203, 213, 225, 0.88);
		background: linear-gradient(180deg, rgba(226, 232, 240, 0.92), rgba(148, 163, 184, 0.88));
		color: #475569;
		filter: grayscale(0.82) saturate(0.45);
		opacity: 0.74;
	}

	.sld-node.unknown {
		border-color: rgba(203, 213, 225, 0.88);
		background: linear-gradient(180deg, rgba(226, 232, 240, 0.9), rgba(148, 163, 184, 0.84));
		color: #475569;
		filter: grayscale(0.82) saturate(0.45);
		opacity: 0.72;
	}

	.sld-node.has-icon {
		justify-items: center;
		align-items: center;
		gap: 7px;
	}

	.sld-node.has-icon.offline,
	.sld-node.has-icon.unknown {
		border-color: rgba(203, 213, 225, 0.8);
		background: linear-gradient(180deg, rgba(226, 232, 240, 0.9), rgba(148, 163, 184, 0.84));
		color: #334155;
	}

	.sld-node.offline .node-logo,
	.sld-node.unknown .node-logo,
	.sld-node.offline .node-icon,
	.sld-node.unknown .node-icon {
		filter: grayscale(1) contrast(0.82);
		opacity: 0.72;
	}

	.status-dot {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 10px;
		height: 10px;
		border-radius: 999px;
		background: #64748b;
		box-shadow:
			0 0 0 3px rgba(148, 163, 184, 0.16),
			0 6px 12px rgba(0, 0, 0, 0.22);
	}

	.status-dot.online {
		background: #22c55e;
		box-shadow:
			0 0 0 3px rgba(34, 197, 94, 0.18),
			0 0 16px rgba(34, 197, 94, 0.42),
			0 6px 12px rgba(0, 0, 0, 0.22);
	}

	.status-dot.offline,
	.status-dot.unknown {
		background: #64748b;
		box-shadow:
			0 0 0 3px rgba(148, 163, 184, 0.16),
			0 6px 12px rgba(0, 0, 0, 0.22);
	}

	.node-logo {
		display: block;
		width: min(116px, calc(var(--sld-node-width) - 22px));
		max-height: 62px;
		object-fit: contain;
		margin: 1px 0 3px;
	}

	.node-icon {
		display: block;
		width: 42px;
		height: 42px;
		object-fit: contain;
	}

	.sld-node.sensor .node-icon-shell {
		width: 50px;
		height: 50px;
		border-radius: 15px;
	}

	.sld-node.sensor .node-icon {
		width: 40px;
		height: 40px;
	}

	.node-copy {
		display: grid;
		justify-items: center;
		gap: 3px;
	}

	.node-copy strong {
		color: #0f172a !important;
		font-size: 1rem;
		font-weight: 800;
		line-height: 1.05;
		letter-spacing: -0.015em;
		white-space: pre-line;
		text-shadow: none;
	}

	.node-copy span {
		font-size: 1rem;
		font-weight: 650;
		line-height: 1.2;
		color: #334155 !important;
		white-space: pre-line;
	}

	.sld-node.has-icon .node-copy span {
		color: #334155 !important;
	}

	.node-copy small {
		font-size: 1rem;
		font-weight: 750;
		color: #0b2141 !important;
	}

	.sld-node.has-icon .node-copy small {
		color: #0b2141 !important;
	}

	:global(.sld-handle) {
		width: 1px !important;
		height: 1px !important;
		min-width: 1px !important;
		min-height: 1px !important;
		border: 0 !important;
		background: transparent !important;
		opacity: 0 !important;
		pointer-events: none !important;
	}

	:global(.sld-port-handle) {
		width: 8px !important;
		height: 8px !important;
		min-width: 8px !important;
		min-height: 8px !important;
		border: 2px solid rgba(15, 23, 42, 0.48) !important;
		border-radius: 999px !important;
		background: #0f172a !important;
		opacity: 1 !important;
		pointer-events: none !important;
		box-shadow:
			0 0 0 2px rgba(226, 232, 240, 0.74),
			0 4px 9px rgba(15, 23, 42, 0.28) !important;
	}

	:global(.sld-port-handle.source) {
		background: #065f46 !important;
		border-color: rgba(16, 185, 129, 0.58) !important;
	}

	:global(.sld-port-handle.target) {
		background: #1e293b !important;
		border-color: rgba(148, 163, 184, 0.72) !important;
	}

	:global(.sld-port-handle.left),
	:global(.sld-port-handle.right) {
		transform: translate(0, -50%) !important;
	}

	:global(.sld-port-handle.top),
	:global(.sld-port-handle.bottom) {
		transform: translate(-50%, 0) !important;
	}
</style>
