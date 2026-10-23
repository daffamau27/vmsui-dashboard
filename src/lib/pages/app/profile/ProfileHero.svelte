<script>
	let {
		userName = '-',
		isSuperAdmin = false,
		permissionMode = '-',
		createdAtLabel = '-',
		telegramAiBotUrl = '',
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
		<div class="avatar">
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
		<a
			class="telegram-bot-button"
			href={telegramAiBotUrl}
			target="_blank"
			rel="noopener noreferrer"
			aria-label="Open VMSUI AI Telegram bot"
		>
			Open AI Telegram Bot
		</a>

		<button class="refresh-button" type="button" onclick={() => onRefresh?.()}>Refresh</button>
	</div>
</header>
