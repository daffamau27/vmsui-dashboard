<script>
	import { copyTextToClipboard, isCopyableCoordinateValue } from '$lib/utils/coordinateClipboard.js';
	import { Copy, Check, AlertCircle } from 'lucide-svelte';

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
			class="copyable-coordinate-button"
			class:is-copied={copied}
			class:is-error={failed}
			aria-label={copied ? 'Copied' : `Copy ${label}`}
			title={copied ? 'Copied!' : `Copy ${label}`}
			onclick={copyCoordinate}
		>
			{#if copied}
				<Check size={14} strokeWidth={2.5} />
			{:else if failed}
				<AlertCircle size={14} strokeWidth={2.2} />
			{:else}
				<Copy size={14} strokeWidth={2} />
			{/if}
		</button>
	{/if}
</span>

<style>

.copyable-coordinate {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    min-width: 0;
    max-width: 100%;
    vertical-align: middle;
}

.copyable-coordinate-value {
    display: inline-block;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: inherit;
    font-size: inherit;
    font-weight: inherit;
    line-height: 1.5;
    font-variant-numeric: tabular-nums;
}

.copyable-coordinate-button :global(svg) {
    display: block;
    flex-shrink: 0;
    width: 14px;
    height: 14px;
    stroke: currentColor;
}

.copyable-coordinate.compact
.copyable-coordinate-button :global(svg) {
    width: 12px;
    height: 12px;
}

/* Copy button */
.copyable-coordinate-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;

    flex: 0 0 24px;
    width: 24px;
    height: 24px;
    min-width: 24px;
    min-height: 24px;

    padding: 0;
    margin: 0;

    border: 1px solid var(--color-border, #dbe3ee);
    border-radius: 6px;

    background: var(--color-elevated, #f1f5f9);
    color: var(--text-secondary, #64748b);

    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    line-height: 1;

    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;

    transition:
        background-color 0.18s ease,
        border-color 0.18s ease,
        color 0.18s ease,
        box-shadow 0.18s ease,
        transform 0.18s ease;
}

/* Hover */
.copyable-coordinate-button:hover {
    background: var(--color-accent-muted, #eff6ff);
    border-color: #93c5fd;
    color: #2563eb;
    transform: translateY(-1px);
}

/* Click */
.copyable-coordinate-button:active {
    transform: translateY(0) scale(0.94);
}

/* Keyboard accessibility */
.copyable-coordinate-button:focus-visible {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
}

/* Copy success */
.copyable-coordinate-button.is-copied {
    background: rgba(34, 197, 94, 0.10);
    border-color: rgba(34, 197, 94, 0.35);
    color: #16a34a;
}

/* Copy failed */
.copyable-coordinate-button.is-error {
    background: rgba(239, 68, 68, 0.10);
    border-color: rgba(239, 68, 68, 0.35);
    color: #dc2626;
}

/* Compact mode */
.copyable-coordinate.compact {
    gap: 4px;
}

.copyable-coordinate.compact .copyable-coordinate-button {
    flex-basis: 20px;
    width: 20px;
    height: 20px;
    min-width: 20px;
    min-height: 20px;
    border-radius: 5px;
    font-size: 11px;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
    .copyable-coordinate-button {
        transition: none;
    }

    .copyable-coordinate-button:hover,
    .copyable-coordinate-button:active {
        transform: none;
    }
}
</style>
