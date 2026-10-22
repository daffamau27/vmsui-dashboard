<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import VesselPage from './VesselPage.svelte';

	const { Story } = defineMeta({
		title: 'Pages/App/VesselPage',
		component: VesselPage,
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Container halaman vessel: menampilkan sub-halaman sesuai menu vessel aktif (dashboard, report, trace, dan lainnya). Data bergantung pada vessel yang dipilih.'
				}
			}
		},
		argTypes: {
			active: { control: 'boolean', description: 'Mengaktifkan pemuatan data halaman vessel.' }
		}
	});
</script>

<Story name="Nonaktif" args={{ active: false }} />
