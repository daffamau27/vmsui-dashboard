<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ProfilePage from './ProfilePage.svelte';

	const { Story } = defineMeta({
		title: 'Pages/App/ProfilePage',
		component: ProfilePage,
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Profil pengguna: data akun, ubah kata sandi, dan pengaturan terkait. Data dimuat dari API autentikasi.'
				}
			}
		}
	});
</script>

<Story name="Default" />
