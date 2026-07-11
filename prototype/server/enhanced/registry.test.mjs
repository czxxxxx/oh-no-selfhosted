import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createEnhancedRegistry } from "./registry.mjs";

const FIXTURE_MANIFEST = {
  configSchema: [{ key: "baseUrl", label: "Endpoint URL", type: "url" }],
  entry: "adapter.mjs",
  id: "fixture",
  name: "Fixture",
  serviceTypes: ["custom"],
  version: "0.1.0",
  widgets: "widgets.json",
};

const FIXTURE_WIDGETS = [
  {
    dataPath: "status",
    defaultLayout: { h: 2, w: 3 },
    fields: [{ key: "message", label: "Message", format: "text" }],
    id: "status",
    minLayout: { h: 2, w: 2 },
    name: "Status",
    renderer: "status-summary",
  },
];

async function writeFixturePlugin(pluginDir, manifest = FIXTURE_MANIFEST, widgets = FIXTURE_WIDGETS) {
  await mkdir(pluginDir, { recursive: true });
  await writeFile(join(pluginDir, "manifest.json"), JSON.stringify(manifest));
  await writeFile(join(pluginDir, "widgets.json"), JSON.stringify(widgets));
  await writeFile(
    join(pluginDir, "adapter.mjs"),
    "export async function testConnection(){return {ok:true,message:'ok'}}; export async function fetchState(){return {status:{message:'ok'}}};",
  );
}

describe("enhanced registry", () => {
  let dataDir;
  let localRoot;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "oh-no-enhanced-data-"));
    localRoot = await mkdtemp(join(tmpdir(), "oh-no-enhanced-local-"));
  });

  afterEach(async () => {
    await rm(dataDir, { force: true, recursive: true });
    await rm(localRoot, { force: true, recursive: true });
  });

  test("lists built-in enhanced adapters", async () => {
    const registry = createEnhancedRegistry({ dataDir });

    await expect(registry.listBuiltInAdapters()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          manifest: expect.objectContaining({ id: "qbittorrent" }),
          sourceType: "local",
        }),
        expect.objectContaining({
          manifest: expect.objectContaining({
            id: "portainer",
            serviceTypes: ["portainer"],
          }),
          sourceType: "local",
          widgets: expect.arrayContaining([
            expect.objectContaining({ id: "container-summary" }),
            expect.objectContaining({ id: "container-list" }),
          ]),
        }),
        expect.objectContaining({
          manifest: expect.objectContaining({
            id: "qnap",
            serviceTypes: ["qnap"],
          }),
          sourceType: "local",
          widgets: expect.arrayContaining([
            expect.objectContaining({ id: "system-overview" }),
            expect.objectContaining({ id: "storage-summary" }),
          ]),
        }),
        expect.objectContaining({
          manifest: expect.objectContaining({
            id: "jellyfin",
            serviceTypes: ["jellyfin"],
          }),
          sourceType: "local",
          widgets: expect.arrayContaining([
            expect.objectContaining({ id: "recently-added", renderer: "recent-media-row" }),
          ]),
        }),
      ]),
    );
  });

  test("lists a local plugin folder", async () => {
    await writeFixturePlugin(join(localRoot, "fixture"));
    const registry = createEnhancedRegistry({ dataDir });

    await expect(registry.listLocalAdapters(localRoot)).resolves.toEqual([
      expect.objectContaining({ manifest: expect.objectContaining({ id: "fixture" }), sourceType: "local" }),
    ]);
  });

  test("fetches a GitHub-style registry index from a raw URL", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        apps: [{ description: "Download speed", id: "qbittorrent", name: "qBittorrent", path: "apps/qbittorrent" }],
        name: "Homelab Enhanced Apps",
        version: 1,
      }),
    );
    const registry = createEnhancedRegistry({ dataDir, fetchImpl });

    await expect(registry.fetchGitHubRegistry("https://example.test/registry.json")).resolves.toMatchObject({
      apps: [{ id: "qbittorrent" }],
      name: "Homelab Enhanced Apps",
    });
  });

  test("normalizes GitHub repo URLs to raw registry URLs", () => {
    const registry = createEnhancedRegistry({ dataDir });

    expect(registry.normalizeRegistryIndexUrl("https://github.com/example/homelab-enhanced")).toBe(
      "https://raw.githubusercontent.com/example/homelab-enhanced/main/registry.json",
    );
    expect(registry.normalizeRegistryIndexUrl("https://example.test/registry.json")).toBe(
      "https://example.test/registry.json",
    );
  });

  test("fetches a GitHub adapter into the local registry cache", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).endsWith("/registry.json")) {
        return Response.json({
          apps: [{ description: "Fixture", id: "fixture", name: "Fixture", path: "apps/fixture" }],
          name: "Homelab Enhanced Apps",
          version: 1,
        });
      }

      if (String(url).endsWith("/manifest.json")) {
        return Response.json(FIXTURE_MANIFEST);
      }

      if (String(url).endsWith("/widgets.json")) {
        return Response.json(FIXTURE_WIDGETS);
      }

      if (String(url).endsWith("/adapter.mjs")) {
        return new Response(
          "export async function testConnection(){return {ok:true,message:'ok'}}; export async function fetchState(){return {status:{message:'ok'}}};",
        );
      }

      return new Response("missing", { status: 404 });
    });
    const registry = createEnhancedRegistry({ dataDir, fetchImpl });

    await expect(registry.fetchGitHubAdapter("https://example.test/registry.json", "fixture")).resolves.toMatchObject({
      manifest: { id: "fixture" },
      sourceRef: "https://example.test/registry.json",
      sourceType: "github",
      widgets: [{ id: "status" }],
    });
  });

  test("downloads and compiles a React adapter widget without rebuilding the host app", async () => {
    const manifest = {
      ...FIXTURE_MANIFEST,
      frontend: {
        entry: "frontend.jsx",
        files: ["frontend.jsx", "widget.css"],
      },
      version: "2.0.0",
    };
    const widgets = [
      {
        ...FIXTURE_WIDGETS[0],
        component: "ServiceStatusWidget",
        renderer: "react",
      },
    ];
    const fetchImpl = vi.fn(async (url) => {
      const value = String(url);

      if (value.endsWith("/registry.json")) {
        return Response.json({ apps: [{ id: "fixture", path: "apps/fixture" }] });
      }

      if (value.endsWith("/manifest.json")) {
        return Response.json(manifest);
      }

      if (value.endsWith("/widgets.json")) {
        return Response.json(widgets);
      }

      if (value.endsWith("/adapter.mjs")) {
        return new Response(
          "export async function testConnection(){return {ok:true}}; export async function fetchState(){return {status:{message:'ok'}}};",
        );
      }

      if (value.endsWith("/frontend.jsx")) {
        return new Response(
          'import React from "react"; import "./widget.css"; export function ServiceStatusWidget({data}){return <strong>{data.message}</strong>}',
        );
      }

      if (value.endsWith("/widget.css")) {
        return new Response(".service-status-widget { display: grid; }");
      }

      return new Response("missing", { status: 404 });
    });
    const registry = createEnhancedRegistry({ dataDir, fetchImpl });
    const definition = await registry.fetchGitHubAdapter("https://example.test/registry.json", "fixture");

    expect(definition.widgets[0]).toMatchObject({
      react: {
        exportName: "ServiceStatusWidget",
        pluginKind: "service-adapter",
      },
      renderer: "react",
    });

    const installed = await registry.installAdapter(definition);
    const bundle = await readFile(join(installed.installedPath, ".oh-no-frontend", "frontend.js"), "utf8");

    expect(bundle).toContain("__OH_NO_PLUGIN_RUNTIME__");
  });
});
