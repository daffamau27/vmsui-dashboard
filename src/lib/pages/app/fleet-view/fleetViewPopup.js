import { createCopyableCoordinateHtml } from '$lib/utils/coordinateClipboard.js';
import {
	formatActualLastUpdated,
	formatDmsCoordinate,
	formatNumber,
	formatValue
} from './fleetViewFormat.js';

export function createFleetPopupHtml(vessel) {
	const latitude = vessel.latitude ?? vessel.lat;
	const longitude = vessel.longitude ?? vessel.lng;
	const formattedLatitude = formatNumber(latitude, 6, '-');
	const formattedLongitude = formatNumber(longitude, 6, '-');
	const formattedLatitudeDms = formatDmsCoordinate(latitude, 'lat');
	const formattedLongitudeDms = formatDmsCoordinate(longitude, 'lng');

	return `
      <div class="fleet-popup">
        <div class="fleet-popup-hero">
          <div class="fleet-popup-heading">
            <span class="fleet-popup-eyebrow">Vessel overview</span>
            <strong>${formatValue(vessel.name)}</strong>
            <small>${formatValue(vessel.companyName)}</small>
          </div>
          <span class="fleet-popup-status ${vessel.online ? 'is-online' : 'is-offline'}">
            ${vessel.online ? 'Online' : 'Offline'}
          </span>
        </div>

        <div class="fleet-popup-metrics">
          <div class="fleet-popup-metric">
          <span>Speed</span>
          <strong>${formatNumber(vessel.speed, 1, '0.0')} <small>kt</small></strong>
          </div>

          <div class="fleet-popup-metric">
          <span>Heading</span>
          <strong>${formatNumber(vessel.heading, 1, '0.0')}<small>°</small></strong>
          </div>
        </div>

        <div class="fleet-popup-coordinates">
          <div>
            <span>Latitude</span>
            ${createCopyableCoordinateHtml(formattedLatitude, 'latitude')}
            <small class="coordinate-dms">${formattedLatitudeDms}</small>
          </div>
          <div>
            <span>Longitude</span>
            ${createCopyableCoordinateHtml(formattedLongitude, 'longitude')}
            <small class="coordinate-dms">${formattedLongitudeDms}</small>
          </div>
        </div>

        <div class="fleet-popup-meta">
          <div class="fleet-popup-row">
            <span>Last updated</span>
            <strong>${formatActualLastUpdated(vessel.lastUpdated)}</strong>
          </div>
        </div>

        <div class="fleet-popup-actions">
        <button
            type="button"
            class="fleet-popup-detail-btn"
            data-action="detail"
            data-vessel-id="${vessel.id}"
        >
            View detail
        </button>

        <button
            type="button"
            class="fleet-popup-dashboard-btn"
            data-action="dashboard"
            data-vessel-id="${vessel.id}"
        >
            Dashboard
        </button>
        </div>
      </div>
    `;
}
