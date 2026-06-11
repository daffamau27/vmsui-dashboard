<script>
  import RpmCard from "$lib/RpmCard.svelte";
  import VesselMap from "$lib/VesselMap.svelte";
  import {
    selectedVesselId,
    selectedVesselInfo
  } from "$lib/stores/selectedVessel.svelte.js";
  import { getVesselDashboard } from "$lib/api/dashboardApi.js";
  import { getFleetVesselLiveDetail } from "$lib/api/fleetApi.js";
  import { apiRequest } from "$lib/api/authApi.js";

  let loading = $state(false);
  let error = $state("");
  let dashboardData = $state(null);
  let liveVesselDetail = $state(null);

  let currentUser = $state(null);
  let currentUserLoading = $state(false);
  let currentUserError = $state("");

  let { active = false } = $props();
  let loadedKeys = $state({});


  async function loadCurrentUser() {
    if (currentUser || currentUserLoading) return currentUser;

    currentUserLoading = true;
    currentUserError = "";

    try {
      const response = await apiRequest("/users/current-user", {
        method: "GET"
      });

      currentUser = response?.data || response?.user || response || null;

      console.log("[CURRENT_USER_PERMISSION_DASHBOARD]", currentUser);

      return currentUser;
    } catch (err) {
      console.error("[CURRENT_USER_PERMISSION_DASHBOARD_ERROR]", err);
      currentUserError = err?.message || "Gagal memuat permission user.";
      currentUser = null;
      return null;
    } finally {
      currentUserLoading = false;
    }
  }

  function hasPermissionForUser(user, permissionKey) {
    if (!permissionKey) return true;

    const permissionAccess = user?.permissionAccess || {};
    const mode = permissionAccess?.mode;

    if (mode === "all") return true;

    if (mode === "selected") {
      const permissions = Array.isArray(permissionAccess?.permissions)
        ? permissionAccess.permissions
        : [];

      return permissions.includes(permissionKey);
    }

    return false;
  }

  function hasPermission(permissionKey) {
    return hasPermissionForUser(currentUser, permissionKey);
  }

  function normalizeEngineName(value) {
    return String(value || "")
      .replace(/RPM/gi, "")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  function getLiveEnginesFromVessel(vessel) {
    if (Array.isArray(vessel?.liveEngines)) return vessel.liveEngines;
    if (Array.isArray(vessel?.rawLive?.engines)) return vessel.rawLive.engines;

    return [];
  }

  function getConfigEnginesFromVessel(vessel) {
    if (Array.isArray(vessel?.engines)) return vessel.engines;
    if (Array.isArray($selectedVesselInfo?.engines)) return $selectedVesselInfo.engines;

    return [];
  }

  function getLiveRpmByConfigEngine(vessel, configEngine) {
    const liveEngines = getLiveEnginesFromVessel(vessel);

    const configName = normalizeEngineName(
      configEngine?.engineName ||
        configEngine?.name ||
        configEngine?.engineKeyThingsboard ||
        configEngine?.key
    );

    const found = liveEngines.find((item) => {
      const liveName = normalizeEngineName(item?.name || item?.engineName);
      if (!configName || !liveName) return false;
      return liveName === configName || liveName.includes(configName) || configName.includes(liveName);
    });

    const rpm = Number(found?.rpm ?? found?.value ?? found?.latestRpm);

    return Number.isFinite(rpm) ? rpm : null;
  }

  function isMissingValue(value) {
    return value === null || value === undefined || value === "" || value === "-";
  }

  function formatOnlineStatus(value, fallbackData = null) {
    if (value === true) return true;
    if (value === false) return false;

    const receivedMinutes = Number(fallbackData?.dataReceivedStats?.received_minutes);
    if (Number.isFinite(receivedMinutes) && receivedMinutes > 0) return true;

    return Boolean(fallbackData?.updatedAt || fallbackData?.localTime || fallbackData?.vesselLocalTime);
  }

  function normalizeCctvList(value) {
    const rawList = Array.isArray(value)
      ? value
      : Array.isArray(value?.items)
        ? value.items
        : Array.isArray(value?.cameras)
          ? value.cameras
          : [];

    return rawList.map((item, index) => {
      const statusText = String(item?.status || (item?.online === false ? "Offline" : "Live"));

      return {
        name: item?.name || item?.cameraName || `CCTV ${index + 1}`,
        status: statusText,
        location: item?.location || item?.position || "-",
        url: item?.url || item?.streamUrl || item?.snapshotUrl || "",
        online: item?.online !== false && statusText.toLowerCase() !== "offline"
      };
    });
  }

  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function formatNumber(value, digits = 1, fallback = "-") {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return number.toFixed(digits);
  }

  function formatLiter(value, digits = 2) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "0.00 L";
    return `${number.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    })} L`;
  }

  function normalizeStatus(value) {
    return value ? "online" : "offline";
  }

  function findEngineRpm(configEngine) {
    const rpm = getLiveRpmByConfigEngine(currentVessel, configEngine);

    return {
      value: Number.isFinite(rpm) ? rpm : null,
      status: Number.isFinite(rpm) && rpm > 0 ? "online" : "offline",
      lastData:
        currentVessel?.lastUpdated ||
        currentVessel?.lastConnectTime ||
        "-"
    };
  }

  let currentVessel = $derived({
    ...($selectedVesselInfo || {}),
    ...(liveVesselDetail || {}),

    // engine konfigurasi tetap dari selected vessel
    engines: Array.isArray($selectedVesselInfo?.engines)
      ? $selectedVesselInfo.engines
      : Array.isArray(liveVesselDetail?.engines)
        ? liveVesselDetail.engines
        : [],

    // engine RPM live dari /fleet/vessels/{id}
    liveEngines: Array.isArray(liveVesselDetail?.liveEngines)
      ? liveVesselDetail.liveEngines
      : Array.isArray(liveVesselDetail?.rawLive?.engines)
        ? liveVesselDetail.rawLive.engines
        : []
  });

  let vesselInfo = $derived({
    vesselId: $selectedVesselId,
    vesselName:
      currentVessel?.name ||
      currentVessel?.vesselName ||
      "Selected Vessel",

    companyName: currentVessel?.companyName || "-",

    latitude: toNumber(
      dashboardData?.latitude ??
        currentVessel?.lat ??
        currentVessel?.latitude,
      null
    ),

    longitude: toNumber(
      dashboardData?.longitude ??
        currentVessel?.lng ??
        currentVessel?.longitude,
      null
    ),
    heading: toNumber(currentVessel?.heading, null),

    online: formatOnlineStatus(
      dashboardData?.online ?? currentVessel?.online,
      dashboardData
    ),

    vesselLocalTime:
      dashboardData?.vesselLocalTime ||
      currentVessel?.lastUpdated ||
      currentVessel?.lastConnectTime ||
      "-",

    localTime:
      dashboardData?.localTime ||
      currentVessel?.lastUpdated ||
      currentVessel?.lastConnectTime ||
      "-",

    currentSpeed:
      dashboardData?.currentSpeed !== null &&
      dashboardData?.currentSpeed !== undefined
        ? `${formatNumber(dashboardData.currentSpeed, 1, "-")} knot`
        : currentVessel?.speed !== null &&
            currentVessel?.speed !== undefined
          ? `${formatNumber(currentVessel.speed, 1, "-")} knot`
          : "-",

    weatherForecast: dashboardData?.weatherForecast?.current
      ? `${formatNumber(dashboardData.weatherForecast.current.temp_c, 1)}°C · ${dashboardData.weatherForecast.current.condition || "-"}`
      : currentVessel?.weather?.current
        ? `${formatNumber(currentVessel.weather.current.temp_c, 1)}°C · ${currentVessel.weather.current.condition || "-"}`
        : "-",

    weatherDetail: dashboardData?.weatherForecast?.current || currentVessel?.weather?.current || null,
    weatherTomorrow: dashboardData?.weatherForecast?.tomorrow || null,
    weatherDayAfter: dashboardData?.weatherForecast?.day_after || null,
    dataReceivedStats: dashboardData?.dataReceivedStats || null,
    oceanCurrent: dashboardData?.oceanCurrent || null
  });

  let rpmCards = $derived(
    (getConfigEnginesFromVessel(currentVessel).length
      ? getConfigEnginesFromVessel(currentVessel)
      : Array.isArray(dashboardData?.engines)
        ? dashboardData.engines
        : []
    ).map((engine) => {
      const dashboardEngine = getDashboardEngineByConfig(engine) || engine;
      const liveRpm = getLiveRpmByConfigEngine(currentVessel, engine);

      const lastRpm = Number(
        dashboardEngine?.last_rpm ??
          dashboardEngine?.lastRpm ??
          dashboardEngine?.rpm ??
          liveRpm
      );

      const avgRpm = Number(
        dashboardEngine?.avg_rpm ??
          dashboardEngine?.avgRpm
      );

      const topRpm = Number(
        dashboardEngine?.top_rpm ??
          dashboardEngine?.topRpm
      );

      return {
        title: `${engine.engineName || engine.name || engine.key || "-"} RPM`,
        value: Number.isFinite(lastRpm) ? lastRpm : null,
        status: Number.isFinite(lastRpm) && lastRpm > 0 ? "online" : "offline",
        lastData:
          dashboardData?.updatedAt ||
          currentVessel?.lastUpdated ||
          currentVessel?.lastConnectTime ||
          "-",
        avg: Number.isFinite(avgRpm) ? formatNumber(avgRpm, 0, "-") : "-",
        top: Number.isFinite(topRpm) ? formatNumber(topRpm, 0, "-") : "-"
      };
    })
  );

  let fodUsage = $derived(dashboardData?.fodUsage || {});
  let cctvItems = $derived(normalizeCctvList(dashboardData?.cctv));

  let dataReceivedSummary = $derived({
    receivedMinutes: dashboardData?.dataReceivedStats?.received_minutes ?? 0,
    totalMinutes: dashboardData?.dataReceivedStats?.total_minutes ?? 1440,
    percentage: dashboardData?.dataReceivedStats?.percentage ?? 0
  });

  let weatherSummary = $derived({
    current: dashboardData?.weatherForecast?.current || null,
    tomorrow: dashboardData?.weatherForecast?.tomorrow || null,
    dayAfter: dashboardData?.weatherForecast?.day_after || null
  });

  let oceanCurrentSummary = $derived({
    current: dashboardData?.oceanCurrent?.current || null,
    tomorrow: dashboardData?.oceanCurrent?.tomorrow || null,
    dayAfter: dashboardData?.oceanCurrent?.day_after || null
  });

  let speedSummary = $derived({
    topSpeed:
      dashboardData?.topSpeed !== null &&
      dashboardData?.topSpeed !== undefined
        ? `${formatNumber(dashboardData.topSpeed, 1, "0.0")} knot`
        : "-",

    averageSpeed:
      dashboardData?.avgSpeed !== null &&
      dashboardData?.avgSpeed !== undefined
        ? `${formatNumber(dashboardData.avgSpeed, 1, "0.0")} knot`
        : vesselInfo.currentSpeed,

    totalDistance:
      dashboardData?.totalDistance !== null &&
      dashboardData?.totalDistance !== undefined
        ? `${formatNumber(dashboardData.totalDistance, 2, "0.00")} NM`
        : "-"
  });

  function getDashboardEngineByConfig(configEngine) {
    const dashboardEngines = Array.isArray(dashboardData?.engines)
      ? dashboardData.engines
      : [];

    const configName = normalizeEngineName(
      configEngine?.engineName ||
        configEngine?.name ||
        configEngine?.engineKeyThingsboard ||
        configEngine?.key
    );

    return dashboardEngines.find((item) => {
      const dashboardName = normalizeEngineName(item?.name || item?.engineName);
      if (!configName || !dashboardName) return false;
      return dashboardName === configName || dashboardName.includes(configName) || configName.includes(dashboardName);
    });
  }


  let canAccessDashboard = $derived(
    hasPermission("access_dashboard") || hasPermission("access_daily_report")
  );

  let canViewDailyPathMap = $derived(
    hasPermission("view_daily_path_map")
  );

  let canViewEngineRpmStatsTable = $derived(
    hasPermission("view_engine_rpm_stats_table")
  );

  let canViewSpeedStatsTable = $derived(
    hasPermission("view_speed_stats_table")
  );

  let canViewTravelDistanceTable = $derived(
    hasPermission("view_travel_distance_table")
  );

  let canViewFuelConsumptionTable = $derived(
    hasPermission("view_fuel_consumption_table")
  );

  let canViewFuelEcu = $derived(
    hasPermission("view_fuel_ecu")
  );

  let canViewFuelFms = $derived(
    hasPermission("view_fuel_fms")
  );

  let canViewFuelFod = $derived(
    hasPermission("view_fuel_fod")
  );

  let canViewFuelEmsInternal = $derived(
    hasPermission("view_fuel_ems_internal")
  );

  let canViewFuelEmsExternal = $derived(
    hasPermission("view_fuel_ems_external")
  );

  let canViewFuelEngineMaker = $derived(
    hasPermission("view_fuel_engine_maker")
  );

  let canShowFuelEmsInternal = $derived(
    canViewFuelEmsInternal && !isMissingValue(dashboardData?.consumptionEmsInternal ?? dashboardData?.consumptionEms)
  );

  let canShowFuelEmsExternal = $derived(
    canViewFuelEmsExternal && !isMissingValue(dashboardData?.consumptionEmsExternal)
  );

  let canShowFuelFms = $derived(
    canViewFuelFms && !isMissingValue(dashboardData?.consumptionFms)
  );

  let canShowFuelEcu = $derived(
    canViewFuelEcu && !isMissingValue(dashboardData?.consumptionEcu)
  );

  let hasVisibleFuelSource = $derived(
    canShowFuelEmsInternal ||
      canShowFuelEmsExternal ||
      canShowFuelFms ||
      canShowFuelEcu
  );

  let canShowFodUsage = $derived(
    canViewFuelFod && Boolean(dashboardData?.fodUsage)
  );

  let canShowRob = $derived(
    canViewFuelEngineMaker || canViewFuelFod || canViewFuelConsumptionTable
  );

  let fuelSummary = $derived({
    emsInternal: formatLiter(dashboardData?.consumptionEmsInternal ?? dashboardData?.consumptionEms ?? 0),
    emsExternal: formatLiter(dashboardData?.consumptionEmsExternal ?? 0),
    fms: isMissingValue(dashboardData?.consumptionFms)
      ? "-"
      : formatLiter(dashboardData?.consumptionFms),
    ecu: isMissingValue(dashboardData?.consumptionEcu)
      ? "-"
      : formatLiter(dashboardData?.consumptionEcu),
    latestRob:
      dashboardData?.latestRob !== null &&
      dashboardData?.latestRob !== undefined
        ? formatLiter(dashboardData.latestRob)
        : "-"
  });

  async function loadDashboard() {
    if (!$selectedVesselId) {
      dashboardData = null;
      liveVesselDetail = null;
      error = "Belum ada vessel yang dipilih dari Fleet View.";
      return;
    }

    loading = true;
    error = "";

    try {
      const [dashboardResult, liveResult] = await Promise.all([
        getVesselDashboard($selectedVesselId),
        getFleetVesselLiveDetail($selectedVesselId),
        loadCurrentUser()
      ]);

      dashboardData = dashboardResult?.data || dashboardResult || null;
      liveVesselDetail = liveResult || null;

      console.log("[VESSEL_DASHBOARD_DATA]", dashboardData);
      console.log("[VESSEL_DASHBOARD_LIVE_DETAIL]", liveVesselDetail);
    } catch (err) {
      console.error("[VESSEL_DASHBOARD_ERROR]", err);
      error = err?.message || "Gagal memuat dashboard vessel.";
      dashboardData = null;
      liveVesselDetail = null;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (!active) return;
    if (!$selectedVesselId) return;

    const key = `${$selectedVesselId}`;

    if (loadedKeys[key]) return;

    loadedKeys = {
      ...loadedKeys,
      [key]: true
    };

    loadDashboard();
  });
</script>

<section class="dashboard-content">
  <section class="hero-grid">
    <div class="monitoring-card cctv-section">
      <div class="cctv-grid" class:empty-cctv={cctvItems.length === 0}>
        {#if cctvItems.length === 0}
          <div class="cctv-empty">
            <div class="cctv-icon">▣</div>
            <strong>CCTV belum tersedia</strong>
            <span>Endpoint mengirim nilai CCTV kosong.</span>
          </div>
        {/if}

        {#each cctvItems as cctv}
          <div class:offline={!cctv.online} class="cctv-box">
            <div class="cctv-top">
              <span class="camera-dot" title={cctv.status}></span>
              <span class="cctv-status-text">{cctv.online ? "Live" : "Offline"}</span>
            </div>

            <div class="cctv-content">
              <div class="cctv-icon">▣</div>
              <div class="cctv-name">{cctv.name}</div>
              <div class="cctv-location">{cctv.location}</div>
            </div>
          </div>
        {/each}
      </div>
    </div>

    {#if canViewDailyPathMap}
      <div class="monitoring-card map-section">
        <div class="map-box">
          <VesselMap
            latitude={vesselInfo.latitude}
            longitude={vesselInfo.longitude}
            heading={vesselInfo.heading}
            vesselName={vesselInfo.vesselName}
            speed={vesselInfo.currentSpeed}
            lastUpdate={vesselInfo.localTime}
            iconUrl="/assets/vessel-marker.svg"
            zoom={12}
          />
        </div>
      </div>
    {:else}
      <div class="monitoring-card permission-empty">
        <strong>Map tidak ditampilkan</strong>
        <span>User belum memiliki permission view_daily_path_map.</span>
      </div>
    {/if}
  </section>

  {#if loading || currentUserLoading}
    <div class="dashboard-status loading-box">
      Loading dashboard data...
    </div>
  {:else if error}
    <div class="dashboard-status error-box">
      {error}
    </div>
  {:else if currentUserError}
    <div class="dashboard-status error-box">
      {currentUserError}
    </div>
  {:else if !canAccessDashboard}
    <div class="dashboard-status error-box">
      User belum memiliki permission access_dashboard atau access_daily_report.
    </div>
  {/if}

  <section class="info-rpm-section">
    <section class="vessel-panel">
      <div class="panel-header">
        <div>
          <span class="section-kicker">Vessel Status</span>
          <h2>{vesselInfo.vesselName}</h2>
        </div>

        <div class:offline-badge={!vesselInfo.online} class="online-badge">
          <span></span>
          {vesselInfo.online ? "Online" : "Offline"}
        </div>
      </div>

      <div class="vessel-info-grid">
        <article class="compact-info-card">
          <span class="info-label">Latitude</span>
          <strong>{vesselInfo.latitude === null ? "-" : `${formatNumber(vesselInfo.latitude, 6)}°`}</strong>
        </article>

        <article class="compact-info-card">
          <span class="info-label">Longitude</span>
          <strong>{vesselInfo.longitude === null ? "-" : `${formatNumber(vesselInfo.longitude, 6)}°`}</strong>
        </article>
        <article class="compact-info-card">
          <span class="info-label">Vessel Time</span>
          <strong>{vesselInfo.vesselLocalTime === null ? "-" : vesselInfo.vesselLocalTime}</strong>
        </article>

        <article class="compact-info-card">
          <span class="info-label">Local Time</span>
          <strong>{vesselInfo.localTime}</strong>
        </article>

        <article class="compact-info-card highlight">
          <span class="info-label">Current Speed</span>
          <strong>{vesselInfo.currentSpeed}</strong>
        </article>

        <article class="compact-info-card">
          <span class="info-label">Weather</span>
          <strong>{vesselInfo.weatherForecast}</strong>
        </article>

        <article class="compact-info-card">
          <span class="info-label">Data Received</span>
          <strong>{dataReceivedSummary.receivedMinutes}/{dataReceivedSummary.totalMinutes} min · {formatNumber(dataReceivedSummary.percentage, 1, "0.0")}%</strong>
        </article>

        <article class="compact-info-card">
          <span class="info-label">Ocean Current</span>
          <strong>
            {#if oceanCurrentSummary.current}
              {formatNumber(oceanCurrentSummary.current.speed_kph, 1, "0.0")} kph · {oceanCurrentSummary.current.direction_to || "-"}
            {:else}
              -
            {/if}
          </strong>
        </article>
      </div>
    </section>

    {#if canViewEngineRpmStatsTable}
      <section class="rpm-panel">
        <div class="panel-header">
          <div>
            <span class="section-kicker">Engine Monitoring</span>
            <h2>RPM Overview</h2>
          </div>

          <span class="rpm-count">{rpmCards.length} engines</span>
        </div>

        <div class="rpm-grid">
          {#each rpmCards as card}
            <RpmCard
              title={card.title}
              status={card.status}
              lastData={card.lastData}
              value={card.value}
              avg={card.avg}
              top={card.top}
              max={2200}
            />
          {/each}
        </div>
      </section>
    {:else}
      <section class="rpm-panel permission-empty">
        <strong>RPM Overview tidak ditampilkan</strong>
        <span>User belum memiliki permission view_engine_rpm_stats_table.</span>
      </section>
    {/if}
  </section>

  <section class="speed-summary">
    {#if canViewSpeedStatsTable}
      <article class="summary-card">
        <div class="summary-icon">▲</div>
        <div>
          <div class="summary-label">Top Speed</div>
          <div class="summary-value">{speedSummary.topSpeed}</div>
        </div>
      </article>

      <article class="summary-card">
        <div class="summary-icon">≈</div>
        <div>
          <div class="summary-label">Average Speed</div>
          <div class="summary-value">{speedSummary.averageSpeed}</div>
        </div>
      </article>
    {/if}

    {#if canViewTravelDistanceTable}
      <article class="summary-card">
        <div class="summary-icon">⇢</div>
        <div>
          <div class="summary-label">Total Distance</div>
          <div class="summary-value">{speedSummary.totalDistance}</div>
        </div>
      </article>
    {/if}
  </section>

  <section class="environment-summary">
    <section class="environment-card">
      <div class="environment-header">
        <span class="section-kicker">Weather Forecast</span>
        <h2>Today · Tomorrow · Day After</h2>
      </div>

      <div class="environment-grid">
        <article>
          <span>Current</span>
          <strong>{weatherSummary.current ? `${formatNumber(weatherSummary.current.temp_c, 1)}°C` : "-"}</strong>
          <small>{weatherSummary.current?.condition || "-"}</small>
        </article>

        <article>
          <span>Tomorrow</span>
          <strong>{weatherSummary.tomorrow ? `${formatNumber(weatherSummary.tomorrow.temp_min_c, 1)}–${formatNumber(weatherSummary.tomorrow.temp_max_c, 1)}°C` : "-"}</strong>
          <small>{weatherSummary.tomorrow?.condition || "-"}</small>
        </article>

        <article>
          <span>Day After</span>
          <strong>{weatherSummary.dayAfter ? `${formatNumber(weatherSummary.dayAfter.temp_min_c, 1)}–${formatNumber(weatherSummary.dayAfter.temp_max_c, 1)}°C` : "-"}</strong>
          <small>{weatherSummary.dayAfter?.condition || "-"}</small>
        </article>
      </div>
    </section>

    <section class="environment-card">
      <div class="environment-header">
        <span class="section-kicker">Ocean Current</span>
        <h2>Current Forecast</h2>
      </div>

      <div class="environment-grid">
        <article>
          <span>{oceanCurrentSummary.current?.label || "Today"}</span>
          <strong>{oceanCurrentSummary.current ? `${formatNumber(oceanCurrentSummary.current.speed_kph, 1)} kph` : "-"}</strong>
          <small>{oceanCurrentSummary.current?.direction_to || "-"}</small>
        </article>

        <article>
          <span>{oceanCurrentSummary.tomorrow?.label || "Tomorrow"}</span>
          <strong>{oceanCurrentSummary.tomorrow ? `${formatNumber(oceanCurrentSummary.tomorrow.speed_kph, 1)} kph` : "-"}</strong>
          <small>{oceanCurrentSummary.tomorrow?.direction_to || "-"}</small>
        </article>

        <article>
          <span>{oceanCurrentSummary.dayAfter?.label || "Day After"}</span>
          <strong>{oceanCurrentSummary.dayAfter ? `${formatNumber(oceanCurrentSummary.dayAfter.speed_kph, 1)} kph` : "-"}</strong>
          <small>{oceanCurrentSummary.dayAfter?.direction_to || "-"}</small>
        </article>
      </div>
    </section>
  </section>


  <section class="fuel-summary">
    <section class="fuel-card main-fuel-card">
      <div class="fuel-card-header">
        <div>
          <span class="section-kicker">Fuel Monitoring</span>
          <h2>Current Daily Consumption So Far</h2>
        </div>

        <button type="button" class="refresh-btn" onclick={loadDashboard}>
          Refresh
        </button>
      </div>

      {#if canViewFuelConsumptionTable && hasVisibleFuelSource}
        <div class="fuel-cols">
          {#if canShowFuelEmsInternal}
            <article class="fuel-metric">
              <span class="fuel-label">EMS Internal</span>
              <strong class="fuel-value">{fuelSummary.emsInternal}</strong>
            </article>
          {/if}

          {#if canShowFuelEmsExternal}
            <article class="fuel-metric">
              <span class="fuel-label">EMS External</span>
              <strong class="fuel-value">{fuelSummary.emsExternal}</strong>
            </article>
          {/if}

          {#if canShowFuelFms}
            <article class="fuel-metric">
              <span class="fuel-label">FMS</span>
              <strong class="fuel-value">{fuelSummary.fms}</strong>
            </article>
          {/if}

          {#if canShowFuelEcu}
            <article class="fuel-metric">
              <span class="fuel-label">ECU</span>
              <strong class="fuel-value">{fuelSummary.ecu}</strong>
            </article>
          {/if}
        </div>
      {:else}
        <div class="permission-note">
          Fuel consumption tidak ditampilkan karena permission view_fuel_consumption_table atau permission sumber fuel belum tersedia.
        </div>
      {/if}

      {#if canShowFodUsage}
        <div class="fod-mini-grid">
          <article>
            <span>FOD Date</span>
            <strong>{fodUsage?.date || "-"}</strong>
          </article>

          <article>
            <span>Accumulated</span>
            <strong>{formatLiter(fodUsage?.accumulatedLiters || 0)}</strong>
          </article>

          <article>
            <span>Interval</span>
            <strong>{formatLiter(fodUsage?.intervalLiters ?? 0)}</strong>
          </article>
        </div>
      {/if}
    </section>

    {#if canShowRob}
      <section class="fuel-card rob-card">
        <span class="section-kicker">Tank Status</span>
        <h2>Latest ROB</h2>
        <strong class="rob-value">{fuelSummary.latestRob}</strong>
      </section>
    {/if}
  </section>
</section>

<style>
  .dashboard-content {
    min-height: 100%;
    margin: 0;
    padding: 14px;
    background: #f4f6f8;
    color: #0f172a;
    box-sizing: border-box;
    overflow: auto;
  }

  .hero-grid {
    display: grid;
    grid-template-columns: 1fr 1.15fr;
    gap: 14px;
    height: 360px;
  }

  .monitoring-card,
  .vessel-panel,
  .rpm-panel,
  .summary-card,
  .fuel-card {
    background: #ffffff;
    border: 1px solid #d9e2ec;
    border-radius: 16px;
    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
    overflow: hidden;
  }

  .cctv-section,
  .map-section {
    min-width: 0;
    height: 100%;
  }

  .cctv-grid {
    height: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    padding: 12px;
  }

  .cctv-box {
    position: relative;
    min-height: 126px;
    border-radius: 14px;
    overflow: hidden;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0)),
      #3f4751;
    color: #ffffff;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 12px;
  }

  .cctv-box::before {
    content: "";
    position: absolute;
    inset: 0;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.045) 1px, transparent 1px),
      linear-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1px);
    background-size: 22px 22px;
    opacity: 0.35;
  }

  .cctv-box.offline {
    background: #707780;
    color: #e5e7eb;
  }

  .cctv-top,
  .cctv-content {
    position: relative;
    z-index: 1;
  }

  .cctv-top {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }

  .cctv-status-text {
    margin-left: 8px;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #dbeafe;
  }

  .empty-cctv {
    grid-template-columns: 1fr;
  }

  .cctv-empty {
    height: 100%;
    min-height: 260px;
    border-radius: 14px;
    background: #475569;
    color: #ffffff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 8px;
    padding: 20px;
  }

  .cctv-empty strong {
    font-size: 15px;
    font-weight: 900;
  }

  .cctv-empty span {
    color: #cbd5e1;
    font-size: 12px;
    font-weight: 700;
  }

  .camera-dot {
    width: 12px;
    height: 12px;
    border-radius: 999px;
    background: #22c55e;
    box-shadow: 0 0 0 5px rgba(34, 197, 94, 0.14);
  }

  .offline .camera-dot {
    background: #94a3b8;
    box-shadow: 0 0 0 5px rgba(148, 163, 184, 0.16);
  }

  .cctv-content {
    display: grid;
    place-items: center;
    text-align: center;
    gap: 5px;
    margin-bottom: 10px;
  }

  .cctv-icon {
    width: 38px;
    height: 38px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.14);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
  }

  .cctv-name {
    font-size: 15px;
    font-weight: 900;
  }

  .cctv-location {
    font-size: 11px;
    font-weight: 700;
    color: #dbe3ec;
  }

  .map-box {
    width: 100%;
    height: 100%;
    min-height: 0;
    background: #d8d8d8;
    overflow: hidden;
    position: relative;
  }

  .permission-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 220px;
    padding: 20px;
    text-align: center;
    color: #64748b;
  }

  .permission-empty strong {
    color: #0f172a;
    font-size: 15px;
    font-weight: 900;
  }

  .permission-empty span,
  .permission-note {
    font-size: 12px;
    font-weight: 700;
    color: #64748b;
  }

  .permission-note {
    padding: 14px;
  }

  .dashboard-status {
    margin-top: 14px;
    padding: 10px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 900;
  }

  .loading-box {
    background: #eff6ff;
    color: #1d4ed8;
    border: 1px solid #bfdbfe;
  }

  .error-box {
    background: #fef2f2;
    color: #b91c1c;
    border: 1px solid #fecaca;
  }

  .info-rpm-section {
    display: grid;
    grid-template-columns: minmax(420px, 0.9fr) minmax(540px, 1.1fr);
    gap: 14px;
    margin-top: 14px;
    align-items: stretch;
  }

  .panel-header,
  .fuel-card-header {
    min-height: 58px;
    padding: 12px 14px;
    border-bottom: 1px solid #e5edf5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  }

  .section-kicker {
    display: inline-flex;
    width: fit-content;
    padding: 4px 9px;
    border-radius: 999px;
    background: #dbeafe;
    color: #1d4ed8;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  h2 {
    margin: 7px 0 0;
    color: #0f172a;
    font-size: 17px;
    line-height: 1.2;
    font-weight: 900;
  }

  .online-badge,
  .rpm-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 30px;
    padding: 0 11px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 900;
    white-space: nowrap;
  }

  .online-badge {
    background: #ecfdf5;
    border: 1px solid #bbf7d0;
    color: #047857;
  }

  .online-badge.offline-badge {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    color: #64748b;
  }

  .online-badge span {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #10b981;
  }

  .online-badge.offline-badge span {
    background: #94a3b8;
  }

  .rpm-count {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    color: #1d4ed8;
  }

  .vessel-panel {
    padding-bottom: 12px;
  }

  .vessel-info-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    padding: 12px;
  }

  .compact-info-card {
    min-height: 72px;
    padding: 12px;
    border: 1px solid #dbe4ef;
    border-radius: 14px;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .compact-info-card.highlight {
    border-color: #bfdbfe;
    background: linear-gradient(180deg, #ffffff 0%, #eff6ff 100%);
  }

  .info-label {
    color: #64748b;
    font-size: 10.5px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.045em;
  }

  .compact-info-card strong {
    display: block;
    margin-top: 7px;
    color: #0f172a;
    font-size: 14px;
    line-height: 1.25;
    font-weight: 900;
    word-break: break-word;
  }

  .compact-info-card.highlight strong {
    color: #2563eb;
    font-size: 20px;
  }

  .rpm-panel {
    min-width: 0;
  }

  .rpm-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(180px, 1fr));
    gap: 10px;
    padding: 12px;
    min-width: 0;
  }

  .speed-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-top: 14px;
  }

  .environment-summary {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    margin-top: 14px;
  }

  .environment-card {
    background: #ffffff;
    border: 1px solid #d9e2ec;
    border-radius: 16px;
    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
    overflow: hidden;
  }

  .environment-header {
    padding: 12px 14px;
    border-bottom: 1px solid #e5edf5;
    background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  }

  .environment-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    padding: 12px;
  }

  .environment-grid article {
    min-height: 82px;
    padding: 12px;
    border-radius: 14px;
    background: #f8fafc;
    border: 1px solid #dbe4ef;
  }

  .environment-grid span,
  .environment-grid small {
    display: block;
    color: #64748b;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .environment-grid strong {
    display: block;
    margin-top: 9px;
    color: #0f172a;
    font-size: 17px;
    line-height: 1.1;
    font-weight: 900;
  }

  .environment-grid small {
    margin-top: 8px;
    text-transform: none;
    letter-spacing: 0;
    font-size: 11px;
  }

  .summary-card {
    min-height: 100px;
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .summary-icon {
    width: 42px;
    height: 42px;
    border-radius: 15px;
    background: #eff6ff;
    color: #2563eb;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 900;
    flex-shrink: 0;
  }

  .summary-label {
    color: #64748b;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .summary-value {
    margin-top: 7px;
    color: #0f172a;
    font-size: 18px;
    font-weight: 900;
    line-height: 1.2;
  }

  .fuel-summary {
    display: grid;
    grid-template-columns: 1.45fr 0.85fr;
    gap: 14px;
    margin-top: 14px;
  }

  .fuel-card {
    padding: 16px;
  }

  .fuel-card-header {
    min-height: auto;
    padding: 0 0 14px;
    border-bottom: 1px solid #e5edf5;
    background: transparent;
  }

  .refresh-btn {
    height: 30px;
    padding: 0 12px;
    border: none;
    border-radius: 9px;
    background: #2563eb;
    color: #ffffff;
    font-size: 11px;
    font-weight: 900;
    cursor: pointer;
  }

  .refresh-btn:hover {
    background: #1d4ed8;
  }

  .fuel-cols {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-top: 14px;
  }

  .fuel-metric {
    min-height: 92px;
    padding: 14px;
    border-radius: 14px;
    border: 1px solid #dbe4ef;
    background: #f8fafc;
  }

  .fuel-label {
    display: block;
    color: #64748b;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .fuel-value {
    display: block;
    margin-top: 12px;
    color: #0f172a;
    font-size: 24px;
    font-weight: 900;
    line-height: 1.1;
  }

  .fod-mini-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-top: 14px;
  }

  .fod-mini-grid article {
    min-height: 64px;
    padding: 10px;
    border-radius: 12px;
    background: #ffffff;
    border: 1px solid #dbe4ef;
  }

  .fod-mini-grid span {
    display: block;
    color: #64748b;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .fod-mini-grid strong {
    display: block;
    margin-top: 8px;
    color: #0f172a;
    font-size: 13px;
    font-weight: 900;
  }

  .rob-card {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .rob-value {
    display: block;
    margin-top: 18px;
    color: #2563eb;
    font-size: 30px;
    line-height: 1;
    font-weight: 900;
  }

  @media (max-width: 1100px) {
    .hero-grid,
    .info-rpm-section,
    .environment-summary,
    .fuel-summary {
      grid-template-columns: 1fr;
    }

    .hero-grid {
      height: auto;
    }

    .cctv-grid {
      height: 320px;
    }

    .map-box {
      height: 320px;
    }
  }

  @media (max-width: 780px) {
    .dashboard-content {
      padding: 10px;
    }

    .cctv-grid,
    .vessel-info-grid,
    .rpm-grid,
    .speed-summary,
    .environment-grid,
    .fuel-cols,
    .fod-mini-grid {
      grid-template-columns: 1fr;
    }

    .panel-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .cctv-grid {
      height: auto;
    }

    .cctv-box {
      min-height: 150px;
    }

    .summary-card {
      min-height: 88px;
    }
  }
</style>