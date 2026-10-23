<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ProfilePage from './ProfilePage.svelte';
	import ProfileHero from './ProfileHero.svelte';
	import ProfileSummaryGrid from './ProfileSummaryGrid.svelte';
	import ProfileForm from './ProfileForm.svelte';
	import ProfilePasswordForm from './ProfilePasswordForm.svelte';
	import ProfileAccessList from './ProfileAccessList.svelte';
	import HireHistoryModal from './HireHistoryModal.svelte';
	import ProfileToast from './ProfileToast.svelte';

	const vesselItems = [
		{ key: 101, label: 'MV Nusantara Jaya' },
		{ key: 102, label: 'MT Samudra Biru' },
		{ key: 103, label: 'MV Bahari Indah' }
	];

	const assetItems = [
		{ key: 'a-01', label: 'Engine Monitor 01' },
		{ key: 'a-02', label: 'Fuel Flow Meter 02' }
	];

	const hireHistoryItems = [
		{
			duration: { formatted: '32 days 4 hours', ongoing: true },
			on_hire: {
				formatted: '12 Sep 2026, 08:00',
				by: 'admin',
				reason: 'Charter',
				note: 'Hire starts from Singapore anchorage.'
			},
			off_hire: null
		},
		{
			duration: { formatted: '90 days', ongoing: false },
			on_hire: { formatted: '02 Mei 2026, 07:30', by: 'operator1', reason: 'Charter' },
			off_hire: {
				formatted: '31 Jul 2026, 16:00',
				by: 'operator1',
				reason: 'Charter ended',
				note: 'Returned to owner at Batam.'
			}
		}
	];

	const { Story } = defineMeta({
		title: 'Pages/App/ProfilePage',
		component: ProfilePage,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Profil pengguna: ringkasan akun, form profil dan kata sandi, daftar vessel/asset yang dapat diakses, hire history vessel, serta audit log. Halaman memuat data dari API; section di bawah dirender dengan data dummy.'
				}
			}
		}
	});
</script>

<Story name="Default" />

<Story
	name="Hero"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Header profil dengan avatar inisial, badge akses, tombol bot Telegram, dan refresh.'
			}
		}
	}}
>
	<div class="profile-page" style="min-height: 100vh;">
		<ProfileHero
			userName="Mahesa Pratama"
			isSuperAdmin
			permissionMode="all"
			createdAtLabel="15 January 2025, 03:00 PM"
			telegramAiBotUrl="https://web.telegram.org/k/#@vmsui_ai_bot"
		/>
	</div>
</Story>

<Story
	name="Summary"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Empat kartu ringkasan: username, vessel access, asset access, dan permission.'
			}
		}
	}}
>
	<div class="profile-page" style="min-height: 100vh;">
		<ProfileSummaryGrid
			username="mahesa"
			email="mahesa@example.com"
			vesselCount={3}
			vesselMode="assigned"
			assetCount={2}
			assetMode="assigned"
			permissionMode="all"
			isSuperAdmin
		/>
	</div>
</Story>

<Story
	name="Profile Form"
	asChild
	parameters={{
		docs: {
			description: { story: 'Form untuk memperbarui nama, username, dan email.' }
		}
	}}
>
	<div class="profile-page" style="min-height: 100vh;">
		<div class="content-grid">
			<ProfileForm name="Mahesa Pratama" username="mahesa" email="mahesa@example.com" />
		</div>
	</div>
</Story>

<Story
	name="Password Form"
	asChild
	parameters={{
		docs: {
			description: { story: 'Form perubahan kata sandi dengan validasi di halaman.' }
		}
	}}
>
	<div class="profile-page" style="min-height: 100vh;">
		<div class="content-grid">
			<ProfilePasswordForm oldPassword="secret123" />
		</div>
	</div>
</Story>

<Story
	name="Access Lists"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Daftar vessel (dengan tombol hire history) dan asset yang dapat diakses.'
			}
		}
	}}
>
	<div class="profile-page" style="min-height: 100vh;">
		<section class="content-grid">
			<ProfileAccessList
				title="My Vessels"
				description="List of vessels accessible by the current user."
				items={vesselItems}
				variant="vessel"
				emptyText="No accessible vessels yet."
				actionLabel="Hire History"
			/>
			<ProfileAccessList
				title="My Assets"
				description="List of assets accessible by the current user."
				items={assetItems}
				variant="asset"
				emptyText="No accessible assets yet."
			/>
		</section>
	</div>
</Story>

<Story
	name="Hire History Modal"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Modal riwayat hire vessel dengan timeline on/off hire dan pagination.'
			}
		}
	}}
>
	<div class="profile-page" style="min-height: 100vh;">
		<HireHistoryModal
			open
			vesselLabel="MV Nusantara Jaya"
			items={hireHistoryItems}
			pagination={{ page: 1, totalPages: 2, totalItems: 2, hasPrevPage: false, hasNextPage: true }}
			page={1}
		/>
	</div>
</Story>

<Story
	name="Toasts"
	asChild
	parameters={{
		docs: {
			description: {
				story: 'Notifikasi sukses dan gagal yang tampil di kanan atas halaman.'
			}
		}
	}}
>
	<div class="profile-page" style="min-height: 100vh;">
		<ProfileToast
			errorMessage="Failed to update profile."
			successMessage="Profile updated successfully."
		/>
	</div>
</Story>
