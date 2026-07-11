import { useContainerWidth } from "react-grid-layout";
import ReactGridLayout from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { WIDGET_GRID_COLUMNS, getWidgetTemplate } from "../../widgetTemplates.js";
import { WidgetFrame } from "./WidgetFrame.jsx";
import { WidgetRenderer } from "./WidgetRenderer.jsx";

const DESKTOP_COLS = WIDGET_GRID_COLUMNS;
const MOBILE_COLS = 1;
const DESKTOP_MARGIN = [18, 18];
const MOBILE_MARGIN = [0, 16];
const ROW_HEIGHT = 92;

function buildServiceMap(services) {
  return new Map(services.map((service) => [service.id, service]));
}

function rendererNameForWidget(widget, template) {
  return widget.enhancedRenderer?.renderer || template.enhanced?.renderer || template.integration?.renderer || "";
}

export function resolveWidgetMinimums(widget, templateOverride = null) {
  const template = templateOverride || getWidgetTemplate(widget.templateId) || getWidgetTemplate("compact");
  const templateMinimums = {
    minH: template.minLayout?.h || 1,
    minW: template.minLayout?.w || 1,
  };

  if (widget.enhancedWidgetId === "transfer-speed") {
    return {
      minH: Math.max(widget.minH || 0, templateMinimums.minH, 3),
      minW: Math.max(templateMinimums.minW, 6),
    };
  }

  return {
    minH: widget.minH || templateMinimums.minH,
    minW: widget.minW || templateMinimums.minW,
  };
}

export function WidgetCanvas({
  editMode,
  onPatchWidget,
  onRefreshWidget,
  onSelectWidget,
  refreshingWidgetIds = new Set(),
  selectedWidgetId,
  services,
  templates = [],
  widgets,
}) {
  const { containerRef, mounted, width } = useContainerWidth({ initialWidth: 1280 });
  const serviceMap = buildServiceMap(services);
  const viewportWidth = typeof window === "undefined" ? width : window.innerWidth;
  const isNarrowCanvas = width < 700 && viewportWidth < 700;
  const cols = isNarrowCanvas ? MOBILE_COLS : DESKTOP_COLS;
  const margin = isNarrowCanvas ? MOBILE_MARGIN : DESKTOP_MARGIN;
  const templatesById = new Map(templates.map((template) => [template.id, template]));
  const layout = widgets.map((widget, index) => {
    const { minH, minW } = resolveWidgetMinimums(widget, templatesById.get(widget.templateId));
    const layoutH = Math.max(widget.h, minH);
    const layoutW = isNarrowCanvas ? 1 : Math.min(Math.max(widget.w, minW), cols);

    return {
      h: layoutH,
      i: widget.id,
      minH,
      minW: isNarrowCanvas ? 1 : minW,
      w: layoutW,
      x: isNarrowCanvas ? 0 : widget.x,
      y: isNarrowCanvas ? widgets.slice(0, index).reduce((total, current) => total + current.h, 0) : widget.y,
    };
  });
  const columnUnit = (width - margin[0] * (cols - 1)) / cols + margin[0];
  const rowUnit = ROW_HEIGHT + margin[1];

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function handleLayoutChange(nextLayout) {
    if (!editMode) {
      return;
    }

    nextLayout.forEach((item) => {
      const widget = widgets.find((candidate) => candidate.id === item.i);

      if (!widget || (widget.x === item.x && widget.y === item.y && widget.w === item.w && widget.h === item.h)) {
        return;
      }

      onPatchWidget(widget.id, { h: item.h, w: item.w, x: item.x, y: item.y });
    });
  }

  function beginWidgetDrag(widget, event) {
    if (!editMode || isNarrowCanvas) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSelectWidget(widget.id);

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startX = widget.x;
    const startY = widget.y;

    function handleMove(moveEvent) {
      const deltaX = Math.round((moveEvent.clientX - startClientX) / columnUnit);
      const deltaY = Math.round((moveEvent.clientY - startClientY) / rowUnit);
      const nextX = clamp(startX + deltaX, 0, Math.max(0, cols - widget.w));
      const nextY = Math.max(0, startY + deltaY);

      if (nextX !== widget.x || nextY !== widget.y) {
        onPatchWidget(widget.id, { x: nextX, y: nextY });
      }
    }

    function handleUp() {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      document.body.classList.remove("is-widget-interacting");
    }

    document.body.classList.add("is-widget-interacting");
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp, { once: true });
  }

  function beginWidgetResize(widget, handle, event) {
    if (!editMode || isNarrowCanvas) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSelectWidget(widget.id);

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startX = widget.x;
    const startY = widget.y;
    const startW = widget.w;
    const startH = widget.h;
    const { minH, minW } = resolveWidgetMinimums(widget, templatesById.get(widget.templateId));

    function handleMove(moveEvent) {
      const deltaX = Math.round((moveEvent.clientX - startClientX) / columnUnit);
      const deltaY = Math.round((moveEvent.clientY - startClientY) / rowUnit);
      let nextX = startX;
      let nextY = startY;
      let nextW = startW;
      let nextH = startH;

      if (handle.includes("e")) {
        nextW = clamp(startW + deltaX, minW, cols - startX);
      }

      if (handle.includes("s")) {
        nextH = Math.max(minH, startH + deltaY);
      }

      if (handle.includes("w")) {
        nextX = clamp(startX + deltaX, 0, startX + startW - minW);
        nextW = startW + startX - nextX;
      }

      if (handle.includes("n")) {
        nextY = clamp(startY + deltaY, 0, startY + startH - minH);
        nextH = startH + startY - nextY;
      }

      if (nextX !== widget.x || nextY !== widget.y || nextW !== widget.w || nextH !== widget.h) {
        onPatchWidget(widget.id, { h: nextH, w: nextW, x: nextX, y: nextY });
      }
    }

    function handleUp() {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      document.body.classList.remove("is-widget-interacting");
    }

    document.body.classList.add("is-widget-interacting");
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp, { once: true });
  }

  return (
    <div
      className={`widget-canvas-grid ${editMode ? "is-editing" : ""}`}
      data-testid="widget-canvas"
      ref={containerRef}
    >
      {mounted ? (
        <ReactGridLayout
          className="widget-grid-layout"
          cols={cols}
          compactType={null}
          isDraggable={false}
          isResizable={false}
          layout={layout}
          margin={margin}
          rowHeight={ROW_HEIGHT}
          width={width}
          onDragStart={() => {}}
          onDrag={handleLayoutChange}
          onDragStop={handleLayoutChange}
          onResizeStart={() => {}}
          onResize={handleLayoutChange}
          onResizeStop={handleLayoutChange}
        >
          {widgets.map((widget) => {
            const service = widget.serviceId ? serviceMap.get(widget.serviceId) : null;
            const template =
              templatesById.get(widget.templateId) || getWidgetTemplate(widget.templateId) || getWidgetTemplate("compact");
            const openUrl = service?.url || widget.url;
            const rendererName = rendererNameForWidget(widget, template);
            const containsInteractiveContent = rendererName === "recent-media-row" || Boolean(template.react);
            const canRefresh = Boolean(
              (widget.serviceId || widget.integrationId || template.integration?.id) &&
                (widget.enhancedRenderer || template.enhanced || template.integration),
            );

            return (
              <div key={widget.id}>
                <WidgetFrame
                  canRefresh={canRefresh}
                  containsInteractiveContent={containsInteractiveContent}
                  editMode={editMode}
                  isRefreshing={refreshingWidgetIds.has(widget.id)}
                  isSelected={selectedWidgetId === widget.id}
                  openUrl={openUrl}
                  service={service}
                  template={template}
                  widget={widget}
                  onBeginDrag={beginWidgetDrag}
                  onBeginResize={beginWidgetResize}
                  onRefresh={onRefreshWidget}
                  onSelect={onSelectWidget}
                >
                  <WidgetRenderer
                    onRefresh={onRefreshWidget}
                    openUrl={openUrl}
                    service={service}
                    template={template}
                    widget={widget}
                  />
                </WidgetFrame>
              </div>
            );
          })}
        </ReactGridLayout>
      ) : null}
    </div>
  );
}
