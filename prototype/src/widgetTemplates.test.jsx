import { describe, expect, test } from "vitest";
import { createEnhancedTemplateId } from "./enhancedWidgetContract.js";
import {
  WIDGET_GRID_COLUMNS,
  getDefaultWidgetStyle,
  getWidgetTemplate,
  normalizeWidgetStyle,
} from "./widgetTemplates.js";

describe("widget template registry", () => {
  test("exposes a 12-column desktop grid", () => {
    expect(WIDGET_GRID_COLUMNS).toBe(12);
  });

  test("returns the initial template set", () => {
    expect(getWidgetTemplate("compact")).toMatchObject({
      defaultLayout: { h: 1, w: 3 },
      minLayout: { h: 1, w: 2 },
      id: "compact",
    });
    expect(getWidgetTemplate("wide")).toMatchObject({
      defaultLayout: { h: 2, w: 4 },
      id: "wide",
    });
    expect(getWidgetTemplate("hero")).toMatchObject({
      defaultLayout: { h: 4, w: 6 },
      id: "hero",
    });
    expect(getWidgetTemplate("custom-card")).toMatchObject({
      defaultLayout: { h: 5, w: 8 },
      id: "custom-card",
    });
    expect(getWidgetTemplate("weather-current")).toBeUndefined();
    expect(getWidgetTemplate("integration:weather-current")).toMatchObject({
      defaultLayout: { h: 3, w: 4 },
      id: "integration:weather-current",
      integration: expect.objectContaining({
        id: null,
        renderer: "metric-list",
      }),
      minLayout: { h: 2, w: 2 },
      name: "Integration",
    });
  });

  test("keeps compact widgets free of status rows", () => {
    expect(getDefaultWidgetStyle("compact")).toMatchObject({
      density: "compact",
      showStatus: false,
    });
    expect(
      normalizeWidgetStyle("wide", {
        density: "compact",
        showStatus: true,
      }),
    ).toMatchObject({
      density: "compact",
      showStatus: false,
    });
  });

  test("normalizes safe style values for a widget", () => {
    expect(
      normalizeWidgetStyle("custom-card", {
        accentColor: "not-a-color",
        backgroundOpacity: 8,
        density: "spacious",
        radius: -1,
        showCategory: false,
        showDescription: false,
        showStatus: true,
      }),
    ).toMatchObject({
      accentColor: "#2f80d1",
      backgroundOpacity: 1,
      density: "comfortable",
      radius: 8,
      showCategory: false,
      showDescription: false,
      showStatus: true,
    });
  });

  test("returns independent default style objects", () => {
    const first = getDefaultWidgetStyle("wide");
    const second = getDefaultWidgetStyle("wide");
    first.radius = 40;

    expect(second.radius).not.toBe(40);
  });

  test("fills host style defaults for dynamically registered React templates", () => {
    expect(
      getDefaultWidgetStyle("integration:remote:counter", {
        id: "integration:remote:counter",
      }),
    ).toMatchObject({
      accentColor: "#2f80d1",
      density: "comfortable",
      radius: 20,
      showStatus: true,
    });
  });

  test("normalizes enhanced widget templates by id prefix", () => {
    const style = normalizeWidgetStyle(createEnhancedTemplateId("service-qbit", "transfer-speed"), {
      accentColor: "#2f80d1",
      backgroundOpacity: 0.8,
      radius: 20,
    });

    expect(style).toMatchObject({
      accentColor: "#2f80d1",
      backgroundOpacity: 0.8,
      density: "comfortable",
      radius: 20,
      visual: "glass",
    });
  });
});
