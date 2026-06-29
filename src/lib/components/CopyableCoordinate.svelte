<script>
	import { copyTextToClipboard, isCopyableCoordinateValue } from '$lib/utils/coordinateClipboard.js';

	let {
		value = '',
		display = value,
		label = 'coordinate',
		compact = false,
		class: className = ''
	} = $props();

	let copied = $state(false);
	let failed = $state(false);

	const canCopy = $derived(isCopyableCoordinateValue(value));

	async function copyCoordinate(event) {
		event?.stopPropagation?.();

		if (!canCopy) return;

		try {
			const success = await copyTextToClipboard(value);
			if (!success) throw new Error('Copy failed');

			copied = true;
			failed = false;

			setTimeout(() => {
				copied = false;
			}, 1200);
		} catch {
			failed = true;
			copied = false;

			setTimeout(() => {
				failed = false;
			}, 1200);
		}
	}
</script>

<span class={`copyable-coordinate ${compact ? 'compact' : ''} ${className}`.trim()}>
	<span class="copyable-coordinate-value">{display}</span>
	{#if canCopy}
		<button
			type="button"
			class:is-copied={copied}
			class:is-error={failed}
			class="copyable-coordinate-button"
			aria-label={`Copy ${label}`}
			title={`Copy ${label}`}
			onclick={copyCoordinate}
		>
			{copied ? '✓' : failed ? '!' : '⧉'}
		</button>
	{/if}
</span>

<style>
	.copyable-coordinate {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		min-width: 0;
	}

	.copyable-coordinate-value {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.copyable-coordinate-button {
		width: 25px;
		height: 25px;
		min-width: 25px;
		display: inline-grid;
		place-items: center;
		border: 1px solid rgba(96, 165, 250, 0.34);
		border-radius: 8px;
		background: rgba(37, 99, 235, 0.12);
		color: #93c5fd;
		font-size: 12px;
		font-weight: 800;
		line-height: 1;
		cursor: pointer;
		transition:
			transform 0.16s ease,
			border-color 0.16s ease,
			background 0.16s ease,
			color 0.16s ease;
	}

	.copyable-coordinate-button:hover {
		transform: translateY(-1px);
		border-color: rgba(96, 165, 250, 0.72);
		background: rgba(37, 99, 235, 0.28);
		color: #dbeafe;
	}

	.copyable-coordinate-button.is-copied {
		border-color: rgba(34, 197, 94, 0.58);
		background: rgba(34, 197, 94, 0.16);
		color: #86efac;
	}

	.copyable-coordinate-button.is-error {
		border-color: rgba(248, 113, 113, 0.58);
		background: rgba(248, 113, 113, 0.16);
		color: #fecaca;
	}

	.copyable-coordinate.compact {
		gap: 5px;
	}

	.copyable-coordinate.compact .copyable-coordinate-button {
		width: 22px;
		height: 22px;
		min-width: 22px;
		border-radius: 7px;
		font-size: 11px;
	}
</style>
