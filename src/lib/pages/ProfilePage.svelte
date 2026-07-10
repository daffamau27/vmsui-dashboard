<script>
	import { onMount } from 'svelte';
	import {
		getCurrentUserApi,
		getMyVesselsApi,
		getMyAssetsApi,
		updateCurrentUserApi,
		changePasswordApi
	} from '$lib/api/authApi.js';
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import AuditLogPage from '$lib/pages/AuditLogPage.svelte';

	let loading = true;
	let savingProfile = false;
	let changingPassword = false;

	let errorMessage = '';
	let successMessage = '';

	let currentUser = null;
	let vessels = [];
	let assets = [];
	let auditRefreshToken = 0;

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
			vessels = Array.isArray(vesselResponse?.data) ? vesselResponse.data : [];
			assets = Array.isArray(assetResponse?.data) ? assetResponse.data : [];

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

<svelte:head>
	<title>Profile</title>
</svelte:head>

<section class="profile-page">
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

				<button class="refresh-button" type="button" on:click={loadProfilePage}> Refresh </button>
			</header>

			{#if errorMessage}
				<div class="alert error">
					{errorMessage}
				</div>
			{/if}

			{#if successMessage}
				<div class="alert success">
					{successMessage}
				</div>
			{/if}

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
										<p>{vessel.deviceName || '-'} · ID: {vessel.id}</p>
										<small>{vessel.deviceId || '-'}</small>
									</div>
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
										<p>{asset.thingsboardName || '-'}</p>
										<small>{asset.assetId || '-'}</small>
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
	.primary-button {
		height: 32px;
		padding: 0 12px;
		border: none;
		font-size: 11px;
		font-weight: 900;
		cursor: pointer;
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
		grid-template-columns: 42px minmax(0, 1fr);
		gap: 12px;
		align-items: center;
		padding: 12px;
		border-radius: 12px;
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
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

	.alert {
		padding: 10px 12px;
		border-radius: 10px;
		font-size: 12px;
		font-weight: 900;
	}

	.alert.error {
		background: var(--color-danger-muted);
		color: #b91c1c;
		border: 1px solid #fecaca;
	}

	.alert.success {
		background: var(--color-success-muted);
		color: #047857;
		border: 1px solid #bbf7d0;
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
	}
</style>
