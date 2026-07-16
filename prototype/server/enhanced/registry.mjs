import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSafePluginId,
  assertSafeRelativePath,
  createRegistryClient,
  normalizeRegistryIndexUrl,
  registrySourceCacheKey,
} from "../plugins/registry.mjs";
import {
  compilePluginFrontend,
  downloadPluginFrontendSources,
  installPluginDependencies,
  listFrontendSourceFiles,
} from "../plugins/frontend.mjs";
import { stagePluginInstall, stagePluginRemoval } from "../plugins/installer.mjs";
import { BUILTIN_REGISTRY_URL } from "../plugins/builtinSource.mjs";
import { loadPluginDefinition } from "./manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const BUILTIN_ADAPTER_DIR = join(__dirname, "builtins");

async function listPluginDirs(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => []);

  return entries.filter((entry) => entry.isDirectory()).map((entry) => join(rootDir, entry.name));
}

async function listAdaptersFromRoot(rootDir, sourceType, sourceRef) {
  const dirs = await listPluginDirs(rootDir);
  const results = await Promise.allSettled(dirs.map((pluginDir) => loadPluginDefinition(pluginDir)));
  const definitions = [];
  const errors = [];

  results.forEach((result, index) => {
    const pluginDir = dirs[index];

    if (result.status === "fulfilled") {
      definitions.push({ ...result.value, sourceRef, sourceType });
    } else {
      errors.push({
        id: basename(pluginDir),
        message: result.reason?.message || "Service adapter failed to load",
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

function requireValidAdapters(result, label) {
  if (result.errors.length) {
    throw new Error(`${label}: ${result.errors.map((error) => `${error.id}: ${error.message}`).join("; ")}`);
  }

  return result.definitions;
}

export { normalizeRegistryIndexUrl };

export function createEnhancedRegistry({ builtInRegistryUrl = BUILTIN_REGISTRY_URL, dataDir, fetchImpl = fetch } = {}) {
  const installedRoot = resolve(dataDir, "enhanced-apps", "installed");
  const registryCacheRoot = resolve(dataDir, "enhanced-apps", "registry-cache");
  const registryClient = createRegistryClient({ fetchImpl });
  let builtInAdaptersPromise = null;

  return {
    normalizeRegistryIndexUrl,
    async fetchRegistry(url, options = {}) {
      return (await registryClient.fetchIndex(url, options)).index;
    },
    async fetchGitHubRegistry(url, options = {}) {
      return this.fetchRegistry(url, options);
    },
    async fetchRegistryAdapter(registryUrl, adapterId, options = {}) {
      const fetchedRegistry = await registryClient.fetchIndex(registryUrl, options);
      const normalizedUrl = fetchedRegistry.registryUrl;
      const registry = fetchedRegistry.index;
      const safeAdapterId = assertSafePluginId(adapterId, "Adapter id");
      const app = registry.apps.find((candidate) => candidate.id === safeAdapterId);

      if (!app) {
        throw new Error("Adapter not found in registry");
      }

      const pluginDir = join(registryCacheRoot, registrySourceCacheKey(normalizedUrl), safeAdapterId);
      await rm(pluginDir, { force: true, recursive: true });
      await mkdir(pluginDir, { recursive: true });

      const manifestBytes = await registryClient.fetchPluginFile({
        authToken: options.authToken,
        filename: "manifest.json",
        pluginPath: app.path,
        registryUrl: normalizedUrl,
      });
      let manifest;

      try {
        manifest = JSON.parse(manifestBytes.toString("utf8"));
      } catch {
        throw new Error("Adapter manifest must be valid JSON");
      }

      if (manifest.id !== safeAdapterId) {
        throw new Error("Adapter manifest id must match the registry entry id");
      }

      const files = [
        ["manifest.json", manifestBytes],
        [assertSafeRelativePath(manifest.widgets, "Adapter widgets path")],
        [assertSafeRelativePath(manifest.entry, "Adapter entry path")],
        ...(manifest.files || []).map((filename) => [assertSafeRelativePath(filename, "Adapter file")]),
        ...listFrontendSourceFiles(manifest.frontend).map((filename) => [filename]),
      ];

      for (const [filename, existingBytes] of new Map(files.map((file) => [file[0], file])).values()) {
        const filePath = join(pluginDir, filename);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(
          filePath,
          existingBytes ||
            (await registryClient.fetchPluginFile({
              authToken: options.authToken,
              filename,
              pluginPath: app.path,
              registryUrl: normalizedUrl,
            })),
        );
      }

      await downloadPluginFrontendSources({
        authToken: options.authToken,
        manifest,
        pluginDir,
        pluginPath: app.path,
        registryClient,
        registryUrl: normalizedUrl,
      });

      const definition = await loadPluginDefinition(pluginDir);

      if (app.version && definition.manifest.version !== app.version) {
        throw new Error("Adapter manifest version must match the registry entry version");
      }

      return { ...definition, sourceRef: normalizedUrl, sourceType: normalizedUrl.startsWith("file:") ? "local" : "github" };
    },
    async fetchGitHubAdapter(registryUrl, adapterId, options = {}) {
      return this.fetchRegistryAdapter(registryUrl, adapterId, options);
    },
    async stageInstallAdapter(definition) {
      const installedPath = join(installedRoot, assertSafePluginId(definition.manifest.id, "Adapter id"));
      const installation = await stagePluginInstall({
        build: async (stagePath, stagedDefinition) => {
          await installPluginDependencies({
            manifest: stagedDefinition.manifest,
            pluginDir: stagePath,
          });
          await compilePluginFrontend({
            force: true,
            manifest: stagedDefinition.manifest,
            pluginDir: stagePath,
          });
        },
        installedPath,
        sourcePath: definition.pluginDir,
        validate: loadPluginDefinition,
      });

      return {
        ...installation,
        installedPath,
        manifest: installation.definition.manifest,
        widgets: installation.definition.widgets,
      };
    },
    async installAdapter(definition) {
      const installation = await this.stageInstallAdapter(definition);
      await installation.commit();
      return installation;
    },
    async uninstallAdapter(adapterId) {
      await rm(join(installedRoot, assertSafePluginId(adapterId, "Adapter id")), { force: true, recursive: true });
    },
    async stageUninstallAdapter(adapterId) {
      return stagePluginRemoval(join(installedRoot, assertSafePluginId(adapterId, "Adapter id")));
    },
    async listBuiltInAdapters() {
      if (!builtInAdaptersPromise) {
        builtInAdaptersPromise = (async () => {
          const { index } = await registryClient.fetchIndex(builtInRegistryUrl);
          const results = await Promise.allSettled(
            index.apps.map((entry) => this.fetchRegistryAdapter(builtInRegistryUrl, entry.id)),
          );
          const errors = results.flatMap((result, position) =>
            result.status === "rejected"
              ? [{ id: index.apps[position].id, message: result.reason?.message || "Service adapter failed to load" }]
              : [],
          );

          return requireValidAdapters(
            {
              definitions: results.flatMap((result) =>
                result.status === "fulfilled"
                  ? [{ ...result.value, sourceRef: builtInRegistryUrl, sourceType: "built-in" }]
                  : [],
              ),
              errors,
            },
            "Built-in service adapters failed validation",
          );
        })().catch((error) => {
          builtInAdaptersPromise = null;
          throw error;
        });
      }

      return builtInAdaptersPromise;
    },
    async listLocalAdapters(sourcePath) {
      return (await listAdaptersFromRoot(sourcePath, "local", sourcePath)).definitions;
    },
    async inspectLocalAdapters(sourcePath) {
      return listAdaptersFromRoot(sourcePath, "local", sourcePath);
    },
  };
}
