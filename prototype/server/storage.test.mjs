import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createEnhancedTemplateId } from "../src/enhancedWidgetContract.js";
import { createServiceStore } from "./storage.mjs";

describe("service store", () => {
  let dataDir;
  let store;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "oh-no-services-"));
  });

  afterEach(async () => {
    store?.close();
    await rm(dataDir, { force: true, recursive: true });
  });

  test("starts with empty user services on first launch", () => {
    store = createServiceStore({ dataDir, now: () => "2026-07-03T00:00:00.000Z" });

    expect(store.listServices()).toEqual([]);
  });

  test("creates a qBittorrent preset service with built-in icon metadata", () => {
    store = createServiceStore({ dataDir, now: () => "2026-07-03T00:00:00.000Z" });

    const created = store.createService({
      typeId: "qbittorrent",
      url: "http://192.0.2.55:8080",
    });

    expect(created).toMatchObject({
      category: "Download",
      description: "Download Client",
      iconKey: "qbittorrent",
      iconKind: "preset",
      name: "qBittorrent",
      status: "Online",
      typeId: "qbittorrent",
      url: "http://192.0.2.55:8080",
    });
    expect(store.listServices().at(-1)).toMatchObject({
      id: created.id,
      url: "http://192.0.2.55:8080",
    });
  });

  test("rejects non-http service URLs", () => {
    store = createServiceStore({ dataDir, now: () => "2026-07-03T00:00:00.000Z" });

    expect(() =>
      store.createService({
        typeId: "custom",
        name: "Local Folder",
        url: "file:///Users/example/Downloads",
      }),
    ).toThrow(/URL must start with http:\/\/ or https:\/\//);
  });

  test("creates a custom service with provided favicon metadata", () => {
    store = createServiceStore({ dataDir, now: () => "2026-07-03T00:00:00.000Z" });

    const created = store.createService({
      iconKind: "favicon",
      iconUrl: "/api/icons/custom.ico",
      name: "Paperless Local",
      typeId: "custom",
      url: "https://paperless.home",
    });

    expect(created).toMatchObject({
      category: "Custom",
      description: "Custom Service",
      iconKey: "custom",
      iconKind: "favicon",
      iconUrl: "/api/icons/custom.ico",
      name: "Paperless Local",
      typeId: "custom",
      url: "https://paperless.home",
    });
  });

  test("starts with an empty widget canvas on first launch", () => {
    store = createServiceStore({ dataDir, now: () => "2026-07-03T00:00:00.000Z" });

    expect(store.listWidgets()).toEqual([]);
  });

  test("stores reusable integration instances and cached state separately from widgets", () => {
    store = createServiceStore({ dataDir, now: () => "2026-07-03T00:00:00.000Z" });
    const instance = store.createIntegrationInstance({
      config: { endpoint: "https://status.example.test", token: "secret" },
      integrationId: "status-source",
      name: "Primary status",
    });

    expect(store.listIntegrationInstances()).toEqual([
      expect.objectContaining({ config: undefined, id: instance.id, name: "Primary status" }),
    ]);
    expect(store.getIntegrationInstance(instance.id).config).toEqual({
      endpoint: "https://status.example.test",
      token: "secret",
    });
    store.saveIntegrationState(instance.id, {
      fetchedAt: "2026-07-03T00:00:00.000Z",
      state: { status: "online" },
      status: "ok",
    });
    expect(store.getIntegrationState(instance.id)).toMatchObject({
      state: { status: "online" },
      status: "ok",
    });
    expect(store.deleteIntegrationInstance(instance.id)).toBe(true);
  });

  test("migrates first-class widget template aliases during plugin updates", () => {
    store = createServiceStore({ dataDir, now: () => "2026-07-03T00:00:00.000Z" });
    const oldTemplate = {
      defaultLayout: { h: 2, w: 3 },
      description: "Old clock",
      id: "plugin:acme.clock:old-clock",
      minLayout: { h: 2, w: 2 },
      name: "Clock",
      plugin: { configFields: [], id: "acme.clock", renderer: "react" },
    };
    const widget = store.createWidget(
      { pluginId: "acme.clock", templateId: oldTemplate.id, title: "Clock" },
      { template: oldTemplate },
    );

    expect(
      store.migratePluginWidgetAliases({
        kind: "widget",
        pluginId: "acme.clock",
        templates: [{ aliases: [oldTemplate.id], id: "plugin:acme.clock:clock" }],
      }),
    ).toBe(1);
    expect(store.listWidgets().find((candidate) => candidate.id === widget.id)?.templateId).toBe(
      "plugin:acme.clock:clock",
    );
  });

  test("updates service basic information without changing its type metadata", () => {
    store = createServiceStore({ dataDir, now: () => "2026-07-03T00:00:00.000Z" });
    const service = store.createService({
      name: "Downloads - Main",
      typeId: "qbittorrent",
      url: "http://192.0.2.55:8080",
    });

    const updated = store.updateService(service.id, {
      dockSortOrder: 0,
      description: "Primary downloader",
      name: "Downloads - SSD",
      pinnedToDock: true,
      typeId: "qbittorrent",
      url: "http://192.0.2.56:8080",
    });

    expect(updated).toMatchObject({
      category: "Download",
      description: "Primary downloader",
      iconKey: "qbittorrent",
      dockSortOrder: 0,
      name: "Downloads - SSD",
      pinnedToDock: true,
      typeId: "qbittorrent",
      url: "http://192.0.2.56:8080",
    });
    expect(store.listServices()).toHaveLength(1);
  });

  test("updates pinned dock order independently from service type", () => {
    store = createServiceStore({ dataDir, now: () => "2026-07-03T00:00:00.000Z" });
    const qbit = store.createService({
      name: "qBit Main",
      pinnedToDock: true,
      typeId: "qbittorrent",
      url: "http://192.0.2.55:8080",
    });
    const grafana = store.createService({
      name: "Grafana",
      pinnedToDock: true,
      typeId: "grafana",
      url: "http://192.0.2.55:3000",
    });

    const services = store.updateDockOrder([grafana.id, qbit.id]);

    expect(services.find((service) => service.id === grafana.id)).toMatchObject({
      dockSortOrder: 0,
      pinnedToDock: true,
    });
    expect(services.find((service) => service.id === qbit.id)).toMatchObject({
      dockSortOrder: 1,
      pinnedToDock: true,
    });
  });

  test("deletes a service and cascades related widgets and enhanced state", () => {
    store = createServiceStore({ dataDir, now: () => "2026-07-03T00:00:00.000Z" });
    const service = store.createService({
      name: "Downloads",
      pinnedToDock: true,
      typeId: "qbittorrent",
      url: "http://192.0.2.55:8080",
    });
    store.upsertEnhancedAdapter({
      id: "qbittorrent",
      installedPath: "/tmp/qbittorrent",
      manifest: { id: "qbittorrent", name: "qBittorrent Enhanced", version: "0.1.0" },
      name: "qBittorrent Enhanced",
      sourceRef: "built-in",
      sourceType: "built-in",
      version: "0.1.0",
      widgets: [{ id: "transfer-speed", name: "Transfer Speed", renderer: "metric-pair" }],
    });
    const enhancement = store.saveServiceEnhancement(service.id, {
      adapterId: "qbittorrent",
      config: { baseUrl: service.url, password: "adminadmin", username: "admin" },
      enabled: true,
    });
    const widget = store.createWidget({
      enhancedWidgetId: "transfer-speed",
      enhancementId: enhancement.id,
      h: 2,
      serviceId: service.id,
      templateId: createEnhancedTemplateId(service.id, "transfer-speed"),
      title: "Downloads",
      w: 4,
      x: 0,
      y: 0,
    });
    store.saveEnhancedState(enhancement.id, {
      status: "ok",
      state: { transfer: { downloadSpeed: 20 } },
    });

    expect(store.deleteService(service.id)).toBe(true);
    expect(store.listServices().find((candidate) => candidate.id === service.id)).toBeUndefined();
    expect(store.listWidgets().find((candidate) => candidate.id === widget.id)).toBeUndefined();
    expect(store.getServiceEnhancement(service.id)).toBeNull();
    expect(store.getEnhancedState(enhancement.id)).toBeNull();
  });

  test("creates updates and deletes a custom widget", () => {
    store = createServiceStore({ dataDir, now: () => "2026-07-03T00:00:00.000Z" });

    const created = store.createWidget({
      h: 4,
      scopedCss: "",
      subtitle: "Internal docs",
      templateId: "custom-card",
      title: "Docs",
      url: "https://docs.home",
      w: 8,
      x: 2,
      y: 6,
    });

    expect(created).toMatchObject({
      h: 4,
      templateId: "custom-card",
      title: "Docs",
      url: "https://docs.home",
      w: 8,
    });

    const updated = store.updateWidget(created.id, {
      scopedCss: `[data-widget-id="${created.id}"] { --accent: #111111; }`,
      style: { accentColor: "#111111", radius: 24 },
      title: "Docs Hub",
      w: 9,
    });

    expect(updated).toMatchObject({
      scopedCss: `[data-widget-id="${created.id}"] { --accent: #111111; }`,
      style: expect.objectContaining({ accentColor: "#111111", radius: 24 }),
      title: "Docs Hub",
      w: 9,
    });

    expect(store.deleteWidget(created.id)).toBe(true);
    expect(store.listWidgets().find((widget) => widget.id === created.id)).toBeUndefined();
  });

  test("auto-places widgets created without explicit coordinates", () => {
    store = createServiceStore({ dataDir, now: () => "2026-07-03T00:00:00.000Z" });
    store.createWidget({
      h: 3,
      templateId: "custom-card",
      title: "Weather-sized widget",
      w: 2,
      x: 0,
      y: 0,
    });

    const created = store.createWidget({
      h: 2,
      templateId: "custom-card",
      title: "Plugin widget",
      w: 3,
    });

    expect(created).toMatchObject({ x: 2, y: 0 });
  });

  test("replaces widgets as one explicit editor save", () => {
    store = createServiceStore({ dataDir, now: () => "2026-07-03T00:00:00.000Z" });
    const created = store.createWidget({
      h: 4,
      templateId: "custom-card",
      title: "Docs",
      url: "https://docs.home",
      w: 8,
      x: 2,
      y: 6,
    });

    const saved = store.replaceWidgets([
      {
        ...created,
        h: 5,
        scopedCss: `[data-widget-id="${created.id}"] { --accent: #111111; }`,
        title: "Docs Hub",
        w: 9,
      },
      {
        h: 2,
        id: "widget-status",
        templateId: "wide",
        title: "Status",
        w: 4,
        x: 0,
        y: 0,
      },
    ]);

    expect(saved).toHaveLength(2);
    expect(store.listWidgets()).toEqual([
      expect.objectContaining({ id: "widget-status", title: "Status" }),
      expect.objectContaining({ id: created.id, h: 5, title: "Docs Hub", w: 9 }),
    ]);
  });

  test("rejects invalid widget layout and unsafe scoped CSS", () => {
    store = createServiceStore({ dataDir, now: () => "2026-07-03T00:00:00.000Z" });

    expect(() =>
      store.createWidget({
        h: 2,
        templateId: "wide",
        title: "Too wide",
        w: 13,
        x: 0,
        y: 0,
      }),
    ).toThrow(/Widget width must not exceed 12 columns/);

    const widget = store.createWidget({
      h: 2,
      templateId: "wide",
      title: "Safe",
      w: 4,
      x: 0,
      y: 0,
    });

    expect(() =>
      store.updateWidget(widget.id, {
        scopedCss: "body { background: red; }",
      }),
    ).toThrow(/Scoped CSS selectors must start with/);
  });

  test("stores installed enhanced adapters and registry sources", () => {
    store = createServiceStore({ dataDir, now: () => "2026-07-03T00:00:00.000Z" });

    const adapter = store.upsertEnhancedAdapter({
      id: "qbittorrent",
      installedPath: "/tmp/qbittorrent",
      manifest: { id: "qbittorrent", name: "qBittorrent Enhanced", version: "0.1.0" },
      name: "qBittorrent Enhanced",
      sourceRef: "built-in",
      sourceType: "built-in",
      version: "0.1.0",
      widgets: [{ id: "transfer-speed", name: "Transfer Speed", renderer: "metric-pair" }],
    });
    const source = store.createEnhancedRegistrySource({
      name: "Homelab Enhanced Apps",
      trusted: true,
      type: "github",
      url: "https://example.test/registry.json",
    });
    store.updateEnhancedRegistrySourceSync(source.id, {
      lastSyncMessage: "1 integration",
      lastSyncStatus: "ok",
      registryIndex: {
        apps: [],
        integrations: [{ id: "pingdom-lite", name: "Pingdom Lite", path: "integrations/pingdom-lite" }],
        serviceTypes: [],
      },
    });
    const integration = store.upsertInstalledIntegration({
      id: "pingdom-lite",
      installedPath: "/tmp/pingdom-lite",
      manifest: { id: "pingdom-lite", name: "Pingdom Lite", version: "1.0.0" },
      name: "Pingdom Lite",
      sourceId: source.id,
      sourceRef: "https://example.test/registry.json",
      sourceType: "github",
      templates: [{ id: "integration:pingdom-lite:status", name: "Endpoint Status" }],
      version: "1.0.0",
    });

    expect(adapter).toMatchObject({ id: "qbittorrent", sourceType: "built-in" });
    expect(store.listEnhancedAdapters()).toEqual([expect.objectContaining({ id: "qbittorrent" })]);
    expect(store.listEnhancedRegistrySources()).toEqual([
      expect.objectContaining({
        id: source.id,
        registryIndex: expect.objectContaining({ integrations: [expect.objectContaining({ id: "pingdom-lite" })] }),
        trusted: true,
      }),
    ]);
    expect(integration).toMatchObject({ id: "pingdom-lite", sourceId: source.id, sourceType: "github" });
    expect(store.listInstalledIntegrations()).toEqual([expect.objectContaining({ id: "pingdom-lite" })]);
  });

  test("stores service enhancement config and cached state", () => {
    store = createServiceStore({ dataDir, now: () => "2026-07-03T00:00:00.000Z" });
    const service = store.createService({
      typeId: "qbittorrent",
      url: "http://192.0.2.55:8080",
    });
    store.upsertEnhancedAdapter({
      id: "qbittorrent",
      installedPath: "/tmp/qbittorrent",
      manifest: { id: "qbittorrent", name: "qBittorrent Enhanced", version: "0.1.0" },
      name: "qBittorrent Enhanced",
      sourceRef: "built-in",
      sourceType: "built-in",
      version: "0.1.0",
      widgets: [{ id: "transfer-speed", name: "Transfer Speed", renderer: "metric-pair" }],
    });

    const enhancement = store.saveServiceEnhancement(service.id, {
      adapterId: "qbittorrent",
      config: {
        baseUrl: service.url,
        password: "adminadmin",
        pollIntervalSeconds: 5,
        username: "admin",
      },
      enabled: true,
    });
    const state = store.saveEnhancedState(enhancement.id, {
      status: "ok",
      state: { transfer: { downloadSpeed: 100, uploadSpeed: 50 } },
    });

    expect(enhancement).toMatchObject({ adapterId: "qbittorrent", enabled: true, serviceId: service.id });
    expect(state).toMatchObject({ status: "ok", state: { transfer: { downloadSpeed: 100, uploadSpeed: 50 } } });
    expect(store.getEnhancedState(enhancement.id)).toMatchObject({ status: "ok" });
  });

  test("creates an enhanced widget bound to adapter metadata", () => {
    store = createServiceStore({ dataDir, now: () => "2026-07-03T00:00:00.000Z" });
    const service = store.createService({
      typeId: "qbittorrent",
      url: "http://192.0.2.55:8080",
    });
    store.upsertEnhancedAdapter({
      id: "qbittorrent",
      installedPath: "/tmp/qbittorrent",
      manifest: { id: "qbittorrent", name: "qBittorrent Enhanced", version: "0.1.0" },
      name: "qBittorrent Enhanced",
      sourceRef: "built-in",
      sourceType: "built-in",
      version: "0.1.0",
      widgets: [{ id: "transfer-speed", name: "Transfer Speed", renderer: "metric-pair" }],
    });
    const enhancement = store.saveServiceEnhancement(service.id, {
      adapterId: "qbittorrent",
      config: { baseUrl: service.url, password: "adminadmin", username: "admin" },
      enabled: true,
    });
    const widget = store.createWidget({
      enhancedRenderer: {
        dataPath: "transfer",
        fields: [{ format: "bytesPerSecond", key: "downloadSpeed", label: "Download" }],
        renderer: "metric-pair",
      },
      enhancedWidgetId: "transfer-speed",
      enhancementId: enhancement.id,
      h: 2,
      serviceId: service.id,
      templateId: createEnhancedTemplateId(service.id, "transfer-speed"),
      title: "Transfer Speed",
      w: 4,
      x: 0,
      y: 8,
    });

    expect(widget).toMatchObject({
      enhancedWidgetId: "transfer-speed",
      enhancementId: enhancement.id,
      serviceId: service.id,
    });
  });

  test("rejects enhanced widgets that are not bound to the matching service enhancement", () => {
    store = createServiceStore({ dataDir, now: () => "2026-07-03T00:00:00.000Z" });
    const qbit = store.createService({
      typeId: "qbittorrent",
      url: "http://192.0.2.55:8080",
    });
    const grafana = store.createService({
      typeId: "grafana",
      url: "http://192.0.2.55:3000",
    });
    store.upsertEnhancedAdapter({
      id: "qbittorrent",
      installedPath: "/tmp/qbittorrent",
      manifest: { id: "qbittorrent", name: "qBittorrent Enhanced", version: "0.1.0" },
      name: "qBittorrent Enhanced",
      sourceRef: "built-in",
      sourceType: "built-in",
      version: "0.1.0",
      widgets: [{ id: "transfer-speed", name: "Transfer Speed", renderer: "metric-pair" }],
    });
    const enhancement = store.saveServiceEnhancement(qbit.id, {
      adapterId: "qbittorrent",
      config: { baseUrl: qbit.url, password: "adminadmin", username: "admin" },
      enabled: true,
    });

    expect(() =>
      store.createWidget({
        enhancedWidgetId: "transfer-speed",
        enhancementId: enhancement.id,
        h: 2,
        serviceId: grafana.id,
        templateId: createEnhancedTemplateId(grafana.id, "transfer-speed"),
        title: "Wrong Binding",
        w: 4,
        x: 0,
        y: 0,
      }),
    ).toThrow(/same service/);
  });
});
