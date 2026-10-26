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
						'Halaman administrator untuk master data: pengguna, role, permission, engine curve, dan audit global. Tiap story di bawah membuka satu tab dengan data dummy dari fetch stub Storybook, sehingga tidak membutuhkan sesi atau backend.'
				}
			}
		},
		argTypes: {
			initialTab: {
				control: 'select',
				options: [
					'users',
					'vessels',
					'assets',
					'engine-curves',
					'reporting',
					'cctv-config',
					'alarm',
					'global-audit-logs'
				],
				description: 'Tab administrator yang langsung dibuka saat halaman dimuat.'
			}
		}
	});
</script>

<Story name="Users" args={{ initialTab: 'users' }} />
<Story name="Vessels" args={{ initialTab: 'vessels' }} />
<Story name="Assets" args={{ initialTab: 'assets' }} />
<Story name="Engine Curves" args={{ initialTab: 'engine-curves' }} />
<Story name="Reporting" args={{ initialTab: 'reporting' }} />
<Story name="CCTV Config" args={{ initialTab: 'cctv-config' }} />
<Story name="Alarm" args={{ initialTab: 'alarm' }} />
<Story name="Global Audit Logs" args={{ initialTab: 'global-audit-logs' }} />

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
