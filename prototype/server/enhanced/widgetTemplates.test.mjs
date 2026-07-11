import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildServiceEnhancedWidgetTemplates } from "./widgetTemplates.mjs";

describe("buildServiceEnhancedWidgetTemplates", () => {
  test("keeps the qBittorrent transfer speed widget large enough for the operations card", async () => {
    const widgetsPath = fileURLToPath(new URL("./builtins/qbittorrent/widgets.json", import.meta.url));
    const widgets = JSON.parse(await readFile(widgetsPath, "utf8"));
    const transferSpeedWidget = widgets.find((widget) => widget.id === "transfer-speed");

    expect(transferSpeedWidget).toMatchObject({
      defaultLayout: { h: 3, w: 6 },
      minLayout: { h: 3, w: 6 },
    });
  });

  test("uses current built-in widget definitions for installed built-in adapters", () => {
    const store = {
      getServiceEnhancement() {
        return {
          adapterId: "qbittorrent",
          enabled: true,
          id: "enhancement-qbit",
        };
      },
      listEnhancedAdapters() {
        return [
          {
            id: "qbittorrent",
            manifest: { description: "Download Client", id: "qbittorrent" },
            sourceType: "built-in",
            widgets: [{ id: "transfer-speed", name: "Transfer Speed", renderer: "metric-pair" }],
          },
        ];
      },
      listServices() {
        return [{ id: "service-qbit", name: "qBittorrent", typeId: "qbittorrent" }];
      },
    };

    const templates = buildServiceEnhancedWidgetTemplates(store, [
      {
        manifest: { id: "qbittorrent" },
        widgets: [
          {
            defaultLayout: { h: 3, w: 6 },
            fields: [
              { format: "bytesPerSecond", key: "downloadSpeed", label: "Download" },
              { format: "bytesPerSecond", key: "uploadSpeed", label: "Upload" },
            ],
            id: "transfer-speed",
            minLayout: { h: 3, w: 4 },
            name: "Transfer Speed",
            refreshIntervalSeconds: 5,
            renderer: "metric-pair",
          },
        ],
      },
    ]);

    expect(templates).toEqual([
      expect.objectContaining({
        enhanced: expect.objectContaining({
          fields: [
            expect.objectContaining({ key: "downloadSpeed" }),
            expect.objectContaining({ key: "uploadSpeed" }),
          ],
          widgetId: "transfer-speed",
        }),
        refreshIntervalSeconds: 5,
      }),
    ]);
  });
});
