<script>
	import { onMount, tick } from 'svelte';
	import {
		SvelteFlow,
		Controls,
		ConnectionLineType
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import { apiRequest } from '$lib/api/authApi.js';
	import { selectedVesselId, selectedVesselInfo } from '$lib/stores/selectedVessel.svelte.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import SingleLineNode from '$lib/components/single-line/SingleLineNode.svelte';
	import SingleLineSectionNode from '$lib/components/single-line/SingleLineSectionNode.svelte';

	let { active = true } = $props();

	let loading = $state(false);
	let errorMessage = $state('');
	let diagramData = $state(null);
	let lastLoadKey = $state('');
	let flowNodes = $state([]);
	let flowEdges = $state([]);

	const nodeTypes = {
		sldNode: SingleLineNode,
		sldSection: SingleLineSectionNode
	};

	const CABLES = {
		canbus: {
			color: '#04af55',
			width: 4,
			label: '4C x 0,75'
		},
		ethernet: {
			color: '#05aee8',
			width: 4,
			label: 'CAT 5E'
		},
		powerAc: {
			color: '#f2b323',
			width: 4,
			label: '3C x 2,5'
		},
		powerDc: {
			color: '#ff1010',
			width: 4,
			label: '2C x 2,5'
		}
	};

	let vesselName = $derived(
		diagramData?.vessel_name ||
			$selectedVesselInfo?.vesselName ||
			$selectedVesselInfo?.name ||
			$selectedVesselInfo?.deviceName ||
			'Selected Vessel'
	);

	let mcp = $derived(diagramData?.mcp || {});
	let eip = $derived(mcp?.eip || {});
	let router = $derived(mcp?.router || {});
	let mastGps = $derived(mcp?.gps || {});
	let engines = $derived(normalizeComponentList(eip?.engines_rpm));
	let wayjun = $derived(normalizeWayjun(eip?.wayjun));
	let aeLoads = $derived(normalizeComponentList(eip?.ae_load));
	let fuelSources = $derived(normalizeFuelSources(eip?.fuel_source));

	let overallOnline = $derived(
		Boolean(mcp?.online || router?.online || mastGps?.online || eip?.online)
	);

	function getCurrentVesselId() {
		return (
			$selectedVesselId ||
			$selectedVesselInfo?.vesselId ||
			$selectedVesselInfo?.id ||
			$selectedVesselInfo?.dbId ||
			null
		);
	}

	function normalizePayload(response) {
		return response?.data || response || null;
	}

	function normalizeComponentList(rows) {
		return Array.isArray(rows) ? rows.filter(Boolean) : [];
	}

	function normalizeWayjun(rawWayjun) {
		if (!rawWayjun || typeof rawWayjun !== 'object') return null;
		return rawWayjun;
	}

	function normalizeFuelSources(rawFuelSource = {}) {
		if (!rawFuelSource || typeof rawFuelSource !== 'object') return [];

		return Object.entries(rawFuelSource)
			.flatMap(([source, rows]) => {
				const items = Array.isArray(rows) ? rows : rows ? [rows] : [];

				return items.map((item) => ({
					...item,
					source: source.toUpperCase(),
					name: item?.name || `${source.toUpperCase()} SOURCE`
				}));
			})
			.filter(Boolean);
	}

	function displayValue(value, suffix = '') {
		if (value === null || value === undefined || value === '') return '-';
		return `${value}${suffix}`;
	}

	function makeSection(id, title, x, y, width, height, options = {}) {
		return {
			id,
			type: 'sldSection',
			position: { x, y },
			data: { title, width, height, variant: options.variant },
			selectable: false,
			draggable: false,
			zIndex: 0
		};
	}

	function makeNode(id, label, x, y, options = {}) {
		return {
			id,
			type: 'sldNode',
			position: { x, y },
			data: {
				label,
				online: options.online,
				subtitle: options.subtitle,
				meta: options.meta,
				logo: options.logo,
				icon: options.icon,
				variant: options.variant,
				width: options.width,
				height: options.height,
				handles: options.handles,
				showStatus: options.showStatus
			},
			selectable: false,
			draggable: false,
			zIndex: options.zIndex ?? 10
		};
	}

	function makePort(id, type, side, offset = 50) {
		return { id, type, side, offset };
	}

	function spreadOffset(index, total, min = 20, max = 80) {
		if (total <= 1) return 50;
		return min + ((max - min) * index) / (total - 1);
	}

	function makeEdge(id, source, target, type = 'canbus', options = {}) {
		const cable = CABLES[type] || CABLES.canbus;

		return {
			id,
			source,
			target,
			sourceHandle: options.sourceHandle,
			targetHandle: options.targetHandle,
			type: options.edgeType || 'smoothstep',
			style: `stroke: ${cable.color}; stroke-width: ${options.width || cable.width};`,
			pathOptions: { borderRadius: 0 },
			selectable: false,
			animated: false,
			zIndex: 5
		};
	}

	function buildDiagramElements() {
		const hasWayjun = Boolean(wayjun);
		const engineSourceRows = hasWayjun ? normalizeComponentList(wayjun?.engines_rpm) : engines;
		const engineRows = engineSourceRows.length
			? engineSourceRows.slice(0, 6)
			: [
					{ name: 'ME PORT MPU/ECU', online: null },
					{ name: 'ME STBD MPU/ECU', online: null },
					{ name: 'AE PORT MPU/ECU', online: null },
					{ name: 'AE STBD MPU/ECU', online: null }
				];

		const aeRows = aeLoads.length ? aeLoads.slice(0, 2) : [];

		const fuelRows = fuelSources.length ? fuelSources.slice(0, 3) : [];
		const wheelhouseSectionWidth = 1010;
		const wheelhouseSectionHeight = 470;
		const mastSectionX = 1110;
		const mastSectionWidth = 500;
		const engineSectionY = 545;
		const engineSectionWidth = 1040;
		const eipX = hasWayjun ? 500 : 405;
		const eipY = hasWayjun ? 745 : 700;
		const eipHeight = hasWayjun ? 286 : 328;
		const engineNodeX = 95;
		const engineNodeStartY = 635;
		const engineNodeGap = 142;
		const sideNodeWidth = 164;
		const sideNodeHeight = 104;
		const engineGroupHeight = Math.max(430, engineRows.length * engineNodeGap + 92);
		const rightGroupX = 790;
		const rightNodeX = 835;
		const rightNodeWidth = 164;
		const rightNodeHeight = 106;
		const aeNodeStartY = 625;
		const aeNodeGap = 154;
		const fuelNodeStartY = aeRows.length ? 940 : 700;
		const fuelNodeGap = 154;
		const mcpToEipCables = ['power', 'ethernet', 'canbus'];
		const mcpBottomPorts = mcpToEipCables.map((name, index) =>
			makePort(`eip-${name}-out`, 'source', 'bottom', spreadOffset(index, mcpToEipCables.length, 38, 62))
		);
		const eipTopPorts = mcpToEipCables.map((name, index) =>
			makePort(`${name}-in`, 'target', 'top', spreadOffset(index, mcpToEipCables.length, 38, 62))
		);
		const engineTargetPorts = engineRows.map((_, index) =>
			makePort(`engine-${index}-in`, 'target', 'left', spreadOffset(index, engineRows.length, 18, 82))
		);
		const wayjunTargetPorts = engineRows.map((_, index) =>
			makePort(`engine-${index}-in`, 'target', 'left', spreadOffset(index, engineRows.length, 18, 82))
		);
		const aeSourcePorts = aeRows.map((_, index) =>
			makePort(`ae-${index}-out`, 'source', 'right', spreadOffset(index, Math.max(aeRows.length + fuelRows.length, 1), 20, 80))
		);
		const fuelSourcePorts = fuelRows.map((_, index) =>
			makePort(
				`fuel-${index}-out`,
				'source',
				'right',
				spreadOffset(aeRows.length + index, Math.max(aeRows.length + fuelRows.length, 1), 20, 80)
			)
		);
		const rightContentBottom = Math.max(
			aeRows.length ? aeNodeStartY + aeRows.length * aeNodeGap : 0,
			fuelRows.length ? fuelNodeStartY + fuelRows.length * fuelNodeGap : 0
		);
		const engineSectionHeight = Math.max(
			640,
			engineGroupHeight + 130,
			rightContentBottom - engineSectionY + 90,
			eipY + eipHeight - engineSectionY + 90
		);

		const nextNodes = [
			makeSection('wheelhouse-section', 'WHEELHOUSE', 20, 10, wheelhouseSectionWidth, wheelhouseSectionHeight),
			makeSection('mast-section', 'MAST LOCATION', mastSectionX, 10, mastSectionWidth, wheelhouseSectionHeight),
			makeSection('engine-section', 'ENGINE ROOM', 20, engineSectionY, engineSectionWidth, engineSectionHeight),

			makeSection('wheelhouse-system-group', 'VESSEL SYSTEM', 82, 70, 200, 370, {
				variant: 'group'
			}),
			makeSection('engine-system-group', 'VESSEL SYSTEM', 72, 600, 220, engineGroupHeight, {
				variant: 'group'
			}),
			...(aeRows.length
				? [
						makeSection('ae-system-group', 'VESSEL SYSTEM', rightGroupX, 590, 250, 330, {
							variant: 'group'
						})
					]
				: []),
			...(fuelRows.length
				? [
						makeSection(
							'fuel-system-group',
							'FUEL SYSTEM',
							rightGroupX,
							aeRows.length ? 915 : 650,
							250,
							Math.max(190, fuelRows.length * fuelNodeGap + 72),
							{ variant: 'group' }
						)
					]
				: []),

			makeNode('vessel-gps', 'VESSEL GPS', 116, 105, {
				online: mastGps?.online,
				icon: '/assets/gps.png',
				variant: 'sensor',
				width: 132,
				height: 82,
				handles: [makePort('out', 'source', 'right', 50)]
			}),
			makeNode('db-ac', 'DB-AC 220V', 116, 195, {
				online: null,
				variant: 'sensor',
				width: 132,
				height: 82,
				handles: [makePort('out', 'source', 'right', 50)]
			}),
			makeNode('wind-sensor', 'WIND SENSOR', 116, 285, {
				online: null,
				variant: 'sensor',
				width: 132,
				height: 82,
				handles: [makePort('out', 'source', 'right', 50)]
			}),
			makeNode('speed-doppler', 'SPEED\nDOPPLER', 116, 375, {
				online: null,
				variant: 'sensor',
				width: 132,
				height: 82,
				handles: [makePort('out', 'source', 'right', 50)]
			}),

			makeNode('mcp', mcp?.name || 'MCP', 395, 115, {
				online: mcp?.online,
				subtitle: 'Main Controller\nPanel (MCP)',
				meta: mcp?.uptime,
				logo: '/assets/SeMAR.png',
				variant: 'panel',
				width: 182,
				height: 236,
				handles: [
					makePort('gps-in', 'target', 'left', 18),
					makePort('power-in', 'target', 'left', 34),
					makePort('wind-in', 'target', 'left', 50),
					makePort('speed-in', 'target', 'left', 66),
					makePort('mast-out', 'source', 'right', 22),
					makePort('router-out', 'source', 'right', 50),
					...mcpBottomPorts
				]
			}),
			makeNode('router', router?.name || 'ROUTER', 755, 205, {
				online: router?.online,
				icon: '/assets/router.png',
				width: 146,
				height: 104,
				handles: [makePort('in', 'target', 'left', 50)]
			}),
			makeNode('mast-gps', mastGps?.name || 'GPS', 1280, 118, {
				online: mastGps?.online,
				icon: '/assets/gps.png',
				width: 148,
				height: 106,
				handles: [makePort('in', 'target', 'left', 50)]
			}),

			makeNode('eip', eip?.name || 'EIP', eipX, eipY, {
				online: eip?.online,
				subtitle: 'Engine Interface\nPanel (EIP)',
				logo: '/assets/SeMAR.png',
				variant: 'panel',
				width: 168,
				height: eipHeight,
				handles: [
					...eipTopPorts,
					...(hasWayjun ? [makePort('wayjun-in', 'target', 'left', 50)] : engineTargetPorts),
					...aeSourcePorts,
					...fuelSourcePorts
				]
			}),
			...(hasWayjun
				? [
						makeNode('wayjun', wayjun?.name || 'HIGH SPEED COUNTER', 315, 760, {
							online: wayjun?.online,
							subtitle: 'Wayjun\nCounter',
							icon: '/assets/engine.png',
							variant: 'device',
							width: 156,
							height: 138,
							handles: [...wayjunTargetPorts, makePort('eip-out', 'source', 'right', 50)]
						})
					]
				: [])
		];

		engineRows.forEach((engine, index) => {
			nextNodes.push(
				makeNode(`engine-${index}`, engine.name, engineNodeX, engineNodeStartY + index * engineNodeGap, {
					online: engine.online,
					icon: '/assets/engine.png',
					variant: 'sensor',
					width: sideNodeWidth,
					height: sideNodeHeight,
					handles: [makePort('out', 'source', 'right', 50)]
				})
			);
		});

		aeRows.forEach((load, index) => {
			nextNodes.push(
				makeNode(`ae-${index}`, load.name, rightNodeX, aeNodeStartY + index * aeNodeGap, {
					online: load.online,
					meta: load.value !== undefined ? displayValue(load.value) : undefined,
					icon: '/assets/kwh.png',
					width: rightNodeWidth,
					height: rightNodeHeight,
					handles: [makePort('in', 'target', 'left', 50)]
				})
			);
		});

		fuelRows.forEach((source, index) => {
			nextNodes.push(
				makeNode(`fuel-${index}`, source.name, rightNodeX, fuelNodeStartY + index * fuelNodeGap, {
					online: source.online,
					meta: source.source,
					icon: '/assets/flowmeter.png',
					width: rightNodeWidth,
					height: rightNodeHeight,
					handles: [makePort('in', 'target', 'left', 50)]
				})
			);
		});

		const nextEdges = [
			makeEdge('vessel-gps-to-mcp', 'vessel-gps', 'mcp', 'canbus', {
				sourceHandle: 'out',
				targetHandle: 'gps-in'
			}),
			makeEdge('db-to-mcp', 'db-ac', 'mcp', 'powerAc', {
				sourceHandle: 'out',
				targetHandle: 'power-in'
			}),
			makeEdge('wind-to-mcp', 'wind-sensor', 'mcp', 'canbus', {
				sourceHandle: 'out',
				targetHandle: 'wind-in'
			}),
			makeEdge('speed-to-mcp', 'speed-doppler', 'mcp', 'canbus', {
				sourceHandle: 'out',
				targetHandle: 'speed-in'
			}),
			makeEdge('mcp-to-router', 'mcp', 'router', 'ethernet', {
				sourceHandle: 'router-out',
				targetHandle: 'in'
			}),
			makeEdge('mcp-to-mast-gps', 'mcp', 'mast-gps', 'canbus', {
				sourceHandle: 'mast-out',
				targetHandle: 'in'
			}),
			makeEdge('mcp-power-to-eip', 'mcp', 'eip', 'powerDc', {
				sourceHandle: 'eip-power-out',
				targetHandle: 'power-in'
			}),
			makeEdge('mcp-ethernet-to-eip', 'mcp', 'eip', 'ethernet', {
				sourceHandle: 'eip-ethernet-out',
				targetHandle: 'ethernet-in'
			}),
			makeEdge('mcp-canbus-to-eip', 'mcp', 'eip', 'canbus', {
				sourceHandle: 'eip-canbus-out',
				targetHandle: 'canbus-in'
			})
		];

		engineRows.forEach((_, index) => {
			if (hasWayjun) {
				nextEdges.push(
					makeEdge(`engine-${index}-to-wayjun`, `engine-${index}`, 'wayjun', 'canbus', {
						sourceHandle: 'out',
						targetHandle: `engine-${index}-in`
					})
				);
			} else {
				nextEdges.push(
					makeEdge(`engine-${index}-to-eip`, `engine-${index}`, 'eip', 'canbus', {
						sourceHandle: 'out',
						targetHandle: `engine-${index}-in`
					})
				);
			}
		});

		if (hasWayjun) {
			nextEdges.push(
				makeEdge('wayjun-to-eip', 'wayjun', 'eip', 'canbus', {
					sourceHandle: 'eip-out',
					targetHandle: 'wayjun-in'
				})
			);
		}

		aeRows.forEach((_, index) => {
			nextEdges.push(
				makeEdge(`eip-to-ae-${index}`, 'eip', `ae-${index}`, 'canbus', {
					sourceHandle: `ae-${index}-out`,
					targetHandle: 'in'
				})
			);
		});

		fuelRows.forEach((_, index) => {
			nextEdges.push(
				makeEdge(`eip-to-fuel-${index}`, 'eip', `fuel-${index}`, 'canbus', {
					sourceHandle: `fuel-${index}-out`,
					targetHandle: 'in'
				})
			);
		});

		flowNodes = nextNodes;
		flowEdges = nextEdges;
	}

	async function requestDiagram(vesselId) {
		return apiRequest(`/single-line/vessels/${vesselId}`, { method: 'GET' });
	}

	async function loadDiagram(force = false) {
		const vesselId = getCurrentVesselId();

		if (!active) return;

		if (!vesselId) {
			diagramData = null;
			flowNodes = [];
			flowEdges = [];
			errorMessage = 'Please select a vessel first.';
			return;
		}

		const loadKey = String(vesselId);
		if (!force && lastLoadKey === loadKey && diagramData) return;

		loading = true;
		errorMessage = '';

		try {
			const response = await requestDiagram(vesselId);
			diagramData = normalizePayload(response);
			lastLoadKey = loadKey;
			await tick();
			buildDiagramElements();
		} catch (error) {
			errorMessage = error?.message || 'Failed to load single line diagram.';
			diagramData = null;
			flowNodes = [];
			flowEdges = [];
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (!active) return;

		const vesselId = getCurrentVesselId();
		if (!vesselId) return;

		loadDiagram();
	});

	onMount(() => {
		if (active) loadDiagram();
	});
</script>

<section class="single-line-page" aria-hidden={!active}>
	<div class="page-hero">
		<div>
			<span class="eyebrow">Single Line Diagram</span>
			<h1>{vesselName}</h1>
			<p>
				Live vessel system topology for MCP, Router, GPS, EIP, engine signals, fuel source, and
				auxiliary load monitoring.
			</p>
	</div>
	<div class="hero-status {overallOnline ? 'online' : 'offline'}">
		<span class="overall-label"><i></i> Overall status</span>
		<strong>{overallOnline ? 'Online' : 'Offline'}</strong>
		<small>{mcp?.uptime ? `MCP uptime: ${mcp.uptime}` : 'Realtime component state'}</small>
	</div>
	</div>

	{#if loading}
		<div class="loading-card">
			<LoadingSkeleton label="Loading single line diagram" variant="card" rows={6} />
		</div>
	{:else if errorMessage}
		<section class="empty-card">
			<span class="eyebrow">Unable to load</span>
			<h2>Single line diagram is not available</h2>
			<p>{errorMessage}</p>
			<button type="button" onclick={() => loadDiagram(true)}>Retry</button>
		</section>
	{:else}
		<div class="diagram-shell">
			<div class="flow-canvas" aria-label="Single line diagram flow">
				<button
					type="button"
					class="refresh-btn sld-floating-refresh"
					onclick={() => loadDiagram(true)}
					disabled={loading}
				>
					Refresh
				</button>
				<SvelteFlow
					id="single-line-diagram-flow"
					nodes={flowNodes}
					edges={flowEdges}
					{nodeTypes}
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
					<Controls />
				</SvelteFlow>
			</div>
		</div>
	{/if}
</section>

<style>
	.single-line-page {
		min-height: 100%;
		padding: 18px;
		overflow: auto;
		background: #0a0e1a;
		color: #f4f7fb;
	}

	.page-hero,
	.diagram-shell,
	.loading-card,
	.empty-card {
		border-radius: 12px;
		background: var(--color-surface);
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
	}

	.page-hero {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 16px;
		margin-bottom: 14px;
	}

	.eyebrow {
		display: inline-flex;
		width: fit-content;
		padding: 4px 9px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		color: #1d4ed8;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	h1,
	h2,
	p {
		margin: 0;
	}

	h1 {
		margin-top: 8px;
		font-size: 22px;
		line-height: 1.2;
		font-weight: 900;
		color: var(--text-primary);
	}

	p {
		margin-top: 7px;
		max-width: 780px;
		color: var(--text-secondary);
		font-size: 12px;
		line-height: 1.5;
		font-weight: 700;
	}

	.hero-status {
		display: grid;
		gap: 5px;
		min-width: 180px;
		padding: 10px 12px;
		border: 1px solid rgba(148, 163, 184, 0.22);
		background: rgba(30, 41, 59, 0.72);
		border-radius: 12px;
		text-align: right;
	}

	.hero-status.online {
		border-color: rgba(34, 197, 94, 0.42);
		background: rgba(22, 101, 52, 0.16);
	}

	.hero-status.offline {
		border-color: rgba(148, 163, 184, 0.26);
	}

	.hero-status span,
	.hero-status small {
		color: #9fb0c9;
		font-size: 11px;
		font-weight: 800;
	}

	.overall-label {
		display: inline-flex;
		align-items: center;
		justify-content: flex-end;
		gap: 7px;
	}

	.overall-label i {
		width: 9px;
		height: 9px;
		border-radius: 999px;
		background: #64748b;
		box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.14);
	}

	.hero-status.online .overall-label i {
		background: #22c55e;
		box-shadow:
			0 0 0 3px rgba(34, 197, 94, 0.18),
			0 0 16px rgba(34, 197, 94, 0.34);
	}

	.hero-status strong {
		font-size: 16px;
		line-height: 1.2;
		color: var(--text-primary);
	}

	.loading-card,
	.empty-card {
		padding: 22px;
	}

	.empty-card button,
	.refresh-btn {
		height: 40px;
		border: 0;
		padding: 0 18px;
		background: #2563eb;
		color: #fff;
		font-weight: 700;
		cursor: pointer;
	}

	.empty-card button {
		margin-top: 18px;
	}

	.refresh-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.diagram-shell {
		overflow: hidden;
	}

	.flow-canvas {
		position: relative;
		width: 100%;
		height: min(82vh, 980px);
		min-height: 760px;
		border: 1px solid rgba(148, 163, 184, 0.18);
		background:
			radial-gradient(circle at 18% 12%, rgba(37, 99, 235, 0.16), transparent 30%),
			linear-gradient(180deg, #0f172a 0%, #0b1220 100%);
		box-shadow: 0 22px 60px rgba(0, 0, 0, 0.35);
	}

	.sld-floating-refresh {
		position: absolute;
		top: 14px;
		right: 14px;
		z-index: 10;
		border-radius: 12px;
		box-shadow: 0 14px 30px rgba(0, 0, 0, 0.34);
	}

	:global(.single-line-page .svelte-flow) {
		background:
			radial-gradient(circle at 18% 12%, rgba(37, 99, 235, 0.16), transparent 30%),
			linear-gradient(180deg, #0f172a 0%, #0b1220 100%);
		--xy-background-color: #0f172a;
		--xy-edge-stroke-default: #04af55;
		--xy-edge-stroke-width-default: 4;
		--xy-node-border-default: 0;
		--xy-node-boxshadow-default: none;
	}

	:global(.single-line-page .svelte-flow__node) {
		border: 0 !important;
		background: transparent !important;
		box-shadow: none !important;
	}

	:global(.single-line-page .svelte-flow__node .sld-node .node-copy strong) {
		color: #0f172a !important;
	}

	:global(.single-line-page .svelte-flow__node .sld-node .node-copy span) {
		color: #334155 !important;
	}

	:global(.single-line-page .svelte-flow__node .sld-node .node-copy small) {
		color: #475569 !important;
	}

	:global(.single-line-page .svelte-flow__edge-path) {
		stroke-linecap: square;
		stroke-linejoin: miter;
	}

	:global(.single-line-page .svelte-flow__edge-text) {
		font-family: inherit;
	}

	:global(.single-line-page .svelte-flow__controls) {
		border-radius: 14px;
		overflow: hidden;
		box-shadow: 0 12px 30px rgba(0, 0, 0, 0.34);
	}

	:global(.single-line-page .svelte-flow__controls-button) {
		border-color: rgba(148, 163, 184, 0.22);
		background: rgba(15, 23, 42, 0.92);
		color: #f8fafc;
	}

	@media (max-width: 900px) {
		.single-line-page {
			padding: 12px;
		}

		.page-hero {
			display: grid;
			align-items: start;
		}

		.hero-status {
			text-align: left;
		}

		.diagram-shell {
			padding: 10px;
		}

		.flow-canvas {
			height: 76vh;
			min-height: 560px;
		}
	}
</style>
