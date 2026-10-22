<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Sidebar from './Sidebar.svelte';

	const { Story } = defineMeta({
		title: 'Shell/Sidebar',
		component: Sidebar,
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Sidebar navigasi aplikasi. Item menu difilter berdasarkan permission pengguna; tanpa sesi login hanya sebagian menu yang tampil.'
				}
			}
		}
	});
</script>

<Story name="Default" />
