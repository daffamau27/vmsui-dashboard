<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import VoyagePlansPage from './VoyagePlansPage.svelte';

	const { Story } = defineMeta({
		title: 'Pages/App/VoyagePlansPage',
		component: VoyagePlansPage,
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Perencanaan voyage: daftar rencana pelayaran, peta rute, penugasan vessel, dan riwayat. Data dan tile peta dimuat dari API.'
				}
			}
		}
	});
</script>

<Story name="Default" />
