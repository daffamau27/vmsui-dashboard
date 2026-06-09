<script>
  import { onMount } from "svelte";
  import {
    activeVesselMenu,
    setActiveVesselMenu
  } from "$lib/stores/vesselNavigation.svelte.js";
  import {
    selectedVesselId,
    selectedVesselInfo,
    setSelectedVessel,
    restoreSelectedVessel
  } from "$lib/stores/selectedVessel.svelte.js";
  import { pageStatus } from "$lib/stores/pageStatusStore.svelte.js";
  import { apiRequest } from "$lib/api/authApi.js";

  let dropdownOpen = $state(false);
  let vesselDropdownOpen = $state(false);

  let vessels = $state([]);
  let vesselLoading = $state(false);
  let vesselError = $state("");

  const vesselMenus = [
    { label: "Dashboard", key: "dashboard" },
    { label: "Daily Report", key: "daily-report" },
    { label: "Monthly Report", key: "monthly-report" },
    { label: "Periodical Report", key: "periodical-report" },
    { label: "Voyage Plan", key: "voyage-plan" },
    { label: "Trace", key: "trace" },
    { label: "Data Log", key: "data-log" }
  ];

  function normalizeMyVessel(item) {
    return {
      id: String(item?.id),
      vesselId: item?.id,
      dbId: item?.id,

      deviceId: item?.deviceId || "",
      vesselName: item?.vesselName || item?.deviceName || "-",
      name: item?.vesselName || item?.deviceName || "-",
      deviceName: item?.deviceName || item?.vesselName || "-",

      companyId: item?.companyId ?? null,
      companyName: item?.companyName || "-",

      // Endpoint /users/my-vessels belum membawa live status
      online: item?.online ?? null,

      raw: item
    };
  }

  async function getMyVessels() {
    const response = await apiRequest("/users/my-vessels", {
      method: "GET"
    });

    const rows = Array.isArray(response)
      ? response
      : Array.isArray(response?.data)
        ? response.data
        : [];

    return rows.map(normalizeMyVessel);
  }

  let activeMenu = $derived(
    vesselMenus.find((menu) => menu.key === $activeVesselMenu)?.label || "Dashboard"
  );

  let selectedVessel = $derived(
    $selectedVesselInfo?.vesselName ||
      $selectedVesselInfo?.name ||
      "Select Vessel"
  );

  let status = $derived($pageStatus);

  async function loadNavbarVessels() {
    vesselLoading = true;
    vesselError = "";

    try {
      console.log("[NAVBAR][LOAD_MY_VESSELS][START]");

      const rows = await getMyVessels();

      console.log("[NAVBAR][LOAD_MY_VESSELS][RESULT]", rows);

      vessels = Array.isArray(rows) ? rows : [];

      const currentId = $selectedVesselId;

      if (currentId && vessels.length) {
        const found = vessels.find(
          (item) => Number(item.vesselId) === Number(currentId)
        );

        if (found) {
          setSelectedVessel(found);
        } else {
          setSelectedVessel(vessels[0]);
        }
      } else if (vessels.length) {
        setSelectedVessel(vessels[0]);
      }
    } catch (err) {
      console.error("[NAVBAR][LOAD_MY_VESSELS][ERROR]", err);
      vesselError = err?.message || "Gagal memuat vessel dari API.";
      vessels = [];
    } finally {
      vesselLoading = false;
    }
  }

  function selectMenu(menu) {
    dropdownOpen = false;
    setActiveVesselMenu(menu.key);
  }

  function selectVessel(vessel) {
    setSelectedVessel(vessel);
    vesselDropdownOpen = false;

    console.log("[NAVBAR][VESSEL_SELECTED]", vessel);
  }

  onMount(async () => {
    restoreSelectedVessel();

    /*
      Delay kecil supaya token dari login/authStore sudah tersimpan dulu.
      Ini penting kalau Navbar dirender segera setelah login.
    */
    setTimeout(() => {
      loadNavbarVessels();
    }, 150);
  });
</script>

<header class="topbar">
  <div class="topbar-left">
    <div class="dropdown">
      <button class="dropdown-button" onclick={() => (dropdownOpen = !dropdownOpen)}>
        <span>{activeMenu}</span>
        <span class="arrow">▾</span>
      </button>

      {#if dropdownOpen}
        <div class="dropdown-menu">
          {#each vesselMenus as menu}
            <button
              class="dropdown-item"
              class:active-item={$activeVesselMenu === menu.key}
              onclick={() => selectMenu(menu)}
            >
              {menu.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="topbar-item">
      Data Received : {status.dataReceived}
    </div>

    <div class="topbar-item">
      Queue : {status.queue}
    </div>

    <div class="topbar-item">
      SD Card : {status.sdcard}
    </div>

    <div class="topbar-item online-box" class:offline-box={!status.online}>
      <span class="dot"></span>
      {status.online ? "Online" : "Offline"}
    </div>

    {#if status.sourcePage}
      <div class="topbar-item source-box">
        Source : {status.sourcePage}
      </div>
    {/if}
  </div>

  <div class="vessel-dropdown">
    <button
      class="vessel-selector"
      onclick={() => (vesselDropdownOpen = !vesselDropdownOpen)}
      disabled={vesselLoading}
    >
      <span>{vesselLoading ? "Loading..." : selectedVessel}</span>
      <span class="arrow">▾</span>
    </button>

    {#if vesselDropdownOpen}
      <div class="vessel-menu">
        {#if vesselError}
          <div class="vessel-empty">{vesselError}</div>
        {:else if vessels.length}
          {#each vessels as vessel}
            <button
              class="vessel-item"
              class:active-vessel={Number($selectedVesselId) === Number(vessel.vesselId)}
              onclick={() => selectVessel(vessel)}
            >
              <strong>{vessel.vesselName || vessel.name}</strong>
              <small>
                {vessel.deviceName || vessel.deviceId || "-"}
              </small>
            </button>
          {/each}
        {:else}
          <div class="vessel-empty">Tidak ada vessel.</div>
        {/if}
      </div>
    {/if}
  </div>
</header>

<style>
  .topbar {
    height: 36px;
    background: #eeeeee;
    border-bottom: 1px solid #bdbdbd;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
    flex-shrink: 0;
    position: relative;
    z-index: 900;
  }

  .topbar-left {
    display: flex;
    align-items: center;
    height: 100%;
    min-width: 0;
    overflow: hidden;
  }

  .dropdown {
    position: relative;
    height: 100%;
    flex-shrink: 0;
  }

  .dropdown-button {
    height: 100%;
    min-width: 145px;
    padding: 0 12px;
    border: none;
    border-right: 1px solid #c4c4c4;
    background: #eeeeee;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 13px;
  }

  .dropdown-button:hover {
    background: #e0e0e0;
  }

  .arrow {
    font-size: 11px;
  }

  .dropdown-menu {
    position: absolute;
    top: 36px;
    left: 0;
    min-width: 210px;
    background: white;
    border: 1px solid #bdbdbd;
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.16);
    z-index: 999;
  }

  .dropdown-item {
    width: 100%;
    padding: 10px 14px;
    border: none;
    background: white;
    text-align: left;
    cursor: pointer;
    font-size: 13px;
  }

  .dropdown-item:hover {
    background: #f1f1f1;
  }

  .active-item {
    background: #e7efff;
    font-weight: 700;
  }

  .topbar-item {
    height: 100%;
    padding: 0 12px;
    display: flex;
    align-items: center;
    border-right: 1px solid #c4c4c4;
    white-space: nowrap;
    font-weight: 600;
  }

  .source-box {
    color: #64748b;
    font-size: 12px;
  }

  .online-box {
    gap: 6px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #12b886;
    display: inline-block;
  }

  .offline-box {
    color: #64748b;
  }

  .offline-box .dot {
    background: #94a3b8;
  }

  .vessel-dropdown {
    position: relative;
    height: 100%;
    flex-shrink: 0;
  }

  .vessel-selector {
    height: 100%;
    min-width: 170px;
    padding: 0 12px;
    border: none;
    border-left: 1px solid #bdbdbd;
    background: #d9d9d9;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 13px;
  }

  .vessel-selector:hover {
    background: #cfcfcf;
  }

  .vessel-selector:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .vessel-menu {
    position: absolute;
    top: 36px;
    right: 0;
    min-width: 240px;
    max-height: 420px;
    overflow: auto;
    background: white;
    border: 1px solid #bdbdbd;
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.16);
    z-index: 999;
  }

  .vessel-item {
    width: 100%;
    padding: 9px 12px;
    border: none;
    border-bottom: 1px solid #eef2f7;
    background: white;
    text-align: left;
    cursor: pointer;
    display: grid;
    gap: 3px;
  }

  .vessel-item strong {
    color: #0f172a;
    font-size: 13px;
    font-weight: 800;
  }

  .vessel-item small {
    color: #64748b;
    font-size: 11px;
    font-weight: 700;
  }

  .vessel-item:hover {
    background: #f1f1f1;
  }

  .active-vessel {
    background: #e7efff;
  }

  .vessel-empty {
    padding: 12px;
    color: #64748b;
    font-size: 12px;
    font-weight: 700;
  }

  @media (max-width: 900px) {
    .topbar {
      overflow-x: auto;
    }

    .vessel-dropdown {
      position: sticky;
      right: 0;
    }
  }
</style>