import { join } from "node:path";
import { configWithServiceDefaults } from "../src/enhancedConfig.js";
import { normalizeServiceType } from "../src/serviceCatalog.js";
import {
  deleteUploadedBackground,
  listUploadedBackgrounds,
  saveUploadedBackground,
  serveUploadedBackground,
} from "./backgrounds.mjs";
import { createEnhancedRegistry } from "./enhanced/registry.mjs";
import { proxyJellyfinMediaImage } from "./enhanced/jellyfinImageProxy.mjs";
import { createAdapterRuntime } from "./enhanced/runtime.mjs";
import { refreshServiceEnhancement } from "./enhanced/serviceRefresh.mjs";
import { buildServiceEnhancedWidgetTemplates } from "./enhanced/widgetTemplates.mjs";
import { resolveFavicon } from "./favicon.mjs";
import { readJsonBody, sendError, sendJson } from "./http.mjs";
import { saveUploadedIcon, serveIcon } from "./icons.mjs";
import { createIntegrationInstaller } from "./integrations/installer.mjs";
import { createIntegrationRegistry } from "./integrations/registry.mjs";
import { createIntegrationRuntime } from "./integrations/runtime.mjs";
import { createBuiltInPluginRegistry } from "./plugins/builtinRegistry.mjs";
import { BUILTIN_REGISTRY_ID, BUILTIN_REGISTRY_URL, isBuiltInSource } from "./plugins/builtinSource.mjs";
import { compareSemver } from "./plugins/contract.mjs";
import { readPluginFrontendArtifact } from "./plugins/frontend.mjs";
import { createServiceTypeRegistry } from "./serviceTypeRegistry.mjs";
import { createWidgetPluginInstaller } from "./widgets/installer.mjs";
import { createWidgetPluginRegistry } from "./widgets/registry.mjs";
import { validateWidgetConfig } from "./widgetValidation.mjs";
import { prepareWidgetForClient } from "./widgetPresentation.mjs";

function findService(store, serviceId) {
  const service = store.listServices().find((candidate) => candidate.id === serviceId);

  if (!service) {
    throw new Error("Service not found");
  }

  return service;
}

function requireEnhancement(store, serviceId) {
  const enhancement = store.getServiceEnhancement(serviceId);

  if (!enhancement) {
    throw new Error("Service enhancement not configured");
  }

  return enhancement;
}

export function createApiHandler({
  allowUnsafePlugins = false,
  codexAuthPath,
  dataDir,
  fetchImpl = fetch,
  integrationPluginDirs = [],
  widgetPluginDirs = [],
  now = () => new Date().toISOString(),
  store,
}) {
  const registry = createEnhancedRegistry({ dataDir, fetchImpl });
  const runtime = createAdapterRuntime({ fetchImpl, logger: console });
  const integrationInstaller = createIntegrationInstaller({ dataDir, fetchImpl });
  const integrationRegistry = createIntegrationRegistry({
    builtInInstaller: integrationInstaller,
    fetchImpl,
    installedDir: allowUnsafePlugins ? integrationInstaller.installedRoot : null,
    integrationPluginDirs: allowUnsafePlugins ? integrationPluginDirs : [],
  });
  const integrationRuntime = createIntegrationRuntime({ codexAuthPath, fetchImpl, logger: console, now });
  const integrationRefreshes = new Map();
  const serviceTypeRegistry = createServiceTypeRegistry({ dataDir });
  const widgetPluginInstaller = createWidgetPluginInstaller({ dataDir, fetchImpl });
  const widgetPluginRegistry = createWidgetPluginRegistry({
    builtInInstaller: widgetPluginInstaller,
    fetchImpl,
    installedDir: allowUnsafePlugins ? widgetPluginInstaller.installedRoot : null,
    localPluginDirs: allowUnsafePlugins ? widgetPluginDirs : [],
  });
  const builtInPluginRegistry = createBuiltInPluginRegistry({
    enhancedRegistry: registry,
    integrationRegistry,
    widgetPluginRegistry,
  });

  function sourceIdForAdapter(adapter) {
    return store.listEnhancedRegistrySources().find((source) => {
      try {
        return registry.normalizeRegistryIndexUrl(source.url, { ref: source.ref || null }) === adapter.sourceRef || source.url === adapter.sourceRef;
      } catch {
        return source.url === adapter.sourceRef;
      }
    })?.id;
  }

  function findRegistrySource(sourceId) {
    return store.getEnhancedRegistrySource(sourceId, { includeSecrets: true });
  }

  function registrySourceOptions(source) {
    return { authToken: source.authToken || null, ref: source.ref || null };
  }

  function requireUnsafePluginsEnabled() {
    if (!allowUnsafePlugins) {
      throw new Error(
        "External plugins are disabled. Start the server with --allow-unsafe-plugins true only for trusted, isolated use.",
      );
    }
  }

  function requireAdapterExecutionAllowed(adapter) {
    if (!allowUnsafePlugins && !isBuiltInSource(adapter)) {
      throw new Error("External adapter execution is disabled");
    }

    return adapter;
  }

  function adapterSecretKeys(adapter) {
    return new Set(
      (adapter?.manifest?.configSchema || [])
        .filter((field) => field.type === "password")
        .map((field) => field.key),
    );
  }

  function publicServiceEnhancement(enhancement, adapter = null) {
    if (!enhancement) return null;

    const secretKeys = adapterSecretKeys(adapter);
    const config = Object.fromEntries(
      Object.entries(enhancement.config || {}).filter(([key]) => !secretKeys.has(key)),
    );

    return {
      ...enhancement,
      config,
      configuredFields: Object.entries(enhancement.config || {})
        .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
        .map(([key]) => key),
    };
  }

  function mergeStoredSecrets(inputConfig, existingConfig, adapter) {
    const config = { ...(inputConfig || {}) };

    for (const key of adapterSecretKeys(adapter)) {
      if ((config[key] === undefined || config[key] === null || config[key] === "") && existingConfig?.[key]) {
        config[key] = existingConfig[key];
      }
    }

    return config;
  }

  function requireTrustedRegistrySource(sourceId) {
    const source = findRegistrySource(sourceId);

    if (!source) {
      throw new Error("Registry source not found");
    }

    if (!source.trusted) {
      throw new Error("Trust this registry source before installing plugin code");
    }

    return source;
  }

  function pluginContributions() {
    const installedAdapters = new Map(store.listEnhancedAdapters().map((adapter) => [adapter.id, adapter]));
    const installedIntegrations = new Map(
      store.listInstalledIntegrations().map((integration) => [integration.id, integration]),
    );
    const installedWidgetPlugins = new Map(
      store.listInstalledWidgetPlugins().map((plugin) => [plugin.id, plugin]),
    );
    const configuredServiceTypes = new Map(
      serviceTypeRegistry.listConfiguredServiceTypes().map((serviceType) => [serviceType.id, serviceType]),
    );

    const available = store.listEnhancedRegistrySources().flatMap((source) => {
      const index = source.registryIndex;

      if (!index) {
        return [];
      }

      return [
        ...(index.serviceTypes || []).map((serviceType) => ({
          ...serviceType,
          installed: configuredServiceTypes.get(serviceType.id)?.sourceId === source.id,
          installedVersion: configuredServiceTypes.get(serviceType.id)?.version || null,
          kind: "service-type",
          sourceId: source.id,
          sourceName: source.name,
          sourceRef: source.url,
          trusted: source.trusted,
        })),
        ...(index.apps || []).map((adapter) => ({
          ...adapter,
          installed: Boolean(installedAdapters.get(adapter.id)),
          installedVersion: installedAdapters.get(adapter.id)?.version || null,
          kind: "service-adapter",
          sourceId: source.id,
          sourceName: source.name,
          sourceRef: source.url,
          trusted: source.trusted,
        })),
        ...(index.integrations || []).map((integration) => ({
          ...integration,
          installed: Boolean(installedIntegrations.get(integration.id)),
          installedVersion: installedIntegrations.get(integration.id)?.version || null,
          kind: "integration",
          sourceId: source.id,
          sourceName: source.name,
          sourceRef: source.url,
          trusted: source.trusted,
        })),
        ...(index.widgets || []).map((plugin) => ({
          ...plugin,
          installed: Boolean(installedWidgetPlugins.get(plugin.id)),
          installedVersion: installedWidgetPlugins.get(plugin.id)?.version || null,
          kind: "widget",
          sourceId: source.id,
          sourceName: source.name,
          sourceRef: source.url,
          trusted: source.trusted,
        })),
      ];
    });
    const keys = new Set(available.map((contribution) => `${contribution.kind}:${contribution.id}`));

    for (const adapter of installedAdapters.values()) {
      const key = `service-adapter:${adapter.id}`;

      if (adapter.sourceType === "built-in" || adapter.sourceRef === BUILTIN_REGISTRY_URL || keys.has(key)) {
        continue;
      }

      available.push({
        description: adapter.manifest.description,
        id: adapter.id,
        installed: true,
        installedVersion: adapter.version,
        kind: "service-adapter",
        name: adapter.name,
        serviceTypes: adapter.manifest.serviceTypes || [],
        sourceId: adapter.sourceId || sourceIdForAdapter(adapter) || null,
        sourceName: "Installed plugin",
        sourceRef: adapter.sourceRef,
        trusted: true,
      });
    }

    for (const integration of installedIntegrations.values()) {
      const key = `integration:${integration.id}`;

      if (integration.sourceRef === BUILTIN_REGISTRY_URL || keys.has(key)) {
        continue;
      }

      available.push({
        description: integration.manifest.description,
        id: integration.id,
        installed: true,
        installedVersion: integration.version,
        kind: "integration",
        name: integration.name,
        sourceId: integration.sourceId,
        sourceName: "Installed plugin",
        sourceRef: integration.sourceRef,
        trusted: true,
      });
    }

    for (const plugin of installedWidgetPlugins.values()) {
      const key = `widget:${plugin.id}`;

      if (plugin.sourceRef === BUILTIN_REGISTRY_URL || keys.has(key)) {
        continue;
      }

      available.push({
        description: plugin.manifest.description,
        id: plugin.id,
        installed: true,
        installedVersion: plugin.version,
        kind: "widget",
        name: plugin.name,
        sourceId: plugin.sourceId,
        sourceName: "Installed plugin",
        sourceRef: plugin.sourceRef,
        trusted: true,
      });
    }

    for (const serviceType of configuredServiceTypes.values()) {
      const key = `service-type:${serviceType.id}`;

      if (serviceType.source !== "plugin-registry" || keys.has(key)) {
        continue;
      }

      available.push({
        ...serviceType,
        installed: true,
        installedVersion: serviceType.version || null,
        kind: "service-type",
        sourceName: "Installed plugin",
        sourceRef: null,
        trusted: true,
      });
    }

    return available.map((contribution) => {
      let versionState = contribution.installed ? "installed" : "available";

      if (contribution.installed && contribution.version && contribution.installedVersion) {
        const comparison = compareSemver(contribution.version, contribution.installedVersion);
        versionState = comparison > 0 ? "update-available" : comparison < 0 ? "newer-installed" : "current";
      }

      return {
        ...contribution,
        updateAvailable: versionState === "update-available",
        versionState,
      };
    });
  }

  async function syncRegistrySource(source) {
    try {
      const fetchedIndex = await registry.fetchRegistry(source.url, registrySourceOptions(source));
      const registryIndex = {
        ...fetchedIndex,
        serviceTypes: fetchedIndex.serviceTypes.map((serviceType) =>
          normalizeServiceType({
            ...serviceType,
            source: "plugin-registry",
            sourceId: source.id,
          }),
        ),
      };
      const counts = [
        `${registryIndex.apps.length} adapters`,
        `${registryIndex.integrations.length} integrations`,
        `${registryIndex.serviceTypes.length} service types`,
        `${registryIndex.widgets.length} widget plugins`,
      ];
      const savedSource = store.updateEnhancedRegistrySourceSync(source.id, {
        lastSyncMessage: counts.join(" · "),
        lastSyncStatus: "ok",
        registryIndex,
      });

      return { registryIndex, source: savedSource };
    } catch (error) {
      store.updateEnhancedRegistrySourceSync(source.id, {
        lastSyncMessage: error.message || "Registry sync failed",
        lastSyncStatus: "error",
      });
      throw error;
    }
  }

  function registryContribution(index, kind, pluginId) {
    const collection =
      kind === "service-type"
        ? index.serviceTypes
        : kind === "service-adapter"
          ? index.apps
          : kind === "integration"
            ? index.integrations
            : index.widgets;

    return collection.find((candidate) => candidate.id === pluginId) || null;
  }

  function installedContribution(kind, pluginId) {
    if (kind === "service-type") {
      return serviceTypeRegistry.listConfiguredServiceTypes().find((candidate) => candidate.id === pluginId) || null;
    }

    if (kind === "service-adapter") {
      return store.getEnhancedAdapter(pluginId);
    }

    if (kind === "integration") {
      return store.getInstalledIntegration(pluginId);
    }

    return store.getInstalledWidgetPlugin(pluginId);
  }

  function installedPluginDescriptors() {
    return [
      ...serviceTypeRegistry.listConfiguredServiceTypes().map((plugin) => ({
        id: plugin.id,
        kind: "service-type",
        manifest: plugin,
      })),
      ...store.listEnhancedAdapters().map((plugin) => ({
        id: plugin.id,
        kind: "service-adapter",
        manifest: plugin.manifest,
      })),
      ...store.listInstalledIntegrations().map((plugin) => ({
        id: plugin.id,
        kind: "integration",
        manifest: plugin.manifest,
      })),
      ...store.listInstalledWidgetPlugins().map((plugin) => ({
        id: plugin.id,
        kind: "widget",
        manifest: plugin.manifest,
      })),
    ];
  }

  function assertPluginCanUninstall(kind, pluginId) {
    const dependent = installedPluginDescriptors().find((plugin) =>
      (plugin.manifest?.requires || []).some(
        (dependency) => dependency.kind === kind && dependency.id === pluginId,
      ),
    );

    if (dependent) {
      throw new Error(
        `${kind} ${pluginId} is required by ${dependent.kind} ${dependent.id}`,
      );
    }

    if (
      kind === "service-type" &&
      store.listServices().some((service) => service.typeId === pluginId)
    ) {
      throw new Error("Service type is still used by an existing service");
    }

    if (
      kind === "service-adapter" &&
      store.listServiceEnhancements().some((enhancement) => enhancement.adapterId === pluginId)
    ) {
      throw new Error("Service adapter is still used by a service enhancement");
    }

    if (
      kind === "integration" &&
      (store.listWidgets().some((widget) => widget.integrationId === pluginId) ||
        store.listIntegrationInstances({ integrationId: pluginId }).length > 0)
    ) {
      throw new Error("Integration is still used by a configured instance or widget");
    }

    if (
      kind === "widget" &&
      store.listWidgets().some((widget) => widget.pluginId === pluginId)
    ) {
      throw new Error("Widget plugin is still used by an existing widget");
    }
  }

  async function ensurePluginDependencies({ dependencies = [], index, source, stack }) {
    for (const dependency of dependencies) {
      const installed = installedContribution(dependency.kind, dependency.id);

      if (installed) {
        if (dependency.minVersion && !installed.version) {
          throw new Error(`${dependency.kind} ${dependency.id} does not declare an installed version`);
        }

        if (dependency.minVersion && compareSemver(installed.version, dependency.minVersion) < 0) {
          throw new Error(
            `${dependency.kind} ${dependency.id} must be ${dependency.minVersion} or newer`,
          );
        }

        continue;
      }

      if (!registryContribution(index, dependency.kind, dependency.id)) {
        throw new Error(`Missing plugin dependency: ${dependency.kind} ${dependency.id}`);
      }

      await installPluginContribution({
        kind: dependency.kind,
        pluginId: dependency.id,
        sourceId: source.id,
      }, stack);
    }
  }

  async function assertPluginIdAvailable({ kind, manifest, pluginId, source }) {
    const installed = installedContribution(kind, pluginId);
    const replaces = manifest?.replaces || [];
    let sameSource = false;

    if (installed) {
      sameSource = kind === "service-adapter"
        ? installed.sourceId === source.id ||
          installed.sourceRef === source.url ||
          installed.sourceRef === registry.normalizeRegistryIndexUrl(source.url, { ref: source.ref || null })
        : installed.sourceId === source.id;

      if (!sameSource && !replaces.includes(pluginId)) {
        throw new Error(`${kind} id is already installed from another source: ${pluginId}`);
      }

      return;
    }

    const builtInCollision =
      kind === "service-type"
        ? serviceTypeRegistry.listServiceTypes().some(
            (candidate) => candidate.id === pluginId && candidate.sourceId === BUILTIN_REGISTRY_ID,
          )
        : kind === "service-adapter"
          ? (await registry.listBuiltInAdapters()).some((definition) => definition.manifest.id === pluginId)
          : kind === "integration"
            ? Boolean(await integrationRegistry.getIntegration(pluginId))
            : Boolean(await widgetPluginRegistry.getPlugin(pluginId));

    if (builtInCollision && !replaces.includes(pluginId)) {
      throw new Error(`${kind} id conflicts with an existing plugin: ${pluginId}`);
    }
  }

  async function installPluginContribution(input, parentStack = []) {
    const source = requireTrustedRegistrySource(input.sourceId);
    const index = source.registryIndex || (await syncRegistrySource(source)).registryIndex;
    const key = `${input.kind}:${input.pluginId}`;
    const stack = [...parentStack, key];

    if (parentStack.includes(key)) {
      throw new Error(`Circular plugin dependency: ${stack.join(" -> ")}`);
    }

    const registryEntry = registryContribution(index, input.kind, input.pluginId);

    if (!registryEntry) {
      throw new Error(`${input.kind} not found in registry: ${input.pluginId}`);
    }

    const current = installedContribution(input.kind, input.pluginId);

    if (
      current?.version &&
      registryEntry.version &&
      compareSemver(registryEntry.version, current.version) < 0 &&
      input.allowDowngrade !== true
    ) {
      throw new Error(
        `Refusing to downgrade ${input.kind} ${input.pluginId} from ${current.version} to ${registryEntry.version}`,
      );
    }

    await ensurePluginDependencies({
      dependencies: registryEntry.requires || [],
      index,
      source,
      stack,
    });

    if (input.kind === "service-type") {
      const definition = registryEntry;

      await assertPluginIdAvailable({
        kind: input.kind,
        manifest: definition,
        pluginId: input.pluginId,
        source,
      });

      return serviceTypeRegistry.upsertServiceType({
        ...definition,
        source: "plugin-registry",
        sourceId: source.id,
      });
    }

    if (input.kind === "service-adapter") {
      const definition = await registry.fetchRegistryAdapter(
        source.url,
        input.pluginId,
        registrySourceOptions(source),
      );
      await ensurePluginDependencies({ dependencies: definition.manifest.requires, index, source, stack });
      await assertPluginIdAvailable({ kind: input.kind, manifest: definition.manifest, pluginId: input.pluginId, source });
      const installed = await registry.stageInstallAdapter(definition);

      try {
        const plugin = store.transaction(() => {
          store.migratePluginWidgetAliases({
            kind: input.kind,
            pluginId: input.pluginId,
            templates: installed.widgets,
          });
          return store.upsertEnhancedAdapter({
            id: installed.manifest.id,
            installedPath: installed.installedPath,
            manifest: installed.manifest,
            name: installed.manifest.name,
            sourceId: source.id,
            sourceRef: definition.sourceRef,
            sourceType: definition.sourceType,
            version: installed.manifest.version,
            widgets: installed.widgets,
          });
        });
        await installed.commit();
        return plugin;
      } catch (error) {
        await installed.rollback();
        throw error;
      }
    }

    if (input.kind === "integration") {
      const definition = await integrationInstaller.fetchRegistryIntegration(
        source.url,
        input.pluginId,
        registrySourceOptions(source),
      );
      await ensurePluginDependencies({ dependencies: definition.manifest.requires, index, source, stack });
      await assertPluginIdAvailable({ kind: input.kind, manifest: definition.manifest, pluginId: input.pluginId, source });
      const installed = await integrationInstaller.stageInstallIntegration(definition);

      try {
        const plugin = store.transaction(() => {
          store.migratePluginWidgetAliases({
            kind: input.kind,
            pluginId: input.pluginId,
            templates: installed.templates,
          });
          return store.upsertInstalledIntegration({
            id: installed.manifest.id,
            installedPath: installed.installedPath,
            manifest: installed.manifest,
            name: installed.manifest.name,
            sourceId: source.id,
            sourceRef: definition.sourceRef,
            sourceType: definition.sourceType,
            templates: installed.templates,
            version: installed.manifest.version,
          });
        });
        await installed.commit();
        return plugin;
      } catch (error) {
        await installed.rollback();
        throw error;
      }
    }

    if (input.kind === "widget") {
      const definition = await widgetPluginInstaller.fetchRegistryWidgetPlugin(
        source.url,
        input.pluginId,
        registrySourceOptions(source),
      );
      await ensurePluginDependencies({ dependencies: definition.manifest.requires, index, source, stack });
      await assertPluginIdAvailable({ kind: input.kind, manifest: definition.manifest, pluginId: input.pluginId, source });
      const installed = await widgetPluginInstaller.stageInstallWidgetPlugin(definition);

      try {
        const plugin = store.transaction(() => {
          store.migratePluginWidgetAliases({
            kind: input.kind,
            pluginId: input.pluginId,
            templates: installed.widgets,
          });
          return store.upsertInstalledWidgetPlugin({
            id: installed.manifest.id,
            installedPath: installed.installedPath,
            manifest: installed.manifest,
            name: installed.manifest.name,
            sourceId: source.id,
            sourceRef: definition.sourceRef,
            sourceType: definition.sourceType,
            version: installed.manifest.version,
            widgets: installed.widgets,
          });
        });
        await installed.commit();
        return plugin;
      } catch (error) {
        await installed.rollback();
        throw error;
      }
    }

    throw new Error("Unsupported plugin contribution kind");
  }

  function publicIntegrationInstance(instance) {
    if (!instance) {
      return null;
    }

    return {
      configuredFields: Object.keys(instance.config || {}),
      createdAt: instance.createdAt,
      id: instance.id,
      integrationId: instance.integrationId,
      name: instance.name,
      updatedAt: instance.updatedAt,
    };
  }

  function integrationConnectionFields(definition) {
    const byKey = new Map();

    for (const field of [
      ...(definition.manifest.configFields || []),
      ...definition.templates.flatMap((template) => template.integration?.configFields || []),
    ]) {
      byKey.set(field.key, field);
    }

    return [...byKey.values()];
  }

  function mergeStoredIntegrationSecrets(inputConfig, existingConfig, definition) {
    const config = { ...(inputConfig || {}) };

    for (const field of integrationConnectionFields(definition)) {
      if (
        field.type === "password" &&
        (config[field.key] === undefined || config[field.key] === null || config[field.key] === "") &&
        existingConfig?.[field.key]
      ) {
        config[field.key] = existingConfig[field.key];
      }
    }

    return config;
  }

  function requireIntegrationInstance(instanceId, integrationId = null) {
    const instance = store.getIntegrationInstance(instanceId);

    if (!instance) {
      throw new Error("Integration instance not found");
    }

    if (integrationId && instance.integrationId !== integrationId) {
      throw new Error("Integration instance does not match the widget template");
    }

    return instance;
  }

  function stripStoredIntegrationConfig(input) {
    if (!input.enhancedRenderer?.config) {
      return input;
    }

    const enhancedRenderer = { ...input.enhancedRenderer };
    delete enhancedRenderer.config;
    return { ...input, enhancedRenderer };
  }

  function bindWidgetIntegrationInstance({ existing = null, input, template }) {
    if (!template?.integration) {
      if (input.integrationInstanceId) {
        throw new Error("Only integration widgets can use an integration instance");
      }

      return { createdInstanceId: null, input };
    }

    const integrationId = template.integration.id;
    const requestedInstanceId = input.integrationInstanceId || existing?.integrationInstanceId;

    if (requestedInstanceId) {
      requireIntegrationInstance(requestedInstanceId, integrationId);
      return {
        createdInstanceId: null,
        input: stripStoredIntegrationConfig({
          ...input,
          integrationId,
          integrationInstanceId: requestedInstanceId,
        }),
      };
    }

    const instance = store.createIntegrationInstance({
      config: validateWidgetConfig(
        input.enhancedRenderer?.config || {},
        template.integration.configFields || [],
        "Integration config",
      ),
      integrationId,
      name: input.integrationInstanceName || `${input.title || template.name} connection`,
    });

    return {
      createdInstanceId: instance.id,
      input: stripStoredIntegrationConfig({
        ...input,
        integrationId,
        integrationInstanceId: instance.id,
      }),
    };
  }

  async function readRegisteredIntegrationState({ config = {}, instanceId = null, integrationId }) {
    const instance = instanceId ? requireIntegrationInstance(instanceId, integrationId) : null;
    const performRefresh = async () => {
      const integration = await integrationRegistry.getIntegration(integrationId);

      if (!integration) {
        throw new Error("Integration not found");
      }

      if (!allowUnsafePlugins && !isBuiltInSource(integration)) {
        throw new Error("External integration execution is disabled");
      }

      try {
        const state = await integrationRuntime.readState({
          config: instance?.config || config,
          integration: integration.manifest,
          integrationPath: join(integration.pluginDir, integration.manifest.entry),
        });

        if (instance) {
          store.saveIntegrationState(instance.id, {
            fetchedAt: now(),
            state,
            status: state?.available === false ? "missing" : "ok",
          });
        }

        return state;
      } catch (error) {
        if (instance) {
          store.saveIntegrationState(instance.id, {
            errorMessage: error.message || "Integration refresh failed",
            fetchedAt: now(),
            state: {},
            status: "error",
          });
        }

        throw error;
      }
    };

    if (!instance) {
      return performRefresh();
    }

    if (integrationRefreshes.has(instance.id)) {
      return integrationRefreshes.get(instance.id);
    }

    const refresh = performRefresh().finally(() => {
      if (integrationRefreshes.get(instance.id) === refresh) {
        integrationRefreshes.delete(instance.id);
      }
    });
    integrationRefreshes.set(instance.id, refresh);
    return refresh;
  }

  async function resolvePluginFrontend(pluginKind, pluginId) {
    if (pluginKind === "integration") {
      const definition = await integrationRegistry.getIntegration(pluginId);

      return definition
        ? { manifest: definition.manifest, pluginDir: definition.pluginDir }
        : null;
    }

    if (pluginKind === "service-adapter") {
      const installed = store.getEnhancedAdapter(pluginId);

      if (installed) {
        return { manifest: installed.manifest, pluginDir: installed.installedPath };
      }

      const builtIn = (await registry.listBuiltInAdapters()).find(
        (definition) => definition.manifest.id === pluginId,
      );

      return builtIn ? { manifest: builtIn.manifest, pluginDir: builtIn.pluginDir } : null;
    }

    if (pluginKind === "widget") {
      const definition = await widgetPluginRegistry.getPlugin(pluginId);

      return definition ? { manifest: definition.manifest, pluginDir: definition.pluginDir } : null;
    }

    return null;
  }

  async function listRegisteredWidgetTemplates() {
    const enhancedTemplates = buildServiceEnhancedWidgetTemplates(store, await registry.listBuiltInAdapters());
    const integrationInspection = await integrationRegistry.inspect();
    const integrationTemplates = integrationInspection.definitions.flatMap((definition) => definition.templates);
    const widgetPluginInspection = await widgetPluginRegistry.inspect();
    const pluginTemplates = widgetPluginInspection.definitions
      .filter((definition) => definition.manifest.registration !== "native")
      .flatMap((definition) => definition.widgets);
    const baseTemplates = widgetPluginInspection.definitions
      .filter((definition) => definition.manifest.registration === "native")
      .flatMap((definition) => definition.widgets);
    const withInstalledRevision = (template) => {
      if (!template.react) {
        return template;
      }

      const installed = template.react.pluginKind === "integration"
        ? store.getInstalledIntegration(template.react.pluginId)
        : template.react.pluginKind === "widget"
          ? store.getInstalledWidgetPlugin(template.react.pluginId)
          : store.getEnhancedAdapter(template.react.pluginId);
      const revision = installed?.updatedAt || template.react.version;
      const updateRevision = (url) => {
        if (!url || !revision) {
          return url;
        }

        return `${url.split("?")[0]}?v=${encodeURIComponent(revision)}`;
      };

      return {
        ...template,
        react: {
          ...template.react,
          moduleUrl: updateRevision(template.react.moduleUrl),
          stylesheetUrl: updateRevision(template.react.stylesheetUrl),
        },
      };
    };
    const registeredIntegrationTemplates = integrationTemplates.map(withInstalledRevision);
    const registeredEnhancedTemplates = enhancedTemplates.map(withInstalledRevision);
    const registeredPluginTemplates = pluginTemplates.map(withInstalledRevision);

    return {
      baseTemplates,
      enhancedTemplates: registeredEnhancedTemplates,
      integrationTemplates: registeredIntegrationTemplates,
      pluginErrors: [...integrationInspection.errors, ...widgetPluginInspection.errors],
      pluginTemplates: registeredPluginTemplates,
      templates: [
        ...baseTemplates,
        ...registeredIntegrationTemplates,
        ...registeredEnhancedTemplates,
        ...registeredPluginTemplates,
      ],
    };
  }

  function requireRegisteredWidgetTemplate({ existing = null, input, templates }) {
    const templateId = input.templateId || existing?.templateId || "compact";
    const template = templates.find((candidate) => candidate.id === templateId) || null;

    if (!template && existing?.templateId !== templateId) {
      throw new Error(`Widget template is not registered: ${templateId}`);
    }

    if (!template && !existing) {
      throw new Error(`Widget template is not registered: ${templateId}`);
    }

    return template;
  }

  return async function handleApiRequest(request, response) {
    const requestUrl = new URL(request.url, "http://127.0.0.1");

    try {
      if (request.method === "GET" && requestUrl.pathname === "/api/service-types") {
        sendJson(response, 200, {
          categories: serviceTypeRegistry.listCategories(),
          serviceTypes: serviceTypeRegistry.listServiceTypes(),
        });
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/service-types") {
        const input = await readJsonBody(request);
        const serviceType = serviceTypeRegistry.upsertServiceType(input);

        sendJson(response, 201, {
          categories: serviceTypeRegistry.listCategories(),
          serviceType,
          serviceTypes: serviceTypeRegistry.listServiceTypes(),
        });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/services") {
        sendJson(response, 200, { services: store.listServices() });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/backgrounds") {
        sendJson(response, 200, { backgrounds: await listUploadedBackgrounds({ dataDir }) });
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/backgrounds") {
        const input = await readJsonBody(request, { maxBytes: 15 * 1024 * 1024 });
        const background = await saveUploadedBackground({
          dataDir,
          dataUrl: input.dataUrl,
          filename: input.filename,
          now,
        });

        sendJson(response, 201, { background });
        return;
      }

      const backgroundFileMatch = requestUrl.pathname.match(/^\/api\/backgrounds\/files\/([^/]+)$/);

      if (backgroundFileMatch && request.method === "GET") {
        if (!serveUploadedBackground({ dataDir, filename: backgroundFileMatch[1], response })) {
          sendError(response, 404, "Background not found");
        }

        return;
      }

      const backgroundMatch = requestUrl.pathname.match(/^\/api\/backgrounds\/(custom-[a-f0-9]{64})$/);

      if (backgroundMatch && request.method === "DELETE") {
        const deleted = await deleteUploadedBackground({ dataDir, id: backgroundMatch[1] });

        if (!deleted) {
          sendError(response, 404, "Background not found");
          return;
        }

        response.writeHead(204);
        response.end();
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/icons") {
        const input = await readJsonBody(request, { maxBytes: 1024 * 1024 });
        const icon = await saveUploadedIcon({ dataDir, dataUrl: input.dataUrl });

        sendJson(response, 201, { icon });
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/services") {
        const input = await readJsonBody(request);
        const hasExplicitIcon = input.iconKind || input.iconUrl;
        const iconInfo =
          input.typeId === "custom" && !hasExplicitIcon
            ? await resolveFavicon({ dataDir, fetchImpl, url: input.url })
            : {};
        const service = store.createService({ ...input, ...iconInfo });

        sendJson(response, 201, { service });
        return;
      }

      const serviceMatch = requestUrl.pathname.match(/^\/api\/services\/([^/]+)$/);

      if (serviceMatch && request.method === "PATCH") {
        const serviceId = decodeURIComponent(serviceMatch[1]);
        const input = await readJsonBody(request);
        const hasExplicitIcon = Object.hasOwn(input, "iconKind") || Object.hasOwn(input, "iconUrl");
        const iconInfo =
          input.typeId === "custom" && !hasExplicitIcon
            ? await resolveFavicon({ dataDir, fetchImpl, url: input.url })
            : {};
        const service = store.updateService(serviceId, { ...input, ...iconInfo });

        sendJson(response, 200, { service });
        return;
      }

      if (serviceMatch && request.method === "DELETE") {
        const serviceId = decodeURIComponent(serviceMatch[1]);

        if (!store.deleteService(serviceId)) {
          sendError(response, 404, "Service not found");
          return;
        }

        response.writeHead(204);
        response.end();
        return;
      }

      if (request.method === "PUT" && requestUrl.pathname === "/api/dock") {
        const input = await readJsonBody(request);
        const services = store.updateDockOrder(input.serviceIds);

        sendJson(response, 200, { services });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/plugins") {
        const [builtInRegistry, integrationInspection, widgetInspection] = await Promise.all([
          builtInPluginRegistry.inspect(),
          integrationRegistry.inspect(),
          widgetPluginRegistry.inspect(),
        ]);

        sendJson(response, 200, {
          builtInRegistry: {
            counts: builtInRegistry.counts,
            id: builtInRegistry.id,
            name: builtInRegistry.name,
            sourceType: builtInRegistry.sourceType,
            status: builtInRegistry.status,
            version: builtInRegistry.version,
          },
          externalPluginsEnabled: allowUnsafePlugins,
          contributions: pluginContributions(),
          installed: {
            adapters: store.listEnhancedAdapters(),
            integrations: store.listInstalledIntegrations(),
            widgets: store.listInstalledWidgetPlugins(),
          },
          invalidPlugins: [...integrationInspection.errors, ...widgetInspection.errors],
          sources: store.listEnhancedRegistrySources(),
        });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/plugins/builtins") {
        sendJson(response, 200, { registry: await builtInPluginRegistry.inspect() });
        return;
      }

      const pluginFrontendMatch = requestUrl.pathname.match(
        /^\/api\/plugins\/frontend\/(service-adapter|integration|widget)\/([^/]+)\/frontend\.(js|css)$/,
      );

      if (request.method === "GET" && pluginFrontendMatch) {
        const pluginKind = pluginFrontendMatch[1];
        const pluginId = decodeURIComponent(pluginFrontendMatch[2]);
        const extension = pluginFrontendMatch[3];
        const plugin = await resolvePluginFrontend(pluginKind, pluginId);

        if (!plugin) {
          sendError(response, 404, "Plugin frontend not found");
          return;
        }

        if (!allowUnsafePlugins && !isBuiltInSource(plugin)) {
          sendError(response, 403, "External plugin frontends are disabled");
          return;
        }

        const bytes = await readPluginFrontendArtifact({ extension, ...plugin });
        response.writeHead(200, {
          "cache-control": "no-cache",
          "content-type": extension === "css" ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8",
        });
        response.end(bytes);
        return;
      }

      const isRegistrySourcesPath = [
        "/api/enhanced/registry-sources",
        "/api/plugins/registry-sources",
      ].includes(requestUrl.pathname);

      if (request.method === "GET" && isRegistrySourcesPath) {
        sendJson(response, 200, {
          externalPluginsEnabled: allowUnsafePlugins,
          sources: store.listEnhancedRegistrySources(),
        });
        return;
      }

      if (request.method === "POST" && isRegistrySourcesPath) {
        requireUnsafePluginsEnabled();
        const input = await readJsonBody(request);
        const normalizedUrl = registry.normalizeRegistryIndexUrl(input.url, { ref: input.ref || null });
        const duplicate = store.listEnhancedRegistrySources().find((candidate) => {
          try {
            return registry.normalizeRegistryIndexUrl(candidate.url, { ref: candidate.ref || null }) === normalizedUrl;
          } catch {
            return false;
          }
        });

        if (duplicate) {
          throw new Error("This registry source and branch is already registered");
        }

        const source = store.createEnhancedRegistrySource({
          authToken: input.authToken,
          name: input.name,
          ref: input.ref,
          trusted: input.trusted,
          type: input.type,
          url: input.url,
        });

        sendJson(response, 201, {
          source: store.getEnhancedRegistrySource(source.id, { includeSecrets: false }),
        });
        return;
      }

      const registrySourceMatch = requestUrl.pathname.match(
        /^\/api\/(?:enhanced|plugins)\/registry-sources\/([^/]+)$/,
      );

      if (registrySourceMatch && request.method === "DELETE") {
        const sourceId = decodeURIComponent(registrySourceMatch[1]);

        if (!store.deleteEnhancedRegistrySource(sourceId)) {
          sendError(response, 404, "Registry source not found");
          return;
        }

        response.writeHead(204);
        response.end();
        return;
      }

      const registrySyncMatch = requestUrl.pathname.match(
        /^\/api\/(?:enhanced|plugins)\/registry-sources\/([^/]+)\/sync$/,
      );

      if (request.method === "POST" && registrySyncMatch) {
        requireUnsafePluginsEnabled();
        const sourceId = decodeURIComponent(registrySyncMatch[1]);
        const source = findRegistrySource(sourceId);

        if (!source) {
          throw new Error("Registry source not found");
        }

        const { registryIndex, source: savedSource } = await syncRegistrySource(source);

        sendJson(response, 200, {
          apps: registryIndex.apps,
          integrations: registryIndex.integrations,
          serviceTypes: registryIndex.serviceTypes,
          source: savedSource,
          widgets: registryIndex.widgets,
        });
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/plugins/install") {
        requireUnsafePluginsEnabled();
        const input = await readJsonBody(request);
        const plugin = await installPluginContribution(input);

        sendJson(response, 201, {
          contributions: pluginContributions(),
          plugin,
        });
        return;
      }

      const pluginUninstallMatch = requestUrl.pathname.match(
        /^\/api\/plugins\/(service-type|service-adapter|integration|widget)\/([^/]+)$/,
      );

      if (request.method === "DELETE" && pluginUninstallMatch) {
        const kind = pluginUninstallMatch[1];
        const pluginId = decodeURIComponent(pluginUninstallMatch[2]);
        assertPluginCanUninstall(kind, pluginId);

        if (kind === "service-type") {
          const configuredServiceType = serviceTypeRegistry
            .listConfiguredServiceTypes()
            .find((serviceType) => serviceType.id === pluginId);

          if (configuredServiceType?.source !== "plugin-registry") {
            throw new Error("Service type was not installed by a plugin registry");
          }

          if (!serviceTypeRegistry.deleteServiceType(pluginId)) {
            throw new Error("Service type is not installed");
          }
        } else if (kind === "service-adapter") {
          const removal = await registry.stageUninstallAdapter(pluginId);

          try {
            if (!store.deleteEnhancedAdapter(pluginId)) {
              throw new Error("Service adapter is not installed");
            }

            await removal.commit();
          } catch (error) {
            await removal.rollback();
            throw error;
          }
        } else if (kind === "integration") {
          const removal = await integrationInstaller.stageUninstallIntegration(pluginId);

          try {
            if (!store.deleteInstalledIntegration(pluginId)) {
              throw new Error("Integration is not installed");
            }

            await removal.commit();
          } catch (error) {
            await removal.rollback();
            throw error;
          }
        } else {
          const removal = await widgetPluginInstaller.stageUninstallWidgetPlugin(pluginId);

          try {
            if (!store.deleteInstalledWidgetPlugin(pluginId)) {
              throw new Error("Widget plugin is not installed");
            }

            await removal.commit();
          } catch (error) {
            await removal.rollback();
            throw error;
          }
        }

        response.writeHead(204);
        response.end();
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/enhanced/adapters") {
        const installed = store
          .listEnhancedAdapters()
          .filter((adapter) => allowUnsafePlugins || isBuiltInSource(adapter))
          .map((adapter) => ({ ...adapter, installed: true, sourceId: sourceIdForAdapter(adapter) }));
        const builtIn = await registry.listBuiltInAdapters();
        const installedIds = new Set(installed.map((adapter) => adapter.id));

        sendJson(response, 200, {
          externalPluginsEnabled: allowUnsafePlugins,
          adapters: [
            ...installed,
            ...builtIn
              .filter((definition) => !installedIds.has(definition.manifest.id))
              .map((definition) => ({
                id: definition.manifest.id,
                installed: false,
                manifest: definition.manifest,
                name: definition.manifest.name,
                sourceRef: definition.sourceRef,
                sourceType: definition.sourceType,
                version: definition.manifest.version,
                widgets: definition.widgets,
              })),
          ],
        });
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/enhanced/adapters/install") {
        const input = await readJsonBody(request);
        let definition;

        if (input.sourceType === "github") {
          requireUnsafePluginsEnabled();
          const source = store.listEnhancedRegistrySources().find((candidate) => {
            if (candidate.id === input.sourceId || candidate.url === input.sourceRef) {
              return true;
            }

            try {
              return registry.normalizeRegistryIndexUrl(candidate.url) === input.sourceRef;
            } catch {
              return false;
            }
          });

          if (!source) {
            throw new Error("Registry source not found");
          }

          if (!source.trusted) {
            throw new Error("Trust this registry source before installing plugin code");
          }

          definition = await registry.fetchRegistryAdapter(
            source.url,
            input.adapterId,
            registrySourceOptions(findRegistrySource(source.id)),
          );
        } else if (input.sourceType === "local") {
          requireUnsafePluginsEnabled();
          const localDefinitions = await registry.listLocalAdapters(input.sourcePath);
          definition = localDefinitions.find((candidate) => candidate.manifest.id === input.adapterId);
        } else {
          const builtIn = await registry.listBuiltInAdapters();
          definition = builtIn.find((candidate) => candidate.manifest.id === input.adapterId);
        }

        if (!definition) {
          throw new Error("Adapter not found");
        }

        const installed = await registry.stageInstallAdapter(definition);
        let adapter;

        try {
          adapter = store.transaction(() => {
            store.migratePluginWidgetAliases({
              kind: "service-adapter",
              pluginId: installed.manifest.id,
              templates: installed.widgets,
            });
            return store.upsertEnhancedAdapter({
              id: installed.manifest.id,
              installedPath: installed.installedPath,
              manifest: installed.manifest,
              name: installed.manifest.name,
              sourceId: input.sourceType === "github" ? input.sourceId || null : null,
              sourceRef: definition.sourceRef,
              sourceType: definition.sourceType,
              version: installed.manifest.version,
              widgets: installed.widgets,
            });
          });
          await installed.commit();
        } catch (error) {
          await installed.rollback();
          throw error;
        }

        sendJson(response, 201, { adapter: { ...adapter, installed: true } });
        return;
      }

      const adapterMatch = requestUrl.pathname.match(/^\/api\/enhanced\/adapters\/([^/]+)$/);

      if (adapterMatch) {
        const adapterId = decodeURIComponent(adapterMatch[1]);

        if (request.method === "DELETE") {
          assertPluginCanUninstall("service-adapter", adapterId);
          const removal = await registry.stageUninstallAdapter(adapterId);

          try {
            if (!store.deleteEnhancedAdapter(adapterId)) {
              await removal.rollback();
              sendError(response, 404, "Enhanced adapter not found");
              return;
            }

            await removal.commit();
          } catch (error) {
            await removal.rollback();
            throw error;
          }

          response.writeHead(204);
          response.end();
          return;
        }
      }

      const mediaImageMatch = requestUrl.pathname.match(
        /^\/api\/services\/([^/]+)\/enhancement\/media-image\/([^/]+)$/,
      );

      if (mediaImageMatch && request.method === "GET") {
        const serviceId = decodeURIComponent(mediaImageMatch[1]);
        const itemId = decodeURIComponent(mediaImageMatch[2]);
        const service = findService(store, serviceId);
        const enhancement = requireEnhancement(store, serviceId);
        const adapter = store.getEnhancedAdapter(enhancement.adapterId);

        if (!enhancement.enabled) {
          throw new Error("Service enhancement is disabled");
        }

        if (!adapter) {
          throw new Error("Enhanced adapter not installed");
        }

        requireAdapterExecutionAllowed(adapter);

        await proxyJellyfinMediaImage({
          adapter,
          config: configWithServiceDefaults(enhancement.config, adapter, service),
          fetchImpl,
          itemId,
          requestUrl,
          response,
          service,
        });
        return;
      }

      const enhancementMatch = requestUrl.pathname.match(/^\/api\/services\/([^/]+)\/enhancement(?:\/([^/]+))?$/);

      if (enhancementMatch) {
        const serviceId = decodeURIComponent(enhancementMatch[1]);
        const action = enhancementMatch[2] || "";
        const service = findService(store, serviceId);

        if (request.method === "GET" && !action) {
          const enhancement = store.getServiceEnhancement(serviceId);
          const adapter = enhancement ? store.getEnhancedAdapter(enhancement.adapterId) : null;
          sendJson(response, 200, { enhancement: publicServiceEnhancement(enhancement, adapter) });
          return;
        }

        if (request.method === "PUT" && !action) {
          const input = await readJsonBody(request);
          const adapter = store.getEnhancedAdapter(input.adapterId);
          const existing = store.getServiceEnhancement(serviceId);

          if (!adapter) {
            throw new Error("Enhanced adapter not installed");
          }

          requireAdapterExecutionAllowed(adapter);
          const enhancement = store.saveServiceEnhancement(serviceId, {
            ...input,
            config: configWithServiceDefaults(
              mergeStoredSecrets(input.config, existing?.config, adapter),
              adapter,
              service,
            ),
          });

          sendJson(response, 200, { enhancement: publicServiceEnhancement(enhancement, adapter) });
          return;
        }

        if (request.method === "POST" && action === "test") {
          const enhancement = requireEnhancement(store, serviceId);
          const adapter = store.getEnhancedAdapter(enhancement.adapterId);

          if (!adapter) {
            throw new Error("Enhanced adapter not installed");
          }

          requireAdapterExecutionAllowed(adapter);

          const result = await runtime.testAdapter({
            adapterPath: join(adapter.installedPath, adapter.manifest.entry),
            config: configWithServiceDefaults(enhancement.config, adapter, service),
            service,
          });
          const saved = store.saveServiceEnhancement(serviceId, {
            ...enhancement,
            lastTestMessage: result.message,
            lastTestStatus: result.ok ? "ok" : "error",
          });

          sendJson(response, 200, { enhancement: publicServiceEnhancement(saved, adapter), result });
          return;
        }

        if (request.method === "POST" && action === "refresh") {
          const enhancement = requireEnhancement(store, serviceId);
          requireAdapterExecutionAllowed(store.getEnhancedAdapter(enhancement.adapterId));
          const state = await refreshServiceEnhancement({ allowUnsafePlugins, runtime, serviceId, store });
          sendJson(response, 200, { state });
          return;
        }

        if (request.method === "GET" && action === "state") {
          const enhancement = requireEnhancement(store, serviceId);
          sendJson(response, 200, { state: store.getEnhancedState(enhancement.id) });
          return;
        }
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/widget-templates") {
        sendJson(response, 200, await listRegisteredWidgetTemplates());
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/integrations") {
        sendJson(response, 200, {
          instances: store.listIntegrationInstances({ includeConfig: true }).map(publicIntegrationInstance),
          integrations: await integrationRegistry.listIntegrationSummaries(),
        });
        return;
      }

      if (requestUrl.pathname === "/api/integration-instances") {
        if (request.method === "GET") {
          sendJson(response, 200, {
            instances: store.listIntegrationInstances({ includeConfig: true }).map(publicIntegrationInstance),
          });
          return;
        }

        if (request.method === "POST") {
          const input = await readJsonBody(request);
          const integration = await integrationRegistry.getIntegration(input.integrationId);

          if (!integration) {
            throw new Error("Integration not found");
          }

          const instance = store.createIntegrationInstance({
            ...input,
            config: validateWidgetConfig(
              input.config || {},
              integrationConnectionFields(integration),
              "Integration config",
            ),
          });
          sendJson(response, 201, { instance: publicIntegrationInstance(instance) });
          return;
        }
      }

      const integrationInstanceMatch = requestUrl.pathname.match(
        /^\/api\/integration-instances\/([^/]+)(?:\/([^/]+))?$/,
      );

      if (integrationInstanceMatch) {
        const instanceId = decodeURIComponent(integrationInstanceMatch[1]);
        const action = integrationInstanceMatch[2] || "";
        const instance = requireIntegrationInstance(instanceId);

        if (request.method === "PATCH" && !action) {
          const input = await readJsonBody(request);
          const integration = await integrationRegistry.getIntegration(instance.integrationId);

          if (!integration) {
            throw new Error("Integration not found");
          }

          const updated = store.updateIntegrationInstance(instanceId, {
            ...input,
            config: input.config === undefined
              ? undefined
                : validateWidgetConfig(
                  mergeStoredIntegrationSecrets(input.config, instance.config, integration),
                  integrationConnectionFields(integration),
                  "Integration config",
                ),
          });
          sendJson(response, 200, { instance: publicIntegrationInstance(updated) });
          return;
        }

        if (request.method === "DELETE" && !action) {
          store.deleteIntegrationInstance(instanceId);
          response.writeHead(204);
          response.end();
          return;
        }

        if (request.method === "GET" && action === "state") {
          sendJson(response, 200, { state: store.getIntegrationState(instanceId) });
          return;
        }

        if (request.method === "POST" && action === "refresh") {
          const state = await readRegisteredIntegrationState({
            instanceId,
            integrationId: instance.integrationId,
          });
          sendJson(response, 200, { state });
          return;
        }
      }

      const integrationMatch = requestUrl.pathname.match(/^\/api\/integrations\/([^/]+)(?:\/([^/]+))?$/);

      if (integrationMatch) {
        const integrationId = decodeURIComponent(integrationMatch[1]);
        const action = integrationMatch[2] || "";

        if (
          (request.method === "GET" && action === "") ||
          (request.method === "POST" && action === "refresh")
        ) {
          const input = request.method === "POST" ? await readJsonBody(request) : {};
          const state = await readRegisteredIntegrationState({
            config: input.config || {},
            integrationId,
          });

          sendJson(response, 200, { state });
          return;
        }
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/widgets") {
        sendJson(response, 200, { widgets: store.listWidgets().map((widget) => prepareWidgetForClient(store, widget)) });
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/widgets") {
        const input = await readJsonBody(request);
        const { templates } = await listRegisteredWidgetTemplates();
        const template = requireRegisteredWidgetTemplate({ input, templates });
        const binding = bindWidgetIntegrationInstance({ input, template });
        let widget;

        try {
          widget = prepareWidgetForClient(store, store.createWidget(binding.input, { template }));
        } catch (error) {
          if (binding.createdInstanceId) {
            store.deleteIntegrationInstance(binding.createdInstanceId);
          }
          throw error;
        }

        sendJson(response, 201, { widget });
        return;
      }

      if (request.method === "PUT" && requestUrl.pathname === "/api/widgets") {
        const input = await readJsonBody(request);
        const { templates } = await listRegisteredWidgetTemplates();
        const existingWidgets = new Map(store.listWidgets().map((widget) => [widget.id, widget]));
        const preparedInputs = [];
        const createdInstanceIds = [];

        for (const widgetInput of input.widgets || []) {
          const existing = existingWidgets.get(widgetInput.id) || null;
          const template = requireRegisteredWidgetTemplate({
            existing,
            input: widgetInput,
            templates,
          });
          const binding = bindWidgetIntegrationInstance({ existing, input: widgetInput, template });
          preparedInputs.push(binding.input);
          if (binding.createdInstanceId) {
            createdInstanceIds.push(binding.createdInstanceId);
          }
        }

        let widgets;

        try {
          widgets = store
            .replaceWidgets(preparedInputs, { templates })
            .map((widget) => prepareWidgetForClient(store, widget));
        } catch (error) {
          for (const instanceId of createdInstanceIds) {
            store.deleteIntegrationInstance(instanceId);
          }
          throw error;
        }

        sendJson(response, 200, { widgets });
        return;
      }

      if (requestUrl.pathname.startsWith("/api/widgets/")) {
        const widgetId = decodeURIComponent(requestUrl.pathname.replace("/api/widgets/", ""));

        if (!widgetId) {
          sendError(response, 404, "Widget not found");
          return;
        }

        if (request.method === "PATCH") {
          const input = await readJsonBody(request);
          const existing = store.listWidgets().find((candidate) => candidate.id === widgetId);
          const { templates } = await listRegisteredWidgetTemplates();
          const templateId = input.templateId || existing?.templateId;
          const template = requireRegisteredWidgetTemplate({ existing, input: { ...input, templateId }, templates });
          const binding = bindWidgetIntegrationInstance({ existing, input, template });
          let widget;

          try {
            widget = prepareWidgetForClient(store, store.updateWidget(widgetId, binding.input, { template }));
          } catch (error) {
            if (binding.createdInstanceId) {
              store.deleteIntegrationInstance(binding.createdInstanceId);
            }
            throw error;
          }

          sendJson(response, 200, { widget });
          return;
        }

        if (request.method === "DELETE") {
          if (!store.deleteWidget(widgetId)) {
            sendError(response, 404, "Widget not found");
            return;
          }

          response.writeHead(204);
          response.end();
          return;
        }
      }

      if (request.method === "GET" && requestUrl.pathname.startsWith("/api/icons/")) {
        serveIcon({ dataDir, requestUrl, response });
        return;
      }

      sendError(response, 404, "Not found");
    } catch (error) {
      sendError(response, 400, error.message || "Bad request");
    }
  };
}
