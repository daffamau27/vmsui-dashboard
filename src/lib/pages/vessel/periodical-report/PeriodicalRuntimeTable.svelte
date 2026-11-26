<script>
	import { Clock } from 'lucide-svelte';

	let { rows = [], emptyText = 'Engine runtime data is not available yet.' } = $props();
</script>

<section class="table-section">
	<div class="section-header">
		<div class="section-heading">
			<span class="section-heading-icon tone-amber" aria-hidden="true">
				<Clock size={20} strokeWidth={2} />
			</span>
			<div>
				<span class="section-kicker">Runtime</span>
				<h2>Engine Runtime</h2>
			</div>
		</div>

		<strong>{rows.length} engines</strong>
	</div>

	{#if rows.length}
		<div class="table-wrapper">
			<table>
				<thead>
					<tr>
						<th>Engine</th>
						<th>Running Hour</th>
						<th>Runtime Hours</th>
					</tr>
				</thead>

				<tbody>
					{#each rows as row (row.key)}
						<tr>
							<td>{row.engineName}</td>
							<td>{row.runtimeFormatted}</td>
							<td>{row.runtimeHoursLabel}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="empty-box">{emptyText}</div>
	{/if}
</section>
