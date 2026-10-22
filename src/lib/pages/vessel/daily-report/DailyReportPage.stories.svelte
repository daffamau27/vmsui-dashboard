<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import DailyReportPage from './DailyReportPage.svelte';

	const { Story } = defineMeta({
		title: 'Pages/Vessel/DailyReportPage',
		component: DailyReportPage,
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Laporan harian vessel: ringkasan operasional, engine curve, dan ekspor laporan. Membutuhkan vessel terpilih dan API laporan.'
				}
			}
		},
		argTypes: {
			active: { control: 'boolean', description: 'Mengaktifkan pemuatan laporan harian.' }
		}
	});
</script>

<Story name="Nonaktif" args={{ active: false }} />
