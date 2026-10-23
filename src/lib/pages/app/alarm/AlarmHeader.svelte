<script>
	let {
		loadingMonitor = false,
		loadingEvents = false,
		acknowledging = false,
		onRefresh = () => {},
		onAcknowledgeAll = () => {}
	} = $props();
</script>

<section class="alarm-header-card">
	<div>
		<div class="page-kicker">Alarm Monitor</div>
		<h1>Alarm Page</h1>
		<p>Live alarm monitor and historical alarm event logs for assigned vessels.</p>
	</div>

	<div class="header-actions">
		<button
			type="button"
			class="secondary-btn"
			onclick={onRefresh}
			disabled={loadingMonitor || loadingEvents}
		>
			{loadingMonitor || loadingEvents ? 'Refreshing...' : 'Refresh'}
		</button>

		<button type="button" class="primary-btn" onclick={onAcknowledgeAll} disabled={acknowledging}>
			{acknowledging ? 'Acknowledging...' : 'Acknowledge All'}
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
		border: 1px solid #d9e2ec;
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
	}

	.page-kicker {
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
		font-size: 11px;
		font-weight: 900;
		cursor: pointer;
		white-space: nowrap;
	}

	.primary-btn {
		background: #2563eb;
		color: #ffffff;
	}

	.secondary-btn {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-primary);
	}

	.primary-btn:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.secondary-btn:hover:not(:disabled) {
		background: #cbd5e1;
	}

	.primary-btn:disabled,
	.secondary-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
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
