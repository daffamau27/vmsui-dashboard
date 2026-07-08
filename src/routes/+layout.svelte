<script>
	import './layout.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Sidebar from '$lib/Sidebar.svelte';
	import { initAuth, isLoggedIn, authReady } from '$lib/stores/authStore.js';
	import { activeMenu } from '$lib/stores/appNavigation.svelte.js';
	import { activeVesselMenu } from '$lib/stores/vesselNavigation.svelte.js';

	let { children } = $props();

	const pageTitles = {
		profile: 'Profile',
		administrator: 'Administrator',
		'fleet-view': 'Fleet View',
		vessel: 'Vessel',
		'all-vessel-summary': 'All Vessel Summary',
		alarm: 'Alarm',
		'audit-log': 'Audit Log',
		'voyage-plans': 'Voyage Plans'
	};

	const vesselPageTitles = {
		dashboard: 'Dashboard',
		'daily-report': 'Daily Report',
		'monthly-report': 'Monthly Report',
		'periodical-report': 'Periodical Report',
		'voyage-plan': 'Voyage Plan',
		trace: 'Trace',
		'data-log': 'Data Log',
		'fuel-management': 'Fuel Management'
	};

	let isLoginPage = $derived(page.url.pathname === '/');
	let currentPageTitle = $derived(
		isLoginPage
			? 'Login'
			: $activeMenu === 'vessel'
				? vesselPageTitles[$activeVesselMenu] || pageTitles.vessel
				: pageTitles[$activeMenu] || 'Dashboard'
	);
	let documentTitle = $derived(`VMS - ${currentPageTitle}`);

	onMount(async () => {
		await initAuth();
	});

	$effect(() => {
		if (!$authReady) return;

		if (page.url.pathname !== '/' && !$isLoggedIn) {
			goto('/');
			return;
		}

		if (page.url.pathname === '/' && $isLoggedIn) {
			goto('/app');
		}
	});
</script>

<svelte:head>
	<title>{documentTitle}</title>
	<link rel="icon" type="image/png" href="/assets/logo.png?v=2" />
	<link rel="shortcut icon" type="image/png" href="/assets/logo.png?v=2" />
	<link rel="apple-touch-icon" href="/assets/logo.png?v=2" />
</svelte:head>

{#if !$authReady}
	<div class="loading-screen">
		<div class="loading-brand">⚓</div>
		<div class="loading-spinner" aria-hidden="true"></div>
		<span>Initializing...</span>
	</div>
{:else if isLoginPage}
	{@render children()}
{:else}
	<div class:fleet-floating-shell={$activeMenu === 'fleet-view'} class="app-shell">
		<Sidebar />

		<main class="app-main">
			{@render children()}
		</main>
	</div>
{/if}

<style>
	:global(html),
	:global(body) {
		width: 100%;
		height: 100%;
		margin: 0;
		padding: 0;
		overflow: hidden;
		font-family:
			'Plus Jakarta Sans',
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
		background: var(--color-base);
	}

	:global(*) {
		box-sizing: border-box;
	}

	.app-shell {
		width: 100vw;
		height: 100vh;
		display: flex;
		overflow: hidden;
		background: var(--color-base);
	}

	.app-main {
		flex: 1 1 auto;
		width: 100%;
		min-width: 0;
		height: 100vh;
		min-height: 0;
		overflow: hidden;
		background: var(--color-base);
	}

	.app-shell.fleet-floating-shell .app-main {
		flex: 0 0 100vw;
		width: 100vw;
		max-width: 100vw;
	}

	.loading-screen {
		width: 100vw;
		height: 100vh;
		margin: 0;
		padding: 0;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 14px;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-family:
			'Plus Jakarta Sans',
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
		background:
			radial-gradient(circle at 35% 25%, rgba(59, 130, 246, 0.16), transparent 28%),
			var(--color-base);
	}

	.loading-brand {
		width: 52px;
		height: 52px;
		display: grid;
		place-items: center;
		border-radius: 16px;
		background: linear-gradient(135deg, var(--color-accent), var(--color-accent-hover));
		color: #fff;
		font-size: 24px;
		box-shadow: 0 12px 28px rgba(37, 99, 235, 0.35);
		animation: loadingBrand 1.6s var(--ease-spring) infinite;
	}

	.loading-spinner {
		width: 24px;
		height: 24px;
		border: 2px solid rgba(59, 130, 246, 0.18);
		border-top-color: var(--color-accent);
		border-radius: 50%;
		animation: spinner 0.75s linear infinite;
	}

	@keyframes spinner {
		to { transform: rotate(360deg); }
	}

	@keyframes loadingBrand {
		0%, 100% { transform: translateY(0); opacity: 1; }
		50% { transform: translateY(-3px); opacity: 0.85; }
	}
</style>
