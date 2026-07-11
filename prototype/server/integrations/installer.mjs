import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  assertSafePluginId,
  assertSafeRelativePath,
  createRegistryClient,
  registrySourceCacheKey,
} from "../plugins/registry.mjs";
import {
  compilePluginFrontend,
  downloadPluginFrontendSources,
  installPluginDependencies,
  listFrontendSourceFiles,
} from "../plugins/frontend.mjs";
import { stagePluginInstall, stagePluginRemoval } from "../plugins/installer.mjs";
import { loadIntegrationDefinition } from "./manifest.mjs";

export function createIntegrationInstaller({ dataDir, fetchImpl = fetch } = {}) {
  const cacheRoot = resolve(dataDir, "integrations", "registry-cache");
  const installedRoot = resolve(dataDir, "integrations", "installed");
  const registryClient = createRegistryClient({ fetchImpl });

  return {
    installedRoot,
    async fetchRegistryIntegration(registryUrl, integrationId, options = {}) {
      const { index, registryUrl: normalizedUrl } = await registryClient.fetchIndex(registryUrl, options);
      const safeIntegrationId = assertSafePluginId(integrationId, "Integration id");
      const entry = index.integrations.find((candidate) => candidate.id === safeIntegrationId);

      if (!entry) {
        throw new Error("Integration not found in registry");
      }

      const pluginDir = join(cacheRoot, registrySourceCacheKey(normalizedUrl), safeIntegrationId);
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
        throw new Error("Integration manifest must be valid JSON");
      }

      if (manifest.id !== safeIntegrationId) {
        throw new Error("Integration manifest id must match the registry entry id");
      }

      const files = [
        ["manifest.json", manifestBytes],
        [assertSafeRelativePath(manifest.templates, "Integration templates path")],
        [assertSafeRelativePath(manifest.entry, "Integration entry path")],
        ...(manifest.files || []).map((filename) => [assertSafeRelativePath(filename, "Integration file")]),
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

      const definition = await loadIntegrationDefinition(pluginDir);

      if (entry.version && definition.manifest.version !== entry.version) {
        throw new Error("Integration manifest version must match the registry entry version");
      }

      return { ...definition, sourceRef: normalizedUrl, sourceType: normalizedUrl.startsWith("file:") ? "local" : "github" };
    },
    async fetchGitHubIntegration(registryUrl, integrationId, options = {}) {
      return this.fetchRegistryIntegration(registryUrl, integrationId, options);
    },
    async stageInstallIntegration(definition) {
      const integrationId = assertSafePluginId(definition.manifest.id, "Integration id");
      const installedPath = join(installedRoot, integrationId);
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
        validate: loadIntegrationDefinition,
      });

      return {
        ...installation,
        installedPath,
        manifest: installation.definition.manifest,
        templates: installation.definition.templates,
      };
    },
    async installIntegration(definition) {
      const installation = await this.stageInstallIntegration(definition);
      await installation.commit();
      return installation;
    },
    async uninstallIntegration(integrationId) {
      await rm(join(installedRoot, assertSafePluginId(integrationId, "Integration id")), {
        force: true,
        recursive: true,
      });
    },
    async stageUninstallIntegration(integrationId) {
      return stagePluginRemoval(join(installedRoot, assertSafePluginId(integrationId, "Integration id")));
    },
  };
}
