import { apiRequest } from "$lib/api/authApi.js";

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeEngine(item) {
  return {
    id: item?.id,
    vesselId: item?.vesselId,
    engineKeyThingsboard: item?.engineKeyThingsboard || "",
    engineName: item?.engineName || "-",

    // Alias agar mudah dipakai di halaman report
    key: item?.engineKeyThingsboard || "",
    name: item?.engineName || "-"
  };
}

function normalizeFleetVessel(item) {
  return {
    id: String(item?.id ?? item?.vesselId),
    vesselId: item?.id ?? item?.vesselId,
    dbId: item?.id ?? item?.vesselId,

    deviceId: item?.deviceId || "",

    name:
      item?.vesselName ||
      item?.deviceName ||
      item?.name ||
      "-",

    vesselName:
      item?.vesselName ||
      item?.deviceName ||
      item?.name ||
      "-",

    deviceName:
      item?.deviceName ||
      item?.vesselName ||
      item?.name ||
      "-",

    companyId: item?.companyId ?? null,
    companyName: item?.companyName || "-",

    lat: toNumber(item?.latitude ?? item?.lat, 0),
    lng: toNumber(item?.longitude ?? item?.lng, 0),
    latitude: toNumber(item?.latitude ?? item?.lat, 0),
    longitude: toNumber(item?.longitude ?? item?.lng, 0),

    speed: toNumber(item?.speed, 0),
    heading: toNumber(item?.heading, 0),
    online:
      item?.online === true
        ? true
        : item?.online === false
          ? false
          : null,

    hireStatus: item?.hireStatus ?? item?.hire_status ?? "-",
    lastUpdated: item?.lastUpdated || "-",
    lastConnectTime: item?.lastConnectTime || "-",
    lastDisconnectTime: item?.lastDisconnectTime || "-",

    voyageProgress: item?.voyageProgress || null,
    engines: Array.isArray(item?.engines) ? item.engines : [],
    weather: item?.weather || null,
    oceanCurrent: item?.oceanCurrent || null,

    raw: item
  };
}

export async function getFleetVessels({ search = '', status = '' } = {}) {
	const params = new URLSearchParams();

	if (search) params.set('search', search);
	if (status && status !== 'all') params.set('status', status);

	const query = params.toString();
	const endpoint = query ? `/fleet/vessels?${query}` : '/fleet/vessels';

	const response = await apiRequest(endpoint, {
		method: 'GET',
		headers: {
			accept: 'application/json'
		}
	});

	return response?.data ?? [];
}

function normalizeLiveVessel(item) {
  const vesselId = item?.vesselId ?? item?.id;

  return {
    id: String(vesselId),
    vesselId,
    dbId: vesselId,

    name: item?.vesselName || item?.name || "-",
    vesselName: item?.vesselName || item?.name || "-",
    deviceId: item?.deviceId || "",

    companyName: item?.companyName || "-",

    latitude: toNumber(item?.latitude, null),
    longitude: toNumber(item?.longitude, null),
    lat: toNumber(item?.latitude, null),
    lng: toNumber(item?.longitude, null),

    speed: toNumber(item?.speed, null),
    heading: toNumber(item?.heading, null),
    online: item?.online === undefined || item?.online === null ? null : Boolean(item.online),

    hireStatus: item?.hireStatus ?? item?.hire_status ?? "-",
    lastConnectTime: item?.lastConnectTime || "-",
    lastDisconnectTime: item?.lastDisconnectTime || "-",
    lastUpdated: item?.lastUpdated || "-",

    voyageProgress: item?.voyageProgress || null,

    // Ini engine live RPM dari ThingsBoard
    liveEngines: Array.isArray(item?.engines) ? item.engines : [],

    weather: item?.weather || null,
    oceanCurrent: item?.oceanCurrent || null,

    rawLive: item
  };
}

export async function getFleetVesselLiveDetail(id) {
	if (!id) throw new Error('Vessel ID is required');

	const response = await apiRequest(`/fleet/vessels/${id}`, {
		method: 'GET',
		headers: {
			accept: 'application/json'
		}
	});

	return response?.data ?? null;
}

export async function getFleetVesselDetail(vesselId) {
  const response = await apiRequest(`/vessels/${vesselId}`, {
    method: "GET"
  });

  const data = response?.data || response;

  return normalizeFleetVessel(data);
}

export async function getFleetVesselsWithEngines() {
  const vessels = await getFleetVessels();

  const rows = await Promise.all(
    vessels.map(async (vessel) => {
      try {
        const detail = await getFleetVesselLiveDetail(vessel.vesselId);

        return {
          ...vessel,
          ...detail,

          id: String(vessel.vesselId),
          vesselId: vessel.vesselId,
          dbId: vessel.dbId ?? vessel.vesselId,

          deviceId: detail?.deviceId || vessel.deviceId,
          name: detail?.vesselName || vessel.vesselName || vessel.name,
          vesselName: detail?.vesselName || vessel.vesselName || vessel.name,

          engines: Array.isArray(detail?.engines)
            ? detail.engines
            : Array.isArray(vessel?.engines)
              ? vessel.engines
              : [],

          raw: {
            vessel,
            detail
          }
        };
      } catch (error) {
        console.error("[FLEET_API][LIVE_DETAIL_ERROR]", vessel, error);
        return vessel;
      }
    })
  );

  return rows;
}

export async function getFleetAssets() {
	const response = await apiRequest('/assets', {
		method: 'GET',
		headers: {
			accept: 'application/json'
		}
	});

	return response?.data ?? [];
}
