<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SingleLineNode from './SingleLineNode.svelte';

	const { Story } = defineMeta({
		title: 'Single Line/Node',
		component: SingleLineNode,
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Node komponen diagram single line (device, sensor, panel, group). Harus dirender sebagai node type di dalam SvelteFlow.'
				}
			}
		},
		argTypes: {
			data: {
				control: 'object',
				description:
					'Data node: label, subtitle, meta, variant (device|sensor|panel|group), online, showStatus, width, height, icon, logo, panelOpened, handles.'
			}
		}
	});
</script>

<script>
	import { SvelteFlow } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';

	const nodeTypes = { sld: SingleLineNode };
	const nodes = [
		{
			id: 'device',
			type: 'sld',
			position: { x: 40, y: 40 },
			data: {
				variant: 'device',
				label: 'Main Engine',
				subtitle: 'ME #1',
				meta: '1450 RPM',
				online: true,
				width: 200,
				height: 84
			}
		},
		{
			id: 'sensor',
			type: 'sld',
			position: { x: 300, y: 40 },
			data: {
				variant: 'sensor',
				label: 'Flow Meter',
				subtitle: 'Fuel line',
				online: false,
				width: 200,
				height: 84
			}
		},
		{
			id: 'panel',
			type: 'sld',
			position: { x: 40, y: 220 },
			data: {
				variant: 'panel',
				label: 'Main Switchboard',
				subtitle: 'MSB',
				panelOpened: false,
				width: 200,
				height: 84
			}
		},
		{
			id: 'group',
			type: 'sld',
			position: { x: 300, y: 220 },
			data: {
				variant: 'group',
				label: 'Auxiliary',
				subtitle: 'Group',
				showStatus: false,
				width: 200,
				height: 84
			}
		}
	];
</script>

<Story name="Variants" asChild>
	<div style="height: 400px; width: 100%;">
		<SvelteFlow {nodes} {nodeTypes} fitView />
	</div>
</Story>

<Story name="Device online" asChild>
	<div style="height: 320px; width: 100%;">
		<SvelteFlow
			nodes={[
				{
					id: 'device',
					type: 'sld',
					position: { x: 80, y: 60 },
					data: {
						variant: 'device',
						label: 'Main Engine',
						subtitle: 'ME #1',
						meta: '1450 RPM',
						online: true,
						width: 220,
						height: 90
					}
				}
			]}
			{nodeTypes}
			fitView
		/>
	</div>
</Story>
