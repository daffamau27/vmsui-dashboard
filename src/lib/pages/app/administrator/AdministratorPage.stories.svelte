<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AdministratorPage from './AdministratorPage.svelte';
	import AdministratorHeader from './AdministratorHeader.svelte';

	const { Story } = defineMeta({
		title: 'Pages/App/AdministratorPage',
		component: AdministratorPage,
		tags: ['autodocs'],
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

<Story name="Header">
	<div class="administrator-page" style="min-height: 100vh;">
		<AdministratorHeader
			activeTab="users"
			bootLoading={false}
			onRefresh={() => {}}
			onCreateUser={() => {}}
			onCreateVessel={() => {}}
			onCreateAsset={() => {}}
			onDownloadTemplate={() => {}}
		/>
	</div>
</Story>
