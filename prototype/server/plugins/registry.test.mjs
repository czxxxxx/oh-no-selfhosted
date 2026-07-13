import { describe, expect, test, vi } from "vitest";
import { BUILTIN_REGISTRY_URL } from "./builtinSource.mjs";
import {
  assertSafeRelativePath,
  createRegistryClient,
  normalizeRegistryIndexUrl,
  registrySourceCacheKey,
  validateRegistryIndex,
} from "./registry.mjs";

describe("unified plugin registry", () => {
  test("normalizes GitHub repository, branch, and registry file URLs", () => {
    expect(normalizeRegistryIndexUrl("https://github.com/example/plugins")).toBe(
      "https://raw.githubusercontent.com/example/plugins/main/registry.json",
    );
    expect(normalizeRegistryIndexUrl("https://github.com/example/plugins", { ref: "release-1" })).toBe(
      "https://raw.githubusercontent.com/example/plugins/release-1/registry.json",
    );
    expect(normalizeRegistryIndexUrl("https://github.com/example/plugins/tree/beta/catalog")).toBe(
      "https://raw.githubusercontent.com/example/plugins/beta/catalog/registry.json",
    );
    expect(normalizeRegistryIndexUrl("https://github.com/example/plugins/blob/v1/catalog/registry.json")).toBe(
      "https://raw.githubusercontent.com/example/plugins/v1/catalog/registry.json",
    );
  });

  test("isolates package caches by registry source", () => {
    expect(registrySourceCacheKey("https://example.test/a/registry.json")).not.toBe(
      registrySourceCacheKey("https://example.test/b/registry.json"),
    );
    expect(registrySourceCacheKey("https://example.test/a/registry.json")).toBe(
      registrySourceCacheKey("https://example.test/a/registry.json"),
    );
  });

  test("reads the standard built-in registry through the same source client", async () => {
    const registry = createRegistryClient();
    const result = await registry.fetchIndex(BUILTIN_REGISTRY_URL);
    const manifest = JSON.parse(
      (await registry.fetchPluginFile({
        filename: "manifest.json",
        pluginPath: result.index.widgets[0].path,
        registryUrl: result.registryUrl,
      })).toString("utf8"),
    );

    expect(result.index).toMatchObject({
      apps: expect.arrayContaining([expect.objectContaining({ id: "qbittorrent" })]),
      integrations: expect.arrayContaining([expect.objectContaining({ id: "weather" })]),
      name: "Oh No Built-ins",
      widgets: [{ id: "oh-no.core-widgets", path: "packages/widgets/oh-no.core-widgets", version: "0.1.0", name: "Oh No Core Widgets", requires: [] }],
    });
    expect(result.index.serviceTypes).toHaveLength(19);
    expect(manifest).toMatchObject({ id: "oh-no.core-widgets", kind: "widget", registration: "native" });
  });

  test("accepts service, adapter, integration, and first-class widget contributions in one index", () => {
    expect(
      validateRegistryIndex({
        apps: [{ id: "sonarr", name: "Sonarr Enhanced", path: "adapters/sonarr" }],
        integrations: [{ id: "pingdom", name: "Pingdom", path: "integrations/pingdom" }],
        name: "Homelab Plugins",
        serviceTypes: [{ id: "sonarr", name: "Sonarr" }],
        version: 1,
        widgets: [{ id: "acme-clock", name: "Acme Clock", path: "widgets/acme-clock" }],
      }),
    ).toMatchObject({
      apps: [{ id: "sonarr" }],
      integrations: [{ id: "pingdom" }],
      serviceTypes: [{ id: "sonarr" }],
      widgets: [{ id: "acme-clock" }],
    });
  });

  test("rejects duplicate contribution ids", () => {
    expect(() =>
      validateRegistryIndex({
        widgets: [
          { id: "clock", path: "widgets/clock" },
          { id: "clock", path: "widgets/clock-copy" },
        ],
      }),
    ).toThrow(/duplicate id/i);
  });

  test("rejects path traversal and oversized remote files", async () => {
    expect(() => assertSafeRelativePath("../secrets")).toThrow(/safe relative path/i);

    const fetchImpl = vi.fn(async () => new Response("x".repeat(32)));
    const registry = createRegistryClient({ fetchImpl, maxFileBytes: 16 });

    await expect(registry.fetchIndex("https://example.test/registry.json")).rejects.toThrow(/download limit/i);
  });

  test("discovers a non-main default branch and authenticates private GitHub reads", async () => {
    const fetchImpl = vi.fn(async (input, options) => {
      const url = String(input);
      expect(options.headers.authorization).toBe("Bearer github_pat_test");

      if (url.includes("/main/registry.json")) {
        return new Response("missing", { status: 404 });
      }

      if (url.startsWith("https://api.github.com/repos/")) {
        return Response.json({ default_branch: "trunk" });
      }

      return Response.json({ name: "Private plugins", widgets: [] });
    });
    const registry = createRegistryClient({ fetchImpl });
    const result = await registry.fetchIndex("https://github.com/acme/private-plugins", {
      authToken: "github_pat_test",
    });

    expect(result.registryUrl).toContain("/trunk/registry.json");
    expect(result.index.name).toBe("Private plugins");
  });
});
