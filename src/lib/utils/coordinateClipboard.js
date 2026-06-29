export function isCopyableCoordinateValue(value) {
	return value !== null && value !== undefined && value !== '' && value !== '-';
}

export async function copyTextToClipboard(value) {
	const text = String(value ?? '');

	if (!text) return false;

	if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(text);
		return true;
	}

	if (typeof document === 'undefined') return false;

	const textarea = document.createElement('textarea');
	textarea.value = text;
	textarea.setAttribute('readonly', '');
	textarea.style.position = 'fixed';
	textarea.style.top = '-1000px';
	textarea.style.left = '-1000px';
	document.body.appendChild(textarea);
	textarea.select();

	try {
		return document.execCommand('copy');
	} finally {
		document.body.removeChild(textarea);
	}
}

export function escapeCoordinateAttribute(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

export function createCoordinateCopyButtonHtml(value, label = 'coordinate') {
	if (!isCopyableCoordinateValue(value)) return '';

	const safeValue = escapeCoordinateAttribute(value);
	const safeLabel = escapeCoordinateAttribute(label);

	return `<button type="button" class="coordinate-copy-button" data-coordinate-copy="${safeValue}" data-coordinate-label="${safeLabel}" title="Copy ${safeLabel}" aria-label="Copy ${safeLabel}">⧉</button>`;
}

export function createCopyableCoordinateHtml(value, label = 'coordinate') {
	const safeValue = escapeCoordinateAttribute(value);

	return `<span class="coordinate-copy-inline"><strong>${safeValue}</strong>${createCoordinateCopyButtonHtml(value, label)}</span>`;
}

export function handleCoordinateCopyClick(event) {
	const button = event.target?.closest?.('[data-coordinate-copy]');

	if (!button) return false;

	event.preventDefault();
	event.stopPropagation();

	const value = button.dataset.coordinateCopy;
	const originalText = button.textContent;

	copyTextToClipboard(value)
		.then((copied) => {
			if (!copied) return;
			button.textContent = '✓';
			button.classList.add('is-copied');

			setTimeout(() => {
				button.textContent = originalText || '⧉';
				button.classList.remove('is-copied');
			}, 1200);
		})
		.catch(() => {
			button.textContent = '!';
			button.classList.add('is-error');

			setTimeout(() => {
				button.textContent = originalText || '⧉';
				button.classList.remove('is-error');
			}, 1200);
		});

	return true;
}
