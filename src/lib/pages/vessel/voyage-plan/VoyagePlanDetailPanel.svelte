<script>
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let {
		voyageName = '-',
		rows = [],
		detailLoading = false,
		isSelectedActiveAssignment = false,
		canEndActiveVoyage = false,
		actionLoading = '',
		onCancel,
		onEnd
	} = $props();
</script>

<section class="detail-panel">
	<div class="section-header">
		<div>
			<span class="section-kicker">Assignment Detail</span>
			<h2>{voyageName}</h2>
		</div>
	</div>

	{#if rows.length}
		{#if detailLoading}
			<LoadingSkeleton
				label="Loading assignment detail"
				variant="voyage-assignment-detail"
				compact
			/>
		{/if}
		<div class="detail-list">
			{#each rows as row (row.key)}
				<div><span>{row.label}</span><strong>{row.value}</strong></div>
			{/each}
		</div>

		{#if isSelectedActiveAssignment}
			<div class="assignment-actions">
				<button
					type="button"
					class="danger-button"
					onclick={() => onCancel?.()}
					disabled={Boolean(actionLoading)}
				>
					{actionLoading === 'cancel-active' ? 'Canceling...' : 'Cancel Active Assignment'}
				</button>

				<button
					type="button"
					class="primary-button"
					onclick={() => onEnd?.()}
					disabled={Boolean(actionLoading) || !canEndActiveVoyage}
					title={canEndActiveVoyage
						? 'End active voyage assignment'
						: 'All checkpoints must be completed before ending the voyage'}
				>
					{actionLoading === 'end-active' ? 'Ending...' : 'End Active Voyage'}
				</button>
			</div>

			{#if !canEndActiveVoyage}
				<p class="action-note">
					Complete all pending/skipped checkpoints before ending this voyage.
				</p>
			{/if}
		{/if}
	{:else}
		<div class="empty-box">No assignment has been selected.</div>
	{/if}
</section>
