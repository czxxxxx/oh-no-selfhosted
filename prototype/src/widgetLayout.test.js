import { describe, expect, test } from "vitest";
import { findAvailableWidgetPosition, widgetRectsOverlap } from "./widgetLayout.js";

describe("widget layout placement", () => {
  test("places a new widget beside an existing widget when space is available", () => {
    expect(findAvailableWidgetPosition([{ h: 3, w: 2, x: 0, y: 0 }], { h: 2, w: 3 })).toEqual({
      x: 2,
      y: 0,
    });
  });

  test("moves to the first free row when the current rows are occupied", () => {
    expect(findAvailableWidgetPosition([{ h: 2, w: 12, x: 0, y: 0 }], { h: 3, w: 4 })).toEqual({
      x: 0,
      y: 2,
    });
  });

  test("treats edge-touching widget rectangles as non-overlapping", () => {
    expect(widgetRectsOverlap({ h: 3, w: 2, x: 0, y: 0 }, { h: 2, w: 3, x: 2, y: 0 })).toBe(false);
  });
});
