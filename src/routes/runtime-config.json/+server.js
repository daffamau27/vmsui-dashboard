import { json } from '@sveltejs/kit';

function normalizeBaseUrl(value = '') {
	return String(value || '').trim().replace(/\/+$/, '');
}

export function GET() {
	const apiBaseUrl = normalizeBaseUrl(
		process.env.API_BASE_URL ||
			process.env.PUBLIC_API_BASE_URL ||
			process.env.VITE_API_BASE_URL ||
			process.env.VITE_BACKEND_BASE_URL ||
			''
	);

	return json(
		{
			apiBaseUrl
		},
		{
			headers: {
				'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
			}
		}
	);
}
