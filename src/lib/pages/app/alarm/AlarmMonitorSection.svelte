<script>
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';

	let { rows = [], loading = false } = $props();

	function formatDateTime(value) {
		if (!value && value !== 0) return '-';

		if (typeof value === 'string' && Number.isNaN(Number(value))) {
			return value;
		}

		const timestamp = Number(value);
		if (!Number.isFinite(timestamp)) return String(value);

		const date = new Date(timestamp);
		if (Number.isNaN(date.getTime())) return '-';

		return date.toLocaleString('en-GB', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function formatAlarmType(value) {
		return String(value || '-')
			.replace(/_/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.toUpperCase();
	}

	function getStatusClass(status) {
		const normalized = String(status || '').toUpperCase();

		if (normalized === 'ACTIVE') return 'status-active';
		if (normalized === 'CLEARED') return 'status-cleared';

		return 'status-neutral';
	}
</script>

<section class="table-section alarm-monitor-section">
	<div class="section-header">
		<div>
			<span class="section-kicker">Live</span>
			<h2>Assigned Vessel Alarm Status</h2>
		</div>

		<strong>{rows.length} vessels</strong>
	</div>

	{#if loading}
		<LoadingSkeleton label="Loading alarm monitor" variant="alarm-monitor-grid" rows={4} />
	{:else if rows.length}
		<div class="alarm-monitor-grid">
			{#each rows as row (row.vesselId)}
				<article class="alarm-vessel-card" class:new-card={row.isNew}>
					<div class="alarm-vessel-top">
						<div>
							<span>Vessel</span>
							<strong>{row.vesselName || `Vessel ${row.vesselId}`}</strong>
						</div>

						<div class={`status-pill ${getStatusClass(row.status)}`}>{row.status || '-'}</div>
					</div>

					<div class="alarm-vessel-body">
						<div>
							<span>Alarm Type</span>
							<strong>{formatAlarmType(row.type)}</strong>
						</div>

						<div>
							<span>Last Update</span>
							<strong>{row.lastUpdate || formatDateTime(row.lastUpdateTs)}</strong>
						</div>
					</div>

					{#if row.isNew}
						<div class="new-badge">NEW</div>
					{/if}
				</article>
			{/each}
		</div>
	{:else}
		<div class="empty-box">No alarm monitor data is available for assigned vessels.</div>
	{/if}
</section>

<style>
	.table-section {
		margin-top: 14px;
		overflow: hidden;
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
	}

	.section-header {
		min-height: 58px;
		padding: 12px 14px;
		border-bottom: 1px solid #e5edf5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--color-surface);
	}

	.section-kicker {
		display: inline-flex;
		width: fit-content;
		padding: 4px 9px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		color: #1d4ed8;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.section-header h2 {
		margin: 7px 0 0;
		color: var(--text-primary);
		font-size: 17px;
		font-weight: 900;
	}

	.section-header > strong {
		padding: 5px 10px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		border: 1px solid #bfdbfe;
		color: #1d4ed8;
		font-size: 11px;
		font-weight: 900;
		white-space: nowrap;
	}

	.alarm-monitor-grid {
		padding: 14px;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 12px;
		background: var(--color-elevated);
	}

	.alarm-vessel-card {
		position: relative;
		padding: 14px;
		background: var(--color-surface);
		border: 1px solid #d9e2ec;
		border-radius: 12px;
		box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
		display: grid;
		gap: 12px;
	}

	.alarm-vessel-card.new-card {
		border-color: #fb923c;
		box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.12);
	}

	.alarm-vessel-top {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		align-items: flex-start;
	}

	.alarm-vessel-top span,
	.alarm-vessel-body span {
		display: block;
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.alarm-vessel-top strong {
		display: block;
		margin-top: 4px;
		color: var(--text-primary);
		font-size: 15px;
		line-height: 1.25;
		font-weight: 900;
	}

	.alarm-vessel-body {
		display: grid;
		grid-template-columns: 1fr;
		gap: 10px;
	}

	.alarm-vessel-body strong {
		display: block;
		margin-top: 4px;
		color: var(--text-primary);
		font-size: 12px;
		line-height: 1.35;
		font-weight: 700;
		word-break: break-word;
	}

	.status-pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 70px;
		padding: 4px 8px;
		border-radius: 999px;
		font-size: 10px;
		line-height: 1.2;
		font-weight: 900;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.status-active {
		background: var(--color-danger-muted);
		border: 1px solid #fecaca;
		color: #b91c1c;
	}

	.status-cleared {
		background: var(--color-success-muted);
		border: 1px solid #bbf7d0;
		color: #047857;
	}

	.status-neutral {
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid #cbd5e1;
		color: var(--text-secondary);
	}

	.new-badge {
		position: absolute;
		top: 10px;
		right: 10px;
		padding: 4px 8px;
		border-radius: 999px;
		background: #f97316;
		color: #ffffff;
		font-size: 9px;
		line-height: 1.1;
		font-weight: 900;
		letter-spacing: 0.04em;
	}

	.empty-box {
		padding: 18px 14px;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 800;
		background: var(--color-surface);
	}

	@media (max-width: 760px) {
		.section-header {
			align-items: flex-start;
			flex-direction: column;
		}

		.alarm-monitor-grid {
			grid-template-columns: 1fr;
			padding: 10px;
		}
	}
</style>
