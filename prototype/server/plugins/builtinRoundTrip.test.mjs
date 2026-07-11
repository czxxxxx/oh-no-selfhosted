import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { createEnhancedRegistry } from "../enhanced/registry.mjs";
import { createIntegrationInstaller } from "../integrations/installer.mjs";
import { createWidgetPluginInstaller } from "../widgets/installer.mjs";
import { createWidgetPluginRegistry } from "../widgets/registry.mjs";

describe("built-in registry extraction", () => {
  let rootDir;

  afterEach(async () => {
    if (rootDir) {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  test("installs copied built-in packages through the external registry pipeline", async () => {
    rootDir = await mkdtemp(join(tmpdir(), "oh-no-builtins-roundtrip-"));
    const externalRegistryDir = join(rootDir, "external-registry");
    const dataDir = join(rootDir, "data");
    await cp(resolve("builtins"), externalRegistryDir, { recursive: true });
    const registryUrl = pathToFileURL(join(externalRegistryDir, "registry.json")).href;
    const enhancedRegistry = createEnhancedRegistry({ builtInRegistryUrl: registryUrl, dataDir });
    const integrationInstaller = createIntegrationInstaller({ dataDir });
    const widgetInstaller = createWidgetPluginInstaller({ dataDir });

    const adapterDefinition = await enhancedRegistry.fetchRegistryAdapter(registryUrl, "qbittorrent");
    const integrationDefinition = await integrationInstaller.fetchRegistryIntegration(registryUrl, "weather");
    const widgetDefinition = await widgetInstaller.fetchRegistryWidgetPlugin(registryUrl, "oh-no.core-widgets");

    const [adapter, integration, widget] = await Promise.all([
      enhancedRegistry.installAdapter(adapterDefinition),
      integrationInstaller.installIntegration(integrationDefinition),
      widgetInstaller.installWidgetPlugin(widgetDefinition),
    ]);
    const adapterRuntime = await import(
      `${pathToFileURL(join(adapter.installedPath, adapter.manifest.entry)).href}?roundtrip=1`
    );
    const integrationRuntime = await import(
      `${pathToFileURL(join(integration.installedPath, integration.manifest.entry)).href}?roundtrip=1`
    );
    const widgetRegistry = createWidgetPluginRegistry({
      builtInInstaller: widgetInstaller,
      builtInRegistryUrl: registryUrl,
      installedDir: widgetInstaller.installedRoot,
    });
    const widgetInspection = await widgetRegistry.inspect();

    expect(adapter).toMatchObject({
      manifest: { id: "qbittorrent", kind: "service-adapter" },
      widgets: expect.arrayContaining([expect.objectContaining({ id: "transfer-speed" })]),
    });
    expect(adapterRuntime).toMatchObject({ fetchState: expect.any(Function), testConnection: expect.any(Function) });
    expect(integration).toMatchObject({
      manifest: { id: "weather", kind: "integration" },
      templates: expect.arrayContaining([expect.objectContaining({ id: "integration:weather-current" })]),
    });
    expect(integrationRuntime).toMatchObject({ readState: expect.any(Function) });
    expect(widget).toMatchObject({
      manifest: { id: "oh-no.core-widgets", kind: "widget", registration: "native" },
      widgets: expect.arrayContaining([
        expect.objectContaining({ id: "compact", kind: "native-widget", renderer: "generic" }),
        expect.objectContaining({ id: "quick-actions", kind: "native-widget", renderer: "system" }),
      ]),
    });
    expect(widgetInspection).toMatchObject({
      definitions: [
        expect.objectContaining({
          manifest: expect.objectContaining({ id: "oh-no.core-widgets", registration: "native" }),
          pluginDir: widget.installedPath,
        }),
      ],
      errors: [],
    });
  });
});
