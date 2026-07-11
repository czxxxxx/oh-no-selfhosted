import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { validateCommonPluginManifest, validatePluginDependency, validateSemver } from "./contract.mjs";

const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;

function assertRegistryUrl(input, label = "Registry URL") {
  let parsed;

  try {
    parsed = new URL(input);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }

  if (!new Set(["file:", "http:", "https:"]).has(parsed.protocol)) {
    throw new Error(`${label} must use file, http, or https`);
  }

  return parsed;
}

export function assertSafePluginId(value, label = "Plugin id") {
  const id = String(value || "").trim();

  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(id)) {
    throw new Error(`${label} must contain only letters, numbers, dots, underscores, and dashes`);
  }

  return id;
}

export function assertSafeRelativePath(value, label = "Plugin path") {
  const path = String(value || "").trim().replaceAll("\\", "/");
  const parts = path.split("/");

  if (
    !path ||
    path.startsWith("/") ||
    path.includes("://") ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`${label} must be a safe relative path`);
  }

  return path;
}

export function registrySourceCacheKey(registryUrl) {
  return createHash("sha256").update(normalizeRegistryIndexUrl(registryUrl)).digest("hex").slice(0, 16);
}

function validateRegistryEntry(entry, label) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`${label} must be an object`);
  }

  return {
    ...entry,
    id: assertSafePluginId(entry.id, `${label} id`),
    name: String(entry.name || entry.id || "").trim(),
    path: assertSafeRelativePath(entry.path, `${label} path`),
    requires: Array.isArray(entry.requires)
      ? entry.requires.map((dependency, index) =>
          validatePluginDependency(dependency, `${label} dependency ${index + 1}`),
        )
      : [],
  };
}

function validateServiceTypeEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("Service type must be an object");
  }

  const common = validateCommonPluginManifest(entry, { kind: "service-type" });
  const id = assertSafePluginId(entry.id, "Service type id");
  const name = String(entry.name || "").trim();

  if (!name) {
    throw new Error("Service type name is required");
  }

  return {
    ...entry,
    ...common,
    id,
    name,
    version: validateSemver(entry.version || "0.0.0", "Service type version"),
  };
}

function assertUniqueContributionIds(entries, label) {
  const ids = new Set();

  for (const entry of entries) {
    const id = assertSafePluginId(entry.id, `${label} id`);

    if (ids.has(id)) {
      throw new Error(`${label} contains duplicate id: ${id}`);
    }

    ids.add(id);
  }
}

export function validateRegistryIndex(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Registry index must be an object");
  }

  const hasContributionArray = ["apps", "integrations", "serviceTypes", "widgets"].some((key) =>
    Array.isArray(input[key]),
  );

  if (!hasContributionArray) {
    throw new Error("Registry index must include apps, integrations, serviceTypes, or widgets");
  }

  const version = Number(input.version || 1);

  if (!Number.isInteger(version) || version < 1) {
    throw new Error("Registry version must be a positive integer");
  }

  const apps = (input.apps || []).map((entry) => validateRegistryEntry(entry, "Service adapter"));
  const integrations = (input.integrations || []).map((entry) => validateRegistryEntry(entry, "Integration"));
  const serviceTypes = Array.isArray(input.serviceTypes)
    ? input.serviceTypes.map(validateServiceTypeEntry)
    : [];
  const widgets = (input.widgets || []).map((entry) => validateRegistryEntry(entry, "Widget plugin"));

  assertUniqueContributionIds(apps, "Service adapters");
  assertUniqueContributionIds(integrations, "Integrations");
  assertUniqueContributionIds(serviceTypes, "Service types");
  assertUniqueContributionIds(widgets, "Widget plugins");

  return {
    ...input,
    apps,
    integrations,
    name: String(input.name || "Plugin Registry").trim(),
    serviceTypes,
    version,
    widgets,
  };
}

function githubRepositoryCoordinates(inputUrl) {
  const parsed = assertRegistryUrl(inputUrl);

  if (parsed.protocol === "file:" || parsed.hostname !== "github.com") {
    return null;
  }

  const parts = parsed.pathname.split("/").filter(Boolean);

  if (!parts[0] || !parts[1]) {
    return null;
  }

  return {
    isBareRepository: parts.length === 2,
    owner: parts[0],
    repo: parts[1].replace(/\.git$/, ""),
  };
}

export function normalizeRegistryIndexUrl(inputUrl, { ref: requestedRef = null } = {}) {
  const parsed = assertRegistryUrl(inputUrl);

  if (parsed.protocol === "file:") {
    return parsed.toString();
  }

  if (parsed.hostname !== "github.com") {
    return parsed.toString();
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  const owner = parts[0];
  const repo = parts[1]?.replace(/\.git$/, "");

  if (!owner || !repo) {
    throw new Error("GitHub registry URL must include owner and repo");
  }

  if (parts[2] === "blob" && parts[3]) {
    const ref = encodeURIComponent(parts[3]);
    const filePath = parts.slice(4).join("/") || "registry.json";

    return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${filePath}`;
  }

  if (parts[2] === "tree" && parts[3]) {
    const ref = encodeURIComponent(parts[3]);
    const directory = parts.slice(4).join("/");
    const registryPath = directory ? `${directory}/registry.json` : "registry.json";

    return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${registryPath}`;
  }

  const ref = encodeURIComponent(requestedRef || "main");

  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/registry.json`;
}

function requestHeaders(authToken) {
  return authToken
    ? { accept: "application/vnd.github+json", authorization: `Bearer ${authToken}` }
    : {};
}

async function readBoundedResponse(response, { label, maxBytes }) {
  if (!response.ok) {
    throw new Error(`${label} fetch failed with HTTP ${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length"));

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`${label} exceeds the ${maxBytes} byte download limit`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  if (bytes.length > maxBytes) {
    throw new Error(`${label} exceeds the ${maxBytes} byte download limit`);
  }

  return bytes;
}

async function readBoundedFile(fileUrl, { label, maxBytes }) {
  let bytes;

  try {
    bytes = await readFile(fileURLToPath(fileUrl));
  } catch (error) {
    throw new Error(`${label} fetch failed: ${error.code || error.message}`);
  }

  if (bytes.length > maxBytes) {
    throw new Error(`${label} exceeds the ${maxBytes} byte download limit`);
  }

  return bytes;
}

export function createRegistryClient({ fetchImpl = fetch, maxFileBytes = DEFAULT_MAX_FILE_BYTES } = {}) {
  return {
    normalizeRegistryIndexUrl,
    async fetchIndex(inputUrl, { authToken = null, ref = null } = {}) {
      const githubRepository = githubRepositoryCoordinates(inputUrl);
      let registryUrl = normalizeRegistryIndexUrl(inputUrl, { ref });
      let response = registryUrl.startsWith("file:")
        ? null
        : await fetchImpl(registryUrl, { headers: requestHeaders(authToken) });

      if (response && !response.ok && !ref && githubRepository?.isBareRepository) {
        const metadataUrl = `https://api.github.com/repos/${encodeURIComponent(githubRepository.owner)}/${encodeURIComponent(githubRepository.repo)}`;
        const metadataResponse = await fetchImpl(metadataUrl, { headers: requestHeaders(authToken) });

        if (metadataResponse.ok) {
          const metadata = await metadataResponse.json();

          if (metadata.default_branch && metadata.default_branch !== "main") {
            registryUrl = normalizeRegistryIndexUrl(inputUrl, { ref: metadata.default_branch });
            response = await fetchImpl(registryUrl, { headers: requestHeaders(authToken) });
          }
        }
      }

      const bytes = registryUrl.startsWith("file:")
        ? await readBoundedFile(registryUrl, { label: "Registry index", maxBytes: maxFileBytes })
        : await readBoundedResponse(response, {
            label: "Registry index",
            maxBytes: maxFileBytes,
          });
      let parsed;

      try {
        parsed = JSON.parse(bytes.toString("utf8"));
      } catch {
        throw new Error("Registry index must be valid JSON");
      }

      return { index: validateRegistryIndex(parsed), registryUrl };
    },
    async fetchPluginFile({ authToken = null, filename, pluginPath, registryUrl }) {
      const safePluginPath = assertSafeRelativePath(pluginPath);
      const safeFilename = assertSafeRelativePath(filename, "Plugin filename");
      const baseUrl = new URL(".", normalizeRegistryIndexUrl(registryUrl));
      const fileUrl = new URL(`${safePluginPath}/${safeFilename}`, baseUrl);

      if (fileUrl.protocol !== baseUrl.protocol || (baseUrl.protocol !== "file:" && fileUrl.origin !== baseUrl.origin)) {
        throw new Error("Plugin files must use the same origin as the registry index");
      }

      const options = { label: `Plugin file ${safeFilename}`, maxBytes: maxFileBytes };

      return fileUrl.protocol === "file:"
        ? readBoundedFile(fileUrl, options)
        : readBoundedResponse(await fetchImpl(fileUrl, { headers: requestHeaders(authToken) }), options);
    },
  };
}
