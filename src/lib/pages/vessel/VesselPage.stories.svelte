<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import VesselPage from './VesselPage.svelte';
	import VesselTopbar from './VesselTopbar.svelte';
	import VesselHireStatusModal from './VesselHireStatusModal.svelte';

	const vesselMenus = [
		{ key: 'dashboard', label: 'Dashboard' },
		{ key: 'daily-report', label: 'Daily Report' },
		{ key: 'monthly-report', label: 'Monthly Report' },
		{ key: 'trace', label: 'Trace' },
		{ key: 'data-log', label: 'Data Log' }
	];

	const vessels = [
		{ id: 101, vesselName: 'MV Nusantara Jaya', companyName: 'Nusantara Shipping' },
		{ id: 102, vesselName: 'MT Samudra Perkasa', companyName: 'Samudra Logistics' },
		{ id: 103, vesselName: 'MV Bahari Indah', companyName: 'Bahari Marine' }
	];

	const status = {
		dataReceivedTotal: '1,332',
		dataReceivedReceived: '1,284',
		queue: '48',
		sdCardAvailable: true,
		sdCardUsed: '12.4 GB',
		sdCardCapacity: '32 GB',
		online: true
	};

	const latestVesselStatus = {
		hireUpcomingLabel: 'Next Hire Change',
		hireUpcoming: '25 Oct 2026, 08:00',
		hireChangedBy: 'Capt. Arief Wibowo'
	};

	const reasonOptions = ['Charter start', 'Charter end', 'Maintenance', 'Operational change'];

	const { Story } = defineMeta({
		title: 'Pages/Vessel/VesselPage',
		component: VesselPage,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Container halaman vessel: topbar status, pemilih vessel, menu workspace, dan sub-halaman sesuai menu aktif. Data bergantung pada vessel yang dipilih.'
				}
			}
		},
		argTypes: {
			active: { control: 'boolean', description: 'Mengaktifkan pemuatan data halaman vessel.' }
		}
	});
</script>

<Story name="Nonaktif" args={{ active: false }} />

<Story
	name="Topbar"
	asChild
	parameters={{
		docs: {
			description: {
				story:
					'Topbar vessel: menu workspace, telemetry data count, storage, status koneksi, hire status, dan pemilih vessel.'
			}
		}
	}}
>
	<div class="vessel-shell" style="height: 480px;">
		<VesselTopbar
			activeLabel="Dashboard"
			permissionLoading={false}
			visibleVesselMenus={vesselMenus}
			activeMenuKey="dashboard"
			{status}
			selectedHireIsOn
			selectedHireStatusKnown
			selectedHireLabel="On Hire"
			hireStatusToggleTitle="Change hire status"
			{latestVesselStatus}
			selectedVessel="MV Nusantara Jaya"
			selectedVesselId={101}
			hasSelectedVessel
			{vessels}
			filteredVessels={vessels}
			onSelectMenu={() => {}}
			onToggleVesselDropdown={() => {}}
			onVesselSelectorKeydown={() => {}}
			onVesselDropdownKeydown={() => {}}
			onVesselSearchKeydown={() => {}}
			onSelectVessel={() => {}}
			onOpenHireStatusModal={() => {}}
			onOpenHireHistory={() => {}}
		/>
	</div>
</Story>

<Story
	name="Topbar Manager"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Topbar dengan kontrol hire status dan tombol Hire History untuk user manager.'
			}
		}
	}}
>
	<div class="vessel-shell" style="height: 480px;">
		<VesselTopbar
			activeLabel="Monthly Report"
			permissionLoading={false}
			visibleVesselMenus={vesselMenus}
			activeMenuKey="monthly-report"
			{status}
			canManageHireStatus
			selectedHireIsOn={false}
			selectedHireStatusKnown
			selectedHireLabel="Off Hire"
			hireStatusToggleTitle="Change hire status"
			{latestVesselStatus}
			selectedVessel="MT Samudra Perkasa"
			selectedVesselId={102}
			hasSelectedVessel
			{vessels}
			filteredVessels={vessels}
			onSelectMenu={() => {}}
			onToggleVesselDropdown={() => {}}
			onVesselSelectorKeydown={() => {}}
			onVesselDropdownKeydown={() => {}}
			onVesselSearchKeydown={() => {}}
			onSelectVessel={() => {}}
			onOpenHireStatusModal={() => {}}
			onOpenHireHistory={() => {}}
		/>
	</div>
</Story>

<Story
	name="Vessel Selector"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Dropdown pemilih vessel dengan pencarian dan status vessel aktif.'
			}
		}
	}}
>
	<div class="vessel-shell" style="height: 520px;">
		<VesselTopbar
			activeLabel="Dashboard"
			permissionLoading={false}
			visibleVesselMenus={vesselMenus}
			activeMenuKey="dashboard"
			{status}
			selectedHireIsOn
			selectedHireStatusKnown
			selectedHireLabel="On Hire"
			hireStatusToggleTitle="Change hire status"
			{latestVesselStatus}
			selectedVessel="MV Nusantara Jaya"
			selectedVesselId={101}
			hasSelectedVessel
			{vessels}
			filteredVessels={vessels}
			vesselDropdownOpen
			onSelectMenu={() => {}}
			onToggleVesselDropdown={() => {}}
			onVesselSelectorKeydown={() => {}}
			onVesselDropdownKeydown={() => {}}
			onVesselSearchKeydown={() => {}}
			onSelectVessel={() => {}}
			onOpenHireStatusModal={() => {}}
			onOpenHireHistory={() => {}}
		/>
	</div>
</Story>

<Story
	name="Hire Status Modal"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Modal perubahan hire status dengan reason, effective date, dan catatan.'
			}
		}
	}}
>
	<div class="vessel-shell" style="height: 100vh;">
		<VesselHireStatusModal
			open
			target
			vesselName="MV Nusantara Jaya"
			{reasonOptions}
			reason="Charter start"
			effectiveAt="2026-10-25T08:00"
			onSubmit={() => {}}
			onClose={() => {}}
			onBackdropClick={() => {}}
		/>
	</div>
</Story>
