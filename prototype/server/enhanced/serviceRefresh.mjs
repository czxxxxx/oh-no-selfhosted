import { join } from "node:path";
import { configWithServiceDefaults } from "../../src/enhancedConfig.js";
import { isBuiltInSource } from "../plugins/builtinSource.mjs";

function serviceById(store, serviceId) {
  return store.listServices().find((service) => service.id === serviceId);
}

function isStateDue(enhancement, state, now) {
  if (!state?.fetchedAt) {
    return true;
  }

  const fetchedAt = new Date(state.fetchedAt).getTime();
  const current = now().getTime();
  const pollMs = Math.max(Number(enhancement.pollIntervalSeconds || 5), 1) * 1000;

  return Number.isFinite(fetchedAt) ? current - fetchedAt >= pollMs : true;
}

export async function refreshServiceEnhancement({ allowUnsafePlugins = true, runtime, serviceId, store }) {
  const service = serviceById(store, serviceId);
  const enhancement = store.getServiceEnhancement(serviceId);

  if (!service || !enhancement?.enabled) {
    throw new Error("Service enhancement not configured");
  }

  const adapter = store.getEnhancedAdapter(enhancement.adapterId);

  if (!adapter) {
    throw new Error("Enhanced adapter not installed");
  }

  if (!allowUnsafePlugins && !isBuiltInSource(adapter)) {
    throw new Error("External adapter execution is disabled");
  }

  try {
    const stateValue = await runtime.fetchAdapterState({
      adapterPath: join(adapter.installedPath, adapter.manifest.entry),
      config: configWithServiceDefaults(enhancement.config, adapter, service),
      service,
    });
    return store.saveEnhancedState(enhancement.id, { state: stateValue, status: "ok" });
  } catch (error) {
    return store.saveEnhancedState(enhancement.id, {
      errorMessage: error.message || "Refresh failed",
      state: store.getEnhancedState(enhancement.id)?.state || {},
      status: "error",
    });
  }
}

export async function refreshDueEnhancements({ allowUnsafePlugins = true, now = () => new Date(), runtime, store }) {
  const results = [];

  for (const enhancement of store.listServiceEnhancements().filter((candidate) => candidate.enabled)) {
    const currentState = store.getEnhancedState(enhancement.id);

    if (!isStateDue(enhancement, currentState, now)) {
      continue;
    }

    const state = await refreshServiceEnhancement({
      allowUnsafePlugins,
      runtime,
      serviceId: enhancement.serviceId,
      store,
    });
    results.push({ serviceId: enhancement.serviceId, status: state.status });
  }

  return results;
}

export function createEnhancedRefreshScheduler({
  allowUnsafePlugins = false,
  intervalMs = 1000,
  logger = console,
  runtime,
  store,
}) {
  let isRefreshing = false;
  const timer = setInterval(async () => {
    if (isRefreshing) {
      return;
    }

    isRefreshing = true;

    try {
      await refreshDueEnhancements({ allowUnsafePlugins, runtime, store });
    } catch (error) {
      logger.warn?.("Enhanced refresh failed", error);
    } finally {
      isRefreshing = false;
    }
  }, intervalMs);

  timer.unref?.();

  return {
    stop() {
      clearInterval(timer);
    },
  };
}
