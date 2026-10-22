<script>
  import { activeMenu } from "$lib/stores/appNavigation.svelte.js";
  import { currentUser } from "$lib/stores/authStore.js";
  import { canAccessAppMenu } from "$lib/utils/appRoutes.js";
  import LoadingSkeleton from "$lib/components/LoadingSkeleton.svelte";

  import ProfilePage from "$lib/pages/ProfilePage.svelte";
  import FleetViewPage from "$lib/pages/FleetViewPage.svelte";
  import VesselPage from "$lib/pages/VesselPage.svelte";
  import AllVesselSummaryPage from "$lib/pages/AllVesselSummaryPage.svelte";
  import AlarmPage from "$lib/pages/AlarmPage.svelte";
  import VoyagePlansPage from "$lib/pages/VoyagePlansPage.svelte";
  import AdministratorPage from "$lib/pages/AdministratorPage.svelte";

  /** @type {Record<string, boolean>} */
  let mountedPages = {};

  $: if ($activeMenu && canAccessAppMenu($activeMenu, $currentUser) && !mountedPages[$activeMenu]) {
    mountedPages = {
      ...mountedPages,
      [$activeMenu]: true
    };
  }
</script>

<main class="app-content">
  {#if !mountedPages[$activeMenu]}
    <LoadingSkeleton label="Loading workspace" variant="page" />
  {/if}
  <section
    class="keep-page scroll-page"
    class:active-page={$activeMenu === "profile"}
  >
    {#if mountedPages["profile"] && canAccessAppMenu('profile', $currentUser)}
      <ProfilePage />
    {/if}
  </section>

  <section
    class="keep-page no-scroll-page"
    class:active-page={$activeMenu === "fleet-view"}
  >
    {#if mountedPages["fleet-view"] && canAccessAppMenu('fleet-view', $currentUser)}
      <FleetViewPage active={$activeMenu === "fleet-view"} />
    {/if}
  </section>

  <section
    class="keep-page no-scroll-page"
    class:active-page={$activeMenu === "vessel"}
  >
    {#if mountedPages["vessel"] && canAccessAppMenu('vessel', $currentUser)}
      <VesselPage active={$activeMenu === "vessel"} />
    {/if}
  </section>

  <section
    class="keep-page scroll-page"
    class:active-page={$activeMenu === "all-vessel-summary"}
  >
    {#if mountedPages["all-vessel-summary"] && canAccessAppMenu('all-vessel-summary', $currentUser)}
      <AllVesselSummaryPage />
    {/if}
  </section>

  <section
    class="keep-page scroll-page"
    class:active-page={$activeMenu === "alarm"}
  >
    {#if mountedPages["alarm"] && canAccessAppMenu('alarm', $currentUser)}
      <AlarmPage active={$activeMenu === "alarm"} />
    {/if}
  </section>

  <section
    class="keep-page no-scroll-page"
    class:active-page={$activeMenu === "voyage-plans"}
  >
    {#if mountedPages["voyage-plans"] && canAccessAppMenu('voyage-plans', $currentUser)}
      <VoyagePlansPage />
    {/if}
  </section>

  <section
    class="keep-page no-scroll-page"
    class:active-page={$activeMenu === "administrator"}
  >
    {#if mountedPages["administrator"] && canAccessAppMenu('administrator', $currentUser)}
      <AdministratorPage />
    {/if}
  </section>
</main>

<style>
  .app-content {
    position: relative;
    width: 100%;
    min-width: 0;
    height: 100vh;
    overflow: hidden;
    background: var(--color-base);
  }

  .keep-page {
    position: absolute;
    inset: 0;
    z-index: 0;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .keep-page.active-page {
    z-index: 10;
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }

  .scroll-page.active-page {
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
  }

  .no-scroll-page.active-page {
    overflow: hidden;
  }

  .scroll-page :global(.page-shell),
  .scroll-page :global(.placeholder-page),
  .scroll-page :global(.avs-page),
  .scroll-page :global(.audit-log-page) {
    min-height: 100%;
    box-sizing: border-box;
  }

  .scroll-page :global(.page-shell),
  .scroll-page :global(.placeholder-page) {
    overflow: visible;
  }
</style>
