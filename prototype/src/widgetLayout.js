import { WIDGET_GRID_COLUMNS } from "./widgetTemplates.js";

const OFFSCREEN_WIDGET_Y_THRESHOLD = 8;

function positiveInteger(value, fallback = 1) {
  const number = Number(value);

  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function nonNegativeInteger(value) {
  const number = Number(value);

  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function normalizeRect(widget, columns) {
  const w = Math.min(positiveInteger(widget?.w), columns);

  return {
    h: positiveInteger(widget?.h),
    w,
    x: Math.min(nonNegativeInteger(widget?.x), columns - w),
    y: nonNegativeInteger(widget?.y),
  };
}

export function widgetRectsOverlap(first, second) {
  return (
    first.x < second.x + second.w &&
    first.x + first.w > second.x &&
    first.y < second.y + second.h &&
    first.y + first.h > second.y
  );
}

export function normalizeLoadedWidgets(widgets) {
  if (!widgets.length) {
    return widgets;
  }

  const minY = Math.min(...widgets.map((widget) => Number(widget.y) || 0));

  if (minY <= OFFSCREEN_WIDGET_Y_THRESHOLD) {
    return widgets;
  }

  return widgets.map((widget) => ({
    ...widget,
    y: Math.max(0, (Number(widget.y) || 0) - minY),
  }));
}

export function findAvailableWidgetPosition(widgets, layout, columns = WIDGET_GRID_COLUMNS) {
  const normalizedColumns = positiveInteger(columns, WIDGET_GRID_COLUMNS);
  const occupied = widgets.map((widget) => normalizeRect(widget, normalizedColumns));
  const candidateSize = normalizeRect(layout, normalizedColumns);
  const lastOccupiedRow = occupied.reduce((max, widget) => Math.max(max, widget.y + widget.h), 0);
  const maxX = normalizedColumns - candidateSize.w;

  for (let y = 0; y <= lastOccupiedRow; y += 1) {
    for (let x = 0; x <= maxX; x += 1) {
      const candidate = { ...candidateSize, x, y };

      if (!occupied.some((widget) => widgetRectsOverlap(candidate, widget))) {
        return { x, y };
      }
    }
  }

  return { x: 0, y: lastOccupiedRow };
}
