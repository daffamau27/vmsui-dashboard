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
			icon: '/assets/adminpage.png',
			title: 'Administrator',
			key: 'administrator',
			type: 'image',
			superAdminOnly: true
		},
		{
			icon: '/assets/fleetviewpage.png',
			title: 'Fleet View',
			key: 'fleet-view',
			type: 'image',
			permissions: ['access_fleet_view']
		},
		{
			icon: '/assets/vesselpage.png',
			title: 'Vessel',
			key: 'vessel',
			type: 'image',
			alwaysShow: true
		},
		{
			icon: '/assets/summarypage.png',
			title: 'All Vessel Summary',
			key: 'all-vessel-summary',
			type: 'image',
			permissions: ['access_all_vessel_summary']
		},
		{
			icon: '/assets/alarmpage.png',
			title: 'Alarm',
			key: 'alarm',
			type: 'image',
			permissions: ['access_alarm']
		},
		{
			icon: '/assets/auditlogpage.png',
			title: 'Audit Log',
			key: 'audit-log',
			type: 'image',
			permissions: ['access_audit_logs']
		},
		{
			icon: '/assets/voyageplanspage.png',
			title: 'Voyage Plans',
			key: 'voyage-plans',
			type: 'image',
			permissions: ['access_voyage_plan_fleet']
		}
	];

	const itemHeight = 48;
	const alarmBadgeRefreshMs = 10000;

	let alarmBadgeTimer = null;
	let activeAlarmCount = $state(0);

	let permissionLoading = $state(true);
	let permissionMode = $state('selected');
	let permissions = $state([]);

	function applyPermissionAccess(permissionAccess = {}) {
		permissionMode = permissionAccess?.mode || 'selected';
		permissions = Array.isArray(permissionAccess?.permissions) ? permissionAccess.permissions : [];
	}

	function hasPermission(menu) {
		if (menu?.alwaysShow) return true;

		if (menu?.superAdminOnly) {
			return permissionMode === 'all';
		}

		if (permissionMode === 'all') return true;

		const permissionKeys = Array.isArray(menu?.permissions) ? menu.permissions : [];

		if (!permissionKeys.length) return false;

		return permissionKeys.some((permissionKey) => permissions.includes(permissionKey));
	}

	function canAccessAlarmMenu() {
		const alarmMenu = menus.find((menu) => menu.key === 'alarm');
		return alarmMenu ? hasPermission(alarmMenu) : false;
	}

	async function loadActiveAlarmCount() {
		if (!browser) return;

		if (!canAccessAlarmMenu()) {
			activeAlarmCount = 0;
			return;
		}

		try {
			const response = await apiRequest('/alarm/monitor', {
				method: 'GET'
			});

			const payload = response?.data || {};

			const rows = Array.isArray(payload?.monitor)
				? payload.monitor
				: Array.isArray(response?.monitor)
					? response.monitor
					: Array.isArray(response?.data)
						? response.data
						: Array.isArray(response)
							? response
							: [];

			activeAlarmCount = rows.filter(
				(row) => String(row?.status || '').toUpperCase() === 'ACTIVE'
			).length;
		} catch (err) {
			console.error('[SIDEBAR][ALARM_BADGE_ERROR]', err);
			activeAlarmCount = 0;
		}
	}

	function startAlarmBadgeRefresh() {
		stopAlarmBadgeRefresh();

		loadActiveAlarmCount();

		alarmBadgeTimer = setInterval(() => {
			loadActiveAlarmCount();
		}, alarmBadgeRefreshMs);
	}

	function stopAlarmBadgeRefresh() {
		if (alarmBadgeTimer) {
			clearInterval(alarmBadgeTimer);
			alarmBadgeTimer = null;
		}
	}

	let visibleMenus = $derived(menus.filter((menu) => hasPermission(menu)));

	let activeIndex = $derived(visibleMenus.findIndex((menu) => menu.key === $activeMenu));
	let isFleetViewActive = $derived($activeMenu === 'fleet-view');

	let isSidebarOpen = $state(true);

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

			if (canAccessAlarmMenu()) {
				startAlarmBadgeRefresh();
			} else {
				stopAlarmBadgeRefresh();
				activeAlarmCount = 0;
			}
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
		if (window.innerWidth > 760) return;

		window.dispatchEvent(
			new CustomEvent('mobile-panel-open', {
				detail: panelName
			})
		);
	}

	function openMobileSidebar() {
		isSidebarOpen = true;
		notifyMobilePanelOpen('main-sidebar');
	}

	function closeMobileSidebar() {
		isSidebarOpen = false;
	}

	function toggleSidebar() {
		if (isSidebarOpen) {
			closeMobileSidebar();
			return;
		}

		openMobileSidebar();
	}

	function handleMobilePanelOpen(event) {
		if (!browser || window.innerWidth > 760) return;

		if (event.detail !== 'main-sidebar') {
			isSidebarOpen = false;
		}
	}

	async function openMenu(menu) {
		if (!hasPermission(menu)) return;

		setActiveMenu(menu.key);
		if (browser && window.innerWidth <= 760) {
			isSidebarOpen = false;
		}

		if (page.url.pathname !== '/app') {
			await goto('/app');
		}
	}

	onMount(() => {
		if (!browser) return;

		isSidebarOpen = window.innerWidth > 760;

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

		stopAlarmBadgeRefresh();
		window.removeEventListener('mobile-panel-open', handleMobilePanelOpen);
	});
</script>

<button
	type="button"
	class:sidebar-open-toggle={isSidebarOpen}
	class:fleet-floating-toggle={isFleetViewActive}
	class="main-sidebar-toggle"
	aria-expanded={isSidebarOpen}
	aria-label={isSidebarOpen ? 'Close main sidebar' : 'Open main sidebar'}
	title={isSidebarOpen ? 'Hide menu' : 'Show menu'}
	onclick={toggleSidebar}
>
	<span aria-hidden="true"></span>
	<span>{isSidebarOpen ? 'Hide' : 'Menu'}</span>
</button>

{#if isSidebarOpen}
	<button
		type="button"
		class="main-sidebar-backdrop"
		aria-label="Close main sidebar"
		onclick={closeMobileSidebar}
	></button>
{/if}

<aside
	class:sidebar-open={isSidebarOpen}
	class:sidebar-collapsed={!isSidebarOpen}
	class:fleet-floating-sidebar={isFleetViewActive}
	class="sidebar"
>
	<div class="sidebar-mobile-header">
		<div>
			<h2>Menu</h2>
			<p>Main navigation</p>
		</div>
	</div>
<!-- 
	<div class="sidebar-brand" title="VMS Dashboard">⚓</div> -->

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
				title={menu.key === 'alarm' && activeAlarmCount > 0 ? `${menu.title} (${activeAlarmCount} active)` : menu.title}
				onclick={() => openMenu(menu)}
			>
			<span class="side-icon">
				{#if menu.type === 'image'}
					<img src={menu.icon} alt={menu.title} class="side-icon-img" />
				{:else}
					{menu.icon}
				{/if}

				{#if menu.key === 'alarm' && activeAlarmCount > 0}
					<span class="alarm-count-badge" aria-label={`${activeAlarmCount} active alarms`}>
						{activeAlarmCount > 99 ? '99+' : activeAlarmCount}
					</span>
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

		<button type="button" class="logout-btn" onclick={openLogoutConfirm}></button>
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
				<h3 id="logout-confirm-title">Logout Confirmation</h3>
				<p>Are you sure you want to sign out of this account?</p>
			</div>

			<div class="logout-confirm-actions">
				<button type="button" class="logout-cancel-btn" onclick={closeLogoutConfirm}>
					Cancel
				</button>

				<button type="button" class="logout-confirm-btn" onclick={confirmLogout}>
					Yes, Logout
				</button>
			</div>
		</section>
	</div>
{/if}

<style>
	.main-sidebar-backdrop,
	.sidebar-mobile-header,
	.side-label {
		display: none;
	}

	.main-sidebar-toggle {
		position: fixed;
		top: 10px;
		left: 8px;
		z-index: 1300;
		width: 28px;
		height: 28px;
		min-height: 28px;
		display: inline-flex;
		flex-direction: row;
		align-items: center;
		justify-content: center;
		gap: 0;
		padding: 0;
		border: 1px solid rgba(147, 197, 253, 0.34);
		border-radius: 999px;
		background:
			linear-gradient(180deg, rgba(30, 64, 175, 0.3), rgba(15, 23, 42, 0.08)),
			rgba(15, 23, 42, 0.78);
		color: #dbeafe;
		box-shadow: 0 8px 18px rgba(15, 23, 42, 0.16);
		backdrop-filter: blur(12px) saturate(1.15);
		cursor: pointer;
		transform: none;
		transition:
			left 0.22s ease,
			border-color 0.18s ease,
			background 0.18s ease,
			box-shadow 0.18s ease,
			transform 0.18s ease;
	}

	.main-sidebar-toggle.sidebar-open-toggle {
		left: 15px;
		width: 34px;
		height: 34px;
		min-height: 34px;
		padding: 0;
		background:
			linear-gradient(180deg, rgba(30, 64, 175, 0.3), rgba(15, 23, 42, 0.08)),
			rgba(15, 23, 42, 0.92);
	}

	.main-sidebar-toggle.fleet-floating-toggle {
		z-index: 1450;
	}

	.main-sidebar-toggle span:last-child {
		display: none;
	}

	.main-sidebar-toggle span:first-child {
		width: 20px;
		height: 20px;
		display: grid;
		place-items: center;
		border-radius: 999px;
		border: 1px solid rgba(191, 219, 254, 0.28);
		background: rgba(37, 99, 235, 0.55);
		box-shadow: 0 6px 14px rgba(37, 99, 235, 0.22);
	}

	.main-sidebar-toggle span:first-child::before {
		content: '>';
		font-size: 13px;
		font-weight: 900;
		line-height: 1;
	}

	.main-sidebar-toggle.sidebar-open-toggle span:first-child::before {
		content: '<';
		font-size: 15px;
	}

	.main-sidebar-toggle span:last-child {
		display: none;
		writing-mode: horizontal-tb;
		color: inherit;
		font-size: 10px;
		font-weight: 900;
		line-height: 1;
		letter-spacing: 0.03em;
		text-transform: uppercase;
	}

	.main-sidebar-toggle:hover {
		border-color: rgba(147, 197, 253, 0.82);
		background:
			linear-gradient(180deg, rgba(37, 99, 235, 0.38), rgba(15, 23, 42, 0.12)),
			rgba(15, 23, 42, 0.96);
		box-shadow:
			0 16px 34px rgba(15, 23, 42, 0.3),
			0 0 0 4px rgba(37, 99, 235, 0.09),
			inset 0 1px 0 rgba(255, 255, 255, 0.1);
		transform: translateY(-1px);
	}

	.sidebar {
		width: 64px;
		height: 100vh;
		min-height: 100vh;
		background: var(--color-surface);
		border-right: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 52px;
		padding-bottom: 12px;
		flex-shrink: 0;
		position: sticky;
		top: 0;
		left: 0;
		z-index: 1000;
		overflow: hidden;
		transition:
			width 0.22s ease,
			padding 0.22s ease,
			border-color 0.18s ease,
			transform 0.22s ease,
			opacity 0.18s ease;
	}

	.sidebar.sidebar-collapsed {
		width: 0;
		padding-left: 0;
		padding-right: 0;
		border-right-color: transparent;
		opacity: 0;
		pointer-events: none;
	}

	.sidebar.sidebar-collapsed .sidebar-menu,
	.sidebar.sidebar-collapsed .logout-button {
		opacity: 0;
		pointer-events: none;
	}

	.sidebar.fleet-floating-sidebar {
		position: fixed;
		top: 5px;
		left: 5px;
		height: calc(100vh - 10px);
		min-height: 0;
		width: 64px;
		z-index: 1400;
		border: 1px solid rgba(30, 45, 69, 0.9);
		border-radius: 12px;
		background: rgba(17, 24, 39, 0.94);
		box-shadow:
			0 18px 44px rgba(2, 6, 23, 0.28),
			0 0 0 1px rgba(255, 255, 255, 0.035);
		backdrop-filter: blur(16px) saturate(1.18);
	}

	.sidebar.fleet-floating-sidebar.sidebar-collapsed {
		width: 64px;
		padding-top: 52px;
		padding-bottom: 12px;
		border-color: rgba(30, 45, 69, 0.9);
		opacity: 0;
		pointer-events: none;
		transform: translateX(calc(-100% - 12px));
	}

	.sidebar.fleet-floating-sidebar.sidebar-collapsed .sidebar-menu,
	.sidebar.fleet-floating-sidebar.sidebar-collapsed .logout-button {
		opacity: 0;
		pointer-events: none;
	}

	.sidebar-brand {
		width: 44px;
		height: 44px;
		margin-bottom: 10px;
		display: grid;
		place-items: center;
		border-radius: 13px;
		background: linear-gradient(135deg, var(--color-accent), var(--color-accent-hover));
		color: #fff;
		font-size: 20px;
		box-shadow: 0 8px 20px rgba(37, 99, 235, 0.3);
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
		gap: 0;
	}

	.active-menu-bg {
		position: absolute;
		top: 0;
		left: 0;
		width: 48px;
		height: 48px;
		border-radius: 10px;
		background: var(--color-accent-muted);
		box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.08);
		z-index: 1;
		pointer-events: none;
		transition:
			transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
			opacity 0.2s ease;
	}

	.active-menu-indicator {
		position: absolute;
		top: 0;
		left: -8px;
		width: 4px;
		height: 48px;
		border-radius: 0 4px 4px 0;
		background: var(--color-accent);
		box-shadow: 0 0 12px var(--color-accent-glow);
		z-index: 4;
		pointer-events: none;
		transition:
			transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
			opacity 0.2s ease;
	}

	.side-item {
		position: relative;
		z-index: 3;
		width: 48px;
		height: 48px;
		border: none;
		border-radius: 8px;
		background: transparent;
		font-size: 20px;
		cursor: pointer;
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: visible;
		transition:
			transform 0.18s ease,
			color 0.2s ease;
	}

	.side-item:hover {
		background: rgba(255, 255, 255, 0.05);
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
		filter: brightness(0) invert(0.62);
		transition: filter var(--duration-base), transform var(--duration-slow) var(--ease-spring);
	}

	.side-item:hover .side-icon-img {
		filter: brightness(0) invert(0.9);
	}

	.side-item.active .side-icon-img {
		filter: brightness(0) invert(1) sepia(1) saturate(3) hue-rotate(190deg);
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

	.alarm-count-badge {
		position: absolute;
		top: -9px;
		right: -11px;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		border-radius: 999px;
		background: #dc2626;
		border: 2px solid var(--color-surface);
		color: #ffffff;
		font-size: 9px;
		line-height: 12px;
		font-weight: 900;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		box-shadow: 0 2px 8px rgba(239, 68, 68, 0.45);
		pointer-events: none;
	}

	.side-item.active .alarm-count-badge {
		border-color: var(--color-surface);
	}

	.logout-button {
		margin-top: auto;
		width: 48px;
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
		background:
			var(--color-danger-muted)
			url('/assets/logout.png') center / 18px 18px no-repeat;
		color: transparent;
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
		display: none;
	}

	.logout-btn:hover {
		background:
			#dc2626
			url('/assets/logout.png') center / 18px 18px no-repeat;
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
		background: rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(8px);
		animation: logoutOverlayFade 0.18s ease;
	}

	.logout-confirm-box {
		width: min(360px, 100%);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 20px;
		background: var(--color-elevated);
		box-shadow: var(--shadow-lg);
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
		background: var(--color-danger-muted);
		color: #dc2626;
		font-size: 22px;
		font-weight: 900;
	}

	.logout-confirm-content {
		text-align: center;
	}

	.logout-confirm-content h3 {
		margin: 0;
		color: var(--text-primary);
		font-size: 16px;
		font-weight: 900;
		line-height: 1.2;
	}

	.logout-confirm-content p {
		margin: 6px 0 0;
		color: var(--text-secondary);
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
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-secondary);
	}

	.logout-cancel-btn:hover {
		background: rgba(255, 255, 255, 0.1);
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
		.sidebar-brand {
			display: none;
		}

		.main-sidebar-toggle {
			position: fixed;
			top: 10px;
			left: 8px;
			z-index: 1250;
			width: 28px;
			min-height: 28px;
			height: 28px;
			flex-direction: row;
			align-items: center;
			justify-content: center;
			gap: 0;
			padding: 0;
			border: 1px solid rgba(59, 130, 246, 0.35);
			border-radius: 999px;
			background: rgba(17, 24, 39, 0.78);
			color: var(--text-accent);
			font-size: 0;
			font-weight: 900;
			box-shadow: 0 8px 18px rgba(15, 23, 42, 0.2);
			cursor: pointer;
			transform: none;
		}

		.main-sidebar-toggle.sidebar-open-toggle {
			left: 16px;
			width: 32px;
			height: 32px;
			min-height: 32px;
			padding: 0;
			background: rgba(17, 24, 39, 0.94);
		}

		.main-sidebar-backdrop {
			display: block;
			position: fixed;
			inset: 0;
			z-index: 1100;
			border: none;
			background: rgba(0, 0, 0, 0.58);
			backdrop-filter: blur(5px);
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
			background: var(--color-surface);
			border: 1px solid var(--color-border);
			border-radius: 12px;
			box-shadow:
				0 16px 38px rgba(0, 0, 0, 0.5),
				0 2px 8px rgba(0, 0, 0, 0.3);
			overflow: hidden;
			transform: translateX(calc(-100% - 16px));
			opacity: 0;
			pointer-events: none;
			transition:
				transform 0.22s ease,
				opacity 0.22s ease;
		}

		.sidebar.fleet-floating-sidebar {
			width: 260px;
		}

		.sidebar.sidebar-collapsed {
			width: 260px;
			max-width: calc(100vw - 18px);
			padding: 0;
			border: 1px solid var(--color-border);
			opacity: 0;
			pointer-events: none;
			transform: translateX(calc(-100% - 16px));
		}

		.sidebar.sidebar-collapsed .sidebar-menu,
		.sidebar.sidebar-collapsed .logout-button {
			opacity: 1;
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
			padding: 9px 10px 9px 50px;
			border-bottom: 1px solid var(--color-border);
			background: var(--color-surface);
		}

		.sidebar-mobile-header h2 {
			margin: 0;
			color: var(--text-primary);
			font-size: 14px;
			line-height: 1.05;
			font-weight: 900;
		}

		.sidebar-mobile-header p {
			margin: 2px 0 0;
			color: var(--text-secondary);
			font-size: 9px;
			line-height: 1.15;
			font-weight: 700;
		}
		.alarm-count-badge {
			top: -8px;
			right: -10px;
			border-color: var(--color-surface);
		}

		.side-item.active .alarm-count-badge {
			border-color: var(--color-surface);
		}

		.side-icon-img {
			width: 16px;
			height: 16px;
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
			border: 1px solid rgba(255, 255, 255, 0.08);
			border-radius: 8px;
			background: rgba(255, 255, 255, 0.035);
			color: var(--text-primary);
			font-size: 10px;
			font-weight: 800;
			justify-content: flex-start;
			gap: 8px;
			padding: 0 9px;
		}

		.side-item:hover {
			border-color: rgba(59, 130, 246, 0.3);
			background: var(--color-accent-muted);
		}

		.side-item.active {
			border-left: 1px solid #60a5fa;
			border-color: var(--color-accent);
			background: var(--color-accent-muted);
			color: var(--text-accent);
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
			background: var(--color-surface);
			color: #7f1d1d;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 10px;
			box-shadow: 0 6px 14px rgba(127, 29, 29, 0.08);
		}

		.logout-button:hover {
			background: var(--color-surface);
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
			background:
				#dc2626
				url('/assets/logout.png') 10px center / 15px 15px no-repeat;
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
			background:
				#b91c1c
				url('/assets/logout.png') 10px center / 15px 15px no-repeat;
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
