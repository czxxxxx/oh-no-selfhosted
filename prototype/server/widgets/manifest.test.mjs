import { describe, expect, test } from "vitest";
import { validateWidgetPluginDefinitions, validateWidgetPluginManifest } from "./manifest.mjs";

describe("widget plugin manifest", () => {
  test("creates a first-class data-source-free React widget template", () => {
    const manifest = validateWidgetPluginManifest({
      apiVersion: "oh-no.dev/v1",
      description: "Clock widgets",
      frontend: { entry: "frontend.jsx", files: ["frontend.jsx", "clock.css"] },
      id: "acme.clock",
      kind: "widget",
      name: "Acme Clock",
      version: "1.0.0",
      widgets: "widgets.json",
    });
    const [widget] = validateWidgetPluginDefinitions(
      [
        {
          aliases: ["old-clock"],
          component: "ClockWidget",
          defaultLayout: { h: 2, w: 3 },
          description: "Local interactive clock",
          id: "clock",
          minLayout: { h: 1, w: 2 },
          name: "Clock",
          renderer: "react",
        },
      ],
      manifest,
    );

    expect(widget).toMatchObject({
      aliases: ["plugin:acme.clock:old-clock"],
      id: "plugin:acme.clock:clock",
      kind: "plugin-widget",
      plugin: { id: "acme.clock", renderer: "react", widgetId: "clock" },
      react: { exportName: "ClockWidget", pluginKind: "widget" },
    });
  });

  test("rejects impossible layout minimums", () => {
    const manifest = validateWidgetPluginManifest({
      description: "Clock widgets",
      frontend: "frontend.jsx",
      id: "acme.clock",
      name: "Acme Clock",
      version: "1.0.0",
      widgets: "widgets.json",
    });

    expect(() =>
      validateWidgetPluginDefinitions(
        [
          {
            defaultLayout: { h: 1, w: 2 },
            description: "Clock",
            id: "clock",
            minLayout: { h: 2, w: 3 },
            name: "Clock",
            renderer: "react",
          },
        ],
        manifest,
      ),
    ).toThrow(/minLayout must not exceed defaultLayout/);
  });
});
