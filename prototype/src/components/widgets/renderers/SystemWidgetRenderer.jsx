import {
  FiActivity,
  FiDatabase,
  FiDownload,
  FiFileText,
  FiHardDrive,
  FiMoreHorizontal,
  FiUsers,
  FiZap,
} from "react-icons/fi";
import { ServiceIcon } from "../../../iconRegistry.jsx";

export const SYSTEM_WIDGET_TEMPLATE_IDS = new Set([
  "download-stats",
  "media-queue",
  "quick-actions",
  "storage-trend",
  "uptime-list",
]);

function fallbackText(value, fallback = "") {
  return value || fallback;
}

export function SystemWidgetRenderer({ service, template, widget }) {
  const style = widget.style || {};
  const density = style.density || template.defaultStyle?.density || "comfortable";
  const isCompactDensity = density === "compact";
  const shouldShowStatus = style.showStatus !== false && !isCompactDensity;
  const shouldShowHeaderMeta = !isCompactDensity;
  const title = fallbackText(widget.title, service?.name || template.name);
  const subtitle = fallbackText(widget.subtitle, service?.description || template.description);

  if (template.id === "download-stats") {
    return (
      <div
        className={`widget-renderer widget-renderer-download-stats density-${density}`}
        style={{
          "--widget-accent": style.accentColor || service?.color || "#2f80d1",
          "--widget-opacity": style.backgroundOpacity ?? 0.78,
          "--widget-radius": `${style.radius || 18}px`,
        }}
      >
        <header className="widget-renderer-header system-widget-header">
          <ServiceIcon service={service || { color: style.accentColor, iconKey: "qbittorrent", iconKind: "preset" }} />
          <span>
            <strong>{title}</strong>
            {shouldShowHeaderMeta ? (
              <small>
                {shouldShowStatus ? (
                  <>
                    <span className="status-dot" />
                    Online
                    <span className="header-divider" />
                  </>
                ) : null}
                {subtitle}
              </small>
            ) : null}
          </span>
          <FiMoreHorizontal aria-hidden="true" />
        </header>
        <div className="download-metrics">
          <span>
            <FiDownload aria-hidden="true" />
            <small>DL Speed</small>
            <strong>2.4 MB/s</strong>
          </span>
          <span>
            <FiUsers aria-hidden="true" />
            <small>Peers</small>
            <strong>156</strong>
          </span>
        </div>
      </div>
    );
  }

  if (template.id === "media-queue") {
    return (
      <div
        className={`widget-renderer widget-renderer-media-queue density-${density}`}
        style={{
          "--widget-accent": style.accentColor || service?.color || "#7e5bef",
          "--widget-opacity": style.backgroundOpacity ?? 0.72,
          "--widget-radius": `${style.radius || 18}px`,
        }}
      >
        <header className="widget-renderer-header system-widget-header">
          <ServiceIcon service={service || { color: style.accentColor, iconKey: "jellyfin", iconKind: "preset" }} />
          <span>
            <strong>{title}</strong>
            {shouldShowStatus ? (
              <small>
                <span className="status-dot" />
                Online
              </small>
            ) : null}
          </span>
          <FiMoreHorizontal aria-hidden="true" />
        </header>
        <div className="media-widget-feature">
          <div aria-label="Quiet Horizon poster artwork" className="media-widget-poster" role="img" />
          <span>
            <strong>Quiet Horizon</strong>
            <small>2026 · Demo media</small>
            <small>18:42 / 1:52:00</small>
            <span className="mini-progress">
              <span />
            </span>
          </span>
        </div>
        <div className="recent-strip" aria-label="Recently added">
          <small>Recently Added</small>
          <span className="poster-chip poster-chip-one" />
          <span className="poster-chip poster-chip-two" />
          <span className="poster-chip poster-chip-three" />
          <span className="poster-chip poster-chip-four" />
        </div>
        {shouldShowStatus ? (
          <footer className="widget-renderer-footer">
            <FiUsers aria-hidden="true" />
            <span>3 Active</span>
          </footer>
        ) : null}
      </div>
    );
  }

  if (template.id === "storage-trend") {
    return (
      <div
        className={`widget-renderer widget-renderer-storage-trend density-${density}`}
        style={{
          "--widget-accent": style.accentColor || "#4eaf6d",
          "--widget-opacity": style.backgroundOpacity ?? 0.74,
          "--widget-radius": `${style.radius || 18}px`,
        }}
      >
        <header className="widget-renderer-header system-widget-header">
          <FiHardDrive aria-hidden="true" />
          <span>
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </span>
          <FiMoreHorizontal aria-hidden="true" />
        </header>
        <div className="storage-widget-value">
          <strong>
            6.2 <span>TB</span>
          </strong>
          <small>of 12 TB used</small>
          <span>52%</span>
        </div>
        <div className="storage-widget-chart" aria-hidden="true">
          <span />
        </div>
      </div>
    );
  }

  if (template.id === "uptime-list") {
    const rows = [
      ["Jellyfin", "99.9%"],
      ["Nextcloud", "100%"],
      ["Home Assistant", "99.8%"],
      ["Prometheus", "99.9%"],
      ["Uptime Kuma", "100%"],
    ];

    return (
      <div
        className={`widget-renderer widget-renderer-uptime-list density-${density}`}
        style={{
          "--widget-accent": style.accentColor || "#4eaf6d",
          "--widget-opacity": style.backgroundOpacity ?? 0.74,
          "--widget-radius": `${style.radius || 18}px`,
        }}
      >
        <header className="widget-renderer-header system-widget-header">
          <FiActivity aria-hidden="true" />
          <span>
            <strong>{title}</strong>
            <small>All systems nominal</small>
          </span>
          <FiMoreHorizontal aria-hidden="true" />
        </header>
        <div className="uptime-widget-list">
          {rows.map(([name, value]) => (
            <span key={name}>
              <small>
                <span className="status-dot" />
                {name}
              </small>
              <strong>{value}</strong>
            </span>
          ))}
        </div>
        {shouldShowStatus ? <footer className="widget-renderer-footer">All systems operational</footer> : null}
      </div>
    );
  }

  if (template.id === "quick-actions") {
    const actions = [
      ["Run Backup Now", FiDatabase],
      ["Update Services", FiDownload],
      ["View Logs", FiFileText],
      ["System Status", FiActivity],
    ];

    return (
      <div
        className={`widget-renderer widget-renderer-quick-actions density-${density}`}
        style={{
          "--widget-accent": style.accentColor || "#17202b",
          "--widget-opacity": style.backgroundOpacity ?? 0.7,
          "--widget-radius": `${style.radius || 18}px`,
        }}
      >
        <header className="widget-renderer-header system-widget-header">
          <FiZap aria-hidden="true" />
          <span>
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </span>
          <FiMoreHorizontal aria-hidden="true" />
        </header>
        <div className="quick-action-grid">
          {actions.map(([label, Icon]) => (
            <span key={label}>
              <Icon aria-hidden="true" />
              {label}
            </span>
          ))}
          <span className="quick-action-add">+ Add Action</span>
        </div>
      </div>
    );
  }

  return null;
}
