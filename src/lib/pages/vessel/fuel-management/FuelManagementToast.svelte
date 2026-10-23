<script>
	let {
		showNoVessel = false,
		errorMessage = '',
		successMessage = '',
		onCloseNoVessel,
		onCloseError,
		onCloseSuccess
	} = $props();
</script>

{#if showNoVessel || errorMessage || successMessage}
	<div class="fuel-toast-layer" aria-live="polite">
		{#if showNoVessel}
			<div class="fuel-toast warning">
				<div>
					<strong>No vessel selected</strong>
					<span>Please select a vessel first to display Fuel Management data.</span>
				</div>
				<button
					type="button"
					class="toast-close"
					onclick={() => onCloseNoVessel?.()}
					aria-label="Close notification">×</button
				>
			</div>
		{/if}

		{#if errorMessage}
			<div class="fuel-toast danger">
				<div>
					<strong>Action failed</strong>
					<span>{errorMessage}</span>
				</div>
				<button
					type="button"
					class="toast-close"
					onclick={() => onCloseError?.()}
					aria-label="Close notification">×</button
				>
			</div>
		{/if}

		{#if successMessage}
			<div class="fuel-toast success">
				<div>
					<strong>Action success</strong>
					<span>{successMessage}</span>
				</div>
				<button
					type="button"
					class="toast-close"
					onclick={() => onCloseSuccess?.()}
					aria-label="Close notification">×</button
				>
			</div>
		{/if}
	</div>
{/if}
