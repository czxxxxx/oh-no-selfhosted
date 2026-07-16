import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, vi } from "vitest";
import { createAdapterRuntime } from "./runtime.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jellyfinDir = join(__dirname, "builtins", "jellyfin");
const portainerDir = join(__dirname, "builtins", "portainer");
const qbitDir = join(__dirname, "builtins", "qbittorrent");
const qnapDir = join(__dirname, "builtins", "qnap");
const transmissionDir = join(__dirname, "builtins", "transmission");

function createFakeSnmp({ scalarValues = {}, subtreeValues = {} } = {}) {
  const calls = [];

  function createSession() {
    return {
      close: vi.fn(),
      get(oids, callback) {
        callback(
          null,
          oids.map((oid) => ({ oid, value: scalarValues[oid] })),
        );
      },
      subtree(rootOid, maxRepetitions, feedCallback, doneCallback) {
        const onFeed = typeof maxRepetitions === "function" ? maxRepetitions : feedCallback;
        const onDone = typeof maxRepetitions === "function" ? feedCallback : doneCallback;

        onFeed((subtreeValues[rootOid] || []).map(([oid, value]) => ({ oid, value })));
        onDone(null);
      },
    };
  }

  return {
    AuthProtocols: { md5: "md5", sha: "sha", sha256: "sha256" },
    ObjectType: { Counter32: 65, Gauge32: 66, Integer: 2, OID: 6, OctetString: 4, TimeTicks: 67 },
    PrivProtocols: { aes: "aes", des: "des" },
    SecurityLevel: { authNoPriv: 2, authPriv: 3, noAuthNoPriv: 1 },
    Version1: 0,
    Version2c: 1,
    Version3: 3,
    calls,
    createSession(target, community, options) {
      calls.push({ community, kind: "v2c", options, target });

      return createSession();
    },
    createV3Session(target, user, options) {
      calls.push({ kind: "v3", options, target, user });

      return createSession();
    },
    isVarbindError: () => false,
    varbindError: () => "SNMP varbind error",
  };
}

describe("enhanced adapter runtime", () => {
  test("runs qBittorrent testConnection through the injected fetch helper", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).endsWith("/api/v2/auth/login")) {
        return new Response("Ok.", { headers: { "set-cookie": "SID=abc; Path=/" }, status: 200 });
      }

      if (String(url).endsWith("/api/v2/transfer/info")) {
        return Response.json({ connection_status: "connected", dl_info_speed: 10, up_info_speed: 2 });
      }

      return new Response("missing", { status: 404 });
    });
    const runtime = createAdapterRuntime({ fetchImpl, logger: console, now: () => "2026-07-03T00:00:00.000Z" });

    await expect(
      runtime.testAdapter({
        adapterPath: join(qbitDir, "adapter.mjs"),
        config: {
          baseUrl: "http://192.0.2.20:8080",
          password: "adminadmin",
          username: "admin",
        },
        service: { id: "service-qbit", name: "qBittorrent", url: "http://192.0.2.20:8080" },
      }),
    ).resolves.toMatchObject({ ok: true, message: expect.stringMatching(/reachable/i) });
  });

  test("fetches normalized qBittorrent state", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).endsWith("/api/v2/auth/login")) {
        return new Response("Ok.", { headers: { "set-cookie": "SID=abc; Path=/" }, status: 200 });
      }

      if (String(url).endsWith("/api/v2/transfer/info")) {
        return Response.json({
          connection_status: "connected",
          dl_info_data: 1363394418442,
          dl_info_speed: 8808038,
          dht_nodes: 382,
          free_space_on_disk: 1024,
          up_info_data: 304942678016,
          up_info_speed: 1782579,
        });
      }

      if (String(url).endsWith("/api/v2/torrents/info")) {
        return Response.json([
          {
            downloaded: 1024,
            dlspeed: 1,
            eta: 720,
            name: "Planet.Earth.III.S01",
            num_complete: 10,
            num_incomplete: 2,
            progress: 0.5,
            ratio: 0.36,
            size: 2048,
            state: "downloading",
            upspeed: 2,
          },
          {
            downloaded: 4096,
            dlspeed: 0,
            name: "Ubuntu 24.04.1 Desktop amd64.iso",
            num_complete: 12,
            num_incomplete: 4,
            progress: 1,
            ratio: 2.35,
            size: 4096,
            state: "uploading",
            upspeed: 4,
          },
          { dlspeed: 0, num_complete: 0, num_incomplete: 0, state: "pausedUP", upspeed: 0 },
        ]);
      }

      if (String(url).endsWith("/api/v2/sync/maindata?rid=0")) {
        return Response.json({
          server_state: {
            alltime_dl: 3849906475087,
            alltime_ul: 9071346839645,
          },
        });
      }

      return new Response("missing", { status: 404 });
    });
    const runtime = createAdapterRuntime({ fetchImpl, logger: console, now: () => "2026-07-03T00:00:00.000Z" });

    await expect(
      runtime.fetchAdapterState({
        adapterPath: join(qbitDir, "adapter.mjs"),
        config: {
          baseUrl: "http://192.0.2.20:8080",
          password: "adminadmin",
          username: "admin",
        },
        service: { id: "service-qbit", name: "qBittorrent", url: "http://192.0.2.20:8080" },
      }),
    ).resolves.toMatchObject({
      torrents: { downloading: 1, paused: 1, seeding: 1 },
      transfer: {
        activeTorrents: [
          {
            name: "Ubuntu 24.04.1 Desktop amd64.iso",
            progress: 100,
            status: "Seeding",
            uploadSpeed: 4,
          },
          {
            downloadedBytes: 1024,
            downloadSpeed: 1,
            name: "Planet.Earth.III.S01",
            progress: 50,
            ratio: 0.36,
            status: "Downloading",
            totalBytes: 2048,
          },
        ],
        connectionStatus: "connected",
        dhtNodes: 382,
        ratio: 2.3562512228144468,
        totalDownloaded: 3849906475087,
        totalUploaded: 9071346839645,
        downloadSpeed: 8808038,
        downloading: 1,
        peers: 28,
        seeding: 1,
        uploadSpeed: 1782579,
      },
    });
  });

  test("negotiates the Transmission session id with optional basic auth", async () => {
    const fetchImpl = vi.fn(async (url, options = {}) => {
      expect(String(url)).toBe("http://192.0.2.30:9091/transmission/rpc");
      expect(options.headers.authorization).toBe("Basic dHJhbnNtaXNzaW9uOnNlY3JldA==");

      if (!options.headers["x-transmission-session-id"]) {
        return new Response(null, {
          headers: { "x-transmission-session-id": "transmission-session-1" },
          status: 409,
        });
      }

      expect(options.headers["x-transmission-session-id"]).toBe("transmission-session-1");
      const request = JSON.parse(options.body);

      expect(request).toMatchObject({ jsonrpc: "2.0", method: "session_get" });

      return Response.json({
        id: request.id,
        jsonrpc: "2.0",
        result: { version: "4.1.0" },
      });
    });
    const runtime = createAdapterRuntime({ fetchImpl, logger: console });

    await expect(
      runtime.testAdapter({
        adapterPath: join(transmissionDir, "adapter.mjs"),
        config: {
          baseUrl: "http://192.0.2.30:9091/transmission/web/",
          password: "secret",
          username: "transmission",
        },
        service: {
          id: "service-transmission",
          name: "Transmission",
          url: "http://192.0.2.30:9091/transmission/web/",
        },
      }),
    ).resolves.toMatchObject({ ok: true, message: expect.stringMatching(/4\.1\.0.*reachable/i) });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("fetches normalized Transmission JSON-RPC state", async () => {
    const fetchImpl = vi.fn(async (url, options = {}) => {
      expect(String(url)).toBe("http://192.0.2.30:9091/transmission/rpc");

      if (!options.headers["x-transmission-session-id"]) {
        return new Response(null, {
          headers: { "x-transmission-session-id": "transmission-session-2" },
          status: 409,
        });
      }

      const request = JSON.parse(options.body);

      if (request.method === "session_get") {
        return Response.json({
          id: request.id,
          jsonrpc: "2.0",
          result: { download_dir: "/downloads", version: "4.1.0" },
        });
      }

      if (request.method === "session_stats") {
        return Response.json({
          id: request.id,
          jsonrpc: "2.0",
          result: {
            cumulative_stats: { downloaded_bytes: 5000, uploaded_bytes: 10000 },
            download_speed: 8808038,
            upload_speed: 1782579,
          },
        });
      }

      if (request.method === "torrent_get") {
        expect(request.params.fields).toEqual(expect.arrayContaining(["percent_done", "rate_download"]));

        return Response.json({
          id: request.id,
          jsonrpc: "2.0",
          result: {
            torrents: [
              {
                downloaded_ever: 1024,
                eta: 720,
                name: "Planet.Earth.III.S01",
                peers_connected: 3,
                percent_done: 0.5,
                rate_download: 1,
                rate_upload: 2,
                status: 4,
                total_size: 2048,
                upload_ratio: 0.36,
              },
              {
                downloaded_ever: 4096,
                eta: -1,
                name: "Ubuntu 24.04.1 Desktop amd64.iso",
                peers_connected: 4,
                percent_done: 1,
                rate_download: 0,
                rate_upload: 4,
                status: 6,
                total_size: 4096,
                upload_ratio: 2.35,
              },
              {
                name: "Paused archive",
                peers_connected: 0,
                percent_done: 0.25,
                rate_download: 0,
                rate_upload: 0,
                status: 0,
              },
            ],
          },
        });
      }

      if (request.method === "free_space") {
        expect(request.params).toEqual({ path: "/downloads" });

        return Response.json({
          id: request.id,
          jsonrpc: "2.0",
          result: { path: "/downloads", size_bytes: 2048 },
        });
      }

      return new Response("missing", { status: 404 });
    });
    const runtime = createAdapterRuntime({ fetchImpl, logger: console });

    await expect(
      runtime.fetchAdapterState({
        adapterPath: join(transmissionDir, "adapter.mjs"),
        config: { baseUrl: "http://192.0.2.30:9091" },
        service: {
          id: "service-transmission",
          name: "Transmission",
          url: "http://192.0.2.30:9091",
        },
      }),
    ).resolves.toMatchObject({
      summary: { connectionStatus: "connected", freeSpace: 2048 },
      torrents: { downloading: 1, paused: 1, peers: 7, seeding: 1 },
      transfer: {
        activeTorrents: [
          {
            name: "Ubuntu 24.04.1 Desktop amd64.iso",
            progress: 100,
            state: "seeding",
            status: "Seeding",
            uploadSpeed: 4,
          },
          {
            downloadedBytes: 1024,
            downloadSpeed: 1,
            name: "Planet.Earth.III.S01",
            progress: 50,
            ratio: 0.36,
            state: "downloading",
            status: "Downloading",
            totalBytes: 2048,
          },
        ],
        downloadSpeed: 8808038,
        ratio: 2,
        totalDownloaded: 5000,
        totalUploaded: 10000,
        uploadSpeed: 1782579,
      },
    });
  });

  test("falls back to Transmission's legacy RPC protocol", async () => {
    const methods = [];
    const fetchImpl = vi.fn(async (url, options = {}) => {
      const request = JSON.parse(options.body);
      methods.push(request.method);

      if (request.method === "session_get") {
        return Response.json({ arguments: {}, result: "method name not recognized" });
      }

      if (request.method === "session-get") {
        return Response.json({
          arguments: { version: "4.0.6" },
          result: "success",
          tag: request.tag,
        });
      }

      return new Response("missing", { status: 404 });
    });
    const runtime = createAdapterRuntime({ fetchImpl, logger: console });

    await expect(
      runtime.testAdapter({
        adapterPath: join(transmissionDir, "adapter.mjs"),
        config: { baseUrl: "http://192.0.2.30:9091/transmission/rpc" },
        service: { id: "service-transmission", name: "Transmission" },
      }),
    ).resolves.toMatchObject({ ok: true, message: expect.stringMatching(/4\.0\.6.*reachable/i) });

    expect(methods).toEqual(["session_get", "session-get"]);
  });

  test("runs QNAP SNMPv3 noAuthNoPriv without requiring passwords", async () => {
    const snmpImpl = createFakeSnmp({
      scalarValues: {
        "1.3.6.1.2.1.1.1.0": "Linux TS-X64 5.2.3.3006",
      },
    });
    const runtime = createAdapterRuntime({ logger: console, now: () => "2026-07-03T00:00:00.000Z", snmpImpl });

    await expect(
      runtime.testAdapter({
        adapterPath: join(qnapDir, "adapter.mjs"),
        config: {
          baseUrl: "http://nas.example.test",
          securityLevel: "noAuthNoPriv",
          snmpVersion: "v3",
          username: "admin",
        },
        service: { id: "service-qnap", name: "QNAP", url: "http://nas.example.test" },
      }),
    ).resolves.toMatchObject({ ok: true, message: expect.stringMatching(/snmp/i) });

    expect(snmpImpl.calls[0]).toMatchObject({
      kind: "v3",
      target: "nas.example.test",
      user: { level: snmpImpl.SecurityLevel.noAuthNoPriv, name: "admin" },
    });
    expect(snmpImpl.calls[0].user.authKey).toBeUndefined();
    expect(snmpImpl.calls[0].user.privKey).toBeUndefined();
  });

  test("fetches normalized QNAP SNMP state", async () => {
    const snmpImpl = createFakeSnmp({
      scalarValues: {
        "1.3.6.1.2.1.1.1.0": "Linux TS-X64 5.2.3.3006",
        "1.3.6.1.2.1.1.3.0": 1234567,
        "1.3.6.1.2.1.25.2.2.0": 8388608,
      },
      subtreeValues: {
        "1.3.6.1.2.1.2.2.1": [
          ["1.3.6.1.2.1.2.2.1.2.1", "lo"],
          ["1.3.6.1.2.1.2.2.1.2.2", "eth0"],
          ["1.3.6.1.2.1.2.2.1.8.1", 2],
          ["1.3.6.1.2.1.2.2.1.8.2", 1],
          ["1.3.6.1.2.1.2.2.1.10.2", 1024],
          ["1.3.6.1.2.1.2.2.1.16.2", 2048],
        ],
        "1.3.6.1.2.1.25.2.3.1": [
          ["1.3.6.1.2.1.25.2.3.1.2.1", "1.3.6.1.2.1.25.2.1.2"],
          ["1.3.6.1.2.1.25.2.3.1.2.2", "1.3.6.1.2.1.25.2.1.4"],
          ["1.3.6.1.2.1.25.2.3.1.2.3", "1.3.6.1.2.1.25.2.1.4"],
          ["1.3.6.1.2.1.25.2.3.1.3.1", "Physical memory"],
          ["1.3.6.1.2.1.25.2.3.1.3.2", "DataVol1"],
          ["1.3.6.1.2.1.25.2.3.1.3.3", "DataVol2"],
          ["1.3.6.1.2.1.25.2.3.1.4.1", 1024],
          ["1.3.6.1.2.1.25.2.3.1.4.2", 4096],
          ["1.3.6.1.2.1.25.2.3.1.4.3", 4096],
          ["1.3.6.1.2.1.25.2.3.1.5.1", 8388608],
          ["1.3.6.1.2.1.25.2.3.1.5.2", 1000],
          ["1.3.6.1.2.1.25.2.3.1.5.3", 2000],
          ["1.3.6.1.2.1.25.2.3.1.6.1", 4194304],
          ["1.3.6.1.2.1.25.2.3.1.6.2", 400],
          ["1.3.6.1.2.1.25.2.3.1.6.3", 1000],
        ],
        "1.3.6.1.2.1.25.3.3.1.2": [
          ["1.3.6.1.2.1.25.3.3.1.2.1", 10],
          ["1.3.6.1.2.1.25.3.3.1.2.2", 30],
        ],
      },
    });
    const runtime = createAdapterRuntime({ logger: console, now: () => "2026-07-03T00:00:00.000Z", snmpImpl });

    await expect(
      runtime.fetchAdapterState({
        adapterPath: join(qnapDir, "adapter.mjs"),
        config: {
          authPassword: "secret",
          authProtocol: "sha",
          baseUrl: "http://nas.example.test",
          securityLevel: "authNoPriv",
          snmpVersion: "v3",
          username: "admin",
        },
        service: { id: "service-qnap", name: "QNAP", url: "http://nas.example.test" },
      }),
    ).resolves.toMatchObject({
      network: { rows: [expect.objectContaining({ name: "eth0", rxBytes: 1024, status: "up", txBytes: 2048 })] },
      resources: {
        cpuLoadPercent: 20,
        memoryTotalBytes: 8589934592,
        memoryUsedBytes: 4294967296,
      },
      storage: {
        rows: [
          expect.objectContaining({ name: "DataVol2", totalBytes: 8192000, usedBytes: 4096000, usedPercent: 50 }),
          expect.objectContaining({ name: "DataVol1", totalBytes: 4096000, usedBytes: 1638400, usedPercent: 40 }),
        ],
        totalBytes: 12288000,
        usedBytes: 5734400,
        usedPercent: 46.7,
      },
      system: {
        description: "Linux TS-X64 5.2.3.3006",
        uptimeSeconds: 12345,
      },
    });
  });

  test("deduplicates QNAP storage bind mounts and excludes system mounts", async () => {
    const snmpImpl = createFakeSnmp({
      scalarValues: {
        "1.3.6.1.2.1.1.1.0": "Linux TS-X64 5.2.3.3006",
        "1.3.6.1.2.1.1.3.0": 1234567,
        "1.3.6.1.2.1.25.2.2.0": 8388608,
      },
      subtreeValues: {
        "1.3.6.1.2.1.2.2.1": [],
        "1.3.6.1.2.1.25.2.3.1": [
          ["1.3.6.1.2.1.25.2.3.1.2.1", "1.3.6.1.2.1.25.2.1.4"],
          ["1.3.6.1.2.1.25.2.3.1.2.2", "1.3.6.1.2.1.25.2.1.4"],
          ["1.3.6.1.2.1.25.2.3.1.2.3", "1.3.6.1.2.1.25.2.1.4"],
          ["1.3.6.1.2.1.25.2.3.1.2.4", "1.3.6.1.2.1.25.2.1.4"],
          ["1.3.6.1.2.1.25.2.3.1.3.1", "/share/CACHEDEV2_DATA"],
          ["1.3.6.1.2.1.25.2.3.1.3.2", "/share/NFSv=4/NAS"],
          ["1.3.6.1.2.1.25.2.3.1.3.3", "/dev/shm"],
          ["1.3.6.1.2.1.25.2.3.1.3.4", "/mnt/ext"],
          ["1.3.6.1.2.1.25.2.3.1.4.1", 4096],
          ["1.3.6.1.2.1.25.2.3.1.4.2", 4096],
          ["1.3.6.1.2.1.25.2.3.1.4.3", 4096],
          ["1.3.6.1.2.1.25.2.3.1.4.4", 4096],
          ["1.3.6.1.2.1.25.2.3.1.5.1", 752629936],
          ["1.3.6.1.2.1.25.2.3.1.5.2", 752629936],
          ["1.3.6.1.2.1.25.2.3.1.5.3", 470872],
          ["1.3.6.1.2.1.25.2.3.1.5.4", 106665],
          ["1.3.6.1.2.1.25.2.3.1.6.1", 267535708],
          ["1.3.6.1.2.1.25.2.3.1.6.2", 267535708],
          ["1.3.6.1.2.1.25.2.3.1.6.3", 277],
          ["1.3.6.1.2.1.25.2.3.1.6.4", 97407],
        ],
        "1.3.6.1.2.1.25.3.3.1.2": [],
      },
    });
    const runtime = createAdapterRuntime({ logger: console, now: () => "2026-07-05T07:15:45.000Z", snmpImpl });

    await expect(
      runtime.fetchAdapterState({
        adapterPath: join(qnapDir, "adapter.mjs"),
        config: {
          baseUrl: "http://nas.example.test",
          securityLevel: "noAuthNoPriv",
          snmpVersion: "v3",
          username: "admin",
        },
        service: { id: "service-qnap", name: "QNAP", url: "http://nas.example.test" },
      }),
    ).resolves.toMatchObject({
      storage: {
        rows: [
          expect.objectContaining({
            name: "/share/CACHEDEV2_DATA",
            totalBytes: 3082772217856,
            usedBytes: 1095826259968,
            usedPercent: 35.5,
          }),
        ],
        totalBytes: 3082772217856,
        usedBytes: 1095826259968,
        usedPercent: 35.5,
      },
    });
  });

  test("runs Portainer testConnection with X-API-Key auth", async () => {
    const fetchImpl = vi.fn(async (url, options = {}) => {
      if (String(url).endsWith("/api/endpoints/3/docker/info")) {
        expect(options.headers).toMatchObject({ "x-api-key": "ptr_test_key" });

        return Response.json({ ServerVersion: "27.3.1" });
      }

      return new Response("missing", { status: 404 });
    });
    const runtime = createAdapterRuntime({ fetchImpl, logger: console, now: () => "2026-07-04T00:00:00.000Z" });

    await expect(
      runtime.testAdapter({
        adapterPath: join(portainerDir, "adapter.mjs"),
        config: {
          apiKey: "ptr_test_key",
          authMode: "apiKey",
          baseUrl: "http://containers.example.test:9000",
          endpointId: 3,
        },
        service: { id: "service-portainer", name: "Portainer", url: "http://containers.example.test:9000" },
      }),
    ).resolves.toMatchObject({ ok: true, message: expect.stringMatching(/docker api/i) });
  });

  test("fetches normalized Portainer Docker state with bearer auth", async () => {
    const fetchImpl = vi.fn(async (url, options = {}) => {
      expect(options.headers).toMatchObject({ authorization: "Bearer ptr_access_token" });

      if (String(url).endsWith("/api/endpoints/1/docker/containers/json?all=true")) {
        return Response.json([
          { Id: "abc123", Image: "nginx:latest", Names: ["/nginx"], State: "running", Status: "Up 2 hours" },
          { Id: "def456", Image: "redis:7", Names: ["/redis"], State: "exited", Status: "Exited (0) 1 hour ago" },
        ]);
      }

      if (String(url).endsWith("/api/endpoints/1/docker/images/json")) {
        return Response.json([{ Size: 1024 }, { VirtualSize: 4096 }]);
      }

      if (String(url).endsWith("/api/endpoints/1/docker/info")) {
        return Response.json({
          Containers: 2,
          ContainersRunning: 1,
          MemTotal: 8589934592,
          NCPU: 8,
          OperatingSystem: "Docker Desktop",
          ServerVersion: "27.3.1",
        });
      }

      return new Response("missing", { status: 404 });
    });
    const runtime = createAdapterRuntime({ fetchImpl, logger: console, now: () => "2026-07-04T00:00:00.000Z" });

    await expect(
      runtime.fetchAdapterState({
        adapterPath: join(portainerDir, "adapter.mjs"),
        config: {
          apiKey: "ptr_access_token",
          authMode: "bearer",
          baseUrl: "http://containers.example.test:9000",
          endpointId: 1,
        },
        service: { id: "service-portainer", name: "Portainer", url: "http://containers.example.test:9000" },
      }),
    ).resolves.toMatchObject({
      containerRows: {
        rows: [
          { id: "abc123", image: "nginx:latest", name: "nginx", state: "running", status: "Up 2 hours" },
          { id: "def456", image: "redis:7", name: "redis", state: "exited", status: "Exited (0) 1 hour ago" },
        ],
      },
      containers: {
        running: 1,
        stopped: 1,
        total: 2,
      },
      engine: {
        cpus: 8,
        memoryTotalBytes: 8589934592,
        operatingSystem: "Docker Desktop",
        serverVersion: "27.3.1",
      },
      images: {
        count: 2,
        totalSizeBytes: 5120,
      },
    });
  });

  test("runs Jellyfin testConnection with MediaBrowser token auth", async () => {
    const fetchImpl = vi.fn(async (url, options = {}) => {
      expect(options.headers.authorization).toContain('Token="jf_test_token"');

      if (String(url).endsWith("/System/Info")) {
        return Response.json({ ServerName: "Living Room Jellyfin", Version: "10.10.7" });
      }

      if (String(url).includes("/Items/Latest")) {
        return Response.json([]);
      }

      if (String(url).includes("/Items?")) {
        return Response.json({ Items: [] });
      }

      return new Response("missing", { status: 404 });
    });
    const runtime = createAdapterRuntime({ fetchImpl, logger: console, now: () => "2026-07-05T08:21:00.000Z" });

    await expect(
      runtime.testAdapter({
        adapterPath: join(jellyfinDir, "adapter.mjs"),
        config: {
          apiKey: "jf_test_token",
          baseUrl: "http://media.example.test:8096",
          userId: "user-1",
        },
        service: { id: "service-jellyfin", name: "Jellyfin", url: "http://media.example.test:8096" },
      }),
    ).resolves.toMatchObject({ ok: true, message: expect.stringMatching(/Living Room Jellyfin/) });
  });

  test("fetches normalized Jellyfin recent additions state", async () => {
    const fetchImpl = vi.fn(async (url, options = {}) => {
      expect(options.headers.authorization).toContain('Token="jf_test_token"');

      if (String(url).endsWith("/System/Info")) {
        return Response.json({ ServerName: "Living Room Jellyfin", Version: "10.10.7" });
      }

      if (String(url).includes("/Items/Latest")) {
        return Response.json([
          {
            DateCreated: "2026-07-05T08:20:00.000Z",
            Id: "movie-1",
            ImageTags: { Primary: "tag-1" },
            Name: "Quiet Shore",
            ProductionYear: 2024,
            RunTimeTicks: 64200000000,
            Type: "Movie",
          },
          {
            DateCreated: "2026-07-04T08:20:00.000Z",
            Id: "episode-1",
            ImageTags: { Primary: "tag-2" },
            IndexNumber: 4,
            Name: "Signal Window",
            ParentIndexNumber: 1,
            ProductionYear: 2026,
            RunTimeTicks: 27000000000,
            Type: "Episode",
          },
          {
            DateCreated: "2026-06-28T08:20:00.000Z",
            Id: "audio-1",
            Name: "Night Drive",
            ProductionYear: 2023,
            RunTimeTicks: 2150000000,
            Type: "Audio",
          },
        ]);
      }

      return new Response("missing", { status: 404 });
    });
    const runtime = createAdapterRuntime({ fetchImpl, logger: console, now: () => "2026-07-05T08:21:00.000Z" });

    await expect(
      runtime.fetchAdapterState({
        adapterPath: join(jellyfinDir, "adapter.mjs"),
        config: {
          apiKey: "jf_test_token",
          baseUrl: "http://media.example.test:8096",
          userId: "user-1",
        },
        service: { id: "service-jellyfin", name: "Jellyfin", url: "http://media.example.test:8096" },
      }),
    ).resolves.toMatchObject({
      recent: {
        counts: { all: 3, movies: 1, music: 1, shows: 1, today: 1, week: 2 },
        items: [
          expect.objectContaining({
            detailUrl: "http://media.example.test:8096/web/#/details?id=movie-1",
            imageUrl: "/api/services/service-jellyfin/enhancement/media-image/movie-1?imageType=Primary&maxHeight=360",
            isLatest: true,
            title: "Quiet Shore",
            type: "Movie",
            year: 2024,
          }),
          expect.objectContaining({
            seasonEpisode: "S1 E4",
            title: "Signal Window",
            type: "Episode",
          }),
          expect.objectContaining({
            imageUrl: null,
            title: "Night Drive",
            type: "Music",
          }),
        ],
        server: { name: "Living Room Jellyfin", version: "10.10.7" },
        syncedAt: "2026-07-05T08:21:00.000Z",
      },
    });
  });

  test("falls back to Jellyfin item search when latest items endpoint is empty", async () => {
    const fetchImpl = vi.fn(async (url, options = {}) => {
      expect(options.headers.authorization).toContain('Token="jf_test_token"');

      if (String(url).endsWith("/System/Info")) {
        return Response.json({ ServerName: "Living Room Jellyfin", Version: "10.11.11" });
      }

      if (String(url).includes("/Items/Latest")) {
        return Response.json([]);
      }

      if (String(url).includes("/Items?")) {
        const requestUrl = new URL(String(url));

        expect(requestUrl.searchParams.get("SortBy")).toBe("DateCreated");
        expect(requestUrl.searchParams.get("SortOrder")).toBe("Descending");
        expect(requestUrl.searchParams.get("UserId")).toBe("user-1");

        return Response.json({
          Items: [
            {
              DateCreated: "2026-07-05T07:00:00.000Z",
              Id: "episode-fallback-1",
              ImageTags: { Primary: "tag-fallback" },
              IndexNumber: 8,
              Name: "Fallback Episode",
              ParentIndexNumber: 2,
              ProductionYear: 2026,
              RunTimeTicks: 18000000000,
              Type: "Episode",
            },
          ],
          TotalRecordCount: 1,
        });
      }

      return new Response("missing", { status: 404 });
    });
    const runtime = createAdapterRuntime({ fetchImpl, logger: console, now: () => "2026-07-05T08:21:00.000Z" });

    await expect(
      runtime.fetchAdapterState({
        adapterPath: join(jellyfinDir, "adapter.mjs"),
        config: {
          apiKey: "jf_test_token",
          baseUrl: "http://media.example.test:8096",
          userId: "user-1",
        },
        service: { id: "service-jellyfin", name: "Jellyfin", url: "http://media.example.test:8096" },
      }),
    ).resolves.toMatchObject({
      recent: {
        counts: { all: 1, movies: 0, music: 0, shows: 1, today: 1, week: 1 },
        items: [
          expect.objectContaining({
            id: "episode-fallback-1",
            seasonEpisode: "S2 E8",
            title: "Fallback Episode",
            type: "Episode",
          }),
        ],
      },
    });
  });
});
