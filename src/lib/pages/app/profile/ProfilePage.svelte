<script>
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
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
	import { slideScale } from '$lib/utils/modalTransition.js';

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

	function handleHireHistoryBackdrop(event) {
		if (event.target === event.currentTarget) {
			closeHireHistory();
		}
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

	function getInitials(name = '') {
		const parts = name.trim().split(' ').filter(Boolean);

		if (!parts.length) return 'U';

		return parts
			.slice(0, 2)
			.map((part) => part[0])
			.join('')
			.toUpperCase();
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
	{#if errorMessage || successMessage}
		<div class="profile-toast-layer" aria-live="polite">
			{#if errorMessage}
				<div class="profile-toast danger" role="alert">
					<div class="profile-toast-copy">
						<strong>Action failed</strong>
						<span>{errorMessage}</span>
					</div>
					<button
						type="button"
						class="profile-toast-close"
						on:click={() => (errorMessage = '')}
						aria-label="Close error notification">×</button
					>
				</div>
			{/if}

			{#if successMessage}
				<div class="profile-toast success" role="status">
					<div class="profile-toast-copy">
						<strong>Action success</strong>
						<span>{successMessage}</span>
					</div>
					<button
						type="button"
						class="profile-toast-close"
						on:click={() => (successMessage = '')}
						aria-label="Close success notification">×</button
					>
				</div>
			{/if}
		</div>
	{/if}

	{#if loading}
		<LoadingSkeleton label="Loading profile data" variant="profile-page" />
	{:else}
		<section class="profile-shell">
			<header class="profile-hero">
				<div class="hero-left">
					<div class="avatar">
						{getInitials(currentUser?.name)}
					</div>

					<div>
						<div class="page-kicker">User Profile</div>
						<h1>{currentUser?.name || '-'}</h1>
						<p>Manage account information, vessel access, asset access, and password security.</p>

						<div class="hero-badges">
							<span class:super-admin={isSuperAdmin}>
								{isSuperAdmin ? 'Super Admin' : 'Limited User'}
							</span>
							<span>Permission: {permissionMode}</span>
							<span>Created: {formatDate(currentUser?.createdAt)}</span>
						</div>
					</div>
				</div>

				<div class="hero-actions">
					<a
						class="telegram-bot-button"
						href={telegramAiBotUrl}
						target="_blank"
						rel="noopener noreferrer"
						aria-label="Open VMSUI AI Telegram bot"
					>
						Open AI Telegram Bot
					</a>

					<button class="refresh-button" type="button" on:click={loadProfilePage}> Refresh </button>
				</div>
			</header>

			<section class="summary-grid">
				<article class="summary-card">
					<div class="summary-label">Username</div>
					<strong>{currentUser?.username || '-'}</strong>
					<p>{currentUser?.email || 'Email not provided'}</p>
				</article>

				<article class="summary-card">
					<div class="summary-label">Vessel Access</div>
					<strong>{vessels.length}</strong>
					<p>Mode: {vesselMode}</p>
				</article>

				<article class="summary-card">
					<div class="summary-label">Asset Access</div>
					<strong>{assets.length}</strong>
					<p>Mode: {assetMode}</p>
				</article>

				<article class="summary-card">
					<div class="summary-label">Permission</div>
					<strong>{permissionMode}</strong>
					<p>{isSuperAdmin ? 'Full system access' : 'Limited access'}</p>
				</article>
			</section>

			<section class="content-grid">
				<article class="panel profile-panel">
					<div class="panel-header">
						<div>
							<h2>Profile Information</h2>
							<p>Update the account name, username, and email.</p>
						</div>
					</div>

					<form class="form-grid" on:submit|preventDefault={updateProfile}>
						<label>
							<span>Name</span>
							<input
								type="text"
								bind:value={profileForm.name}
								placeholder="Enter name"
								autocomplete="name"
							/>
						</label>

						<label>
							<span>Username</span>
							<input
								type="text"
								bind:value={profileForm.username}
								placeholder="Enter username"
								autocomplete="username"
							/>
						</label>

						<label>
							<span>Email</span>
							<input
								type="email"
								bind:value={profileForm.email}
								placeholder="Enter email"
								autocomplete="email"
							/>
						</label>

						<div class="form-actions">
							<button class="primary-button" type="submit" disabled={savingProfile}>
								{savingProfile ? 'Saving...' : 'Save Profile'}
							</button>
						</div>
					</form>
				</article>

				<article class="panel password-panel">
					<div class="panel-header">
						<div>
							<h2>Change Password</h2>
							<p>Use a strong new password that you can remember.</p>
						</div>
					</div>

					<form class="form-grid" on:submit|preventDefault={changePassword}>
						<label>
							<span>Current Password</span>
							<input
								type="password"
								bind:value={passwordForm.oldPassword}
								placeholder="Enter current password"
								autocomplete="current-password"
							/>
						</label>

						<label>
							<span>New Password</span>
							<input
								type="password"
								bind:value={passwordForm.newPassword}
								placeholder="Enter new password"
								autocomplete="new-password"
							/>
						</label>

						<label>
							<span>Confirm New Password</span>
							<input
								type="password"
								bind:value={passwordForm.confirmPassword}
								placeholder="Re-enter new password"
								autocomplete="new-password"
							/>
						</label>

						<div class="form-actions">
							<button class="primary-button danger" type="submit" disabled={changingPassword}>
								{changingPassword ? 'Changing...' : 'Change Password'}
							</button>
						</div>
					</form>
				</article>

				<article class="panel access-panel">
					<div class="panel-header">
						<div>
							<h2>My Vessels</h2>
							<p>List of vessels accessible by the current user.</p>
						</div>

						<span class="count-pill">{vessels.length}</span>
					</div>

					{#if vessels.length}
						<div class="list-scroll">
							{#each vessels as vessel}
								<div class="access-row">
									<div class="access-icon vessel-icon">V</div>
									<div>
										<strong>{vessel.vesselName || vessel.deviceName || '-'}</strong>
									</div>
									<button
										type="button"
										class="hire-history-button"
										on:click={() => openHireHistory(vessel)}
									>
										Hire History
									</button>
								</div>
							{/each}
						</div>
					{:else}
						<div class="empty-state">No accessible vessels yet.</div>
					{/if}
				</article>

				<article class="panel access-panel">
					<div class="panel-header">
						<div>
							<h2>My Assets</h2>
							<p>List of assets accessible by the current user.</p>
						</div>

						<span class="count-pill">{assets.length}</span>
					</div>

					{#if assets.length}
						<div class="list-scroll">
							{#each assets as asset}
								<div class="access-row">
									<div class="access-icon asset-icon">A</div>
									<div>
										<strong>{asset.assetName || asset.thingsboardName || '-'}</strong>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="empty-state">No accessible assets yet.</div>
					{/if}
				</article>
			</section>

			<section class="profile-audit-section" aria-label="Profile audit log">
				<AuditLogPage refreshToken={auditRefreshToken} />
			</section>
		</section>
	{/if}
</section>

{#if hireHistoryModalOpen}
	<div
		class="hire-history-backdrop"
		role="presentation"
		on:click={handleHireHistoryBackdrop}
		transition:fade={{ duration: 220, easing: cubicOut }}
	>
		<section
			class="hire-history-modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="hire-history-title"
			in:slideScale={{ intro: true, distance: 480, start: 0.6, duration: 280 }}
			out:slideScale={{ intro: false, distance: 480, start: 0.6, fadeAt: 0.3, duration: 280 }}
		>
			<header class="hire-history-header">
				<div>
					<span class="page-kicker">Hire History</span>
					<h2 id="hire-history-title">{getVesselLabel(hireHistoryVessel)}</h2>
					<p>{hireHistoryPagination.totalItems} record(s) found</p>
				</div>
				<button
					type="button"
					class="hire-history-close"
					on:click={closeHireHistory}
					disabled={hireHistoryLoading}
					aria-label="Close hire history">×</button
				>
			</header>

			<div class="hire-history-body">
				{#if hireHistoryLoading}
					<div class="hire-history-state">Loading hire history...</div>
				{:else if hireHistoryError}
					<div class="hire-history-state danger" role="alert">{hireHistoryError}</div>
				{:else if hireHistoryItems.length}
					<ul class="hire-history-list">
						{#each hireHistoryItems as item, index}
							<li class="hire-history-item">
								<div class="hire-history-item-head">
									<strong>Record #{index + 1}</strong>
									<span class="hire-history-duration">
										{item?.duration?.formatted || '-'}
										{#if item?.duration?.ongoing}
											<em>Ongoing</em>
										{/if}
									</span>
								</div>

								<div class="hire-history-timeline">
									<div class="hire-history-event on">
										<span class="event-label">On Hire</span>
										<strong>{item?.on_hire?.formatted || '-'}</strong>
										<small>
											By {item?.on_hire?.by || '-'}
											{#if item?.on_hire?.reason}
												• {item.on_hire.reason}{/if}
										</small>
										{#if item?.on_hire?.note}
											<p>{item.on_hire.note}</p>
										{/if}
									</div>

									<div class="hire-history-event off">
										<span class="event-label">Off Hire</span>
										{#if item?.off_hire}
											<strong>{item?.off_hire?.formatted || '-'}</strong>
											<small>
												By {item?.off_hire?.by || '-'}
												{#if item?.off_hire?.reason}
													• {item.off_hire.reason}{/if}
											</small>
											{#if item?.off_hire?.note}
												<p>{item.off_hire.note}</p>
											{/if}
										{:else}
											<strong>-</strong>
											<small>Still on hire</small>
										{/if}
									</div>
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<div class="hire-history-state">No hire history available for this vessel.</div>
				{/if}
			</div>

			<footer class="hire-history-pagination">
				<button
					type="button"
					class="secondary-button"
					on:click={() => goToHireHistoryPage(hireHistoryPage - 1)}
					disabled={!hireHistoryPagination.hasPrevPage || hireHistoryLoading}
				>
					Previous
				</button>

				<span>
					Page {hireHistoryPagination.page || 1} of {hireHistoryPagination.totalPages || 1}
				</span>

				<button
					type="button"
					class="secondary-button"
					on:click={() => goToHireHistoryPage(hireHistoryPage + 1)}
					disabled={!hireHistoryPagination.hasNextPage || hireHistoryLoading}
				>
					Next
				</button>
			</footer>
		</section>
	</div>
{/if}

<style>
	.profile-page {
		width: 100%;
		height: 100%;
		max-height: 100%;
		min-height: 0;
		padding: 14px;
		background: var(--color-base);
		color: var(--text-primary);
		overflow-y: auto;
		overflow-x: hidden;
		box-sizing: border-box;
	}

	.profile-shell {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.profile-hero,
	.summary-card,
	.panel,
	.loading-card {
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
	}

	.profile-hero {
		padding: 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.hero-left {
		display: flex;
		align-items: center;
		gap: 14px;
		min-width: 0;
	}

	.avatar {
		width: 58px;
		height: 58px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		flex-shrink: 0;
		background: var(--color-accent-muted);
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 19px;
		font-weight: 900;
		letter-spacing: 0.05em;
	}

	.page-kicker,
	.section-kicker {
		display: inline-flex;
		width: fit-content;
		padding: 4px 9px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		color: #1d4ed8;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.profile-hero h1 {
		margin: 8px 0 0;
		font-size: 22px;
		line-height: 1.2;
		font-weight: 900;
		color: var(--text-primary);
		overflow-wrap: anywhere;
	}

	.profile-hero p {
		margin: 7px 0 0;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
		line-height: 1.45;
	}

	.hero-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 12px;
	}

	.hero-badges span {
		display: inline-flex;
		align-items: center;
		min-height: 26px;
		padding: 0 10px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.03em;
	}

	.hero-badges span.super-admin {
		background: var(--color-success-muted);
		border-color: #bbf7d0;
		color: #047857;
	}

	.refresh-button,
	.primary-button,
	.telegram-bot-button {
		height: 32px;
		padding: 0 12px;
		border: none;
		font-size: 11px;
		font-weight: 900;
		cursor: pointer;
		text-decoration: none;
		box-sizing: border-box;
	}

	.hero-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		flex-shrink: 0;
	}

	.telegram-bot-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		background: #229ed9;
		color: #ffffff;
		box-shadow: 0 8px 18px rgba(34, 158, 217, 0.18);
	}

	.telegram-bot-button::before {
		content: 'AI';
		display: inline-grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.16);
		font-size: 9px;
		line-height: 1;
	}

	.telegram-bot-button:hover {
		background: #1d8ec4;
		box-shadow: 0 10px 22px rgba(34, 158, 217, 0.24);
	}

	.refresh-button {
		flex-shrink: 0;
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-primary);
	}

	.refresh-button:hover:not(:disabled) {
		background: #cbd5e1;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 14px;
	}

	.summary-card {
		min-height: 96px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		box-sizing: border-box;
	}

	.summary-label {
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.summary-card strong {
		display: block;
		margin-top: 10px;
		color: var(--text-primary);
		font-size: 22px;
		line-height: 1.1;
		font-weight: 900;
		overflow-wrap: anywhere;
	}

	.summary-card p {
		margin: 8px 0 0;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}

	.content-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px;
		align-items: start;
	}

	.profile-audit-section {
		min-width: 0;
	}

	.profile-audit-section :global(.audit-page) {
		height: auto;
		min-height: 0;
		max-height: none;
		padding: 0 0 18px;
		background: transparent;
		overflow: visible;
	}

	.profile-audit-section :global(.audit-header-card) {
		margin-top: 0;
	}

	.panel {
		min-width: 0;
		overflow: hidden;
	}

	.panel-header {
		min-height: 58px;
		padding: 12px 14px;
		border-bottom: 1px solid #e5edf5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--color-surface);
		box-sizing: border-box;
	}

	.panel-header h2 {
		margin: 0;
		color: var(--text-primary);
		font-size: 17px;
		font-weight: 900;
	}

	.panel-header p {
		margin: 6px 0 0;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
		line-height: 1.45;
	}

	.form-grid {
		padding: 14px;
		display: grid;
		gap: 12px;
		background: var(--color-surface);
	}

	.form-grid label {
		display: grid;
		gap: 5px;
	}

	.form-grid label span {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.form-grid input {
		width: 100%;
		height: 32px;
		border: 1px solid #cbd5e1;
		background: var(--color-surface);
		padding: 0 9px;
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 700;
		outline: none;
		box-sizing: border-box;
	}

	.form-grid input:focus {
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 2px;
	}

	.primary-button {
		background: #2563eb;
		color: #ffffff;
	}

	.primary-button:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.primary-button.danger {
		background: #b5150c;
	}

	.primary-button.danger:hover:not(:disabled) {
		background: #991b1b;
	}

	.refresh-button:disabled,
	.primary-button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.count-pill {
		flex-shrink: 0;
		padding: 5px 10px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 11px;
		font-weight: 900;
	}

	.list-scroll {
		max-height: 360px;
		overflow: auto;
		padding: 14px;
		display: grid;
		gap: 10px;
		background: var(--color-elevated);
		box-sizing: border-box;
	}

	.access-row {
		display: grid;
		grid-template-columns: 42px minmax(0, 1fr) auto;
		gap: 12px;
		align-items: center;
		padding: 12px;
		border-radius: 12px;
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
	}

	.hire-history-button {
		flex-shrink: 0;
		height: 30px;
		padding: 0 12px;
		border: 1px solid #bfdbfe;
		border-radius: 999px;
		background: var(--color-accent-muted);
		color: #1d4ed8;
		font-size: 11px;
		font-weight: 900;
		cursor: pointer;
		white-space: nowrap;
	}

	.hire-history-button:hover:not(:disabled) {
		background: #dbeafe;
	}

	.access-row:hover {
		background: var(--color-elevated);
	}

	.access-icon {
		width: 42px;
		height: 42px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		font-weight: 900;
		font-size: 13px;
	}

	.vessel-icon {
		background: var(--color-accent-muted);
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
	}

	.asset-icon {
		background: var(--color-success-muted);
		border: 1px solid #bbf7d0;
		color: #047857;
	}

	.access-row strong {
		display: block;
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 900;
		overflow-wrap: anywhere;
	}

	.access-row p {
		margin: 4px 0 0;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.access-row small {
		display: block;
		margin-top: 4px;
		color: #94a3b8;
		font-size: 11px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.empty-state {
		padding: 18px 14px;
		background: var(--color-surface);
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 800;
	}

	.hire-history-backdrop {
		position: fixed;
		inset: 0;
		z-index: 30000;
		display: grid;
		place-items: center;
		padding: 20px;
		background: rgba(2, 6, 23, 0.72);
		backdrop-filter: blur(8px);
	}

	.hire-history-modal {
		width: min(620px, 100%);
		max-height: calc(100dvh - 40px);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid #d9e2ec;
		border-radius: 16px;
		background: var(--color-surface);
		box-shadow: 0 26px 80px rgba(0, 0, 0, 0.35);
	}

	.hire-history-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		padding: 16px 18px;
		border-bottom: 1px solid #e5edf5;
	}

	.hire-history-header h2 {
		margin: 6px 0 0;
		color: var(--text-primary);
		font-size: 18px;
		font-weight: 900;
		overflow-wrap: anywhere;
	}

	.hire-history-header p {
		margin: 5px 0 0;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
	}

	.hire-history-close {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		padding: 0;
		border: 1px solid #e2e8f0;
		border-radius: 9px;
		background: rgba(15, 23, 42, 0.05);
		color: #334155;
		font-size: 20px;
		font-weight: 900;
		line-height: 1;
		cursor: pointer;
	}

	.hire-history-close:hover:not(:disabled) {
		background: rgba(15, 23, 42, 0.12);
	}

	.hire-history-body {
		overflow-y: auto;
		padding: 14px;
		background: var(--color-elevated);
	}

	.hire-history-state {
		padding: 22px 14px;
		text-align: center;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 800;
		background: var(--color-surface);
		border: 1px dashed #cbd5e1;
		border-radius: 12px;
	}

	.hire-history-state.danger {
		color: #9f1239;
		border-color: #fecaca;
		background: rgba(255, 241, 242, 0.96);
	}

	.hire-history-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 12px;
	}

	.hire-history-item {
		padding: 14px;
		border-radius: 12px;
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
	}

	.hire-history-item-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 12px;
		padding-bottom: 10px;
		border-bottom: 1px dashed #e2e8f0;
	}

	.hire-history-item-head strong {
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 900;
	}

	.hire-history-duration {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 11px;
		font-weight: 900;
	}

	.hire-history-duration em {
		font-style: normal;
		padding: 2px 7px;
		border-radius: 999px;
		background: var(--color-success-muted);
		border: 1px solid #bbf7d0;
		color: #047857;
		font-size: 10px;
		font-weight: 900;
	}

	.hire-history-timeline {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}

	.hire-history-event {
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px solid #e2e8f0;
		background: var(--color-elevated);
	}

	.hire-history-event.on {
		border-color: #bbf7d0;
		background: var(--color-success-muted);
	}

	.hire-history-event.off {
		border-color: #fecaca;
		background: rgba(255, 241, 242, 0.7);
	}

	.hire-history-event.on .event-label {
		background: rgba(6, 95, 70, 0.35);
		color: #a7f3d0;
	}

	.hire-history-event.on strong {
		color: #a7f3d0;
	}

	.hire-history-event.on small {
		color: #6ee7b7;
	}

	.hire-history-event.off .event-label {
		background: rgba(153, 27, 27, 0.14);
		color: #7f1d1d;
	}

	.hire-history-event.off strong {
		color: #7f1d1d;
	}

	.hire-history-event.off small {
		color: #991b1b;
	}

	.hire-history-event .event-label {
		display: inline-flex;
		padding: 2px 8px;
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.08);
		color: #991b1b;
		font-size: 9px;
		font-weight: 900;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.hire-history-event strong {
		display: block;
		margin-top: 8px;
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 900;
		overflow-wrap: anywhere;
	}

	.hire-history-event small {
		display: block;
		margin-top: 4px;
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.hire-history-event p {
		margin: 8px 0 0;
		padding: 7px 9px;
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.05);
		color: #991b1b;
		font-size: 11px;
		font-weight: 700;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}

	.hire-history-pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 18px;
		border-top: 1px solid #e5edf5;
		background: var(--color-surface);
	}

	.hire-history-pagination span {
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 800;
	}

	.secondary-button {
		height: 32px;
		padding: 0 14px;
		border: 1px solid #cbd5e1;
		border-radius: 8px;
		background: var(--color-surface);
		color: var(--text-primary);
		font-size: 11px;
		font-weight: 900;
		cursor: pointer;
	}

	.secondary-button:hover:not(:disabled) {
		background: #e2e8f0;
	}

	.secondary-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.profile-toast-layer {
		position: fixed;
		top: 18px;
		right: 18px;
		z-index: 30000;
		display: grid;
		gap: 10px;
		width: min(390px, calc(100vw - 36px));
		pointer-events: none;
	}

	.profile-toast {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: start;
		gap: 10px;
		padding: 11px 12px;
		border: 1px solid #d9e2ec;
		border-radius: 12px;
		background: rgba(248, 250, 252, 0.98);
		box-shadow: 0 14px 34px rgba(15, 23, 42, 0.24);
		backdrop-filter: blur(10px);
		pointer-events: auto;
		animation: profile-toast-in 0.22s ease both;
	}

	.profile-toast-copy {
		display: grid;
		gap: 3px;
		min-width: 0;
	}

	.profile-toast-copy strong {
		color: #0f172a !important;
		font-size: 12px;
		font-weight: 900;
	}

	.profile-toast-copy span {
		overflow-wrap: anywhere;
		color: #334155 !important;
		font-size: 12px;
		font-weight: 700;
		line-height: 1.35;
		text-transform: none;
	}

	.profile-toast.success {
		border-color: #bbf7d0;
		background: rgba(240, 253, 244, 0.98);
	}

	.profile-toast.success .profile-toast-copy strong {
		color: #052e16 !important;
	}

	.profile-toast.success .profile-toast-copy span {
		color: #14532d !important;
	}

	.profile-toast.danger {
		border-color: #fecaca;
		background: rgba(255, 241, 242, 0.98);
	}

	.profile-toast.danger .profile-toast-copy strong {
		color: #881337 !important;
	}

	.profile-toast.danger .profile-toast-copy span {
		color: #9f1239 !important;
	}

	.profile-toast-close {
		width: 24px;
		height: 24px;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.08);
		color: #334155 !important;
		font-size: 17px;
		font-weight: 900;
		line-height: 1;
	}

	.profile-toast-close:hover:not(:disabled) {
		background: rgba(15, 23, 42, 0.14);
	}

	@keyframes profile-toast-in {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}

		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.loading-card {
		width: min(520px, calc(100vw - 32px));
		margin: 14vh auto 0;
		padding: 16px;
		display: flex;
		align-items: center;
		gap: 16px;
		box-sizing: border-box;
	}

	.loading-card h2 {
		margin: 0;
		color: var(--text-primary);
		font-size: 17px;
		font-weight: 900;
	}

	.loading-card p {
		margin: 7px 0 0;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
		line-height: 1.45;
	}

	.loader {
		width: 36px;
		height: 36px;
		border-radius: 999px;
		border: 4px solid #dbeafe;
		border-top-color: #2563eb;
		animation: spin 0.85s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 1100px) {
		.summary-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.content-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 760px) {
		.profile-page {
			padding: 8px;
		}

		.profile-hero {
			flex-direction: column;
			align-items: flex-start;
		}

		.hero-left {
			align-items: flex-start;
		}

		.avatar {
			width: 52px;
			height: 52px;
			font-size: 17px;
		}

		.refresh-button {
			width: 100%;
		}

		.hero-actions {
			width: 100%;
			flex-direction: column;
			align-items: stretch;
		}

		.telegram-bot-button {
			width: 100%;
		}

		.summary-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 8px;
		}

		.summary-card {
			min-height: 72px;
			padding: 10px 12px;
		}

		.summary-label {
			font-size: 9px;
			line-height: 1.2;
			letter-spacing: 0.03em;
		}

		.summary-card strong {
			margin-top: 6px;
			font-size: 18px;
			line-height: 1.1;
		}

		.form-actions {
			width: 100%;
		}

		.primary-button {
			width: 100%;
		}

		.hire-history-timeline {
			grid-template-columns: 1fr;
		}

		.hire-history-pagination {
			flex-wrap: wrap;
		}
	}
</style>
