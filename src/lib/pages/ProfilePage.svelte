<script>
	import { onMount } from 'svelte';
	import {
		getCurrentUserApi,
		getMyVesselsApi,
		getMyAssetsApi,
		updateCurrentUserApi,
		changePasswordApi
	} from '$lib/api/authApi.js';

	let loading = true;
	let savingProfile = false;
	let changingPassword = false;

	let errorMessage = '';
	let successMessage = '';

	let currentUser = null;
	let vessels = [];
	let assets = [];

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
			errorMessage = error.message || 'Gagal memuat data profil.';
		} finally {
			loading = false;
		}
	}

	async function updateProfile() {
		clearMessage();

		if (!profileForm.name.trim()) {
			errorMessage = 'Nama tidak boleh kosong.';
			return;
		}

		if (!profileForm.username.trim()) {
			errorMessage = 'Username tidak boleh kosong.';
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

			successMessage = response?.message || 'Profil berhasil diperbarui.';
		} catch (error) {
			errorMessage = error.message || 'Gagal memperbarui profil.';
		} finally {
			savingProfile = false;
		}
	}

	async function changePassword() {
		clearMessage();

		if (!passwordForm.oldPassword || !passwordForm.newPassword) {
			errorMessage = 'Password lama dan password baru wajib diisi.';
			return;
		}

		if (passwordForm.newPassword.length < 6) {
			errorMessage = 'Password baru minimal 6 karakter.';
			return;
		}

		if (passwordForm.newPassword !== passwordForm.confirmPassword) {
			errorMessage = 'Konfirmasi password baru tidak sama.';
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

			successMessage = response?.message || 'Password berhasil diganti.';
		} catch (error) {
			errorMessage = error.message || 'Gagal mengganti password.';
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

		return new Intl.DateTimeFormat('id-ID', {
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
		<div class="loading-card">
			<div class="loader"></div>
			<div>
				<h2>Memuat Profil</h2>
				<p>Mengambil data user, vessel, dan asset yang dapat diakses.</p>
			</div>
		</div>
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
						<p>Kelola informasi akun, akses vessel, akses asset, dan keamanan password.</p>

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
					<p>{currentUser?.email || 'Email belum diisi'}</p>
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
					<p>{isSuperAdmin ? 'Akses penuh sistem' : 'Akses terbatas'}</p>
				</article>
			</section>

			<section class="content-grid">
				<article class="panel profile-panel">
					<div class="panel-header">
						<div>
							<h2>Informasi Profil</h2>
							<p>Perbarui nama, username, dan email akun.</p>
						</div>
					</div>

					<form class="form-grid" on:submit|preventDefault={updateProfile}>
						<label>
							<span>Nama</span>
							<input
								type="text"
								bind:value={profileForm.name}
								placeholder="Masukkan nama"
								autocomplete="name"
							/>
						</label>

						<label>
							<span>Username</span>
							<input
								type="text"
								bind:value={profileForm.username}
								placeholder="Masukkan username"
								autocomplete="username"
							/>
						</label>

						<label>
							<span>Email</span>
							<input
								type="email"
								bind:value={profileForm.email}
								placeholder="Masukkan email"
								autocomplete="email"
							/>
						</label>

						<div class="form-actions">
							<button class="primary-button" type="submit" disabled={savingProfile}>
								{savingProfile ? 'Menyimpan...' : 'Simpan Profil'}
							</button>
						</div>
					</form>
				</article>

				<article class="panel password-panel">
					<div class="panel-header">
						<div>
							<h2>Ganti Password</h2>
							<p>Gunakan password baru yang kuat dan mudah diingat.</p>
						</div>
					</div>

					<form class="form-grid" on:submit|preventDefault={changePassword}>
						<label>
							<span>Password Lama</span>
							<input
								type="password"
								bind:value={passwordForm.oldPassword}
								placeholder="Masukkan password lama"
								autocomplete="current-password"
							/>
						</label>

						<label>
							<span>Password Baru</span>
							<input
								type="password"
								bind:value={passwordForm.newPassword}
								placeholder="Masukkan password baru"
								autocomplete="new-password"
							/>
						</label>

						<label>
							<span>Konfirmasi Password Baru</span>
							<input
								type="password"
								bind:value={passwordForm.confirmPassword}
								placeholder="Ulangi password baru"
								autocomplete="new-password"
							/>
						</label>

						<div class="form-actions">
							<button class="primary-button danger" type="submit" disabled={changingPassword}>
								{changingPassword ? 'Mengganti...' : 'Ganti Password'}
							</button>
						</div>
					</form>
				</article>

				<article class="panel access-panel">
					<div class="panel-header">
						<div>
							<h2>Vessel Saya</h2>
							<p>Daftar vessel yang dapat diakses oleh user saat ini.</p>
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
						<div class="empty-state">Belum ada vessel yang dapat diakses.</div>
					{/if}
				</article>

				<article class="panel access-panel">
					<div class="panel-header">
						<div>
							<h2>Asset Saya</h2>
							<p>Daftar asset yang dapat diakses oleh user saat ini.</p>
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
						<div class="empty-state">Belum ada asset yang dapat diakses.</div>
					{/if}
				</article>
			</section>
		</section>
	{/if}
</section>

<style>
	:global(body) {
		background: #f4f6f8;
	}

	.profile-page {
		width: 100%;
		height: 100%;
		min-height: 100vh;
		padding: 18px;
		box-sizing: border-box;
		background:
			radial-gradient(circle at top left, rgba(33, 150, 243, 0.12), transparent 34%),
			linear-gradient(180deg, #f7f9fc 0%, #eef2f7 100%);
		color: #162033;
		overflow: auto;
	}

	.profile-shell {
		width: 100%;
		max-width: 1440px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.profile-hero {
		min-height: 150px;
		padding: 22px;
		border-radius: 28px;
		background: linear-gradient(135deg, rgba(17, 24, 39, 0.96), rgba(30, 64, 175, 0.9)), #111827;
		color: #ffffff;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 18px;
		box-shadow: 0 20px 50px rgba(15, 23, 42, 0.18);
	}

	.hero-left {
		display: flex;
		align-items: center;
		gap: 18px;
		min-width: 0;
	}

	.avatar {
		width: 82px;
		height: 82px;
		border-radius: 26px;
		display: grid;
		place-items: center;
		flex-shrink: 0;
		background: rgba(255, 255, 255, 0.16);
		border: 1px solid rgba(255, 255, 255, 0.22);
		color: #ffffff;
		font-size: 28px;
		font-weight: 800;
		letter-spacing: 0.04em;
		backdrop-filter: blur(10px);
	}

	.page-kicker {
		margin-bottom: 6px;
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #bfdbfe;
	}

	.profile-hero h1 {
		margin: 0;
		font-size: clamp(26px, 3vw, 40px);
		line-height: 1.1;
		font-weight: 850;
		letter-spacing: -0.04em;
	}

	.profile-hero p {
		max-width: 720px;
		margin: 8px 0 0;
		color: #dbeafe;
		font-size: 14px;
		line-height: 1.6;
	}

	.hero-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 14px;
	}

	.hero-badges span {
		display: inline-flex;
		align-items: center;
		min-height: 30px;
		padding: 0 11px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.12);
		border: 1px solid rgba(255, 255, 255, 0.16);
		color: #e5efff;
		font-size: 12px;
		font-weight: 700;
	}

	.hero-badges span.super-admin {
		background: rgba(34, 197, 94, 0.2);
		border-color: rgba(134, 239, 172, 0.35);
		color: #dcfce7;
	}

	.refresh-button {
		height: 42px;
		padding: 0 16px;
		border: 0;
		border-radius: 14px;
		background: #ffffff;
		color: #172554;
		font-weight: 800;
		cursor: pointer;
		box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
		transition:
			transform 0.18s ease,
			box-shadow 0.18s ease,
			background 0.18s ease;
	}

	.refresh-button:hover {
		transform: translateY(-1px);
		background: #eff6ff;
		box-shadow: 0 14px 30px rgba(15, 23, 42, 0.22);
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 14px;
	}

	.summary-card {
		padding: 18px;
		border-radius: 22px;
		background: rgba(255, 255, 255, 0.88);
		border: 1px solid rgba(226, 232, 240, 0.9);
		box-shadow: 0 14px 36px rgba(15, 23, 42, 0.06);
	}

	.summary-label {
		margin-bottom: 8px;
		font-size: 12px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #64748b;
	}

	.summary-card strong {
		display: block;
		font-size: 24px;
		line-height: 1.1;
		color: #0f172a;
		overflow-wrap: anywhere;
	}

	.summary-card p {
		margin: 8px 0 0;
		color: #64748b;
		font-size: 13px;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}

	.content-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 16px;
		align-items: start;
	}

	.panel {
		min-width: 0;
		padding: 20px;
		border-radius: 26px;
		background: rgba(255, 255, 255, 0.94);
		border: 1px solid rgba(226, 232, 240, 0.92);
		box-shadow: 0 18px 45px rgba(15, 23, 42, 0.07);
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		align-items: flex-start;
		margin-bottom: 18px;
	}

	.panel-header h2 {
		margin: 0;
		font-size: 18px;
		letter-spacing: -0.02em;
		color: #0f172a;
	}

	.panel-header p {
		margin: 5px 0 0;
		color: #64748b;
		font-size: 13px;
		line-height: 1.5;
	}

	.form-grid {
		display: grid;
		gap: 14px;
	}

	label {
		display: grid;
		gap: 7px;
	}

	label span {
		color: #334155;
		font-size: 13px;
		font-weight: 800;
	}

	input {
		width: 100%;
		height: 44px;
		padding: 0 13px;
		box-sizing: border-box;
		border-radius: 14px;
		border: 1px solid #dbe3ef;
		background: #f8fafc;
		color: #0f172a;
		font-size: 14px;
		outline: none;
		transition:
			border-color 0.18s ease,
			box-shadow 0.18s ease,
			background 0.18s ease;
	}

	input:focus {
		border-color: #2563eb;
		background: #ffffff;
		box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 4px;
	}

	.primary-button {
		min-height: 42px;
		padding: 0 16px;
		border: 0;
		border-radius: 14px;
		background: linear-gradient(135deg, #2563eb, #1d4ed8);
		color: #ffffff;
		font-size: 13px;
		font-weight: 850;
		cursor: pointer;
		box-shadow: 0 12px 24px rgba(37, 99, 235, 0.25);
		transition:
			transform 0.18s ease,
			box-shadow 0.18s ease,
			opacity 0.18s ease;
	}

	.primary-button:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 16px 30px rgba(37, 99, 235, 0.32);
	}

	.primary-button:disabled {
		cursor: not-allowed;
		opacity: 0.65;
	}

	.primary-button.danger {
		background: linear-gradient(135deg, #ef4444, #b91c1c);
		box-shadow: 0 12px 24px rgba(239, 68, 68, 0.23);
	}

	.count-pill {
		min-width: 34px;
		height: 30px;
		padding: 0 10px;
		border-radius: 999px;
		background: #eff6ff;
		color: #1d4ed8;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 13px;
		font-weight: 850;
	}

	.list-scroll {
		max-height: 360px;
		overflow: auto;
		padding-right: 4px;
		display: grid;
		gap: 10px;
	}

	.access-row {
		display: grid;
		grid-template-columns: 42px minmax(0, 1fr);
		gap: 12px;
		align-items: center;
		padding: 12px;
		border-radius: 18px;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
	}

	.access-icon {
		width: 42px;
		height: 42px;
		border-radius: 15px;
		display: grid;
		place-items: center;
		color: #ffffff;
		font-weight: 900;
		font-size: 14px;
	}

	.vessel-icon {
		background: linear-gradient(135deg, #0ea5e9, #2563eb);
	}

	.asset-icon {
		background: linear-gradient(135deg, #10b981, #047857);
	}

	.access-row strong {
		display: block;
		color: #0f172a;
		font-size: 14px;
		overflow-wrap: anywhere;
	}

	.access-row p {
		margin: 4px 0 0;
		color: #64748b;
		font-size: 12px;
		overflow-wrap: anywhere;
	}

	.access-row small {
		display: block;
		margin-top: 4px;
		color: #94a3b8;
		font-size: 11px;
		overflow-wrap: anywhere;
	}

	.empty-state {
		padding: 24px;
		border-radius: 18px;
		background: #f8fafc;
		border: 1px dashed #cbd5e1;
		color: #64748b;
		text-align: center;
		font-size: 13px;
		font-weight: 700;
	}

	.alert {
		padding: 13px 15px;
		border-radius: 16px;
		font-size: 13px;
		font-weight: 750;
		border: 1px solid transparent;
	}

	.alert.error {
		background: #fef2f2;
		color: #991b1b;
		border-color: #fecaca;
	}

	.alert.success {
		background: #ecfdf5;
		color: #065f46;
		border-color: #bbf7d0;
	}

	.loading-card {
		width: min(520px, calc(100vw - 32px));
		margin: 14vh auto 0;
		padding: 24px;
		border-radius: 26px;
		background: #ffffff;
		border: 1px solid #e2e8f0;
		box-shadow: 0 20px 50px rgba(15, 23, 42, 0.1);
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.loading-card h2 {
		margin: 0;
		color: #0f172a;
		font-size: 18px;
	}

	.loading-card p {
		margin: 6px 0 0;
		color: #64748b;
		font-size: 13px;
		line-height: 1.5;
	}

	.loader {
		width: 42px;
		height: 42px;
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

	@media (max-width: 720px) {
		.profile-page {
			padding: 12px;
		}

		.profile-hero {
			flex-direction: column;
			align-items: stretch;
			border-radius: 22px;
		}

		.hero-left {
			align-items: flex-start;
		}

		.avatar {
			width: 64px;
			height: 64px;
			border-radius: 20px;
			font-size: 22px;
		}

		.refresh-button {
			width: 100%;
		}

		.summary-grid {
			grid-template-columns: 1fr;
		}

		.panel {
			padding: 16px;
			border-radius: 22px;
		}

		.form-actions {
			justify-content: stretch;
		}

		.primary-button {
			width: 100%;
		}
	}
</style>
