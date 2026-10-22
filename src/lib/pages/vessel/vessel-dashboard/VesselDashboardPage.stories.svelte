<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import VesselDashboardPage from './VesselDashboardPage.svelte';

	const { Story } = defineMeta({
		title: 'Pages/Vessel/VesselDashboardPage',
		component: VesselDashboardPage,
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Dashboard vessel: kartu metrik utama (RPM, kecepatan, konsumsi), grafik, dan status perangkat. Membutuhkan vessel terpilih dan API dashboard.'
				}
			}
		},
		argTypes: {
			active: { control: 'boolean', description: 'Mengaktifkan pemuatan data dashboard.' }
		}
	});
</script>

<Story name="Nonaktif" args={{ active: false }} />
