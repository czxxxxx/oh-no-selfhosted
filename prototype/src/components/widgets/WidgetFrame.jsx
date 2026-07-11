import { FiRefreshCw } from "react-icons/fi";
import { BorderGlow } from "./BorderGlow.jsx";

const resizeHandles = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];
const EDGE_AURA_BLUE = "#67e8f9";
const EDGE_AURA_AMBER = "#f0b56a";
const FALLBACK_ACCENT = "#2f80d1";

function normalizeHexColor(value, fallback = FALLBACK_ACCENT) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed;
  }

  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed
      .slice(1)
      .split("")
      .map((character) => `${character}${character}`)
      .join("")}`;
  }

  return fallback;
}

function hexToHslString(hexColor) {
  const color = normalizeHexColor(hexColor);
  const red = parseInt(color.slice(1, 3), 16) / 255;
  const green = parseInt(color.slice(3, 5), 16) / 255;
  const blue = parseInt(color.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;

  if (max !== min) {
    const delta = max - min;
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    if (max === red) {
      hue = (green - blue) / delta + (green < blue ? 6 : 0);
    } else if (max === green) {
      hue = (blue - red) / delta + 2;
    } else {
      hue = (red - green) / delta + 4;
    }

    hue /= 6;
  }

  return `${Math.round(hue * 360)} ${Math.round(saturation * 100)} ${Math.round(lightness * 100)}`;
}

function getWidgetEdgeAuraProps({ service, template, widget }) {
  const style = widget.style || {};
  const accent = normalizeHexColor(style.accentColor || service?.color || template.defaultStyle?.accentColor);
  const radius = style.radius || template.defaultStyle?.radius || 20;

  return {
    animated: false,
    borderRadius: radius,
    colors: [accent, EDGE_AURA_BLUE, EDGE_AURA_AMBER],
    coneSpread: 18,
    edgeSensitivity: 36,
    fillOpacity: 0.1,
    glowColor: hexToHslString(accent),
    glowIntensity: 0.62,
    glowRadius: 26,
  };
}

export function WidgetFrame({
  canRefresh,
  children,
  containsInteractiveContent = false,
  editMode,
  isRefreshing,
  isSelected,
  onBeginDrag,
  onBeginResize,
  onRefresh,
  onSelect,
  openUrl,
  service,
  template,
  widget,
}) {
  const label = `${template.name} - ${widget.w} x ${widget.h}`;
  const edgeAuraProps = getWidgetEdgeAuraProps({ service, template, widget });

  const content = (
    <>
      {children}
      {editMode ? <span className="widget-edit-label">{label}</span> : null}
    </>
  );

  return (
    <div className="widget-frame-root" data-widget-id={widget.id} style={{ zIndex: widget.zIndex }}>
      {widget.scopedCss ? <style>{widget.scopedCss}</style> : null}
      {editMode ? (
        <BorderGlow
          as="button"
          aria-label={`Select widget ${widget.title}`}
          className={`widget-frame ${isSelected ? "is-selected" : ""}`}
          type="button"
          onClick={() => onSelect(widget.id)}
          {...edgeAuraProps}
        >
          {content}
          <span
            className="widget-drag-surface"
            aria-hidden="true"
            onMouseDown={(event) => onBeginDrag(widget, event)}
          />
          {resizeHandles.map((handle) => (
            <span
              aria-hidden="true"
              className={`react-resizable-handle widget-resize-handle widget-resize-handle-${handle}`}
              key={handle}
              onMouseDown={(event) => onBeginResize(widget, handle, event)}
            />
          ))}
        </BorderGlow>
      ) : containsInteractiveContent ? (
        <BorderGlow as="div" aria-label={`Widget ${widget.title}`} className="widget-frame" role="group" {...edgeAuraProps}>
          {content}
        </BorderGlow>
      ) : openUrl ? (
        <BorderGlow
          as="a"
          aria-label={`Open widget ${widget.title}`}
          className="widget-frame"
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          {...edgeAuraProps}
        >
          {content}
        </BorderGlow>
      ) : (
        <BorderGlow as="div" aria-label={`Widget ${widget.title}`} className="widget-frame" role="group" {...edgeAuraProps}>
          {content}
        </BorderGlow>
      )}
      {canRefresh ? (
        <button
          aria-label={`Refresh ${widget.title || template.name} data`}
          className={`widget-refresh-control ${isRefreshing ? "is-refreshing" : ""}`}
          disabled={isRefreshing}
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRefresh?.(widget.id);
          }}
        >
          <FiRefreshCw aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
