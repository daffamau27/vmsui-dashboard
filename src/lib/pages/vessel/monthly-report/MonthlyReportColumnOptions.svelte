<script>
	let {
		columns = [],
		fuelSources = [],
		selectedCount = 0,
		columnsLoading = false,
		columnsError = '',
		showFuelSources = false,
		onToggleColumn,
		onResetColumns,
		onToggleFuelSource,
		onResetFuelSources
	} = $props();
</script>

<section class="table-section monthly-column-options-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">Columns</span>
			<h2>Visible Columns</h2>
		</div>

		<div class="section-header-actions">
			<strong>{selectedCount} selected</strong>
		</div>
	</div>

	<div class="monthly-column-options-body">
		<div class="column-filter-panel">
			<div class="column-filter-title">
				<span>Visible Columns</span>
				<button type="button" onclick={() => onResetColumns?.()}>Reset</button>
			</div>

			{#if columnsLoading}
				<p class="column-filter-status">Loading available columns...</p>
			{:else if columnsError}
				<p class="column-filter-status is-error">{columnsError}</p>
			{/if}

			<div class="column-filter-options">
				{#each columns as option (option.key)}
					<label class="column-filter-option" class:is-selected={option.selected}>
						<input
							type="checkbox"
							checked={option.selected}
							onchange={() => onToggleColumn?.(option.key)}
						/>
						<span>{option.label}</span>
					</label>
				{/each}
			</div>

			{#if showFuelSources && fuelSources.length}
				<div class="fuel-source-filter">
					<div class="fuel-source-filter-title">
						<span>Fuel Sources</span>
						<button type="button" onclick={() => onResetFuelSources?.()}>Reset sources</button>
					</div>

					<div class="column-filter-options">
						{#each fuelSources as source (source.key)}
							<label
								class="column-filter-option fuel-source-option"
								class:is-selected={source.selected}
							>
								<input
									type="checkbox"
									checked={source.selected}
									onchange={() => onToggleFuelSource?.(source.key)}
								/>
								<span>{source.label}</span>
							</label>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>
</section>
