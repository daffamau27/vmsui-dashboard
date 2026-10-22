<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import HireHistoryModal from './HireHistoryModal.svelte';

	const { Story } = defineMeta({
		title: 'Components/HireHistoryModal',
		component: HireHistoryModal,
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Modal riwayat hire vessel. Story ini memanggil API administrator; tanpa backend yang berjalan, modal akan menampilkan status loading lalu error.'
				}
			}
		},
		args: {
			vesselId: 1,
			vesselName: 'MV Nusantara',
			onclose: () => {}
		},
		argTypes: {
			vesselId: { control: 'number' },
			vesselName: { control: 'text' },
			onclose: { control: false, description: 'Dipanggil saat modal ditutup.' }
		}
	});
</script>

<Story name="Default" />

<Story name="Long vessel name" args={{ vesselName: 'MV Nusantara Jaya Sejahtera Mandiri' }} />
