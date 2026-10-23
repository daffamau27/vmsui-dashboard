<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import VoyagePlansPage from './VoyagePlansPage.svelte';
	import VoyagePlansHeader from './VoyagePlansHeader.svelte';

	const { Story } = defineMeta({
		title: 'Pages/App/VoyagePlansPage',
		component: VoyagePlansPage,
		tags: ['autodocs'],
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

<Story name="Header">
	<div class="voyage-page" style="min-height: 100vh;">
		<VoyagePlansHeader
			canAccess={true}
			canManage={true}
			refreshDisabled={false}
			onRefresh={() => {}}
			onCreate={() => {}}
		/>
	</div>
</Story>
