<script>
  import { onMount, onDestroy, tick } from "svelte";
  import { browser } from "$app/environment";
  import { getFleetAssets } from "$lib/api/fleetApi.js";
  import { addMapTileLayer } from "$lib/mapStyle.js";
  import { addLeafletZoomAndScale } from "$lib/utils/leafletControls.js";
  import { getAssetIconUrl, getAssetTypeLabel, getAssetTypeValue } from "$lib/utils/assetIcons.js";
  import { addMapZonesToLeafletMap, normalizeMapZonesFromAssets } from "$lib/utils/mapZones.js";
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
    renderKey = 0,
    showTraceLine = false,
    followActivePoint = false
  } = $props();

    let hasInitialTraceFit = false;
    let lastTraceSignature = "";
  let mapContainer;
  let map = null;
  let marker = null;
  let L = null;
  let isMounted = false;
  let mapZones = $state([]);
  let mapAssets = $state([]);
  let assetLegendItems = $derived.by(() => {
    const seenTypes = new Set();

    return mapAssets
      .map((asset) => {
        const typeValue = String(getAssetTypeValue(asset) || "asset").trim().toLowerCase();
        const key = typeValue || "asset";

        if (seenTypes.has(key)) return null;
        seenTypes.add(key);

        return {
          key,
          label: getAssetTypeLabel(asset),
          iconUrl: getAssetIconUrl(asset)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  let traceBaseLayerGroup = null;
  let traceProgressLayerGroup = null;
  let traceMarkerLayerGroup = null;
  let zoneLayerGroup = null;
  let assetMarkerLayerGroup = null;
  let lastDrawnTraceSignature = "";
  let lastProgressTraceIndex = -1;

  const TRACE_SPEED_RANGES = [
    { label: "0–1 kn", min: 0, max: 1, color: "#9ca3af" },
    { label: "1–12 kn", min: 1, max: 12, color: "#ef4444" },
    { label: "12–15 kn", min: 12, max: 15, color: "#f97316" },
    { label: "15–18 kn", min: 15, max: 18, color: "#facc15" },
    { label: "18+ kn", min: 18, max: Infinity, color: "#10b981" }
  ];

  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeMapAsset(asset = {}) {
    const coordinates = asset?.coordinates ?? asset?.polygon ?? asset?.boundary;
    const type = String(asset?.assetType ?? asset?.asset_type ?? asset?.type ?? "").trim().toLowerCase();

    if (type === "zone" || (Array.isArray(coordinates) && coordinates.length >= 3)) return null;

    const latitudeValue = toNumber(asset?.latitude ?? asset?.lat, NaN);
    const longitudeValue = toNumber(asset?.longitude ?? asset?.lng ?? asset?.lon, NaN);

    if (!Number.isFinite(latitudeValue) || !Number.isFinite(longitudeValue)) return null;
    if (latitudeValue === 0 && longitudeValue === 0) return null;

    const id = asset?.id ?? asset?.assetId ?? asset?.asset_id ?? `${latitudeValue},${longitudeValue}`;

    return {
      ...asset,
      id,
      assetId: asset?.assetId ?? asset?.asset_id ?? id,
      assetName: asset?.assetName ?? asset?.asset_name ?? asset?.name ?? `Asset ${id}`,
      assetType: getAssetTypeValue(asset),
      latitude: latitudeValue,
      longitude: longitudeValue
    };
  }

  function getPointLat(point) {
    return toNumber(point?.latitude ?? point?.lat, NaN);
  }

  function getPointLng(point) {
    return toNumber(point?.longitude ?? point?.lng ?? point?.lon, NaN);
  }

  function getPosition() {
    const activeTracePoint = getActiveTracePoint();

    if (activeTracePoint) {
      const traceLat = getPointLat(activeTracePoint);
      const traceLng = getPointLng(activeTracePoint);

      if (Number.isFinite(traceLat) && Number.isFinite(traceLng)) {
        return [traceLat, traceLng];
      }
    }

    return [toNumber(latitude, 0), toNumber(longitude, 0)];
  }

function getActiveTracePoint() {
  if (!showTraceLine || !Array.isArray(tracePoints) || !tracePoints.length) return null;

  const point = tracePoints[Math.max(0, Math.min(activeIndex, tracePoints.length - 1))];
  const lat = getPointLat(point);
  const lng = getPointLng(point);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;

  return point;
}

function getCurrentHeading() {
  const activeTracePoint = getActiveTracePoint();
  return toNumber(activeTracePoint?.heading ?? activeTracePoint?.course ?? heading, 0);
}

function getCurrentSpeed() {
  const activeTracePoint = getActiveTracePoint();

  if (activeTracePoint && activeTracePoint.speed !== undefined) {
    return `${toNumber(activeTracePoint.speed, 0).toFixed(1)} knot`;
  }

  return speed || "-";
}

function getCurrentLastUpdate() {
  const activeTracePoint = getActiveTracePoint();
  return activeTracePoint?.timestamp || activeTracePoint?.timestampRaw || lastUpdate || "-";
}

function getValidTraceLatLngs() {
  if (!Array.isArray(tracePoints)) return [];

  return getValidTracePoints().map((item) => item.latLng);
}

function getValidTracePoints() {
  if (!Array.isArray(tracePoints)) return [];

  return tracePoints
    .map((point, originalIndex) => {
      const lat = getPointLat(point);
      const lng = getPointLng(point);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      if (lat === 0 && lng === 0) return null;

      return {
        point,
        originalIndex,
        latLng: [lat, lng],
        speed: toNumber(point?.speed ?? point?.sog ?? point?.speedOverGround, 0)
      };
    })
    .filter(Boolean);
}

function getTraceSpeedColor(speed) {
  const value = Math.max(0, toNumber(speed, 0));

  if (value <= 1) return TRACE_SPEED_RANGES[0].color;
  if (value <= 12) return TRACE_SPEED_RANGES[1].color;
  if (value <= 15) return TRACE_SPEED_RANGES[2].color;
  if (value <= 18) return TRACE_SPEED_RANGES[3].color;

  return TRACE_SPEED_RANGES[4].color;
}

function drawColoredTraceSegments(
  points,
  {
    layerGroup = traceBaseLayerGroup,
    fromIndex = 1,
    untilIndex = points.length - 1,
    weight = 4,
    opacity = 0.55
  } = {}
) {
  if (!L || !layerGroup || !Array.isArray(points) || points.length < 2) return;

  const firstIndex = Math.max(1, Math.min(fromIndex, points.length - 1));
  const lastIndex = Math.max(firstIndex, Math.min(untilIndex, points.length - 1));

  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const segmentSpeed = current?.speed ?? previous?.speed ?? 0;

    L.polyline([previous.latLng, current.latLng], {
      color: getTraceSpeedColor(segmentSpeed),
      weight,
      opacity,
      lineCap: "round",
      lineJoin: "round"
    }).addTo(layerGroup);
  }
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
          style="transform: rotate(${getCurrentHeading()}deg) scaleX(1.16);"
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
      html: `<div class="trace-finish-marker">E</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -12]
    });
  }

  function createTracePointIcon(speedValue = 0) {
    const color = getTraceSpeedColor(speedValue);

    return L.divIcon({
      className: "trace-point-icon",
      html: `<div class="trace-point-marker" style="--trace-point-color: ${color};"></div>`,
      iconSize: [10, 10],
      iconAnchor: [5, 5]
    });
  }

  function createAssetMarkerIcon(asset) {
    const typeLabel = getAssetTypeLabel(asset);

    return L.divIcon({
      className: "vessel-map-asset-icon",
      html: `
        <img
          class="vessel-map-asset-marker"
          src="${getAssetIconUrl(asset)}"
          alt="${escapeHtml(typeLabel)} asset"
          title="${escapeHtml(asset.assetName)}"
        />
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -18]
    });
  }

  function createAssetPopupHtml(asset) {
    const typeLabel = getAssetTypeLabel(asset);
    const formattedLatitude = toNumber(asset.latitude, 0).toFixed(6);
    const formattedLongitude = toNumber(asset.longitude, 0).toFixed(6);

    return `
      <div class="vessel-map-asset-popup">
        <div class="asset-popup-head">
          <img src="${getAssetIconUrl(asset)}" alt="${escapeHtml(typeLabel)} icon" />
          <div>
            <span>Fleet asset</span>
            <strong>${escapeHtml(asset.assetName)}</strong>
          </div>
          <em>${escapeHtml(typeLabel)}</em>
        </div>

        <div class="asset-popup-grid">
          <div>
            <span>Asset ID</span>
            <strong>${escapeHtml(asset.assetId ?? asset.id ?? "-")}</strong>
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

  function createPopupHtml() {
    const [currentLatitude, currentLongitude] = getPosition();
    const formattedLatitude = toNumber(currentLatitude, 0).toFixed(6);
    const formattedLongitude = toNumber(currentLongitude, 0).toFixed(6);

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
          <strong>${getCurrentSpeed()}</strong>
        </div>

        <div class="vessel-map-popup-row">
          <span>Updated</span>
          <strong>${getCurrentLastUpdate()}</strong>
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

function ensureTraceLayers() {
  if (!map || !L) return;

  if (!traceBaseLayerGroup) traceBaseLayerGroup = L.layerGroup().addTo(map);
  if (!traceProgressLayerGroup) traceProgressLayerGroup = L.layerGroup().addTo(map);
  if (!traceMarkerLayerGroup) traceMarkerLayerGroup = L.layerGroup().addTo(map);
}

function clearTraceLayers() {
  traceBaseLayerGroup?.clearLayers();
  traceProgressLayerGroup?.clearLayers();
  traceMarkerLayerGroup?.clearLayers();
}

    function drawTraceLine() {
    if (!map || !L) return;

    ensureTraceLayers();

    if (!showTraceLine) {
      clearTraceLayers();
      lastDrawnTraceSignature = "";
      lastProgressTraceIndex = -1;
      return;
    }

    const traceSignature = getTraceSignature();
    const needsBaseRedraw = traceSignature !== lastDrawnTraceSignature;

    const validPoints = getValidTracePoints();
    const latLngs = validPoints.map((item) => item.latLng);

    if (latLngs.length < 2) {
      clearTraceLayers();
      lastDrawnTraceSignature = traceSignature;
      lastProgressTraceIndex = -1;
      return;
    }

    const passedIndex = Math.max(
      0,
      validPoints.findLastIndex((item) => item.originalIndex <= activeIndex)
    );

    if (needsBaseRedraw) {
      traceBaseLayerGroup.clearLayers();
      traceMarkerLayerGroup.clearLayers();
      traceProgressLayerGroup.clearLayers();
      lastProgressTraceIndex = -1;

      drawColoredTraceSegments(validPoints, {
        layerGroup: traceBaseLayerGroup,
        untilIndex: validPoints.length - 1,
        weight: 4,
        opacity: 0.58
      });

      L.marker(latLngs[0], {
        icon: createStartIcon(),
        zIndexOffset: 800
      })
        .bindPopup("Start")
        .addTo(traceMarkerLayerGroup);

      L.marker(latLngs[latLngs.length - 1], {
        icon: createFinishIcon(),
        zIndexOffset: 800
      })
        .bindPopup("Finish")
        .addTo(traceMarkerLayerGroup);

      const pointStep = Math.max(1, Math.floor(latLngs.length / 80));

      latLngs.forEach((latLng, index) => {
        if (index !== 0 && index !== latLngs.length - 1 && index % pointStep === 0) {
          L.marker(latLng, {
            icon: createTracePointIcon(validPoints[index]?.speed),
            interactive: false,
            zIndexOffset: 400
          }).addTo(traceMarkerLayerGroup);
        }
      });

      lastDrawnTraceSignature = traceSignature;
    }

    if (passedIndex !== lastProgressTraceIndex) {
      traceProgressLayerGroup.clearLayers();

      if (passedIndex > 0) {
        drawColoredTraceSegments(validPoints, {
          layerGroup: traceProgressLayerGroup,
          fromIndex: Math.max(1, passedIndex - 10),
          untilIndex: passedIndex,
          weight: 7,
          opacity: 0.98
        });
      }

      lastProgressTraceIndex = passedIndex;
    }
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
    if (showTraceLine) {
      map.panTo([lat, lng], {
        animate: true,
        duration: 0.35
      });
    } else {
      map.setView([lat, lng], zoom);
    }
  }
}

function refreshMap() {
  if (!map || !L) return;

  resetTraceFitIfNeeded();

  drawTraceLine();

  updateMarker({
    autoCenter: followActivePoint || !showTraceLine || getValidTraceLatLngs().length < 2
  });

  fitTraceBoundsOnce();

  setTimeout(() => {
    if (!map) return;
    map.invalidateSize();
  }, 80);
}

function rebuildZoneLayer() {
  if (!map || !L) return;

  if (zoneLayerGroup) {
    zoneLayerGroup.clearLayers();
    zoneLayerGroup.remove();
    zoneLayerGroup = null;
  }

  zoneLayerGroup = addMapZonesToLeafletMap(L, map, mapZones, {
    paneName: "vesselMapZonePane",
    zIndex: 355
  });
}

function rebuildAssetMarkerLayer() {
  if (!map || !L) return;

  if (!assetMarkerLayerGroup) {
    assetMarkerLayerGroup = L.layerGroup().addTo(map);
  }

  assetMarkerLayerGroup.clearLayers();

  mapAssets.forEach((asset) => {
    L.marker([asset.latitude, asset.longitude], {
      icon: createAssetMarkerIcon(asset),
      zIndexOffset: 520
    })
      .bindTooltip(escapeHtml(asset.assetName), {
        direction: "top",
        className: "vessel-map-asset-tooltip"
      })
      .bindPopup(createAssetPopupHtml(asset), {
        closeButton: true,
        autoPan: true,
        maxWidth: 300,
        className: "vessel-map-asset-popup-wrapper"
      })
      .addTo(assetMarkerLayerGroup);
  });
}

async function loadMapAssetsAndZones() {
  try {
    const assets = await getFleetAssets();
    if (!isMounted) return;

    mapZones = normalizeMapZonesFromAssets(assets);
    mapAssets = (Array.isArray(assets) ? assets : []).map(normalizeMapAsset).filter(Boolean);
    rebuildZoneLayer();
    rebuildAssetMarkerLayer();
  } catch (error) {
    console.error("[VESSEL_MAP_ASSETS_ERROR]", error);
    mapZones = [];
    mapAssets = [];
    rebuildZoneLayer();
    rebuildAssetMarkerLayer();
  }
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

    addMapTileLayer(L, map);
    addLeafletZoomAndScale(L, map);

    rebuildZoneLayer();
    ensureTraceLayers();
    container.addEventListener("click", handleCoordinateCopyClick, true);

    loadMapAssetsAndZones();
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
  followActivePoint;

  if (!map || !L) return;

  refreshMap();
});

  onDestroy(() => {
    isMounted = false;

    if (traceBaseLayerGroup) {
      traceBaseLayerGroup.clearLayers();
      traceBaseLayerGroup.remove();
      traceBaseLayerGroup = null;
    }

    if (traceProgressLayerGroup) {
      traceProgressLayerGroup.clearLayers();
      traceProgressLayerGroup.remove();
      traceProgressLayerGroup = null;
    }

    if (traceMarkerLayerGroup) {
      traceMarkerLayerGroup.clearLayers();
      traceMarkerLayerGroup.remove();
      traceMarkerLayerGroup = null;
    }

    if (zoneLayerGroup) {
      zoneLayerGroup.clearLayers();
      zoneLayerGroup.remove();
      zoneLayerGroup = null;
    }

    if (assetMarkerLayerGroup) {
      assetMarkerLayerGroup.clearLayers();
      assetMarkerLayerGroup.remove();
      assetMarkerLayerGroup = null;
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

<div class="vessel-map-shell">
  <div class="vessel-map-root" bind:this={mapContainer}></div>
  {#if showTraceLine}
    <div class="trace-speed-legend" aria-label="Trace speed legend">
      {#each TRACE_SPEED_RANGES as range}
        <span>
          <i style={`--trace-speed-color: ${range.color};`} aria-hidden="true"></i>
          {range.label}
        </span>
      {/each}
    </div>
  {/if}
  {#if mapZones.length || assetLegendItems.length}
    <div class="vessel-map-map-legend" aria-label="Map legend">
      {#if assetLegendItems.length}
        <div class="legend-group">
          <span class="legend-title">Assets</span>
          <div class="legend-items asset-items">
            {#each assetLegendItems as asset}
              <span>
                <img src={asset.iconUrl} alt="" aria-hidden="true" />
                {asset.label}
              </span>
            {/each}
          </div>
        </div>
      {/if}

      {#if mapZones.length}
        <div class="legend-group">
          <span class="legend-title">Zones</span>
          <div class="legend-items zone-items">
            {#each mapZones as zone}
              <span>
                <i
                  style={`--zone-color: ${zone.color}; --zone-fill: ${zone.fillColor};`}
                  aria-hidden="true"
                ></i>
                {zone.name}
              </span>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .vessel-map-shell {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 260px;
  }

  .vessel-map-root {
    width: 100%;
    height: 100%;
    min-height: 260px;
    background: var(--color-accent-muted);
  }

  .vessel-map-map-legend {
    position: absolute;
    left: 10px;
    bottom: 10px;
    z-index: 720;
    display: grid;
    gap: 8px;
    width: min(360px, calc(100% - 20px));
    max-height: min(42%, 220px);
    padding: 8px;
    border: 1px solid rgba(96, 165, 250, 0.24);
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.7);
    color: #e2e8f0;
    box-shadow: 0 12px 26px rgba(15, 23, 42, 0.24);
    backdrop-filter: blur(10px);
    pointer-events: none;
    overflow: auto;
  }

  .legend-group {
    display: grid;
    gap: 5px;
  }

  .legend-title {
    color: #9fb4d2;
    font-size: 9px;
    font-weight: 850;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .legend-items {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 10px;
  }

  .legend-items span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    font-weight: 800;
    white-space: nowrap;
  }

  .asset-items img {
    width: 18px;
    height: 18px;
    object-fit: contain;
    filter:
      drop-shadow(0 0 2px rgba(255, 255, 255, 0.86))
      drop-shadow(0 3px 5px rgba(15, 23, 42, 0.24));
  }

  .zone-items i {
    width: 20px;
    height: 14px;
    border: 2px dashed var(--zone-color, #38bdf8);
    border-radius: 5px;
    background: color-mix(in srgb, var(--zone-fill, #0ea5e9) 24%, transparent);
  }

  @media (max-width: 760px) {
    .vessel-map-map-legend {
      width: min(280px, calc(100% - 20px));
      max-height: 156px;
      padding: 7px;
      gap: 6px;
    }

    .legend-items {
      gap: 5px 8px;
    }

    .legend-items span {
      font-size: 9px;
    }

    .asset-items img {
      width: 16px;
      height: 16px;
    }
  }

  .trace-speed-legend {
    position: absolute;
    right: 12px;
    bottom: 12px;
    z-index: 735;
    display: grid;
    gap: 4px;
    min-width: 96px;
    padding: 8px 10px;
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.74);
    color: #e2e8f0;
    box-shadow: 0 14px 28px rgba(15, 23, 42, 0.24);
    backdrop-filter: blur(10px);
    pointer-events: none;
  }

  .trace-speed-legend span {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    align-items: center;
    gap: 7px;
    font-size: 10px;
    font-weight: 750;
    line-height: 1.2;
    white-space: nowrap;
  }

  .trace-speed-legend i {
    width: 18px;
    height: 8px;
    border-radius: 2px;
    background: var(--trace-speed-color, #94a3b8);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12) inset;
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

  :global(.vessel-map-asset-icon) {
    background: transparent;
    border: none;
  }

  :global(.vessel-map-asset-marker) {
    width: 34px;
    height: 34px;
    object-fit: contain;
    display: block;
    filter:
      drop-shadow(0 0 3px rgba(255, 255, 255, 0.92))
      drop-shadow(0 6px 10px rgba(15, 23, 42, 0.28));
  }

  :global(.vessel-map-asset-tooltip) {
    border: 1px solid rgba(245, 158, 11, 0.28);
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.88);
    color: #f8fafc;
    font-size: 10px;
    font-weight: 800;
    box-shadow: 0 10px 20px rgba(15, 23, 42, 0.28);
  }

  :global(.vessel-map-asset-popup-wrapper .leaflet-popup-content-wrapper) {
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 16px;
    background: rgba(15, 23, 42, 0.94);
    color: #f8fafc;
    box-shadow: 0 18px 36px rgba(15, 23, 42, 0.36);
    overflow: hidden;
  }

  :global(.vessel-map-asset-popup-wrapper .leaflet-popup-content) {
    margin: 0;
    width: 260px !important;
  }

  :global(.vessel-map-asset-popup-wrapper .leaflet-popup-tip) {
    background: rgba(15, 23, 42, 0.94);
  }

  :global(.vessel-map-asset-popup) {
    display: grid;
    gap: 10px;
    padding: 12px;
  }

  :global(.vessel-map-asset-popup .asset-popup-head) {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    gap: 9px;
    align-items: center;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  }

  :global(.vessel-map-asset-popup .asset-popup-head img) {
    width: 30px;
    height: 30px;
    object-fit: contain;
  }

  :global(.vessel-map-asset-popup .asset-popup-head span),
  :global(.vessel-map-asset-popup .asset-popup-grid span) {
    display: block;
    color: #9fb4d2;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  :global(.vessel-map-asset-popup .asset-popup-head strong) {
    display: block;
    margin-top: 2px;
    color: #f8fafc;
    font-size: 14px;
    font-weight: 850;
    line-height: 1.15;
  }

  :global(.vessel-map-asset-popup .asset-popup-head em) {
    padding: 5px 8px;
    border: 1px solid rgba(245, 158, 11, 0.36);
    border-radius: 999px;
    background: rgba(245, 158, 11, 0.13);
    color: #fbbf24;
    font-size: 10px;
    font-style: normal;
    font-weight: 850;
    text-transform: uppercase;
  }

  :global(.vessel-map-asset-popup .asset-popup-grid) {
    display: grid;
    gap: 8px;
  }

  :global(.vessel-map-asset-popup .asset-popup-grid > div) {
    display: grid;
    gap: 4px;
    padding: 8px 10px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 10px;
    background: rgba(15, 23, 42, 0.42);
  }

  :global(.vessel-map-asset-popup .asset-popup-grid strong) {
    color: #f8fafc;
    font-size: 13px;
    font-weight: 850;
  }

  :global(.vessel-map-asset-popup .coordinate-copy-inline) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: #f8fafc;
  }

  :global(.vessel-map-asset-popup .coordinate-copy-button) {
    width: 24px;
    height: 24px;
    border: 1px solid rgba(96, 165, 250, 0.42);
    border-radius: 8px;
    background: rgba(37, 99, 235, 0.2);
    color: #bfdbfe;
    cursor: pointer;
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
    background: var(--trace-point-color, #9ca3af);
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

</style>
