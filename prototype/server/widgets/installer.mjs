import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  compilePluginFrontend,
  downloadPluginFrontendSources,
  installPluginDependencies,
  listFrontendSourceFiles,
} from "../plugins/frontend.mjs";
import { stagePluginInstall, stagePluginRemoval } from "../plugins/installer.mjs";
import {
  assertSafePluginId,
  assertSafeRelativePath,
  createRegistryClient,
  registrySourceCacheKey,
} from "../plugins/registry.mjs";
import { loadWidgetPluginDefinition } from "./manifest.mjs";

export function createWidgetPluginInstaller({ dataDir, fetchImpl = fetch } = {}) {
  const cacheRoot = resolve(dataDir, "widget-plugins", "registry-cache");
  const installedRoot = resolve(dataDir, "widget-plugins", "installed");
  const registryClient = createRegistryClient({ fetchImpl });

  return {
    installedRoot,
    async fetchRegistryWidgetPlugin(registryUrl, pluginId, options = {}) {
      const { index, registryUrl: normalizedUrl } = await registryClient.fetchIndex(registryUrl, options);
      const safePluginId = assertSafePluginId(pluginId, "Widget plugin id");
      const entry = index.widgets.find((candidate) => candidate.id === safePluginId);

      if (!entry) {
        throw new Error("Widget plugin not found in registry");
      }

      const pluginDir = join(cacheRoot, registrySourceCacheKey(normalizedUrl), safePluginId);
      await rm(pluginDir, { force: true, recursive: true });
      await mkdir(pluginDir, { recursive: true });
      const manifestBytes = await registryClient.fetchPluginFile({
        authToken: options.authToken,
        filename: "manifest.json",
        pluginPath: entry.path,
        registryUrl: normalizedUrl,
      });
      let manifest;

      try {
        manifest = JSON.parse(manifestBytes.toString("utf8"));
      } catch {
        throw new Error("Widget plugin manifest must be valid JSON");
      }

      if (manifest.id !== safePluginId) {
        throw new Error("Widget plugin manifest id must match the registry entry id");
      }

      const files = [
        ["manifest.json", manifestBytes],
        [assertSafeRelativePath(manifest.widgets, "Widget plugin definitions path")],
        ...(manifest.files || []).map((filename) => [assertSafeRelativePath(filename, "Widget plugin file")]),
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
              pluginPath: entry.path,
              registryUrl: normalizedUrl,
            })),
        );
      }

      await downloadPluginFrontendSources({
        authToken: options.authToken,
        manifest,
        pluginDir,
        pluginPath: entry.path,
        registryClient,
        registryUrl: normalizedUrl,
      });

      const definition = await loadWidgetPluginDefinition(pluginDir);

      if (entry.version && definition.manifest.version !== entry.version) {
        throw new Error("Widget plugin manifest version must match the registry entry version");
      }

      return { ...definition, sourceRef: normalizedUrl, sourceType: normalizedUrl.startsWith("file:") ? "local" : "github" };
    },
    async fetchGitHubWidgetPlugin(registryUrl, pluginId, options = {}) {
      return this.fetchRegistryWidgetPlugin(registryUrl, pluginId, options);
    },
    async stageInstallWidgetPlugin(definition) {
      const pluginId = assertSafePluginId(definition.manifest.id, "Widget plugin id");
      const installedPath = join(installedRoot, pluginId);
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
        validate: loadWidgetPluginDefinition,
      });

      return {
        ...installation,
        installedPath,
        manifest: installation.definition.manifest,
        widgets: installation.definition.widgets,
      };
    },
    async installWidgetPlugin(definition) {
      const installation = await this.stageInstallWidgetPlugin(definition);
      await installation.commit();
      return installation;
    },
    async stageUninstallWidgetPlugin(pluginId) {
      return stagePluginRemoval(join(installedRoot, assertSafePluginId(pluginId, "Widget plugin id")));
    },
  };
}
