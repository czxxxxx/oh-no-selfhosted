const TICKS_PER_MINUTE = 600000000;

function baseUrl(config, context) {
  const rawUrl = String(config.baseUrl || context.service?.url || "").trim();

  if (!rawUrl) {
    throw new Error("Jellyfin service URL is required");
  }

  return rawUrl.replace(/\/$/, "");
}

function endpoint(config, context, path) {
  return `${baseUrl(config, context)}${path}`;
}

function token(config) {
  const value = String(config.apiKey || config.accessToken || "").trim();

  if (!value) {
    throw new Error("Jellyfin API key or access token is required");
  }

  return value.replace(/"/g, "");
}

function authHeaders(config) {
  return {
    authorization: `MediaBrowser Client="Oh No Selfhosted", Device="Dashboard", DeviceId="oh-no-selfhosted", Version="0.1.0", Token="${token(config)}"`,
  };
}

function queryString(params) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      search.set(key, String(value));
    }
  }

  const serialized = search.toString();

  return serialized ? `?${serialized}` : "";
}

async function jellyfinFetch(config, context, path, params = {}) {
  const response = await context.fetch(`${endpoint(config, context, path)}${queryString(params)}`, {
    headers: authHeaders(config),
  });

  if (!response.ok) {
    throw new Error(`Jellyfin API ${path} failed with HTTP ${response.status}`);
  }

  return response.json();
}

function normalizeType(item) {
  const type = String(item.Type || item.MediaType || "").toLowerCase();

  if (type === "movie") {
    return "Movie";
  }

  if (type === "episode" || type === "series") {
    return "Episode";
  }

  if (type === "audio" || type === "musicalbum" || type === "musicartist") {
    return "Music";
  }

  return "Media";
}

function groupForType(type) {
  if (type === "Movie") {
    return "movies";
  }

  if (type === "Episode") {
    return "shows";
  }

  if (type === "Music") {
    return "music";
  }

  return "all";
}

function seasonEpisode(item) {
  const season = Number(item.ParentIndexNumber);
  const episode = Number(item.IndexNumber);

  if (Number.isInteger(season) && Number.isInteger(episode)) {
    return `S${season} E${episode}`;
  }

  if (Number.isInteger(episode)) {
    return `E${episode}`;
  }

  return null;
}

function imageUrlFor(item, context) {
  if (!item.Id || !item.ImageTags?.Primary) {
    return null;
  }

  return `/api/services/${encodeURIComponent(context.service.id)}/enhancement/media-image/${encodeURIComponent(item.Id)}?imageType=Primary&maxHeight=360`;
}

function detailUrlFor(item, config, context) {
  return `${baseUrl(config, context)}/web/#/details?id=${encodeURIComponent(item.Id)}`;
}

function normalizeItem(item, index, config, context) {
  const type = normalizeType(item);

  return {
    addedAt: item.DateCreated || null,
    detailUrl: item.Id ? detailUrlFor(item, config, context) : null,
    group: groupForType(type),
    id: item.Id || `jellyfin-item-${index}`,
    imageUrl: imageUrlFor(item, context),
    isLatest: index === 0,
    runtimeTicks: Number(item.RunTimeTicks || 0),
    seasonEpisode: type === "Episode" ? seasonEpisode(item) : null,
    title: item.Name || "Untitled media",
    type,
    year: Number.isFinite(Number(item.ProductionYear)) ? Number(item.ProductionYear) : null,
  };
}

function countSince(items, nowIso, days) {
  const now = new Date(nowIso);

  if (Number.isNaN(now.getTime())) {
    return 0;
  }

  const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  return items.filter((item) => {
    const date = new Date(item.addedAt || "");

    return !Number.isNaN(date.getTime()) && date >= threshold && date <= now;
  }).length;
}

function countsFor(items, nowIso) {
  return {
    all: items.length,
    movies: items.filter((item) => item.group === "movies").length,
    music: items.filter((item) => item.group === "music").length,
    shows: items.filter((item) => item.group === "shows").length,
    today: countSince(items, nowIso, 1),
    week: countSince(items, nowIso, 7),
  };
}

async function fetchLatestItems(config, context, limit = 12) {
  const latestItems = await jellyfinFetch(config, context, "/Items/Latest", {
    EnableImages: true,
    EnableImageTypes: "Primary",
    EnableUserData: Boolean(config.userId),
    Fields: "DateCreated,ImageTags,MediaType,ParentIndexNumber,ProductionYear,RunTimeTicks,IndexNumber",
    ImageTypeLimit: 1,
    IncludeItemTypes: "Movie,Episode,Audio",
    Limit: limit,
    UserId: config.userId,
  });

  if (Array.isArray(latestItems) && latestItems.length > 0) {
    return latestItems;
  }

  const fallbackItems = await jellyfinFetch(config, context, "/Items", {
    Fields: "DateCreated,ImageTags,MediaType,ParentIndexNumber,ProductionYear,RunTimeTicks,IndexNumber",
    IncludeItemTypes: "Movie,Episode,Audio",
    Limit: limit,
    Recursive: true,
    SortBy: "DateCreated",
    SortOrder: "Descending",
    UserId: config.userId,
  });

  if (Array.isArray(fallbackItems?.Items)) {
    return fallbackItems.Items;
  }

  return Array.isArray(fallbackItems) ? fallbackItems : [];
}

export async function testConnection(config, context) {
  const [systemInfo] = await Promise.all([
    jellyfinFetch(config, context, "/System/Info"),
    fetchLatestItems(config, context, 1),
  ]);
  const name = systemInfo.ServerName || "Jellyfin";
  const version = systemInfo.Version ? ` ${systemInfo.Version}` : "";

  return {
    ok: true,
    message: `${name}${version} API reachable`,
  };
}

export async function fetchState(config, context) {
  const [systemInfo, latestItems] = await Promise.all([
    jellyfinFetch(config, context, "/System/Info"),
    fetchLatestItems(config, context, 12),
  ]);
  const syncedAt = context.now?.() || new Date().toISOString();
  const items = (Array.isArray(latestItems) ? latestItems : []).map((item, index) =>
    normalizeItem(item, index, config, context),
  );

  return {
    recent: {
      counts: countsFor(items, syncedAt),
      items,
      server: {
        name: systemInfo.ServerName || "Jellyfin",
        version: systemInfo.Version || "unknown",
      },
      syncedAt,
    },
  };
}

export function getWidgetData(state, widgetConfig) {
  return state?.[widgetConfig.dataPath] || state?.recent || state || {};
}
