<script>
	import { Boxes, Ship } from 'lucide-svelte';

	let {
		title = '',
		description = '',
		items = [],
		variant = 'vessel',
		emptyText = 'No items yet.',
		actionLabel = '',
		onAction
	} = $props();

	let isVessel = $derived(variant === 'vessel');
</script>

<article class="panel access-panel">
	<div class="panel-header">
		<div class="section-heading">
			<span class="mini-heading-icon {isVessel ? 'tone-cyan' : 'tone-violet'}" aria-hidden="true">
				{#if isVessel}
					<Ship size={14} strokeWidth={2.3} />
				{:else}
					<Boxes size={14} strokeWidth={2.3} />
				{/if}
			</span>
			<div>
				<h2>{title}</h2>
				<p>{description}</p>
			</div>
		</div>

		<span class="count-pill">{items.length}</span>
	</div>

	{#if items.length}
		<div class="list-scroll">
			{#each items as item (item.key)}
				<div class="access-row">
					<div class="access-icon {variant}-icon" aria-hidden="true">
						{#if isVessel}
							<Ship size={16} strokeWidth={2.2} />
						{:else}
							<Boxes size={16} strokeWidth={2.2} />
						{/if}
					</div>
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
