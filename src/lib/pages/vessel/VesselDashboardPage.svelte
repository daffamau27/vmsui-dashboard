<script>
  import { onDestroy, tick, untrack } from "svelte";
  import { browser } from "$app/environment";
  import RpmCard from "$lib/RpmCard.svelte";
  import {
    selectedVesselId,
    selectedVesselInfo
  } from "$lib/stores/selectedVessel.svelte.js";
  import {
    getLatestCctvSnapshots,
    getVesselDashboard
  } from "$lib/api/dashboardApi.js";
  import { getFleetAssets, getFleetVesselLiveDetail } from "$lib/api/fleetApi.js";
  import { apiRequest } from "$lib/api/authApi.js";
  import { VMS_TILE_URL, VMS_TILE_OPTIONS } from "$lib/mapStyle.js";
  import { addLeafletZoomAndScale } from "$lib/utils/leafletControls.js";
  import LoadingSkeleton from "$lib/components/LoadingSkeleton.svelte";
  import CopyableCoordinate from "$lib/components/CopyableCoordinate.svelte";
  import CctvSnapshotImage from "$lib/components/CctvSnapshotImage.svelte";
  import { getAssetIconUrl, getAssetTypeLabel, getAssetTypeValue } from "$lib/utils/assetIcons.js";
  import {
    addMapZonesToLeafletMap,
    isZoneAsset,
    normalizeMapZonesFromAssets
  } from "$lib/utils/mapZones.js";
  import {
    createCopyableCoordinateHtml,
    handleCoordinateCopyClick
  } from "$lib/utils/coordinateClipboard.js";

  let loading = $state(false);
  let error = $state("");
  let dashboardData = $state(null);
  let liveVesselDetail = $state(null);
  let cctvSnapshots = $state([]);
  let cctvSnapshotsLoading = $state(false);
  let cctvSnapshotsError = $state("");
  let selectedDashboardCctvKey = $state("");
  let dashboardAssets = $state([]);
  let dashboardZones = $state([]);
  let dashboardAssetsLoading = $state(false);
  let dashboardAssetsError = $state("");

  let currentUser = $state(null);
  let currentUserLoading = $state(false);
  let currentUserError = $state("");

  let { active = false } = $props();
  let lastDashboardLoadKey = $state("");
  let dashboardRequestId = 0;

  let dashboardMapContainer;
  let dashboardMap = null;
  let L = null;
  let dashboardMapInitializing = false;
  let vesselMarker = null;
  let dashboardAssetMarkers = new Map();
  let dashboardAssetBoundaryCircles = new Map();
  let dashboardZoneLayerGroup = null;
  let lastDashboardMapVesselId = null;

  let showWindParticles = $state(true);
  let windParticleLayer = null;
  let windCanvas = null;
  let windContext = null;
  let windParticles = [];
  let windFrame = null;
  let windLastFrameAt = 0;

  let showCurrentParticles = $state(true);
  let currentParticleLayer = null;
  let currentCanvas = null;
  let currentContext = null;
  let currentParticles = [];
  let currentFrame = null;
  let currentLastFrameAt = 0;

  const WIND_PARTICLE_MIN_COUNT = 130;
  const WIND_PARTICLE_MAX_COUNT = 460;
  const WIND_PARTICLE_MAX_AGE = 90;
  const WIND_PARTICLE_FRAME_INTERVAL_MS = 28;
  const WIND_CANVAS_BUFFER_PX = 320;
  const WIND_PARTICLE_STEP_MULTIPLIER = 1.55;
  const WIND_PARTICLE_TRAIL_FADE_ALPHA = 0.16;
  const WIND_PARTICLE_LINE_WIDTH = 1.15;

  let windCanvasWidth = 0;
  let windCanvasHeight = 0;
  let windCanvasBuffer = 0;

  const CURRENT_INFLUENCE_RADIUS_METERS = 120000;
  const CURRENT_PARTICLE_MIN_COUNT = 120;
  const CURRENT_PARTICLE_MAX_COUNT = 420;
  const CURRENT_PARTICLE_MAX_AGE = 140;
  const CURRENT_PARTICLE_FRAME_INTERVAL_MS = 32;
  const CURRENT_CANVAS_BUFFER_PX = 320;
  const CURRENT_PARTICLE_STEP_MULTIPLIER = 1.18;
  const CURRENT_PARTICLE_TRAIL_FADE_ALPHA = 0.08;
  const CURRENT_PARTICLE_LINE_WIDTH = 1.25;

  let currentCanvasWidth = 0;
  let currentCanvasHeight = 0;
  let currentCanvasBuffer = 0;

  const CARDINAL_WIND_DEGREES = {
    N: 0,
    NNE: 22.5,
    NE: 45,
    ENE: 67.5,
    E: 90,
    ESE: 112.5,
    SE: 135,
    SSE: 157.5,
    S: 180,
    SSW: 202.5,
    SW: 225,
    WSW: 247.5,
    W: 270,
    WNW: 292.5,
    NW: 315,
    NNW: 337.5
  };

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
      currentUserError = err?.message || "Failed to load user permissions.";
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

    const flattenedList = rawList.flatMap((item) => {
      if (!Array.isArray(item?.cameras)) return [item];

      return item.cameras.flatMap((camera) => {
        const snapshots = Array.isArray(camera?.snapshots) ? camera.snapshots : [];

        if (!snapshots.length) {
          return [
            {
              ...camera,
              vesselId: item?.vesselId,
              vesselName: item?.vesselName
            }
          ];
        }

        return snapshots.map((snapshot) => ({
          ...snapshot,
          camera_name: camera?.camera_name,
          cameraName: camera?.cameraName,
          camera_token: camera?.camera_token,
          vesselId: item?.vesselId,
          vesselName: item?.vesselName
        }));
      });
    });

    return flattenedList.map((item, index) => {
      const statusText = String(item?.status || (item?.online === false ? "Offline" : "Live"));
      const snapshotUrl =
        item?.presigned_url ||
        item?.presignedUrl ||
        item?.snapshotUrl ||
        item?.snapshot_url ||
        item?.url ||
        item?.streamUrl ||
        "";
      const capturedAt = item?.captured_at || item?.capturedAt || item?.updatedAt || "";
      const fileSize = Number(item?.file_size ?? item?.fileSize);

      return {
        key:
          item?.camera_token ||
          item?.cameraToken ||
          item?.camera_name ||
          item?.cameraName ||
          item?.name ||
          `${snapshotUrl || item?.file_path || item?.filePath || "cctv"}-${capturedAt || index}`,
        name: item?.camera_name || item?.cameraName || item?.name || `CCTV ${index + 1}`,
        status: statusText,
        location: item?.location || item?.position || item?.file_path || item?.filePath || "-",
        url: snapshotUrl,
        capturedAt,
        capturedAtText: formatCctvSnapshotTime(capturedAt),
        fileSize: Number.isFinite(fileSize) ? fileSize : null,
        fileSizeText: formatFileSize(fileSize),
        online: item?.online !== false && statusText.toLowerCase() !== "offline" && Boolean(snapshotUrl)
      };
    });
  }

  function formatCctvSnapshotTime(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function formatFileSize(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) return "";

    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }

    return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
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

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeDashboardAsset(asset = {}) {
    if (isZoneAsset(asset)) return null;

    const latitude = Number(asset.latitude ?? asset.lat);
    const longitude = Number(asset.longitude ?? asset.lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (latitude === 0 && longitude === 0) return null;

    const id = asset.id ?? asset.assetId ?? `${latitude},${longitude}`;

    return {
      ...asset,
      id,
      assetId: asset.assetId ?? asset.asset_id ?? String(id),
      name: asset.assetName ?? asset.name ?? asset.thingsboardName ?? `Asset ${id}`,
      assetName: asset.assetName ?? asset.name ?? asset.thingsboardName ?? `Asset ${id}`,
      assetType: getAssetTypeValue(asset),
      latitude,
      longitude
    };
  }

  function rebuildDashboardZoneLayer() {
    if (!dashboardMap || !L) return;

    if (dashboardZoneLayerGroup) {
      dashboardZoneLayerGroup.clearLayers();
      dashboardZoneLayerGroup.remove();
      dashboardZoneLayerGroup = null;
    }

    dashboardZoneLayerGroup = addMapZonesToLeafletMap(L, dashboardMap, dashboardZones, {
      paneName: "dashboardZonePane",
      zIndex: 355
    });
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

    // engine configuration remains from selected vessel
    engines: Array.isArray($selectedVesselInfo?.engines)
      ? $selectedVesselInfo.engines
      : Array.isArray(liveVesselDetail?.engines)
        ? liveVesselDetail.engines
        : [],

    // live engine RPM from /fleet/vessels/{id}
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
  let cctvItems = $derived(
    normalizeCctvList(cctvSnapshots.length ? cctvSnapshots : dashboardData?.cctv)
  );
  let mainDashboardCctv = $derived(
    cctvItems.find((item) => item.key === selectedDashboardCctvKey) || cctvItems[0] || null
  );
  let miniDashboardCctvItems = $derived(
    mainDashboardCctv ? cctvItems.filter((item) => item.key !== mainDashboardCctv.key) : []
  );

  function selectDashboardCctv(cctv) {
    if (!cctv?.key) return;
    selectedDashboardCctvKey = cctv.key;
  }

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

  function normalizeWindDirectionDegrees(value) {
    if (value === null || value === undefined || value === "") return null;

    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return ((numeric % 360) + 360) % 360;
    }

    const text = String(value).trim().toUpperCase().replace(/\s+/g, "");
    const numericMatch = text.match(/-?\d+(\.\d+)?/);

    if (numericMatch) {
      const parsed = Number(numericMatch[0]);
      return Number.isFinite(parsed) ? ((parsed % 360) + 360) % 360 : null;
    }

    return CARDINAL_WIND_DEGREES[text] ?? null;
  }

  function getDashboardMapCoordinates() {
    const lat = Number(vesselInfo?.latitude ?? currentVessel?.lat ?? currentVessel?.latitude);
    const lng = Number(vesselInfo?.longitude ?? currentVessel?.lng ?? currentVessel?.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat === 0 && lng === 0) return null;

    return { lat, lng };
  }

  function getDashboardWeatherData() {
    return dashboardData?.weatherForecast?.current || currentVessel?.weather?.current || null;
  }

  function getDashboardOceanCurrentData() {
    return dashboardData?.oceanCurrent?.current || currentVessel?.oceanCurrent?.current || null;
  }

  function getWeatherWindSpeedKt(weather = {}) {
    const directKt = Number(
      weather?.wind_speed_kt ??
        weather?.windSpeedKt ??
        weather?.wind_kt ??
        weather?.wind_kts ??
        weather?.wind_knots
    );

    if (Number.isFinite(directKt)) return Math.max(0, Math.min(80, directKt));

    const kph = Number(weather?.wind_kph ?? weather?.windSpeedKph);
    if (Number.isFinite(kph)) return Math.max(0, Math.min(80, kph / 1.852));

    const mph = Number(weather?.wind_mph ?? weather?.windSpeedMph);
    if (Number.isFinite(mph)) return Math.max(0, Math.min(80, mph * 0.868976));

    const ms = Number(weather?.wind_ms ?? weather?.wind_mps ?? weather?.windSpeedMs);
    if (Number.isFinite(ms)) return Math.max(0, Math.min(80, ms * 1.94384));

    const fallback = Number(weather?.wind_speed ?? weather?.windSpeed);
    return Number.isFinite(fallback) ? Math.max(0, Math.min(80, fallback)) : 8;
  }

  function getSeaCurrentSpeedKt(current = {}) {
    const speedKph = Number(current?.speed_kph);

    if (!Number.isFinite(speedKph)) return 1.2;

    return Math.max(0.1, Math.min(12, speedKph / 1.852));
  }

  function getDashboardWindSourcePoints() {
    const coords = getDashboardMapCoordinates();
    const currentWeather = getDashboardWeatherData();

    if (!coords || !currentWeather) return [];

    const windFromDeg = normalizeWindDirectionDegrees(
      currentWeather.wind_degree ??
        currentWeather.wind_deg ??
        currentWeather.wind_dir_degree ??
        currentWeather.windDirectionDeg ??
        currentWeather.wind_dir ??
        currentWeather.windDirection
    );

    if (windFromDeg === null) return [];

    return [
      {
        lat: coords.lat,
        lng: coords.lng,
        directionToDeg: (windFromDeg + 180) % 360,
        speedKt: getWeatherWindSpeedKt(currentWeather)
      }
    ];
  }

  function getDashboardCurrentSourcePoints() {
    const coords = getDashboardMapCoordinates();
    const current = getDashboardOceanCurrentData();

    if (!coords || !current) return [];

    const directionToDeg = normalizeWindDirectionDegrees(
      current.direction_to_deg ?? current.direction_to
    );

    if (directionToDeg === null) return [];

    return [
      {
        lat: coords.lat,
        lng: coords.lng,
        directionToDeg,
        speedKt: getSeaCurrentSpeedKt(current)
      }
    ];
  }

  function setupDashboardMapPanes() {
    if (!dashboardMap) return;

    if (!dashboardMap.getPane("dashboardWindPane")) {
      dashboardMap.createPane("dashboardWindPane");
      dashboardMap.getPane("dashboardWindPane").style.zIndex = "420";
      dashboardMap.getPane("dashboardWindPane").style.pointerEvents = "none";
    }

    if (!dashboardMap.getPane("dashboardCurrentPane")) {
      dashboardMap.createPane("dashboardCurrentPane");
      dashboardMap.getPane("dashboardCurrentPane").style.zIndex = "430";
      dashboardMap.getPane("dashboardCurrentPane").style.pointerEvents = "none";
    }

    if (!dashboardMap.getPane("dashboardAssetBoundaryPane")) {
      dashboardMap.createPane("dashboardAssetBoundaryPane");
      dashboardMap.getPane("dashboardAssetBoundaryPane").style.zIndex = "440";
      dashboardMap.getPane("dashboardAssetBoundaryPane").style.pointerEvents = "none";
    }

    if (!dashboardMap.getPane("dashboardAssetPane")) {
      dashboardMap.createPane("dashboardAssetPane");
      dashboardMap.getPane("dashboardAssetPane").style.zIndex = "450";
      dashboardMap.getPane("dashboardAssetPane").style.pointerEvents = "auto";
    }

    if (!dashboardMap.getPane("dashboardVesselPane")) {
      dashboardMap.createPane("dashboardVesselPane");
      dashboardMap.getPane("dashboardVesselPane").style.zIndex = "760";
      dashboardMap.getPane("dashboardVesselPane").style.pointerEvents = "auto";
    }
  }

  function createDashboardVesselIcon() {
    if (!L) return null;

    const isOnline = vesselInfo.online !== false;

    return L.divIcon({
      className: `dashboard-vessel-leaflet-icon ${isOnline ? "online" : "offline"}`,
      html: `
        <img
          class="dashboard-vessel-marker-icon"
          src="/assets/vessel.png"
          alt="${vesselInfo.vesselName || "Vessel"}"
          style="transform: rotate(${Number(vesselInfo.heading || 0)}deg) scaleX(1.16);"
        />
      `,
      iconSize: [28, 60],
      iconAnchor: [14, 30],
      popupAnchor: [0, -32]
    });
  }

  function createDashboardAssetIcon(asset) {
    if (!L) return null;

    const iconUrl = getAssetIconUrl(asset);
    const typeLabel = getAssetTypeLabel(asset);

    return L.divIcon({
      className: `dashboard-asset-leaflet-icon asset-type-${String(typeLabel).toLowerCase()}`,
      html: `
        <img
          class="dashboard-asset-marker-icon"
          src="${iconUrl}"
          alt="${escapeHtml(typeLabel)} asset"
          title="${escapeHtml(asset.assetName || asset.name)}"
        />
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16]
    });
  }

  function createDashboardAssetPopupHtml(asset) {
    const typeLabel = getAssetTypeLabel(asset);
    const formattedLatitude = formatNumber(asset.latitude, 6);
    const formattedLongitude = formatNumber(asset.longitude, 6);

    return `
      <div class="dashboard-asset-popup">
        <div class="dashboard-asset-popup-hero">
          <div class="dashboard-asset-popup-icon" aria-hidden="true">
            <img src="${getAssetIconUrl(asset)}" alt="" />
          </div>
          <div class="dashboard-asset-popup-heading">
            <span>${escapeHtml(typeLabel)}</span>
            <strong>${escapeHtml(asset.assetName || asset.name || "Asset")}</strong>
          </div>
          <em>${escapeHtml(typeLabel)}</em>
        </div>
        <div class="dashboard-asset-popup-grid">
          <div>
            <span>Asset ID</span>
            <strong>${escapeHtml(asset.id ?? asset.assetId ?? "-")}</strong>
          </div>
          <div>
            <span>Latitude</span>
            ${createCopyableCoordinateHtml(formattedLatitude, "asset latitude")}
          </div>
          <div>
            <span>Longitude</span>
            ${createCopyableCoordinateHtml(formattedLongitude, "asset longitude")}
          </div>
        </div>
      </div>
    `;
  }

  function clearDashboardAssetMarkers() {
    dashboardAssetMarkers.forEach((marker) => marker.remove());
    dashboardAssetMarkers = new Map();

    dashboardAssetBoundaryCircles.forEach((circle) => circle.remove());
    dashboardAssetBoundaryCircles = new Map();
  }

  function buildDashboardAssetMarkers() {
    if (!dashboardMap || !L) return;

    clearDashboardAssetMarkers();

    dashboardAssets.forEach((asset) => {
      const lat = Number(asset.latitude);
      const lng = Number(asset.longitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (lat === 0 && lng === 0) return;

      const assetId = String(asset.id ?? `${lat},${lng}`);

      const boundaryCircle = L.circle([lat, lng], {
        radius: 1000,
        pane: "dashboardAssetBoundaryPane",
        interactive: false,
        stroke: true,
        color: "#f59e0b",
        weight: 2,
        opacity: 0.9,
        fill: true,
        fillColor: "#f59e0b",
        fillOpacity: 0.12,
        dashArray: "8 8",
        className: "dashboard-asset-boundary-circle"
      }).addTo(dashboardMap);

      const marker = L.marker([lat, lng], {
        icon: createDashboardAssetIcon(asset),
        pane: "dashboardAssetPane",
        zIndexOffset: 0,
        riseOnHover: true
      }).addTo(dashboardMap);

      marker.bindPopup(createDashboardAssetPopupHtml(asset), {
        closeButton: true,
        autoPan: true,
        maxWidth: 300,
        className: "dashboard-asset-leaflet-popup"
      });

      dashboardAssetMarkers.set(assetId, marker);
      dashboardAssetBoundaryCircles.set(assetId, boundaryCircle);
    });
  }

  function createDashboardVesselPopupHtml() {
    const current = getDashboardOceanCurrentData();
    const weather = getDashboardWeatherData();

    return `
      <div class="dashboard-map-popup">
        <div class="dashboard-map-popup-title">${vesselInfo.vesselName || "Vessel"}</div>
        <div class="dashboard-map-popup-row"><span>Status</span><strong>${vesselInfo.online ? "Online" : "Offline"}</strong></div>
        <div class="dashboard-map-popup-row"><span>Speed</span><strong>${vesselInfo.currentSpeed || "-"}</strong></div>
        <div class="dashboard-map-popup-row"><span>Heading</span><strong>${formatNumber(vesselInfo.heading, 1, "-")}°</strong></div>
        <div class="dashboard-map-popup-row"><span>Wind</span><strong>${weather?.wind_dir || "-"} ${weather?.wind_speed_kt || "-"} kt</strong></div>
        <div class="dashboard-map-popup-row"><span>Current</span><strong>${current ? `${formatNumber(current.speed_kph, 1, "0.0")} kph · ${current.direction_to || "-"}` : "-"}</strong></div>
      </div>
    `;
  }

  function updateDashboardMapMarker({ center = false } = {}) {
    if (!dashboardMap || !L) return;

    const coords = getDashboardMapCoordinates();
    if (!coords) return;

    const latLng = [coords.lat, coords.lng];
    const icon = createDashboardVesselIcon();

    if (!vesselMarker) {
      vesselMarker = L.marker(latLng, {
        icon,
        pane: "dashboardVesselPane",
        zIndexOffset: 2000,
        riseOnHover: true
      }).addTo(dashboardMap);

      vesselMarker.bindPopup(createDashboardVesselPopupHtml(), {
        closeButton: true,
        autoPan: true,
        maxWidth: 260,
        className: "dashboard-leaflet-popup"
      });

      dashboardMap.setView(latLng, 12);
      lastDashboardMapVesselId = String($selectedVesselId || "");
      return;
    }

    vesselMarker.setLatLng(latLng);
    vesselMarker.setIcon(icon);
    vesselMarker.setZIndexOffset(2000);
    vesselMarker.setPopupContent(createDashboardVesselPopupHtml());

    const vesselKey = String($selectedVesselId || "");
    if (center || vesselKey !== lastDashboardMapVesselId) {
      dashboardMap.setView(latLng, 12);
      lastDashboardMapVesselId = vesselKey;
    }
  }

  async function ensureDashboardMap() {
    if (!browser || dashboardMap || dashboardMapInitializing) return;

    dashboardMapInitializing = true;

    try {
      await tick();

      if (!dashboardMapContainer) return;

      if (!L) {
        L = await import("leaflet");
        await import("leaflet/dist/leaflet.css");
      }

      const coords = getDashboardMapCoordinates();
      const center = coords ? [coords.lat, coords.lng] : [-2.8, 114.5];

      dashboardMap = L.map(dashboardMapContainer, {
        zoomControl: false,
        attributionControl: true,
        preferCanvas: true
      }).setView(center, coords ? 12 : 5);

      L.tileLayer(VMS_TILE_URL, VMS_TILE_OPTIONS).addTo(dashboardMap);
      addLeafletZoomAndScale(L, dashboardMap);

      setupDashboardMapPanes();
      rebuildDashboardZoneLayer();
      dashboardMapContainer.addEventListener("click", handleCoordinateCopyClick, true);
      buildDashboardAssetMarkers();

      if (active && showCurrentParticles) {
        addCurrentParticleLayer();
      }

      if (active && showWindParticles) {
        addWindParticleLayer();
      }

      updateDashboardMapMarker({ center: Boolean(coords) });

      setTimeout(() => {
        dashboardMap?.invalidateSize();
      }, 100);
    } finally {
      dashboardMapInitializing = false;
    }
  }

  function scheduleDashboardMapRefresh({ recreate = false, center = false } = {}) {
    if (!browser) return;

    setTimeout(async () => {
      if (!active || !canViewDailyPathMap) return;

      if (recreate && dashboardMap) {
        destroyDashboardMap();
      }

      await tick();

      if (!dashboardMapContainer) return;

      await ensureDashboardMap();

      if (!dashboardMap) return;

      dashboardMap.invalidateSize();
      updateDashboardMapMarker({ center });

      setTimeout(() => {
        if (!dashboardMap) return;

        dashboardMap.invalidateSize();
        updateDashboardMapMarker({ center });
      }, 120);
    }, 0);
  }

  function destroyDashboardMap() {
    removeCurrentParticleLayer();
    removeWindParticleLayer();
    clearDashboardAssetMarkers();

    if (dashboardZoneLayerGroup) {
      dashboardZoneLayerGroup.clearLayers();
      dashboardZoneLayerGroup.remove();
      dashboardZoneLayerGroup = null;
    }

    if (vesselMarker) {
      vesselMarker.remove();
      vesselMarker = null;
    }

    dashboardMapContainer?.removeEventListener?.("click", handleCoordinateCopyClick, true);

    if (dashboardMap) {
      dashboardMap.remove();
      dashboardMap = null;
    }

    lastDashboardMapVesselId = null;
  }

  function getWindParticleCount() {
    if (!dashboardMap) return WIND_PARTICLE_MIN_COUNT;

    const size = dashboardMap.getSize();
    const width = Math.max(size.x, windCanvasWidth || size.x);
    const height = Math.max(size.y, windCanvasHeight || size.y);
    const count = Math.round((width * height) / 7200);

    return Math.max(WIND_PARTICLE_MIN_COUNT, Math.min(WIND_PARTICLE_MAX_COUNT, count));
  }

  function resetWindParticle(particle = {}, randomAge = true) {
    if (!dashboardMap) return particle;

    const size = dashboardMap.getSize();
    const width = windCanvasWidth || size.x;
    const height = windCanvasHeight || size.y;

    particle.x = Math.random() * Math.max(1, width);
    particle.y = Math.random() * Math.max(1, height);
    particle.age = randomAge ? Math.floor(Math.random() * WIND_PARTICLE_MAX_AGE) : 0;
    particle.maxAge = WIND_PARTICLE_MAX_AGE + Math.floor(Math.random() * 44);
    particle.speedJitter = 0.82 + Math.random() * 0.78;
    particle.trailLength = 2.8 + Math.random() * 3.8;
    particle.alpha = 0.34 + Math.random() * 0.34;

    return particle;
  }

  function positionWindCanvas() {
    if (!dashboardMap || !L || !windCanvas) return;

    const topLeft = dashboardMap.containerPointToLayerPoint([
      -windCanvasBuffer,
      -windCanvasBuffer
    ]);

    L.DomUtil.setPosition(windCanvas, topLeft);
  }

  function seedWindParticles(keepExisting = true) {
    const targetCount = getWindParticleCount();
    const nextParticles = keepExisting ? windParticles.slice(0, targetCount) : [];

    while (nextParticles.length < targetCount) {
      nextParticles.push(resetWindParticle({}, true));
    }

    windParticles = nextParticles;
  }

  function resizeWindCanvas({ reseed = true } = {}) {
    if (!browser || !dashboardMap || !windCanvas || !windContext) return;

    const size = dashboardMap.getSize();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    windCanvasBuffer = WIND_CANVAS_BUFFER_PX;
    windCanvasWidth = size.x + windCanvasBuffer * 2;
    windCanvasHeight = size.y + windCanvasBuffer * 2;

    positionWindCanvas();

    windCanvas.width = Math.max(1, Math.floor(windCanvasWidth * pixelRatio));
    windCanvas.height = Math.max(1, Math.floor(windCanvasHeight * pixelRatio));
    windCanvas.style.width = `${windCanvasWidth}px`;
    windCanvas.style.height = `${windCanvasHeight}px`;

    windContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    if (reseed) {
      seedWindParticles(false);
    }
  }

  function getFallbackWindVector() {
    return {
      x: 0.94,
      y: -0.34,
      speed: 8
    };
  }

  function getWindVectorAtContainerPoint(point, sources = []) {
    if (!dashboardMap || !sources.length) return getFallbackWindVector();

    const latLng = dashboardMap.containerPointToLatLng([point.x, point.y]);
    let totalWeight = 0;
    let weightedX = 0;
    let weightedY = 0;
    let weightedSpeed = 0;

    sources.forEach((source) => {
      const distance = Math.max(18000, dashboardMap.distance(latLng, [source.lat, source.lng]));
      const weight = 1 / Math.pow(distance / 1000, 1.8);
      const angleRad = (source.directionToDeg * Math.PI) / 180;
      const speed = Math.max(1, source.speedKt || 8);

      weightedX += Math.sin(angleRad) * weight * speed;
      weightedY += -Math.cos(angleRad) * weight * speed;
      weightedSpeed += speed * weight;
      totalWeight += weight;
    });

    const magnitude = Math.hypot(weightedX, weightedY);

    if (!totalWeight || !magnitude) return getFallbackWindVector();

    return {
      x: weightedX / magnitude,
      y: weightedY / magnitude,
      speed: weightedSpeed / totalWeight
    };
  }

  function drawWindParticles() {
    if (!active || !canViewDailyPathMap || !dashboardMap || !windCanvas || !windContext || !showWindParticles) {
      stopWindAnimation();
      return;
    }

    const size = dashboardMap.getSize();
    const canvasWidth = windCanvasWidth || size.x;
    const canvasHeight = windCanvasHeight || size.y;
    const sources = getDashboardWindSourcePoints();

    windContext.globalCompositeOperation = "destination-out";
    windContext.fillStyle = `rgba(0, 0, 0, ${WIND_PARTICLE_TRAIL_FADE_ALPHA})`;
    windContext.fillRect(0, 0, canvasWidth, canvasHeight);

    windContext.globalCompositeOperation = "source-over";

    if (!sources.length) return;

    windContext.lineCap = "round";
    windContext.lineJoin = "round";
    windContext.lineWidth = WIND_PARTICLE_LINE_WIDTH;
    windContext.shadowBlur = 2;
    windContext.shadowColor = "rgba(255, 255, 255, 0.35)";

    windParticles.forEach((particle) => {
      const containerPoint = {
        x: particle.x - windCanvasBuffer,
        y: particle.y - windCanvasBuffer
      };

      const vector = getWindVectorAtContainerPoint(containerPoint, sources);
      const speed = Math.max(2, Math.min(34, vector.speed || 8));

      const velocity =
        (0.42 + speed * 0.045) *
        particle.speedJitter *
        WIND_PARTICLE_STEP_MULTIPLIER;

      const stepX = vector.x * velocity;
      const stepY = vector.y * velocity;
      const previousX = particle.x;
      const previousY = particle.y;
      const nextX = previousX + stepX;
      const nextY = previousY + stepY;
      const tailX = previousX - stepX * particle.trailLength;
      const tailY = previousY - stepY * particle.trailLength;

      particle.x = nextX;
      particle.y = nextY;
      particle.age += 1;

      const headAlpha = particle.alpha;
      const tailAlpha = Math.max(0.06, particle.alpha * 0.22);
      const gradient = windContext.createLinearGradient(tailX, tailY, nextX, nextY);

      gradient.addColorStop(0, `rgba(0, 0, 0, ${tailAlpha})`);
      gradient.addColorStop(0.55, `rgba(0, 0, 0, ${particle.alpha * 0.58})`);
      gradient.addColorStop(1, `rgba(0, 0, 0, ${headAlpha})`);

      windContext.beginPath();
      windContext.moveTo(tailX, tailY);
      windContext.lineTo(nextX, nextY);
      windContext.strokeStyle = gradient;
      windContext.stroke();

      if (
        particle.age > particle.maxAge ||
        particle.x < -40 ||
        particle.x > canvasWidth + 40 ||
        particle.y < -40 ||
        particle.y > canvasHeight + 40
      ) {
        resetWindParticle(particle, false);
      }
    });

    windContext.shadowBlur = 0;
    windContext.globalCompositeOperation = "source-over";
  }

  function handleWindMapMove() {
    positionWindCanvas();
  }

  function handleWindMapChange() {
    resizeWindCanvas({ reseed: true });
    drawWindParticles();
  }

  function startWindAnimation() {
    if (!browser || windFrame || !active || !canViewDailyPathMap || !showWindParticles) return;

    const animate = (timestamp) => {
      windFrame = requestAnimationFrame(animate);

      if (timestamp - windLastFrameAt < WIND_PARTICLE_FRAME_INTERVAL_MS) return;

      windLastFrameAt = timestamp;
      drawWindParticles();
    };

    windFrame = requestAnimationFrame(animate);
  }

  function stopWindAnimation() {
    if (!browser || !windFrame) return;

    cancelAnimationFrame(windFrame);
    windFrame = null;
    windLastFrameAt = 0;
  }

  function addWindParticleLayer() {
    if (!active || !canViewDailyPathMap || !showWindParticles || !dashboardMap || !L || windParticleLayer) return;

    windParticleLayer = new L.Layer();

    windParticleLayer.onAdd = (targetMap) => {
      const pane = targetMap.getPane("dashboardWindPane") || targetMap.getPanes().overlayPane;

      windCanvas = L.DomUtil.create("canvas", "wind-particle-canvas");
      windCanvas.setAttribute("aria-hidden", "true");
      pane.appendChild(windCanvas);

      windContext = windCanvas.getContext("2d");

      targetMap.on("move zoom", handleWindMapMove);
      targetMap.on("dragend resize moveend zoomend viewreset", handleWindMapChange);

      resizeWindCanvas();
      startWindAnimation();
    };

    windParticleLayer.onRemove = (targetMap) => {
      targetMap.off("move zoom", handleWindMapMove);
      targetMap.off("dragend resize moveend zoomend viewreset", handleWindMapChange);
      stopWindAnimation();

      if (windCanvas?.parentNode) {
        windCanvas.parentNode.removeChild(windCanvas);
      }

      windCanvas = null;
      windContext = null;
      windParticles = [];
    };

    windParticleLayer.addTo(dashboardMap);
  }

  function removeWindParticleLayer() {
    if (windParticleLayer && dashboardMap) {
      dashboardMap.removeLayer(windParticleLayer);
    }

    windParticleLayer = null;
    stopWindAnimation();
  }

  function getCurrentParticleCount() {
    if (!dashboardMap) return CURRENT_PARTICLE_MIN_COUNT;

    const size = dashboardMap.getSize();
    const width = Math.max(size.x, currentCanvasWidth || size.x);
    const height = Math.max(size.y, currentCanvasHeight || size.y);
    const count = Math.round((width * height) / 10500);

    return Math.max(CURRENT_PARTICLE_MIN_COUNT, Math.min(CURRENT_PARTICLE_MAX_COUNT, count));
  }

  function resetCurrentParticle(particle = {}, randomAge = true) {
    if (!dashboardMap) return particle;

    const size = dashboardMap.getSize();
    const width = currentCanvasWidth || size.x;
    const height = currentCanvasHeight || size.y;

    particle.x = Math.random() * Math.max(1, width);
    particle.y = Math.random() * Math.max(1, height);
    particle.age = randomAge ? Math.floor(Math.random() * CURRENT_PARTICLE_MAX_AGE) : 0;
    particle.maxAge = CURRENT_PARTICLE_MAX_AGE + Math.floor(Math.random() * 60);
    particle.speedJitter = 0.72 + Math.random() * 0.56;
    particle.trailLength = 4.5 + Math.random() * 5.5;
    particle.alpha = 0.34 + Math.random() * 0.28;

    return particle;
  }

  function positionCurrentCanvas() {
    if (!dashboardMap || !L || !currentCanvas) return;

    const topLeft = dashboardMap.containerPointToLayerPoint([
      -currentCanvasBuffer,
      -currentCanvasBuffer
    ]);

    L.DomUtil.setPosition(currentCanvas, topLeft);
  }

  function seedCurrentParticles(keepExisting = true) {
    const targetCount = getCurrentParticleCount();
    const nextParticles = keepExisting ? currentParticles.slice(0, targetCount) : [];

    while (nextParticles.length < targetCount) {
      nextParticles.push(resetCurrentParticle({}, true));
    }

    currentParticles = nextParticles;
  }

  function resizeCurrentCanvas({ reseed = true } = {}) {
    if (!browser || !dashboardMap || !currentCanvas || !currentContext) return;

    const size = dashboardMap.getSize();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    currentCanvasBuffer = CURRENT_CANVAS_BUFFER_PX;
    currentCanvasWidth = size.x + currentCanvasBuffer * 2;
    currentCanvasHeight = size.y + currentCanvasBuffer * 2;

    positionCurrentCanvas();

    currentCanvas.width = Math.max(1, Math.floor(currentCanvasWidth * pixelRatio));
    currentCanvas.height = Math.max(1, Math.floor(currentCanvasHeight * pixelRatio));
    currentCanvas.style.width = `${currentCanvasWidth}px`;
    currentCanvas.style.height = `${currentCanvasHeight}px`;

    currentContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    if (reseed) {
      seedCurrentParticles(false);
    }
  }

  function getCurrentVectorAtContainerPoint(point, sources = []) {
    if (!dashboardMap || !sources.length) return null;

    const latLng = dashboardMap.containerPointToLatLng([point.x, point.y]);
    let totalWeight = 0;
    let weightedX = 0;
    let weightedY = 0;
    let weightedSpeed = 0;

    sources.forEach((source) => {
      const rawDistance = dashboardMap.distance(latLng, [source.lat, source.lng]);

      if (rawDistance > CURRENT_INFLUENCE_RADIUS_METERS) {
        return;
      }

      const distance = Math.max(25000, rawDistance);
      const weight = 1 / Math.pow(distance / 1000, 1.65);
      const angleRad = (source.directionToDeg * Math.PI) / 180;
      const speed = Math.max(0.1, source.speedKt || 1.2);

      weightedX += Math.sin(angleRad) * weight * speed;
      weightedY += -Math.cos(angleRad) * weight * speed;
      weightedSpeed += speed * weight;
      totalWeight += weight;
    });

    const magnitude = Math.hypot(weightedX, weightedY);

    if (!totalWeight || !magnitude) return null;

    return {
      x: weightedX / magnitude,
      y: weightedY / magnitude,
      speed: weightedSpeed / totalWeight
    };
  }

  function drawCurrentParticles() {
    if (!active || !canViewDailyPathMap || !dashboardMap || !currentCanvas || !currentContext || !showCurrentParticles) {
      stopCurrentAnimation();
      return;
    }

    const size = dashboardMap.getSize();
    const canvasWidth = currentCanvasWidth || size.x;
    const canvasHeight = currentCanvasHeight || size.y;
    const sources = getDashboardCurrentSourcePoints();

    currentContext.globalCompositeOperation = "destination-out";
    currentContext.fillStyle = `rgba(0, 0, 0, ${CURRENT_PARTICLE_TRAIL_FADE_ALPHA})`;
    currentContext.fillRect(0, 0, canvasWidth, canvasHeight);

    currentContext.globalCompositeOperation = "source-over";

    if (!sources.length) return;

    currentContext.lineCap = "round";
    currentContext.lineJoin = "round";
    currentContext.lineWidth = CURRENT_PARTICLE_LINE_WIDTH;
    currentContext.shadowBlur = 2;
    currentContext.shadowColor = "rgba(80, 190, 255, 0.22)";

    currentParticles.forEach((particle) => {
      const containerPoint = {
        x: particle.x - currentCanvasBuffer,
        y: particle.y - currentCanvasBuffer
      };

      const vector = getCurrentVectorAtContainerPoint(containerPoint, sources);

      if (!vector) {
        resetCurrentParticle(particle, false);
        return;
      }

      const speed = Math.max(0.2, Math.min(12, vector.speed || 1.2));
      const velocity =
        (0.18 + speed * 0.08) *
        particle.speedJitter *
        CURRENT_PARTICLE_STEP_MULTIPLIER;

      const stepX = vector.x * velocity;
      const stepY = vector.y * velocity;
      const previousX = particle.x;
      const previousY = particle.y;
      const nextX = previousX + stepX;
      const nextY = previousY + stepY;
      const tailX = previousX - stepX * particle.trailLength;
      const tailY = previousY - stepY * particle.trailLength;

      particle.x = nextX;
      particle.y = nextY;
      particle.age += 1;

      const headAlpha = particle.alpha;
      const tailAlpha = Math.max(0.04, particle.alpha * 0.2);
      const gradient = currentContext.createLinearGradient(tailX, tailY, nextX, nextY);

      gradient.addColorStop(0, `rgba(75, 190, 255, ${tailAlpha})`);
      gradient.addColorStop(0.55, `rgba(90, 205, 255, ${particle.alpha * 0.42})`);
      gradient.addColorStop(1, `rgba(125, 220, 255, ${headAlpha})`);

      currentContext.beginPath();
      currentContext.moveTo(tailX, tailY);
      currentContext.lineTo(nextX, nextY);
      currentContext.strokeStyle = gradient;
      currentContext.stroke();

      if (
        particle.age > particle.maxAge ||
        particle.x < -40 ||
        particle.x > canvasWidth + 40 ||
        particle.y < -40 ||
        particle.y > canvasHeight + 40
      ) {
        resetCurrentParticle(particle, false);
      }
    });

    currentContext.shadowBlur = 0;
    currentContext.globalCompositeOperation = "source-over";
  }

  function handleCurrentMapMove() {
    positionCurrentCanvas();
  }

  function handleCurrentMapChange() {
    resizeCurrentCanvas({ reseed: true });
    drawCurrentParticles();
  }

  function startCurrentAnimation() {
    if (!browser || currentFrame || !active || !canViewDailyPathMap || !showCurrentParticles) return;

    const animate = (timestamp) => {
      currentFrame = requestAnimationFrame(animate);

      if (timestamp - currentLastFrameAt < CURRENT_PARTICLE_FRAME_INTERVAL_MS) return;

      currentLastFrameAt = timestamp;
      drawCurrentParticles();
    };

    currentFrame = requestAnimationFrame(animate);
  }

  function stopCurrentAnimation() {
    if (!browser || !currentFrame) return;

    cancelAnimationFrame(currentFrame);
    currentFrame = null;
    currentLastFrameAt = 0;
  }

  function addCurrentParticleLayer() {
    if (!active || !canViewDailyPathMap || !showCurrentParticles || !dashboardMap || !L || currentParticleLayer) return;

    currentParticleLayer = new L.Layer();

    currentParticleLayer.onAdd = (targetMap) => {
      const pane = targetMap.getPane("dashboardCurrentPane") || targetMap.getPanes().overlayPane;

      currentCanvas = L.DomUtil.create("canvas", "current-particle-canvas");
      currentCanvas.setAttribute("aria-hidden", "true");
      pane.appendChild(currentCanvas);

      currentContext = currentCanvas.getContext("2d");

      targetMap.on("move zoom", handleCurrentMapMove);
      targetMap.on("dragend resize moveend zoomend viewreset", handleCurrentMapChange);

      resizeCurrentCanvas();
      startCurrentAnimation();
    };

    currentParticleLayer.onRemove = (targetMap) => {
      targetMap.off("move zoom", handleCurrentMapMove);
      targetMap.off("dragend resize moveend zoomend viewreset", handleCurrentMapChange);
      stopCurrentAnimation();

      if (currentCanvas?.parentNode) {
        currentCanvas.parentNode.removeChild(currentCanvas);
      }

      currentCanvas = null;
      currentContext = null;
      currentParticles = [];
    };

    currentParticleLayer.addTo(dashboardMap);
  }

  function removeCurrentParticleLayer() {
    if (currentParticleLayer && dashboardMap) {
      dashboardMap.removeLayer(currentParticleLayer);
    }

    currentParticleLayer = null;
    stopCurrentAnimation();
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

  let shouldShowVmsFuelLabel = $derived(canShowFuelEmsInternal && canShowFuelEmsExternal);

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

  function resetDashboardStateForVessel() {
    dashboardData = null;
    liveVesselDetail = null;
    cctvSnapshots = [];
    cctvSnapshotsError = "";
    selectedDashboardCctvKey = "";
    error = "";
  }

  function isDashboardRequestCurrent(vesselId, requestId) {
    return (
      requestId === dashboardRequestId &&
      String(vesselId || "") === String($selectedVesselId || "")
    );
  }

  async function loadDashboard(vesselId = $selectedVesselId) {
    const targetVesselId = vesselId || $selectedVesselId;
    const requestId = ++dashboardRequestId;

    if (!targetVesselId) {
      dashboardData = null;
      liveVesselDetail = null;
      cctvSnapshots = [];
      error = "No vessel has been selected from Fleet View.";
      return;
    }

    loading = true;
    error = "";

    try {
      const [dashboardResult, liveResult] = await Promise.all([
        getVesselDashboard(targetVesselId),
        getFleetVesselLiveDetail(targetVesselId),
        loadDashboardAssets(),
        loadLatestCctvSnapshots(targetVesselId, requestId),
        loadCurrentUser()
      ]);

      if (!isDashboardRequestCurrent(targetVesselId, requestId)) return;

      dashboardData = dashboardResult?.data || dashboardResult || null;
      liveVesselDetail = liveResult || null;

      console.log("[VESSEL_DASHBOARD_DATA]", { vesselId: targetVesselId, data: dashboardData });
      console.log("[VESSEL_DASHBOARD_LIVE_DETAIL]", {
        vesselId: targetVesselId,
        data: liveVesselDetail
      });

      scheduleDashboardMapRefresh({ center: true });
    } catch (err) {
      if (!isDashboardRequestCurrent(targetVesselId, requestId)) return;

      console.error("[VESSEL_DASHBOARD_ERROR]", err);
      error = err?.message || "Failed to load vessel dashboard.";
      dashboardData = null;
      liveVesselDetail = null;
      cctvSnapshots = [];
    } finally {
      if (isDashboardRequestCurrent(targetVesselId, requestId)) {
        loading = false;
      }
    }
  }

  async function loadDashboardAssets() {
    dashboardAssetsLoading = true;
    dashboardAssetsError = "";

    try {
      const assets = await getFleetAssets();
      dashboardZones = normalizeMapZonesFromAssets(assets);
      dashboardAssets = assets.map(normalizeDashboardAsset).filter(Boolean);
      rebuildDashboardZoneLayer();
      buildDashboardAssetMarkers();
      return dashboardAssets;
    } catch (err) {
      console.error("[VESSEL_DASHBOARD_ASSETS_ERROR]", err);
      dashboardAssets = [];
      dashboardZones = [];
      dashboardAssetsError = err?.message || "Failed to load asset data.";
      rebuildDashboardZoneLayer();
      clearDashboardAssetMarkers();
      return [];
    } finally {
      dashboardAssetsLoading = false;
    }
  }

  async function loadLatestCctvSnapshots(vesselId = $selectedVesselId, requestId = dashboardRequestId) {
    if (!vesselId) {
      cctvSnapshots = [];
      return [];
    }

    cctvSnapshotsLoading = true;
    cctvSnapshotsError = "";

    try {
      const result = await getLatestCctvSnapshots(vesselId);
      const snapshots = Array.isArray(result)
        ? result
        : Array.isArray(result?.items)
          ? result.items
          : Array.isArray(result?.snapshots)
            ? result.snapshots
            : Array.isArray(result?.data)
              ? result.data
              : [];

      if (!isDashboardRequestCurrent(vesselId, requestId)) return snapshots;

      cctvSnapshots = snapshots;
      return snapshots;
    } catch (err) {
      if (!isDashboardRequestCurrent(vesselId, requestId)) return [];

      console.error("[VESSEL_CCTV_SNAPSHOTS_ERROR]", err);
      cctvSnapshots = [];
      cctvSnapshotsError = err?.message || "Failed to load latest CCTV snapshots.";
      return [];
    } finally {
      if (isDashboardRequestCurrent(vesselId, requestId)) {
        cctvSnapshotsLoading = false;
      }
    }
  }

  $effect(() => {
    if (!cctvItems.length) {
      if (selectedDashboardCctvKey) selectedDashboardCctvKey = "";
      return;
    }

    if (!cctvItems.some((item) => item.key === selectedDashboardCctvKey)) {
      selectedDashboardCctvKey = cctvItems[0]?.key || "";
    }
  });

  $effect(() => {
    const isActive = active;
    const vesselId = $selectedVesselId;
    const key = `${vesselId || ""}`;

    if (!isActive) return;

    if (!vesselId) {
      if (lastDashboardLoadKey) lastDashboardLoadKey = "";
      untrack(() => {
        resetDashboardStateForVessel();
        loadDashboard(null);
      });
      return;
    }

    if (key === lastDashboardLoadKey) return;

    lastDashboardLoadKey = key;

    untrack(() => {
      resetDashboardStateForVessel();
      scheduleDashboardMapRefresh({ recreate: true, center: true });
      loadDashboard(vesselId);
    });
  });

  $effect(() => {
    active;

    if (!active && dashboardMap) {
      destroyDashboardMap();
    }
  });

  $effect(() => {
    active;
    canViewDailyPathMap;
    vesselInfo.latitude;
    vesselInfo.longitude;

    if (!active || !canViewDailyPathMap) return;

    ensureDashboardMap();
  });

  $effect(() => {
    active;
    canViewDailyPathMap;
    dashboardAssets;

    if (!active || !canViewDailyPathMap || !dashboardMap || !L) return;

    buildDashboardAssetMarkers();
  });

  $effect(() => {
    active;
    canViewDailyPathMap;
    showWindParticles;
    showCurrentParticles;
    dashboardData;
    liveVesselDetail;
    vesselInfo.latitude;
    vesselInfo.longitude;
    vesselInfo.heading;
    vesselInfo.vesselName;

    if (!dashboardMap || !L) return;

    if (!active || !canViewDailyPathMap) {
      removeWindParticleLayer();
      removeCurrentParticleLayer();
      return;
    }

    dashboardMap.invalidateSize();
    updateDashboardMapMarker();

    if (showWindParticles) {
      addWindParticleLayer();
      seedWindParticles(true);
    } else {
      removeWindParticleLayer();
    }

    if (showCurrentParticles) {
      addCurrentParticleLayer();
      seedCurrentParticles(true);
    } else {
      removeCurrentParticleLayer();
    }
  });

  onDestroy(() => {
    destroyDashboardMap();
  });
</script>

<section class="dashboard-content">
  <section class="dashboard-header-card">
    <div>
      <span class="page-kicker">Vessel Dashboard</span>
      <h1>{vesselInfo.vesselName}</h1>
      <p>Real-time monitoring for vessel status, position, engine RPM, weather, ocean current, and daily fuel consumption.</p>
    </div>

  </section>

{#if loading || currentUserLoading}
  <LoadingSkeleton
    label="Loading vessel dashboard data"
    variant="vessel-dashboard"
  />
{:else if error}
  <div class="status-box error-box">
    {error}
  </div>
{:else if currentUserError}
  <div class="status-box error-box">
    {currentUserError}
  </div>
{:else if !canAccessDashboard}
  <div class="status-box error-box">
    The user does not have the access_dashboard or access_daily_report permission.
  </div>
{:else}

<section class="hero-grid">
    <div class="monitoring-card cctv-section">
      <div class="section-header">
        <div>
          <span class="section-kicker">CCTV Monitoring</span>
          <h2>Latest Camera Snapshot</h2>
        </div>

        <strong>{cctvSnapshotsLoading ? "Loading..." : `${cctvItems.length} cameras`}</strong>
      </div>

      <div class="cctv-grid" class:empty-cctv={cctvItems.length === 0 && !cctvSnapshotsLoading}>
        {#if cctvSnapshotsLoading}
          <div class="cctv-focus-layout">
            <div class="cctv-box cctv-skeleton" aria-hidden="true">
              <span></span>
              <strong></strong>
              <small></small>
            </div>

            <div class="cctv-thumbnail-row" aria-hidden="true">
              {#each Array(3) as _}
                <div class="cctv-box cctv-skeleton cctv-thumb-box">
                  <strong></strong>
                </div>
              {/each}
            </div>
          </div>
        {:else if cctvItems.length === 0}
          <div class="cctv-empty">
            <div class="cctv-icon">▣</div>
            <strong>CCTV is not available yet</strong>
            <span>{cctvSnapshotsError || "Latest snapshot is not available for this vessel yet."}</span>
          </div>
        {:else}
          <div class="cctv-focus-layout">
            {#if mainDashboardCctv}
              <div
                class:offline={!mainDashboardCctv.online}
                class:has-snapshot={Boolean(mainDashboardCctv.url)}
                class="cctv-box cctv-main-box"
              >
                {#if mainDashboardCctv.url}
                  <CctvSnapshotImage
                    class="cctv-snapshot-img"
                    src={mainDashboardCctv.url}
                    filePath={mainDashboardCctv.location}
                    alt={`${mainDashboardCctv.name} latest snapshot`}
                    loading="eager"
                  />
                {/if}
                <div class="cctv-top">
                  <span class="camera-dot" title={mainDashboardCctv.status}></span>
                  <span class="cctv-status-text">{mainDashboardCctv.online ? "Snapshot ready" : "No snapshot"}</span>
                </div>

                <div class="cctv-content">
                  <div class="cctv-icon">▣</div>
                  <div class="cctv-name">{mainDashboardCctv.name}</div>
                  {#if mainDashboardCctv.capturedAtText}
                    <div class="cctv-location">Captured {mainDashboardCctv.capturedAtText}</div>
                  {:else}
                    <div class="cctv-location">{mainDashboardCctv.location}</div>
                  {/if}
                  {#if mainDashboardCctv.fileSizeText}
                    <div class="cctv-file-size">{mainDashboardCctv.fileSizeText}</div>
                  {/if}
                </div>
              </div>
            {/if}

            {#if miniDashboardCctvItems.length}
              <div class="cctv-thumbnail-row" aria-label="CCTV camera list">
                {#each miniDashboardCctvItems as cctv (cctv.key)}
                  <button
                    type="button"
                    class:offline={!cctv.online}
                    class:has-snapshot={Boolean(cctv.url)}
                    class="cctv-box cctv-thumb-box"
                    onclick={() => selectDashboardCctv(cctv)}
                    title={`Show ${cctv.name}`}
                  >
                    {#if cctv.url}
                      <CctvSnapshotImage
                        class="cctv-snapshot-img"
                        src={cctv.url}
                        filePath={cctv.location}
                        alt={`${cctv.name} latest snapshot`}
                        loading="lazy"
                      />
                    {/if}

                    <div class="cctv-content">
                      <div class="cctv-name">{cctv.name}</div>
                    </div>
                  </button>
                {/each}
              </div>
            {/if}
          </div>

        {/if}
      </div>
    </div>

    {#if canViewDailyPathMap}
      <div class="monitoring-card map-section">
        <div class="section-header">
          <div>
            <span class="section-kicker">Position</span>
            <h2>Current Vessel Location</h2>
          </div>

          <strong>{vesselInfo.currentSpeed}</strong>
        </div>

        <div class="map-box">
          {#if active}
            <div class="dashboard-leaflet-map" bind:this={dashboardMapContainer}></div>
          {/if}

          {#if vesselInfo.latitude === null || vesselInfo.longitude === null}
            <div class="dashboard-map-status">Vessel coordinates are not available yet.</div>
          {/if}

          <div class="dashboard-map-legend">
            {#each dashboardZones as zone}
              <span class="dashboard-zone-legend-item">
                <i
                  class="dashboard-zone-legend-swatch"
                  style={`--zone-color: ${zone.color}; --zone-fill: ${zone.fillColor};`}
                  aria-hidden="true"
                ></i>
                {zone.name}
              </span>
            {/each}

            <button
              type="button"
              class:active-wind-toggle={showWindParticles}
              class="wind-toggle-btn"
              onclick={() => (showWindParticles = !showWindParticles)}
            >
              <span class="wind-legend-line"></span>
              Wind: {showWindParticles ? "On" : "Off"}
            </button>

            <button
              type="button"
              class:active-current-toggle={showCurrentParticles}
              class="current-toggle-btn"
              onclick={() => (showCurrentParticles = !showCurrentParticles)}
            >
              <span class="current-legend-line"></span>
              Current: {showCurrentParticles ? "On" : "Off"}
            </button>
          </div>
        </div>
      </div>
    {:else}
      <div class="monitoring-card permission-empty">
        <strong>Map is not displayed</strong>
        <span>The user does not have the view_daily_path_map permission.</span>
      </div>
    {/if}
  </section>

  <section class="info-rpm-section">
    <section class="vessel-panel">
      <div class="section-header">
        <div>
          <span class="section-kicker">Vessel Status</span>
          <h2>{vesselInfo.vesselName}</h2>
        </div>

        <div class="online-badge" class:offline-badge={!vesselInfo.online}>
          <span></span>
          {vesselInfo.online ? "Online" : "Offline"}
        </div>
      </div>

      <div class="vessel-info-grid">
        <article class="compact-info-card">
          <span class="info-label">Latitude</span>
          <strong>
            <CopyableCoordinate
              value={vesselInfo.latitude === null ? "-" : formatNumber(vesselInfo.latitude, 6)}
              display={vesselInfo.latitude === null ? "-" : `${formatNumber(vesselInfo.latitude, 6)}°`}
              label="latitude"
              compact
            />
          </strong>
        </article>

        <article class="compact-info-card">
          <span class="info-label">Longitude</span>
          <strong>
            <CopyableCoordinate
              value={vesselInfo.longitude === null ? "-" : formatNumber(vesselInfo.longitude, 6)}
              display={vesselInfo.longitude === null ? "-" : `${formatNumber(vesselInfo.longitude, 6)}°`}
              label="longitude"
              compact
            />
          </strong>
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
        <div class="section-header">
          <div>
            <span class="section-kicker">Engine Monitoring</span>
            <h2>RPM Overview</h2>
          </div>

          <strong>{rpmCards.length} engines</strong>
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
        <strong>RPM Overview is not displayed</strong>
        <span>The user does not have the view_engine_rpm_stats_table permission.</span>
      </section>
    {/if}
  </section>

  {#if canViewSpeedStatsTable || canViewTravelDistanceTable}
    <section class="summary-grid">
      {#if canViewSpeedStatsTable}
        <article class="summary-card">
          <span>Top Speed</span>
          <strong>{speedSummary.topSpeed}</strong>
        </article>

        <article class="summary-card">
          <span>Average Speed</span>
          <strong>{speedSummary.averageSpeed}</strong>
        </article>
      {/if}

      {#if canViewTravelDistanceTable}
        <article class="summary-card">
          <span>Total Distance</span>
          <strong>{speedSummary.totalDistance}</strong>
        </article>
      {/if}
    </section>
  {/if}

  <section class="environment-summary">
    <section class="table-section environment-card">
      <div class="section-header">
        <div>
          <span class="section-kicker">Weather Forecast</span>
          <h2>Today · Tomorrow · Day After</h2>
        </div>
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

    <section class="table-section environment-card">
      <div class="section-header">
        <div>
          <span class="section-kicker">Ocean Current</span>
          <h2>Current Forecast</h2>
        </div>
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
    <section class="table-section main-fuel-card">
      <div class="section-header">
        <div>
          <span class="section-kicker">Fuel Monitoring</span>
          <h2>Current Daily Consumption So Far</h2>
        </div>

      </div>

      {#if canViewFuelConsumptionTable && hasVisibleFuelSource}
        <div class="fuel-cols">
          {#if canShowFuelEmsInternal}
            <article class="fuel-metric">
              <span class="fuel-label">{shouldShowVmsFuelLabel ? "VMS" : "EMS"}</span>
              <strong class="fuel-value">{fuelSummary.emsInternal}</strong>
            </article>
          {/if}

          {#if canShowFuelEmsExternal}
            <article class="fuel-metric">
              <span class="fuel-label">EMS</span>
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
        <div class="empty-box">
          Fuel consumption is not displayed because the view_fuel_consumption_table permission or fuel source permission is not available.
        </div>
      {/if}

      {#if canShowFodUsage}
        <div class="fod-usage-summary">
          <article>
            <span>FOD</span>
            <strong>{formatLiter(fodUsage?.accumulatedLiters || 0)}</strong>
          </article>
        </div>
      {/if}
    </section>

    {#if canShowRob}
      <section class="table-section rob-card">
        <div class="section-header">
          <div>
            <span class="section-kicker">Tank Status</span>
            <h2>Latest ROB</h2>
          </div>
        </div>

        <div class="rob-content">
          <span>Remaining On Board</span>
          <strong class="rob-value">{fuelSummary.latestRob}</strong>
        </div>
      </section>
    {/if}
  </section>
  {/if}
</section>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(html),
  :global(body) {
    margin: 0;
    padding: 0;
    font-family:
      'Plus Jakarta Sans',
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
    color: var(--text-primary);
    background: var(--color-base);
  }

  button,
  input,
  textarea,
  select {
    font: inherit;
  }

  button {
    cursor: pointer;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  .dashboard-content {
    width: 100%;
    height: 100%;
    max-height: 100%;
    min-height: 0;
    padding: 14px;
    background: var(--color-base);
    color: var(--text-primary);
    overflow-y: auto;
    overflow-x: hidden;
  }

  .dashboard-header-card,
  .monitoring-card,
  .vessel-panel,
  .rpm-panel,
  .summary-card,
  .table-section {
    background: var(--color-surface);
    border: 1px solid #d9e2ec;
    border-radius: 12px;
    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
    overflow: hidden;
  }

  .dashboard-header-card {
    padding: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .page-kicker,
  .section-kicker {
    display: inline-flex;
    width: fit-content;
    padding: 4px 9px;
    border-radius: 999px;
    background: var(--color-accent-muted);
    color: #1d4ed8;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .dashboard-header-card h1 {
    margin: 8px 0 0;
    font-size: 22px;
    line-height: 1.2;
    font-weight: 900;
    color: var(--text-primary);
  }

  .dashboard-header-card p {
    margin: 7px 0 0;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.5;
    font-weight: 700;
  }

  .status-box {
    margin-top: 14px;
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 900;
  }

  .loading-box {
    background: var(--color-accent-muted);
    color: #1d4ed8;
    border: 1px solid #bfdbfe;
  }

  .error-box {
    background: var(--color-danger-muted);
    color: #b91c1c;
    border: 1px solid #fecaca;
  }

  .hero-grid {
    display: grid;
    grid-template-columns: minmax(300px, 400px) minmax(0, 1fr);
    gap: 14px;
    min-height: 404px;
    margin-top: 14px;
  }

  .cctv-section,
  .map-section {
    min-width: 0;
    min-height: 404px;
    display: flex;
    flex-direction: column;
  }

  .cctv-section {
    align-self: start;
  }

  .section-header {
    min-height: 58px;
    padding: 12px 14px;
    border-bottom: 1px solid #e5edf5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: var(--color-surface);
  }

  .section-header h2 {
    margin: 7px 0 0;
    color: var(--text-primary);
    font-size: 17px;
    line-height: 1.2;
    font-weight: 900;
  }

  .section-header > strong {
    flex-shrink: 0;
    padding: 5px 10px;
    border-radius: 999px;
    background: var(--color-accent-muted);
    border: 1px solid #bfdbfe;
    color: #1d4ed8;
    font-size: 11px;
    font-weight: 900;
    white-space: nowrap;
  }

  .cctv-grid {
    flex: 1;
    display: block;
    padding: 14px;
    background: var(--color-elevated);
  }

  .empty-cctv {
    display: grid;
    grid-template-columns: 1fr;
  }

  .cctv-focus-layout {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    min-height: 0;
  }

  .cctv-thumbnail-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
    width: 100%;
  }

  .cctv-box {
    position: relative;
    min-height: 0;
    aspect-ratio: 4 / 3;
    border-radius: 12px;
    overflow: hidden;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0)),
      #334155;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #ffffff;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 12px;
  }

  button.cctv-box {
    appearance: none;
    width: 100%;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .cctv-main-box {
    width: 100%;
    cursor: default;
  }

  .cctv-thumb-box {
    border-radius: 10px;
    padding: 8px;
    min-width: 0;
  }

  .cctv-thumb-box:hover {
    border-color: rgba(96, 165, 250, 0.52);
    filter: brightness(1.08);
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
    z-index: 1;
  }

  .cctv-box.has-snapshot::before {
    background:
      linear-gradient(180deg, rgba(15, 23, 42, 0.7) 0%, rgba(15, 23, 42, 0.08) 42%, rgba(15, 23, 42, 0.82) 100%);
    opacity: 1;
  }

  :global(.cctv-snapshot-img) {
    position: absolute;
    inset: 0;
    z-index: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transform: scale(1.01);
  }

  .cctv-box.offline {
    background: #64748b;
    color: #e5e7eb;
  }

  .cctv-top,
  .cctv-content {
    position: relative;
    z-index: 2;
  }

  .cctv-top {
    display: flex;
    align-items: center;
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

  .cctv-status-text {
    margin-left: 8px;
    color: #dbeafe;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .cctv-content {
    display: grid;
    place-items: center;
    text-align: center;
    gap: 5px;
    margin-bottom: 10px;
  }

  .cctv-box.has-snapshot .cctv-content {
    place-items: start;
    align-self: stretch;
    margin: auto 0 0;
    padding: 9px 10px;
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.74);
    border: 1px solid rgba(148, 163, 184, 0.18);
    backdrop-filter: blur(8px);
    text-align: left;
  }

  .cctv-box.has-snapshot .cctv-icon {
    display: none;
  }

  .cctv-thumb-box .cctv-content {
    place-items: start;
    align-self: stretch;
    margin: auto 0 0;
    padding: 7px 8px;
    border-radius: 9px;
    background: rgba(15, 23, 42, 0.78);
    border: 1px solid rgba(148, 163, 184, 0.14);
    text-align: left;
  }

  .cctv-thumb-box.has-snapshot .cctv-content {
    padding: 7px 8px;
    border-radius: 9px;
  }

  .cctv-thumb-box .cctv-name {
    font-size: 12px;
    line-height: 1.2;
  }

  .cctv-icon {
    width: 38px;
    height: 38px;
    border-radius: 12px;
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
    color: #dbe3ec;
    font-size: 11px;
    font-weight: 700;
  }

  .cctv-file-size {
    color: #93c5fd;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .cctv-skeleton {
    display: grid;
    align-content: end;
    gap: 10px;
    background: #111827;
  }

  .cctv-skeleton span,
  .cctv-skeleton strong,
  .cctv-skeleton small {
    position: relative;
    z-index: 2;
    display: block;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.16);
  }

  .cctv-skeleton span {
    width: 58px;
    height: 18px;
  }

  .cctv-skeleton strong {
    width: 68%;
    height: 20px;
  }

  .cctv-skeleton small {
    width: 46%;
    height: 12px;
  }

  .cctv-skeleton span::after,
  .cctv-skeleton strong::after,
  .cctv-skeleton small::after {
    content: "";
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.16), transparent);
    animation: cctv-shimmer 1.35s infinite;
  }

  @keyframes cctv-shimmer {
    100% {
      transform: translateX(100%);
    }
  }

  .cctv-empty {
    min-height: 260px;
    border-radius: 12px;
    background: var(--color-surface);
    border: 1px dashed #bfdbfe;
    color: var(--text-secondary);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 8px;
    padding: 20px;
  }

  .cctv-empty .cctv-icon {
    color: #2563eb;
    background: var(--color-accent-muted);
  }

  .cctv-empty strong {
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 900;
  }

  .cctv-empty span {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
  }

  .map-box {
    flex: 1;
    width: 100%;
    min-height: 320px;
    background: var(--color-elevated);
    overflow: hidden;
    position: relative;
  }

  .dashboard-leaflet-map {
    width: 100%;
    height: 100%;
    min-height: 320px;
    background: var(--color-elevated);
  }

  .dashboard-map-status {
    position: absolute;
    top: 10px;
    left: 50%;
    z-index: 760;
    transform: translateX(-50%);
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    padding: 0 12px;
    border-radius: 999px;
    background: rgba(17, 24, 39, 0.94);
    border: 1px solid #bfdbfe;
    color: #1d4ed8;
    font-size: 10px;
    font-weight: 900;
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
  }

  .dashboard-map-legend {
    position: absolute;
    left: 8px;
    bottom: 8px;
    z-index: 740;
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    max-width: calc(100% - 16px);
    padding: 5px 7px;
    border-radius: 8px;
    background: rgba(17, 24, 39, 0.94);
    border: 1px solid #dbe4ef;
    box-shadow: 0 4px 10px rgba(15, 23, 42, 0.07);
  }

  .dashboard-zone-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    color: #cbd5e1;
    font-size: 10px;
    font-weight: 800;
    white-space: nowrap;
  }

  .dashboard-zone-legend-swatch {
    width: 22px;
    height: 16px;
    border: 2px dashed var(--zone-color, #38bdf8);
    border-radius: 6px;
    background: color-mix(in srgb, var(--zone-fill, #0ea5e9) 24%, transparent);
    flex: 0 0 auto;
  }

  .wind-legend-line,
  .current-legend-line {
    width: 15px;
    height: 2px;
    border-radius: 999px;
    flex-shrink: 0;
  }

  .wind-legend-line {
    background: var(--color-surface);
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.12);
  }

  .current-legend-line {
    background: linear-gradient(90deg, rgba(56, 189, 248, 0.14), #38bdf8);
    box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.14);
  }

  .wind-toggle-btn,
  .current-toggle-btn {
    height: 21px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 7px;
    border-radius: 999px;
    background: var(--color-surface);
    font-size: 8px;
    line-height: 1;
    font-weight: 900;
    cursor: pointer;
  }

  .wind-toggle-btn {
    border: 1px solid #bae6fd;
    color: #0369a1;
  }

  .wind-toggle-btn.active-wind-toggle,
  .wind-toggle-btn:hover {
    background: var(--color-elevated);
    border-color: #0ea5e9;
  }

  .current-toggle-btn {
    border: 1px solid #bae6fd;
    color: #075985;
  }

  .current-toggle-btn.active-current-toggle,
  .current-toggle-btn:hover {
    background: var(--color-elevated);
    border-color: #38bdf8;
  }

  :global(.wind-particle-canvas),
  :global(.current-particle-canvas) {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
  }

  :global(.wind-particle-canvas) {
    opacity: 0.9;
    mix-blend-mode: normal;
  }

  :global(.current-particle-canvas) {
    opacity: 0.86;
    mix-blend-mode: screen;
  }

  :global(.dashboard-vessel-leaflet-icon) {
    background: transparent;
    border: none;
  }

  :global(.dashboard-vessel-marker-icon) {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    transform-origin: center center;
    filter:
      drop-shadow(0 0 5px rgba(255, 255, 255, 0.95))
      drop-shadow(0 9px 16px rgba(15, 23, 42, 0.32));
  }

  :global(.dashboard-vessel-leaflet-icon.offline .dashboard-vessel-marker-icon) {
    opacity: 0.68;
    filter:
      grayscale(1)
      brightness(0.82)
      drop-shadow(0 0 5px rgba(15, 23, 42, 0.72))
      drop-shadow(0 9px 16px rgba(15, 23, 42, 0.34));
  }

  :global(.dashboard-asset-leaflet-icon) {
    background: transparent;
    border: none;
  }

  :global(.dashboard-asset-marker-icon) {
    width: 32px;
    height: 32px;
    object-fit: contain;
    display: block;
    filter:
      drop-shadow(0 0 4px rgba(255, 255, 255, 0.9))
      drop-shadow(0 7px 12px rgba(15, 23, 42, 0.34));
  }

  :global(.dashboard-asset-boundary-circle) {
    pointer-events: none;
  }

  :global(.dashboard-asset-leaflet-popup .leaflet-popup-content-wrapper) {
    width: 300px;
    background: #111827;
    color: #f8fafc;
    border-radius: 16px;
    border: 1px solid rgba(148, 163, 184, 0.24);
    box-shadow:
      0 18px 38px rgba(2, 6, 23, 0.46),
      0 0 0 1px rgba(255, 255, 255, 0.03) inset;
    overflow: hidden;
  }

  :global(.dashboard-asset-leaflet-popup .leaflet-popup-content) {
    width: 300px !important;
    margin: 0;
  }

  :global(.dashboard-asset-leaflet-popup .leaflet-popup-tip) {
    background: #111827;
    border: 1px solid rgba(148, 163, 184, 0.24);
  }

  :global(.dashboard-asset-leaflet-popup .leaflet-popup-close-button) {
    top: 10px;
    right: 10px;
    width: 26px;
    height: 26px;
    border-radius: 9px;
    color: #cbd5e1 !important;
    background: rgba(30, 41, 59, 0.88);
    border: 1px solid rgba(148, 163, 184, 0.18);
    font-size: 18px;
    line-height: 24px;
  }

  :global(.dashboard-asset-popup) {
    color: #f8fafc;
  }

  :global(.dashboard-asset-popup-hero) {
    display: grid;
    grid-template-columns: 46px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    padding: 14px 38px 14px 14px;
    background: #1f2937;
    border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  }

  :global(.dashboard-asset-popup-icon) {
    width: 42px;
    height: 42px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    background: rgba(37, 99, 235, 0.16);
    border: 1px solid rgba(96, 165, 250, 0.28);
  }

  :global(.dashboard-asset-popup-icon img) {
    width: 30px;
    height: 30px;
    object-fit: contain;
  }

  :global(.dashboard-asset-popup-heading) {
    min-width: 0;
  }

  :global(.dashboard-asset-popup-heading span) {
    display: block;
    color: #60a5fa;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  :global(.dashboard-asset-popup-heading strong) {
    display: block;
    margin-top: 3px;
    color: #f8fafc;
    font-size: 17px;
    line-height: 1.15;
    font-weight: 800;
    overflow-wrap: anywhere;
  }

  :global(.dashboard-asset-popup-hero em) {
    padding: 5px 9px;
    border-radius: 999px;
    background: rgba(37, 99, 235, 0.22);
    border: 1px solid rgba(96, 165, 250, 0.32);
    color: #dbeafe;
    font-size: 10px;
    font-style: normal;
    font-weight: 900;
    text-transform: uppercase;
  }

  :global(.dashboard-asset-popup-grid) {
    display: grid;
    gap: 8px;
    padding: 12px 14px 14px;
    background: #111827;
  }

  :global(.dashboard-asset-popup-grid > div) {
    min-height: 42px;
    padding: 9px 10px;
    border-radius: 10px;
    background: #1f2937;
    border: 1px solid rgba(148, 163, 184, 0.15);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  :global(.dashboard-asset-popup-grid span) {
    color: #94a3b8;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  :global(.dashboard-asset-popup-grid strong),
  :global(.dashboard-asset-popup-grid .copyable-coordinate-value) {
    color: #f8fafc;
    font-size: 12px;
    font-weight: 800;
    text-align: right;
  }

  :global(.dashboard-asset-popup-grid .copy-coordinate-button) {
    width: 28px;
    height: 28px;
    border-radius: 9px;
    background: rgba(37, 99, 235, 0.2);
    border: 1px solid rgba(96, 165, 250, 0.34);
    color: #bfdbfe;
  }

  :global(.dashboard-leaflet-popup .leaflet-popup-content-wrapper) {
    background: var(--color-surface);
    color: var(--text-primary);
    border-radius: 10px;
    border: 1px solid #dbe4ef;
    box-shadow:
      0 9px 20px rgba(15, 23, 42, 0.14),
      0 1px 4px rgba(15, 23, 42, 0.08);
    overflow: hidden;
  }

  :global(.dashboard-leaflet-popup .leaflet-popup-content) {
    margin: 0;
    width: 215px !important;
  }

  :global(.dashboard-leaflet-popup .leaflet-popup-tip) {
    background: var(--color-surface);
    border: 1px solid #dbe4ef;
  }

  :global(.vms-zone-popup-wrapper .leaflet-popup-content-wrapper) {
    border: 1px solid rgba(96, 165, 250, 0.28);
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.94);
    color: #f8fafc;
    box-shadow: 0 18px 36px rgba(15, 23, 42, 0.36);
    overflow: hidden;
  }

  :global(.vms-zone-popup-wrapper .leaflet-popup-content) {
    margin: 0;
    width: 180px !important;
  }

  :global(.vms-zone-popup-wrapper .leaflet-popup-tip) {
    background: rgba(15, 23, 42, 0.94);
  }

  :global(.vms-zone-popup) {
    display: grid;
    gap: 5px;
    padding: 10px 12px;
  }

  :global(.vms-zone-popup strong) {
    color: #f8fafc;
    font-size: 13px;
    font-weight: 800;
  }

  :global(.vms-zone-popup span) {
    color: #94a3b8;
    font-size: 11px;
    font-weight: 650;
  }

  :global(.vms-zone-tooltip) {
    border: 1px solid rgba(96, 165, 250, 0.26);
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.88);
    color: #f8fafc;
    font-size: 10px;
    font-weight: 800;
    box-shadow: 0 10px 20px rgba(15, 23, 42, 0.28);
  }

  :global(.dashboard-map-popup-title) {
    padding: 8px 30px 7px 9px;
    background: linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(37, 99, 235, 0)), var(--color-elevated);
    color: var(--text-primary);
    font-size: 11.5px;
    font-weight: 900;
    line-height: 1.1;
    border-bottom: 1px solid #e2e8f0;
  }

  :global(.dashboard-map-popup-row) {
    display: grid;
    grid-template-columns: 60px 1fr;
    gap: 5px;
    align-items: start;
    padding: 5px 9px;
    border-bottom: 1px solid #eef2f7;
  }

  :global(.dashboard-map-popup-row span) {
    color: var(--text-secondary);
    font-size: 8px;
    font-weight: 800;
  }

  :global(.dashboard-map-popup-row strong) {
    color: var(--text-primary);
    font-size: 8.8px;
    line-height: 1.25;
    font-weight: 900;
    text-align: right;
  }

  :global(.leaflet-control-attribution) {
    border-radius: 8px 0 0 0;
    background: rgba(17, 24, 39, 0.94) !important;
    color: var(--text-secondary) !important;
    font-size: 8px !important;
    font-weight: 700;
    backdrop-filter: blur(8px);
  }

  :global(.leaflet-control-attribution a) {
    color: #2563eb !important;
    font-weight: 800;
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
    color: var(--text-secondary);
  }

  .permission-empty strong {
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 900;
  }

  .permission-empty span {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
  }

  .info-rpm-section {
    display: grid;
    grid-template-columns: minmax(420px, 0.9fr) minmax(540px, 1.1fr);
    gap: 14px;
    margin-top: 14px;
    align-items: stretch;
  }

  .vessel-panel,
  .rpm-panel {
    min-width: 0;
  }

  .vessel-info-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    padding: 14px;
    background: var(--color-elevated);
  }

  .compact-info-card {
    min-height: 72px;
    padding: 12px;
    border: 1px solid #d9e2ec;
    border-radius: 10px;
    background: var(--color-surface);
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .compact-info-card.highlight {
    border-color: #bfdbfe;
    background: var(--color-accent-muted);
  }

  .info-label {
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .compact-info-card strong {
    display: block;
    margin-top: 7px;
    color: var(--text-primary);
    font-size: 13px;
    line-height: 1.25;
    font-weight: 900;
    word-break: break-word;
  }

  .compact-info-card.highlight strong {
    color: #1d4ed8;
    font-size: 20px;
  }

  .online-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 30px;
    padding: 0 11px;
    border-radius: 999px;
    background: var(--color-success-muted);
    border: 1px solid #bbf7d0;
    color: #047857;
    font-size: 12px;
    font-weight: 900;
    white-space: nowrap;
  }

  .online-badge.offline-badge {
    background: var(--color-elevated);
    border-color: #cbd5e1;
    color: var(--text-secondary);
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

  .rpm-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(180px, 1fr));
    gap: 10px;
    padding: 14px;
    background: var(--color-elevated);
    min-width: 0;
  }

  .summary-grid {
    margin-top: 14px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  .summary-card {
    min-height: 96px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .summary-card span {
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .summary-card strong {
    margin-top: 10px;
    color: var(--text-primary);
    font-size: 22px;
    line-height: 1.1;
    font-weight: 900;
  }

  .environment-summary {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    margin-top: 14px;
  }

  .environment-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    padding: 14px;
    background: var(--color-elevated);
  }

  .environment-grid article {
    min-height: 82px;
    padding: 12px;
    border-radius: 10px;
    background: var(--color-surface);
    border: 1px solid #d9e2ec;
  }

  .environment-grid span,
  .environment-grid small {
    display: block;
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .environment-grid strong {
    display: block;
    margin-top: 9px;
    color: var(--text-primary);
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

  .fuel-summary {
    display: grid;
    grid-template-columns: 1.45fr 0.85fr;
    gap: 14px;
    margin-top: 14px;
  }

  .fuel-cols {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    padding: 14px;
    background: var(--color-elevated);
  }

  .fuel-metric {
    min-height: 92px;
    padding: 14px;
    border-radius: 10px;
    border: 1px solid #d9e2ec;
    background: var(--color-surface);
  }

  .fuel-label {
    display: block;
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .fuel-value {
    display: block;
    margin-top: 12px;
    color: var(--text-primary);
    font-size: 24px;
    font-weight: 900;
    line-height: 1.1;
  }

  .empty-box {
    padding: 18px 14px;
    color: var(--text-secondary);
    background: var(--color-elevated);
    font-size: 12px;
    font-weight: 800;
  }

  .fod-usage-summary {
    padding: 0 14px 14px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    background: var(--color-elevated);
  }

  .fod-usage-summary article {
    min-height: 68px;
    padding: 12px 14px;
    background: var(--color-surface);
    border: 1px solid #d9e2ec;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .fod-usage-summary span {
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .fod-usage-summary strong {
    margin-top: 6px;
    color: var(--text-primary);
    font-size: 18px;
    font-weight: 900;
  }

  .fod-total-card {
    background: var(--color-accent-muted) !important;
    border-color: #bfdbfe !important;
  }

  .fod-total-card strong {
    color: #1d4ed8;
  }

  .rob-card {
    min-height: 180px;
  }

  .rob-content {
    padding: 18px 16px;
    background: var(--color-elevated);
  }

  .rob-content span {
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .rob-value {
    display: block;
    margin-top: 14px;
    color: #1d4ed8;
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

    .hero-grid,
    .cctv-section,
    .map-section {
      min-height: auto;
    }

    .map-box {
      height: 320px;
      flex: none;
    }
  }

  @media (max-width: 780px) {
    .dashboard-content {
      padding: 10px;
    }

    .dashboard-header-card,
    .section-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .vessel-info-grid,
    .rpm-grid,
    .summary-grid,
    .environment-grid,
    .fuel-cols,
    .fod-usage-summary {
      grid-template-columns: 1fr;
    }

    .cctv-box {
      min-height: 0;
    }

    .cctv-grid {
      padding: 10px;
    }

    .cctv-thumbnail-row {
      gap: 6px;
    }

    .cctv-thumb-box {
      border-radius: 9px;
      padding: 6px;
    }

    .cctv-thumb-box .cctv-name {
      font-size: 11px;
    }

    .summary-card {
      min-height: 88px;
    }
  }
</style>
