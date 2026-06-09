<script>
  import { onMount } from "svelte";
  import {
    selectedVesselId,
    selectedVesselInfo
  } from "$lib/stores/selectedVessel.svelte.js";
  import {
    getDataLogData,
    getDataLogExcelUrl
  } from "$lib/api/dataLogApi.js";

  import { setPageStatus } from "$lib/stores/pageStatusStore.svelte.js";
  import { downloadApiFile } from "$lib/api/authApi.js";

  let loading = $state(false);
  let exporting = $state(false);
  let error = $state("");
  let logData = $state(null);

  let startDateTime = $state("");
  let endDateTime = $state("");
  let timezoneMode = $state("auto");
  let timezoneOffset = $state("+07:00");

    let { active = false } = $props();
    let loadedKeys = $state({});

function prettifyColumnLabel(key) {
  return String(key || "-")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

let apiAvailableColumns = $derived(
  Array.isArray(normalizedData?.available_columns)
    ? normalizedData.available_columns
    : []
);

let visibleColumns = $derived(
  apiAvailableColumns.length
    ? apiAvailableColumns
    : selectedColumns
);

let lastLoadedVesselId = $state(null);

  let selectedColumns = $state([
    "timestamp",
    "latitude",
    "longitude",
    "course",
    "speed",
    "rig",
    "me_port_run",
    "me_port_rpm",
    "me_port_load",
    "me_port_f_used",
    "me_stbd_run",
    "me_stbd_rpm",
    "me_stbd_load",
    "me_stbd_f_used",
    "ae_port_run",
    "ae_port_rpm",
    "ae_port_load",
    "ae_port_f_used",
    "ae_stbd_run",
    "ae_stbd_rpm",
    "ae_stbd_load",
    "ae_stbd_f_used"
  ]);

  let stats = $derived(normalizedData?.stats || {});

  function parseRowTimestamp(row) {
    const value =
        row?.timestamp_utc ||
        row?.timestamp ||
        row?.ts ||
        row?.time ||
        row?.datetime;

    if (!value) return 0;

    // Jika Unix timestamp
    if (/^\d+$/.test(String(value))) {
        return Number(value);
    }

    // Bersihkan format seperti: 2026-05-24 00:00:00 (UTC+7)
    const cleaned = String(value)
        .replace(/\s*\(UTC[+-]?\d+\)\s*/i, "")
        .replace(" ", "T");

    const time = new Date(cleaned).getTime();

    return Number.isFinite(time) ? time : 0;
  }
  const availableColumns = [
    { key: "timestamp", label: "Timestamp" },
    { key: "latitude", label: "Latitude" },
    { key: "longitude", label: "Longitude" },
    { key: "course", label: "Course" },
    { key: "speed", label: "Speed" },
    { key: "rig", label: "Rig" },

    { key: "me_port_run", label: "ME Port Run" },
    { key: "me_port_rpm", label: "ME Port RPM" },
    { key: "me_port_load", label: "ME Port Load" },
    { key: "me_port_f_used", label: "ME Port Fuel Used" },

    { key: "me_stbd_run", label: "ME STBD Run" },
    { key: "me_stbd_rpm", label: "ME STBD RPM" },
    { key: "me_stbd_load", label: "ME STBD Load" },
    { key: "me_stbd_f_used", label: "ME STBD Fuel Used" },

    { key: "ae_port_run", label: "AE Port Run" },
    { key: "ae_port_rpm", label: "AE Port RPM" },
    { key: "ae_port_load", label: "AE Port Load" },
    { key: "ae_port_f_used", label: "AE Port Fuel Used" },

    { key: "ae_stbd_run", label: "AE STBD Run" },
    { key: "ae_stbd_rpm", label: "AE STBD RPM" },
    { key: "ae_stbd_load", label: "AE STBD Load" },
    { key: "ae_stbd_f_used", label: "AE STBD Fuel Used" }
  ];

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

  function formatValue(value) {
    if (value === undefined || value === null || value === "") return "-";

    if (typeof value === "number") {
      return Number.isInteger(value) ? String(value) : value.toFixed(2);
    }

    if (typeof value === "boolean") {
      return value ? "ON" : "OFF";
    }

    return value;
  }

  function pickArray(...values) {
    for (const value of values) {
      if (Array.isArray(value)) return value;
    }

    return [];
  }

  function getColumnLabel(key) {
    return prettifyColumnLabel(key);
  }

  function toggleColumn(key) {
    if (selectedColumns.includes(key)) {
      selectedColumns = selectedColumns.filter((item) => item !== key);
    } else {
      selectedColumns = [...selectedColumns, key];
    }
  }

  function selectAllColumns() {
    selectedColumns = visibleColumns;
  }

  function clearColumns() {
    selectedColumns = [
        "timestamp",
        "course",
        "latitude",
        "longitude",
        "speed",
        "rig"
    ].filter((key) => visibleColumns.includes(key));
  }

  let vesselName = $derived(
    $selectedVesselInfo?.name ||
      $selectedVesselInfo?.vesselName ||
      "Selected Vessel"
  );

  let normalizedData = $derived(logData?.data || logData || {});

  let dataRows = $derived(
    pickArray(
        normalizedData?.details,
        normalizedData?.rows,
        normalizedData?.logs,
        normalizedData?.items,
        normalizedData?.data,
        normalizedData?.table,
        Array.isArray(normalizedData) ? normalizedData : []
    )
        .slice()
        .sort((a, b) => parseRowTimestamp(b) - parseRowTimestamp(a))
  );

  let meta = $derived(
    normalizedData?.meta ||
      normalizedData?.summary ||
      normalizedData?.info ||
      {}
  );

  let hasRawData = $derived(Boolean(logData));

  async function loadDataLog() {
    if (!$selectedVesselId) {
      error = "Belum ada vessel yang dipilih dari Fleet View.";
      logData = null;
      return;
    }

    loading = true;
    error = "";

    try {
      const result = await getDataLogData({
        vesselId: $selectedVesselId,
        start: toApiDateTime(startDateTime),
        end: toApiDateTime(endDateTime),
        timezoneMode,
        timezoneOffset,
        columns: selectedColumns.join(",")
      });

      logData = result;

    const payload = result?.data || result || {};
    const stats = payload?.stats || {};

    setPageStatus({
    dataReceived:
        stats?.received_slots !== undefined && stats?.total_slots !== undefined
        ? `${stats.received_slots} of ${stats.total_slots} (${stats.percentage ?? "-"}%)`
        : `${payload?.details?.length ?? 0} rows`,
    queue: payload?.queue ?? "-",
    sdcard: payload?.sdcard ?? "-",
    online: Boolean($selectedVesselInfo?.online),
    sourcePage: "Data Log"
    });

    if (Array.isArray(payload.available_columns) && payload.available_columns.length) {
        selectedColumns = payload.available_columns;
    }
      console.log("[DATA_LOG_DATA]", result);
    } catch (err) {
      console.error("[DATA_LOG_ERROR]", err);
      error = err?.message || "Gagal memuat data log.";
      logData = null;
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
      const url = getDataLogExcelUrl({
        vesselId: $selectedVesselId,
        start: toApiDateTime(startDateTime),
        end: toApiDateTime(endDateTime),
        timezoneMode,
        timezoneOffset,
        columns: selectedColumns.join(",")
      });

      const safeVesselName = String(vesselName || "vessel")
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "_");

      await downloadApiFile(
        url,
        `Data_Log_${safeVesselName}_${toApiDateTime(startDateTime).slice(0, 10)}.xlsx`
      );
    } catch (err) {
      console.error("[DATA_LOG_EXPORT_ERROR]", err);
      error = err?.message || "Gagal export Excel data log.";
    } finally {
      exporting = false;
    }
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

  const key = `${$selectedVesselId}|${startDateTime}|${endDateTime}|${timezoneMode}|${timezoneOffset}|${selectedColumns.join(",")}`;

  if (loadedKeys[key]) return;

  loadedKeys = {
    ...loadedKeys,
    [key]: true
  };

  loadDataLog();
});
</script>

<section class="data-log-page">
  <section class="data-log-header-card">
    <div>
      <div class="page-kicker">Data Log</div>
      <h1>{vesselName}</h1>
      <p>Granular 1-minute telemetry log with position, speed, runtime, RPM, load, and fuel data.</p>
    </div>

    <div class="header-meta">
        <span>Data Received</span>
        <strong>
            {stats?.received_slots ?? dataRows.length} / {stats?.total_slots ?? "-"}
        </strong>
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
      <button type="button" class="primary-btn" onclick={loadDataLog} disabled={loading}>
        {loading ? "Loading..." : "Load Data"}
      </button>

      <button type="button" class="export-btn" onclick={handleExportExcel} disabled={exporting}>
        {exporting ? "Exporting..." : "Export Excel"}
      </button>
    </div>
  </section>

  <section class="column-card">
    <div class="column-header">
      <div>
        <span class="section-kicker">Columns</span>
        <h2>Visible Data Columns</h2>
      </div>

      <div class="column-actions">
        <button type="button" onclick={selectAllColumns}>Select All</button>
        <button type="button" onclick={clearColumns}>Basic</button>
      </div>
    </div>

    <div class="column-grid">
      {#each visibleColumns as column}
        <label class="column-item">
            <input
            type="checkbox"
            checked={selectedColumns.includes(column)}
            onchange={() => toggleColumn(column)}
            />
            <span>{prettifyColumnLabel(column)}</span>
        </label>
      {/each}
    </div>
  </section>

  {#if error}
    <div class="status-box error-box">{error}</div>
  {/if}

  <section class="table-section">
    <div class="section-header">
      <div>
        <span class="section-kicker">Telemetry</span>
        <h2>1-Minute Data Log</h2>
      </div>

      <strong>{dataRows.length} rows</strong>
    </div>

    {#if dataRows.length}
      <div class="data-log-table-wrapper">
        <table class="data-log-table">
          <thead>
            <tr>
              {#each selectedColumns as column}
                <th class:sticky-col={column === "timestamp"}>
                  {getColumnLabel(column)}
                </th>
              {/each}
            </tr>
          </thead>

          <tbody>
            {#each dataRows as row}
              <tr>
                {#each selectedColumns as column}
                  <td class:sticky-col={column === "timestamp"}>
                    {formatValue(row?.[column])}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <div class="empty-box">
        Data log belum tersedia pada rentang waktu yang dipilih.
      </div>
    {/if}
  </section>

  {#if hasRawData}
    <details class="raw-box">
      <summary>Raw Data Log Response</summary>
      <pre>{JSON.stringify(logData, null, 2)}</pre>
    </details>
  {/if}
</section>

<style>
  .data-log-page {
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

  .data-log-header-card,
  .filter-card,
  .column-card,
  .table-section,
  .raw-box {
    background: #ffffff;
    border: 1px solid #d9e2ec;
    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
  }

  .data-log-header-card {
    padding: 14px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

.header-meta small {
  display: block;
  margin-top: 4px;
  color: #64748b;
  font-size: 11px;
  font-weight: 900;
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

  .data-log-header-card h1 {
    margin: 8px 0 0;
    font-size: 21px;
    line-height: 1.2;
    font-weight: 900;
    color: #0f172a;
  }

  .data-log-header-card p {
    margin: 7px 0 0;
    color: #64748b;
    font-size: 12px;
    font-weight: 700;
  }

  .header-meta {
    min-width: 120px;
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
    font-size: 18px;
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

  .column-card {
    margin-top: 12px;
    overflow: hidden;
  }

  .column-header {
    min-height: 52px;
    padding: 11px 13px;
    border-bottom: 1px solid #e5edf5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  }

  .column-header h2,
  .section-header h2 {
    margin: 6px 0 0;
    color: #0f172a;
    font-size: 16px;
    font-weight: 900;
  }

  .column-actions {
    display: flex;
    gap: 8px;
  }

  .column-actions button {
    height: 28px;
    padding: 0 10px;
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: #0f172a;
    font-size: 11px;
    font-weight: 900;
    cursor: pointer;
  }

  .column-grid {
    padding: 12px;
    display: grid;
    grid-template-columns: repeat(4, minmax(160px, 1fr));
    gap: 8px;
  }

  .column-item {
    min-height: 30px;
    padding: 6px 8px;
    border: 1px solid #e2e8f0;
    background: #f8fafc;
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    font-weight: 800;
    color: #334155;
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

  .section-header > strong {
    padding: 5px 10px;
    border-radius: 999px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    color: #1d4ed8;
    font-size: 11px;
    font-weight: 900;
  }

  .data-log-table-wrapper {
    width: 100%;
    max-height: calc(100vh - 430px);
    min-height: 260px;
    overflow: auto;
    background: #ffffff;
  }

  .data-log-table {
    width: max-content;
    min-width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 11px;
  }

  .data-log-table thead th {
    position: sticky;
    top: 0;
    z-index: 5;
    background: #3478e5;
    color: #ffffff;
    border-right: 1px solid rgba(255, 255, 255, 0.32);
    border-bottom: 1px solid rgba(255, 255, 255, 0.32);
    text-align: center;
    vertical-align: middle;
    padding: 8px 9px;
    font-size: 10.5px;
    line-height: 1.15;
    font-weight: 900;
    white-space: nowrap;
  }

  .data-log-table tbody td {
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

  .data-log-table tbody tr:nth-child(even) td {
    background: #f8fbff;
  }

  .data-log-table tbody tr:hover td {
    background: #eef6ff;
  }

  .data-log-table .sticky-col {
    position: sticky;
    left: 0;
    z-index: 7;
    min-width: 150px;
    text-align: left;
  }

  .data-log-table thead .sticky-col {
    z-index: 9;
    background: #3478e5 !important;
  }

  .data-log-table tbody .sticky-col {
    background: inherit;
    box-shadow: 1px 0 0 #d7dee8;
  }

  .empty-box {
    padding: 18px 14px;
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
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

  @media (max-width: 1100px) {
    .column-grid {
      grid-template-columns: repeat(2, minmax(160px, 1fr));
    }
  }

  @media (max-width: 760px) {
    .data-log-page {
      padding: 10px;
    }

    .data-log-header-card {
      flex-direction: column;
      align-items: flex-start;
    }

    .header-meta {
      width: 100%;
      text-align: left;
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

    .column-grid {
      grid-template-columns: 1fr;
    }

    .data-log-table-wrapper {
      max-height: calc(100vh - 500px);
    }
  }
</style>