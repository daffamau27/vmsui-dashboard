
const COPY_ICON = `
    <svg xmlns="http://www.w3.org/2000/svg"
        width="14" height="14" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"
        aria-hidden="true">
        <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
    </svg>
`;

const CHECK_ICON = `
    <svg xmlns="http://www.w3.org/2000/svg"
        width="14" height="14" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round"
        aria-hidden="true">
        <path d="M20 6 9 17l-5-5"/>
    </svg>
`;

const ERROR_ICON = `
    <svg xmlns="http://www.w3.org/2000/svg"
        width="14" height="14" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2.2"
        stroke-linecap="round" stroke-linejoin="round"
        aria-hidden="true">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 8v4"/>
        <path d="M12 16h.01"/>
    </svg>
`;

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

    return `
        <button
            type="button"
            class="coordinate-copy-button"
            data-coordinate-copy="${safeValue}"
            data-coordinate-label="${safeLabel}"
            title="Copy ${safeLabel}"
            aria-label="Copy ${safeLabel}"
        >
            ${COPY_ICON}
        </button>
    `;
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

    // Hindari proses copy berulang saat feedback aktif
    if (button.classList.contains('is-copying')) return true;

    button.classList.add('is-copying');

    copyTextToClipboard(value)
        .then((copied) => {
            if (!copied) throw new Error('Copy failed');

            button.innerHTML = CHECK_ICON;
            button.classList.add('is-copied');
            button.title = 'Copied!';
        })
        .catch(() => {
            button.innerHTML = ERROR_ICON;
            button.classList.add('is-error');
            button.title = 'Copy failed';
        })
        .finally(() => {
            setTimeout(() => {
                button.innerHTML = COPY_ICON;
                button.classList.remove('is-copied', 'is-error', 'is-copying');

                const label = button.dataset.coordinateLabel || 'coordinate';
                button.title = `Copy ${label}`;
            }, 1200);
        });

    return true;
}
