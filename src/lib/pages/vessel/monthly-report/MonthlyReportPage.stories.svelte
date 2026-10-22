<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import MonthlyReportPage from './MonthlyReportPage.svelte';

	const { Story } = defineMeta({
		title: 'Pages/Vessel/MonthlyReportPage',
		component: MonthlyReportPage,
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Laporan bulanan vessel: rekap metrik per bulan dan ekspor laporan. Membutuhkan vessel terpilih dan API laporan bulanan.'
				}
			}
		},
		argTypes: {
			active: { control: 'boolean', description: 'Mengaktifkan pemuatan laporan bulanan.' }
		}
	});
</script>

<Story name="Nonaktif" args={{ active: false }} />
