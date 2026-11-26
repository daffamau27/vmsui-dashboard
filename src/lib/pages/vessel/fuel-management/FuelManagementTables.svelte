<script>
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import { ArrowLeftRight, Database, Fuel, Gauge, Scale, Ship } from 'lucide-svelte';
	import './fuel-management-page.css';

	let { loading = false, cards = [] } = $props();

	/** @type {Array<{ keywords: string[]; icon: typeof Fuel; tone: string }>} */
	const tableIconRules = [
		{ keywords: ['maker'], icon: Ship, tone: 'tone-amber' },
		{ keywords: ['ems', 'system', 'vms'], icon: Gauge, tone: 'tone-cyan' },
		{ keywords: ['rob'], icon: Database, tone: 'tone-cyan' },
		{ keywords: ['bunker', 'received'], icon: Fuel, tone: 'tone-green' },
		{ keywords: ['comparison', 'vs'], icon: ArrowLeftRight, tone: 'tone-violet' }
	];

	function getTableIcon(/** @type {{ key?: unknown; title?: unknown }} */ card) {
		const text = `${String(card?.key ?? '')} ${String(card?.title ?? '')}`.toLowerCase();
		const rule = tableIconRules.find((entry) =>
			entry.keywords.some((keyword) => text.includes(keyword))
		);
		return { icon: rule?.icon ?? Scale, tone: rule?.tone ?? 'tone-blue' };
	}
</script>

<section class="table-grid">
	{#each cards as card (card.key)}
		{@const tableIcon = getTableIcon(card)}
		{@const TableIcon = tableIcon.icon}
		<article class="panel table-panel">
			<div class="panel-header">
				<div class="section-heading">
					<span class="section-heading-icon {tableIcon.tone}" aria-hidden="true">
						<TableIcon size={19} strokeWidth={2} />
					</span>
					<div>
						<h2>{card.title}</h2>
						<p>{card.description}</p>
					</div>
				</div>
				{#if card.totalLabel}
					<span class="badge">Total {card.totalLabel}</span>
				{/if}
			</div>

			{#if loading}
				<LoadingSkeleton
					label={`Loading ${card.title}`}
					variant="fuel-table"
					rows={5}
					columns={card.columns.length}
				/>
			{:else if card.rows.length}
				<div class="table-wrap">
					<table>
						<thead>
							<tr>
								{#each card.columns as column (column.label)}
									<th class:right={column.align === 'right'}>{column.label}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each card.rows as row, rowIndex (rowIndex)}
								<tr>
									{#each row as cell, cellIndex (cellIndex)}
										<td class:right={cell.right}>{cell.text}</td>
									{/each}
								</tr>
							{/each}
						</tbody>
						<tfoot>
							{#if card.subtotalAeLabel}
								<tr>
									<td colspan={card.columns.length - 1}>Subtotal AE</td>
									<td class="right">{card.subtotalAeLabel}</td>
								</tr>
							{/if}
							{#if card.subtotalMeLabel}
								<tr>
									<td colspan={card.columns.length - 1}>Subtotal ME</td>
									<td class="right">{card.subtotalMeLabel}</td>
								</tr>
							{/if}
							<tr>
								<td colspan={card.columns.length - 1}>Grand Total</td>
								<td class="right">{card.grandTotalLabel}</td>
							</tr>
						</tfoot>
					</table>
				</div>
			{:else}
				<div class="empty-state">
					Data is not available or permission for this table has not been granted.
				</div>
			{/if}
		</article>
	{/each}
</section>
