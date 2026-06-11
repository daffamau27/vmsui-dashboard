<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { activeMenu, setActiveMenu } from '$lib/stores/appNavigation.svelte.js';
	import { onMount, onDestroy, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { logout, currentUser } from '$lib/stores/authStore.js';
	import { apiRequest } from '$lib/api/authApi.js';

	const menus = [
		{
			icon: '/assets/profile.svg',
			title: 'Profile',
			key: 'profile',
			type: 'image',
			alwaysShow: true
		},
		{
			icon: '/assets/fleetview.svg',
			title: 'Fleet View',
			key: 'fleet-view',
			type: 'image',
			permissions: ['access_fleet_view']
		},
		{
			icon: '/assets/vessel.svg',
			title: 'Vessel',
			key: 'vessel',
			type: 'image',
			alwaysShow: true
		},
		{
			icon: '▤',
			title: 'All Vessel Summary',
			key: 'all-vessel-summary',
			type: 'text',
			permissions: ['access_all_vessel_summary']
		},
		{
			icon: '🔔',
			title: 'Alarm',
			key: 'alarm',
			type: 'text',
			permissions: ['access_alarm']
		},
		{
			icon: '☷',
			title: 'Audit Log',
			key: 'audit-log',
			type: 'text',
			permissions: ['access_audit_logs']
		},
		{
			icon: '⌁',
			title: 'Voyage Plans',
			key: 'voyage-plans',
			type: 'text',
			permissions: ['access_voyage_plan_fleet']
		}
	];

	const itemHeight = 46;

	let permissionLoading = $state(true);
	let permissionMode = $state('selected');
	let permissions = $state([]);

	function applyPermissionAccess(permissionAccess = {}) {
		permissionMode = permissionAccess?.mode || 'selected';
		permissions = Array.isArray(permissionAccess?.permissions) ? permissionAccess.permissions : [];
	}

	function hasPermission(menu) {
		if (menu?.alwaysShow) return true;
		if (permissionMode === 'all') return true;

		const permissionKeys = Array.isArray(menu?.permissions) ? menu.permissions : [];
		if (!permissionKeys.length) return true;

		return permissionKeys.some((permissionKey) => permissions.includes(permissionKey));
	}

	let visibleMenus = $derived(menus.filter((menu) => hasPermission(menu)));

	let activeIndex = $derived(visibleMenus.findIndex((menu) => menu.key === $activeMenu));

	let mobileSidebarOpen = $state(false);

	let showLogoutConfirm = $state(false);
	let logoutConfirmBox;

	async function loadCurrentUserPermissions() {
		permissionLoading = true;

		try {
			const response = await apiRequest('/users/current-user', {
				method: 'GET'
			});

			applyPermissionAccess(response?.data?.permissionAccess || {});

			console.log('[SIDEBAR][CURRENT_USER_PERMISSION]', {
				mode: permissionMode,
				permissions
			});
		} catch (err) {
			console.error('[SIDEBAR][CURRENT_USER_PERMISSION][ERROR]', err);
			permissionMode = 'selected';
			permissions = [];
		} finally {
			permissionLoading = false;
		}
	}

	$effect(() => {
		if (permissionLoading) return;
		if (!visibleMenus.length) return;

		const activeMenuStillAllowed = visibleMenus.some((menu) => menu.key === $activeMenu);

		if (!activeMenuStillAllowed) {
			setActiveMenu(visibleMenus[0].key);
		}
	});

	function openLogoutConfirm() {
		showLogoutConfirm = true;

		tick().then(() => {
			logoutConfirmBox?.focus();
		});
	}

	function closeLogoutConfirm() {
		showLogoutConfirm = false;
	}

	function confirmLogout() {
		showLogoutConfirm = false;
		logout();
	}

	function handleLogoutOverlayKeydown(event) {
		if (event.key === 'Escape') {
			closeLogoutConfirm();
		}
	}

	function isActive(key) {
		return $activeMenu === key;
	}

	function notifyMobilePanelOpen(panelName) {
		if (!browser) return;

		window.dispatchEvent(
			new CustomEvent('mobile-panel-open', {
				detail: panelName
			})
		);
	}

	function openMobileSidebar() {
		mobileSidebarOpen = true;
		notifyMobilePanelOpen('main-sidebar');
	}

	function closeMobileSidebar() {
		mobileSidebarOpen = false;
	}

	function handleMobilePanelOpen(event) {
		if (event.detail !== 'main-sidebar') {
			mobileSidebarOpen = false;
		}
	}

	async function openMenu(menu) {
		if (!hasPermission(menu)) return;

		setActiveMenu(menu.key);
		mobileSidebarOpen = false;

		if (page.url.pathname !== '/app') {
			await goto('/app');
		}
	}

	onMount(() => {
		if (!browser) return;

		const currentPermissionAccess = $currentUser?.permissionAccess;
		if (currentPermissionAccess) {
			applyPermissionAccess(currentPermissionAccess);
		}

		window.addEventListener('mobile-panel-open', handleMobilePanelOpen);

		setTimeout(() => {
			loadCurrentUserPermissions();
		}, 150);
	});

	onDestroy(() => {
		if (!browser) return;
		window.removeEventListener('mobile-panel-open', handleMobilePanelOpen);
	});
</script>

<button type="button" class="main-sidebar-toggle" onclick={openMobileSidebar}> > </button>

{#if mobileSidebarOpen}
	<button
		type="button"
		class="main-sidebar-backdrop"
		aria-label="Close main sidebar"
		onclick={closeMobileSidebar}
	></button>
{/if}

<aside class:sidebar-open={mobileSidebarOpen} class="sidebar">
	<div class="sidebar-mobile-header">
		<div>
			<h2>Menu</h2>
			<p>Main navigation</p>
		</div>

		<button type="button" class="sidebar-close-btn" onclick={closeMobileSidebar}> × </button>
	</div>

	<div class="sidebar-menu">
		{#if activeIndex >= 0}
			<span class="active-menu-bg" style={`transform: translateY(${activeIndex * itemHeight}px);`}
			></span>

			<span
				class="active-menu-indicator"
				style={`transform: translateY(${activeIndex * itemHeight}px);`}
			></span>
		{/if}

		{#each visibleMenus as menu}
			<button
				class="side-item"
				class:active={isActive(menu.key)}
				title={menu.title}
				onclick={() => openMenu(menu)}
			>
				<span class="side-icon">
					{#if menu.type === 'image'}
						<img src={menu.icon} alt={menu.title} class="side-icon-img" />
					{:else}
						{menu.icon}
					{/if}
				</span>

				<span class="side-label">{menu.title}</span>
			</button>
		{/each}
	</div>

	<div class="side-item logout-button">
		<div class="user-mini">
			<strong>{$currentUser?.name || $currentUser?.username || 'User'}</strong>
			<span>{$currentUser?.email || 'Logged in'}</span>
		</div>

		<button type="button" class="logout-btn" onclick={openLogoutConfirm}> Logout </button>
	</div>
</aside>

{#if showLogoutConfirm}
	<div
		class="logout-confirm-overlay"
		role="presentation"
		onclick={closeLogoutConfirm}
		onkeydown={handleLogoutOverlayKeydown}
	>
		<section
			class="logout-confirm-box"
			role="dialog"
			aria-modal="true"
			aria-labelledby="logout-confirm-title"
			tabindex="-1"
			bind:this={logoutConfirmBox}
			onclick={(event) => event.stopPropagation()}
		>
			<div class="logout-confirm-icon">⏻</div>

			<div class="logout-confirm-content">
				<h3 id="logout-confirm-title">Konfirmasi Logout</h3>
				<p>Apakah Anda yakin ingin keluar dari akun ini?</p>
			</div>

			<div class="logout-confirm-actions">
				<button type="button" class="logout-cancel-btn" onclick={closeLogoutConfirm}>
					Batal
				</button>

				<button type="button" class="logout-confirm-btn" onclick={confirmLogout}>
					Ya, Logout
				</button>
			</div>
		</section>
	</div>
{/if}

<style>
	.main-sidebar-toggle,
	.main-sidebar-backdrop,
	.sidebar-mobile-header,
	.side-label {
		display: none;
	}

	.sidebar {
		width: 48px;
		height: 100vh;
		min-height: 100vh;
		background: #d5d7d9;
		border-right: 1px solid #b6b6b6;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 12px;
		padding-bottom: 12px;
		flex-shrink: 0;
		position: sticky;
		top: 0;
		left: 0;
		z-index: 1000;
	}

	.side-icon-img {
		width: 22px;
		height: 22px;
		display: block;
		object-fit: contain;
	}

	.sidebar-menu {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}

	.active-menu-bg {
		position: absolute;
		top: 0;
		left: 3px;
		width: 42px;
		height: 38px;
		border-radius: 8px;
		background: #b9bbbd;
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
		z-index: 1;
		pointer-events: none;
		transition:
			transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
			opacity 0.2s ease;
	}

	.active-menu-indicator {
		position: absolute;
		top: 0;
		left: 0;
		width: 5px;
		height: 38px;
		border-radius: 0 999px 999px 0;
		background: #111;
		z-index: 4;
		pointer-events: none;
		transition:
			transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
			opacity 0.2s ease;
	}

	.side-item {
		position: relative;
		z-index: 3;
		width: 42px;
		height: 38px;
		border: none;
		border-radius: 8px;
		background: transparent;
		font-size: 20px;
		cursor: pointer;
		color: #333;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: visible;
		transition:
			transform 0.18s ease,
			color 0.2s ease;
	}

	.side-item:hover {
		background: rgba(199, 201, 203, 0.65);
		transform: translateX(2px);
	}

	.side-item:active {
		transform: scale(0.94);
	}

	.side-item.active {
		background: transparent;
		box-shadow: none;
	}

	.side-item.active .side-icon {
		animation: menuPop 0.28s ease;
	}

	.side-icon,
	.side-icon-img {
		position: relative;
		z-index: 5;
	}

	.side-icon-img {
		width: 22px;
		height: 22px;
		display: block;
		object-fit: contain;
	}

	@keyframes menuPop {
		0% {
			transform: scale(0.86);
		}

		70% {
			transform: scale(1.12);
		}

		100% {
			transform: scale(1);
		}
	}

	.logout-button {
		margin-top: auto;
		width: 42px;
		min-height: 38px;
		padding: 0;
		border: none;
		background: transparent;
		color: #8a1f1f;
		font-weight: 700;
		cursor: default;
	}

	.user-mini {
		display: none;
	}

	.logout-btn {
		width: 34px;
		height: 30px;
		border: none;
		border-radius: 10px;
		background: #fee2e2;
		color: #991b1b;
		font-size: 0;
		font-weight: 900;
		cursor: pointer;
		display: grid;
		place-items: center;
		transition:
			background 0.2s ease,
			color 0.2s ease,
			transform 0.18s ease,
			box-shadow 0.2s ease;
	}

	.logout-btn::before {
		content: '⏻';
		font-size: 17px;
		line-height: 1;
	}

	.logout-btn:hover {
		background: #dc2626;
		color: #ffffff;
		transform: translateY(-2px);
		box-shadow: 0 8px 18px rgba(220, 38, 38, 0.25);
	}

	.logout-btn:active {
		transform: scale(0.94);
		box-shadow: none;
	}

	.logout-confirm-overlay {
		position: fixed;
		inset: 0;
		z-index: 3000;
		display: grid;
		place-items: center;
		padding: 16px;
		background: rgba(15, 23, 42, 0.42);
		backdrop-filter: blur(4px);
		animation: logoutOverlayFade 0.18s ease;
	}

	.logout-confirm-box {
		width: min(360px, 100%);
		border: 1px solid rgba(226, 232, 240, 0.95);
		border-radius: 18px;
		background: #ffffff;
		box-shadow:
			0 24px 60px rgba(15, 23, 42, 0.28),
			0 4px 14px rgba(15, 23, 42, 0.12);
		padding: 18px;
		outline: none;
		animation: logoutBoxPop 0.22s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.logout-confirm-icon {
		width: 46px;
		height: 46px;
		margin: 0 auto 12px;
		display: grid;
		place-items: center;
		border-radius: 16px;
		background: #fee2e2;
		color: #dc2626;
		font-size: 22px;
		font-weight: 900;
	}

	.logout-confirm-content {
		text-align: center;
	}

	.logout-confirm-content h3 {
		margin: 0;
		color: #0f172a;
		font-size: 16px;
		font-weight: 900;
		line-height: 1.2;
	}

	.logout-confirm-content p {
		margin: 6px 0 0;
		color: #64748b;
		font-size: 12px;
		font-weight: 600;
		line-height: 1.45;
	}

	.logout-confirm-actions {
		display: flex;
		justify-content: center;
		gap: 10px;
		margin-top: 18px;
	}

	.logout-cancel-btn,
	.logout-confirm-btn {
		height: 34px;
		min-width: 96px;
		border: none;
		border-radius: 999px;
		padding: 0 14px;
		font-size: 12px;
		font-weight: 900;
		cursor: pointer;
		transition:
			transform 0.18s ease,
			box-shadow 0.2s ease,
			background 0.2s ease,
			color 0.2s ease;
	}

	.logout-cancel-btn {
		background: #f1f5f9;
		color: #334155;
	}

	.logout-cancel-btn:hover {
		background: #e2e8f0;
		transform: translateY(-1px);
	}

	.logout-confirm-btn {
		background: #dc2626;
		color: #ffffff;
		box-shadow: 0 8px 18px rgba(220, 38, 38, 0.24);
	}

	.logout-confirm-btn:hover {
		background: #b91c1c;
		transform: translateY(-1px);
		box-shadow: 0 10px 22px rgba(220, 38, 38, 0.3);
	}

	.logout-cancel-btn:active,
	.logout-confirm-btn:active {
		transform: scale(0.96);
		box-shadow: none;
	}

	@keyframes logoutOverlayFade {
		from {
			opacity: 0;
		}

		to {
			opacity: 1;
		}
	}

	@keyframes logoutBoxPop {
		from {
			opacity: 0;
			transform: translateY(10px) scale(0.96);
		}

		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	@media (max-width: 760px) {
		.main-sidebar-toggle {
			display: inline-flex;
			position: fixed;
			top: 45px;
			left: 0px;
			z-index: 900;
			height: 28px;
			align-items: center;
			justify-content: center;
			gap: 6px;
			padding: 0 9px;
			border: 1px solid #bfdbfe;
			border-radius: 0 999px 999px 0;
			background: rgba(255, 255, 255, 0.96);
			color: #1d4ed8;
			font-size: 10px;
			font-weight: 900;
			box-shadow: 0 6px 14px rgba(15, 23, 42, 0.12);
			cursor: pointer;
		}

		.main-sidebar-backdrop {
			display: block;
			position: fixed;
			inset: 0;
			z-index: 1100;
			border: none;
			background: rgba(15, 23, 42, 0.36);
			backdrop-filter: blur(2px);
			cursor: pointer;
		}

		.sidebar {
			position: fixed;
			top: 6px;
			left: 6px;
			bottom: 6px;
			width: 260px;
			max-width: calc(100vw - 18px);
			height: auto;
			min-height: 0;
			max-height: none;
			z-index: 1200;
			align-items: stretch;
			padding: 0;
			background: #ffffff;
			border: 1px solid #d9e2ec;
			border-radius: 12px;
			box-shadow:
				0 16px 38px rgba(15, 23, 42, 0.2),
				0 2px 8px rgba(15, 23, 42, 0.08);
			overflow: hidden;
			transform: translateX(calc(-100% - 16px));
			opacity: 0;
			pointer-events: none;
			transition:
				transform 0.22s ease,
				opacity 0.22s ease;
		}

		.sidebar.sidebar-open {
			transform: translateX(0);
			opacity: 1;
			pointer-events: auto;
		}

		.sidebar-mobile-header {
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: 8px;
			padding: 9px 10px;
			border-bottom: 1px solid #eef2f7;
			background: #ffffff;
		}

		.sidebar-mobile-header h2 {
			margin: 0;
			color: #0f172a;
			font-size: 14px;
			line-height: 1.05;
			font-weight: 900;
		}

		.sidebar-mobile-header p {
			margin: 2px 0 0;
			color: #64748b;
			font-size: 9px;
			line-height: 1.15;
			font-weight: 700;
		}

		.sidebar-close-btn {
			display: grid;
			width: 23px;
			height: 23px;
			place-items: center;
			border: none;
			border-radius: 8px;
			background: #f1f5f9;
			color: #64748b;
			font-size: 15px;
			font-weight: 900;
			line-height: 1;
			cursor: pointer;
			flex-shrink: 0;
		}

		.side-icon-img {
			width: 16px;
			height: 16px;
		}

		.sidebar-close-btn:hover {
			background: #fee2e2;
			color: #dc2626;
		}

		.sidebar-menu {
			align-items: stretch;
			gap: 5px;
			padding: 8px 10px;
			overflow-y: auto;
		}

		.active-menu-bg,
		.active-menu-indicator {
			display: none;
		}

		.side-item {
			width: 100%;
			height: 32px;
			border: 1px solid #e2e8f0;
			border-radius: 8px;
			background: #f8fafc;
			color: #0f172a;
			font-size: 10px;
			font-weight: 800;
			justify-content: flex-start;
			gap: 8px;
			padding: 0 9px;
		}

		.side-item:hover {
			border-color: #bfdbfe;
			background: #eff6ff;
		}

		.side-item.active {
			border-left: 1px solid #60a5fa;
			border-color: #60a5fa;
			background: #eff6ff;
			color: #1d4ed8;
			box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.12);
		}

		.side-icon {
			width: 18px;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			font-size: 13px;
			flex-shrink: 0;
		}

		.side-label {
			display: inline;
			font-size: 10px;
			font-weight: 800;
			line-height: 1;
		}

		.logout-button {
			width: calc(100% - 20px);
			height: auto;
			min-height: 0;
			margin: auto 10px 10px;
			padding: 10px;
			border: 1px solid #fecaca;
			border-radius: 12px;
			background: linear-gradient(180deg, #fff7f7 0%, #fee2e2 100%);
			color: #7f1d1d;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 10px;
			box-shadow: 0 6px 14px rgba(127, 29, 29, 0.08);
		}

		.logout-button:hover {
			background: linear-gradient(180deg, #fff1f1 0%, #fecaca 100%);
			border-color: #fca5a5;
		}

		.user-mini {
			display: flex;
			flex-direction: column;
			min-width: 0;
			gap: 2px;
		}

		.user-mini strong {
			max-width: 145px;
			overflow: hidden;
			color: #7f1d1d;
			font-size: 11px;
			font-weight: 900;
			line-height: 1.1;
			white-space: nowrap;
			text-overflow: ellipsis;
		}

		.user-mini span {
			max-width: 145px;
			overflow: hidden;
			color: #991b1b;
			font-size: 9px;
			font-weight: 700;
			line-height: 1.1;
			white-space: nowrap;
			text-overflow: ellipsis;
		}

		.logout-btn {
			width: auto;
			min-width: 72px;
			height: 30px;
			padding: 0 10px;
			border: none;
			border-radius: 999px;
			background: #dc2626;
			color: #ffffff;
			font-size: 10px;
			font-weight: 900;
			cursor: pointer;
			box-shadow: 0 6px 14px rgba(220, 38, 38, 0.22);
		}

		.logout-btn::before {
			content: '';
			display: none;
		}

		.logout-btn:hover {
			background: #b91c1c;
			color: #ffffff;
			transform: translateY(-1px);
		}

		.logout-btn:active {
			transform: scale(0.96);
		}

		.logout-confirm-box {
			border-radius: 16px;
			padding: 16px;
		}

		.logout-confirm-content h3 {
			font-size: 15px;
		}

		.logout-confirm-content p {
			font-size: 11px;
		}

		.logout-confirm-actions {
			gap: 8px;
		}

		.logout-cancel-btn,
		.logout-confirm-btn {
			min-width: 88px;
			height: 32px;
			font-size: 11px;
		}
	}
</style>
