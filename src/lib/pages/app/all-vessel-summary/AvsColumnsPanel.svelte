<script>
	import { Columns3 } from 'lucide-svelte';
	import './avs-page.css';

	let {
		columnGroups = [],
		visibleColumnIds = [],
		selectedColumnCount = 0,
		showColumnSelector = $bindable(false),
		getGroupVisibleCount,
		onToggleColumn,
		onSelectAll,
		onClear,
		onReset
	} = $props();
</script>

<section class="table-section">
	<div class="section-header">
		<div class="section-heading">
			<span class="section-heading-icon tone-violet" aria-hidden="true">
				<Columns3 size={20} strokeWidth={2} />
			</span>
			<div>
				<span class="section-kicker">Columns</span>
				<h2>Visible Columns</h2>
			</div>
		</div>

		<button
			type="button"
			class="secondary-btn"
			onclick={() => (showColumnSelector = !showColumnSelector)}
		>
			{selectedColumnCount} Selected
		</button>
	</div>

	{#if showColumnSelector}
		<div class="column-selector">
			<div class="column-toolbar">
				<button type="button" class="secondary-btn" onclick={() => onSelectAll?.()}>
					Select All
				</button>

				<button type="button" class="secondary-btn" onclick={() => onClear?.()}>Clear</button>

				<button type="button" class="secondary-btn" onclick={() => onReset?.()}>Default</button>
			</div>

			<div class="column-groups">
				{#each columnGroups as group (group.label)}
					<div class="column-group">
						<h3>{group.label} <span>{getGroupVisibleCount?.(group.columns)}</span></h3>

						{#each group.columns as col (col.id)}
							<label class="check-row">
								<input
									type="checkbox"
									checked={visibleColumnIds.includes(col.id)}
									onchange={(event) => onToggleColumn?.(col.id, event.currentTarget.checked)}
								/>
								<span>{col.label}</span>
							</label>
						{/each}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</section>
