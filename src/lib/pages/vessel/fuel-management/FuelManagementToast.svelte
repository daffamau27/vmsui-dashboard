<script>
	import { CircleCheck, Info, TriangleAlert } from 'lucide-svelte';
	import './fuel-management-page.css';

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
				<Info class="fuel-toast-icon" size={16} strokeWidth={2.2} aria-hidden="true" />
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
				<TriangleAlert class="fuel-toast-icon" size={16} strokeWidth={2.2} aria-hidden="true" />
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
				<CircleCheck class="fuel-toast-icon" size={16} strokeWidth={2.2} aria-hidden="true" />
				<div>
					<strong>Success</strong>
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
