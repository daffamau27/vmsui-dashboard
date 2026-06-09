<script>
  let {
    title = "ME PORT RPM",
    status = "online",
    lastData = "-",
    value = null,
    avg = "-",
    top = "-",
    min = 0,
    max = 2200
  } = $props();

  let numericValue = $derived(value === null ? null : Number(value));

  let percentage = $derived(
    numericValue === null
      ? 0
      : Math.max(0, Math.min(100, ((numericValue - min) / (max - min)) * 100))
  );

  let needleRotation = $derived(-90 + (percentage / 100) * 180);
</script>

<div class="rpm-card" class:disabled={value === null}>
  <div class="rpm-header">
    <div class="rpm-title-wrap">
      <div class="rpm-title">{title}</div>
      <div class="rpm-date">Last data: {lastData}</div>
    </div>

    <span
      class:online-dot={status === "online"}
      class:offline-dot={status !== "online"}
    ></span>
  </div>

  {#if value !== null}
    <div class="rpm-value">{value}</div>

    <div class="gauge-wrap">
      <svg class="gauge-svg" viewBox="0 0 180 112" aria-label={title}>
        <path
          class="gauge-bg"
          d="M 28 90 A 62 62 0 0 1 152 90"
          pathLength="100"
        />

        <path
          class="gauge-progress"
          d="M 28 90 A 62 62 0 0 1 152 90"
          pathLength="100"
          stroke-dasharray={`${percentage} 100`}
        />

        <g
          style={`transform: rotate(${needleRotation}deg); transform-origin: 90px 90px;`}
        >
          <line
            class="needle"
            x1="90"
            y1="90"
            x2="90"
            y2="42"
          />
        </g>

        <circle class="needle-center" cx="90" cy="90" r="6" />
      </svg>
    </div>

    <div class="rpm-stats">
      <div class="stat-item">
        <span>Avg</span>
        <strong>{avg}</strong>
      </div>

      <div class="stat-item">
        <span>Top</span>
        <strong>{top}</strong>
      </div>
    </div>
  {:else}
    <div class="no-data">No data</div>
  {/if}
</div>

<style>
  .rpm-card {
    width: 100%;
    min-width: 0;
    min-height: 175px;
    padding: 8px 10px 10px;
    background: #ffffff;
    border: 1px solid #d8d8d8;
    overflow: hidden;
  }

  .rpm-card.disabled {
    background: #cfcfcf;
  }

  .rpm-header {
    display: grid;
    grid-template-columns: 1fr 14px;
    align-items: start;
    gap: 4px;
  }

  .rpm-title-wrap {
    text-align: center;
    padding-left: 14px;
    min-width: 0;
  }

  .rpm-title {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.2px;
    line-height: 1.1;
    white-space: nowrap;
  }

  .rpm-date {
    margin-top: 5px;
    font-size: 8.5px;
    color: #666;
    line-height: 1.2;
    white-space: nowrap;
  }

  .online-dot,
  .offline-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
    margin-top: 1px;
  }

  .online-dot {
    background: #16b889;
  }

  .offline-dot {
    background: #aeb8c2;
    border: 1px solid #fff;
  }

  .rpm-value {
    margin-top: 8px;
    text-align: center;
    font-size: 22px;
    font-weight: 900;
    line-height: 1;
    color: #000;
  }

  .gauge-wrap {
    width: 100%;
    display: flex;
    justify-content: center;
    margin-top: -4px;
  }

  .gauge-svg {
    width: 132px;
    height: 82px;
    display: block;
  }

  .gauge-bg,
  .gauge-progress {
    fill: none;
    stroke-width: 16;
    stroke-linecap: round;
  }

  .gauge-bg {
    stroke: #e3e3e3;
  }

  .gauge-progress {
    stroke: #4c8df6;
  }

  .needle {
    stroke: #333;
    stroke-width: 3.2;
    stroke-linecap: round;
  }

  .needle-center {
    fill: #333;
  }

  .rpm-stats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
    margin-top: -2px;
    padding-top: 6px;
    border-top: 1px solid #eeeeee;
  }

  .stat-item {
    text-align: center;
  }

  .stat-item span {
    display: block;
    margin-bottom: 2px;
    font-size: 10px;
    color: #555;
    line-height: 1;
  }

  .stat-item strong {
    display: block;
    font-size: 11px;
    font-weight: 800;
    color: #111;
    line-height: 1.2;
  }

  .no-data {
    min-height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #777;
    font-size: 10px;
  }
</style>