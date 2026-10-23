<script>
	let {
		canAccess = false,
		canManage = false,
		refreshDisabled = false,
		onRefresh,
		onCreate
	} = $props();
</script>

<section class="voyage-header-card">
	<div>
		<div class="page-kicker">Voyage Plan Fleet</div>
		<h1>Voyage Plans</h1>
		<p>
			Manage route points, active status, vessel access, Excel import, and voyage plan assignments
			to vessels.
		</p>
	</div>

	<div class="header-actions">
		{#if canAccess}
			<button
				class="ghost-button refresh-button"
				type="button"
				onclick={() => onRefresh?.()}
				disabled={refreshDisabled}
			>
				Refresh
			</button>
		{/if}
		{#if canManage}
			<button class="primary-button" type="button" onclick={() => onCreate?.()}>
				Create Plan
			</button>
		{/if}
	</div>
</section>
