<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SingleLineDiagramPage from './SingleLineDiagramPage.svelte';
	import SingleLineHero from './SingleLineHero.svelte';
	import SingleLineSkeleton from './SingleLineSkeleton.svelte';
	import SingleLineErrorCard from './SingleLineErrorCard.svelte';
	import SingleLineCanvas from './SingleLineCanvas.svelte';

	const demoNodes = [
		{
			id: 'wheelhouse-section',
			type: 'sldSection',
			position: { x: 0, y: 0 },
			data: { title: 'WHEELHOUSE', width: 640, height: 230 },
			selectable: false,
			draggable: false,
			zIndex: 0
		},
		{
			id: 'engine-section',
			type: 'sldSection',
			position: { x: 0, y: 260 },
			data: { title: 'ENGINE ROOM', width: 640, height: 210 },
			selectable: false,
			draggable: false,
			zIndex: 0
		},
		{
			id: 'mcp',
			type: 'sldNode',
			position: { x: 110, y: 60 },
			data: {
				label: 'MCP',
				subtitle: 'Main Controller\nPanel (MCP)',
				meta: 'Uptime 12d 04h',
				logo: '/assets/SeMAR.png',
				variant: 'panel',
				width: 182,
				height: 130,
				online: true,
				panelOpened: true,
				handles: [
					{ id: 'gps-in', type: 'target', side: 'left', offset: 30 },
					{ id: 'router-out', type: 'source', side: 'right', offset: 40 },
					{ id: 'engine-out', type: 'source', side: 'bottom', offset: 50 }
				]
			},
			selectable: false,
			draggable: false,
			zIndex: 10
		},
		{
			id: 'router',
			type: 'sldNode',
			position: { x: 430, y: 70 },
			data: {
				label: 'ROUTER',
				subtitle: 'RUT956',
				icon: '/assets/router.png',
				width: 146,
				height: 128,
				online: true,
				handles: [{ id: 'in', type: 'target', side: 'left', offset: 50 }]
			},
			selectable: false,
			draggable: false,
			zIndex: 10
		},
		{
			id: 'engine-0',
			type: 'sldNode',
			position: { x: 210, y: 310 },
			data: {
				label: 'ME PORT MPU/ECU',
				icon: '/assets/engine.png',
				variant: 'sensor',
				width: 164,
				height: 104,
				online: false,
				handles: [{ id: 'in', type: 'target', side: 'left', offset: 50 }]
			},
			selectable: false,
			draggable: false,
			zIndex: 10
		}
	];

	const demoEdges = [
		{
			id: 'mcp-to-router',
			source: 'mcp',
			target: 'router',
			sourceHandle: 'router-out',
			targetHandle: 'in',
			type: 'sldWire',
			style: 'stroke: #05aee8; stroke-width: 4;',
			pathOptions: { borderRadius: 0, offset: 44 },
			selectable: false,
			animated: false,
			zIndex: 5
		},
		{
			id: 'mcp-to-engine',
			source: 'mcp',
			target: 'engine-0',
			sourceHandle: 'engine-out',
			targetHandle: 'in',
			type: 'sldWire',
			style: 'stroke: #04af55; stroke-width: 4;',
			pathOptions: { borderRadius: 0, offset: 42 },
			selectable: false,
			animated: false,
			zIndex: 5
		}
	];

	const { Story } = defineMeta({
		title: 'Pages/Vessel/SingleLineDiagramPage',
		component: SingleLineDiagramPage,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Diagram single line vessel: visualisasi perangkat, panel, sensor, dan kabel menggunakan SvelteFlow. Halaman memuat data diagram dari API; section di bawah dirender dengan data dummy.'
				}
			}
		},
		argTypes: {
			active: { control: 'boolean', description: 'Mengaktifkan pemuatan data diagram.' }
		}
	});
</script>

<Story name="Default" args={{ active: false }} />

<Story
	name="Hero"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Header halaman dengan nama vessel dan ringkasan status keseluruhan.'
			}
		}
	}}
>
	<div class="single-line-page" style="min-height: 100vh;">
		<SingleLineHero vesselName="MV Nusantara Jaya" overallOnline uptime="12d 04h 18m" />
	</div>
</Story>

<Story
	name="Hero Offline"
	asChild
	parameters={{
		docs: {
			description: { story: 'Header saat MCP vessel sedang offline.' }
		}
	}}
>
	<div class="single-line-page" style="min-height: 100vh;">
		<SingleLineHero vesselName="MT Samudra Biru" overallOnline={false} />
	</div>
</Story>

<Story
	name="Skeleton"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Placeholder canvas saat diagram sedang dimuat.'
			}
		}
	}}
>
	<div class="single-line-page" style="height: 600px;">
		<SingleLineSkeleton />
	</div>
</Story>

<Story
	name="Error"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Kartu kegagalan pemuatan dengan tombol retry.'
			}
		}
	}}
>
	<div class="single-line-page" style="min-height: 100vh;">
		<SingleLineErrorCard message="Request failed with status 500" />
	</div>
</Story>

<Story
	name="Canvas"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Canvas SvelteFlow dengan contoh node section, panel, router, engine, dan kabel CAN/ethernet.'
			}
		}
	}}
>
	<div class="single-line-page" style="height: 640px;">
		<SingleLineCanvas nodes={demoNodes} edges={demoEdges} fullscreen={false} />
	</div>
</Story>
