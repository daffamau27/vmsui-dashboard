<script>
  import { onMount } from "svelte";
  import VesselMap from "$lib/VesselMap.svelte";
  import {
    selectedVesselId,
    selectedVesselInfo
  } from "$lib/stores/selectedVessel.svelte.js";
  import { getVesselTrace } from "$lib/api/traceApi.js";

  let loading = $state(false);
  let error = $state("");
  let traceData = $state(null);

  let isPlaying = $state(false);
  let activeIndex = $state(0);

  let startDateTime = $state("");
  let endDateTime = $state("");
  let timezoneMode = $state("auto");
  let timezoneOffset = $state("+07:00");

  const cctvItems = [
    { name: "CCTV 1", status: "Live" },
    { name: "CCTV 2", status: "Live" },
    { name: "CCTV 3", status: "Live" },
    { name: "CCTV 4", status: "Offline" }
  ];

    let { active = false } = $props();
    let loadedKeys = $state({});

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function toLocalInputValue(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}`;
  }

  function toApiDateTime(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return value;

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}:00`;
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

    function formatDateTime(value) {
    if (!value) return "-";

    // Jika timestamp number/string angka milisecond
    if (/^\d+$/.test(String(value))) {
        const date = new Date(Number(value));

        if (!Number.isNaN(date.getTime())) {
        return date.toLocaleString("id-ID", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
        }
    }

    // Jika format ISO/date string
    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
        return date.toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
        });
    }

    return value;
    }

    function getTracePoints(data) {
    const candidates =
        data?.points ||
        data?.trace ||
        data?.traces ||
        data?.coordinates ||
        data?.path ||
        data?.rows ||
        data?.items ||
        data?.result ||
        data?.data?.points ||
        data?.data?.trace ||
        data?.data?.coordinates ||
        data?.data?.path ||
        data?.data?.rows ||
        data?.data ||
        data ||
        [];

    if (!Array.isArray(candidates)) {
        console.warn("[TRACE_POINTS_NOT_ARRAY]", data);
        return [];
    }

    const points = candidates
        .map((item, index) => {
        const lat = toNumber(
            item.latitude ??
            item.lat ??
            item.gps_lat ??
            item.gpsLatitude ??
            item.latitude_deg ??
            item.position?.latitude ??
            item.position?.lat,
            NaN
        );

        const lng = toNumber(
            item.longitude ??
            item.lng ??
            item.lon ??
            item.gps_lng ??
            item.gps_lon ??
            item.gpsLongitude ??
            item.longitude_deg ??
            item.position?.longitude ??
            item.position?.lng ??
            item.position?.lon,
            NaN
        );

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        if (lat === 0 && lng === 0) return null;

        return {
            index,
            latitude: lat,
            longitude: lng,
            heading: toNumber(item.heading ?? item.course ?? item.bearing, 0),
            speed: toNumber(item.speed ?? item.sog ?? item.speedOverGround, 0),
            rpm: toNumber(item.rpm ?? item.me_rpm ?? item.mePortRpm ?? item.me_port_rpm, 0),
            fuelPerMinute: toNumber(
            item.fuelPerMinute ??
                item.fuel_per_minute ??
                item.fuelRate ??
                item.fuel_rate ??
                item.f_rate,
            0
            ),
            weather:
            item.weather ||
            item.weatherForecast ||
            item.condition ||
            "",
            timestamp: formatDateTime(
            item.timestamp ||
                item.ts ||
                item.time ||
                item.datetime ||
                item.createdAt ||
                item.created_at ||
                "-"
            )
        };
        })
        .filter(Boolean);

    console.log("[TRACE_POINTS_PARSED]", points.length, points.slice(0, 3));

    return points;
    }

  let tracePoints = $derived(getTracePoints(traceData));

  let activePoint = $derived(
    tracePoints[activeIndex] ||
      tracePoints[0] || {
        latitude: toNumber($selectedVesselInfo?.latitude ?? $selectedVesselInfo?.lat, 0),
        longitude: toNumber($selectedVesselInfo?.longitude ?? $selectedVesselInfo?.lng, 0),
        heading: toNumber($selectedVesselInfo?.heading, 0),
        speed: toNumber($selectedVesselInfo?.speed, 0),
        rpm: 0,
        fuelPerMinute: 0,
        weather: $selectedVesselInfo?.weather?.current?.condition || "-",
        timestamp: formatDateTime($selectedVesselInfo?.lastUpdated || "-")
      }
  );

  let vesselInfo = $derived({
    vesselName:
      $selectedVesselInfo?.name ||
      $selectedVesselInfo?.vesselName ||
      "Selected Vessel",
    latitude: activePoint.latitude,
    longitude: activePoint.longitude,
    heading: activePoint.heading,
    currentSpeed: `${formatNumber(activePoint.speed, 1, "0.0")} knot`,
    rpm: activePoint.rpm ? `${formatNumber(activePoint.rpm, 0)} RPM` : "-",
    fuelPerMinute: activePoint.fuelPerMinute
      ? `${formatNumber(activePoint.fuelPerMinute, 2)} L/min`
      : "-",
    weatherForecast:
      activePoint.weather ||
      $selectedVesselInfo?.weather?.current?.condition ||
      "-",
    lastUpdate: activePoint.timestamp || "-"
  });

  let timelineProgress = $derived(
    tracePoints.length > 1
      ? Math.min(100, Math.max(0, (activeIndex / (tracePoints.length - 1)) * 100))
      : 0
  );

  let metrics = $derived([
    {
      label: "Speed",
      value: vesselInfo.currentSpeed,
      sub: "Current trace speed"
    },
    {
      label: "RPM",
      value: vesselInfo.rpm,
      sub: "Current trace engine"
    },
    {
      label: "Fuel per minute",
      value: vesselInfo.fuelPerMinute,
      sub: "Current consumption"
    }
  ]);

  async function loadTrace() {
    if (!$selectedVesselId) {
      error = "Belum ada vessel yang dipilih dari Fleet View.";
      traceData = null;
      return;
    }

    loading = true;
    error = "";

    try {
      const result = await getVesselTrace({
        vesselId: $selectedVesselId,
        start: toApiDateTime(startDateTime),
        end: toApiDateTime(endDateTime),
        timezoneMode,
        timezoneOffset: timezoneMode === "manual" ? timezoneOffset : ""
      });

      traceData = result;
      console.log("[VESSEL_TRACE_RAW]", result);
      console.log("[VESSEL_TRACE_POINTS_COUNT]", getTracePoints(result).length);
      activeIndex = 0;

      console.log("[VESSEL_TRACE_DATA]", result);
    } catch (err) {
      console.error("[VESSEL_TRACE_ERROR]", err);
      error = err?.message || "Gagal memuat trace vessel.";
      traceData = null;
    } finally {
      loading = false;
    }
  }

  function togglePlayback() {
    if (!tracePoints.length) return;
    isPlaying = !isPlaying;
  }

  function moveTimeline(event) {
    if (!tracePoints.length) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const ratio = Math.min(1, Math.max(0, x / rect.width));

    activeIndex = Math.round(ratio * (tracePoints.length - 1));
  }

onMount(() => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  startDateTime = toLocalInputValue(start);
  endDateTime = toLocalInputValue(now);
});

$effect(() => {
  if (!active) return;
  if (!$selectedVesselId) return;
  if (!startDateTime || !endDateTime) return;

  const key = `${$selectedVesselId}|${startDateTime}|${endDateTime}|${timezoneMode}|${timezoneOffset}`;

  if (loadedKeys[key]) return;

  loadedKeys = {
    ...loadedKeys,
    [key]: true
  };

  loadTrace();
});
</script>

<section class="dashboard-content">
  <section class="filter-card">
    <div class="filter-title">
      <strong>Trace Playback</strong>
      <span>{vesselInfo.vesselName}</span>
    </div>

    <div class="filter-controls">
      <label>
        <span>Start</span>
        <input type="datetime-local" bind:value={startDateTime} />
      </label>

      <label>
        <span>End</span>
        <input type="datetime-local" bind:value={endDateTime} />
      </label>

      <label>
        <span>Timezone</span>
        <select bind:value={timezoneMode}>
          <option value="auto">Auto</option>
          <option value="manual">Manual</option>
        </select>
      </label>

      {#if timezoneMode === "manual"}
        <label>
          <span>Offset</span>
          <input type="text" bind:value={timezoneOffset} placeholder="+07:00" />
        </label>
      {/if}

      <button type="button" onclick={loadTrace} disabled={loading}>
        {loading ? "Loading..." : "Load Trace"}
      </button>
    </div>
  </section>

  {#if error}
    <div class="status-box error-box">
      {error}
    </div>
  {/if}

  <section class="hero-section">
    <div class="cctv-card">
      <div class="card-header">
        <div>
          <div class="card-title">CCTV Monitoring</div>
          <div class="card-subtitle">Live vessel camera overview</div>
        </div>

        <span class="live-badge">LIVE</span>
      </div>

      <div class="cctv-layout">
        <div class="cctv-main">
          <div class="cctv-overlay">
            <span class="camera-name">{cctvItems[0].name}</span>
            <span class="camera-status">{cctvItems[0].status}</span>
          </div>
        </div>

        <div class="cctv-mini-row">
          {#each cctvItems.slice(1) as cctv}
            <div class="cctv-mini" class:offline={cctv.status === "Offline"}>
              <span>{cctv.name}</span>
              <small>{cctv.status}</small>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <div class="map-card">
      <div class="card-header map-header">
        <div>
          <div class="card-title">Vessel Position</div>
          <div class="card-subtitle">
            {vesselInfo.vesselName} · Heading {formatNumber(vesselInfo.heading, 1, "0.0")}°
          </div>
        </div>

        <div class="coordinate-badge">
          {formatNumber(vesselInfo.latitude, 6)}, {formatNumber(vesselInfo.longitude, 6)}
        </div>
      </div>

      <div class="map-panel">
        <VesselMap
            latitude={vesselInfo.latitude}
            longitude={vesselInfo.longitude}
            heading={vesselInfo.heading}
            vesselName={vesselInfo.vesselName}
            speed={vesselInfo.currentSpeed}
            lastUpdate={vesselInfo.lastUpdate}
            iconUrl="/assets/vessel-marker.svg"
            zoom={12}
            tracePoints={tracePoints}
            activeIndex={activeIndex}
            showTraceLine={true}
        />
      </div>
    </div>
  </section>

  <section class="playback-card">
    <button class="play-button" title="Play Trace" onclick={togglePlayback}>
      {isPlaying ? "Ⅱ" : "▶"}
    </button>

    <button class="timeline" type="button" onclick={moveTimeline}>
      <div class="timeline-track"></div>
      <div class="timeline-progress" style={`width: ${timelineProgress}%`}></div>
      <div class="timeline-dot" style={`left: ${timelineProgress}%`}></div>
    </button>

    <div class="timeline-time">{vesselInfo.lastUpdate}</div>
  </section>

  <section class="metric-grid">
    {#each metrics as metric}
      <div class="metric-card">
        <div class="metric-label">{metric.label}</div>
        <div class="metric-value">{metric.value}</div>
        <div class="metric-sub">{metric.sub}</div>
      </div>
    {/each}

    <div class="metric-card weather-card">
      <div class="metric-label">Weather</div>
      <div class="metric-value">{vesselInfo.weatherForecast}</div>
      <div class="metric-sub">
        Trace points: {tracePoints.length}
      </div>
    </div>
  </section>
</section>

<style>
  .dashboard-content {
    margin: 0;
    padding: 14px;
    background: #f4f5f7;
    min-height: 100%;
    overflow: auto;
    box-sizing: border-box;
  }

  .filter-card {
    margin-bottom: 14px;
    padding: 12px 14px;
    background: #ffffff;
    border: 1px solid #d8dde3;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.06);
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: 14px;
    align-items: end;
  }

  .filter-title strong {
    display: block;
    color: #111827;
    font-size: 14px;
    font-weight: 900;
  }

  .filter-title span {
    display: block;
    margin-top: 4px;
    color: #6b7280;
    font-size: 11px;
    font-weight: 700;
  }

  .filter-controls {
    display: flex;
    align-items: end;
    justify-content: flex-end;
    gap: 10px;
    flex-wrap: wrap;
  }

  .filter-controls label {
    display: grid;
    gap: 5px;
  }

  .filter-controls label span {
    color: #475569;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .filter-controls input,
  .filter-controls select {
    height: 30px;
    min-width: 150px;
    border: 1px solid #cbd5e1;
    background: #ffffff;
    padding: 0 9px;
    color: #0f172a;
    font-size: 11px;
    font-weight: 700;
    outline: none;
  }

  .filter-controls button {
    height: 30px;
    padding: 0 12px;
    border: none;
    background: #2563eb;
    color: #ffffff;
    font-size: 11px;
    font-weight: 900;
    cursor: pointer;
  }

  .filter-controls button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .status-box {
    margin-bottom: 14px;
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 900;
  }

  .error-box {
    background: #fef2f2;
    color: #b91c1c;
    border: 1px solid #fecaca;
  }

  .hero-section {
    display: grid;
    grid-template-columns: 0.95fr 1.4fr;
    gap: 16px;
    min-height: 310px;
  }

  .cctv-card,
  .map-card,
  .playback-card,
  .metric-card {
    background: #ffffff;
    border: 1px solid #d8dde3;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.06);
  }

  .cctv-card,
  .map-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .card-header {
    height: 54px;
    padding: 10px 14px;
    border-bottom: 1px solid #e2e5e9;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: #ffffff;
  }

  .card-title {
    font-size: 14px;
    font-weight: 800;
    color: #111827;
    line-height: 1.2;
  }

  .card-subtitle {
    margin-top: 3px;
    font-size: 11px;
    color: #6b7280;
    font-weight: 600;
  }

  .live-badge {
    padding: 4px 9px;
    border-radius: 999px;
    background: #dcfce7;
    color: #15803d;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.4px;
  }

  .coordinate-badge {
    padding: 5px 8px;
    background: #f1f5f9;
    border: 1px solid #d7dde5;
    color: #334155;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }

  .cctv-layout {
    flex: 1;
    display: grid;
    grid-template-rows: 1fr 52px;
    gap: 10px;
    padding: 10px;
    min-height: 250px;
  }

  .cctv-main {
    position: relative;
    background:
      linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0)),
      #4f5658;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    overflow: hidden;
  }

  .cctv-main::before {
    content: "";
    position: absolute;
    inset: 0;
    background:
      linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px),
      linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px);
    background-size: 24px 24px;
    opacity: 0.25;
  }

  .cctv-overlay {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    color: white;
  }

  .camera-name {
    font-size: 16px;
    font-weight: 900;
  }

  .camera-status {
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
    font-size: 11px;
    font-weight: 800;
  }

  .cctv-mini-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  .cctv-mini {
    background: #53595b;
    color: white;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-width: 0;
  }

  .cctv-mini span {
    font-size: 12px;
    font-weight: 900;
  }

  .cctv-mini small {
    font-size: 9px;
    font-weight: 700;
    color: #d8dee4;
  }

  .cctv-mini.offline {
    background: #7a7f82;
    color: #e5e7eb;
  }

  .map-panel {
    flex: 1;
    min-height: 250px;
    overflow: hidden;
    position: relative;
    background: #d9d9d9;
  }

  .playback-card {
    margin-top: 14px;
    min-height: 48px;
    padding: 10px 14px;
    display: grid;
    grid-template-columns: 34px 1fr 160px;
    align-items: center;
    gap: 12px;
  }

  .play-button {
    width: 28px;
    height: 28px;
    border: 1px solid #9ab8e8;
    background: #4c8df6;
    color: white;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .play-button:hover {
    background: #2f6fd8;
  }

  .timeline {
    position: relative;
    height: 18px;
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
  }

  .timeline-track {
    position: absolute;
    left: 0;
    right: 0;
    top: 8px;
    height: 3px;
    background: #d5dbe3;
  }

  .timeline-progress {
    position: absolute;
    left: 0;
    top: 8px;
    height: 3px;
    background: #4c8df6;
  }

  .timeline-dot {
    position: absolute;
    top: 3px;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: #4c8df6;
    border: 2px solid white;
    box-shadow: 0 0 0 1px #4c8df6;
    transform: translateX(-50%);
  }

  .timeline-time {
    font-size: 11px;
    font-weight: 700;
    color: #475569;
    text-align: right;
    white-space: nowrap;
  }

  .metric-grid {
    margin-top: 14px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
  }

  .metric-card {
    min-height: 94px;
    padding: 16px 14px;
    text-align: center;
  }

  .metric-label {
    font-size: 12px;
    font-weight: 800;
    color: #475569;
  }

  .metric-value {
    margin-top: 10px;
    font-size: 20px;
    font-weight: 900;
    color: #111827;
    line-height: 1.1;
  }

  .metric-sub {
    margin-top: 8px;
    font-size: 11px;
    font-weight: 600;
    color: #7b8794;
  }

  .weather-card {
    text-align: left;
  }

  .weather-card .metric-value {
    font-size: 18px;
  }

  @media (max-width: 1100px) {
    .filter-card {
      grid-template-columns: 1fr;
    }

    .filter-controls {
      justify-content: flex-start;
    }

    .hero-section {
      grid-template-columns: 1fr;
    }

    .metric-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 700px) {
    .dashboard-content {
      padding: 10px;
    }

    .metric-grid {
      grid-template-columns: 1fr;
    }

    .playback-card {
      grid-template-columns: 34px 1fr;
    }

    .timeline-time {
      grid-column: 1 / -1;
      text-align: left;
    }

    .coordinate-badge {
      display: none;
    }

    .filter-controls input,
    .filter-controls select {
      min-width: 100%;
    }
  }
</style>