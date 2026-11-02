<script>
	let { groups = [] } = $props();

	function isOnStatus(status) {
		return String(status || '').toUpperCase() === 'ON';
	}

	function isOffStatus(status) {
		return String(status || '').toUpperCase() === 'OFF';
	}
</script>

<section class="table-section event-history-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">Status</span>
			<h2>Engine Event Status History</h2>
		</div>

		<strong>{groups.length} engines</strong>
	</div>

	{#if groups.length}
		<div class="event-history-grid">
			{#each groups as group, groupIndex (groupIndex)}
				<article class="event-card">
					<div class="event-card-header">
						<div>
							<span>Engine</span>
							<strong>{group.engineName}</strong>
						</div>

						<div class="event-count">
							{group.rows.length} events
						</div>
					</div>

					<div class="event-table-wrapper">
						<table class="event-table">
							<thead>
								<tr>
									<th>Start</th>
									<th>End</th>
									<th>Duration</th>
									<th>Status</th>
								</tr>
							</thead>

							<tbody>
								{#each group.rows as row, rowIndex (rowIndex)}
									<tr>
										<td>{row.start}</td>
										<td>{row.end}</td>
										<td>{row.duration}</td>
										<td>
											<span
												class="event-status"
												class:on-status={isOnStatus(row.status)}
												class:off-status={isOffStatus(row.status)}
											>
												{row.status}
											</span>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</article>
			{/each}
		</div>
	{:else}
		<div class="empty-box">Event status history is not available yet.</div>
	{/if}
</section>
