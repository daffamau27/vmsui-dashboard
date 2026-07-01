<script>
  import { onMount, onDestroy, tick } from "svelte";
  import { browser } from "$app/environment";
  import { VMS_TILE_URL, VMS_TILE_OPTIONS } from "$lib/mapStyle.js";
  import {
    createCopyableCoordinateHtml,
    handleCoordinateCopyClick
  } from "$lib/utils/coordinateClipboard.js";

  let {
    latitude = 0,
    longitude = 0,
    heading = 0,
    vesselName = "Vessel",
    speed = "-",
    lastUpdate = "-",
    iconUrl = "/assets/vessel.png",
    zoom = 12,
    tracePoints = [],
    activeIndex = 0,
    showTraceLine = false
  } = $props();

    let hasInitialTraceFit = false;
    let lastTraceSignature = "";
  let mapContainer;
  let map = null;
  let marker = null;
  let L = null;
  let isMounted = false;

  let traceLayerGroup = null;

  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function getPointLat(point) {
    return toNumber(point?.latitude ?? point?.lat, NaN);
  }

  function getPointLng(point) {
    return toNumber(point?.longitude ?? point?.lng ?? point?.lon, NaN);
  }

  function getPosition() {
    return [toNumber(latitude, 0), toNumber(longitude, 0)];
  }

function getValidTraceLatLngs() {
  if (!Array.isArray(tracePoints)) return [];

  return tracePoints
    .map((point) => {
      const lat = getPointLat(point);
      const lng = getPointLng(point);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      if (lat === 0 && lng === 0) return null;

      return [lat, lng];
    })
    .filter(Boolean);
}

function getTraceSignature() {
  const latLngs = getValidTraceLatLngs();

  if (!latLngs.length) return "empty";

  const first = latLngs[0];
  const last = latLngs[latLngs.length - 1];

  return `${latLngs.length}:${first[0]},${first[1]}:${last[0]},${last[1]}`;
}

function resetTraceFitIfNeeded() {
  const signature = getTraceSignature();

  if (signature !== lastTraceSignature) {
    lastTraceSignature = signature;
    hasInitialTraceFit = false;
  }
}

  function createVesselIcon() {
    if (!L) return null;

    return L.divIcon({
      className: "vessel-map-leaflet-icon",
      html: `
        <img
          class="vessel-map-marker-icon"
          src="${iconUrl}"
          alt="${vesselName}"
          style="transform: rotate(${toNumber(heading, 0)}deg) scaleX(1.16);"
        />
      `,
      iconSize: [28, 60],
      iconAnchor: [14, 30],
      popupAnchor: [0, -32]
    });
  }

  function createStartIcon() {
    return L.divIcon({
      className: "trace-start-icon",
      html: `<div class="trace-start-marker">S</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -12]
    });
  }

  function createFinishIcon() {
    return L.divIcon({
      className: "trace-finish-icon",
      html: `<div class="trace-finish-marker">F</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -12]
    });
  }

  function createTracePointIcon() {
    return L.divIcon({
      className: "trace-point-icon",
      html: `<div class="trace-point-marker"></div>`,
      iconSize: [10, 10],
      iconAnchor: [5, 5]
    });
  }

  function createPopupHtml() {
    const formattedLatitude = toNumber(latitude, 0).toFixed(6);
    const formattedLongitude = toNumber(longitude, 0).toFixed(6);

    return `
      <div class="vessel-map-popup">
        <div class="vessel-map-popup-title">${vesselName || "Vessel"}</div>

        <div class="vessel-map-popup-row">
          <span>Latitude</span>
          ${createCopyableCoordinateHtml(formattedLatitude, "latitude")}
        </div>

        <div class="vessel-map-popup-row">
          <span>Longitude</span>
          ${createCopyableCoordinateHtml(formattedLongitude, "longitude")}
        </div>

        <div class="vessel-map-popup-row">
          <span>Heading</span>
          <strong>${toNumber(heading, 0).toFixed(1)}°</strong>
        </div>

        <div class="vessel-map-popup-row">
          <span>Speed</span>
          <strong>${speed || "-"}</strong>
        </div>

        <div class="vessel-map-popup-row">
          <span>Updated</span>
          <strong>${lastUpdate || "-"}</strong>
        </div>
      </div>
    `;
  }

  async function waitForMapContainer(maxRetry = 20) {
    for (let i = 0; i < maxRetry; i += 1) {
      await tick();

      if (mapContainer) {
        return mapContainer;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return null;
  }

    function drawTraceLine() {
    if (!map || !L) return;

    if (!traceLayerGroup) {
        traceLayerGroup = L.layerGroup().addTo(map);
    }

    traceLayerGroup.clearLayers();

    if (!showTraceLine) return;

    const latLngs = getValidTraceLatLngs();

    console.log("[VESSEL_MAP_TRACE_LATLNGS]", latLngs.length);

    if (latLngs.length < 2) return;

    const passedIndex = Math.max(0, Math.min(activeIndex, latLngs.length - 1));
    const passedLatLngs = latLngs.slice(0, passedIndex + 1);

    const fullLine = L.polyline(latLngs, {
        color: "#60a5fa",
        weight: 4,
        opacity: 0.55,
        lineCap: "round",
        lineJoin: "round"
    });

    fullLine.addTo(traceLayerGroup);

    if (passedLatLngs.length > 1) {
        const activeLine = L.polyline(passedLatLngs, {
        color: "#2563eb",
        weight: 5,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round"
        });

        activeLine.addTo(traceLayerGroup);
    }

    L.marker(latLngs[0], {
        icon: createStartIcon(),
        zIndexOffset: 800
    })
        .bindPopup("Start")
        .addTo(traceLayerGroup);

    L.marker(latLngs[latLngs.length - 1], {
        icon: createFinishIcon(),
        zIndexOffset: 800
    })
        .bindPopup("Finish")
        .addTo(traceLayerGroup);

    const pointStep = Math.max(1, Math.floor(latLngs.length / 80));

    latLngs.forEach((latLng, index) => {
        if (index !== 0 && index !== latLngs.length - 1 && index % pointStep === 0) {
        L.marker(latLng, {
            icon: createTracePointIcon(),
            interactive: false,
            zIndexOffset: 400
        }).addTo(traceLayerGroup);
        }
    });
    }

function fitTraceBoundsOnce() {
  if (!map || !L) return;
  if (!showTraceLine) return;
  if (hasInitialTraceFit) return;

  const latLngs = getValidTraceLatLngs();

  if (latLngs.length < 2) return;

  const bounds = L.latLngBounds(latLngs);

  map.fitBounds(bounds, {
    padding: [28, 28],
    maxZoom: zoom
  });

  hasInitialTraceFit = true;
}

function updateMarker({ autoCenter = false } = {}) {
  if (!map || !L) return;

  const [lat, lng] = getPosition();

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const icon = createVesselIcon();

  if (!marker) {
    marker = L.marker([lat, lng], {
      icon,
      zIndexOffset: 1000
    }).addTo(map);

    marker.bindPopup(createPopupHtml(), {
      closeButton: true,
      autoPan: true,
      maxWidth: 260,
      className: "vessel-map-popup-wrapper"
    });
  } else {
    marker.setLatLng([lat, lng]);
    marker.setIcon(icon);
    marker.setPopupContent(createPopupHtml());
  }

  if (autoCenter) {
    map.setView([lat, lng], zoom);
  }
}

function refreshMap() {
  if (!map || !L) return;

  resetTraceFitIfNeeded();

  drawTraceLine();

  updateMarker({
    autoCenter: !showTraceLine || getValidTraceLatLngs().length < 2
  });

  fitTraceBoundsOnce();

  setTimeout(() => {
    if (!map) return;
    map.invalidateSize();
  }, 80);
}

  onMount(async () => {
    if (!browser) return;

    isMounted = true;

    const container = await waitForMapContainer();

    if (!isMounted || !container) {
      console.warn("[VESSEL_MAP] mapContainer not ready");
      return;
    }

    L = await import("leaflet");
    await import("leaflet/dist/leaflet.css");

    if (!isMounted || !container) return;

    const [lat, lng] = getPosition();

    map = L.map(container, {
      zoomControl: false,
      attributionControl: false
    }).setView([lat, lng], zoom);

    L.tileLayer(VMS_TILE_URL, VMS_TILE_OPTIONS).addTo(map);

    traceLayerGroup = L.layerGroup().addTo(map);
    container.addEventListener("click", handleCoordinateCopyClick, true);

    refreshMap();

    setTimeout(() => {
      refreshMap();
    }, 250);
  });

$effect(() => {
  latitude;
  longitude;
  heading;
  vesselName;
  speed;
  lastUpdate;
  iconUrl;
  zoom;
  tracePoints;
  activeIndex;
  showTraceLine;

  if (!map || !L) return;

  refreshMap();
});

  onDestroy(() => {
    isMounted = false;

    if (traceLayerGroup) {
      traceLayerGroup.clearLayers();
      traceLayerGroup.remove();
      traceLayerGroup = null;
    }

    if (marker) {
      marker.remove();
      marker = null;
    }

    if (mapContainer) {
      mapContainer.removeEventListener("click", handleCoordinateCopyClick, true);
    }

    if (map) {
      map.remove();
      map = null;
    }
  });
</script>

<div class="vessel-map-root" bind:this={mapContainer}></div>

<style>
  .vessel-map-root {
    width: 100%;
    height: 100%;
    min-height: 260px;
    background: var(--color-accent-muted);
  }

  :global(.vessel-map-leaflet-icon) {
    background: transparent;
    border: none;
  }

  :global(.vessel-map-marker-icon) {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    transform-origin: center center;
    filter:
      drop-shadow(0 0 4px rgba(255, 255, 255, 0.92))
      drop-shadow(0 8px 14px rgba(15, 23, 42, 0.28));
  }

  :global(.trace-start-icon),
  :global(.trace-finish-icon),
  :global(.trace-point-icon) {
    background: transparent;
    border: none;
  }

  :global(.trace-start-marker),
  :global(.trace-finish-marker) {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    color: #ffffff;
    font-size: 10px;
    font-weight: 900;
    border: 2px solid #ffffff;
    box-shadow: 0 4px 10px rgba(15, 23, 42, 0.26);
  }

  :global(.trace-start-marker) {
    background: #16a34a;
  }

  :global(.trace-finish-marker) {
    background: #dc2626;
  }

  :global(.trace-point-marker) {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: #2563eb;
    border: 2px solid #ffffff;
    box-shadow: 0 2px 5px rgba(15, 23, 42, 0.22);
  }

  :global(.vessel-map-popup-wrapper .leaflet-popup-content-wrapper) {
    background: #0f172a;
    color: #f8fafc;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.32);
    box-shadow:
      0 14px 28px rgba(2, 6, 23, 0.28),
      0 1px 4px rgba(15, 23, 42, 0.18);
    overflow: hidden;
  }

  :global(.vessel-map-popup-wrapper .leaflet-popup-content) {
    margin: 0;
    width: 224px !important;
  }

  :global(.vessel-map-popup-wrapper .leaflet-popup-tip) {
    background: #0f172a;
    border: 1px solid rgba(148, 163, 184, 0.32);
  }

  :global(.vessel-map-popup-wrapper .leaflet-popup-close-button) {
    color: rgba(226, 232, 240, 0.82) !important;
    font-size: 18px !important;
    font-weight: 700 !important;
    padding: 6px 8px 0 0 !important;
  }

  :global(.vessel-map-popup-wrapper .leaflet-popup-close-button:hover) {
    color: #ffffff !important;
  }

  :global(.vessel-map-popup-title) {
    padding: 9px 12px;
    background:
      linear-gradient(135deg, rgba(37, 99, 235, 0.22), rgba(96, 165, 250, 0.04)),
      #111827;
    color: #f8fafc;
    font-size: 12.5px;
    font-weight: 800;
    line-height: 1.2;
    letter-spacing: 0.01em;
    border-bottom: 1px solid rgba(148, 163, 184, 0.22);
    padding-right: 34px;
  }

  :global(.vessel-map-popup-row) {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    background: #0f172a;
    border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  }

  :global(.vessel-map-popup-row:last-child) {
    border-bottom: none;
  }

  :global(.vessel-map-popup-row span) {
    color: #94a3b8;
    font-size: 9px;
    font-weight: 700;
  }

  :global(.vessel-map-popup-row strong) {
    color: #f8fafc;
    font-size: 9.5px;
    font-weight: 700;
    text-align: right;
  }

  :global(.vessel-map-popup-row .coordinate-copy-inline) {
    justify-content: flex-end;
  }

  :global(.leaflet-control-zoom) {
    display: none !important;
  }
</style>
