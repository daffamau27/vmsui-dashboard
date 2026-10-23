<script>
	let {
		title = '',
		description = '',
		items = [],
		variant = 'vessel',
		emptyText = 'No items yet.',
		actionLabel = '',
		onAction
	} = $props();
</script>

<article class="panel access-panel">
	<div class="panel-header">
		<div>
			<h2>{title}</h2>
			<p>{description}</p>
		</div>

		<span class="count-pill">{items.length}</span>
	</div>

	{#if items.length}
		<div class="list-scroll">
			{#each items as item (item.key)}
				<div class="access-row">
					<div class="access-icon {variant}-icon">{variant === 'vessel' ? 'V' : 'A'}</div>
					<div>
						<strong>{item.label || '-'}</strong>
					</div>
					{#if actionLabel}
						<button type="button" class="hire-history-button" onclick={() => onAction?.(item)}>
							{actionLabel}
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<div class="empty-state">{emptyText}</div>
	{/if}
</article>
