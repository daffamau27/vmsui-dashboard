<script>
	import { Columns3 } from 'lucide-svelte';
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
		<div class="section-heading">
			<span class="section-heading-icon tone-violet" aria-hidden="true">
				<Columns3 size={20} strokeWidth={2} />
			</span>
			<div>
				<span class="section-kicker">Columns</span>
				<h2>Visible Data Columns</h2>
			</div>
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
			<label class="column-item">
				<input
					type="checkbox"
					checked={selectedColumns.includes(column)}
					onchange={() => onToggle?.(column)}
				/>
				<span class="column-item-tile">
					<span class="column-item-name">{getColumnLabel?.(column, columns)}</span>
					<span class="column-item-corner" aria-hidden="true">
						<svg viewBox="0 0 16 16" fill="none">
							<path d="m3 8 3 3 7-7" stroke="currentColor" stroke-width="2" />
						</svg>
					</span>
				</span>
			</label>
		{/each}
	</div>
</section>
