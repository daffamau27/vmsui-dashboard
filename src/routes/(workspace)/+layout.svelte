<script>
	import { afterNavigate } from '$app/navigation';
	import AppWorkspace from '$lib/components/AppWorkspace.svelte';
	import { rememberVesselRoute } from '$lib/stores/routeNavigation.svelte.js';

	let { children } = $props();
	// Keep visited pages mounted while SvelteKit updates the route and browser history.
	afterNavigate(({ to }) => {
		if (to) rememberVesselRoute(to.url.pathname);
	});
</script>

<AppWorkspace />
{@render children()}
