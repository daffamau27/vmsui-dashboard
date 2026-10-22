<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SingleLineDiagramPage from './SingleLineDiagramPage.svelte';

	const { Story } = defineMeta({
		title: 'Pages/Vessel/SingleLineDiagramPage',
		component: SingleLineDiagramPage,
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Diagram single line vessel: visualisasi perangkat, panel, sensor, dan kabel menggunakan SvelteFlow. Membutuhkan vessel terpilih dan data diagram.'
				}
			}
		},
		argTypes: {
			active: { control: 'boolean', description: 'Mengaktifkan pemuatan data diagram.' }
		}
	});
</script>

<Story name="Nonaktif" args={{ active: false }} />
