<script>
	import './data-log-page.css';

	let {
		columns = [],
		selectedColumns = [],
		loading = false,
		error = '',
		getColumnLabel,
		onToggle,
		onSelectAll,
		onSelectBasic
	} = $props();
</script>

<section class="column-card">
	<div class="column-header">
		<div>
			<span class="section-kicker">Columns</span>
			<h2>Visible Data Columns</h2>
		</div>

		<div class="column-actions">
			{#if loading}
				<span class="column-loading">Loading columns...</span>
			{/if}
			<button type="button" onclick={() => onSelectAll?.()}>Select All</button>
			<button type="button" onclick={() => onSelectBasic?.()}>Basic</button>
		</div>
	</div>

	{#if error}
		<div class="column-warning">{error}</div>
	{/if}

	<div class="column-grid">
		{#each columns as column (column)}
			<label class="column-item" class:is-checked={selectedColumns.includes(column)}>
				<input
					type="checkbox"
					checked={selectedColumns.includes(column)}
					onchange={() => onToggle?.(column)}
				/>
				<span>{getColumnLabel?.(column, columns)}</span>
			</label>
		{/each}
	</div>
</section>
