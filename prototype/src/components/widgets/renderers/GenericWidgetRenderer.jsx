import { FiActivity, FiDatabase, FiExternalLink, FiGrid, FiLink, FiUsers } from "react-icons/fi";
import { ServiceIcon } from "../../../iconRegistry.jsx";

const PHOTO_CARD_BACKGROUND =
  "radial-gradient(circle at 28% 20%, rgba(255,255,255,.72), transparent 30%), linear-gradient(145deg, #c9d8d5 0%, #6f8984 48%, #243938 100%)";

function fallbackText(value, fallback = "") {
  return value || fallback;
}

export function GenericWidgetRenderer({ service, template, widget }) {
  const style = widget.style || {};
  const density = style.density || template.defaultStyle?.density || "comfortable";
  const title = fallbackText(widget.title, service?.name || template.name);
  const subtitle = fallbackText(widget.subtitle, service?.description || template.description);
  const category = service?.category || "Custom";
  const status = service?.status || "Ready";
  const isCompactDensity = density === "compact";
  const isPhotoCard = template.id === "custom-card" && style.visual === "photo";
  const shouldShowStatus = style.showStatus && !isPhotoCard && !isCompactDensity;

  return (
    <div
      className={`widget-renderer widget-renderer-${template.id} ${
        isPhotoCard ? "widget-renderer-photo" : ""
      } density-${density}`}
      style={{
        "--hero-card-image": PHOTO_CARD_BACKGROUND,
        "--widget-accent": style.accentColor || service?.color || "#2f80d1",
        "--widget-opacity": style.backgroundOpacity ?? 0.74,
        "--widget-radius": `${style.radius || 20}px`,
      }}
    >
      <header className="widget-renderer-header">
        <ServiceIcon
          service={service || { color: style.accentColor, iconKey: "custom", iconKind: "preset" }}
        />
        <span>
          <strong>{title}</strong>
          {style.showDescription ? <small>{subtitle}</small> : null}
        </span>
        {widget.url ? <FiExternalLink aria-hidden="true" /> : null}
      </header>

      {template.id === "hero" || template.id === "custom-card" ? (
        <div className="widget-renderer-body">
          {style.showCategory ? <span className="widget-pill">{category}</span> : null}
          <p>{subtitle}</p>
          {isPhotoCard ? (
            <>
              <div className="hero-widget-stats">
                <span>
                  <FiGrid aria-hidden="true" />
                  <strong>Services</strong>
                  <small>18 Online</small>
                </span>
                <span>
                  <FiActivity aria-hidden="true" />
                  <strong>Uptime</strong>
                  <small>99.92%</small>
                </span>
                <span>
                  <FiDatabase aria-hidden="true" />
                  <strong>Backups</strong>
                  <small>2h ago</small>
                </span>
                <span>
                  <FiUsers aria-hidden="true" />
                  <strong>Users</strong>
                  <small>4 Active</small>
                </span>
              </div>
              <footer className="hero-widget-link">
                <span>
                  <FiLink aria-hidden="true" />
                  Hub URL
                </span>
                <strong>{widget.url}</strong>
              </footer>
            </>
          ) : null}
        </div>
      ) : null}

      {shouldShowStatus ? (
        <footer className="widget-renderer-footer">
          <span className="status-dot" />
          <span>{status}</span>
        </footer>
      ) : null}
    </div>
  );
}
