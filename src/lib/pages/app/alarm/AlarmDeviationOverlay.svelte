<script>
	let {
		rows = [],
		totalItems = 0,
		acknowledging = false,
		acknowledged = false,
		acknowledgeError = '',
		onClose = () => {},
		onAcknowledge = () => {},
		onViewHistory = () => {}
	} = $props();

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

	function getDeviationDescription(type) {
		const descriptions = {
			JUMPING_DATA: 'No telemetry data has been received for more than 5 minutes.',
			SPIKE_RPM: 'Engine RPM spiked from 0 to 1000 RPM or higher.',
			OUTRANGE_RPM: 'Engine RPM is outside the configured operating limits.',
			RPM_BLANK: 'Telemetry is available, but the engine RPM value is missing or unreadable.'
		};

		return (
			descriptions[String(type || '').toUpperCase()] || 'A telemetry data deviation was detected.'
		);
	}

	function getVesselName(row) {
		return (
			row?.vesselName ||
			row?.vessel_name ||
			row?.assetName ||
			row?.deviceName ||
			(row?.vesselId ? `Vessel ${row.vesselId}` : '-')
		);
	}
</script>

{#if rows.length}
	<button
		type="button"
		class="deviation-overlay-backdrop"
		aria-label="Close data deviation alert"
		onclick={onClose}
	></button>

	<div
		class="deviation-alert-dialog"
		role="dialog"
		aria-modal="true"
		aria-labelledby="deviation-alert-title"
	>
		<header class="deviation-alert-header">
			<div class="deviation-alert-icon" aria-hidden="true">!</div>

			<div class="deviation-alert-title">
				<span>Unread data deviations</span>
				<h2 id="deviation-alert-title">
					{totalItems || rows.length} active deviation{(totalItems || rows.length) === 1 ? '' : 's'}
				</h2>
				<p>Review these telemetry issues from vessels assigned to you.</p>
			</div>

			<button
				type="button"
				class="deviation-alert-close"
				aria-label="Close data deviation alert"
				title="Close"
				onclick={onClose}
			>
				&times;
			</button>
		</header>

		<div class="deviation-alert-list">
			{#each rows as row (row.alarmId)}
				<article class="deviation-alert-item">
					<div class="deviation-item-heading">
						<div>
							<span>Vessel</span>
							<strong>{getVesselName(row)}</strong>
						</div>

						<span class="deviation-type-pill">{formatAlarmType(row.type)}</span>
					</div>

					<p>{getDeviationDescription(row.type)}</p>

					<div class="deviation-item-meta">
						<div>
							<span>Started</span>
							<strong>{row.start || formatDateTime(row.startTs)}</strong>
						</div>

						<div>
							<span>Duration</span>
							<strong>{row.duration || `${row.durationSeconds ?? 0}s`}</strong>
						</div>

						<div>
							<span>Device ID</span>
							<strong>{row.deviceId || '-'}</strong>
						</div>
					</div>
				</article>
			{/each}
		</div>

		<footer class="deviation-alert-footer">
			<div class="deviation-alert-feedback">
				<span>
					Showing {rows.length} of {totalItems || rows.length} unread deviations.
				</span>

				{#if acknowledged}
					<strong>Alarms acknowledged. You can still review this alert.</strong>
				{:else if acknowledgeError}
					<em>{acknowledgeError}</em>
				{/if}
			</div>

			<div class="deviation-alert-actions">
				<button type="button" class="secondary-btn" onclick={onClose}>Continue</button>

				<button
					type="button"
					class="deviation-acknowledge-btn"
					onclick={onAcknowledge}
					disabled={acknowledging || acknowledged}
				>
					{acknowledging ? 'Acknowledging...' : acknowledged ? 'Acknowledged' : 'Acknowledge'}
				</button>

				<button type="button" class="deviation-history-btn" onclick={onViewHistory}>
					View History
				</button>
			</div>
		</footer>
	</div>
{/if}

<style>
	.deviation-overlay-backdrop {
		position: fixed;
		inset: 0;
		z-index: 5000;
		width: 100%;
		height: 100%;
		padding: 0;
		border: 0;
		background: rgba(2, 6, 23, 0.76);
		backdrop-filter: blur(4px);
		cursor: default;
	}

	.deviation-alert-dialog {
		position: fixed;
		top: 50%;
		left: 50%;
		z-index: 5001;
		width: min(780px, calc(100vw - 32px));
		max-height: min(760px, calc(100vh - 32px));
		transform: translate(-50%, -50%);
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		overflow: hidden;
		border: 1px solid rgba(251, 146, 60, 0.46);
		border-radius: 18px;
		background: var(--color-surface);
		color: var(--text-primary);
		box-shadow:
			0 28px 80px rgba(2, 6, 23, 0.52),
			0 0 0 1px rgba(249, 115, 22, 0.08);
	}

	.deviation-alert-header {
		padding: 18px 20px;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: start;
		gap: 13px;
		border-bottom: 1px solid rgba(251, 146, 60, 0.24);
		background: linear-gradient(135deg, rgba(249, 115, 22, 0.17), rgba(245, 158, 11, 0.05));
	}

	.deviation-alert-icon {
		width: 38px;
		height: 38px;
		border-radius: 11px;
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		background: #f97316;
		color: #ffffff;
		box-shadow: 0 8px 22px rgba(249, 115, 22, 0.28);
		font-size: 22px;
		line-height: 1;
		font-weight: 950;
	}

	.deviation-alert-title {
		min-width: 0;
	}

	.deviation-alert-title > span {
		color: #fb923c;
		font-size: 10px;
		line-height: 1.2;
		font-weight: 900;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.deviation-alert-title h2 {
		margin: 4px 0 0;
		color: var(--text-primary);
		font-size: clamp(18px, 2.5vw, 24px);
		line-height: 1.2;
		font-weight: 900;
	}

	.deviation-alert-title p {
		margin: 6px 0 0;
		color: var(--text-secondary);
		font-size: 12px;
		line-height: 1.45;
		font-weight: 700;
	}

	.deviation-alert-close {
		width: 34px;
		height: 34px;
		padding: 0;
		border: 1px solid rgba(148, 163, 184, 0.28);
		border-radius: 10px;
		display: grid;
		place-items: center;
		background: rgba(15, 23, 42, 0.42);
		color: var(--text-primary);
		cursor: pointer;
		font-size: 22px;
		line-height: 1;
	}

	.deviation-alert-close:hover {
		border-color: rgba(251, 146, 60, 0.68);
		background: rgba(249, 115, 22, 0.14);
		color: #fb923c;
	}

	.deviation-alert-list {
		min-height: 0;
		padding: 14px;
		overflow-y: auto;
		overscroll-behavior: contain;
		display: grid;
		align-content: start;
		gap: 10px;
		background: var(--color-base);
	}

	.deviation-alert-item {
		padding: 14px;
		border: 1px solid rgba(148, 163, 184, 0.24);
		border-left: 4px solid #f97316;
		border-radius: 12px;
		background: var(--color-surface);
		box-shadow: 0 4px 12px rgba(2, 6, 23, 0.12);
	}

	.deviation-item-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	.deviation-item-heading > div > span,
	.deviation-item-meta span {
		display: block;
		color: var(--text-secondary);
		font-size: 9px;
		line-height: 1.2;
		font-weight: 900;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.deviation-item-heading strong {
		display: block;
		margin-top: 4px;
		color: var(--text-primary);
		font-size: 15px;
		line-height: 1.25;
		font-weight: 900;
	}

	.deviation-type-pill {
		max-width: 48%;
		padding: 5px 9px;
		border: 1px solid rgba(251, 146, 60, 0.42);
		border-radius: 999px;
		background: rgba(249, 115, 22, 0.12);
		color: #fb923c;
		font-size: 9px;
		line-height: 1.2;
		font-weight: 900;
		text-align: center;
		white-space: normal;
	}

	.deviation-alert-item > p {
		margin: 10px 0 0;
		color: var(--text-secondary);
		font-size: 11px;
		line-height: 1.5;
		font-weight: 700;
	}

	.deviation-item-meta {
		margin-top: 12px;
		padding-top: 11px;
		border-top: 1px solid rgba(148, 163, 184, 0.18);
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
	}

	.deviation-item-meta strong {
		display: block;
		margin-top: 4px;
		color: var(--text-primary);
		font-size: 11px;
		line-height: 1.4;
		font-weight: 800;
		overflow-wrap: anywhere;
	}

	.deviation-alert-footer {
		padding: 12px 16px;
		border-top: 1px solid rgba(148, 163, 184, 0.2);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		background: var(--color-surface);
	}

	.deviation-alert-feedback {
		min-width: 0;
		display: grid;
		gap: 3px;
	}

	.deviation-alert-feedback > span {
		color: var(--text-secondary);
		font-size: 10px;
		line-height: 1.4;
		font-weight: 700;
	}

	.deviation-alert-feedback > strong,
	.deviation-alert-feedback > em {
		font-size: 10px;
		line-height: 1.4;
		font-style: normal;
		font-weight: 850;
	}

	.deviation-alert-feedback > strong {
		color: #34d399;
	}

	.deviation-alert-feedback > em {
		color: #f87171;
	}

	.deviation-alert-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		flex: 0 0 auto;
	}

	.secondary-btn {
		height: 32px;
		padding: 0 12px;
		border: none;
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-primary);
		font-size: 11px;
		font-weight: 900;
		cursor: pointer;
		white-space: nowrap;
	}

	.secondary-btn:hover:not(:disabled) {
		background: #cbd5e1;
	}

	.secondary-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.deviation-history-btn {
		height: 32px;
		padding: 0 14px;
		border: 1px solid #f97316;
		background: #f97316;
		color: #ffffff;
		font-size: 11px;
		font-weight: 900;
		cursor: pointer;
		white-space: nowrap;
	}

	.deviation-history-btn:hover {
		border-color: #ea580c;
		background: #ea580c;
	}

	.deviation-acknowledge-btn {
		height: 32px;
		padding: 0 14px;
		border: 1px solid #2563eb;
		background: rgba(37, 99, 235, 0.15);
		color: #60a5fa;
		font-size: 11px;
		font-weight: 900;
		cursor: pointer;
		white-space: nowrap;
	}

	.deviation-acknowledge-btn:hover:not(:disabled) {
		background: #2563eb;
		color: #ffffff;
	}

	.deviation-acknowledge-btn:disabled {
		opacity: 0.58;
		cursor: not-allowed;
	}

	@media (max-width: 760px) {
		.deviation-alert-dialog {
			width: calc(100vw - 20px);
			max-height: calc(100vh - 20px);
			border-radius: 14px;
		}

		.deviation-alert-header {
			padding: 14px;
			grid-template-columns: auto minmax(0, 1fr) auto;
			gap: 10px;
		}

		.deviation-alert-icon {
			width: 32px;
			height: 32px;
			border-radius: 9px;
			font-size: 18px;
		}

		.deviation-alert-list {
			padding: 10px;
		}

		.deviation-item-heading,
		.deviation-alert-footer {
			align-items: stretch;
			flex-direction: column;
		}

		.deviation-type-pill {
			max-width: 100%;
			width: fit-content;
		}

		.deviation-item-meta {
			grid-template-columns: 1fr;
			gap: 9px;
		}

		.deviation-alert-actions,
		.deviation-alert-actions button {
			width: 100%;
		}

		.deviation-alert-actions {
			flex-direction: column-reverse;
			align-items: stretch;
		}
	}
</style>
