<script>
	import { CircleCheck, TriangleAlert, X } from 'lucide-svelte';

	let {
		error = '',
		successMessage = '',
		onCloseError = () => {},
		onCloseSuccess = () => {}
	} = $props();
</script>

{#if error || successMessage}
	<div class="alarm-toast-layer" aria-live="polite">
		{#if error}
			<div class="alarm-toast danger" role="alert">
				<span class="alarm-toast-icon" aria-hidden="true">
					<TriangleAlert size={16} strokeWidth={2.4} />
				</span>
				<div class="alarm-toast-copy">
					<strong>Action failed</strong>
					<span>{error}</span>
				</div>
				<button
					type="button"
					class="alarm-toast-close"
					aria-label="Close error notification"
					onclick={() => onCloseError?.()}
				>
					<X size={13} strokeWidth={2.6} />
				</button>
			</div>
		{/if}

		{#if successMessage}
			<div class="alarm-toast success" role="status">
				<span class="alarm-toast-icon" aria-hidden="true">
					<CircleCheck size={16} strokeWidth={2.4} />
				</span>
				<div class="alarm-toast-copy">
					<strong>Action success</strong>
					<span>{successMessage}</span>
				</div>
				<button
					type="button"
					class="alarm-toast-close"
					aria-label="Close success notification"
					onclick={() => onCloseSuccess?.()}
				>
					<X size={13} strokeWidth={2.6} />
				</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.alarm-toast-layer {
		position: fixed;
		top: 18px;
		right: 18px;
		z-index: 30000;
		width: min(390px, calc(100vw - 36px));
		display: grid;
		gap: 10px;
		pointer-events: none;
	}

	.alarm-toast {
		padding: 11px 12px;
		border: 1px solid var(--color-border);
		border-radius: 12px;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: start;
		gap: 10px;
		background: var(--color-surface);
		color: var(--text-primary);
		box-shadow: 0 14px 34px rgba(2, 6, 23, 0.42);
		backdrop-filter: blur(10px);
		pointer-events: auto;
		animation: alarm-toast-in 0.22s ease both;
	}

	.alarm-toast-icon {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: 8px;
	}

	.alarm-toast-copy {
		min-width: 0;
		display: grid;
		gap: 3px;
	}

	.alarm-toast-copy strong {
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 900;
	}

	.alarm-toast-copy span {
		color: var(--text-secondary);
		font-size: 12px;
		line-height: 1.35;
		font-weight: 700;
		overflow-wrap: anywhere;
		text-transform: none;
	}

	.alarm-toast.success {
		border-color: rgba(16, 185, 129, 0.3);
	}

	.alarm-toast.success .alarm-toast-icon {
		color: #34d399;
		background: rgba(16, 185, 129, 0.14);
		border: 1px solid rgba(16, 185, 129, 0.28);
	}

	.alarm-toast.danger {
		border-color: rgba(239, 68, 68, 0.28);
	}

	.alarm-toast.danger .alarm-toast-icon {
		color: #f87171;
		background: rgba(239, 68, 68, 0.12);
		border: 1px solid rgba(239, 68, 68, 0.28);
	}

	.alarm-toast-close {
		width: 24px;
		height: 24px;
		padding: 0;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		display: grid;
		place-items: center;
		background: rgba(148, 163, 184, 0.14);
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background 0.16s ease,
			color 0.16s ease;
	}

	.alarm-toast-close:hover {
		background: rgba(148, 163, 184, 0.28);
		color: var(--text-primary);
	}

	@keyframes alarm-toast-in {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}

		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (max-width: 760px) {
		.alarm-toast-layer {
			top: 48px;
			right: 10px;
			width: calc(100vw - 20px);
		}
	}
</style>
