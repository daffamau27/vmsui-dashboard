<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AdministratorPage from './AdministratorPage.svelte';

	const { Story } = defineMeta({
		title: 'Pages/App/AdministratorPage',
		component: AdministratorPage,
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Halaman administrator untuk master data: pengguna, role, permission, engine curve, dan audit global. Seluruh data dimuat dari API administrator sehingga membutuhkan sesi dengan hak akses admin.'
				}
			}
		}
	});
</script>

<Story name="Default" />
