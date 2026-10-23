<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SingleLineFlowControls from './SingleLineFlowControls.svelte';

	const { Story } = defineMeta({
		title: 'Single Line/Flow Controls',
		component: SingleLineFlowControls,
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Kontrol zoom, fit view, dan fullscreen untuk diagram single line. Harus dirender di dalam SvelteFlow.'
				}
			}
		},
		argTypes: {
			fullscreen: { control: 'boolean' },
			onToggleFullscreen: { control: false }
		},
		args: {
			fullscreen: false,
			onToggleFullscreen: () => {}
		}
	});
</script>

<script>
	import { SvelteFlow } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';

	const nodes = [
		{ id: 'n1', position: { x: 80, y: 80 }, data: { label: 'Diagram' } },
		{ id: 'n2', position: { x: 320, y: 200 }, data: { label: 'Node' } }
	];
	const edges = [{ id: 'e1', source: 'n1', target: 'n2' }];
</script>

<Story name="Default" asChild>
	<div style="height: 360px; width: 100%;">
		<SvelteFlow {nodes} {edges}>
			<SingleLineFlowControls />
		</SvelteFlow>
	</div>
</Story>

<Story name="Fullscreen active" asChild>
	<div style="height: 360px; width: 100%;">
		<SvelteFlow {nodes} {edges}>
			<SingleLineFlowControls fullscreen={true} />
		</SvelteFlow>
	</div>
</Story>
