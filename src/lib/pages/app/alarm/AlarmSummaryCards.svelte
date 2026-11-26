<script>
	import { BellRing, History, Ship, TriangleAlert } from 'lucide-svelte';

	let { vesselCount = 0, activeCount = 0, newCount = 0, eventCount = 0 } = $props();
</script>

<section class="alarm-summary-grid">
	<article class="summary-card">
		<div class="summary-card-head">
			<span class="summary-card-icon tone-cyan" aria-hidden="true">
				<Ship size={13} strokeWidth={2.2} />
			</span>
			<span>Active Alarm Vessels</span>
		</div>
		<strong>{vesselCount}</strong>
	</article>

	<article class="summary-card">
		<div class="summary-card-head">
			<span class="summary-card-icon tone-red" aria-hidden="true">
				<BellRing size={13} strokeWidth={2.2} />
			</span>
			<span>Active Alarms</span>
		</div>
		<strong>{activeCount}</strong>
	</article>

	<article class="summary-card">
		<div class="summary-card-head">
			<span class="summary-card-icon tone-amber" aria-hidden="true">
				<TriangleAlert size={13} strokeWidth={2.2} />
			</span>
			<span>New Alarms</span>
		</div>
		<strong>{newCount}</strong>
	</article>

	<article class="summary-card">
		<div class="summary-card-head">
			<span class="summary-card-icon tone-violet" aria-hidden="true">
				<History size={13} strokeWidth={2.2} />
			</span>
			<span>Historical Events</span>
		</div>
		<strong>{eventCount}</strong>
	</article>
</section>

<style>
	.alarm-summary-grid {
		margin-top: 14px;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
	}

	.summary-card {
		min-height: 82px;
		padding: 14px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		box-shadow: var(--shadow-sm);
		transition:
			border-color 0.18s ease,
			box-shadow 0.18s ease,
			transform 0.18s ease;
	}

	.summary-card:hover {
		transform: translateY(-2px);
		border-color: rgba(248, 113, 113, 0.38);
		box-shadow: var(--shadow-md);
	}

	.summary-card-head {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.summary-card-icon {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 7px;
	}

	.summary-card-icon.tone-cyan {
		color: #38bdf8;
		background: rgba(56, 189, 248, 0.14);
		border: 1px solid rgba(56, 189, 248, 0.28);
	}

	.summary-card-icon.tone-red {
		color: #f87171;
		background: rgba(239, 68, 68, 0.12);
		border: 1px solid rgba(239, 68, 68, 0.28);
	}

	.summary-card-icon.tone-amber {
		color: #fbbf24;
		background: rgba(251, 191, 36, 0.12);
		border: 1px solid rgba(251, 191, 36, 0.26);
	}

	.summary-card-icon.tone-violet {
		color: #a78bfa;
		background: rgba(167, 139, 250, 0.14);
		border: 1px solid rgba(167, 139, 250, 0.28);
	}

	.summary-card-head span:not(.summary-card-icon) {
		color: var(--text-secondary);
		font-size: 10px;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.summary-card strong {
		display: block;
		margin-top: 10px;
		color: var(--text-primary);
		font-size: 20px;
		line-height: 1;
		font-weight: 900;
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 1100px) {
		.alarm-summary-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 760px) {
		.alarm-summary-grid {
			grid-template-columns: 1fr;
			gap: 10px;
		}
	}
</style>
