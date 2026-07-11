import { readdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILTIN_REGISTRY_URL } from "../plugins/builtinSource.mjs";
import { createRegistryClient } from "../plugins/registry.mjs";
import { loadIntegrationDefinition } from "./manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const BUILTIN_INTEGRATION_DIR = join(__dirname, "builtins");

async function listPluginDirs(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => []);

  return entries.filter((entry) => entry.isDirectory()).map((entry) => join(rootDir, entry.name));
}

async function inspectDefinitionsFromRoot(rootDir, sourceType, sourceRef) {
  const dirs = await listPluginDirs(rootDir);
  const results = await Promise.allSettled(dirs.map((pluginDir) => loadIntegrationDefinition(pluginDir)));
  const definitions = [];
  const errors = [];

  results.forEach((result, index) => {
    const pluginDir = dirs[index];

    if (result.status === "fulfilled") {
      definitions.push({ ...result.value, sourceRef, sourceType });
    } else {
      errors.push({
        id: basename(pluginDir),
        message: result.reason?.message || "Integration failed to load",
        pluginDir,
        sourceRef,
        sourceType,
      });
    }
  });

  return {
    definitions: definitions.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name)),
    errors,
  };
}

function throwInspectionErrors(result, label) {
  if (result.errors.length) {
    throw new Error(`${label}: ${result.errors.map((error) => `${error.id}: ${error.message}`).join("; ")}`);
  }

  return result.definitions;
}

function summarizeDefinition(definition) {
  return {
    color: definition.manifest.color,
    config: definition.manifest.config,
    description: definition.manifest.description,
    iconKey: definition.manifest.iconKey,
    iconKind: definition.manifest.iconKind,
    id: definition.manifest.id,
    name: definition.manifest.name,
    sourceRef: definition.sourceRef,
    sourceType: definition.sourceType,
    version: definition.manifest.version,
    widgets: definition.templates.map((template) => template.name),
  };
}

export function createIntegrationRegistry({
  builtInDir = BUILTIN_INTEGRATION_DIR,
  builtInInstaller = null,
  builtInRegistryUrl = BUILTIN_REGISTRY_URL,
  fetchImpl = fetch,
  installedDir,
  integrationPluginDirs = [],
} = {}) {
  const registryClient = createRegistryClient({ fetchImpl });
  let builtInInspectionPromise = null;

  async function inspectBuiltIns() {
    if (!builtInInstaller) {
      return inspectDefinitionsFromRoot(builtInDir, "built-in", "built-in");
    }

    if (!builtInInspectionPromise) {
      builtInInspectionPromise = (async () => {
        const { index } = await registryClient.fetchIndex(builtInRegistryUrl);
        const results = await Promise.allSettled(
          index.integrations.map((entry) => builtInInstaller.fetchRegistryIntegration(builtInRegistryUrl, entry.id)),
        );

        return {
          definitions: results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []),
          errors: results.flatMap((result, position) =>
            result.status === "rejected"
              ? [{
                  id: index.integrations[position].id,
                  message: result.reason?.message || "Integration failed to load",
                  sourceRef: builtInRegistryUrl,
                  sourceType: "local",
                }]
              : [],
          ),
        };
      })().catch((error) => {
        builtInInspectionPromise = null;
        throw error;
      });
    }

    return builtInInspectionPromise;
  }

  async function inspectDefinitions() {
    const builtIns = await inspectBuiltIns();
    const localResults =
      await Promise.all(
        integrationPluginDirs.map((pluginDir) =>
          inspectDefinitionsFromRoot(resolve(pluginDir), "local", resolve(pluginDir)),
        ),
      );
    const installed = installedDir
      ? await inspectDefinitionsFromRoot(resolve(installedDir), "github", resolve(installedDir))
      : { definitions: [], errors: [] };
    const byId = new Map();
    const errors = [
      ...builtIns.errors,
      ...localResults.flatMap((result) => result.errors),
      ...installed.errors,
    ];

    for (const definition of [
      ...builtIns.definitions,
      ...localResults.flatMap((result) => result.definitions),
      ...installed.definitions,
    ]) {
      const existing = byId.get(definition.manifest.id);

      if (existing && !definition.manifest.replaces.includes(existing.manifest.id)) {
        errors.push({
          id: definition.manifest.id,
          message: `Integration id conflicts with ${existing.sourceType} plugin ${existing.manifest.id}`,
          pluginDir: definition.pluginDir,
          sourceRef: definition.sourceRef,
          sourceType: definition.sourceType,
        });
        continue;
      }

      byId.set(definition.manifest.id, definition);
    }

    return {
      definitions: [...byId.values()].sort((a, b) => a.manifest.name.localeCompare(b.manifest.name)),
      errors,
    };
  }

  async function listDefinitions() {
    return (await inspectDefinitions()).definitions;
  }

  return {
    async getIntegration(integrationId) {
      return (await listDefinitions()).find((definition) => definition.manifest.id === integrationId) || null;
    },
    async listIntegrationSummaries() {
      return (await listDefinitions()).map(summarizeDefinition);
    },
    async listBuiltInIntegrations() {
      return throwInspectionErrors(
        await inspectBuiltIns(),
        "Built-in integrations failed validation",
      );
    },
    async listIntegrationTemplates() {
      return (await listDefinitions()).flatMap((definition) => definition.templates);
    },
    inspect: inspectDefinitions,
  };
}
