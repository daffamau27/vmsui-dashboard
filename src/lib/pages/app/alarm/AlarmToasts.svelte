<script>
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
				<div class="alarm-toast-copy">
					<strong>Action failed</strong>
					<span>{error}</span>
				</div>
				<button
					type="button"
					class="alarm-toast-close"
					aria-label="Close error notification"
					onclick={onCloseError}
				>
					&times;
				</button>
			</div>
		{/if}

		{#if successMessage}
			<div class="alarm-toast success" role="status">
				<div class="alarm-toast-copy">
					<strong>Action success</strong>
					<span>{successMessage}</span>
				</div>
				<button
					type="button"
					class="alarm-toast-close"
					aria-label="Close success notification"
					onclick={onCloseSuccess}
				>
					&times;
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
		border: 1px solid #d9e2ec;
		border-radius: 12px;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: start;
		gap: 10px;
		background: rgba(248, 250, 252, 0.98);
		box-shadow: 0 14px 34px rgba(15, 23, 42, 0.28);
		backdrop-filter: blur(10px);
		pointer-events: auto;
		animation: alarm-toast-in 0.22s ease both;
	}

	.alarm-toast-copy {
		min-width: 0;
		display: grid;
		gap: 3px;
	}

	.alarm-toast-copy strong {
		color: #0f172a !important;
		font-size: 12px;
		font-weight: 900;
	}

	.alarm-toast-copy span {
		color: #334155 !important;
		font-size: 12px;
		line-height: 1.35;
		font-weight: 700;
		overflow-wrap: anywhere;
		text-transform: none;
	}

	.alarm-toast.success {
		border-color: #86efac;
		background: rgba(240, 253, 244, 0.98);
	}

	.alarm-toast.success .alarm-toast-copy strong {
		color: #052e16 !important;
	}

	.alarm-toast.success .alarm-toast-copy span {
		color: #14532d !important;
	}

	.alarm-toast.danger {
		border-color: #fda4af;
		background: rgba(255, 241, 242, 0.98);
	}

	.alarm-toast.danger .alarm-toast-copy strong {
		color: #881337 !important;
	}

	.alarm-toast.danger .alarm-toast-copy span {
		color: #9f1239 !important;
	}

	.alarm-toast-close {
		width: 24px;
		height: 24px;
		padding: 0;
		border: 0;
		border-radius: 999px;
		display: grid;
		place-items: center;
		background: rgba(15, 23, 42, 0.08);
		color: #334155 !important;
		font-size: 17px;
		line-height: 1;
		font-weight: 900;
		cursor: pointer;
	}

	.alarm-toast-close:hover {
		background: rgba(15, 23, 42, 0.14);
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
