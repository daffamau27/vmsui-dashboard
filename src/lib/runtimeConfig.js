let cachedRuntimeConfig = null;
let runtimeConfigRequest = null;

function normalizeBaseUrl(value = '') {
	return String(value || '').trim().replace(/\/+$/, '');
}

function getBuildTimeApiBaseUrl() {
	return normalizeBaseUrl(
		import.meta.env.PUBLIC_API_BASE_URL ||
			import.meta.env.VITE_API_BASE_URL ||
			import.meta.env.VITE_BACKEND_BASE_URL ||
			''
	);
}

async function fetchRuntimeConfig() {
	if (typeof window === 'undefined') {
		return {
			apiBaseUrl: getBuildTimeApiBaseUrl()
		};
	}

	if (window.__VMS_RUNTIME_CONFIG__) {
		return {
			apiBaseUrl: normalizeBaseUrl(window.__VMS_RUNTIME_CONFIG__.apiBaseUrl)
		};
	}

	const response = await fetch('/runtime-config.json', {
		method: 'GET',
		cache: 'no-store',
		headers: {
			Accept: 'application/json'
		}
	});

	if (!response.ok) {
		throw new Error(`Runtime config failed with status ${response.status}`);
	}

	const data = await response.json();

	return {
		apiBaseUrl: normalizeBaseUrl(data?.apiBaseUrl)
	};
}

export async function getRuntimeConfig() {
	if (cachedRuntimeConfig) return cachedRuntimeConfig;

	if (!runtimeConfigRequest) {
		runtimeConfigRequest = fetchRuntimeConfig()
			.catch((error) => {
				console.warn('[RUNTIME_CONFIG_FALLBACK]', error);
				return {
					apiBaseUrl: getBuildTimeApiBaseUrl()
				};
			})
			.finally(() => {
				runtimeConfigRequest = null;
			});
	}

	cachedRuntimeConfig = await runtimeConfigRequest;
	return cachedRuntimeConfig;
}

export async function getApiBaseUrl() {
	const runtimeConfig = await getRuntimeConfig();
	return normalizeBaseUrl(runtimeConfig?.apiBaseUrl || getBuildTimeApiBaseUrl());
}

export function resetRuntimeConfigCache() {
	cachedRuntimeConfig = null;
	runtimeConfigRequest = null;
}
