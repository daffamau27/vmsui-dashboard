<script>
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { apiRequest } from '$lib/api/authApi.js';

	let username = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let verifying = $state(true);
	let submitting = $state(false);
	let tokenVerified = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');
	let platform = $state('');
	let platformUserId = $state('');

	let token = $derived(page.url.searchParams.get('token') || '');
	let canSubmit = $derived(
		Boolean(tokenVerified && username.trim() && password && !verifying && !submitting && !successMessage)
	);

	function getApiMessage(error, fallback = 'Request failed.') {
		return error?.data?.message || error?.message || fallback;
	}

	async function verifyToken() {
		errorMessage = '';
		successMessage = '';
		platform = '';
		platformUserId = '';
		tokenVerified = false;

		if (!token) {
			verifying = false;
			errorMessage = 'Token link tidak ditemukan. Silakan buka ulang link dari VMSUI AI Telegram.';
			return;
		}

		verifying = true;

		try {
			const result = await apiRequest(
				`/auth/account-link/verify-token?${new URLSearchParams({ token }).toString()}`,
				{ method: 'GET' }
			);

			platform = result?.data?.platform || '';
			platformUserId = result?.data?.platformUserId || result?.data?.platform_user_id || '';
			tokenVerified = true;
		} catch (error) {
			errorMessage = getApiMessage(
				error,
				'Token link tidak valid, sudah digunakan, atau sudah kedaluwarsa.'
			);
		} finally {
			verifying = false;
		}
	}

	async function handleSubmit(event) {
		event.preventDefault();

		if (!canSubmit) return;

		errorMessage = '';
		successMessage = '';
		submitting = true;

		try {
			const result = await apiRequest('/auth/account-link/confirm', {
				method: 'POST',
				body: JSON.stringify({
					username: username.trim(),
					password,
					token
				})
			});

			successMessage =
				result?.message ||
				'Akun berhasil dihubungkan. Silakan kembali ke VMSUI AI Telegram untuk melanjutkan.';
			password = '';
		} catch (error) {
			errorMessage = getApiMessage(error, 'Username/password salah atau token link tidak valid.');
		} finally {
			submitting = false;
		}
	}

	onMount(() => {
		verifyToken();
	});
</script>

<svelte:head>
	<title>VMS - Link Telegram Account</title>
</svelte:head>

<section class="link-page">
	<div class="link-card">
		<div class="brand">
			<img src="/assets/SeMAR.png" alt="SeMAR" />
			<div>
				<p>VMS Account Link</p>
				<h1>Connect to Telegram Account</h1>
			</div>
		</div>

		<p class="intro">
			Enter your VMS username and password to link your account with VMSUI AI Telegram. Please ensure that you are using the correct credentials.
		</p>

		{#if verifying}
			<div class="notice neutral">
				<span class="spinner" aria-hidden="true"></span>
				Checking token...
			</div>
		{/if}

		{#if errorMessage}
			<div class="notice error">{errorMessage}</div>
		{/if}

		{#if successMessage}
			<div class="success-panel">
				<div class="success-icon" aria-hidden="true">✓</div>
				<h2>Account connected successfully</h2>
				<p>{successMessage}</p>
				<strong>Please go back to VMSUI AI Telegram.</strong>
			</div>
		{:else if tokenVerified}
			<form class="link-form" onsubmit={handleSubmit}>
				<label class="field">
					<span>Username</span>
					<input
						type="text"
						bind:value={username}
						placeholder="Enter VMS username"
						autocomplete="username"
						disabled={verifying || submitting}
					/>
				</label>

				<label class="field">
					<span>Password</span>
					<div class="password-wrap">
						<input
							type={showPassword ? 'text' : 'password'}
							bind:value={password}
							placeholder="Enter VMS password"
							autocomplete="current-password"
							disabled={verifying || submitting}
						/>
						<button
							type="button"
							class="ghost-btn"
							onclick={() => (showPassword = !showPassword)}
							disabled={verifying || submitting}
						>
							{showPassword ? 'Hide' : 'Show'}
						</button>
					</div>
				</label>

				<label class="field">
					<span>Token</span>
					<input type="text" value={token} readonly aria-readonly="true" />
				</label>

				<button class="submit-btn" type="submit" disabled={!canSubmit}>
					{submitting ? 'Connecting...' : 'Submit'}
				</button>
			</form>
		{/if}
	</div>
</section>

<style>
	:global(html),
	:global(body) {
		overflow: auto;
	}

	.link-page {
		width: 100vw;
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 28px;
		background:
			radial-gradient(circle at 20% 18%, rgba(59, 130, 246, 0.28), transparent 30%),
			radial-gradient(circle at 80% 10%, rgba(14, 165, 233, 0.16), transparent 30%),
			linear-gradient(135deg, #07111f 0%, #0f172a 52%, #111827 100%);
		color: #e5edf7;
	}

	.link-card {
		width: min(100%, 460px);
		display: grid;
		gap: 18px;
		padding: 28px;
		border: 1px solid rgba(148, 163, 184, 0.22);
		border-radius: 24px;
		background: rgba(15, 23, 42, 0.9);
		box-shadow: 0 24px 70px rgba(0, 0, 0, 0.38);
		backdrop-filter: blur(18px);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 14px;
	}

	.brand img {
		width: 58px;
		height: 58px;
		object-fit: contain;
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.06);
		padding: 8px;
	}

	.brand p,
	.brand h1,
	.intro,
	.success-panel h2,
	.success-panel p {
		margin: 0;
	}

	.brand p {
		color: #60a5fa;
		font-size: 11px;
		font-weight: 900;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.brand h1 {
		margin-top: 4px;
		color: #f8fafc;
		font-size: clamp(24px, 6vw, 34px);
		line-height: 1.05;
		letter-spacing: -0.04em;
	}

	.intro {
		color: #a8b3c7;
		font-size: 14px;
		line-height: 1.65;
	}

	.link-form {
		display: grid;
		gap: 14px;
	}

	.field {
		display: grid;
		gap: 8px;
		color: #cbd5e1;
		font-size: 12px;
		font-weight: 850;
	}

	.field input {
		width: 100%;
		height: 46px;
		border: 1px solid rgba(148, 163, 184, 0.3);
		border-radius: 14px;
		background: rgba(15, 23, 42, 0.72);
		color: #f8fafc;
		padding: 0 14px;
		font: inherit;
		outline: none;
		transition:
			border-color 0.2s ease,
			box-shadow 0.2s ease,
			background 0.2s ease;
	}

	.field input:focus {
		border-color: #60a5fa;
		box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.15);
	}

	.field input[readonly] {
		color: #93c5fd;
		background: rgba(30, 41, 59, 0.64);
		cursor: default;
	}

	.field input:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.password-wrap {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 8px;
	}

	.ghost-btn,
	.submit-btn {
		border: 0;
		border-radius: 14px;
		font-weight: 900;
		cursor: pointer;
		transition:
			transform 0.18s ease,
			opacity 0.18s ease,
			background 0.18s ease;
	}

	.ghost-btn {
		padding: 0 14px;
		background: rgba(96, 165, 250, 0.13);
		color: #bfdbfe;
	}

	.ghost-btn:hover,
	.submit-btn:hover {
		transform: translateY(-1px);
	}

	.submit-btn {
		height: 48px;
		margin-top: 4px;
		background: linear-gradient(135deg, #2563eb, #0284c7);
		color: #fff;
		box-shadow: 0 14px 30px rgba(37, 99, 235, 0.3);
	}

	.ghost-btn:disabled,
	.submit-btn:disabled {
		opacity: 0.52;
		cursor: not-allowed;
		transform: none;
	}

	.notice {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		border-radius: 14px;
		font-size: 13px;
		font-weight: 800;
		line-height: 1.45;
	}

	.notice.neutral {
		border: 1px solid rgba(96, 165, 250, 0.24);
		background: rgba(96, 165, 250, 0.1);
		color: #bfdbfe;
	}

	.notice.error {
		border: 1px solid rgba(248, 113, 113, 0.3);
		background: rgba(127, 29, 29, 0.24);
		color: #fecaca;
	}

	.spinner {
		width: 18px;
		height: 18px;
		border: 2px solid rgba(191, 219, 254, 0.25);
		border-top-color: #bfdbfe;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.token-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.token-meta span {
		border-radius: 999px;
		background: rgba(96, 165, 250, 0.12);
		color: #bfdbfe;
		padding: 6px 10px;
		font-size: 11px;
		font-weight: 900;
	}

	.success-panel {
		display: grid;
		justify-items: center;
		gap: 12px;
		text-align: center;
		padding: 22px 16px;
		border: 1px solid rgba(34, 197, 94, 0.28);
		border-radius: 20px;
		background: rgba(20, 83, 45, 0.2);
	}

	.success-icon {
		width: 54px;
		height: 54px;
		display: grid;
		place-items: center;
		border-radius: 18px;
		background: #22c55e;
		color: #052e16;
		font-size: 28px;
		font-weight: 1000;
	}

	.success-panel h2 {
		color: #dcfce7;
		font-size: 22px;
	}

	.success-panel p {
		color: #bbf7d0;
		line-height: 1.6;
	}

	.success-panel strong {
		color: #f8fafc;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 520px) {
		.link-page {
			padding: 16px;
		}

		.link-card {
			padding: 22px;
			border-radius: 20px;
		}

		.password-wrap {
			grid-template-columns: 1fr;
		}

		.ghost-btn {
			height: 42px;
		}
	}
</style>
