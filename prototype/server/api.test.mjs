import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createEnhancedTemplateId } from "../src/enhancedWidgetContract.js";
import { createApiHandler as createServerApiHandler } from "./api.mjs";
import { createServiceStore } from "./storage.mjs";

function createApiHandler(options = {}) {
  return createServerApiHandler({ allowUnsafePlugins: true, ...options });
}

function jwtWithPayload(payload) {
  return [
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "",
  ].join(".");
}

function listen(handler) {
  const server = createServer(handler);

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();

      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((closeResolve) => server.close(closeResolve)),
      });
    });
  });
}

describe("service API", () => {
  let dataDir;
  let store;
  let server;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "oh-no-api-"));
    store = createServiceStore({ dataDir, now: () => "2026-07-03T00:00:00.000Z" });
  });

  afterEach(async () => {
    await server?.close();
    store?.close();
    await rm(dataDir, { force: true, recursive: true });
  });

  test("disables external plugin sources by default", async () => {
    server = await listen(createServerApiHandler({ dataDir, store }));
    const [pluginsResponse, registryResponse] = await Promise.all([
      fetch(`${server.baseUrl}/api/plugins`),
      fetch(`${server.baseUrl}/api/enhanced/registry-sources`),
    ]);
    const response = await fetch(`${server.baseUrl}/api/plugins/registry-sources`, {
      body: JSON.stringify({
        name: "Untrusted registry",
        trusted: true,
        type: "github",
        url: "https://example.test/registry.json",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    await expect(pluginsResponse.json()).resolves.toMatchObject({ externalPluginsEnabled: false });
    await expect(registryResponse.json()).resolves.toMatchObject({ externalPluginsEnabled: false });
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/external plugins are disabled/i),
    });
  });

  test("lists service types and starts with no user services", async () => {
    server = await listen(createApiHandler({ dataDir, store }));

    const [typesResponse, servicesResponse] = await Promise.all([
      fetch(`${server.baseUrl}/api/service-types`),
      fetch(`${server.baseUrl}/api/services`),
    ]);

    expect(typesResponse.status).toBe(200);
    expect(servicesResponse.status).toBe(200);

    const types = await typesResponse.json();
    const services = await servicesResponse.json();

    expect(types.serviceTypes.find((type) => type.id === "qbittorrent")).toMatchObject({
      iconKey: "qbittorrent",
      name: "qBittorrent",
    });
    expect(types.serviceTypes.at(-1)).toMatchObject({
      id: "custom",
      name: "Custom URL",
    });
    expect(services.services).toEqual([]);
  });

  test("uploads, lists, serves, and deletes custom dashboard backgrounds", async () => {
    server = await listen(
      createApiHandler({
        dataDir,
        now: () => "2026-07-10T09:00:00.000Z",
        store,
      }),
    );
    const imageBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const uploadResponse = await fetch(`${server.baseUrl}/api/backgrounds`, {
      body: JSON.stringify({
        dataUrl: `data:image/png;base64,${imageBytes.toString("base64")}`,
        filename: "Lake View.png",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(uploadResponse.status).toBe(201);
    const { background } = await uploadResponse.json();

    expect(background).toMatchObject({
      createdAt: "2026-07-10T09:00:00.000Z",
      name: "Lake View",
      sizeBytes: imageBytes.length,
    });
    expect(background.id).toMatch(/^custom-[a-f0-9]{64}$/);
    expect(background.imageUrl).toMatch(/^\/api\/backgrounds\/files\/[a-f0-9]{64}\.png$/);

    const listResponse = await fetch(`${server.baseUrl}/api/backgrounds`);
    await expect(listResponse.json()).resolves.toEqual({ backgrounds: [background] });

    const imageResponse = await fetch(`${server.baseUrl}${background.imageUrl}`);

    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers.get("content-type")).toBe("image/png");
    expect(imageResponse.headers.get("cache-control")).toContain("immutable");
    expect(Buffer.from(await imageResponse.arrayBuffer())).toEqual(imageBytes);

    const deleteResponse = await fetch(`${server.baseUrl}/api/backgrounds/${background.id}`, {
      method: "DELETE",
    });

    expect(deleteResponse.status).toBe(204);
    await expect(fetch(`${server.baseUrl}${background.imageUrl}`)).resolves.toMatchObject({ status: 404 });
    await expect(fetch(`${server.baseUrl}/api/backgrounds`).then((response) => response.json())).resolves.toEqual({
      backgrounds: [],
    });
  });

  test("rejects unsupported custom dashboard background formats", async () => {
    server = await listen(createApiHandler({ dataDir, store }));
    const response = await fetch(`${server.baseUrl}/api/backgrounds`, {
      body: JSON.stringify({
        dataUrl: `data:text/plain;base64,${Buffer.from("not an image").toString("base64")}`,
        filename: "notes.txt",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Background must be a JPG, PNG, WEBP, GIF, or AVIF image",
    });
  });

  test("creates a preset service without fetching favicon", async () => {
    const fetchCalls = [];
    server = await listen(
      createApiHandler({
        dataDir,
        fetchImpl: async (url) => {
          fetchCalls.push(url);
          return new Response("not used", { status: 500 });
        },
        store,
      }),
    );

    const response = await fetch(`${server.baseUrl}/api/services`, {
      body: JSON.stringify({
        typeId: "qbittorrent",
        url: "http://192.0.2.55:8080",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(201);
    expect(fetchCalls).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({
      service: {
        iconKind: "preset",
        iconKey: "qbittorrent",
        name: "qBittorrent",
        url: "http://192.0.2.55:8080",
      },
    });
  });

  test("creates a configured service type and then uses it for service creation", async () => {
    server = await listen(createApiHandler({ dataDir, store }));

    const typeResponse = await fetch(`${server.baseUrl}/api/service-types`, {
      body: JSON.stringify({
        aliases: ["tv", "shows"],
        category: "Media",
        color: "#35a853",
        description: "Series Manager",
        iconKind: "url",
        iconUrl: "https://cdn.example.test/sonarr.svg",
        id: "sonarr",
        name: "Sonarr",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(typeResponse.status).toBe(201);
    await expect(typeResponse.json()).resolves.toMatchObject({
      serviceType: { id: "sonarr", iconKind: "url", iconUrl: "https://cdn.example.test/sonarr.svg" },
    });

    const serviceResponse = await fetch(`${server.baseUrl}/api/services`, {
      body: JSON.stringify({
        typeId: "sonarr",
        url: "http://192.0.2.20:8989",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(serviceResponse.status).toBe(201);
    await expect(serviceResponse.json()).resolves.toMatchObject({
      service: {
        category: "Media",
        iconKind: "url",
        iconUrl: "https://cdn.example.test/sonarr.svg",
        name: "Sonarr",
        typeId: "sonarr",
      },
    });
  });

  test("updates service basic information", async () => {
    server = await listen(createApiHandler({ dataDir, store }));

    const createResponse = await fetch(`${server.baseUrl}/api/services`, {
      body: JSON.stringify({
        name: "Downloads - Main",
        typeId: "qbittorrent",
        url: "http://192.0.2.55:8080",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const { service } = await createResponse.json();

    const updateResponse = await fetch(`${server.baseUrl}/api/services/${service.id}`, {
      body: JSON.stringify({
        description: "Primary downloader",
        dockSortOrder: 0,
        name: "Downloads - SSD",
        pinnedToDock: true,
        typeId: "qbittorrent",
        url: "http://192.0.2.56:8080",
      }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      service: {
        description: "Primary downloader",
        dockSortOrder: 0,
        iconKey: "qbittorrent",
        name: "Downloads - SSD",
        pinnedToDock: true,
        typeId: "qbittorrent",
        url: "http://192.0.2.56:8080",
      },
    });
  });

  test("uploads and applies a custom service icon", async () => {
    const fetchCalls = [];
    server = await listen(
      createApiHandler({
        dataDir,
        fetchImpl: async (url) => {
          fetchCalls.push(String(url));
          return new Response("missing", { status: 404 });
        },
        store,
      }),
    );

    const uploadResponse = await fetch(`${server.baseUrl}/api/icons`, {
      body: JSON.stringify({
        dataUrl: `data:image/png;base64,${Buffer.from([137, 80, 78, 71]).toString("base64")}`,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(uploadResponse.status).toBe(201);
    const { icon } = await uploadResponse.json();
    expect(icon).toMatchObject({
      iconKind: "url",
      iconKey: "custom",
    });
    expect(icon.iconUrl).toMatch(/^\/api\/icons\/[a-f0-9]{64}\.png$/);

    const iconResponse = await fetch(`${server.baseUrl}${icon.iconUrl}`);
    expect(iconResponse.status).toBe(200);
    expect(iconResponse.headers.get("content-type")).toBe("image/png");

    const createResponse = await fetch(`${server.baseUrl}/api/services`, {
      body: JSON.stringify({
        name: "Docs",
        typeId: "custom",
        url: "https://docs.home",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const { service } = await createResponse.json();

    const updateResponse = await fetch(`${server.baseUrl}/api/services/${service.id}`, {
      body: JSON.stringify({
        iconKey: icon.iconKey,
        iconKind: icon.iconKind,
        iconUrl: icon.iconUrl,
        name: "Docs",
        typeId: "custom",
        url: "https://docs.home",
      }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      service: {
        iconKind: "url",
        iconKey: "custom",
        iconUrl: icon.iconUrl,
      },
    });
    expect(fetchCalls).toEqual(["https://docs.home/favicon.ico"]);
  });

  test("rejects active SVG custom service icons", async () => {
    server = await listen(
      createApiHandler({
        dataDir,
        fetchImpl: async () => new Response("missing", { status: 404 }),
        store,
      }),
    );
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#2563eb"/></svg>';

    const uploadResponse = await fetch(`${server.baseUrl}/api/icons`, {
      body: JSON.stringify({
        dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
        filename: "service.svg",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(uploadResponse.status).toBe(400);
    await expect(uploadResponse.json()).resolves.toEqual({
      error: "Icon upload must be PNG, JPG, WEBP, or ICO",
    });
  });

  test("updates Dock order through the API", async () => {
    server = await listen(createApiHandler({ dataDir, store }));
    const qbitResponse = await fetch(`${server.baseUrl}/api/services`, {
      body: JSON.stringify({
        name: "qBit Main",
        pinnedToDock: true,
        typeId: "qbittorrent",
        url: "http://192.0.2.55:8080",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const grafanaResponse = await fetch(`${server.baseUrl}/api/services`, {
      body: JSON.stringify({
        name: "Grafana",
        pinnedToDock: true,
        typeId: "grafana",
        url: "http://192.0.2.55:3000",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const { service: qbit } = await qbitResponse.json();
    const { service: grafana } = await grafanaResponse.json();

    const response = await fetch(`${server.baseUrl}/api/dock`, {
      body: JSON.stringify({ serviceIds: [grafana.id, qbit.id] }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      services: expect.arrayContaining([
        expect.objectContaining({ dockSortOrder: 0, id: grafana.id, pinnedToDock: true }),
        expect.objectContaining({ dockSortOrder: 1, id: qbit.id, pinnedToDock: true }),
      ]),
    });
  });

  test("deletes a service through the API", async () => {
    server = await listen(createApiHandler({ dataDir, store }));
    const createResponse = await fetch(`${server.baseUrl}/api/services`, {
      body: JSON.stringify({
        name: "Downloads",
        pinnedToDock: true,
        typeId: "qbittorrent",
        url: "http://192.0.2.55:8080",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const { service } = await createResponse.json();

    const deleteResponse = await fetch(`${server.baseUrl}/api/services/${service.id}`, {
      method: "DELETE",
    });

    expect(deleteResponse.status).toBe(204);
    expect(store.listServices().find((candidate) => candidate.id === service.id)).toBeUndefined();
  });

  test("falls back to default custom icon when favicon cannot be fetched", async () => {
    const fetchCalls = [];
    server = await listen(
      createApiHandler({
        dataDir,
        fetchImpl: async (url) => {
          fetchCalls.push(String(url));
          return new Response("missing", { status: 404 });
        },
        store,
      }),
    );

    const response = await fetch(`${server.baseUrl}/api/services`, {
      body: JSON.stringify({
        name: "Paperless Local",
        typeId: "custom",
        url: "https://paperless.home",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(201);
    expect(fetchCalls).toEqual(["https://paperless.home/favicon.ico"]);
    await expect(response.json()).resolves.toMatchObject({
      service: {
        iconKind: "default",
        iconKey: "custom",
        name: "Paperless Local",
      },
    });
  });

  test("caches and serves a custom favicon when URL favicon exists", async () => {
    server = await listen(
      createApiHandler({
        dataDir,
        fetchImpl: async () =>
          new Response(new Uint8Array([137, 80, 78, 71]), {
            headers: { "content-type": "image/png" },
            status: 200,
          }),
        store,
      }),
    );

    const createResponse = await fetch(`${server.baseUrl}/api/services`, {
      body: JSON.stringify({
        name: "Docs",
        typeId: "custom",
        url: "https://docs.home",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const { service } = await createResponse.json();

    expect(service).toMatchObject({
      iconKind: "favicon",
      name: "Docs",
    });
    expect(service.iconUrl).toMatch(/^\/api\/icons\/[a-f0-9]{64}\.png$/);

    const iconResponse = await fetch(`${server.baseUrl}${service.iconUrl}`);

    expect(iconResponse.status).toBe(200);
    expect(iconResponse.headers.get("content-type")).toBe("image/png");
    expect([...new Uint8Array(await iconResponse.arrayBuffer())]).toEqual([137, 80, 78, 71]);
  });

  test("lists widget templates and starts with no widgets", async () => {
    server = await listen(createApiHandler({ dataDir, store }));

    const [integrationsResponse, templatesResponse, widgetsResponse] = await Promise.all([
      fetch(`${server.baseUrl}/api/integrations`),
      fetch(`${server.baseUrl}/api/widget-templates`),
      fetch(`${server.baseUrl}/api/widgets`),
    ]);

    expect(integrationsResponse.status).toBe(200);
    expect(templatesResponse.status).toBe(200);
    expect(widgetsResponse.status).toBe(200);

    await expect(integrationsResponse.json()).resolves.toMatchObject({
      integrations: expect.arrayContaining([
        expect.objectContaining({
          id: "codex-usage",
          name: "Codex Usage",
            sourceType: "local",
          widgets: ["Codex Usage"],
        }),
      ]),
    });
    await expect(templatesResponse.json()).resolves.toMatchObject({
      templates: expect.arrayContaining([
        expect.objectContaining({ id: "custom-card" }),
        expect.objectContaining({
          id: "integration:codex-usage",
          integration: expect.objectContaining({ id: "codex-usage" }),
          name: "Codex Usage",
        }),
      ]),
    });
    await expect(widgetsResponse.json()).resolves.toMatchObject({ widgets: [] });
  });

  test("loads external integration plugins into the registry and refresh route", async () => {
    const pluginRoot = join(dataDir, "integration-plugins");
    const pluginDir = join(pluginRoot, "pingdom-lite");

    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      join(pluginDir, "manifest.json"),
      JSON.stringify({
        color: "#7c3aed",
        config: "HTTP status endpoint",
        description: "Synthetic endpoint status checks.",
        entry: "integration.mjs",
        iconKey: "activity",
        iconKind: "preset",
        id: "pingdom-lite",
        name: "Pingdom Lite",
        templates: "templates.json",
        version: "1.0.0",
      }),
    );
    await writeFile(
      join(pluginDir, "templates.json"),
      JSON.stringify([
        {
          configFields: [{ default: "https://status.example.test", key: "endpoint", label: "Endpoint", required: true, type: "url" }],
          dataPath: "",
          defaultLayout: { h: 2, w: 3 },
          description: "Endpoint availability snapshot.",
          fields: [
            { format: "text", key: "status", label: "Status" },
            { format: "number", key: "latencyMs", label: "Latency" },
          ],
          id: "integration:pingdom-lite-status",
          minLayout: { h: 2, w: 3 },
          name: "Endpoint Status",
          refreshIntervalSeconds: 60,
          renderer: "status-summary",
        },
      ]),
    );
    await writeFile(
      join(pluginDir, "integration.mjs"),
      `
export async function readState(config, context) {
  context.logger.info("reading pingdom-lite");
  return {
    available: true,
    endpoint: config.endpoint,
    latencyMs: 42,
    status: "online",
    checkedAt: context.now(),
  };
}
`,
    );

    server = await listen(
      createApiHandler({
        dataDir,
        integrationPluginDirs: [pluginRoot],
        now: () => "2026-07-03T00:00:00.000Z",
        store,
      }),
    );

    const [integrationsResponse, templatesResponse, refreshResponse] = await Promise.all([
      fetch(`${server.baseUrl}/api/integrations`),
      fetch(`${server.baseUrl}/api/widget-templates`),
      fetch(`${server.baseUrl}/api/integrations/pingdom-lite/refresh`, {
        body: JSON.stringify({ config: { endpoint: "https://api.example.test/health" } }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    ]);

    expect(integrationsResponse.status).toBe(200);
    expect(templatesResponse.status).toBe(200);
    expect(refreshResponse.status).toBe(200);
    await expect(integrationsResponse.json()).resolves.toMatchObject({
      integrations: expect.arrayContaining([
        expect.objectContaining({
          id: "pingdom-lite",
          name: "Pingdom Lite",
          sourceType: "local",
          widgets: ["Endpoint Status"],
        }),
      ]),
    });
    await expect(templatesResponse.json()).resolves.toMatchObject({
      integrationTemplates: expect.arrayContaining([
        expect.objectContaining({
          id: "integration:pingdom-lite-status",
          integration: expect.objectContaining({
            configFields: [expect.objectContaining({ key: "endpoint", type: "url" })],
            id: "pingdom-lite",
            renderer: "status-summary",
          }),
          name: "Endpoint Status",
        }),
      ]),
    });
    await expect(refreshResponse.json()).resolves.toMatchObject({
      state: {
        available: true,
        checkedAt: "2026-07-03T00:00:00.000Z",
        endpoint: "https://api.example.test/health",
        latencyMs: 42,
        status: "online",
      },
    });

    const createWidgetResponse = await fetch(`${server.baseUrl}/api/widgets`, {
      body: JSON.stringify({
        templateId: "integration:pingdom-lite-status",
        title: "Public status",
        x: 0,
        y: 0,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(createWidgetResponse.status).toBe(201);
    await expect(createWidgetResponse.json()).resolves.toMatchObject({
      widget: {
        enhancedRenderer: { renderer: "status-summary" },
        h: 2,
        integrationId: "pingdom-lite",
        minH: 2,
        minW: 3,
        templateId: "integration:pingdom-lite-status",
        w: 3,
      },
    });

  });

  test("lists widgets without waiting for integration data queries", async () => {
    let releaseUsage;
    let usageRequested = false;
    const usageGate = new Promise((resolve) => {
      releaseUsage = resolve;
    });

    store.replaceWidgets([
      {
        enhancedRenderer: { renderer: "codex-usage" },
        h: 3,
        id: "widget-codex",
        integrationId: "codex-usage",
        serviceId: null,
        templateId: "integration:codex-usage",
        title: "Codex Usage",
        w: 4,
        x: 0,
        y: 0,
      },
    ]);

    server = await listen(
      createApiHandler({
        dataDir,
        fetchImpl: async (url) => {
          if (String(url).endsWith("/wham/usage")) {
            usageRequested = true;
            await usageGate;
            return Response.json({ rate_limit: { primary_window: { used_percent: 20 } } });
          }

          return Response.json({ available_count: 0, credits: [], total_earned_count: 0 });
        },
        store,
      }),
    );

    const responsePromise = fetch(`${server.baseUrl}/api/widgets`);
    const response = await Promise.race([
      responsePromise,
      new Promise((resolve) => {
        setTimeout(() => resolve("timeout"), 50);
      }),
    ]);

    if (response === "timeout") {
      releaseUsage();
      await responsePromise.catch(() => null);
    }

    expect(response).not.toBe("timeout");
    expect(usageRequested).toBe(false);
    await expect(response.json()).resolves.toMatchObject({
      widgets: [
        expect.objectContaining({
          enhancedData: null,
          enhancedStateStatus: "querying",
          id: "widget-codex",
        }),
      ],
    });
  });

  test("lists enhanced widgets with cached state without refreshing the adapter", async () => {
    const service = store.createService({
      typeId: "qbittorrent",
      url: "http://192.0.2.55:8080",
    });
    const enhancement = store.saveServiceEnhancement(service.id, {
      adapterId: "qbittorrent",
      config: { baseUrl: service.url },
      enabled: true,
    });

    store.upsertEnhancedAdapter({
      id: "qbittorrent",
      installedPath: dataDir,
      manifest: { entry: "index.mjs", id: "qbittorrent", name: "qBittorrent Enhanced" },
      name: "qBittorrent Enhanced",
      sourceRef: "built-in",
      sourceType: "built-in",
      version: "1.0.0",
      widgets: [{ id: "transfer-speed", name: "Transfer Speed", renderer: "metric-pair" }],
    });
    store.saveEnhancedState(enhancement.id, {
      state: {
        transfer: {
          downloadSpeed: 2048,
          uploadSpeed: 1024,
        },
      },
      status: "ok",
    });
    store.replaceWidgets([
      {
        enhancedRenderer: { dataPath: "transfer", renderer: "metric-pair" },
        enhancedWidgetId: "transfer-speed",
        enhancementId: enhancement.id,
        h: 2,
        id: "widget-transfer",
        serviceId: service.id,
        templateId: createEnhancedTemplateId(service.id, "transfer-speed"),
        title: "Transfer Speed",
        w: 3,
        x: 0,
        y: 0,
      },
    ]);

    server = await listen(
      createApiHandler({
        dataDir,
        fetchImpl: async () => {
          throw new Error("adapter refresh should not run while listing widgets");
        },
        store,
      }),
    );

    const response = await fetch(`${server.baseUrl}/api/widgets`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      widgets: [
        expect.objectContaining({
          enhancedData: { downloadSpeed: 2048, uploadSpeed: 1024 },
          enhancedStateStatus: "ok",
          id: "widget-transfer",
        }),
      ],
    });
  });

  test("returns Codex usage integration data from local auth", async () => {
    const authDir = join(dataDir, ".codex");
    const authPath = join(authDir, "auth.json");
    const fetchCalls = [];

    await mkdir(authDir, { recursive: true });
    await writeFile(
      authPath,
      JSON.stringify({
        tokens: {
          access_token: "access-test",
          id_token: jwtWithPayload({
            "https://api.openai.com/auth": {
              chatgpt_account_id: "account-test",
            },
          }),
        },
      }),
    );

    server = await listen(
      createApiHandler({
        codexAuthPath: authPath,
        dataDir,
        fetchImpl: async (url, options = {}) => {
          fetchCalls.push({ headers: options.headers, url: String(url) });

          if (String(url).endsWith("/wham/usage")) {
            return Response.json({
              usage: {
                limits: [
                  { limit: 100, reset_at: "2026-07-04T18:00:00.000Z", used: 32, window: "5h" },
                  { limit: 400, reset_at: "2026-07-08T00:00:00.000Z", used: 86, window: "7d" },
                ],
              },
            });
          }

          return Response.json({ reset_credits: [] });
        },
        store,
      }),
    );

    const response = await fetch(`${server.baseUrl}/api/integrations/codex-usage`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      state: {
        available: true,
        windows: [
          expect.objectContaining({ code: "5h", percentUsed: 32 }),
          expect.objectContaining({ code: "7d", percentUsed: 21.5 }),
        ],
      },
    });
    expect(fetchCalls[0]).toMatchObject({
      headers: expect.objectContaining({ "ChatGPT-Account-Id": "account-test" }),
      url: "https://chatgpt.com/backend-api/wham/usage",
    });
  });

  test("returns Weather integration data for a widget location config", async () => {
    const fetchCalls = [];

    server = await listen(
      createApiHandler({
        dataDir,
        fetchImpl: async (url) => {
          fetchCalls.push(String(url));

          if (String(url).startsWith("https://geocoding-api.open-meteo.com/v1/search")) {
            return Response.json({
              results: [
                {
                  admin1: "Shanghai Municipality",
                  country: "China",
                  latitude: 31.22222,
                  longitude: 121.45806,
                  name: "Shanghai",
                  timezone: "Asia/Shanghai",
                },
              ],
            });
          }

          return Response.json({
            current: {
              apparent_temperature: 30.9,
              is_day: 0,
              relative_humidity_2m: 84,
              temperature_2m: 26.7,
              time: "2026-07-05T22:30",
              weather_code: 3,
              wind_speed_10m: 11.1,
            },
            current_units: {
              apparent_temperature: "°C",
              relative_humidity_2m: "%",
              temperature_2m: "°C",
              wind_speed_10m: "km/h",
            },
            daily: {
              temperature_2m_max: [30.2],
              temperature_2m_min: [24.2],
            },
            timezone: "Asia/Shanghai",
          });
        },
        store,
      }),
    );

    const response = await fetch(`${server.baseUrl}/api/integrations/weather/refresh`, {
      body: JSON.stringify({ config: { location: "Shanghai" } }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      state: {
        available: true,
        condition: "Overcast",
        location: { label: "Shanghai, Shanghai Municipality, China" },
        temperature: 26.7,
      },
    });
    expect(fetchCalls[0]).toContain("name=Shanghai");
    expect(fetchCalls[1]).toContain("latitude=31.22222");
  });

  test("creates patches and deletes widgets through the API", async () => {
    server = await listen(createApiHandler({ dataDir, store }));

    const createResponse = await fetch(`${server.baseUrl}/api/widgets`, {
      body: JSON.stringify({
        h: 4,
        subtitle: "Internal docs",
        templateId: "custom-card",
        title: "Docs",
        url: "https://docs.home",
        w: 8,
        x: 1,
        y: 8,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(createResponse.status).toBe(201);
    const { widget } = await createResponse.json();
    expect(widget).toMatchObject({ templateId: "custom-card", title: "Docs" });

    const patchResponse = await fetch(`${server.baseUrl}/api/widgets/${widget.id}`, {
      body: JSON.stringify({
        scopedCss: `[data-widget-id="${widget.id}"] { --accent: #2f80d1; }`,
        title: "Docs Hub",
      }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });

    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toMatchObject({
      widget: { title: "Docs Hub" },
    });

    const deleteResponse = await fetch(`${server.baseUrl}/api/widgets/${widget.id}`, {
      method: "DELETE",
    });

    expect(deleteResponse.status).toBe(204);
  });

  test("replaces widgets through a single explicit save endpoint", async () => {
    server = await listen(createApiHandler({ dataDir, store }));

    const response = await fetch(`${server.baseUrl}/api/widgets`, {
      body: JSON.stringify({
        widgets: [
          {
            h: 4,
            id: "widget-docs",
            scopedCss: `[data-widget-id="widget-docs"] { --accent: #2f80d1; }`,
            templateId: "custom-card",
            title: "Docs",
            url: "https://docs.home",
            w: 8,
            x: 1,
            y: 8,
          },
        ],
      }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      widgets: [expect.objectContaining({ id: "widget-docs", title: "Docs" })],
    });
    expect(store.listWidgets()).toEqual([expect.objectContaining({ id: "widget-docs" })]);
  });

  test("returns 400 for unsafe widget CSS", async () => {
    server = await listen(createApiHandler({ dataDir, store }));

    const response = await fetch(`${server.baseUrl}/api/widgets`, {
      body: JSON.stringify({
        h: 2,
        scopedCss: ".launcher { opacity: 0; }",
        templateId: "wide",
        title: "Unsafe",
        w: 4,
        x: 0,
        y: 0,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/Scoped CSS|blocked/),
    });
  });

  test("lists and installs enhanced adapters", async () => {
    server = await listen(createApiHandler({ dataDir, store }));

    const listResponse = await fetch(`${server.baseUrl}/api/enhanced/adapters`);
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      adapters: expect.arrayContaining([expect.objectContaining({ id: "qbittorrent" })]),
      externalPluginsEnabled: true,
    });

    const installResponse = await fetch(`${server.baseUrl}/api/enhanced/adapters/install`, {
      body: JSON.stringify({ adapterId: "qbittorrent", sourceType: "built-in" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(installResponse.status).toBe(201);
    await expect(installResponse.json()).resolves.toMatchObject({
      adapter: { id: "qbittorrent", sourceType: "local" },
    });
  });

  test("blocks uninstalling an enhanced adapter until dependent services are removed", async () => {
    server = await listen(createApiHandler({ dataDir, store }));
    const service = store.createService({
      typeId: "qbittorrent",
      url: "http://192.0.2.55:8080",
    });

    await fetch(`${server.baseUrl}/api/enhanced/adapters/install`, {
      body: JSON.stringify({ adapterId: "qbittorrent", sourceType: "built-in" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const enhancement = store.saveServiceEnhancement(service.id, {
      adapterId: "qbittorrent",
      config: { baseUrl: service.url, password: "adminadmin", username: "admin" },
      enabled: true,
    });
    const widget = store.createWidget({
      enhancedRenderer: { dataPath: "transfer", fields: [], renderer: "metric-pair" },
      enhancedWidgetId: "transfer-speed",
      enhancementId: enhancement.id,
      h: 2,
      serviceId: service.id,
      templateId: `enhanced:${service.id}:transfer-speed`,
      title: "Transfer",
      w: 4,
      x: 0,
      y: 10,
    });

    const blockedResponse = await fetch(`${server.baseUrl}/api/enhanced/adapters/qbittorrent`, {
      method: "DELETE",
    });

    expect(blockedResponse.status).toBe(400);
    expect(store.getEnhancedAdapter("qbittorrent")).not.toBeNull();
    store.deleteService(service.id);
    const deleteResponse = await fetch(`${server.baseUrl}/api/enhanced/adapters/qbittorrent`, {
      method: "DELETE",
    });

    expect(deleteResponse.status).toBe(204);
    expect(store.getEnhancedAdapter("qbittorrent")).toBeNull();
    expect(store.getServiceEnhancement(service.id)).toBeNull();
    expect(store.listWidgets().find((candidate) => candidate.id === widget.id)).toBeUndefined();
  });

  test("creates and syncs a GitHub registry source", async () => {
    const fetchImpl = async (url) => {
      if (String(url).endsWith("/registry.json")) {
        return Response.json({
          apps: [{ description: "Download speed", id: "qbittorrent", name: "qBittorrent", path: "apps/qbittorrent" }],
          name: "Homelab Enhanced Apps",
          version: 1,
        });
      }

      return new Response("missing", { status: 404 });
    };
    server = await listen(createApiHandler({ dataDir, fetchImpl, store }));

    const createResponse = await fetch(`${server.baseUrl}/api/enhanced/registry-sources`, {
      body: JSON.stringify({
        name: "Homelab Enhanced Apps",
        type: "github",
        url: "https://github.com/example/homelab-enhanced",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(createResponse.status).toBe(201);
    const { source } = await createResponse.json();

    const syncResponse = await fetch(`${server.baseUrl}/api/enhanced/registry-sources/${source.id}/sync`, {
      method: "POST",
    });
    expect(syncResponse.status).toBe(200);
    await expect(syncResponse.json()).resolves.toMatchObject({
      apps: [{ id: "qbittorrent" }],
      source: { lastSyncStatus: "ok" },
    });
  });

  test("installs service types, service adapters, integrations, and widgets from one trusted registry", async () => {
    const adapterManifest = {
      configSchema: [{ key: "baseUrl", label: "Endpoint URL", type: "url" }],
      entry: "adapter.mjs",
      id: "sonarr-enhanced",
      name: "Sonarr Enhanced",
      serviceTypes: ["sonarr"],
      version: "1.0.0",
      widgets: "widgets.json",
    };
    const adapterWidgets = [
      {
        dataPath: "queue",
        defaultLayout: { h: 2, w: 3 },
        id: "queue",
        minLayout: { h: 2, w: 2 },
        name: "Sonarr Queue",
        renderer: "status-summary",
      },
    ];
    const integrationManifest = {
      color: "#7c3aed",
      config: "HTTP status endpoint",
      configFields: [
        { key: "apiToken", label: "API token", required: true, type: "password" },
      ],
      description: "Synthetic endpoint status checks.",
      entry: "integration.mjs",
      frontend: {
        entry: "frontend.jsx",
        files: ["frontend.jsx"],
      },
      iconKey: "activity",
      iconKind: "preset",
      id: "pingdom-lite",
      name: "Pingdom Lite",
      templates: "templates.json",
      version: "1.2.0",
    };
    const integrationTemplates = [
      {
        configFields: [
          { key: "endpoint", label: "Endpoint", required: true, type: "url" },
        ],
        component: "EndpointStatusWidget",
        defaultLayout: { h: 2, w: 3 },
        description: "Endpoint availability snapshot.",
        fields: [{ format: "text", key: "status", label: "Status" }],
        id: "status",
        minLayout: { h: 2, w: 2 },
        name: "Endpoint Status",
        renderer: "react",
      },
    ];
    const fetchImpl = async (url) => {
      const value = String(url);

      if (value.endsWith("/registry.json")) {
        return Response.json({
          apps: [
            {
              description: "Queue and health widgets.",
              id: "sonarr-enhanced",
              name: "Sonarr Enhanced",
              path: "apps/sonarr-enhanced",
              serviceTypes: ["sonarr"],
              version: "1.0.0",
            },
          ],
          integrations: [
            {
              description: "Synthetic endpoint status checks.",
              id: "pingdom-lite",
              name: "Pingdom Lite",
              path: "integrations/pingdom-lite",
              version: "1.2.0",
            },
          ],
          name: "Homelab Plugins",
          serviceTypes: [
            {
              aliases: ["tv", "shows"],
              category: "Media",
              color: "#35a853",
              description: "Series Manager",
              iconKind: "url",
              iconUrl: "https://cdn.example.test/sonarr.svg",
              id: "sonarr",
              name: "Sonarr",
              replaces: ["sonarr"],
              version: "1.0.0",
            },
          ],
          version: 1,
        });
      }

      if (value.includes("/apps/sonarr-enhanced/manifest.json")) {
        return Response.json(adapterManifest);
      }

      if (value.includes("/apps/sonarr-enhanced/widgets.json")) {
        return Response.json(adapterWidgets);
      }

      if (value.includes("/apps/sonarr-enhanced/adapter.mjs")) {
        return new Response(
          "export async function testConnection(){return {ok:true,message:'ok'}}; export async function fetchState(){return {queue:{status:'ok'}}};",
        );
      }

      if (value.includes("/integrations/pingdom-lite/manifest.json")) {
        return Response.json(integrationManifest);
      }

      if (value.includes("/integrations/pingdom-lite/templates.json")) {
        return Response.json(integrationTemplates);
      }

      if (value.includes("/integrations/pingdom-lite/integration.mjs")) {
        return new Response(
          "export async function readState(config, context){return {available:true,endpoint:config.endpoint,status:'online',checkedAt:context.now()}};",
        );
      }

      if (value.includes("/integrations/pingdom-lite/frontend.jsx")) {
        return new Response(`
import React, { useState } from "react";
import "./widget.css";

export function EndpointStatusWidget({ data, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="pingdom-react-widget">
      <strong>{data.status || "waiting"}</strong>
      <button onClick={() => setExpanded((value) => !value)}>Toggle details</button>
      <button onClick={onRefresh}>Refresh</button>
      {expanded ? <small>{data.endpoint}</small> : null}
    </section>
  );
}
`);
      }

      if (value.includes("/integrations/pingdom-lite/widget.css")) {
        return new Response(".pingdom-react-widget { display: grid; gap: 8px; }");
      }

      return new Response("missing", { status: 404 });
    };
    server = await listen(
      createApiHandler({
        dataDir,
        fetchImpl,
        now: () => "2026-07-03T00:00:00.000Z",
        store,
      }),
    );

    const createResponse = await fetch(`${server.baseUrl}/api/plugins/registry-sources`, {
      body: JSON.stringify({
        name: "Homelab Plugins",
        trusted: true,
        type: "github",
        url: "https://github.com/example/homelab-plugins",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const { source } = await createResponse.json();
    const syncResponse = await fetch(`${server.baseUrl}/api/plugins/registry-sources/${source.id}/sync`, {
      method: "POST",
    });

    expect(syncResponse.status).toBe(200);
    await expect(syncResponse.json()).resolves.toMatchObject({
      apps: [{ id: "sonarr-enhanced" }],
      integrations: [{ id: "pingdom-lite" }],
      serviceTypes: [{ id: "sonarr", sourceId: source.id }],
    });

    for (const [kind, pluginId] of [
      ["service-type", "sonarr"],
      ["service-adapter", "sonarr-enhanced"],
      ["integration", "pingdom-lite"],
    ]) {
      const installResponse = await fetch(`${server.baseUrl}/api/plugins/install`, {
        body: JSON.stringify({ kind, pluginId, sourceId: source.id }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      expect(installResponse.status).toBe(201);
    }

    const [pluginsResponse, serviceTypesResponse, integrationsResponse, templatesResponse, refreshResponse] =
      await Promise.all([
        fetch(`${server.baseUrl}/api/plugins`),
        fetch(`${server.baseUrl}/api/service-types`),
        fetch(`${server.baseUrl}/api/integrations`),
        fetch(`${server.baseUrl}/api/widget-templates`),
        fetch(`${server.baseUrl}/api/integrations/pingdom-lite/refresh`, {
          body: JSON.stringify({ config: { endpoint: "https://status.example.test" } }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      ]);

    await expect(pluginsResponse.json()).resolves.toMatchObject({
      builtInRegistry: {
        counts: {
          integrations: 2,
          nativeWidgets: 9,
          serviceAdapters: 4,
          serviceTypes: 17,
        },
        status: "verified",
      },
      contributions: expect.arrayContaining([
        expect.objectContaining({ id: "sonarr", installed: true, kind: "service-type" }),
        expect.objectContaining({ id: "sonarr-enhanced", installed: true, kind: "service-adapter" }),
        expect.objectContaining({ id: "pingdom-lite", installed: true, kind: "integration" }),
      ]),
    });
    await expect(serviceTypesResponse.json()).resolves.toMatchObject({
      serviceTypes: expect.arrayContaining([expect.objectContaining({ id: "sonarr", sourceId: source.id })]),
    });
    await expect(integrationsResponse.json()).resolves.toMatchObject({
      integrations: expect.arrayContaining([expect.objectContaining({ id: "pingdom-lite", sourceType: "github" })]),
    });
    const templatesPayload = await templatesResponse.json();
    expect(templatesPayload).toMatchObject({
      integrationTemplates: expect.arrayContaining([
        expect.objectContaining({
          id: "integration:pingdom-lite:status",
          name: "Endpoint Status",
          react: expect.objectContaining({
            exportName: "EndpointStatusWidget",
            moduleUrl: expect.stringContaining(
              "/api/plugins/frontend/integration/pingdom-lite/frontend.js?v=",
            ),
            stylesheetUrl: expect.stringContaining(
              "/api/plugins/frontend/integration/pingdom-lite/frontend.css?v=",
            ),
          }),
        }),
      ]),
    });

    const remoteTemplate = templatesPayload.integrationTemplates.find(
      (template) => template.id === "integration:pingdom-lite:status",
    );
    const [frontendModuleResponse, frontendCssResponse] = await Promise.all([
      fetch(`${server.baseUrl}${remoteTemplate.react.moduleUrl}`),
      fetch(`${server.baseUrl}${remoteTemplate.react.stylesheetUrl}`),
    ]);

    expect(frontendModuleResponse.status).toBe(200);
    expect(frontendModuleResponse.headers.get("content-type")).toMatch(/javascript/);
    expect(await frontendModuleResponse.text()).toContain("__OH_NO_PLUGIN_RUNTIME__");
    expect(frontendCssResponse.status).toBe(200);
    expect(frontendCssResponse.headers.get("content-type")).toMatch(/text\/css/);
    expect(await frontendCssResponse.text()).toContain(".pingdom-react-widget");

    const credentialInstanceResponse = await fetch(`${server.baseUrl}/api/integration-instances`, {
      body: JSON.stringify({
        config: {
          apiToken: "integration-secret",
          endpoint: "https://private-status.example.test",
        },
        integrationId: "pingdom-lite",
        name: "Private status",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(credentialInstanceResponse.status).toBe(201);
    const credentialInstancePayload = await credentialInstanceResponse.json();
    expect(credentialInstancePayload.instance).not.toHaveProperty("config");
    expect(credentialInstancePayload.instance.configuredFields).toEqual(
      expect.arrayContaining(["apiToken", "endpoint"]),
    );

    const credentialUpdateResponse = await fetch(
      `${server.baseUrl}/api/integration-instances/${credentialInstancePayload.instance.id}`,
      {
        body: JSON.stringify({
          config: {
            apiToken: "",
            endpoint: "https://updated-status.example.test",
          },
        }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      },
    );
    expect(credentialUpdateResponse.status).toBe(200);
    expect(store.getIntegrationInstance(credentialInstancePayload.instance.id).config).toEqual({
      apiToken: "integration-secret",
      endpoint: "https://updated-status.example.test",
    });

    const createRemoteWidgetResponse = await fetch(`${server.baseUrl}/api/widgets`, {
      body: JSON.stringify({
        enhancedRenderer: { config: { endpoint: "https://saved-status.example.test" }, renderer: "react" },
        templateId: "integration:pingdom-lite:status",
        title: "Public status",
        x: 0,
        y: 0,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(createRemoteWidgetResponse.status).toBe(201);
    const createdRemoteWidgetPayload = await createRemoteWidgetResponse.json();
    expect(createdRemoteWidgetPayload).toMatchObject({
      widget: {
        enhancedRenderer: { renderer: "react" },
        h: 2,
        integrationId: "pingdom-lite",
        integrationInstanceId: expect.any(String),
        minH: 2,
        minW: 2,
        templateId: "integration:pingdom-lite:status",
        w: 3,
      },
    });
    expect(createdRemoteWidgetPayload.widget.enhancedRenderer).not.toHaveProperty("config");
    const savedInstance = store.getIntegrationInstance(
      createdRemoteWidgetPayload.widget.integrationInstanceId,
    );
    expect(savedInstance.config).toEqual({ endpoint: "https://saved-status.example.test" });
    const instanceRefreshResponse = await fetch(
      `${server.baseUrl}/api/integration-instances/${savedInstance.id}/refresh`,
      { method: "POST" },
    );
    await expect(instanceRefreshResponse.json()).resolves.toMatchObject({
      state: { endpoint: "https://saved-status.example.test", status: "online" },
    });
    expect(store.getIntegrationState(savedInstance.id)).toMatchObject({
      state: { endpoint: "https://saved-status.example.test", status: "online" },
      status: "ok",
    });
    await expect(refreshResponse.json()).resolves.toMatchObject({
      state: {
        available: true,
        checkedAt: "2026-07-03T00:00:00.000Z",
        endpoint: "https://status.example.test",
        status: "online",
      },
    });

    const deleteSourceResponse = await fetch(`${server.baseUrl}/api/plugins/registry-sources/${source.id}`, {
      method: "DELETE",
    });
    expect(deleteSourceResponse.status).toBe(204);
    const installedAfterSourceRemoval = await fetch(`${server.baseUrl}/api/plugins`);
    await expect(installedAfterSourceRemoval.json()).resolves.toMatchObject({
      contributions: expect.arrayContaining([
        expect.objectContaining({ id: "sonarr", installed: true, kind: "service-type" }),
        expect.objectContaining({ id: "sonarr-enhanced", installed: true, kind: "service-adapter" }),
        expect.objectContaining({ id: "pingdom-lite", installed: true, kind: "integration" }),
      ]),
      sources: [],
    });

    const inUseUninstallResponse = await fetch(
      `${server.baseUrl}/api/plugins/integration/pingdom-lite`,
      { method: "DELETE" },
    );
    expect(inUseUninstallResponse.status).toBe(400);
    await expect(inUseUninstallResponse.json()).resolves.toMatchObject({
      error: expect.stringMatching(/still used/),
    });
    const installedWidget = store.listWidgets().find(
      (candidate) => candidate.integrationId === "pingdom-lite",
    );
    await fetch(`${server.baseUrl}/api/widgets/${installedWidget.id}`, { method: "DELETE" });
    await fetch(`${server.baseUrl}/api/integration-instances/${savedInstance.id}`, {
      method: "DELETE",
    });
    await fetch(`${server.baseUrl}/api/integration-instances/${credentialInstancePayload.instance.id}`, {
      method: "DELETE",
    });

    for (const [kind, pluginId] of [
      ["integration", "pingdom-lite"],
      ["service-adapter", "sonarr-enhanced"],
      ["service-type", "sonarr"],
    ]) {
      const uninstallResponse = await fetch(`${server.baseUrl}/api/plugins/${kind}/${pluginId}`, {
        method: "DELETE",
      });

      expect(uninstallResponse.status).toBe(204);
    }

    const pluginsAfterUninstall = await fetch(`${server.baseUrl}/api/plugins`);
    await expect(pluginsAfterUninstall.json()).resolves.toMatchObject({ contributions: [], sources: [] });
  });

  test("blocks installing server-side code from an untrusted registry", async () => {
    server = await listen(
      createApiHandler({
        dataDir,
        fetchImpl: async () =>
          Response.json({
            apps: [],
            integrations: [{ id: "unsafe", name: "Unsafe", path: "integrations/unsafe" }],
            serviceTypes: [],
          }),
        store,
      }),
    );
    const createResponse = await fetch(`${server.baseUrl}/api/plugins/registry-sources`, {
      body: JSON.stringify({
        name: "Untrusted",
        type: "github",
        url: "https://github.com/example/untrusted",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const { source } = await createResponse.json();
    await fetch(`${server.baseUrl}/api/plugins/registry-sources/${source.id}/sync`, { method: "POST" });

    const installResponse = await fetch(`${server.baseUrl}/api/plugins/install`, {
      body: JSON.stringify({ kind: "integration", pluginId: "unsafe", sourceId: source.id }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(installResponse.status).toBe(400);
    await expect(installResponse.json()).resolves.toMatchObject({ error: expect.stringMatching(/trust/i) });
  });

  test("installs plugin dependencies first and protects reverse dependencies", async () => {
    const fetchImpl = async () =>
      Response.json({
        apps: [],
        integrations: [],
        name: "Dependency Registry",
        serviceTypes: [
          { id: "acme-base", name: "Acme Base", version: "1.2.0" },
          {
            id: "acme-child",
            name: "Acme Child",
            requires: [{ id: "acme-base", kind: "service-type", minVersion: "1.0.0" }],
            version: "1.0.0",
          },
          { id: "jellyfin", name: "Conflicting Jellyfin", version: "1.0.0" },
        ],
        version: 1,
        widgets: [],
      });
    server = await listen(createApiHandler({ dataDir, fetchImpl, store }));
    const sourceResponse = await fetch(`${server.baseUrl}/api/plugins/registry-sources`, {
      body: JSON.stringify({
        name: "Dependencies",
        trusted: true,
        type: "github",
        url: "https://github.com/example/dependency-plugins",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const { source } = await sourceResponse.json();
    await fetch(`${server.baseUrl}/api/plugins/registry-sources/${source.id}/sync`, { method: "POST" });
    const installResponse = await fetch(`${server.baseUrl}/api/plugins/install`, {
      body: JSON.stringify({ kind: "service-type", pluginId: "acme-child", sourceId: source.id }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(installResponse.status).toBe(201);
    const installedIds = new Set(
      (await (await fetch(`${server.baseUrl}/api/plugins`)).json()).contributions
        .filter((contribution) => contribution.installed)
        .map((contribution) => contribution.id),
    );
    expect([...installedIds]).toEqual(expect.arrayContaining(["acme-base", "acme-child"]));

    const blockedDependencyRemoval = await fetch(
      `${server.baseUrl}/api/plugins/service-type/acme-base`,
      { method: "DELETE" },
    );
    expect(blockedDependencyRemoval.status).toBe(400);
    await expect(blockedDependencyRemoval.json()).resolves.toMatchObject({
      error: expect.stringMatching(/required by service-type acme-child/),
    });

    const collisionResponse = await fetch(`${server.baseUrl}/api/plugins/install`, {
      body: JSON.stringify({ kind: "service-type", pluginId: "jellyfin", sourceId: source.id }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(collisionResponse.status).toBe(400);
    await expect(collisionResponse.json()).resolves.toMatchObject({
      error: expect.stringMatching(/conflicts with an existing plugin/),
    });

    expect(
      await fetch(`${server.baseUrl}/api/plugins/service-type/acme-child`, { method: "DELETE" }),
    ).toMatchObject({ status: 204 });
    expect(
      await fetch(`${server.baseUrl}/api/plugins/service-type/acme-base`, { method: "DELETE" }),
    ).toMatchObject({ status: 204 });
  });

  test("installs and creates a first-class React widget without a fake integration", async () => {
    const fetchImpl = async (url) => {
      const value = String(url);

      if (value.endsWith("/registry.json")) {
        return Response.json({
          name: "Widget Packs",
          widgets: [{ id: "acme.clock", name: "Acme Clock", path: "widgets/acme.clock", version: "1.0.0" }],
        });
      }

      if (value.endsWith("/manifest.json")) {
        return Response.json({
          apiVersion: "oh-no.dev/v1",
          description: "Standalone clocks",
          frontend: { entry: "frontend.jsx", files: ["frontend.jsx", "clock.css"] },
          id: "acme.clock",
          kind: "widget",
          name: "Acme Clock",
          version: "1.0.0",
          widgets: "widgets.json",
        });
      }

      if (value.endsWith("/widgets.json")) {
        return Response.json([
          {
            component: "ClockWidget",
            defaultLayout: { h: 2, w: 3 },
            description: "Local interactive clock",
            id: "clock",
            minLayout: { h: 1, w: 2 },
            name: "Clock",
            renderer: "react",
          },
        ]);
      }

      if (value.endsWith("/frontend.jsx")) {
        return new Response(
          'import React from "react"; import "./clock.css"; export function ClockWidget(){return <time>12:34</time>}',
        );
      }

      if (value.endsWith("/clock.css")) {
        return new Response("time { font-variant-numeric: tabular-nums; }");
      }

      return new Response("missing", { status: 404 });
    };
    server = await listen(createApiHandler({ dataDir, fetchImpl, store }));
    const sourceResponse = await fetch(`${server.baseUrl}/api/plugins/registry-sources`, {
      body: JSON.stringify({
        name: "Widget Packs",
        trusted: true,
        type: "github",
        url: "https://github.com/example/widget-packs",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const { source } = await sourceResponse.json();
    const syncResponse = await fetch(`${server.baseUrl}/api/plugins/registry-sources/${source.id}/sync`, {
      method: "POST",
    });

    expect(syncResponse.status).toBe(200);
    await expect(syncResponse.json()).resolves.toMatchObject({ widgets: [{ id: "acme.clock" }] });

    const installResponse = await fetch(`${server.baseUrl}/api/plugins/install`, {
      body: JSON.stringify({ kind: "widget", pluginId: "acme.clock", sourceId: source.id }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(installResponse.status).toBe(201);

    const templatesResponse = await fetch(`${server.baseUrl}/api/widget-templates`);
    const templatesPayload = await templatesResponse.json();
    const template = templatesPayload.pluginTemplates.find(
      (candidate) => candidate.id === "plugin:acme.clock:clock",
    );

    expect(template).toMatchObject({
      kind: "plugin-widget",
      plugin: { id: "acme.clock", renderer: "react" },
      react: { exportName: "ClockWidget", pluginKind: "widget" },
    });

    const createResponse = await fetch(`${server.baseUrl}/api/widgets`, {
      body: JSON.stringify({ templateId: template.id, title: "Living room clock" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(createResponse.status).toBe(201);
    const { widget } = await createResponse.json();
    expect(widget).toMatchObject({
      integrationId: null,
      pluginId: "acme.clock",
      templateId: "plugin:acme.clock:clock",
    });

    const frontendResponse = await fetch(`${server.baseUrl}${template.react.moduleUrl}`);
    expect(frontendResponse.status).toBe(200);
    expect(await frontendResponse.text()).toContain("__OH_NO_PLUGIN_RUNTIME__");

    const blockedUninstallResponse = await fetch(`${server.baseUrl}/api/plugins/widget/acme.clock`, {
      method: "DELETE",
    });
    expect(blockedUninstallResponse.status).toBe(400);
    await fetch(`${server.baseUrl}/api/widgets/${widget.id}`, { method: "DELETE" });
    const uninstallResponse = await fetch(`${server.baseUrl}/api/plugins/widget/acme.clock`, { method: "DELETE" });
    expect(uninstallResponse.status).toBe(204);
    expect(store.listWidgets()).toEqual([]);
    expect(store.getInstalledWidgetPlugin("acme.clock")).toBeNull();
  });

  test("rejects widget templates that are not in the active registry snapshot", async () => {
    server = await listen(createApiHandler({ dataDir, store }));

    const response = await fetch(`${server.baseUrl}/api/widgets`, {
      body: JSON.stringify({
        integrationId: "missing",
        templateId: "integration:missing:widget",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Widget template is not registered: integration:missing:widget",
    });
  });

  test("proxies Jellyfin media images with server-side auth", async () => {
    const fetchCalls = [];
    server = await listen(
      createApiHandler({
        dataDir,
        fetchImpl: async (url, options = {}) => {
          fetchCalls.push({ headers: options.headers, url: String(url) });

          if (String(url).includes("/Items/movie-1/Images/Primary")) {
            return new Response("poster-bytes", {
              headers: { "content-type": "image/jpeg" },
              status: 200,
            });
          }

          return Response.json({ ok: true });
        },
        store,
      }),
    );
    const service = store.createService({
      typeId: "jellyfin",
      url: "http://media.example.test:8096",
    });

    await fetch(`${server.baseUrl}/api/enhanced/adapters/install`, {
      body: JSON.stringify({ adapterId: "jellyfin", sourceType: "built-in" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    store.saveServiceEnhancement(service.id, {
      adapterId: "jellyfin",
      config: { apiKey: "jf_proxy_token", baseUrl: service.url },
      enabled: true,
    });

    const response = await fetch(
      `${server.baseUrl}/api/services/${service.id}/enhancement/media-image/movie-1?imageType=Primary&maxHeight=360`,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    await expect(response.text()).resolves.toBe("poster-bytes");
    expect(fetchCalls.find((call) => call.url.includes("/Items/movie-1/Images/Primary"))).toMatchObject({
      headers: expect.objectContaining({
        authorization: expect.stringContaining('Token="jf_proxy_token"'),
      }),
      url: expect.stringContaining("maxHeight=360"),
    });
  });

  test("does not proxy Jellyfin media images for disabled enhancements", async () => {
    const fetchCalls = [];
    const fetchImpl = async (url) => {
      fetchCalls.push(String(url));
      return Response.json({ ok: true });
    };
    server = await listen(createApiHandler({ dataDir, fetchImpl, store }));
    const service = store.createService({
      typeId: "jellyfin",
      url: "http://media.example.test:8096",
    });

    await fetch(`${server.baseUrl}/api/enhanced/adapters/install`, {
      body: JSON.stringify({ adapterId: "jellyfin", sourceType: "built-in" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    store.saveServiceEnhancement(service.id, {
      adapterId: "jellyfin",
      config: { apiKey: "jf_proxy_token", baseUrl: service.url },
      enabled: false,
    });

    const response = await fetch(
      `${server.baseUrl}/api/services/${service.id}/enhancement/media-image/movie-1?imageType=Primary&maxHeight=360`,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Service enhancement is disabled" });
    expect(fetchCalls).toEqual([]);
  });

  test("preserves Jellyfin service URL path prefixes when proxying media images", async () => {
    const fetchCalls = [];
    server = await listen(
      createApiHandler({
        dataDir,
        fetchImpl: async (url, options = {}) => {
          fetchCalls.push({ headers: options.headers, url: String(url) });

          if (String(url).includes("/jellyfin/Items/movie-1/Images/Primary")) {
            return new Response("poster-bytes", {
              headers: { "content-type": "image/jpeg" },
              status: 200,
            });
          }

          return new Response("missing", { status: 404 });
        },
        store,
      }),
    );
    const service = store.createService({
      typeId: "jellyfin",
      url: "https://media.example.test/jellyfin",
    });

    await fetch(`${server.baseUrl}/api/enhanced/adapters/install`, {
      body: JSON.stringify({ adapterId: "jellyfin", sourceType: "built-in" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    store.saveServiceEnhancement(service.id, {
      adapterId: "jellyfin",
      config: { apiKey: "jf_proxy_token", baseUrl: service.url },
      enabled: true,
    });

    const response = await fetch(
      `${server.baseUrl}/api/services/${service.id}/enhancement/media-image/movie-1?imageType=Primary&maxHeight=360`,
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("poster-bytes");
    expect(fetchCalls.find((call) => call.url.includes("/Images/Primary"))).toMatchObject({
      url: expect.stringContaining("https://media.example.test/jellyfin/Items/movie-1/Images/Primary"),
    });
  });

  test("proxies Jellyfin media images without hanging when the upstream stream errors", async () => {
    server = await listen(
      createApiHandler({
        dataDir,
        fetchImpl: async (url) => {
          if (String(url).includes("/Items/movie-1/Images/Primary")) {
            return new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode("partial-image"));
                  setTimeout(() => controller.error(new Error("upstream broke")), 10);
                },
              }),
              {
                headers: { "content-type": "image/jpeg" },
                status: 200,
              },
            );
          }

          return Response.json({ ok: true });
        },
        store,
      }),
    );
    const service = store.createService({
      typeId: "jellyfin",
      url: "http://media.example.test:8096",
    });

    await fetch(`${server.baseUrl}/api/enhanced/adapters/install`, {
      body: JSON.stringify({ adapterId: "jellyfin", sourceType: "built-in" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    store.saveServiceEnhancement(service.id, {
      adapterId: "jellyfin",
      config: { apiKey: "jf_proxy_token", baseUrl: service.url },
      enabled: true,
    });

    const response = await fetch(
      `${server.baseUrl}/api/services/${service.id}/enhancement/media-image/movie-1?imageType=Primary&maxHeight=360`,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    const result = await Promise.race([
      response.text().then(
        () => ({ outcome: "resolved" }),
        (error) => ({ message: error.message, outcome: "rejected" }),
      ),
      new Promise((resolve) => setTimeout(() => resolve({ outcome: "timeout" }), 250)),
    ]);

    expect(result).toMatchObject({ outcome: "rejected" });
  });

  test("saves tests refreshes and returns a service enhancement", async () => {
    const fetchImpl = async (url) => {
      if (String(url).endsWith("/api/v2/auth/login")) {
        return new Response("Ok.", { headers: { "set-cookie": "SID=abc; Path=/" }, status: 200 });
      }

      if (String(url).endsWith("/api/v2/transfer/info")) {
        return Response.json({ connection_status: "connected", dl_info_speed: 20, up_info_speed: 5 });
      }

      if (String(url).endsWith("/api/v2/torrents/info")) {
        return Response.json([{ num_complete: 2, num_incomplete: 1, state: "uploading" }]);
      }

      return new Response("missing", { status: 404 });
    };
    server = await listen(createApiHandler({ dataDir, fetchImpl, store }));
    const service = store.createService({
      typeId: "qbittorrent",
      url: "http://192.0.2.55:8080",
    });

    await fetch(`${server.baseUrl}/api/enhanced/adapters/install`, {
      body: JSON.stringify({ adapterId: "qbittorrent", sourceType: "built-in" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const saveResponse = await fetch(`${server.baseUrl}/api/services/${service.id}/enhancement`, {
      body: JSON.stringify({
        adapterId: "qbittorrent",
        config: { password: "adminadmin", pollIntervalSeconds: 5, username: "admin" },
        enabled: true,
      }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
    expect(saveResponse.status).toBe(200);
    const savedPayload = await saveResponse.json();
    expect(savedPayload.enhancement.config).not.toHaveProperty("password");
    expect(savedPayload.enhancement).toMatchObject({
      configuredFields: expect.arrayContaining(["password", "username"]),
    });
    expect(store.getServiceEnhancement(service.id).config.baseUrl).toBe(service.url);
    expect(store.getServiceEnhancement(service.id).config.password).toBe("adminadmin");

    const updateResponse = await fetch(`${server.baseUrl}/api/services/${service.id}/enhancement`, {
      body: JSON.stringify({
        adapterId: "qbittorrent",
        config: { password: "", pollIntervalSeconds: 5, username: "operator" },
        enabled: true,
      }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
    expect(updateResponse.status).toBe(200);
    expect(store.getServiceEnhancement(service.id).config).toMatchObject({
      password: "adminadmin",
      username: "operator",
    });

    const getResponse = await fetch(`${server.baseUrl}/api/services/${service.id}/enhancement`);
    const getPayload = await getResponse.json();
    expect(getPayload.enhancement.config).not.toHaveProperty("password");
    expect(getPayload.enhancement.configuredFields).toContain("password");

    const templatesResponse = await fetch(`${server.baseUrl}/api/widget-templates`);
    expect(templatesResponse.status).toBe(200);
    await expect(templatesResponse.json()).resolves.toMatchObject({
      baseTemplates: expect.arrayContaining([expect.objectContaining({ id: "custom-card" })]),
      enhancedTemplates: expect.arrayContaining([
        expect.objectContaining({
          enhanced: expect.objectContaining({
            adapterId: "qbittorrent",
            enhancementId: store.getServiceEnhancement(service.id).id,
            serviceId: service.id,
            widgetId: "transfer-speed",
          }),
          id: createEnhancedTemplateId(service.id, "transfer-speed"),
          kind: "enhanced-widget",
          name: "Transfer Speed",
          scope: "service",
        }),
      ]),
      templates: expect.arrayContaining([
        expect.objectContaining({
          enhanced: expect.objectContaining({
            adapterId: "qbittorrent",
            enhancementId: store.getServiceEnhancement(service.id).id,
            serviceId: service.id,
            widgetId: "transfer-speed",
          }),
          id: createEnhancedTemplateId(service.id, "transfer-speed"),
          kind: "enhanced-widget",
          name: "Transfer Speed",
          scope: "service",
        }),
      ]),
    });

    const testResponse = await fetch(`${server.baseUrl}/api/services/${service.id}/enhancement/test`, {
      method: "POST",
    });
    expect(testResponse.status).toBe(200);
    await expect(testResponse.json()).resolves.toMatchObject({ result: { ok: true } });

    const refreshResponse = await fetch(`${server.baseUrl}/api/services/${service.id}/enhancement/refresh`, {
      method: "POST",
    });
    expect(refreshResponse.status).toBe(200);
    await expect(refreshResponse.json()).resolves.toMatchObject({
      state: { status: "ok", state: { transfer: { downloadSpeed: 20 } } },
    });

    const stateResponse = await fetch(`${server.baseUrl}/api/services/${service.id}/enhancement/state`);
    expect(stateResponse.status).toBe(200);
    await expect(stateResponse.json()).resolves.toMatchObject({
      state: { status: "ok", state: { torrents: { seeding: 1 } } },
    });
  });
});
