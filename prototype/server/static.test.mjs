import { createServer } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createStaticAssetHandler } from "./static.mjs";

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

describe("production static asset handler", () => {
  let root;
  let server;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "oh-no-static-"));
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "index.html"), "<!doctype html><title>Dashboard</title>");
    await writeFile(join(root, "assets", "app-abc123.js"), "console.log('ready')");
    server = await listen(createStaticAssetHandler({ staticDir: root }));
  });

  afterEach(async () => {
    await server?.close();
    await rm(root, { force: true, recursive: true });
  });

  test("serves the SPA shell without long-term caching", async () => {
    const response = await fetch(`${server.baseUrl}/settings/profile`);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.text()).resolves.toContain("Dashboard");
  });

  test("serves hashed assets with immutable caching and supports HEAD", async () => {
    const response = await fetch(`${server.baseUrl}/assets/app-abc123.js`, { method: "HEAD" });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(response.headers.get("content-type")).toContain("text/javascript");
    await expect(response.text()).resolves.toBe("");
  });

  test("rejects malformed and traversal paths without exposing files", async () => {
    const malformed = await fetch(`${server.baseUrl}/%E0%A4%A`);
    const traversal = await fetch(`${server.baseUrl}/..%2Fpackage.json`);

    expect(malformed.status).toBe(400);
    expect(traversal.status).toBe(404);
  });
});
