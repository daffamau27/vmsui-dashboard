<script>
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
		<div class="summary-label">Username</div>
		<strong>{username || '-'}</strong>
		<p>{email || 'Email not provided'}</p>
	</article>

	<article class="summary-card">
		<div class="summary-label">Vessel Access</div>
		<strong>{vesselCount}</strong>
		<p>Mode: {vesselMode}</p>
	</article>

	<article class="summary-card">
		<div class="summary-label">Asset Access</div>
		<strong>{assetCount}</strong>
		<p>Mode: {assetMode}</p>
	</article>

	<article class="summary-card">
		<div class="summary-label">Permission</div>
		<strong>{permissionMode}</strong>
		<p>{isSuperAdmin ? 'Full system access' : 'Limited access'}</p>
	</article>
</section>
