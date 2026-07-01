<script>
  import { activeMenu } from "$lib/stores/appNavigation.svelte.js";

  import ProfilePage from "$lib/pages/ProfilePage.svelte";
  import FleetViewPage from "$lib/pages/FleetViewPage.svelte";
  import VesselPage from "$lib/pages/VesselPage.svelte";
  import AllVesselSummaryPage from "$lib/pages/AllVesselSummaryPage.svelte";
  import AlarmPage from "$lib/pages/AlarmPage.svelte";
  import AuditLogPage from "$lib/pages/AuditLogPage.svelte";
  import VoyagePlansPage from "$lib/pages/VoyagePlansPage.svelte";
  import AdministratorPage from "$lib/pages/AdministratorPage.svelte";
</script>

<main class="app-content">
  <section
    class="keep-page scroll-page"
    class:active-page={$activeMenu === "profile"}
  >
    <ProfilePage />
  </section>

  <section
    class="keep-page no-scroll-page"
    class:active-page={$activeMenu === "fleet-view"}
  >
    <FleetViewPage active={$activeMenu === "fleet-view"} />
  </section>

  <section
    class="keep-page no-scroll-page"
    class:active-page={$activeMenu === "vessel"}
  >
    <VesselPage active={$activeMenu === "vessel"} />
  </section>

  <section
    class="keep-page scroll-page"
    class:active-page={$activeMenu === "all-vessel-summary"}
  >
    <AllVesselSummaryPage />
  </section>

  <section
    class="keep-page scroll-page"
    class:active-page={$activeMenu === "alarm"}
  >
    <AlarmPage />
  </section>

  <section
    class="keep-page scroll-page"
    class:active-page={$activeMenu === "audit-log"}
  >
    <AuditLogPage />
  </section>

  <section
    class="keep-page scroll-page"
    class:active-page={$activeMenu === "voyage-plans"}
  >
    <VoyagePlansPage />
  </section>

  <section
    class="keep-page no-scroll-page"
    class:active-page={$activeMenu === "administrator"}
  >
    <AdministratorPage />
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
