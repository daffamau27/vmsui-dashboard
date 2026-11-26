<script>
	import { RefreshCw, Send } from 'lucide-svelte';

	let {
		userName = '-',
		isSuperAdmin = false,
		permissionMode = '-',
		createdAtLabel = '-',
		telegramAiBotUrl = '',
		canAccessAiAgent = false,
		onRefresh
	} = $props();

	function getInitials(name = '') {
		const parts = name.trim().split(' ').filter(Boolean);

		if (!parts.length) return 'U';

		return parts
			.slice(0, 2)
			.map((part) => part[0])
			.join('')
			.toUpperCase();
	}
</script>

<header class="profile-hero">
	<div class="hero-left">
		<div class="avatar" aria-hidden="true">
			{getInitials(userName)}
		</div>

		<div>
			<div class="page-kicker">User Profile</div>
			<h1>{userName || '-'}</h1>
			<p>Manage account information, vessel access, asset access, and password security.</p>

			<div class="hero-badges">
				<span class:super-admin={isSuperAdmin}>
					{isSuperAdmin ? 'Super Admin' : 'Limited User'}
				</span>
				<span>Permission: {permissionMode}</span>
				<span>Created: {createdAtLabel}</span>
			</div>
		</div>
	</div>

	<div class="hero-actions">
		{#if canAccessAiAgent}
			<a
				class="telegram-bot-button"
				href={telegramAiBotUrl}
				target="_blank"
				rel="noopener noreferrer"
				aria-label="Open VMSUI AI Telegram bot"
			>
				<Send size={13} strokeWidth={2.4} aria-hidden="true" />
				<span>Open AI Telegram Bot</span>
			</a>
		{/if}

		<button class="refresh-button" type="button" onclick={() => onRefresh?.()}>
			<RefreshCw size={13} strokeWidth={2.4} aria-hidden="true" />
			<span>Refresh</span>
		</button>
	</div>
</header>
