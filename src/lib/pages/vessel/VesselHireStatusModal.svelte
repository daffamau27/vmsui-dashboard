<script>
	import { fourDigitDateYear } from '$lib/actions/fourDigitDateYear.js';

	let {
		open = false,
		target = false,
		vesselName = '-',
		loading = false,
		error = '',
		reasonOptions = [],
		reason = $bindable(''),
		effectiveAt = $bindable(''),
		note = $bindable(''),
		onSubmit,
		onClose,
		onBackdropClick
	} = $props();
</script>

{#if open}
	<div
		class="hire-modal-backdrop"
		role="presentation"
		onclick={(event) => onBackdropClick?.(event)}
	>
		<div class="hire-modal" role="dialog" aria-modal="true" aria-labelledby="hire-modal-title">
			<header class="hire-modal-header">
				<div>
					<small>Hire Status</small>
					<h2 id="hire-modal-title">Change to {target ? 'On Hire' : 'Off Hire'}</h2>
					<p>{vesselName}</p>
				</div>
				<button
					type="button"
					class="hire-modal-close"
					onclick={() => onClose?.()}
					disabled={loading}
					aria-label="Close hire status form">×</button
				>
			</header>

			<form class="hire-status-form" onsubmit={(event) => onSubmit?.(event)}>
				<label>
					<span>Status</span>
					<input class:on-hire={target === true} value={target ? 'On Hire' : 'Off Hire'} readonly />
				</label>

				<label>
					<span>Reason <b>*</b></span>
					<select bind:value={reason} required>
						<option value="" disabled>Select reason</option>
						{#each reasonOptions as option (option)}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</label>

				<label>
					<span>Effective date & time <b>*</b></span>
					<input type="datetime-local" use:fourDigitDateYear bind:value={effectiveAt} required />
					<small>Leave empty to apply immediately.</small>
				</label>

				<label>
					<span>Note <em>Optional</em></span>
					<textarea rows="4" bind:value={note} placeholder="Add a note..."></textarea>
				</label>

				{#if error}
					<p class="hire-form-error" role="alert">{error}</p>
				{/if}

				<footer class="hire-modal-actions">
					<button type="button" class="secondary" onclick={() => onClose?.()} disabled={loading}>
						Cancel
					</button>
					<button type="submit" class="primary" disabled={loading}>
						{loading ? 'Saving...' : `Save ${target ? 'On Hire' : 'Off Hire'}`}
					</button>
				</footer>
			</form>
		</div>
	</div>
{/if}
