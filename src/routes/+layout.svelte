<script>
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Sidebar from '$lib/Sidebar.svelte';
	import { initAuth, isLoggedIn, authReady } from '$lib/stores/authStore.js';

	let { children } = $props();

	let isLoginPage = $derived(page.url.pathname === '/');

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

{#if !$authReady}
	<div class="loading-screen">Loading...</div>
{:else if isLoginPage}
	{@render children()}
{:else}
	<div class="app-shell">
		<Sidebar />

		<main class="app-main">
			{@render children()}
		</main>
	</div>
{/if}

<style>
	@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');

	:global(html),
	:global(body) {
		width: 100%;
		height: 100%;
		margin: 0;
		padding: 0;
		overflow: hidden;
		font-family:
			'Plus Jakarta Sans',
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
		background: #f4f6f8;
	}

	:global(*) {
		box-sizing: border-box;
	}

	.app-shell {
		width: 100vw;
		height: 100vh;
		display: flex;
		overflow: hidden;
		background: #f4f6f8;
	}

	.app-main {
		flex: 1 1 auto;
		width: 100%;
		min-width: 0;
		height: 100vh;
		min-height: 0;
		overflow: hidden;
		background: #f4f6f8;
	}

	.loading-screen {
		width: 100vw;
		height: 100vh;
		margin: 0;
		padding: 0;
		display: grid;
		place-items: center;
		color: #334155;
		font-size: 14px;
		font-weight: 900;
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
		background: #f8fafc;
	}
</style>
