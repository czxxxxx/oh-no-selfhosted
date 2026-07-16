const MODERN = "modern";
const LEGACY = "legacy";

const TORRENT_FIELDS = {
  [MODERN]: [
    "downloaded_ever",
    "eta",
    "name",
    "peers_connected",
    "percent_done",
    "rate_download",
    "rate_upload",
    "status",
    "total_size",
    "upload_ratio",
  ],
  [LEGACY]: [
    "downloadedEver",
    "eta",
    "name",
    "peersConnected",
    "percentDone",
    "rateDownload",
    "rateUpload",
    "status",
    "totalSize",
    "uploadRatio",
  ],
};

const STATUS_LABELS = {
  0: "Paused",
  1: "Queued verification",
  2: "Verifying",
  3: "Queued download",
  4: "Downloading",
  5: "Queued seed",
  6: "Seeding",
};

const STATUS_STATES = {
  0: "stopped",
  1: "queuedCheck",
  2: "checking",
  3: "queuedDownload",
  4: "downloading",
  5: "queuedSeed",
  6: "seeding",
};

function rpcEndpoint(baseUrl) {
  let url;

  try {
    url = new URL(String(baseUrl || "").trim());
  } catch {
    throw new Error("Transmission endpoint URL is invalid");
  }

  url.hash = "";
  url.search = "";
  const pathname = url.pathname.replace(/\/+$/, "");

  if (/\/rpc$/i.test(pathname)) {
    url.pathname = pathname;
  } else if (/\/transmission\/web(?:\/.*)?$/i.test(pathname)) {
    url.pathname = pathname.replace(/\/web(?:\/.*)?$/i, "/rpc");
  } else if (/\/transmission$/i.test(pathname)) {
    url.pathname = `${pathname}/rpc`;
  } else {
    url.pathname = `${pathname}/transmission/rpc`.replace(/^\/\//, "/");
  }

  return url.toString().replace(/\/$/, "");
}

function firstValue(object, ...keys) {
  for (const key of keys) {
    if (object?.[key] !== undefined && object?.[key] !== null) {
      return object[key];
    }
  }

  return undefined;
}

function firstFinite(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return 0;
}

function nextRequestId(context) {
  const requestId = Number(context.cache.get("requestId") || 0) + 1;
  context.cache.set("requestId", requestId);
  return requestId;
}

function authorization(config) {
  const username = String(config.username || "");
  const password = String(config.password || "");

  if (!username && !password) {
    return null;
  }

  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

async function postRpc(config, context, body) {
  const headers = { "content-type": "application/json" };
  const authorizationHeader = authorization(config);
  const cachedSessionId = context.cache.get("sessionId");

  if (authorizationHeader) {
    headers.authorization = authorizationHeader;
  }

  if (cachedSessionId) {
    headers["x-transmission-session-id"] = cachedSessionId;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await context.fetch(rpcEndpoint(config.baseUrl), {
      body: JSON.stringify(body),
      headers,
      method: "POST",
    });

    if (response.status === 409) {
      const sessionId = response.headers.get("x-transmission-session-id");

      if (!sessionId) {
        throw new Error("Transmission RPC rejected the request without a session id");
      }

      context.cache.set("sessionId", sessionId);
      headers["x-transmission-session-id"] = sessionId;
      continue;
    }

    if (!response.ok) {
      throw new Error(`Transmission RPC failed with HTTP ${response.status}`);
    }

    try {
      return await response.json();
    } catch {
      throw new Error("Transmission RPC returned invalid JSON");
    }
  }

  throw new Error("Transmission RPC session negotiation failed");
}

function modernRpcError(method, payload) {
  const message = payload?.error?.message || "unknown error";
  const detail = payload?.error?.data?.error_string;
  return new Error(`Transmission RPC ${method} failed: ${detail ? `${message} (${detail})` : message}`);
}

async function invokeRpc(config, context, dialect, method, params = {}) {
  const requestId = nextRequestId(context);
  const payload = dialect === MODERN
    ? { id: requestId, jsonrpc: "2.0", method, params }
    : { arguments: params, method: method.replaceAll("_", "-"), tag: requestId };
  const response = await postRpc(config, context, payload);

  if (dialect === MODERN) {
    if (response?.error) {
      throw modernRpcError(method, response);
    }

    if (response?.jsonrpc !== "2.0" || !Object.hasOwn(response, "result")) {
      throw new Error("Transmission server does not support JSON-RPC 2.0");
    }

    return response.result || {};
  }

  if (response?.result !== "success") {
    throw new Error(`Transmission RPC ${method.replaceAll("_", "-")} failed: ${response?.result || "unknown error"}`);
  }

  return response.arguments || {};
}

async function readSession(config, context) {
  const cachedDialect = context.cache.get("dialect");

  if (cachedDialect) {
    return {
      dialect: cachedDialect,
      session: await invokeRpc(config, context, cachedDialect, "session_get"),
    };
  }

  try {
    const session = await invokeRpc(config, context, MODERN, "session_get");
    context.cache.set("dialect", MODERN);
    return { dialect: MODERN, session };
  } catch (modernError) {
    try {
      const session = await invokeRpc(config, context, LEGACY, "session_get");
      context.cache.set("dialect", LEGACY);
      return { dialect: LEGACY, session };
    } catch (legacyError) {
      throw new Error(`Transmission RPC connection failed: ${legacyError.message}`, { cause: modernError });
    }
  }
}

async function invokeOptional(config, context, dialect, method, params = {}) {
  try {
    return await invokeRpc(config, context, dialect, method, params);
  } catch {
    return null;
  }
}

function normalizeTorrent(torrent) {
  const statusCode = firstFinite(torrent?.status);

  return {
    downloadedBytes: firstFinite(firstValue(torrent, "downloaded_ever", "downloadedEver")),
    downloadSpeed: firstFinite(firstValue(torrent, "rate_download", "rateDownload")),
    etaSeconds: firstFinite(torrent?.eta),
    name: torrent?.name || "Torrent",
    peers: firstFinite(firstValue(torrent, "peers_connected", "peersConnected")),
    progress: Math.min(
      Math.max(firstFinite(firstValue(torrent, "percent_done", "percentDone")) * 100, 0),
      100,
    ),
    ratio: firstFinite(firstValue(torrent, "upload_ratio", "uploadRatio")),
    state: STATUS_STATES[statusCode] || "unknown",
    status: STATUS_LABELS[statusCode] || "Active",
    statusCode,
    totalBytes: firstFinite(firstValue(torrent, "total_size", "totalSize")),
    uploadSpeed: firstFinite(firstValue(torrent, "rate_upload", "rateUpload")),
  };
}

function activeTorrentRows(torrents) {
  return torrents
    .map(normalizeTorrent)
    .filter(
      (torrent) =>
        torrent.statusCode > 0 || torrent.downloadSpeed > 0 || torrent.uploadSpeed > 0,
    )
    .sort(
      (first, second) =>
        second.downloadSpeed + second.uploadSpeed - (first.downloadSpeed + first.uploadSpeed),
    )
    .slice(0, 4)
    .map(({ peers, statusCode, ...torrent }) => torrent);
}

function countStatuses(torrents, statuses) {
  return torrents.filter((torrent) => statuses.has(firstFinite(torrent?.status))).length;
}

export async function testConnection(config, context) {
  const { session } = await readSession(config, context);
  const version = firstValue(session, "version");

  return {
    ok: true,
    message: version ? `Transmission ${version} RPC reachable` : "Transmission RPC reachable",
  };
}

export async function fetchState(config, context) {
  const { dialect, session } = await readSession(config, context);
  const downloadDir = firstValue(session, "download_dir", "download-dir");
  const torrentParams = { fields: TORRENT_FIELDS[dialect] };
  const [stats, torrentResult, freeSpaceResult] = await Promise.all([
    invokeRpc(config, context, dialect, "session_stats"),
    invokeRpc(config, context, dialect, "torrent_get", torrentParams),
    downloadDir
      ? invokeOptional(config, context, dialect, "free_space", { path: downloadDir })
      : Promise.resolve(null),
  ]);
  const torrentRows = Array.isArray(torrentResult?.torrents) ? torrentResult.torrents : [];
  const cumulativeStats = firstValue(stats, "cumulative_stats", "cumulative-stats") || {};
  const seeding = countStatuses(torrentRows, new Set([5, 6]));
  const downloading = countStatuses(torrentRows, new Set([3, 4]));
  const paused = countStatuses(torrentRows, new Set([0]));
  const peers = torrentRows.reduce(
    (total, torrent) =>
      total + firstFinite(firstValue(torrent, "peers_connected", "peersConnected")),
    0,
  );
  const totalDownloaded = firstFinite(
    firstValue(cumulativeStats, "downloaded_bytes", "downloadedBytes"),
  );
  const totalUploaded = firstFinite(
    firstValue(cumulativeStats, "uploaded_bytes", "uploadedBytes"),
  );
  const freeSpace = firstFinite(
    firstValue(freeSpaceResult, "size_bytes", "size-bytes"),
    firstValue(session, "download_dir_free_space", "download-dir-free-space"),
  );
  const transfer = {
    activeTorrents: activeTorrentRows(torrentRows),
    connectionStatus: "connected",
    downloadSpeed: firstFinite(firstValue(stats, "download_speed", "downloadSpeed")),
    downloading,
    paused,
    peers,
    ratio: totalDownloaded > 0 ? totalUploaded / totalDownloaded : 0,
    seeding,
    totalDownloaded,
    totalUploaded,
    uploadSpeed: firstFinite(firstValue(stats, "upload_speed", "uploadSpeed")),
  };

  return {
    summary: {
      connectionStatus: "connected",
      freeSpace,
    },
    torrents: {
      downloading,
      paused,
      peers,
      seeding,
    },
    transfer,
  };
}

export function getWidgetData(state, widgetConfig) {
  return state?.[widgetConfig.dataPath] || state || {};
}
