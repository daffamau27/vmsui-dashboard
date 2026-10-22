<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TracePage from './TracePage.svelte';

	const { Story } = defineMeta({
		title: 'Pages/Vessel/TracePage',
		component: TracePage,
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Trace playback vessel: pemutaran riwayat posisi pada peta beserta kontrol waktu. Membutuhkan vessel terpilih dan API trace.'
				}
			}
		},
		argTypes: {
			active: { control: 'boolean', description: 'Mengaktifkan pemuatan data trace.' }
		}
	});
</script>

<Story name="Nonaktif" args={{ active: false }} />
