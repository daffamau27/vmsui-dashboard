const TILE_BASE_URL = 'https://apimap.semar.biz.id/tiles';
const TRANSPARENT_PNG_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function isIntegerSegment(value) {
	return /^\d+$/.test(String(value ?? ''));
}

function transparentTile(status = 404) {
	const bytes = Uint8Array.from(atob(TRANSPARENT_PNG_BASE64), (char) => char.charCodeAt(0));

	return new Response(bytes, {
		status,
		headers: {
			'content-type': 'image/png',
			'cache-control': 'public, max-age=300',
			'cross-origin-resource-policy': 'cross-origin'
		}
	});
}

export async function GET({ fetch, params, url }) {
	const { z, x, y } = params;

	if (!isIntegerSegment(z) || !isIntegerSegment(x) || !isIntegerSegment(y)) {
		return transparentTile(400);
	}

	const upstreamUrl = new URL(`${TILE_BASE_URL}/${z}/${x}/${y}.png`);
	const source = url.searchParams.get('source');

	if (source) {
		upstreamUrl.searchParams.set('source', source);
	}

	try {
		const upstream = await fetch(upstreamUrl, {
			headers: {
				accept: 'image/png,*/*'
			}
		});

		if (!upstream.ok && upstream.status !== 404) {
			return transparentTile(upstream.status);
		}

		const body = await upstream.arrayBuffer();

		return new Response(body, {
			status: upstream.status,
			headers: {
				'content-type': upstream.headers.get('content-type') || 'image/png',
				'cache-control': upstream.headers.get('cache-control') || 'public, max-age=86400',
				'cross-origin-resource-policy': 'cross-origin'
			}
		});
	} catch (error) {
		console.warn('[MAP_TILE_PROXY_ERROR]', {
			tile: { z, x, y },
			message: error?.message
		});

		return transparentTile(502);
	}
}
