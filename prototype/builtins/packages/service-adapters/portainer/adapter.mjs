function baseUrl(config, context) {
  const rawUrl = String(config.baseUrl || context.service?.url || "").trim();

  if (!rawUrl) {
    throw new Error("Portainer service URL is required");
  }

  return rawUrl.replace(/\/$/, "");
}

function endpoint(config, context, path) {
  return `${baseUrl(config, context)}${path}`;
}

function environmentId(config) {
  const id = Number(config.endpointId || 1);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Portainer environment ID must be a positive integer");
  }

  return id;
}

function dockerPath(config, path) {
  return `/api/endpoints/${environmentId(config)}/docker${path}`;
}

function authHeaders(config) {
  const token = String(config.apiKey || config.accessToken || "").trim();

  if (!token) {
    throw new Error("Portainer API key or access token is required");
  }

  if (String(config.authMode || "apiKey").toLowerCase() === "bearer") {
    return { authorization: `Bearer ${token}` };
  }

  return { "x-api-key": token };
}

async function portainerFetch(config, context, path) {
  const response = await context.fetch(endpoint(config, context, path), {
    headers: authHeaders(config),
  });

  if (!response.ok) {
    throw new Error(`Portainer API ${path} failed with HTTP ${response.status}`);
  }

  return response.json();
}

function toNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

function firstName(container) {
  const names = Array.isArray(container.Names) ? container.Names : [];
  const name = names[0] || container.Name || "";

  return String(name).replace(/^\/+/, "") || shortId(container.Id);
}

function shortId(id) {
  return String(id || "").slice(0, 12);
}

function normalizeContainers(containers, info) {
  const rows = (Array.isArray(containers) ? containers : [])
    .map((container) => ({
      id: shortId(container.Id),
      image: container.Image || "unknown",
      name: firstName(container),
      state: String(container.State || "unknown"),
      status: container.Status || "unknown",
    }))
    .sort((a, b) => {
      if (a.state === "running" && b.state !== "running") {
        return -1;
      }

      if (a.state !== "running" && b.state === "running") {
        return 1;
      }

      return a.name.localeCompare(b.name);
    });
  const running = rows.filter((row) => row.state.toLowerCase() === "running").length;
  const total = rows.length || toNumber(info.Containers);
  const runningTotal = rows.length ? running : toNumber(info.ContainersRunning);

  return {
    containerRows: {
      rows,
      total,
    },
    containers: {
      running: runningTotal,
      stopped: Math.max(total - runningTotal, 0),
      total,
    },
  };
}

function normalizeImages(images) {
  const imageRows = Array.isArray(images) ? images : [];
  const totalSizeBytes = imageRows.reduce((total, image) => total + toNumber(image.Size ?? image.VirtualSize), 0);

  return {
    count: imageRows.length,
    totalSizeBytes,
  };
}

function normalizeEngine(info) {
  return {
    cpus: toNumber(info.NCPU),
    memoryTotalBytes: toNumber(info.MemTotal),
    operatingSystem: info.OperatingSystem || "unknown",
    serverVersion: info.ServerVersion || "unknown",
    status: "online",
  };
}

export async function testConnection(config, context) {
  const info = await portainerFetch(config, context, dockerPath(config, "/info"));

  return {
    ok: true,
    message: `Docker API reachable through Portainer${info.ServerVersion ? ` ${info.ServerVersion}` : ""}`,
  };
}

export async function fetchState(config, context) {
  const [containers, images, info] = await Promise.all([
    portainerFetch(config, context, dockerPath(config, "/containers/json?all=true")),
    portainerFetch(config, context, dockerPath(config, "/images/json")),
    portainerFetch(config, context, dockerPath(config, "/info")),
  ]);
  const containerState = normalizeContainers(containers, info);
  const engine = normalizeEngine(info);

  return {
    ...containerState,
    engine: {
      ...engine,
      checkedAt: context.now?.(),
    },
    images: normalizeImages(images),
    summary: {
      images: Array.isArray(images) ? images.length : 0,
      runningContainers: containerState.containers.running,
      status: "online",
      totalContainers: containerState.containers.total,
    },
  };
}

export function getWidgetData(state, widgetConfig) {
  return state?.[widgetConfig.dataPath] || state || {};
}
