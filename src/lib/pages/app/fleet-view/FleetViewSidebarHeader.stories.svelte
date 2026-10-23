<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import FleetViewSidebarHeader from './FleetViewSidebarHeader.svelte';
	import './fleet-view-page.css';

	const { Story } = defineMeta({
		title: 'Components/FleetViewSidebarHeader',
		component: FleetViewSidebarHeader,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Header sidebar fleet view: judul, filter status online/offline/total, dan pencarian vessel.'
				}
			}
		},
		argTypes: {
			statusFilter: {
				control: 'select',
				options: ['all', 'online', 'offline'],
				description: 'Filter status vessel yang sedang aktif.'
			},
			onlineCount: { control: 'number' },
			offlineCount: { control: 'number' },
			totalCount: { control: 'number' },
			search: { control: 'text' }
		}
	});
</script>

<Story name="Default">
	<div class="fleet-page" style="height: auto; min-height: 100vh; overflow: visible;">
		<div
			style="width: 320px; margin: 24px; border: 1px solid rgba(147, 197, 253, 0.14); border-radius: 12px; overflow: hidden; background: rgba(15, 23, 42, 0.94);"
		>
			<div class="sidebar-fixed">
				<FleetViewSidebarHeader
					statusFilter="all"
					onlineCount={12}
					offlineCount={3}
					totalCount={15}
					search=""
					onFilter={() => {}}
					onCloseMobile={() => {}}
				/>
			</div>
		</div>
	</div>
</Story>

<Story name="Search Filled">
	<div class="fleet-page" style="height: auto; min-height: 100vh; overflow: visible;">
		<div
			style="width: 320px; margin: 24px; border: 1px solid rgba(147, 197, 253, 0.14); border-radius: 12px; overflow: hidden; background: rgba(15, 23, 42, 0.94);"
		>
			<div class="sidebar-fixed">
				<FleetViewSidebarHeader
					statusFilter="all"
					onlineCount={12}
					offlineCount={3}
					totalCount={15}
					search="anggrek"
					onFilter={() => {}}
					onCloseMobile={() => {}}
				/>
			</div>
		</div>
	</div>
</Story>
