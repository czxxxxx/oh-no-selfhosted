import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createServiceStore } from "../storage.mjs";
import { refreshDueEnhancements } from "./serviceRefresh.mjs";

describe("enhanced service refresh", () => {
  let dataDir;
  let currentTime;
  let store;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "oh-no-refresh-"));
    currentTime = "2026-07-03T00:00:00.000Z";
    store = createServiceStore({ dataDir, now: () => currentTime });
  });

  afterEach(async () => {
    store?.close();
    await rm(dataDir, { force: true, recursive: true });
  });

  test("refreshes enabled enhancements when cached state is missing or stale", async () => {
    const service = store.createService({
      typeId: "qbittorrent",
      url: "http://192.0.2.55:8080",
    });
    store.upsertEnhancedAdapter({
      id: "qbittorrent",
      installedPath: "/tmp/qbittorrent",
      manifest: { entry: "adapter.mjs", id: "qbittorrent", name: "qBittorrent Enhanced", version: "0.1.0" },
      name: "qBittorrent Enhanced",
      sourceRef: "built-in",
      sourceType: "built-in",
      version: "0.1.0",
      widgets: [],
    });
    const enhancement = store.saveServiceEnhancement(service.id, {
      adapterId: "qbittorrent",
      config: { baseUrl: service.url, pollIntervalSeconds: 5 },
      enabled: true,
    });
    const runtime = {
      fetchAdapterState: vi.fn(async () => ({ transfer: { downloadSpeed: 42 } })),
    };

    currentTime = "2026-07-03T00:00:06.000Z";
    await expect(
      refreshDueEnhancements({
        now: () => new Date(currentTime),
        runtime,
        store,
      }),
    ).resolves.toEqual([{ serviceId: service.id, status: "ok" }]);
    expect(runtime.fetchAdapterState).toHaveBeenCalledTimes(1);
    expect(store.getEnhancedState(enhancement.id)).toMatchObject({
      state: { transfer: { downloadSpeed: 42 } },
      status: "ok",
    });

    currentTime = "2026-07-03T00:00:07.000Z";
    await refreshDueEnhancements({
      now: () => new Date(currentTime),
      runtime,
      store,
    });
    expect(runtime.fetchAdapterState).toHaveBeenCalledTimes(1);
  });
});
