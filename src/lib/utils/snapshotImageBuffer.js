// A small decoded-image cache shared by trace prefetch and the displayed image.
// Requests outside the moving playback window are dropped before they start.
export function createSnapshotImageBuffer({
	concurrency = 6,
	maxEntries = 64,
	timeoutMs = 15000,
	createImage = () => new Image(),
	onChange = () => {}
} = {}) {
	const entries = new Map();
	let wanted = new Set();
	let queue = [];
	let running = 0;
	let generation = 0;

	function trim() {
		for (const [url, entry] of entries) {
			if (entries.size <= maxEntries) break;
			if (!wanted.has(url) && entry.status !== 'loading' && entry.status !== 'queued')
				entries.delete(url);
		}
	}

	function pump() {
		while (running < concurrency && queue.length) {
			const entry = queue.shift();
			if (entry.status !== 'queued') continue;
			entry.status = 'loading';
			running += 1;
			const requestGeneration = generation;
			const image = createImage();
			entry.image = image;
			let done = false;
			let timer;
			const finish = (ready) => {
				if (done) return;
				done = true;
				clearTimeout(timer);
				image.onload = image.onerror = null;
				entry.status = ready ? 'ready' : 'error';
				entry.resolve(ready);
				if (requestGeneration !== generation) return;
				running -= 1;
				trim();
				onChange();
				pump();
			};
			entry.cancel = () => {
				finish(false);
				image.src = '';
			};
			timer = setTimeout(() => {
				finish(false);
				image.src = '';
			}, timeoutMs);
			image.onload = async () => {
				try {
					if (image.decode) await image.decode();
				} catch {
					/* Already decoded by the browser. */
				}
				finish(image.naturalWidth > 0);
			};
			image.onerror = () => finish(false);
			image.src = entry.url;
		}
	}

	function enqueue(url, priority = false) {
		if (!url) return Promise.resolve(false);
		let entry = entries.get(url);
		if (!entry) {
			entry = { url, status: 'queued', image: null };
			entry.promise = new Promise((resolve) => {
				entry.resolve = resolve;
			});
			entries.set(url, entry);
			queue.push(entry);
		} else {
			// Touch the entry so unused decoded frames are evicted first.
			entries.delete(url);
			entries.set(url, entry);
		}
		if (priority && entry.status === 'queued') {
			queue = [entry, ...queue.filter((candidate) => candidate !== entry)];
		}
		return entry.promise;
	}

	return {
		status: (url) => entries.get(url)?.status || 'missing',
		load(url) {
			const promise = enqueue(url, true);
			pump();
			return promise;
		},
		setWindow(urls) {
			const next = [...new Set(urls.filter(Boolean))].slice(0, maxEntries);
			wanted = new Set(next);
			for (const entry of queue) {
				if (!wanted.has(entry.url)) {
					entries.delete(entry.url);
					entry.status = 'cancelled';
					entry.resolve(false);
				}
			}
			queue = queue.filter((entry) => wanted.has(entry.url));
			for (const url of next) enqueue(url);
			queue.sort((a, b) => next.indexOf(a.url) - next.indexOf(b.url));
			trim();
			pump();
		},
		clear() {
			generation += 1;
			for (const entry of entries.values()) {
				entry.cancel?.();
				entry.resolve(false);
			}
			entries.clear();
			queue = [];
			wanted.clear();
			running = 0;
		}
	};
}
