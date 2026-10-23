<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AppWorkspace from './AppWorkspace.svelte';

	const { Story } = defineMeta({
		title: 'Shell/AppWorkspace',
		component: AppWorkspace,
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Shell workspace aplikasi. Halaman yang dirender bergantung pada menu aktif (URL) dan sesi login; di Storybook halaman default akan tampil tanpa sesi.'
				}
			}
		}
	});
</script>

<Story name="Default" />
