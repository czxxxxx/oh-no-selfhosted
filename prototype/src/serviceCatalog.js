export const BUILTIN_SERVICE_CATEGORIES = [
  "All",
  "Media",
  "Cloud",
  "Productivity",
  "Dev Tools",
  "Infrastructure",
  "Monitoring",
  "Download",
  "Network",
  "Security",
  "Custom",
];

const CURATED_SERVICE_TYPES = [
  {
    id: "jellyfin",
    name: "Jellyfin",
    description: "Media Server",
    category: "Media",
    color: "#7e5bef",
    iconKey: "jellyfin",
    aliases: ["media", "movie", "video"],
  },
  {
    id: "immich",
    name: "Immich",
    description: "Photos",
    category: "Media",
    color: "#f25d4d",
    iconKey: "immich",
    aliases: ["photo", "album"],
  },
  {
    id: "nextcloud",
    name: "Nextcloud",
    description: "Cloud Storage",
    category: "Cloud",
    color: "#1387d4",
    iconKey: "nextcloud",
    aliases: ["cloud", "files"],
  },
  {
    id: "home-assistant",
    name: "Home Assistant",
    description: "Home Automation",
    category: "Infrastructure",
    color: "#2ab5e8",
    iconKey: "home-assistant",
    aliases: ["home", "automation"],
  },
  {
    id: "vaultwarden",
    name: "Vaultwarden",
    description: "Password Manager",
    category: "Security",
    color: "#111827",
    iconKey: "vaultwarden",
    aliases: ["password", "bitwarden"],
  },
  {
    id: "gitea",
    name: "Gitea",
    description: "Git Service",
    category: "Dev Tools",
    color: "#609926",
    iconKey: "gitea",
    aliases: ["git", "code"],
  },
  {
    id: "portainer",
    name: "Portainer",
    description: "Container Mgmt",
    category: "Infrastructure",
    color: "#13a9da",
    iconKey: "portainer",
    aliases: ["docker", "container"],
  },
  {
    id: "grafana",
    name: "Grafana",
    description: "Analytics",
    category: "Monitoring",
    color: "#f46800",
    iconKey: "grafana",
    aliases: ["dashboard", "metrics"],
  },
  {
    id: "nas",
    name: "NAS",
    description: "File Storage",
    category: "Cloud",
    color: "#8b95a1",
    iconKey: "nas",
    aliases: ["storage", "files"],
  },
  {
    id: "qnap",
    name: "QNAP",
    description: "NAS Storage",
    category: "Infrastructure",
    color: "#c2410c",
    iconKey: "qnap",
    aliases: ["nas", "storage", "qnap.com"],
  },
  {
    id: "qbittorrent",
    name: "qBittorrent",
    description: "Download Client",
    category: "Download",
    color: "#2f80d1",
    iconKey: "qbittorrent",
    aliases: ["qbit", "torrent", "download"],
  },
  {
    id: "paperless-ngx",
    name: "Paperless-ngx",
    description: "Document Mgmt",
    category: "Productivity",
    color: "#3f7f2b",
    iconKey: "paperless",
    aliases: ["paperless", "document", "docs"],
  },
  {
    id: "prometheus",
    name: "Prometheus",
    description: "Monitoring",
    category: "Monitoring",
    color: "#e6522c",
    iconKey: "prometheus",
    aliases: ["metrics", "monitoring"],
  },
  {
    id: "uptime-kuma",
    name: "Uptime Kuma",
    description: "Uptime Monitor",
    category: "Monitoring",
    color: "#70c163",
    iconKey: "uptime-kuma",
    aliases: ["uptime", "status"],
  },
  {
    id: "adguard-home",
    name: "AdGuard Home",
    description: "DNS & Ad Block",
    category: "Security",
    color: "#67b279",
    iconKey: "adguard-home",
    aliases: ["dns", "adblock"],
  },
  {
    id: "syncthing",
    name: "Syncthing",
    description: "File Sync",
    category: "Cloud",
    color: "#0f9cca",
    iconKey: "syncthing",
    aliases: ["sync", "files"],
  },
  {
    id: "snapdrop",
    name: "Snapdrop",
    description: "Local File Transfer",
    category: "Network",
    color: "#047857",
    iconKey: "snapdrop",
    aliases: ["airdrop", "file transfer", "snapdrop.net"],
  },
  {
    id: "router",
    name: "Router",
    description: "Network Gateway",
    category: "Network",
    color: "#5b6ee1",
    iconKey: "router",
    aliases: ["network", "gateway"],
  },
  {
    id: "custom",
    name: "Custom URL",
    description: "Add any service by URL",
    category: "Custom",
    color: "#667085",
    iconKey: "custom",
    iconKind: "preset",
    aliases: ["custom", "url", "website"],
  },
];

export const BUILTIN_SERVICE_TYPES = CURATED_SERVICE_TYPES;

export function normalizeServiceType(input) {
  const id = String(input?.id || "").trim();
  const name = String(input?.name || "").trim();
  const category = String(input?.category || "Custom").trim();

  if (!id) {
    throw new Error("Service type id is required");
  }

  if (!name) {
    throw new Error("Service type name is required");
  }

  return {
    apiVersion: input.apiVersion || null,
    aliases: Array.isArray(input.aliases)
      ? input.aliases.map((alias) => String(alias).trim()).filter(Boolean)
      : [],
    category,
    color: /^#[\da-f]{6}$/i.test(input.color || "") ? input.color : "#667085",
    description: String(input.description || "Self-hosted service").trim(),
    iconKey: String(input.iconKey || id).trim(),
    iconKind: input.iconKind || (input.iconUrl ? "url" : "preset"),
    iconUrl: input.iconUrl || null,
    id,
    kind: input.kind || null,
    minHostVersion: input.minHostVersion || null,
    replaces: Array.isArray(input.replaces)
      ? [...new Set(input.replaces.map((candidate) => String(candidate).trim()).filter(Boolean))]
      : [],
    requires: Array.isArray(input.requires)
      ? input.requires.map((dependency) => ({ ...dependency }))
      : [],
    source: input.source || null,
    sourceId: input.sourceId || null,
    version: input.version || null,
    website: input.website || null,
    name,
  };
}

export function mergeServiceTypes(extraServiceTypes = []) {
  const byId = new Map(BUILTIN_SERVICE_TYPES.map((type) => [type.id, normalizeServiceType(type)]));

  for (const serviceType of extraServiceTypes) {
    const normalized = normalizeServiceType(serviceType);
    const existing = byId.get(normalized.id) || {};
    byId.set(normalized.id, { ...existing, ...normalized });
  }

  const custom = byId.get("custom");
  byId.delete("custom");

  return [...byId.values(), custom || normalizeServiceType(BUILTIN_SERVICE_TYPES.at(-1))];
}

export const SERVICE_TYPES = mergeServiceTypes();

export function getServiceCategories(serviceTypes = SERVICE_TYPES) {
  const categories = ["All"];

  for (const serviceType of serviceTypes) {
    if (!categories.includes(serviceType.category)) {
      categories.push(serviceType.category);
    }
  }

  if (!categories.includes("Custom")) {
    categories.push("Custom");
  }

  return categories;
}

export const SERVICE_CATEGORIES = getServiceCategories(SERVICE_TYPES);

export function findServiceType(typeId, serviceTypes = SERVICE_TYPES) {
  return serviceTypes.find((serviceType) => serviceType.id === typeId);
}

export function isPresetType(typeId, serviceTypes = SERVICE_TYPES) {
  return typeId !== "custom" && Boolean(findServiceType(typeId, serviceTypes));
}
