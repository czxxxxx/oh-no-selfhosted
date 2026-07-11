import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createEnhancedRegistry } from "../enhanced/registry.mjs";
import { createIntegrationInstaller } from "../integrations/installer.mjs";
import { createIntegrationRegistry } from "../integrations/registry.mjs";
import { createWidgetPluginInstaller } from "../widgets/installer.mjs";
import { createWidgetPluginRegistry } from "../widgets/registry.mjs";
import { createBuiltInPluginRegistry } from "./builtinRegistry.mjs";

describe("built-in plugin registry", () => {
  let dataDir;

  afterEach(async () => {
    if (dataDir) {
      await rm(dataDir, { force: true, recursive: true });
    }
  });

  test("validates every built-in service, native widget, adapter, and integration", async () => {
    dataDir = await mkdtemp(join(tmpdir(), "oh-no-builtins-"));
    const integrationInstaller = createIntegrationInstaller({ dataDir });
    const widgetPluginInstaller = createWidgetPluginInstaller({ dataDir });
    const registry = createBuiltInPluginRegistry({
      enhancedRegistry: createEnhancedRegistry({ dataDir }),
      integrationRegistry: createIntegrationRegistry({
        builtInInstaller: integrationInstaller,
        installedDir: integrationInstaller.installedRoot,
      }),
      widgetPluginRegistry: createWidgetPluginRegistry({
        builtInInstaller: widgetPluginInstaller,
        installedDir: widgetPluginInstaller.installedRoot,
      }),
    });
    const result = await registry.inspect();

    expect(result).toMatchObject({
      counts: {
        adapterWidgets: 13,
        integrationWidgets: 2,
        integrations: 2,
        nativeWidgets: 9,
        serviceAdapters: 4,
        serviceTypes: 17,
      },
      id: "oh-no-builtins",
      sourceType: "local",
      status: "verified",
    });
    expect(result.contributions.nativeWidgets.map((widget) => widget.id)).toEqual([
      "compact",
      "wide",
      "hero",
      "custom-card",
      "download-stats",
      "media-queue",
      "storage-trend",
      "uptime-list",
      "quick-actions",
    ]);
    expect(result.contributions.serviceAdapters.map((adapter) => adapter.id).sort()).toEqual([
      "jellyfin",
      "portainer",
      "qbittorrent",
      "qnap",
    ]);
    expect(result.contributions.integrations.map((integration) => integration.id).sort()).toEqual([
      "codex-usage",
      "weather",
    ]);
  });
});
