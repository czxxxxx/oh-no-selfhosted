import { readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { BUILTIN_REGISTRY_URL } from "../plugins/builtinSource.mjs";
import { createRegistryClient } from "../plugins/registry.mjs";
import { loadWidgetPluginDefinition } from "./manifest.mjs";

async function listPluginDirs(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => []);

  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => join(rootDir, entry.name));
}

async function inspectRoot(rootDir, sourceType, sourceRef) {
  const pluginDirs = await listPluginDirs(rootDir);
  const results = await Promise.allSettled(pluginDirs.map((pluginDir) => loadWidgetPluginDefinition(pluginDir)));
  const definitions = [];
  const errors = [];

  results.forEach((result, index) => {
    const pluginDir = pluginDirs[index];

    if (result.status === "fulfilled") {
      definitions.push({ ...result.value, sourceRef, sourceType });
    } else {
      errors.push({
        id: basename(pluginDir),
        message: result.reason?.message || "Widget plugin failed to load",
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

export function createWidgetPluginRegistry({
  builtInInstaller = null,
  builtInRegistryUrl = BUILTIN_REGISTRY_URL,
  fetchImpl = fetch,
  installedDir,
  localPluginDirs = [],
} = {}) {
  const registryClient = createRegistryClient({ fetchImpl });
  let builtInInspectionPromise = null;

  async function inspectBuiltIns() {
    if (!builtInInstaller) {
      return { definitions: [], errors: [] };
    }

    if (!builtInInspectionPromise) {
      builtInInspectionPromise = (async () => {
        const { index } = await registryClient.fetchIndex(builtInRegistryUrl);
        const results = await Promise.allSettled(
          index.widgets.map((entry) => builtInInstaller.fetchRegistryWidgetPlugin(builtInRegistryUrl, entry.id)),
        );

        return {
          definitions: results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []),
          errors: results.flatMap((result, position) =>
            result.status === "rejected"
              ? [{
                  id: index.widgets[position].id,
                  message: result.reason?.message || "Widget plugin failed to load",
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

  async function inspect() {
    const roots = [
      ...localPluginDirs.map((pluginDir) => ({
        rootDir: resolve(pluginDir),
        sourceRef: resolve(pluginDir),
        sourceType: "local",
      })),
      ...(installedDir
        ? [{ rootDir: resolve(installedDir), sourceRef: resolve(installedDir), sourceType: "github" }]
        : []),
    ];
    const inspected = await Promise.all(
      roots.map(({ rootDir, sourceRef, sourceType }) => inspectRoot(rootDir, sourceType, sourceRef)),
    );
    const builtIns = await inspectBuiltIns();
    const byId = new Map();
    const errors = [...builtIns.errors, ...inspected.flatMap((result) => result.errors)];

    for (const definition of [builtIns, ...inspected].flatMap((result) => result.definitions)) {
      const existing = byId.get(definition.manifest.id);

      if (existing && !definition.manifest.replaces.includes(existing.manifest.id)) {
        errors.push({
          id: definition.manifest.id,
          message: `Widget plugin id conflicts with ${existing.sourceType} plugin ${existing.manifest.id}`,
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

  return {
    async listBuiltInPlugins() {
      const result = await inspectBuiltIns();

      if (result.errors.length) {
        throw new Error(
          `Built-in widgets failed validation: ${result.errors.map((error) => `${error.id}: ${error.message}`).join("; ")}`,
        );
      }

      return result.definitions;
    },
    async getPlugin(pluginId) {
      return (await inspect()).definitions.find((definition) => definition.manifest.id === pluginId) || null;
    },
    inspect,
    async listTemplates() {
      return (await inspect()).definitions.flatMap((definition) => definition.widgets);
    },
  };
}
