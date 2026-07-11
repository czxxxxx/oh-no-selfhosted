import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { loadPluginDefinition, validateManifest, validateWidgetDefinitions } from "./manifest.mjs";

describe("enhanced manifest validation", () => {
  let pluginDir;

  beforeEach(async () => {
    pluginDir = await mkdtemp(join(tmpdir(), "oh-no-enhanced-manifest-"));
  });

  afterEach(async () => {
    await rm(pluginDir, { force: true, recursive: true });
  });

  test("accepts the qBittorrent manifest shape", () => {
    const manifest = validateManifest({
      configSchema: [
        { defaultFromService: "url", key: "baseUrl", label: "Endpoint URL", required: true, type: "url" },
        { key: "username", label: "Username", required: true, type: "text" },
        { key: "password", label: "Password", required: true, type: "password" },
        { default: 5, key: "pollIntervalSeconds", label: "Poll interval", min: 2, type: "number" },
      ],
      description: "Transfer speed, torrent list, and queue health.",
      entry: "adapter.mjs",
      id: "qbittorrent",
      name: "qBittorrent Enhanced",
      serviceTypes: ["qbittorrent"],
      version: "0.1.0",
      widgets: "widgets.json",
    });

    expect(manifest).toMatchObject({
      entry: "adapter.mjs",
      id: "qbittorrent",
      serviceTypes: ["qbittorrent"],
    });
  });

  test("rejects unsupported config field types", () => {
    expect(() =>
      validateManifest({
        configSchema: [{ key: "token", label: "Token", type: "secret-file" }],
        entry: "adapter.mjs",
        id: "bad",
        name: "Bad",
        serviceTypes: ["custom"],
        version: "0.1.0",
        widgets: "widgets.json",
      }),
    ).toThrow(/Unsupported config field type: secret-file/);
  });

  test("accepts host-rendered widget definitions", () => {
    const widgets = validateWidgetDefinitions([
      {
        dataPath: "transfer",
        defaultLayout: { h: 2, w: 4 },
        description: "Download and upload speed card.",
        fields: [
          { format: "bytesPerSecond", key: "downloadSpeed", label: "Download" },
          { format: "bytesPerSecond", key: "uploadSpeed", label: "Upload" },
        ],
        id: "transfer-speed",
        minLayout: { h: 2, w: 3 },
        name: "Transfer Speed",
        renderer: "metric-pair",
      },
    ]);

    expect(widgets[0]).toMatchObject({ id: "transfer-speed", renderer: "metric-pair" });
  });

  test("loads manifest and widgets from a plugin directory", async () => {
    await writeFile(
      join(pluginDir, "manifest.json"),
      JSON.stringify({
        configSchema: [{ key: "baseUrl", label: "Endpoint URL", required: true, type: "url" }],
        entry: "adapter.mjs",
        id: "fixture",
        name: "Fixture",
        serviceTypes: ["custom"],
        version: "0.1.0",
        widgets: "widgets.json",
      }),
    );
    await writeFile(
      join(pluginDir, "widgets.json"),
      JSON.stringify([
        {
          dataPath: "status",
          defaultLayout: { h: 2, w: 3 },
          fields: [{ key: "message", label: "Message", format: "text" }],
          id: "status",
          minLayout: { h: 2, w: 2 },
          name: "Status",
          renderer: "status-summary",
        },
      ]),
    );

    await expect(loadPluginDefinition(pluginDir)).resolves.toMatchObject({
      manifest: { id: "fixture" },
      widgets: [{ id: "status" }],
    });
  });
});
