export const PLUGIN_API_VERSION = "oh-no.dev/v1";
export const HOST_VERSION = "0.1.0";
export const PLUGIN_KINDS = new Set(["integration", "service-adapter", "service-type", "widget"]);
export const PLUGIN_CAPABILITIES = new Set([
  "filesystem",
  "host-navigation",
  "host-refresh",
  "integration-state",
  "network",
  "process",
  "react",
  "service-state",
]);

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value;
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required`);
  }

  return value.trim();
}

function semverParts(version) {
  const match = String(version || "").trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);

  return match ? match.slice(1).map(Number) : null;
}

export function validateSemver(version, label = "Plugin version") {
  const normalized = assertNonEmptyString(version, label);

  if (!semverParts(normalized)) {
    throw new Error(`${label} must use semantic versioning (major.minor.patch)`);
  }

  return normalized;
}

export function compareSemver(first, second) {
  const firstParts = semverParts(first);
  const secondParts = semverParts(second);

  if (!firstParts || !secondParts) {
    throw new Error("Versions must use semantic versioning (major.minor.patch)");
  }

  for (let index = 0; index < firstParts.length; index += 1) {
    if (firstParts[index] !== secondParts[index]) {
      return firstParts[index] < secondParts[index] ? -1 : 1;
    }
  }

  return 0;
}

export function validatePluginDependency(input, label = "Plugin dependency") {
  const dependency = assertPlainObject(input, label);
  const kind = assertNonEmptyString(dependency.kind, `${label} kind`);

  if (!PLUGIN_KINDS.has(kind)) {
    throw new Error(`Unsupported ${label.toLowerCase()} kind: ${kind}`);
  }

  return {
    id: assertNonEmptyString(dependency.id, `${label} id`),
    kind,
    minVersion: dependency.minVersion
      ? validateSemver(dependency.minVersion, `${label} minVersion`)
      : null,
  };
}

export function validatePluginPackageDependencies(input, label = "Plugin dependencies") {
  if (input === undefined || input === null) {
    return {};
  }

  const dependencies = assertPlainObject(input, label);

  return Object.fromEntries(
    Object.entries(dependencies).map(([name, version]) => {
      if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)) {
        throw new Error(`Invalid ${label.toLowerCase()} package name: ${name}`);
      }

      return [name, validateSemver(version, `${label} ${name}`)];
    }),
  );
}

export function validateCommonPluginManifest(manifest, { kind }) {
  const normalized = assertPlainObject(manifest, "Plugin manifest");
  const apiVersion = normalized.apiVersion || PLUGIN_API_VERSION;
  const declaredKind = normalized.kind || kind;
  const minHostVersion = normalized.minHostVersion || null;
  const capabilities = Array.isArray(normalized.capabilities)
    ? [...new Set(normalized.capabilities.map((capability) => assertNonEmptyString(capability, "Plugin capability")))]
    : [];

  if (apiVersion !== PLUGIN_API_VERSION) {
    throw new Error(`Unsupported plugin apiVersion: ${apiVersion}`);
  }

  if (declaredKind !== kind) {
    throw new Error(`Plugin manifest kind must be ${kind}`);
  }

  const unsupportedCapability = capabilities.find((capability) => !PLUGIN_CAPABILITIES.has(capability));

  if (unsupportedCapability) {
    throw new Error(`Unsupported plugin capability: ${unsupportedCapability}`);
  }

  if (minHostVersion && compareSemver(HOST_VERSION, minHostVersion) < 0) {
    throw new Error(`Plugin requires Oh No Selfhosted ${minHostVersion} or newer`);
  }

  const requires = Array.isArray(normalized.requires)
    ? normalized.requires.map((dependency, index) =>
        validatePluginDependency(dependency, `Plugin dependency ${index + 1}`),
      )
    : [];
  const replaces = Array.isArray(normalized.replaces)
    ? [...new Set(normalized.replaces.map((id) => assertNonEmptyString(id, "Plugin replacement id")))]
    : [];

  return {
    apiVersion,
    capabilities,
    dependencies: validatePluginPackageDependencies(normalized.dependencies),
    kind,
    minHostVersion,
    replaces,
    requires,
  };
}

export function assertHostCompatibleManifest(manifest) {
  return validateCommonPluginManifest(manifest, { kind: manifest.kind });
}
