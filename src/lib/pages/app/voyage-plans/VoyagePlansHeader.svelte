<script>
	import { Plus, RefreshCw, Route } from 'lucide-svelte';

	let {
		canAccess = false,
		canManage = false,
		refreshDisabled = false,
		onRefresh,
		onCreate
	} = $props();
</script>

<section class="voyage-header-card">
	<div class="section-heading">
		<span class="section-heading-icon tone-cyan" aria-hidden="true">
			<Route size={20} strokeWidth={2} />
		</span>
		<div>
			<div class="page-kicker">Voyage Plan Fleet</div>
			<h1>Voyage Plans</h1>
			<p>
				Manage route points, active status, vessel access, Excel import, and voyage plan assignments
				to vessels.
			</p>
		</div>
	</div>

	<div class="header-actions">
		{#if canAccess}
			<button
				class="ghost-button refresh-button"
				type="button"
				onclick={() => onRefresh?.()}
				disabled={refreshDisabled}
			>
				<RefreshCw size={14} strokeWidth={2.4} aria-hidden="true" />
				<span>Refresh</span>
			</button>
		{/if}
		{#if canManage}
			<button class="primary-button" type="button" onclick={() => onCreate?.()}>
				<Plus size={14} strokeWidth={2.6} aria-hidden="true" />
				<span>Create Plan</span>
			</button>
		{/if}
	</div>
</section>
