<script>
	let {
		activeTab = 'users',
		bootLoading = false,
		onRefresh,
		onCreateUser,
		onCreateVessel,
		onCreateAsset,
		onDownloadTemplate
	} = $props();
</script>

<section class="admin-header-card">
	<div>
		<div class="page-kicker">Super Admin</div>
		<h1>Administrator Management</h1>
		<p>
			Manage user accounts, vessel access, asset access, module permissions, and vessel registries
			from one page.
		</p>
	</div>

	<div class="header-actions">
		<button class="ghost-button" type="button" onclick={() => onRefresh?.()} disabled={bootLoading}>
			Refresh
		</button>

		{#if activeTab === 'users'}
			<button class="primary-button" type="button" onclick={() => onCreateUser?.()}>
				+ New User
			</button>
		{:else if activeTab === 'vessels'}
			<button class="primary-button" type="button" onclick={() => onCreateVessel?.()}>
				+ New Vessel
			</button>
		{:else if activeTab === 'assets'}
			<button class="primary-button" type="button" onclick={() => onCreateAsset?.()}>
				+ New Asset
			</button>
		{:else if activeTab === 'engine-curves'}
			<button class="primary-button" type="button" onclick={() => onDownloadTemplate?.()}>
				Download Template
			</button>
		{/if}
	</div>
</section>
