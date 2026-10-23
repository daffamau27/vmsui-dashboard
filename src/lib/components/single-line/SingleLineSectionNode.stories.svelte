<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SingleLineSectionNode from './SingleLineSectionNode.svelte';

	const { Story } = defineMeta({
		title: 'Single Line/Section Node',
		component: SingleLineSectionNode,
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Kotak seksi pada diagram single line (judul + subjudul). Harus dirender sebagai node type di dalam SvelteFlow.'
				}
			}
		},
		argTypes: {
			data: {
				control: 'object',
				description: 'Data seksi: title, subtitle, width, height, variant (main).'
			}
		}
	});
</script>

<script>
	import { SvelteFlow } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';

	const nodeTypes = { section: SingleLineSectionNode };
	const nodes = [
		{
			id: 'section',
			type: 'section',
			position: { x: 40, y: 40 },
			data: { title: 'Engine Room', subtitle: 'Deck 2', width: 420, height: 260 }
		}
	];
</script>

<Story name="Default" asChild>
	<div style="height: 380px; width: 100%;">
		<SvelteFlow {nodes} {nodeTypes} fitView />
	</div>
</Story>

<Story name="Without subtitle" asChild>
	<div style="height: 380px; width: 100%;">
		<SvelteFlow
			nodes={[
				{
					id: 'section',
					type: 'section',
					position: { x: 40, y: 40 },
					data: { title: 'Deck Area', width: 360, height: 220 }
				}
			]}
			{nodeTypes}
			fitView
		/>
	</div>
</Story>
