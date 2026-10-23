<script>
	let { errorMessage = '', successMessage = '', onDismissError, onDismissSuccess } = $props();
</script>

{#if errorMessage || successMessage}
	<div class="profile-toast-layer" aria-live="polite">
		{#if errorMessage}
			<div class="profile-toast danger" role="alert">
				<div class="profile-toast-copy">
					<strong>Action failed</strong>
					<span>{errorMessage}</span>
				</div>
				<button
					type="button"
					class="profile-toast-close"
					onclick={() => onDismissError?.()}
					aria-label="Close error notification">×</button
				>
			</div>
		{/if}

		{#if successMessage}
			<div class="profile-toast success" role="status">
				<div class="profile-toast-copy">
					<strong>Action success</strong>
					<span>{successMessage}</span>
				</div>
				<button
					type="button"
					class="profile-toast-close"
					onclick={() => onDismissSuccess?.()}
					aria-label="Close success notification">×</button
				>
			</div>
		{/if}
	</div>
{/if}
