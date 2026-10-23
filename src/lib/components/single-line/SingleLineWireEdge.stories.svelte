<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SingleLineWireEdge from './SingleLineWireEdge.svelte';

	const { Story } = defineMeta({
		title: 'Single Line/Wire Edge',
		component: SingleLineWireEdge,
		parameters: {
			docs: {
				description: {
					component:
						'Path edge kabel diagram single line dengan belokan ortogonal. Dapat dirender langsung di dalam SVG atau sebagai edge type SvelteFlow.'
				}
			}
		},
		argTypes: {
			sourceX: { control: 'number' },
			sourceY: { control: 'number' },
			targetX: { control: 'number' },
			targetY: { control: 'number' },
			sourcePosition: { control: 'inline-radio', options: ['top', 'bottom', 'left', 'right'] },
			targetPosition: { control: 'inline-radio', options: ['top', 'bottom', 'left', 'right'] },
			interactionWidth: { control: 'number' },
			style: { control: 'text' },
			pathOptions: { control: 'object' }
		}
	});
</script>

<Story name="Horizontal" asChild>
	<svg width="440" height="200" style="background: #0b1220;">
		<SingleLineWireEdge
			id="wire-horizontal"
			sourceX={40}
			sourceY={100}
			targetX={400}
			targetY={100}
			sourcePosition="right"
			targetPosition="left"
			style={undefined}
			markerStart={undefined}
			markerEnd={undefined}
		/>
	</svg>
</Story>

<Story name="Vertical" asChild>
	<svg width="440" height="240" style="background: #0b1220;">
		<SingleLineWireEdge
			id="wire-vertical"
			sourceX={220}
			sourceY={30}
			targetX={220}
			targetY={210}
			sourcePosition="bottom"
			targetPosition="top"
			style={undefined}
			markerStart={undefined}
			markerEnd={undefined}
		/>
	</svg>
</Story>

<Story name="Diagonal" asChild>
	<svg width="440" height="240" style="background: #0b1220;">
		<SingleLineWireEdge
			id="wire-diagonal"
			sourceX={40}
			sourceY={40}
			targetX={400}
			targetY={200}
			sourcePosition="right"
			targetPosition="left"
			style="stroke: #7dd3fc; stroke-width: 2;"
			markerStart={undefined}
			markerEnd={undefined}
		/>
	</svg>
</Story>
