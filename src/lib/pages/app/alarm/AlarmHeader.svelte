<script>
	import { CheckCheck, RefreshCw, Siren, TriangleAlert } from 'lucide-svelte';

	let {
		loadingMonitor = false,
		loadingEvents = false,
		acknowledging = false,
		unreadDeviationCount = 0,
		onRefresh = () => {},
		onViewDeviations = () => {},
		onAcknowledgeAll = () => {}
	} = $props();
</script>

<section class="alarm-header-card">
	<div class="section-heading">
		<span class="section-heading-icon tone-red" aria-hidden="true">
			<Siren size={20} strokeWidth={2} />
		</span>
		<div>
			<div class="page-kicker">Alarm Monitor</div>
			<h1>Alarm Page</h1>
			<p>Live alarm monitor and historical alarm event logs for assigned vessels.</p>
		</div>
	</div>

	<div class="header-actions">
		<button
			type="button"
			class="secondary-btn"
			onclick={() => onRefresh?.()}
			disabled={loadingMonitor || loadingEvents}
		>
			<RefreshCw size={14} strokeWidth={2.4} aria-hidden="true" />
			<span>{loadingMonitor || loadingEvents ? 'Refreshing...' : 'Refresh'}</span>
		</button>

		{#if unreadDeviationCount > 0}
			<button
				type="button"
				class="secondary-btn deviation-alert-btn"
				onclick={() => onViewDeviations?.()}
				disabled={acknowledging}
				aria-haspopup="dialog"
				title="Review unread data deviation alarms"
			>
				<TriangleAlert size={14} strokeWidth={2.4} aria-hidden="true" />
				<span>Data Deviations ({unreadDeviationCount})</span>
			</button>
		{/if}

		<button type="button" class="primary-btn" onclick={() => onAcknowledgeAll?.()} disabled={acknowledging}>
			<CheckCheck size={14} strokeWidth={2.6} aria-hidden="true" />
			<span>{acknowledging ? 'Acknowledging...' : 'Acknowledge All'}</span>
		</button>
	</div>
</section>

<style>
	.alarm-header-card {
		padding: 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		box-shadow: var(--shadow-sm);
	}

	/* Shared heading pattern: icon chip + kicker/title stack. */
	.section-heading {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}

	.section-heading-icon {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 12px;
		color: #60a5fa;
		background: var(--color-accent-muted);
		border: 1px solid rgba(59, 130, 246, 0.28);
	}

	.section-heading-icon.tone-red {
		color: #f87171;
		background: rgba(239, 68, 68, 0.12);
		border-color: rgba(239, 68, 68, 0.28);
	}

	.page-kicker {
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

	.alarm-header-card h1 {
		margin: 8px 0 0;
		color: var(--text-primary);
		font-size: 22px;
		line-height: 1.2;
		font-weight: 900;
	}

	.alarm-header-card p {
		margin: 7px 0 0;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 700;
	}

	.header-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		flex-wrap: wrap;
	}

	.primary-btn,
	.secondary-btn {
		height: 32px;
		padding: 0 12px;
		border: none;
		border-radius: 10px;
		font-size: 11px;
		font-weight: 900;
		cursor: pointer;
		white-space: nowrap;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		transition:
			background 0.16s ease,
			border-color 0.16s ease;
	}

	.primary-btn {
		background: var(--color-accent);
		color: #ffffff;
	}

	.secondary-btn {
		background: var(--color-elevated);
		border: 1px solid var(--color-border);
		color: var(--text-primary);
	}

	.primary-btn:hover:not(:disabled) {
		background: var(--color-accent-hover);
	}

	.secondary-btn:hover:not(:disabled) {
		background: rgba(148, 163, 184, 0.18);
		border-color: rgba(59, 130, 246, 0.45);
	}

	.deviation-alert-btn {
		border: 1px solid rgba(251, 146, 60, 0.5);
		background: rgba(249, 115, 22, 0.12);
		color: #fb923c;
	}

	.deviation-alert-btn:hover:not(:disabled) {
		border-color: rgba(251, 146, 60, 0.72);
		background: rgba(249, 115, 22, 0.24);
	}

	.primary-btn:disabled,
	.secondary-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	/* Count inside a button label stays tabular for stable width. */
	.secondary-btn span {
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 760px) {
		.alarm-header-card {
			align-items: stretch;
			flex-direction: column;
		}

		.header-actions {
			width: 100%;
			flex-direction: column;
			align-items: stretch;
		}

		.primary-btn,
		.secondary-btn {
			width: 100%;
			min-width: 0;
		}
	}
</style>
