<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Navbar from './Navbar.svelte';

	const { Story } = defineMeta({
		title: 'Shell/Navbar',
		component: Navbar,
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Top bar aplikasi: dropdown menu, pemilih vessel, dan status terbaru. Data diambil dari API; tanpa backend, dropdown vessel akan kosong.'
				}
			}
		}
	});
</script>

<Story name="Default" />
