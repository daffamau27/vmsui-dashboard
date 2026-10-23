<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import FleetViewPage from './FleetViewPage.svelte';

	const { Story } = defineMeta({
		title: 'Pages/App/FleetViewPage',
		component: FleetViewPage,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Fleet view: peta armada, ringkasan status vessel, dan panel dashboard. Data dan tile peta dimuat dari API/server peta saat halaman aktif.'
				}
			}
		},
		argTypes: {
			active: { control: 'boolean', description: 'Mengaktifkan pemuatan data dan peta.' }
		}
	});
</script>

<Story name="Nonaktif" args={{ active: false }} />
