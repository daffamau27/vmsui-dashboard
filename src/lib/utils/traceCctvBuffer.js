export const TRACE_CCTV_PAGE_SIZE = 20;

export function getCctvLookAheadPages(speed) {
	return speed >= 10 ? 3 : speed >= 5 ? 2 : 1;
}

export function summarizeCctvPage(page, items) {
	const times = [...new Set(items.map((item) => item.timestampMs).filter(Number.isFinite))].sort(
		(a, b) => a - b
	);
	return { page, start: times[0], end: times.at(-1), frameCount: times.length };
}

// Select only missing pages within a bounded window ahead of playback.
// Anchor the window to the current position, not the last cached page.
export function getCctvPagesToLoad({
	timestampMs,
	pages = [],
	totalPages = 1,
	rangeStart,
	rangeEnd,
	playing = false,
	direction = 1,
	speed = 1,
	traceMsPerRealMs = 60
}) {
	if (!Number.isFinite(timestampMs) || totalPages < 1) return [];
	const loaded = new Set(pages.map((page) => page.page));
	const ranges = pages
		.filter((page) => Number.isFinite(page.start) && Number.isFinite(page.end))
		.sort((a, b) => a.page - b.page);
	let current = ranges.find((page) => timestampMs >= page.start && timestampMs <= page.end);
	const before = ranges.filter((page) => page.end < timestampMs).at(-1);
	const after = ranges.find((page) => page.start > timestampMs);

	if (!current) {
		if (!before && after?.page === 1) current = after;
		else if (!after && before?.page === totalPages) current = before;
		else if (before && after && after.page === before.page + 1) {
			// A real gap between consecutive pages is not an unloaded page.
			current = direction === -1 ? after : before;
		} else {
			// Seeking can land far from the cache. Use known page timestamps to
			// narrow the search, instead of downloading every intervening page.
			const low = before ? before.page + 1 : 1;
			const high = after ? after.page - 1 : totalPages;
			const start = before?.end ?? rangeStart;
			const end = after?.start ?? rangeEnd;
			const ratio =
				end > start ? Math.max(0, Math.min(1, (timestampMs - start) / (end - start))) : 0;
			const target = Math.max(low, Math.min(high, low + Math.floor(ratio * (high - low + 1))));
			return loaded.has(target) ? [] : [target];
		}
	}

	if (!playing) return [];
	const lookAheadPages = getCctvLookAheadPages(speed);
	if (lookAheadPages === 1) {
		const span = Math.max(0, current.end - current.start);
		const frameInterval = current.frameCount > 1 ? span / (current.frameCount - 1) : 0;
		// At x1/x2, keep the existing near-boundary prefetch behavior.
		const lead = Math.min(
			Math.max(frameInterval, span * 0.9),
			Math.max(frameInterval, 1500 * traceMsPerRealMs * Math.max(1, speed))
		);
		const remaining = direction === -1 ? timestampMs - current.start : current.end - timestampMs;
		if (remaining > lead) return [];
	}
	// At x5/x10, fill two/three adjacent pages as soon as playback starts.
	const requests = [];
	for (let distance = 1; distance <= lookAheadPages; distance += 1) {
		const next = current.page + distance * (direction === -1 ? -1 : 1);
		if (next < 1 || next > totalPages) break;
		if (!loaded.has(next)) requests.push(next);
	}
	return requests;
}
