<script>
	import { Boxes, Ship, User, ShieldCheck } from 'lucide-svelte';

	let {
		username = '-',
		email = '',
		vesselCount = 0,
		vesselMode = '-',
		assetCount = 0,
		assetMode = '-',
		permissionMode = '-',
		isSuperAdmin = false
	} = $props();
</script>

<section class="summary-grid">
	<article class="summary-card">
		<div class="summary-card-head">
			<span class="summary-card-icon tone-blue" aria-hidden="true">
				<User size={13} strokeWidth={2.2} />
			</span>
			<span class="summary-label">Username</span>
		</div>
		<strong>{username || '-'}</strong>
		<p>{email || 'Email not provided'}</p>
	</article>

	<article class="summary-card">
		<div class="summary-card-head">
			<span class="summary-card-icon tone-cyan" aria-hidden="true">
				<Ship size={13} strokeWidth={2.2} />
			</span>
			<span class="summary-label">Vessel Access</span>
		</div>
		<strong>{vesselCount}</strong>
		<p>Mode: {vesselMode}</p>
	</article>

	<article class="summary-card">
		<div class="summary-card-head">
			<span class="summary-card-icon tone-violet" aria-hidden="true">
				<Boxes size={13} strokeWidth={2.2} />
			</span>
			<span class="summary-label">Asset Access</span>
		</div>
		<strong>{assetCount}</strong>
		<p>Mode: {assetMode}</p>
	</article>

	<article class="summary-card">
		<div class="summary-card-head">
			<span class="summary-card-icon tone-green" aria-hidden="true">
				<ShieldCheck size={13} strokeWidth={2.2} />
			</span>
			<span class="summary-label">Permission</span>
		</div>
		<strong>{permissionMode}</strong>
		<p>{isSuperAdmin ? 'Full system access' : 'Limited access'}</p>
	</article>
</section>
