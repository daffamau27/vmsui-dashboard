<script>
  import { onMount } from "svelte";
  import {
    selectedVesselId,
    selectedVesselInfo
  } from "$lib/stores/selectedVessel.svelte.js";
  import {
    getPeriodicalReportData,
    getPeriodicalReportExcelUrl
  } from "$lib/api/periodicalReportApi.js";
  import { downloadApiFile } from "$lib/api/authApi.js";

  let loading = $state(false);
  let exporting = $state(false);
  let error = $state("");
  let reportData = $state(null);

  let startDateTime = $state("");
  let endDateTime = $state("");
  let timezoneMode = $state("auto");
  let timezoneOffset = $state("+07:00");

    let { active = false } = $props();
    let loadedKeys = $state({});
    let lastLoadedVesselId = $state(null);

$effect(() => {
  const vesselId = $selectedVesselId;

  if (!vesselId) return;
  if (vesselId === lastLoadedVesselId) return;

  lastLoadedVesselId = vesselId;
  loadPeriodicalReport();
});

  const engineKeys = ["ae_port", "ae_stbd", "me_port", "me_stbd"];

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

  function formatNumber(value, digits = 1, fallback = "-") {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;

    return number.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function formatRuntimeFromMinutes(minutes) {
    const totalMinutes = Number(minutes);
    if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return "0h 0m";

    const h = Math.floor(totalMinutes / 60);
    const m = Math.round(totalMinutes % 60);

    return `${h}h ${m}m`;
  }

  function pickArray(...values) {
    for (const value of values) {
      if (Array.isArray(value)) return value;
    }

    return [];
  }

  function parseTimestamp(value) {
    if (!value) return null;

    if (/^\d+$/.test(String(value))) {
      const date = new Date(Number(value));
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const cleaned = String(value)
      .replace(/\s*\(UTC[+-]?\d+\)\s*/i, "")
      .replace(" ", "T");

    const date = new Date(cleaned);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getDateKey(row) {
    const raw =
      row?.timestamp_utc ||
      row?.timestamp ||
      row?.ts ||
      row?.time ||
      row?.datetime;

    const date = parseTimestamp(raw);

    if (!date) return "-";

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function formatDateLabel(dateKey) {
    if (!dateKey || dateKey === "-") return "-";

    const date = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateKey;

    return date.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function getDayName(dateKey) {
    if (!dateKey || dateKey === "-") return "-";

    const date = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleDateString("id-ID", {
      weekday: "short"
    });
  }

  function getNumber(row, key) {
    const value = Number(row?.[key]);
    return Number.isFinite(value) ? value : null;
  }

  function isRunOn(value) {
    return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
  }

  function calculateFuelDelta(rows, key) {
    const values = rows
      .map((row) => getNumber(row, key))
      .filter((value) => Number.isFinite(value));

    if (values.length < 2) return 0;

    const min = Math.min(...values);
    const max = Math.max(...values);

    return Math.max(0, max - min);
  }

  function countRunMinutes(rows, key) {
    return rows.reduce((total, row) => total + (isRunOn(row?.[key]) ? 1 : 0), 0);
  }

  function average(values) {
    const numeric = values.filter((value) => Number.isFinite(value));
    if (!numeric.length) return null;

    return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
  }

  function aggregateRowsByDate(rows) {
    const grouped = new Map();

    rows.forEach((row) => {
      const dateKey = getDateKey(row);

      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }

      grouped.get(dateKey).push(row);
    });

    return Array.from(grouped.entries())
      .map(([dateKey, dayRows]) => {
        const speeds = dayRows
          .map((row) => getNumber(row, "speed"))
          .filter((value) => Number.isFinite(value));

        const runtime = {
          ae_port: countRunMinutes(dayRows, "ae_port_run"),
          ae_stbd: countRunMinutes(dayRows, "ae_stbd_run"),
          me_port: countRunMinutes(dayRows, "me_port_run"),
          me_stbd: countRunMinutes(dayRows, "me_stbd_run")
        };

        const ecu = {
          ae_port: calculateFuelDelta(dayRows, "ae_port_f_used"),
          ae_stbd: calculateFuelDelta(dayRows, "ae_stbd_f_used"),
          me_port: calculateFuelDelta(dayRows, "me_port_f_used"),
          me_stbd: calculateFuelDelta(dayRows, "me_stbd_f_used")
        };

        const ems = {
          ae_port: calculateFuelDelta(dayRows, "ae_port_f_ems"),
          ae_stbd: calculateFuelDelta(dayRows, "ae_stbd_f_ems"),
          me_port: calculateFuelDelta(dayRows, "me_port_f_ems"),
          me_stbd: calculateFuelDelta(dayRows, "me_stbd_f_ems")
        };

        const maker = {
          ae_port: calculateFuelDelta(dayRows, "ae_port_f_em"),
          ae_stbd: calculateFuelDelta(dayRows, "ae_stbd_f_em"),
          me_port: calculateFuelDelta(dayRows, "me_port_f_em"),
          me_stbd: calculateFuelDelta(dayRows, "me_stbd_f_em")
        };

        const ecuTotal = engineKeys.reduce((sum, key) => sum + (ecu[key] || 0), 0);
        const emsTotal = engineKeys.reduce((sum, key) => sum + (ems[key] || 0), 0);
        const makerTotal = engineKeys.reduce((sum, key) => sum + (maker[key] || 0), 0);

        return {
          dateKey,
          dataReceived: `${dayRows.length} rows`,
          runtime,
          ecu,
          ems,
          maker,
          ecuTotal,
          emsTotal,
          makerTotal,
          avgSpeed: average(speeds),
          maxSpeed: speeds.length ? Math.max(...speeds) : null
        };
      })
      .sort((a, b) => new Date(a.dateKey).getTime() - new Date(b.dateKey).getTime());
  }

  let vesselName = $derived(
    $selectedVesselInfo?.name ||
      $selectedVesselInfo?.vesselName ||
      "Selected Vessel"
  );

  let normalizedData = $derived(reportData?.data || reportData || {});

  let rawRows = $derived(
    pickArray(
      normalizedData?.details,
      normalizedData?.rows,
      normalizedData?.logs,
      normalizedData?.items,
      normalizedData?.data,
      normalizedData?.table,
      Array.isArray(normalizedData) ? normalizedData : []
    )
  );

  let periodRows = $derived(aggregateRowsByDate(rawRows));

  let stats = $derived(normalizedData?.stats || {});

  let totalRuntimeMinutes = $derived(
    periodRows.reduce((sum, row) => {
      return (
        sum +
        engineKeys.reduce((engineSum, key) => engineSum + (row.runtime?.[key] || 0), 0)
      );
    }, 0)
  );

  let totalFuel = $derived(
    periodRows.reduce((sum, row) => sum + (row.ecuTotal || row.emsTotal || row.makerTotal || 0), 0)
  );

  let averageSpeed = $derived(
    average(periodRows.map((row) => row.avgSpeed).filter((value) => Number.isFinite(value)))
  );

  let maxSpeed = $derived(
    periodRows
      .map((row) => row.maxSpeed)
      .filter((value) => Number.isFinite(value))
      .length
      ? Math.max(...periodRows.map((row) => row.maxSpeed).filter((value) => Number.isFinite(value)))
      : null
  );

  let hasRawData = $derived(Boolean(reportData));

  async function loadPeriodicalReport() {
    if (!$selectedVesselId) {
      error = "Belum ada vessel yang dipilih dari Fleet View.";
      reportData = null;
      return;
    }

    loading = true;
    error = "";

    try {
      const result = await getPeriodicalReportData({
        vesselId: $selectedVesselId,
        start: toApiDateTime(startDateTime),
        end: toApiDateTime(endDateTime),
        timezoneMode,
        timezoneOffset
      });

      reportData = result;
        const payload = result?.data || result || {};
        const stats = payload?.stats || payload?.dataStats || {};

        setPageStatus({
        dataReceived:
            stats?.received_slots !== undefined && stats?.total_slots !== undefined
            ? `${stats.received_slots} of ${stats.total_slots} (${stats.percentage ?? "-"}%)`
            : payload?.dataReceived || "-",
        queue: payload?.queue ?? "-",
        sdcard: payload?.sdcard ?? "-",
        online: Boolean($selectedVesselInfo?.online),
        sourcePage: "Periodical Report"
        });
      console.log("[PERIODICAL_REPORT_DATA]", result);
    } catch (err) {
      console.error("[PERIODICAL_REPORT_ERROR]", err);
      error = err?.message || "Gagal memuat periodical report.";
      reportData = null;
    } finally {
      loading = false;
    }
  }

  async function handleExportExcel() {
    if (!$selectedVesselId) {
      error = "Belum ada vessel yang dipilih.";
      return;
    }

    exporting = true;
    error = "";

    try {
      const url = getPeriodicalReportExcelUrl({
        vesselId: $selectedVesselId,
        start: toApiDateTime(startDateTime),
        end: toApiDateTime(endDateTime),
        timezoneMode,
        timezoneOffset
      });

      const safeVesselName = String(vesselName || "vessel")
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "_");

      await downloadApiFile(
        url,
        `Periodical_Report_${safeVesselName}_${toApiDateTime(startDateTime).slice(0, 10)}_${toApiDateTime(endDateTime).slice(0, 10)}.xlsx`
      );
    } catch (err) {
      console.error("[PERIODICAL_EXPORT_ERROR]", err);
      error = err?.message || "Gagal export Excel periodical report.";
    } finally {
      exporting = false;
    }
  }

    onMount(() => {
        const now = new Date();
        const start = new Date(now);
        start.setDate(now.getDate() - 7);
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

        loadPeriodicalReport();
    });
</script>

<section class="periodical-page">
  <section class="periodical-header-card">
    <div>
      <div class="page-kicker">Periodical Report</div>
      <h1>{vesselName}</h1>
      <p>Periodical vessel report by date range, aggregated from 1-minute telemetry data.</p>
    </div>

    <div class="header-meta">
      <span>Data Received</span>
      <strong>{stats?.received_slots ?? rawRows.length} / {stats?.total_slots ?? "-"}</strong>
      <small>{stats?.percentage ?? "-"}%</small>
    </div>
  </section>

  <section class="filter-card">
    <label>
      <span>Start</span>
      <input type="datetime-local" bind:value={startDateTime} />
    </label>

    <label>
      <span>End</span>
      <input type="datetime-local" bind:value={endDateTime} />
    </label>

    <label>
      <span>Timezone Mode</span>
      <select bind:value={timezoneMode}>
        <option value="auto">Auto</option>
        <option value="manual">Manual</option>
      </select>
    </label>

    {#if timezoneMode === "manual"}
      <label>
        <span>Timezone Offset</span>
        <input type="text" bind:value={timezoneOffset} placeholder="+07:00" />
      </label>
    {/if}

    <div class="filter-actions">
      <button type="button" class="primary-btn" onclick={loadPeriodicalReport} disabled={loading}>
        {loading ? "Loading..." : "Load Data"}
      </button>

      <button type="button" class="export-btn" onclick={handleExportExcel} disabled={exporting}>
        {exporting ? "Exporting..." : "Export Excel"}
      </button>
    </div>
  </section>

  {#if error}
    <div class="status-box error-box">{error}</div>
  {/if}

  <section class="summary-grid">
    <article class="summary-card">
      <span>Total Runtime</span>
      <strong>{formatRuntimeFromMinutes(totalRuntimeMinutes)}</strong>
    </article>

    <article class="summary-card">
      <span>Total Fuel</span>
      <strong>{formatNumber(totalFuel, 1)} L</strong>
    </article>

    <article class="summary-card">
      <span>Average Speed</span>
      <strong>{averageSpeed ? `${formatNumber(averageSpeed, 1)} knot` : "-"}</strong>
    </article>

    <article class="summary-card">
      <span>Max Speed</span>
      <strong>{maxSpeed ? `${formatNumber(maxSpeed, 1)} knot` : "-"}</strong>
    </article>
  </section>

  <section class="table-section periodical-main-table">
    <div class="section-header">
      <div>
        <span class="section-kicker">Daily Aggregation</span>
        <h2>Periodical Report by Date</h2>
      </div>

      <strong>{periodRows.length} days</strong>
    </div>

    {#if periodRows.length}
      <div class="periodical-table-wrapper">
        <table class="periodical-report-table">
          <thead>
            <tr>
              <th rowspan="3" class="sticky-col">DATE</th>
              <th rowspan="3">DAY</th>
              <th rowspan="3">DATA RECEIVED</th>
              <th colspan="4">RUNTIME</th>
              <th colspan="15">FUEL CONSUMPTION (L)</th>
              <th colspan="2">SPEED (KNOT)</th>
            </tr>

            <tr>
              <th rowspan="2">AE_PORT</th>
              <th rowspan="2">AE_STBD</th>
              <th rowspan="2">ME_PORT</th>
              <th rowspan="2">ME_STBD</th>

              <th colspan="5">ECU/FMS</th>
              <th colspan="5">EMS</th>
              <th colspan="5">ENGINE MAKER</th>

              <th rowspan="2">AVG</th>
              <th rowspan="2">MAX</th>
            </tr>

            <tr>
              <th>AE_PORT</th>
              <th>AE_STBD</th>
              <th>ME_PORT</th>
              <th>ME_STBD</th>
              <th>TOTAL</th>

              <th>AE_PORT</th>
              <th>AE_STBD</th>
              <th>ME_PORT</th>
              <th>ME_STBD</th>
              <th>TOTAL</th>

              <th>AE_PORT</th>
              <th>AE_STBD</th>
              <th>ME_PORT</th>
              <th>ME_STBD</th>
              <th>TOTAL</th>
            </tr>
          </thead>

          <tbody>
            {#each periodRows as row}
              <tr>
                <td class="sticky-col date-cell">{formatDateLabel(row.dateKey)}</td>
                <td>{getDayName(row.dateKey)}</td>
                <td>{row.dataReceived}</td>

                <td>{formatRuntimeFromMinutes(row.runtime.ae_port)}</td>
                <td>{formatRuntimeFromMinutes(row.runtime.ae_stbd)}</td>
                <td>{formatRuntimeFromMinutes(row.runtime.me_port)}</td>
                <td>{formatRuntimeFromMinutes(row.runtime.me_stbd)}</td>

                <td>{formatNumber(row.ecu.ae_port, 1)}</td>
                <td>{formatNumber(row.ecu.ae_stbd, 1)}</td>
                <td>{formatNumber(row.ecu.me_port, 1)}</td>
                <td>{formatNumber(row.ecu.me_stbd, 1)}</td>
                <td class="total-col">{formatNumber(row.ecuTotal, 1)}</td>

                <td>{formatNumber(row.ems.ae_port, 1)}</td>
                <td>{formatNumber(row.ems.ae_stbd, 1)}</td>
                <td>{formatNumber(row.ems.me_port, 1)}</td>
                <td>{formatNumber(row.ems.me_stbd, 1)}</td>
                <td class="total-col">{formatNumber(row.emsTotal, 1)}</td>

                <td>{formatNumber(row.maker.ae_port, 1)}</td>
                <td>{formatNumber(row.maker.ae_stbd, 1)}</td>
                <td>{formatNumber(row.maker.me_port, 1)}</td>
                <td>{formatNumber(row.maker.me_stbd, 1)}</td>
                <td class="total-col">{formatNumber(row.makerTotal, 1)}</td>

                <td>{row.avgSpeed ? formatNumber(row.avgSpeed, 1) : "-"}</td>
                <td>{row.maxSpeed ? formatNumber(row.maxSpeed, 1) : "-"}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <div class="empty-box">
        Periodical report belum tersedia pada rentang waktu yang dipilih.
      </div>
    {/if}
  </section>

  {#if hasRawData}
    <details class="raw-box">
      <summary>Raw Periodical Report Response</summary>
      <pre>{JSON.stringify(reportData, null, 2)}</pre>
    </details>
  {/if}
</section>

<style>
  .periodical-page {
    width: 100%;
    height: 100%;
    max-height: 100%;
    min-height: 0;
    padding: 14px;
    background: #f4f6f8;
    color: #0f172a;
    overflow-y: auto;
    overflow-x: hidden;
    box-sizing: border-box;
  }

  .periodical-header-card,
  .filter-card,
  .summary-card,
  .table-section,
  .raw-box {
    background: #ffffff;
    border: 1px solid #d9e2ec;
    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
  }

  .periodical-header-card {
    padding: 14px 16px;
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
    background: #dbeafe;
    color: #1d4ed8;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .periodical-header-card h1 {
    margin: 8px 0 0;
    font-size: 21px;
    line-height: 1.2;
    font-weight: 900;
    color: #0f172a;
  }

  .periodical-header-card p {
    margin: 7px 0 0;
    color: #64748b;
    font-size: 12px;
    font-weight: 700;
  }

  .header-meta {
    min-width: 150px;
    padding: 10px 12px;
    border-radius: 12px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    text-align: right;
  }

  .header-meta span {
    display: block;
    color: #64748b;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .header-meta strong {
    display: block;
    margin-top: 5px;
    color: #0f172a;
    font-size: 14px;
    font-weight: 900;
  }

  .header-meta small {
    display: block;
    margin-top: 4px;
    color: #64748b;
    font-size: 11px;
    font-weight: 900;
  }

  .filter-card {
    margin-top: 12px;
    padding: 12px;
    display: flex;
    align-items: end;
    gap: 10px;
    flex-wrap: wrap;
  }

  .filter-card label {
    display: grid;
    gap: 5px;
  }

  .filter-card label span {
    color: #475569;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .filter-card input,
  .filter-card select {
    height: 32px;
    min-width: 160px;
    border: 1px solid #cbd5e1;
    background: #ffffff;
    padding: 0 9px;
    color: #0f172a;
    font-size: 12px;
    font-weight: 700;
    outline: none;
  }

  .filter-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .primary-btn,
  .export-btn {
    height: 32px;
    padding: 0 12px;
    border: none;
    font-size: 11px;
    font-weight: 900;
    cursor: pointer;
  }

  .primary-btn {
    background: #2563eb;
    color: #ffffff;
  }

  .export-btn {
    background: #16a34a;
    color: #ffffff;
  }

  .primary-btn:disabled,
  .export-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .status-box {
    margin-top: 12px;
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

  .summary-grid {
    margin-top: 12px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .summary-card {
    min-height: 84px;
    padding: 13px 14px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .summary-card span {
    color: #64748b;
    font-size: 10.5px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .summary-card strong {
    margin-top: 9px;
    color: #0f172a;
    font-size: 19px;
    line-height: 1.1;
    font-weight: 900;
  }

  .table-section {
    margin-top: 12px;
    overflow: hidden;
  }

  .section-header {
    min-height: 54px;
    padding: 11px 13px;
    border-bottom: 1px solid #e5edf5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  }

  .section-header h2 {
    margin: 6px 0 0;
    color: #0f172a;
    font-size: 16px;
    font-weight: 900;
  }

  .section-header > strong {
    padding: 5px 10px;
    border-radius: 999px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    color: #1d4ed8;
    font-size: 11px;
    font-weight: 900;
  }

  .periodical-table-wrapper {
    width: 100%;
    max-height: calc(100vh - 330px);
    min-height: 280px;
    overflow: auto;
    background: #ffffff;
  }

  .periodical-report-table {
    width: max-content;
    min-width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 11px;
  }

  .periodical-report-table thead th {
    position: sticky;
    top: 0;
    z-index: 5;
    background: #3478e5;
    color: #ffffff;
    border-right: 1px solid rgba(255, 255, 255, 0.32);
    border-bottom: 1px solid rgba(255, 255, 255, 0.32);
    text-align: center;
    vertical-align: middle;
    padding: 8px 8px;
    font-size: 10.5px;
    line-height: 1.15;
    font-weight: 900;
    white-space: nowrap;
  }

  .periodical-report-table thead tr:nth-child(2) th {
    top: 31px;
    background: #3b82f6;
  }

  .periodical-report-table thead tr:nth-child(3) th {
    top: 62px;
    background: #4b8bf0;
  }

  .periodical-report-table tbody td {
    border-right: 1px solid #d7dee8;
    border-bottom: 1px solid #d7dee8;
    padding: 7px 9px;
    text-align: center;
    white-space: nowrap;
    font-size: 11px;
    font-weight: 700;
    color: #0f172a;
    background: #ffffff;
  }

  .periodical-report-table tbody tr:nth-child(even) td {
    background: #f8fbff;
  }

  .periodical-report-table tbody tr:hover td {
    background: #eef6ff;
  }

  .periodical-report-table .sticky-col {
    position: sticky;
    left: 0;
    z-index: 7;
    min-width: 105px;
  }

  .periodical-report-table thead .sticky-col {
    z-index: 9;
    background: #3478e5 !important;
  }

  .periodical-report-table tbody .sticky-col {
    background: inherit;
    box-shadow: 1px 0 0 #d7dee8;
  }

  .date-cell {
    font-weight: 900;
    color: #0f172a;
  }

  .total-col {
    font-weight: 900;
    background: #f3f8ff;
  }

  .raw-box {
    margin-top: 12px;
    padding: 12px 14px;
  }

  .raw-box summary {
    cursor: pointer;
    font-size: 12px;
    font-weight: 900;
    color: #1d4ed8;
  }

  .raw-box pre {
    margin-top: 12px;
    padding: 12px;
    max-height: 360px;
    overflow: auto;
    background: #0f172a;
    color: #e2e8f0;
    font-size: 11px;
    line-height: 1.5;
  }

  .empty-box {
    padding: 18px 14px;
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
  }

  @media (max-width: 1100px) {
    .summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .periodical-page {
      padding: 10px;
    }

    .periodical-header-card {
      flex-direction: column;
      align-items: flex-start;
    }

    .header-meta {
      width: 100%;
      text-align: left;
    }

    .summary-grid {
      grid-template-columns: 1fr;
    }

    .filter-card input,
    .filter-card select {
      min-width: 100%;
    }

    .filter-actions {
      width: 100%;
    }

    .primary-btn,
    .export-btn {
      width: 100%;
    }

    .periodical-table-wrapper {
      max-height: calc(100vh - 390px);
    }
  }
</style>