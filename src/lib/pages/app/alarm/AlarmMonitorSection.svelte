<script>
	import LoadingSkeleton from '$lib/components/LoadingSkeleton.svelte';
	import { Radio } from 'lucide-svelte';

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
		<div class="section-heading">
			<span class="mini-heading-icon tone-red" aria-hidden="true">
				<Radio size={14} strokeWidth={2.3} />
			</span>
			<div>
				<span class="section-kicker">Live</span>
				<h2>Assigned Vessel Alarm Status</h2>
			</div>
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
		border: 1px solid var(--color-border);
		box-shadow: var(--shadow-sm);
	}

	.section-header {
		min-height: 58px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--color-border-subtle);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--color-surface);
	}

	/* Shared heading pattern: icon chip + kicker/title stack. */
	.section-heading {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}

	.mini-heading-icon {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 9px;
	}

	.mini-heading-icon.tone-red {
		color: #f87171;
		background: rgba(239, 68, 68, 0.12);
		border: 1px solid rgba(239, 68, 68, 0.28);
	}

	.section-kicker {
		display: inline-flex;
		width: fit-content;
		padding: 4px 9px;
		border-radius: 999px;
		background: var(--color-accent-muted);
		color: var(--text-accent);
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
		border: 1px solid rgba(59, 130, 246, 0.32);
		color: #93c5fd;
		font-size: 11px;
		font-weight: 900;
		font-variant-numeric: tabular-nums;
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
		border: 1px solid var(--color-border);
		border-radius: 12px;
		box-shadow: var(--shadow-sm);
		display: grid;
		gap: 12px;
		transition:
			border-color 0.18s ease,
			box-shadow 0.18s ease,
			transform 0.18s ease;
	}

	.alarm-vessel-card:hover {
		transform: translateY(-2px);
		border-color: rgba(248, 113, 113, 0.42);
		box-shadow: var(--shadow-md);
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
		font-variant-numeric: tabular-nums;
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
		border: 1px solid rgba(239, 68, 68, 0.28);
		color: #f87171;
	}

	.status-cleared {
		background: var(--color-success-muted);
		border: 1px solid rgba(16, 185, 129, 0.3);
		color: #34d399;
	}

	.status-neutral {
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid var(--color-border);
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
