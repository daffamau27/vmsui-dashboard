<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import VoyagePlanPage from './VoyagePlanPage.svelte';

	const { Story } = defineMeta({
		title: 'Pages/Vessel/VoyagePlanPage',
		component: VoyagePlanPage,
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Voyage plan vessel: peta rute, detail rencana pelayaran, dan riwayat. Membutuhkan vessel terpilih dan API voyage.'
				}
			}
		}
	});
</script>

<Story name="Default" />
