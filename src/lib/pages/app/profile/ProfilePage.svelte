<script>
	import { onMount } from 'svelte';
	import {
		getCurrentUserApi,
		getMyVesselsApi,
		getMyAssetsApi,
		updateCurrentUserApi,
		changePasswordApi
	} from '$lib/api/authApi.js';
	import { getVesselHireHistoryApi } from '$lib/api/administratorApi.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import AuditLogPage from '$lib/pages/app/audit-log/AuditLogPage.svelte';
	import { sortByAlpha } from '$lib/utils/alphaSort.js';
	import ProfileToast from './ProfileToast.svelte';
	import ProfileHero from './ProfileHero.svelte';
	import ProfileSummaryGrid from './ProfileSummaryGrid.svelte';
	import ProfileForm from './ProfileForm.svelte';
	import ProfilePasswordForm from './ProfilePasswordForm.svelte';
	import ProfileAccessList from './ProfileAccessList.svelte';
	import HireHistoryModal from './HireHistoryModal.svelte';
	import './profile-page.css';

	let loading = true;
	let savingProfile = false;
	let changingPassword = false;

	let errorMessage = '';
	let successMessage = '';

	let hireHistoryModalOpen = false;
	let hireHistoryLoading = false;
	let hireHistoryError = '';
	let hireHistoryVessel = null;
	let hireHistoryItems = [];
	let hireHistoryPage = 1;
	let hireHistoryPagination = {
		page: 1,
		pageSize: 20,
		totalItems: 0,
		totalPages: 1,
		hasNextPage: false,
		hasPrevPage: false
	};

	let currentUser = null;
	let vessels = [];
	let assets = [];
	let auditRefreshToken = 0;

	const telegramAiBotUrl = 'https://web.telegram.org/k/#@vmsui_ai_bot';

	let profileForm = {
		name: '',
		username: '',
		email: ''
	};

	let passwordForm = {
		oldPassword: '',
		newPassword: '',
		confirmPassword: ''
	};

	function clearMessage() {
		errorMessage = '';
		successMessage = '';
	}

	function syncProfileForm(user) {
		profileForm = {
			name: user?.name || '',
			username: user?.username || '',
			email: user?.email || ''
		};
	}

	async function loadProfilePage() {
		loading = true;
		clearMessage();

		try {
			const [userResponse, vesselResponse, assetResponse] = await Promise.all([
				getCurrentUserApi(),
				getMyVesselsApi(),
				getMyAssetsApi()
			]);

			currentUser = userResponse?.data || null;
			vessels = sortByAlpha(
				Array.isArray(vesselResponse?.data) ? vesselResponse.data : [],
				(vessel) => vessel?.vesselName || vessel?.name || vessel?.deviceName,
				(vessel) => vessel?.companyName
			);
			assets = sortByAlpha(
				Array.isArray(assetResponse?.data) ? assetResponse.data : [],
				(asset) => asset?.assetName || asset?.name || asset?.thingsboardName || asset?.assetId,
				(asset) => asset?.assetType || asset?.type
			);

			syncProfileForm(currentUser);
		} catch (error) {
			errorMessage = error.message || 'Failed to load profile data.';
		} finally {
			loading = false;
			auditRefreshToken += 1;
		}
	}

	async function updateProfile() {
		clearMessage();

		if (!profileForm.name.trim()) {
			errorMessage = 'Name is required.';
			return;
		}

		if (!profileForm.username.trim()) {
			errorMessage = 'Username is required.';
			return;
		}

		savingProfile = true;

		try {
			const payload = {
				name: profileForm.name.trim(),
				username: profileForm.username.trim(),
				email: profileForm.email.trim() || null
			};

			const response = await updateCurrentUserApi(payload);

			currentUser = response?.data || {
				...currentUser,
				...payload
			};

			syncProfileForm(currentUser);

			successMessage = response?.message || 'Profile updated successfully.';
		} catch (error) {
			errorMessage = error.message || 'Failed to update profile.';
		} finally {
			savingProfile = false;
		}
	}

	async function changePassword() {
		clearMessage();

		if (!passwordForm.oldPassword || !passwordForm.newPassword) {
			errorMessage = 'Current password and new password are required.';
			return;
		}

		if (passwordForm.newPassword.length < 6) {
			errorMessage = 'New password must be at least 6 characters.';
			return;
		}

		if (passwordForm.newPassword !== passwordForm.confirmPassword) {
			errorMessage = 'New password confirmation does not match.';
			return;
		}

		changingPassword = true;

		try {
			const response = await changePasswordApi({
				oldPassword: passwordForm.oldPassword,
				newPassword: passwordForm.newPassword
			});

			passwordForm = {
				oldPassword: '',
				newPassword: '',
				confirmPassword: ''
			};

			successMessage = response?.message || 'Password changed successfully.';
		} catch (error) {
			errorMessage = error.message || 'Failed to change password.';
		} finally {
			changingPassword = false;
		}
	}

	function getVesselId(vessel) {
		return vessel?.vesselId || vessel?.id || vessel?.vessel_id || vessel?.dbId || null;
	}

	function getVesselLabel(vessel) {
		return vessel?.vesselName || vessel?.deviceName || vessel?.name || '-';
	}

	function closeHireHistory() {
		if (hireHistoryLoading) return;

		hireHistoryModalOpen = false;
		hireHistoryVessel = null;
		hireHistoryItems = [];
		hireHistoryError = '';
		hireHistoryPage = 1;
	}

	function handleHireHistoryKeydown(event) {
		if (event.key === 'Escape') {
			closeHireHistory();
		}
	}

	async function loadHireHistoryPage(vesselId, page) {
		hireHistoryLoading = true;
		hireHistoryError = '';

		try {
			const payload = await getVesselHireHistoryApi(vesselId, { page, pageSize: 20 });

			hireHistoryItems = Array.isArray(payload?.items) ? payload.items : [];
			hireHistoryPage = payload?.pagination?.page ?? page;
			hireHistoryPagination = {
				page: payload?.pagination?.page ?? page,
				pageSize: payload?.pagination?.pageSize ?? 20,
				totalItems: payload?.pagination?.totalItems ?? hireHistoryItems.length,
				totalPages: payload?.pagination?.totalPages ?? 1,
				hasNextPage: Boolean(payload?.pagination?.hasNextPage),
				hasPrevPage: Boolean(payload?.pagination?.hasPrevPage)
			};
		} catch (error) {
			hireHistoryItems = [];
			hireHistoryError = error.message || 'Failed to load vessel hire history.';
			hireHistoryPagination = {
				page,
				pageSize: 20,
				totalItems: 0,
				totalPages: 1,
				hasNextPage: false,
				hasPrevPage: false
			};
		} finally {
			hireHistoryLoading = false;
		}
	}

	function openHireHistory(vessel) {
		const vesselId = getVesselId(vessel);

		if (!vesselId) {
			errorMessage = 'Unable to open hire history: vessel ID is missing.';
			return;
		}

		hireHistoryVessel = vessel;
		hireHistoryItems = [];
		hireHistoryError = '';
		hireHistoryPage = 1;
		hireHistoryPagination = {
			page: 1,
			pageSize: 20,
			totalItems: 0,
			totalPages: 1,
			hasNextPage: false,
			hasPrevPage: false
		};
		hireHistoryModalOpen = true;

		loadHireHistoryPage(vesselId, 1);
	}

	function goToHireHistoryPage(page) {
		const vesselId = getVesselId(hireHistoryVessel);

		if (!vesselId || hireHistoryLoading) return;

		const targetPage = Number(page);

		if (!Number.isFinite(targetPage) || targetPage < 1) return;
		if (targetPage > (hireHistoryPagination.totalPages || 1)) return;

		loadHireHistoryPage(vesselId, targetPage);
	}

	function formatDate(dateValue) {
		if (!dateValue) return '-';

		const date = new Date(dateValue);

		if (Number.isNaN(date.getTime())) return '-';

		return new Intl.DateTimeFormat('en-US', {
			day: '2-digit',
			month: 'long',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		}).format(date);
	}

	$: isSuperAdmin = currentUser?.permissionAccess?.mode === 'all';
	$: assetMode = currentUser?.assetAccess?.mode || '-';
	$: vesselMode = currentUser?.vesselAccess?.mode || '-';
	$: permissionMode = currentUser?.permissionAccess?.mode || '-';

	onMount(loadProfilePage);
</script>

<svelte:window on:keydown={handleHireHistoryKeydown} />

<svelte:head>
	<title>Profile</title>
</svelte:head>

<section class="profile-page">
	<ProfileToast
		{errorMessage}
		{successMessage}
		onDismissError={() => (errorMessage = '')}
		onDismissSuccess={() => (successMessage = '')}
	/>

	{#if loading}
		<LoadingSkeleton label="Loading profile data" variant="profile-page" />
	{:else}
		<section class="profile-shell">
			<ProfileHero
				userName={currentUser?.name || '-'}
				{isSuperAdmin}
				{permissionMode}
				createdAtLabel={formatDate(currentUser?.createdAt)}
				{telegramAiBotUrl}
				onRefresh={loadProfilePage}
			/>

			<ProfileSummaryGrid
				username={currentUser?.username}
				email={currentUser?.email}
				vesselCount={vessels.length}
				{vesselMode}
				assetCount={assets.length}
				{assetMode}
				{permissionMode}
				{isSuperAdmin}
			/>

			<section class="content-grid">
				<ProfileForm
					bind:name={profileForm.name}
					bind:username={profileForm.username}
					bind:email={profileForm.email}
					saving={savingProfile}
					onSubmit={updateProfile}
				/>

				<ProfilePasswordForm
					bind:oldPassword={passwordForm.oldPassword}
					bind:newPassword={passwordForm.newPassword}
					bind:confirmPassword={passwordForm.confirmPassword}
					changing={changingPassword}
					onSubmit={changePassword}
				/>

				<ProfileAccessList
					title="My Vessels"
					description="List of vessels accessible by the current user."
					items={vessels.map((vessel) => ({
						key: getVesselId(vessel) ?? getVesselLabel(vessel),
						label: getVesselLabel(vessel),
						raw: vessel
					}))}
					variant="vessel"
					emptyText="No accessible vessels yet."
					actionLabel="Hire History"
					onAction={(item) => openHireHistory(item.raw)}
				/>

				<ProfileAccessList
					title="My Assets"
					description="List of assets accessible by the current user."
					items={assets.map((asset) => ({
						key: asset.assetId ?? asset.assetName ?? asset.thingsboardName ?? '-',
						label: asset.assetName || asset.thingsboardName || '-'
					}))}
					variant="asset"
					emptyText="No accessible assets yet."
				/>
			</section>

			<section class="profile-audit-section" aria-label="Profile audit log">
				<AuditLogPage refreshToken={auditRefreshToken} />
			</section>
		</section>
	{/if}

	<HireHistoryModal
		open={hireHistoryModalOpen}
		loading={hireHistoryLoading}
		error={hireHistoryError}
		vesselLabel={getVesselLabel(hireHistoryVessel)}
		items={hireHistoryItems}
		pagination={hireHistoryPagination}
		page={hireHistoryPage}
		onClose={closeHireHistory}
		onPrev={() => goToHireHistoryPage(hireHistoryPage - 1)}
		onNext={() => goToHireHistoryPage(hireHistoryPage + 1)}
	/>
</section>
