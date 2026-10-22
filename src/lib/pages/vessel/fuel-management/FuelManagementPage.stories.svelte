<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import FuelManagementPage from './FuelManagementPage.svelte';

	const { Story } = defineMeta({
		title: 'Pages/Vessel/FuelManagementPage',
		component: FuelManagementPage,
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Manajemen bahan bakar: ringkasan konsumsi, perbandingan, operasi, dan riwayat bahan bakar. Membutuhkan vessel terpilih dan API fuel management.'
				}
			}
		},
		argTypes: {
			active: { control: 'boolean', description: 'Mengaktifkan pemuatan data bahan bakar.' }
		}
	});
</script>

<Story name="Nonaktif" args={{ active: false }} />
