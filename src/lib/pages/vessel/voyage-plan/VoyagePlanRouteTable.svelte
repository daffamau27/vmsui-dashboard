<script>
	import CopyableCoordinate from '$lib/components/CopyableCoordinate.svelte';

	let { rows = [], totalDistanceLabel = '-', actionLoading = '', onComplete } = $props();
</script>

<section class="table-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">Route Points</span>
			<h2>Voyage Route Detail</h2>
		</div>

		<strong>{rows.length} points</strong>
	</div>

	{#if rows.length}
		<div class="table-wrap route-table-wrap">
			<table>
				<thead>
					<tr>
						<th>Order</th>
						<th>Status</th>
						<th>Latitude</th>
						<th>Longitude</th>
						<th>Distance (NM)</th>
						<th>Planned Speed</th>
						<th>Actual Avg Speed</th>
						<th>Reached At</th>
						<th class="right">Action</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.key)}
						<tr>
							<td>{row.order}</td>
							<td>
								<span class={`checkpoint-status ${row.statusClass}`}>{row.statusLabel}</span>
							</td>
							<td>
								<CopyableCoordinate
									value={row.latitude}
									display={row.latitude}
									label="latitude"
									compact
								/>
							</td>
							<td>
								<CopyableCoordinate
									value={row.longitude}
									display={row.longitude}
									label="longitude"
									compact
								/>
							</td>
							<td>{row.distanceLabel}</td>
							<td>{row.speedLabel}</td>
							<td>{row.averageSpeedLabel}</td>
							<td>{row.reachedAtLabel}</td>
							<td class="right">
								{#if row.actionable}
									<button
										type="button"
										class="table-action-btn"
										onclick={() => onComplete?.(row.order)}
										disabled={Boolean(actionLoading)}
									>
										{actionLoading === `complete-${row.order}` ? 'Completing...' : 'Complete'}
									</button>
								{:else}
									<span class="muted-action">-</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
				<tfoot>
					<tr>
						<td colspan="4">Total Distance</td>
						<td>{totalDistanceLabel}</td>
						<td colspan="4"></td>
					</tr>
				</tfoot>
			</table>
		</div>
	{:else}
		<div class="empty-box">Route points are not available yet.</div>
	{/if}
</section>
