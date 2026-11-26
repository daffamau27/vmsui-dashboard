<script>
	import { CircleCheck, TriangleAlert, X } from 'lucide-svelte';

	let { errorMessage = '', successMessage = '', onDismissError, onDismissSuccess } = $props();
</script>

{#if errorMessage || successMessage}
	<div class="profile-toast-layer" aria-live="polite">
		{#if errorMessage}
			<div class="profile-toast danger" role="alert">
				<span class="profile-toast-icon" aria-hidden="true">
					<TriangleAlert size={16} strokeWidth={2.4} />
				</span>
				<div class="profile-toast-copy">
					<strong>Action failed</strong>
					<span>{errorMessage}</span>
				</div>
				<button
					type="button"
					class="profile-toast-close"
					onclick={() => onDismissError?.()}
					aria-label="Close error notification"
				>
					<X size={13} strokeWidth={2.6} />
				</button>
			</div>
		{/if}

		{#if successMessage}
			<div class="profile-toast success" role="status">
				<span class="profile-toast-icon" aria-hidden="true">
					<CircleCheck size={16} strokeWidth={2.4} />
				</span>
				<div class="profile-toast-copy">
					<strong>Action success</strong>
					<span>{successMessage}</span>
				</div>
				<button
					type="button"
					class="profile-toast-close"
					onclick={() => onDismissSuccess?.()}
					aria-label="Close success notification"
				>
					<X size={13} strokeWidth={2.6} />
				</button>
			</div>
		{/if}
	</div>
{/if}
