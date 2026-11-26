<script>
	import { Clapperboard } from 'lucide-svelte';

	let { loading = false, error = '', detail = null, onClose = () => {} } = $props();

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

	function formatDuration(value) {
		const seconds = Number(value);
		if (!Number.isFinite(seconds) || seconds < 0) return '-';

		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = Math.floor(seconds % 60);
		return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
	}

	function handleBackdropClick() {
		onClose();
	}
</script>

<button
	type="button"
	class="recording-overlay-backdrop"
	aria-label="Close CCTV recording"
	onclick={handleBackdropClick}
></button>

<div
	class="recording-dialog"
	role="dialog"
	aria-modal="true"
	aria-labelledby="alarm-recording-title"
>
	<header class="recording-dialog-header">
		<div class="recording-dialog-heading">
			<span class="recording-dialog-icon" aria-hidden="true">
				<Clapperboard size={19} strokeWidth={2.3} />
			</span>

			<div>
				<span class="recording-dialog-kicker">CCTV Recording</span>
				<h2 id="alarm-recording-title">
					{detail?.cameraName || 'Camera recording'}
				</h2>
				<p>{detail?.vesselName || '-'}</p>
			</div>
		</div>

		<button
			type="button"
			class="recording-dialog-close"
			aria-label="Close CCTV recording"
			title="Close"
			onclick={onClose}
		>
			&times;
		</button>
	</header>

	<div class="recording-dialog-body">
		{#if loading}
			<div class="recording-state" role="status">
				<span class="recording-spinner" aria-hidden="true"></span>
				<strong>Loading recording...</strong>
			</div>
		{:else if error}
			<div class="recording-state recording-state-error" role="alert">
				<strong>Recording unavailable</strong>
				<span>{error}</span>
			</div>
		{:else if detail?.recordingUrl}
			<div class="recording-player-shell">
				<!-- svelte-ignore a11y_media_has_caption -->
				<video src={detail.recordingUrl} controls playsinline preload="metadata">
					Your browser does not support video playback.
				</video>
			</div>
		{:else}
			<div class="recording-state" role="status">
				<strong>No video available</strong>
				<span>This recording has no playback URL yet.</span>
			</div>
		{/if}

		<div class="recording-meta">
			<div>
				<span>Camera</span>
				<strong>{detail?.cameraName || '-'}</strong>
			</div>
			<div>
				<span>Vessel</span>
				<strong>{detail?.vesselName || '-'}</strong>
			</div>
			<div>
				<span>Started</span>
				<strong>{formatDateTime(detail?.startedAt)}</strong>
			</div>
			<div>
				<span>Ended</span>
				<strong>{formatDateTime(detail?.endedAt)}</strong>
			</div>
			<div>
				<span>Duration</span>
				<strong>{formatDuration(detail?.durationSeconds)}</strong>
			</div>
			<div>
				<span>Type</span>
				<strong>{detail?.type || detail?.alarmType || '-'}</strong>
			</div>
		</div>
	</div>
</div>

<style>
	.recording-overlay-backdrop {
		position: fixed;
		inset: 0;
		z-index: 5000;
		width: 100%;
		height: 100%;
		padding: 0;
		border: 0;
		background: rgba(2, 6, 23, 0.78);
		backdrop-filter: blur(5px);
		cursor: default;
	}

	.recording-dialog {
		position: fixed;
		top: 50%;
		left: 50%;
		z-index: 5001;
		width: min(880px, calc(100vw - 32px));
		max-height: min(820px, calc(100vh - 32px));
		transform: translate(-50%, -50%);
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		overflow: hidden;
		border: 1px solid rgba(96, 165, 250, 0.42);
		border-radius: 18px;
		background: var(--color-surface);
		color: var(--text-primary);
		box-shadow:
			0 28px 80px rgba(2, 6, 23, 0.52),
			0 0 0 1px rgba(37, 99, 235, 0.1);
	}

	.recording-dialog-header {
		padding: 16px 18px;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 13px;
		border-bottom: 1px solid rgba(96, 165, 250, 0.24);
		background: linear-gradient(135deg, rgba(37, 99, 235, 0.18), rgba(59, 130, 246, 0.05));
	}

	.recording-dialog-heading {
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.recording-dialog-icon {
		width: 38px;
		height: 38px;
		flex: 0 0 auto;
		border-radius: 11px;
		display: grid;
		place-items: center;
		background: #2563eb;
		color: #ffffff;
		box-shadow: 0 8px 22px rgba(37, 99, 235, 0.3);
	}

	.recording-dialog-kicker {
		color: #60a5fa;
		font-size: 10px;
		line-height: 1.2;
		font-weight: 900;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.recording-dialog-heading h2 {
		margin: 4px 0 0;
		color: var(--text-primary);
		font-size: clamp(17px, 2.4vw, 22px);
		line-height: 1.2;
		font-weight: 900;
	}

	.recording-dialog-heading p {
		margin: 5px 0 0;
		color: var(--text-secondary);
		font-size: 12px;
		line-height: 1.4;
		font-weight: 700;
	}

	.recording-dialog-close {
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

	.recording-dialog-close:hover {
		border-color: rgba(96, 165, 250, 0.68);
		background: rgba(37, 99, 235, 0.16);
		color: #93c5fd;
	}

	.recording-dialog-body {
		min-height: 0;
		padding: 16px;
		display: grid;
		align-content: start;
		gap: 14px;
		overflow-y: auto;
		overscroll-behavior: contain;
		background: var(--color-base);
	}

	.recording-player-shell {
		width: 100%;
		overflow: hidden;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 12px;
		background: #020617;
		aspect-ratio: 16 / 9;
	}

	.recording-player-shell video {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
		background: #020617;
	}

	.recording-state {
		min-height: 240px;
		display: grid;
		place-items: center;
		align-content: center;
		gap: 10px;
		padding: 24px;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 12px;
		background: #020617;
		text-align: center;
		box-sizing: border-box;
	}

	.recording-state strong {
		font-size: 14px;
		font-weight: 900;
	}

	.recording-state span {
		max-width: 520px;
		color: var(--text-secondary);
		font-size: 12px;
		line-height: 1.5;
		font-weight: 700;
	}

	.recording-state-error strong {
		color: #fca5a5;
	}

	.recording-spinner {
		width: 30px;
		height: 30px;
		border: 3px solid rgba(96, 165, 250, 0.22);
		border-top-color: #60a5fa;
		border-radius: 50%;
		animation: alarmRecordingSpin 0.8s linear infinite;
	}

	@keyframes alarmRecordingSpin {
		to {
			transform: rotate(360deg);
		}
	}

	.recording-meta {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}

	.recording-meta > div {
		min-width: 0;
		padding: 11px 12px;
		display: grid;
		gap: 5px;
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 9px;
		background: var(--color-surface);
	}

	.recording-meta span {
		color: var(--text-secondary);
		font-size: 9px;
		font-weight: 900;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.recording-meta strong {
		overflow: hidden;
		color: var(--text-primary);
		font-size: 11px;
		font-weight: 800;
		line-height: 1.4;
		text-overflow: ellipsis;
		overflow-wrap: anywhere;
	}

	@media (max-width: 760px) {
		.recording-dialog {
			width: calc(100vw - 20px);
			max-height: calc(100vh - 20px);
			border-radius: 14px;
		}

		.recording-dialog-header {
			padding: 13px;
		}

		.recording-dialog-body {
			padding: 12px;
		}

		.recording-meta {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.recording-state {
			min-height: 180px;
		}
	}
</style>
