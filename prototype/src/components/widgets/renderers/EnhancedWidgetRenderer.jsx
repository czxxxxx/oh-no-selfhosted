import { useMemo, useState } from "react";
import { FiCloud, FiDroplet, FiMoon, FiMoreHorizontal, FiSun, FiThermometer, FiWind } from "react-icons/fi";
import { ServiceIcon } from "../../../iconRegistry.jsx";

function formatBytes(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "Unavailable";
  }

  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let scaled = Math.max(number, 0);
  let unitIndex = 0;

  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex += 1;
  }

  return `${scaled.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatEnhancedValue(value, format) {
  const number = Number(value);

  if (format === "bytesPerSecond" && Number.isFinite(number)) {
    return `${(number / 1024 / 1024).toFixed(1)} MB/s`;
  }

  if (format === "bytes" && Number.isFinite(number)) {
    return formatBytes(number);
  }

  if (format === "percent" && Number.isFinite(number)) {
    return `${number.toFixed(number % 1 === 0 ? 0 : 1)}%`;
  }

  if (format === "number" && Number.isFinite(number)) {
    return new Intl.NumberFormat().format(number);
  }

  return value !== undefined && value !== null ? value : "Unavailable";
}

function formatWeatherNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "-";
  }

  return number.toFixed(Math.abs(number % 1) < 0.05 ? 0 : 1);
}

function weatherTemperatureUnit(data) {
  return data?.units?.temperature || "°C";
}

function weatherWindUnit(data) {
  return data?.units?.windSpeed || "km/h";
}

function weatherAccessibleUnit(unit) {
  return unit === "°C" ? "degrees celsius" : unit;
}

function weatherLocationLabel(data) {
  return data?.location?.label || data?.location?.name || "configured location";
}

function weatherLocationName(data) {
  return data?.location?.name || data?.location?.label || "Weather";
}

function fieldValue(data, field) {
  return data?.[field.key];
}

function formatRatio(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "-";
  }

  return number.toFixed(number >= 10 ? 1 : 2).replace(/\.?0+$/, "");
}

function formatEta(value) {
  const seconds = Number(value);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "";
  }

  const minutes = Math.ceil(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return hours > 0 ? `${hours}h ${remainingMinutes}m left` : `${minutes}m left`;
}

function formatTransferDetail(torrent) {
  const detailParts = [];
  const downloadedBytes = Number(torrent.downloadedBytes);
  const totalBytes = Number(torrent.totalBytes);
  const ratio = Number(torrent.ratio);
  const torrentStatus = String(torrent.status || torrent.state || "").toLowerCase();
  const eta = torrentStatus.includes("down") ? formatEta(torrent.etaSeconds) : "";

  if (Number.isFinite(downloadedBytes) && Number.isFinite(totalBytes) && totalBytes > 0) {
    detailParts.push(`${formatEnhancedValue(downloadedBytes, "bytes")} / ${formatEnhancedValue(totalBytes, "bytes")}`);
  }

  if (Number.isFinite(ratio)) {
    detailParts.push(`Ratio ${formatRatio(ratio)}`);
  }

  if (eta) {
    detailParts.push(eta);
  }

  return detailParts.join(" · ");
}

function normalizedProgress(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.min(Math.max(number <= 1 ? number * 100 : number, 0), 100);
}

function QbittorrentOpsCard({ data, fields }) {
  const downloadField = fields.find((field) => field.key === "downloadSpeed") || {
    format: "bytesPerSecond",
    key: "downloadSpeed",
    label: "Down Speed",
  };
  const uploadField = fields.find((field) => field.key === "uploadSpeed") || {
    format: "bytesPerSecond",
    key: "uploadSpeed",
    label: "Up Speed",
  };
  const totalDownloaded = Number(data?.totalDownloaded);
  const totalUploaded = Number(data?.totalUploaded);
  const activeTorrents = Array.isArray(data?.activeTorrents) ? data.activeTorrents.slice(0, 4) : [];
  const hasLiveTransfer = activeTorrents.some(
    (torrent) => Number(torrent.downloadSpeed || 0) > 0 || Number(torrent.uploadSpeed || 0) > 0,
  );
  const activeSectionLabel = activeTorrents.length && !hasLiveTransfer ? "Seeding Queue" : "Active Transfers";
  const ratio =
    Number.isFinite(Number(data?.ratio))
      ? Number(data.ratio)
      : totalDownloaded > 0 && Number.isFinite(totalUploaded)
        ? totalUploaded / totalDownloaded
        : null;
  const queueMetrics = [
    { key: "seeding", label: "Seeding", value: formatEnhancedValue(data?.seeding ?? 0, "number") },
    { key: "downloading", label: "Downloading", value: formatEnhancedValue(data?.downloading ?? 0, "number") },
    { key: "paused", label: "Paused", value: formatEnhancedValue(data?.paused ?? 0, "number") },
    { key: "peers", label: "Peers", value: formatEnhancedValue(data?.peers ?? 0, "number") },
    {
      key: "download-speed",
      label: "Down Speed",
      value: formatEnhancedValue(fieldValue(data, downloadField), downloadField.format),
    },
    {
      key: "upload-speed",
      label: "Up Speed",
      value: formatEnhancedValue(fieldValue(data, uploadField), uploadField.format),
    },
  ];

  return (
    <section aria-label="qBittorrent transfer and queue status" className="qbittorrent-ops-card">
      <dl className="qbittorrent-stat-grid">
        {queueMetrics.map((metric) => (
          <div className={`qbittorrent-stat is-${metric.key}`} key={metric.key}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>
      <dl className="qbittorrent-total-grid">
        <div>
          <dt>Total Downloaded</dt>
          <dd>{Number.isFinite(totalDownloaded) ? formatEnhancedValue(totalDownloaded, "bytes") : "-"}</dd>
        </div>
        <div>
          <dt>Total Uploaded</dt>
          <dd>{Number.isFinite(totalUploaded) ? formatEnhancedValue(totalUploaded, "bytes") : "-"}</dd>
        </div>
        <div>
          <dt>Ratio</dt>
          <dd>{formatRatio(ratio)}</dd>
        </div>
      </dl>
      <div className="qbittorrent-active-section">
        <span className="qbittorrent-section-label">{activeSectionLabel}</span>
        {activeTorrents.length ? (
          <div className="qbittorrent-active-list">
            {activeTorrents.map((torrent, index) => {
              const progress = normalizedProgress(torrent.progress);
              const title = torrent.name || `Transfer ${index + 1}`;

              return (
                <article className="qbittorrent-active-row" key={`${title}-${index}`}>
                  <div className="qbittorrent-active-row-top">
                    <strong>{title}</strong>
                    <span>{torrent.status || "Active"}</span>
                  </div>
                  <div
                    aria-label={`${title} progress`}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={Number(progress.toFixed(1))}
                    className="qbittorrent-progress-meter"
                    role="meter"
                  >
                    <i aria-hidden="true" style={{ "--torrent-progress": `${progress}%` }} />
                  </div>
                  <small>{formatTransferDetail(torrent)}</small>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="qbittorrent-empty">No active transfers</p>
        )}
      </div>
    </section>
  );
}

function MetricFields({ data, fields, rendererName, variant }) {
  if (rendererName === "metric-pair") {
    if (variant === "qbittorrent") {
      return <QbittorrentOpsCard data={data} fields={fields} />;
    }

    return (
      <dl className="enhanced-transfer-card">
        {fields.map((field) => (
          <div key={field.key} className={`enhanced-transfer-row is-${field.key.toLowerCase()}`}>
            <dt>{field.label}</dt>
            <dd>{formatEnhancedValue(fieldValue(data, field), field.format)}</dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <div className={`enhanced-metrics enhanced-metrics-${rendererName || "metric-list"}`}>
      {fields.map((field) => (
        <span key={field.key}>
          <small>{field.label}</small>
          <strong>{formatEnhancedValue(fieldValue(data, field), field.format)}</strong>
        </span>
      ))}
    </div>
  );
}

function JsonPreview({ data }) {
  return (
    <pre className="enhanced-json-preview">
      {JSON.stringify(data && Object.keys(data).length ? data : { status: "Unavailable" }, null, 2)}
    </pre>
  );
}

function TablePreview({ data, fields }) {
  const rows = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : [];
  const columns = fields.length ? fields : Object.keys(rows[0] || {}).map((key) => ({ key, label: key, format: "text" }));

  return (
    <div className="enhanced-table-wrap">
      <table className="enhanced-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 5).map((row, index) => (
            <tr key={row.id || row.name || index}>
              {columns.map((column) => (
                <td key={column.key}>{formatEnhancedValue(row[column.key], column.format)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <span className="enhanced-empty">No rows</span> : null}
    </div>
  );
}

function SparklinePreview({ data, fields }) {
  const primaryField = fields[0] || { key: "values", label: "Value", format: "number" };
  const values = Array.isArray(data?.[primaryField.key])
    ? data[primaryField.key].map(Number)
    : Array.isArray(data?.values)
      ? data.values.map(Number)
      : [];
  const max = Math.max(...values, 1);
  const current = values.at(-1);

  return (
    <div className="enhanced-sparkline">
      <span>
        <small>{primaryField.label}</small>
        <strong>{formatEnhancedValue(current, primaryField.format)}</strong>
      </span>
      <div aria-hidden="true">
        {values.slice(-18).map((value, index) => (
          <i key={`${value}-${index}`} style={{ "--bar-height": `${Math.max((value / max) * 100, 4)}%` }} />
        ))}
      </div>
    </div>
  );
}

function percentFromStorage(data) {
  const totalBytes = Number(data?.totalBytes || 0);
  const usedBytes = Number(data?.usedBytes || 0);
  const explicitPercent = Number(data?.usedPercent);
  const derivedPercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
  const percent = Number.isFinite(explicitPercent) ? explicitPercent : derivedPercent;

  return Math.min(Math.max(percent, 0), 100);
}

function StorageDonutPreview({ data }) {
  const usedBytes = Number(data?.usedBytes || 0);
  const totalBytes = Number(data?.totalBytes || 0);
  const freeBytes = Math.max(totalBytes - usedBytes, 0);
  const usedPercent = percentFromStorage(data);
  const usedLabel = formatEnhancedValue(usedPercent, "percent");
  const chartLabel = `Storage usage ${usedLabel} used, ${formatEnhancedValue(usedBytes, "bytes")} used, ${formatEnhancedValue(freeBytes, "bytes")} free, ${formatEnhancedValue(totalBytes, "bytes")} total`;

  return (
    <div
      aria-label={chartLabel}
      className="enhanced-storage-donut"
      role="img"
      style={{ "--storage-used-percent": `${usedPercent}%`, "--storage-used-value": usedPercent }}
    >
      <div className="storage-donut-visual" aria-hidden="true">
        <svg className="storage-donut-ring" viewBox="0 0 120 120">
          <circle className="storage-donut-track" cx="60" cy="60" pathLength="100" r="50" />
          <circle
            className="storage-donut-progress"
            cx="60"
            cy="60"
            pathLength="100"
            r="50"
            strokeLinecap="round"
          />
        </svg>
        <span>
          <strong>{usedLabel}</strong>
          <small>Used</small>
        </span>
      </div>
    </div>
  );
}

function formatPercent(value) {
  const number = clampPercent(value);

  return `${number.toFixed(number % 1 === 0 ? 0 : 1)}%`;
}

function clampPercent(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.min(Math.max(number, 0), 100);
}

function formatResetTime(value) {
  if (!value) {
    return "Reset time unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Reset time unavailable";
  }

  return `Resets ${date.toLocaleString([], {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  })}`;
}

function formatRemainingWindow(window) {
  const remaining = Number(window?.remaining);
  const limit = Number(window?.limit);

  if (Number.isFinite(remaining) && Number.isFinite(limit)) {
    return `${formatEnhancedValue(remaining, "number")} / ${formatEnhancedValue(limit, "number")} left`;
  }

  return "Remaining unavailable";
}

function formatResetCreditDetail(resetCredit) {
  if (!resetCredit) {
    return "No reset card";
  }

  const status = resetCredit.status ? ` ${resetCredit.status}` : "";
  const expires = resetCredit.expiresAt ? ` · ${formatResetTime(resetCredit.expiresAt).replace("Resets ", "expires ")}` : "";

  return `${resetCredit.label || "Reset card"}${status}${expires}`;
}

function statusLabel(status) {
  if (status === "querying") {
    return "Querying";
  }

  if (status === "error") {
    return "Error";
  }

  if (status === "missing") {
    return "Missing data";
  }

  return status || "";
}

function CodexUsagePreview({ data, status }) {
  if (status === "querying") {
    return (
      <div className="codex-usage-empty is-querying" role="status" aria-live="polite">
        <strong>Querying Codex usage</strong>
        <small>Waiting for the current quota and reset-card data.</small>
      </div>
    );
  }

  if (!data?.available) {
    return (
      <div className="codex-usage-empty" role="status">
        <strong>Codex usage unavailable</strong>
        <small>{data?.errorMessage || "Run codex login on this machine."}</small>
      </div>
    );
  }

  const windows = Array.isArray(data.windows) ? data.windows.slice(0, 2) : [];
  const resetCredit = Array.isArray(data.resetCredits) ? data.resetCredits[0] : null;
  const resetSummary = data.resetCreditSummary || {};
  const availableCount = Number.isFinite(Number(resetSummary.availableCount))
    ? Number(resetSummary.availableCount)
    : Array.isArray(data.resetCredits)
      ? data.resetCredits.length
      : 0;
  const totalEarnedCount = Number.isFinite(Number(resetSummary.totalEarnedCount))
    ? Number(resetSummary.totalEarnedCount)
    : availableCount;

  return (
    <section aria-label="Codex usage limits" className="codex-usage-card">
      <div className="codex-usage-windows">
        {windows.map((window) => {
          const percentRemaining = clampPercent(
            Number.isFinite(Number(window.percentRemaining)) ? window.percentRemaining : 100 - Number(window.percentUsed || 0),
          );
          const label = window.label || (window.code === "7d" ? "7 day" : "5 hour");

          return (
            <article className="codex-usage-window" key={window.code || label}>
              <div className="codex-usage-window-top">
                <span>{window.code || label}</span>
                <strong>{formatPercent(percentRemaining)}</strong>
              </div>
              <div
                aria-label={`${label} Codex remaining`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={percentRemaining}
                className="codex-usage-meter"
                role="meter"
              >
                <i aria-hidden="true" style={{ "--codex-remaining-percent": `${percentRemaining}%` }} />
              </div>
              <p>{formatRemainingWindow(window)}</p>
              <small>{formatResetTime(window.resetAt)}</small>
            </article>
          );
        })}
      </div>
      <footer className="codex-usage-footer">
        <span>
          <small>Plan</small>
          <strong>{data.planType || "Codex"}</strong>
        </span>
        <span>
          <small>Reset cards</small>
          <strong>{formatEnhancedValue(availableCount, "number")} available</strong>
        </span>
        <span>
          <small>Earned</small>
          <strong>{formatEnhancedValue(totalEarnedCount, "number")} earned</strong>
        </span>
      </footer>
      <div className="codex-reset-credit-detail">
        <span>
          <small>Latest card</small>
          <strong>{formatResetCreditDetail(resetCredit)}</strong>
        </span>
      </div>
    </section>
  );
}

function WeatherCurrentPreview({ data, status }) {
  if (status === "querying") {
    return (
      <div aria-live="polite" className="weather-widget-empty is-querying" role="status">
        <strong>Loading weather</strong>
        <small>Waiting for the latest Open-Meteo conditions.</small>
      </div>
    );
  }

  if (!data?.available) {
    return (
      <div className="weather-widget-empty" role="status">
        <strong>Weather unavailable</strong>
        <small>{data?.errorMessage || "Set a weather location first."}</small>
      </div>
    );
  }

  const temperatureUnit = weatherTemperatureUnit(data);
  const windUnit = weatherWindUnit(data);
  const locationLabel = weatherLocationLabel(data);
  const temperature = formatWeatherNumber(data.temperature);
  const feelsLike = formatWeatherNumber(data.feelsLike);
  const low = formatWeatherNumber(data.low);
  const high = formatWeatherNumber(data.high);
  const humidity = formatWeatherNumber(data.humidity);
  const windSpeed = formatWeatherNumber(data.windSpeed);
  const WeatherIcon = data.isDay === false ? FiMoon : data.isDay === true ? FiSun : FiCloud;
  const summaryLabel = `Weather for ${locationLabel}: ${temperature} ${weatherAccessibleUnit(
    temperatureUnit,
  )} and ${String(data.condition || "unknown").toLowerCase()}. Feels like ${feelsLike} ${weatherAccessibleUnit(
    temperatureUnit,
  )}. High ${high} ${weatherAccessibleUnit(temperatureUnit)}, low ${low} ${weatherAccessibleUnit(
    temperatureUnit,
  )}. Humidity ${humidity} percent. Wind ${windSpeed} ${windUnit}.`;

  return (
    <section aria-label={summaryLabel} className="weather-widget-summary weather-integration-card" role="img">
      <div className="weather-widget-hero">
        <span className="weather-widget-icon" aria-hidden="true">
          <WeatherIcon />
        </span>
        <small>{weatherLocationName(data)}</small>
        <strong>{temperature}°</strong>
        <span>{data.condition || "Unknown"}</span>
        <small>Feels {feelsLike}°</small>
      </div>
      <dl className="weather-widget-details" aria-hidden="true">
        <div>
          <dt>
            <FiThermometer />
            Range
          </dt>
          <dd>
            {low}° / {high}°
          </dd>
        </div>
        <div>
          <dt>
            <FiDroplet />
            Humidity
          </dt>
          <dd>{humidity}%</dd>
        </div>
        <div>
          <dt>
            <FiWind />
            Wind
          </dt>
          <dd>
            {windSpeed} {windUnit}
          </dd>
        </div>
      </dl>
    </section>
  );
}

const RECENT_MEDIA_FILTERS = [
  { key: "all", label: "All" },
  { key: "movies", label: "Movies" },
  { key: "shows", label: "Shows" },
  { key: "music", label: "Music" },
];

function formatRuntimeTicks(value) {
  const minutes = Math.round(Number(value || 0) / 600000000);

  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "";
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return hours > 0 ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes}m`;
}

function mediaMeta(item) {
  return [item.year, item.seasonEpisode || formatRuntimeTicks(item.runtimeTicks) || item.type]
    .filter(Boolean)
    .join(" · ");
}

function mediaCountLabel(data) {
  const today = Number(data?.counts?.today || 0);
  const week = Number(data?.counts?.week || 0);
  const all = Number(data?.counts?.all || data?.items?.length || 0);

  if (today > 0) {
    return `${today} new today`;
  }

  if (week > 0) {
    return `${week} new this week`;
  }

  return `${all} latest`;
}

function fallbackInitial(title) {
  return String(title || "J").trim().slice(0, 1).toUpperCase() || "J";
}

function filterStatusLabel(filterKey, count) {
  const filter = RECENT_MEDIA_FILTERS.find((entry) => entry.key === filterKey);
  const label = filter?.label || "Items";
  const noun = count === 1 ? "item" : "items";

  return `Showing ${count} recently added ${noun} for ${label}`;
}

function RecentMediaTile({ item, openUrl }) {
  const destination = item.detailUrl || openUrl || null;
  const className = `jellyfin-recent-item ${item.isLatest ? "is-latest" : ""}`;
  const content = (
    <>
      <span className="jellyfin-poster-frame">
        {item.imageUrl ? <img alt="" src={item.imageUrl} /> : <span aria-hidden="true">{fallbackInitial(item.title)}</span>}
        {item.isLatest ? <em>Latest</em> : null}
      </span>
      <strong>{item.title}</strong>
      <small>{mediaMeta(item)}</small>
    </>
  );

  if (!destination) {
    return (
      <div className={className}>
        {content}
      </div>
    );
  }

  return (
    <a
      aria-label={`Open ${item.title} in Jellyfin (opens in new tab)`}
      className={className}
      href={destination}
      rel="noopener noreferrer"
      target="_blank"
      onClick={(event) => event.stopPropagation()}
    >
      {content}
    </a>
  );
}

function RecentMediaRowPreview({ data, openUrl, status }) {
  const [activeFilter, setActiveFilter] = useState("all");
  const items = Array.isArray(data?.items) ? data.items : [];
  const counts = useMemo(
    () => ({
      all: items.length,
      movies: items.filter((item) => item.group === "movies").length,
      music: items.filter((item) => item.group === "music").length,
      shows: items.filter((item) => item.group === "shows").length,
    }),
    [items],
  );
  const visibleItems = items
    .filter((item) => activeFilter === "all" || item.group === activeFilter)
    .slice(0, 5);
  const filterAnnouncement = filterStatusLabel(activeFilter, visibleItems.length);

  if (status === "querying" && items.length === 0) {
    return (
      <div aria-live="polite" className="jellyfin-recent-state" role="status">
        <strong>Loading recent Jellyfin media</strong>
        <small>Waiting for the latest library additions.</small>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="jellyfin-recent-state" role="status">
        <strong>No recent additions</strong>
        <small>New Jellyfin media will appear here after the next refresh.</small>
        {openUrl ? <a href={openUrl}>Open Jellyfin</a> : null}
      </div>
    );
  }

  return (
    <section aria-label="Jellyfin recently added media" className="jellyfin-recent-card">
      <p aria-atomic="true" className="visually-hidden" role="status">
        {filterAnnouncement}
      </p>
      <div className="jellyfin-recent-toolbar">
        <span>
          <i aria-hidden="true" />
          {mediaCountLabel(data)}
        </span>
        <div aria-label="Recently added filters" className="jellyfin-recent-filters" role="group">
          {RECENT_MEDIA_FILTERS.map((filter) => (
            <button
              aria-pressed={activeFilter === filter.key}
              disabled={counts[filter.key] === 0}
              key={filter.key}
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setActiveFilter(filter.key);
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>
      <div className="jellyfin-recent-rail">
        {visibleItems.map((item) => (
          <RecentMediaTile item={item} key={item.id} openUrl={openUrl} />
        ))}
      </div>
      <footer className="jellyfin-recent-footer">
        {openUrl ? <a href={openUrl}>Open Jellyfin</a> : <span>Jellyfin Enhanced</span>}
        <small>
          {data?.syncedAt
            ? `Synced ${new Date(data.syncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Jellyfin Enhanced"}
        </small>
      </footer>
    </section>
  );
}

export function EnhancedWidgetRenderer({ openUrl, service, style, template, widget }) {
  const renderer = widget.enhancedRenderer || template.enhanced || template.integration;
  const data = widget.enhancedData || {};
  const fields = renderer?.fields || [];
  const rendererName = renderer?.renderer || "metric-list";
  const integrationIconService = {
    color: renderer?.color || template.integration?.color || style.accentColor || "#2f80d1",
    iconKey: renderer?.iconKey || template.integration?.iconKey || "custom",
    iconKind: renderer?.iconKind || template.integration?.iconKind || "preset",
  };
  const headerIconService = service || integrationIconService;
  const sourceLabel = service?.name || (widget.integrationId || template.integration ? "Integration" : "Enhanced");
  const currentStatusLabel = widget.enhancedStateStatus && widget.enhancedStateStatus !== "ok"
    ? statusLabel(widget.enhancedStateStatus)
    : "";
  const isQbittorrentTransfer =
    rendererName === "metric-pair" &&
    (widget.enhancedWidgetId === "transfer-speed" ||
      service?.typeId === "qbittorrent" ||
      service?.iconKey === "qbittorrent" ||
      service?.name === "qBittorrent");

  return (
    <div
      className={`widget-renderer widget-renderer-enhanced widget-renderer-enhanced-${rendererName} ${
        isQbittorrentTransfer ? "widget-renderer-enhanced-qbittorrent-ops" : ""
      }`}
      style={{
        "--widget-accent": style.accentColor || service?.color || "#2f80d1",
        "--widget-opacity": style.backgroundOpacity ?? 0.74,
        "--widget-radius": `${style.radius || 18}px`,
      }}
    >
      <header className="widget-renderer-header system-widget-header">
        <ServiceIcon service={headerIconService} />
        <span>
          <strong>{widget.title || template.name}</strong>
          <small>
            {sourceLabel}
            {currentStatusLabel ? ` · ${currentStatusLabel}` : ""}
          </small>
        </span>
        <FiMoreHorizontal aria-hidden="true" />
      </header>

      {rendererName === "json-preview" ? <JsonPreview data={data} /> : null}
      {rendererName === "table" ? <TablePreview data={data} fields={fields} /> : null}
      {rendererName === "sparkline" ? <SparklinePreview data={data} fields={fields} /> : null}
      {rendererName === "storage-donut" ? <StorageDonutPreview data={data} /> : null}
      {rendererName === "codex-usage" ? <CodexUsagePreview data={data} status={widget.enhancedStateStatus} /> : null}
      {rendererName === "weather-current" ? <WeatherCurrentPreview data={data} status={widget.enhancedStateStatus} /> : null}
      {rendererName === "recent-media-row" ? (
        <RecentMediaRowPreview data={data} openUrl={openUrl || service?.url} status={widget.enhancedStateStatus} />
      ) : null}
      {!["json-preview", "table", "sparkline", "storage-donut", "codex-usage", "weather-current", "recent-media-row"].includes(rendererName) ? (
        <MetricFields data={data} fields={fields} rendererName={rendererName} variant={isQbittorrentTransfer ? "qbittorrent" : ""} />
      ) : null}
    </div>
  );
}
