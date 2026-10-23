<script>
	import { onMount, tick } from 'svelte';
	import { apiRequest } from '$lib/api/authApi.js';
	import { selectedVesselId, selectedVesselInfo } from '$lib/stores/selectedVessel.svelte.js';
	import SingleLineHero from './SingleLineHero.svelte';
	import SingleLineSkeleton from './SingleLineSkeleton.svelte';
	import SingleLineErrorCard from './SingleLineErrorCard.svelte';
	import SingleLineCanvas from './SingleLineCanvas.svelte';
	import './single-line-page.css';

	let { active = true } = $props();

	let loading = $state(false);
	let errorMessage = $state('');
	let diagramData = $state(null);
	let lastLoadKey = $state('');
	let flowNodes = $state([]);
	let flowEdges = $state([]);
	let diagramFullscreen = $state(false);
	let diagramShellElement = $state(null);

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
	let eip = $derived(mcp?.eip || null);
	let ei = $derived(normalizeEi(eip?.ei));
	let router = $derived(mcp?.router || {});
	let routerType = $derived(typeof router?.type === 'string' ? router.type.trim() || '-' : '-');
	let semarGps = $derived(mcp?.gps_semar || {});
	let vesselGps = $derived(mcp?.gps_vessel || {});
	let dbAc220v = $derived(mcp?.db_ac_220v || mcp?.dbAc220v || {});
	let hasEip = $derived(Boolean(eip));
	let hasWayjunFuelSource = $derived(
		hasFuelSourceForWayjun(eip?.wayjun?.fuel_source) ||
			hasFuelSourceForWayjun(eip?.ei?.fuel_source) ||
			hasFuelSourceForWayjun(eip?.fuel_source) ||
			hasFuelSourceForWayjun(mcp?.fuel_source)
	);
	let wayjun = $derived(
		normalizeWayjun(eip?.wayjun || mcp?.wayjun) ||
			(hasWayjunFuelSource ? { name: 'HIGH SPEED COUNTER' } : null)
	);
	let hasEi = $derived(Boolean(ei));
	let hasWayjun = $derived(Boolean(wayjun));
	let legacyEipProcessor = $derived(
		Boolean(eip && !hasEi && !hasWayjun && (eip?.engines_rpm || eip?.fuel_source || eip?.ae_load))
	);
	let engines = $derived([
		...withProcessor(wayjun?.engines_rpm, 'wayjun'),
		...withProcessor(ei?.engines_rpm, 'ei'),
		...(legacyEipProcessor ? withProcessor(eip?.engines_rpm, 'eip') : [])
	]);
	let aeLoads = $derived([
		...withProcessor(ei?.ae_load, 'ei'),
		...(legacyEipProcessor ? withProcessor(eip?.ae_load, 'eip') : []),
		...(!hasEip ? withProcessor(mcp?.ae_load, 'mcp') : [])
	]);
	let fuelSources = $derived([
		...normalizeFuelSources(ei?.fuel_source, 'ei'),
		...normalizeFuelSources(wayjun?.fuel_source, 'wayjun'),
		...normalizeFuelSources(eip?.fuel_source, 'eip'),
		...normalizeFuelSources(mcp?.fuel_source, 'mcp')
	]);

	let overallOnline = $derived(mcp?.online === true);

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

	function normalizeEi(rawEi) {
		if (!rawEi || typeof rawEi !== 'object') return null;
		return rawEi;
	}

	function normalizeWayjun(rawWayjun) {
		if (!rawWayjun || typeof rawWayjun !== 'object') return null;
		return rawWayjun;
	}

	function isMcpFuelSource(sourceLabel) {
		return ['FM', 'FMS', 'FOD'].includes(String(sourceLabel || '').toUpperCase());
	}

	function hasFuelSourceForWayjun(rawFuelSource = {}) {
		if (!rawFuelSource || typeof rawFuelSource !== 'object') return false;
		return Object.entries(rawFuelSource).some(([source, rows]) => {
			const items = Array.isArray(rows) ? rows : rows ? [rows] : [];
			const sourceLabel = source.toUpperCase();
			return sourceLabel !== 'ECU' && !isMcpFuelSource(sourceLabel) && items.length > 0;
		});
	}

	function withProcessor(rows, processor) {
		return normalizeComponentList(rows).map((row) => ({
			...row,
			processor
		}));
	}

	function normalizeFuelSources(rawFuelSource = {}, processor = 'eip') {
		if (!rawFuelSource || typeof rawFuelSource !== 'object') return [];

		return Object.entries(rawFuelSource)
			.flatMap(([source, rows]) => {
				const items = Array.isArray(rows) ? rows : rows ? [rows] : [];
				const sourceLabel = source.toUpperCase();
				if (sourceLabel === 'ECU' && processor !== 'ei') return [];

				const routedProcessor = isMcpFuelSource(sourceLabel)
					? 'mcp'
					: sourceLabel === 'ECU'
						? processor
						: 'wayjun';

				return items.map((item) => ({
					...item,
					source: sourceLabel,
					name: item?.name || `${sourceLabel} SOURCE`,
					processor: routedProcessor
				}));
			})
			.filter(Boolean);
	}

	function displayValue(value, suffix = '') {
		if (value === null || value === undefined || value === '') return '-';
		return `${value}${suffix}`;
	}

	function resolveEipOnlineStatus() {
		if (typeof eip?.online === 'boolean') return eip.online;
		if (hasEi || hasWayjun) {
			return [ei?.online, wayjun?.online].some((value) => value === true);
		}
		return undefined;
	}

	function normalizeBoolean(value) {
		if (typeof value === 'boolean') return value;
		if (typeof value === 'number') return value === 1;
		if (typeof value === 'string') {
			const normalized = value.trim().toLowerCase();
			if (['true', 'open', 'opened', '1', 'yes'].includes(normalized)) return true;
			if (['false', 'closed', 'close', '0', 'no'].includes(normalized)) return false;
		}
		return undefined;
	}

	function resolvePanelOpened(panel = {}) {
		return normalizeBoolean(
			panel?.panel_opened ??
				panel?.panelOpened ??
				panel?.is_panel_opened ??
				panel?.isPanelOpened ??
				panel?.panel_status ??
				panel?.panelStatus
		);
	}

	function formatPanelMeta(panel = {}) {
		const rows = [];
		if (panel?.uptime) rows.push(panel.uptime);
		return rows.join('\n');
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
				showStatus: options.showStatus,
				panelOpened: options.panelOpened
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

	function laneOffset(index, total, base = 34, step = 26) {
		if (total <= 1) return base;
		return base + index * step;
	}

	function sectionNodeBendOffset(index, total, base = 42, step = 32) {
		return laneOffset(index, total, base, step);
	}

	function makeEdge(id, source, target, type = 'canbus', options = {}) {
		const cable = CABLES[type] || CABLES.canbus;
		const pathOptions = { borderRadius: 0 };
		if (Number.isFinite(Number(options.pathOffset))) {
			pathOptions.offset = Number(options.pathOffset);
		}

		return {
			id,
			source,
			target,
			sourceHandle: options.sourceHandle,
			targetHandle: options.targetHandle,
			type: options.edgeType || 'sldWire',
			style: `stroke: ${cable.color}; stroke-width: ${options.width || cable.width};`,
			pathOptions,
			selectable: false,
			animated: false,
			zIndex: 5
		};
	}

	function buildDiagramElements() {
		const mcpProcessorTargetId = hasEip ? 'eip' : hasWayjun ? 'wayjun' : null;
		const defaultEngineProcessorId = hasWayjun ? 'wayjun' : hasEi ? 'ei' : hasEip ? 'eip' : null;
		const engineRows = engines.length
			? engines.slice(0, 6)
			: [
					{ name: 'ME PORT MPU/ECU', online: null, processor: defaultEngineProcessorId },
					{ name: 'ME STBD MPU/ECU', online: null, processor: defaultEngineProcessorId },
					{ name: 'AE PORT MPU/ECU', online: null, processor: defaultEngineProcessorId },
					{ name: 'AE STBD MPU/ECU', online: null, processor: defaultEngineProcessorId }
				];

		const aeRows = aeLoads.length ? aeLoads.slice(0, 2) : [];

		const fuelRows = fuelSources.length ? fuelSources.slice(0, 10) : [];
		function resolveOutputProcessor(row) {
			return row?.processor || (hasEip ? 'eip' : 'mcp');
		}

		const outputRows = [...aeRows, ...fuelRows];
		const wayjunInputCount = engineRows.filter((engine) => engine?.processor === 'wayjun').length;
		const eiInputCount = engineRows.filter((engine) => engine?.processor === 'ei').length;
		const eipInputCount = engineRows.filter((engine) => engine?.processor === 'eip').length;
		const wayjunOutputCount = outputRows.filter(
			(row) => resolveOutputProcessor(row) === 'wayjun'
		).length;
		const eiOutputCount = outputRows.filter((row) => resolveOutputProcessor(row) === 'ei').length;
		const eipOutputCount = outputRows.filter((row) => resolveOutputProcessor(row) === 'eip').length;
		const wheelhouseSectionWidth = 1010;
		const wheelhouseSectionHeight = 470;
		const mastSectionX = 1110;
		const mastSectionWidth = 500;
		const engineSectionY = 545;
		const engineSectionWidth = 1040;
		const eipHasModules = hasEi || hasWayjun;
		const eipX = eipHasModules ? 360 : 405;
		const eipY = 690;
		const eipWidth = eipHasModules ? 330 : 168;
		const moduleNodeX = eipX + 70;
		const wayjunPortDemand = Math.max(wayjunInputCount, wayjunOutputCount, 1);
		const eiPortDemand = Math.max(eiInputCount, eiOutputCount, 1);
		const eipPortDemand = Math.max(eipInputCount, eipOutputCount, 1);
		const wayjunHeight = hasEip
			? Math.max(144, 76 + wayjunPortDemand * 28)
			: Math.max(180, 82 + wayjunPortDemand * 30);
		const eiHeight = hasEip
			? Math.max(144, 76 + eiPortDemand * 28)
			: Math.max(180, 82 + eiPortDemand * 30);
		const legacyEipHeight = Math.max(328, 104 + eipPortDemand * 30);
		const moduleGap = 62;
		const firstModuleY = eipY + 122;
		const moduleNodeGap = wayjunHeight + moduleGap;
		const eipHeight = eipHasModules
			? Math.max(
					320,
					firstModuleY -
						eipY +
						(hasWayjun ? wayjunHeight : 0) +
						(hasEi ? eiHeight : 0) +
						(hasWayjun && hasEi ? moduleGap : 0) +
						52
				)
			: legacyEipHeight;
		const wayjunX = hasEip ? moduleNodeX : 405;
		const wayjunY = hasEip ? firstModuleY : 720;
		const wayjunWidth = hasEip ? 190 : 188;
		const eiX = hasEip ? moduleNodeX : 405;
		const eiY = hasEip ? firstModuleY + (hasWayjun ? moduleNodeGap : 0) : hasWayjun ? 1000 : 760;
		const eiWidth = hasEip ? 190 : 188;
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
		const mcpToProcessorCables = mcpProcessorTargetId
			? hasEip
				? ['power', 'ethernet', 'canbus']
				: ['canbus']
			: [];
		const mcpBottomPorts = mcpToProcessorCables.map((name, index) =>
			makePort(
				`${mcpProcessorTargetId}-${name}-out`,
				'source',
				'bottom',
				spreadOffset(index, mcpToProcessorCables.length, 38, 62)
			)
		);
		const processorTopPorts = mcpToProcessorCables.map((name, index) =>
			makePort(
				`${name}-in`,
				'target',
				'top',
				spreadOffset(index, mcpToProcessorCables.length, 38, 62)
			)
		);
		function enginePortsForProcessor(processor) {
			const processorRows = engineRows
				.map((engine, index) => ({ engine, index }))
				.filter((entry) => entry.engine?.processor === processor);

			return processorRows.map((entry, localIndex) =>
				makePort(
					`engine-${entry.index}-in`,
					'target',
					'left',
					spreadOffset(localIndex, processorRows.length, 16, 84)
				)
			);
		}

		const eipLegacyEngineTargetPorts = legacyEipProcessor ? enginePortsForProcessor('eip') : [];
		const wayjunEngineTargetPorts = enginePortsForProcessor('wayjun');
		const eiEngineTargetPorts = enginePortsForProcessor('ei');

		const outgoingConnections = [
			...aeRows.map((row, index) => ({
				processor: resolveOutputProcessor(row),
				handleId: `ae-${index}-out`
			})),
			...fuelRows.map((row, index) => ({
				processor: resolveOutputProcessor(row),
				handleId: `fuel-${index}-out`
			}))
		];

		function outputPortsForProcessor(processor) {
			const rows = outgoingConnections.filter((entry) => entry.processor === processor);

			return rows.map((entry, localIndex) =>
				makePort(entry.handleId, 'source', 'right', spreadOffset(localIndex, rows.length, 18, 82))
			);
		}

		function sourcePortsFromHandles(handles, min = 22, max = 82) {
			return handles.map((entry, localIndex) =>
				makePort(
					entry.handleId,
					'source',
					'right',
					spreadOffset(localIndex, handles.length, min, max)
				)
			);
		}

		const eipOutputPorts = outputPortsForProcessor('eip');
		const wayjunOutputPorts = outputPortsForProcessor('wayjun');
		const eiOutputPorts = outputPortsForProcessor('ei');
		const mcpDirectOutputConnections = outgoingConnections.filter(
			(entry) => entry.processor === 'mcp'
		);
		const mcpRightHandleEntries = [
			{ handleId: 'mast-out' },
			{ handleId: 'router-out' },
			...mcpDirectOutputConnections
		];
		const mcpRightOutputPorts = sourcePortsFromHandles(mcpRightHandleEntries, 22, 84);
		function getMcpRightBendOffset(handleId) {
			const handleIndex = Math.max(
				0,
				mcpRightHandleEntries.findIndex((entry) => entry.handleId === handleId)
			);
			return sectionNodeBendOffset(handleIndex, mcpRightHandleEntries.length, 44, 34);
		}
		const rightContentBottom = Math.max(
			aeRows.length ? aeNodeStartY + aeRows.length * aeNodeGap : 0,
			fuelRows.length ? fuelNodeStartY + fuelRows.length * fuelNodeGap : 0
		);
		const engineSectionHeight = Math.max(
			640,
			engineGroupHeight + 130,
			rightContentBottom - engineSectionY + 90,
			...(hasEip ? [eipY + eipHeight - engineSectionY + 90] : []),
			...(hasWayjun ? [wayjunY + wayjunHeight - engineSectionY + 90] : []),
			...(hasEi ? [eiY + eiHeight - engineSectionY + 90] : [])
		);

		const nextNodes = [
			makeSection(
				'wheelhouse-section',
				'WHEELHOUSE',
				20,
				10,
				wheelhouseSectionWidth,
				wheelhouseSectionHeight
			),
			makeSection(
				'mast-section',
				'MAST LOCATION',
				mastSectionX,
				10,
				mastSectionWidth,
				wheelhouseSectionHeight
			),
			makeSection(
				'engine-section',
				'ENGINE ROOM',
				20,
				engineSectionY,
				engineSectionWidth,
				engineSectionHeight
			),

			makeSection('wheelhouse-system-group', 'VESSEL SYSTEM', 82, 70, 200, 205, {
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

			makeNode('vessel-gps', vesselGps?.name || 'GPS Vessel', 116, 105, {
				online: vesselGps?.online,
				icon: '/assets/gps.png',
				variant: 'sensor',
				width: 132,
				height: 82,
				handles: [makePort('out', 'source', 'right', 50)]
			}),
			makeNode('db-ac', dbAc220v?.name || 'DB-AC 220V', 116, 195, {
				online: dbAc220v?.online,
				variant: 'sensor',
				width: 132,
				height: 82,
				handles: [makePort('out', 'source', 'right', 50)]
			}),

			makeNode('mcp', mcp?.name || 'MCP', 395, 115, {
				online: mcp?.online,
				subtitle: 'Main Controller\nPanel (MCP)',
				meta: formatPanelMeta(mcp),
				logo: '/assets/SeMAR.png',
				variant: 'panel',
				width: 182,
				height: 236,
				panelOpened: resolvePanelOpened(mcp),
				handles: [
					makePort('gps-in', 'target', 'left', 24),
					makePort('power-in', 'target', 'left', 42),
					...mcpRightOutputPorts,
					...mcpBottomPorts
				]
			}),
			makeNode('router', router?.name || 'ROUTER', 755, 205, {
				online: router?.online,
				subtitle: routerType,
				icon: '/assets/router.png',
				width: 146,
				height: 128,
				handles: [makePort('in', 'target', 'left', 50)]
			}),
			makeNode('mast-gps', semarGps?.name || 'GPS Semar', 1280, 118, {
				online: semarGps?.online,
				logo: '/assets/SeMAR.png',
				subtitle: semarGps?.name || 'GPS Semar',
				width: 148,
				height: 106,
				handles: [makePort('in', 'target', 'left', 50)]
			}),

			...(hasEip
				? [
						makeNode('eip', eipHasModules ? 'IP PANEL' : 'IP', eipX, eipY, {
							online: resolveEipOnlineStatus(),
							subtitle: eipHasModules ? 'Interface Panel' : 'Interface\nPanel (IP)',
							logo: eipHasModules ? undefined : '/assets/SeMAR.png',
							variant: eipHasModules ? 'ip-panel' : 'panel',
							meta: hasEip ? formatPanelMeta(eip) : undefined,
							panelOpened: hasEip ? resolvePanelOpened(eip) : undefined,
							width: eipWidth,
							height: eipHeight,
							zIndex: eipHasModules ? 1 : 10,
							handles: [...processorTopPorts, ...eipLegacyEngineTargetPorts, ...eipOutputPorts]
						})
					]
				: []),
			...(hasWayjun
				? [
						makeNode('wayjun', wayjun?.name || 'HIGH SPEED COUNTER', wayjunX, wayjunY, {
							online: wayjun?.online,
							subtitle: 'High Speed\nCounter',
							icon: '/assets/engine.png',
							variant: 'device',
							width: wayjunWidth,
							height: wayjunHeight,
							handles: [
								...(hasEip ? [] : processorTopPorts),
								...wayjunEngineTargetPorts,
								...wayjunOutputPorts
							]
						})
					]
				: []),
			...(hasEi
				? [
						makeNode('ei', ei?.name || 'EI', eiX, eiY, {
							online: ei?.online,
							subtitle: 'Engine\nInterface',
							icon: '/assets/engine.png',
							variant: 'device',
							width: eiWidth,
							height: eiHeight,
							handles: [...eiEngineTargetPorts, ...eiOutputPorts]
						})
					]
				: [])
		];

		engineRows.forEach((engine, index) => {
			nextNodes.push(
				makeNode(
					`engine-${index}`,
					engine.name,
					engineNodeX,
					engineNodeStartY + index * engineNodeGap,
					{
						online: engine.online,
						icon: '/assets/engine.png',
						variant: 'sensor',
						width: sideNodeWidth,
						height: sideNodeHeight,
						handles: [makePort('out', 'source', 'right', 50)]
					}
				)
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
				targetHandle: 'gps-in',
				pathOffset: sectionNodeBendOffset(0, 2, 42, 34)
			}),
			makeEdge('db-to-mcp', 'db-ac', 'mcp', 'powerAc', {
				sourceHandle: 'out',
				targetHandle: 'power-in',
				pathOffset: sectionNodeBendOffset(1, 2, 42, 34)
			}),
			makeEdge('mcp-to-router', 'mcp', 'router', 'ethernet', {
				sourceHandle: 'router-out',
				targetHandle: 'in',
				pathOffset: getMcpRightBendOffset('router-out')
			}),
			makeEdge('mcp-to-mast-gps', 'mcp', 'mast-gps', 'canbus', {
				sourceHandle: 'mast-out',
				targetHandle: 'in',
				pathOffset: getMcpRightBendOffset('mast-out')
			}),
			...mcpToProcessorCables.map((name, index) =>
				makeEdge(
					`mcp-${name}-to-${mcpProcessorTargetId}`,
					'mcp',
					mcpProcessorTargetId,
					name === 'power' ? 'powerDc' : name,
					{
						sourceHandle: `${mcpProcessorTargetId}-${name}-out`,
						targetHandle: `${name}-in`,
						pathOffset: laneOffset(index, mcpToProcessorCables.length, 32, 24)
					}
				)
			)
		];

		engineRows.forEach((engine, index) => {
			const targetProcessor = engine?.processor || defaultEngineProcessorId;
			if (targetProcessor) {
				nextEdges.push(
					makeEdge(
						`engine-${index}-to-${targetProcessor}`,
						`engine-${index}`,
						targetProcessor,
						'canbus',
						{
							sourceHandle: 'out',
							targetHandle: `engine-${index}-in`,
							pathOffset: sectionNodeBendOffset(index, engineRows.length, 46, 32)
						}
					)
				);
			}
		});

		const outputEdgeLaneCounters = {};
		function getOutputLane(sourceNode) {
			const sourceTotal = [...aeRows, ...fuelRows].filter(
				(row) => resolveOutputProcessor(row) === sourceNode
			).length;
			const sourceLane = outputEdgeLaneCounters[sourceNode] || 0;
			outputEdgeLaneCounters[sourceNode] = sourceLane + 1;
			return laneOffset(sourceLane, sourceTotal, 38, 30);
		}

		aeRows.forEach((load, index) => {
			const sourceNode = resolveOutputProcessor(load);
			const sourceHandle = `ae-${index}-out`;
			nextEdges.push(
				makeEdge(`${sourceNode}-to-ae-${index}`, sourceNode, `ae-${index}`, 'canbus', {
					sourceHandle,
					targetHandle: 'in',
					pathOffset:
						sourceNode === 'mcp' ? getMcpRightBendOffset(sourceHandle) : getOutputLane(sourceNode)
				})
			);
		});

		fuelRows.forEach((source, index) => {
			const sourceNode = resolveOutputProcessor(source);
			const sourceHandle = `fuel-${index}-out`;
			nextEdges.push(
				makeEdge(`${sourceNode}-to-fuel-${index}`, sourceNode, `fuel-${index}`, 'canbus', {
					sourceHandle,
					targetHandle: 'in',
					pathOffset:
						sourceNode === 'mcp' ? getMcpRightBendOffset(sourceHandle) : getOutputLane(sourceNode)
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

	async function openDiagramFullscreen() {
		diagramFullscreen = true;
		await tick();
		try {
			if (
				typeof document !== 'undefined' &&
				diagramShellElement?.requestFullscreen &&
				document.fullscreenElement !== diagramShellElement
			) {
				await diagramShellElement.requestFullscreen();
			}
		} catch {
			// Keep the in-app fullscreen overlay when the browser fullscreen request is unavailable.
		}
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new Event('resize'));
		}
	}

	async function closeDiagramFullscreen() {
		diagramFullscreen = false;
		try {
			if (
				typeof document !== 'undefined' &&
				document.fullscreenElement === diagramShellElement &&
				document.exitFullscreen
			) {
				await document.exitFullscreen();
			}
		} catch {
			// The overlay state is already closed; browser fullscreen cleanup is best-effort.
		}
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new Event('resize'));
		}
	}

	function toggleDiagramFullscreen() {
		if (diagramFullscreen) {
			closeDiagramFullscreen();
		} else {
			openDiagramFullscreen();
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

		function handleEscape(event) {
			if (event.key === 'Escape') {
				diagramFullscreen = false;
			}
		}

		function handleFullscreenChange() {
			if (document.fullscreenElement !== diagramShellElement) {
				diagramFullscreen = false;
			}
		}

		window.addEventListener('keydown', handleEscape);
		document.addEventListener('fullscreenchange', handleFullscreenChange);

		return () => {
			window.removeEventListener('keydown', handleEscape);
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
		};
	});
</script>

<section class="single-line-page" aria-hidden={!active}>
	<SingleLineHero {vesselName} {overallOnline} uptime={mcp?.uptime} />

	{#if loading}
		<SingleLineSkeleton />
	{:else if errorMessage}
		<SingleLineErrorCard message={errorMessage} onRetry={() => loadDiagram(true)} />
	{:else}
		<SingleLineCanvas
			nodes={flowNodes}
			edges={flowEdges}
			fullscreen={diagramFullscreen}
			onToggleFullscreen={toggleDiagramFullscreen}
			onRefresh={() => loadDiagram(true)}
			bind:shellElement={diagramShellElement}
		/>
	{/if}
</section>
