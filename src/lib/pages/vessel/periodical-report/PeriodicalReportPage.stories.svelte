<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import PeriodicalReportPage from './PeriodicalReportPage.svelte';

	const { Story } = defineMeta({
		title: 'Pages/Vessel/PeriodicalReportPage',
		component: PeriodicalReportPage,
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Laporan periodik vessel: rekap data pada rentang periode tertentu. Membutuhkan vessel terpilih dan API laporan periodik.'
				}
			}
		},
		argTypes: {
			active: { control: 'boolean', description: 'Mengaktifkan pemuatan laporan periodik.' }
		}
	});
</script>

<Story name="Nonaktif" args={{ active: false }} />
