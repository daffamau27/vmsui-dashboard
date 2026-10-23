<script>
	let { rows = [], emptyText = 'Engine runtime data is not available yet.' } = $props();
</script>

<section class="table-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">Runtime</span>
			<h2>Engine Runtime</h2>
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
