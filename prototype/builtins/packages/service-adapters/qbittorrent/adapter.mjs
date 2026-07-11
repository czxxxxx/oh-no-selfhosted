function endpoint(baseUrl, path) {
  return `${String(baseUrl).replace(/\/$/, "")}${path}`;
}

function firstFinite(...values) {
  for (const value of values) {
    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return 0;
}

function countByState(torrents, states) {
  return torrents.filter((torrent) => states.has(torrent.state)).length;
}

function stateLabel(state) {
  if (["downloading", "stalledDL", "queuedDL", "checkingDL", "forcedDL", "metaDL"].includes(state)) {
    return "Downloading";
  }

  if (["uploading", "stalledUP", "queuedUP", "checkingUP", "forcedUP"].includes(state)) {
    return "Seeding";
  }

  if (["pausedUP", "pausedDL"].includes(state)) {
    return "Paused";
  }

  return state || "Active";
}

function torrentProgress(torrent) {
  const progress = Number(torrent.progress);

  if (!Number.isFinite(progress)) {
    return 0;
  }

  return Math.min(Math.max(progress <= 1 ? progress * 100 : progress, 0), 100);
}

function activeTorrentRows(torrents, activeStates) {
  return torrents
    .filter((torrent) => activeStates.has(torrent.state) || Number(torrent.dlspeed || 0) > 0 || Number(torrent.upspeed || 0) > 0)
    .sort((first, second) => Number(second.dlspeed || 0) + Number(second.upspeed || 0) - (Number(first.dlspeed || 0) + Number(first.upspeed || 0)))
    .slice(0, 4)
    .map((torrent) => ({
      downloadedBytes: Number(torrent.downloaded || 0),
      downloadSpeed: Number(torrent.dlspeed || 0),
      etaSeconds: Number(torrent.eta || 0),
      name: torrent.name || torrent.hash || "Torrent",
      progress: torrentProgress(torrent),
      ratio: Number(torrent.ratio || 0),
      state: torrent.state || "unknown",
      status: stateLabel(torrent.state),
      totalBytes: Number(torrent.size || 0),
      uploadSpeed: Number(torrent.upspeed || 0),
    }));
}

async function login(config, context) {
  const body = new URLSearchParams({ password: config.password || "", username: config.username || "" });
  const response = await context.fetch(endpoint(config.baseUrl, "/api/v2/auth/login"), {
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`qBittorrent login failed with HTTP ${response.status}`);
  }

  const cookie = response.headers.get("set-cookie") || "";
  context.cache.set("cookie", cookie.split(";")[0]);

  return cookie.split(";")[0];
}

async function qbitFetch(config, context, path) {
  const cookie = context.cache.get("cookie") || (await login(config, context));
  const response = await context.fetch(endpoint(config.baseUrl, path), {
    headers: cookie ? { cookie } : {},
  });

  if (!response.ok) {
    throw new Error(`qBittorrent API ${path} failed with HTTP ${response.status}`);
  }

  return response.json();
}

async function qbitFetchOptional(config, context, path) {
  try {
    return await qbitFetch(config, context, path);
  } catch {
    return null;
  }
}

export async function testConnection(config, context) {
  await login(config, context);
  await qbitFetch(config, context, "/api/v2/transfer/info");

  return { ok: true, message: "Login cookie valid and transfer API reachable" };
}

export async function fetchState(config, context) {
  await login(config, context);
  const [transferInfo, torrents, mainData] = await Promise.all([
    qbitFetch(config, context, "/api/v2/transfer/info"),
    qbitFetch(config, context, "/api/v2/torrents/info"),
    qbitFetchOptional(config, context, "/api/v2/sync/maindata?rid=0"),
  ]);
  const torrentRows = Array.isArray(torrents) ? torrents : [];
  const serverState = mainData?.server_state || {};
  const seedingStates = new Set(["uploading", "stalledUP", "queuedUP", "checkingUP", "forcedUP"]);
  const downloadingStates = new Set(["downloading", "stalledDL", "queuedDL", "checkingDL", "forcedDL", "metaDL"]);
  const pausedStates = new Set(["pausedUP", "pausedDL"]);
  const activeStates = new Set([...seedingStates, ...downloadingStates]);
  const seeding = countByState(torrentRows, seedingStates);
  const downloading = countByState(torrentRows, downloadingStates);
  const paused = countByState(torrentRows, pausedStates);
  const peers = torrentRows.reduce(
    (total, torrent) => total + Number(torrent.num_complete || 0) + Number(torrent.num_incomplete || 0),
    0,
  );
  const totalDownloaded = firstFinite(serverState.alltime_dl, transferInfo.alltime_dl, transferInfo.dl_info_data);
  const totalUploaded = firstFinite(serverState.alltime_ul, transferInfo.alltime_ul, transferInfo.up_info_data);

  return {
    summary: {
      connectionStatus: transferInfo.connection_status || "unknown",
      freeSpace: Number(transferInfo.free_space_on_disk || 0),
    },
    torrents: {
      downloading,
      paused,
      peers,
      seeding,
    },
    transfer: {
      activeTorrents: activeTorrentRows(torrentRows, activeStates),
      connectionStatus: transferInfo.connection_status || "unknown",
      dhtNodes: Number(transferInfo.dht_nodes || 0),
      downloadSpeed: Number(transferInfo.dl_info_speed || 0),
      downloading,
      paused,
      peers,
      ratio: totalDownloaded > 0 ? totalUploaded / totalDownloaded : 0,
      seeding,
      totalDownloaded,
      totalUploaded,
      uploadSpeed: Number(transferInfo.up_info_speed || 0),
    },
  };
}

export function getWidgetData(state, widgetConfig) {
  return state?.[widgetConfig.dataPath] || state || {};
}
