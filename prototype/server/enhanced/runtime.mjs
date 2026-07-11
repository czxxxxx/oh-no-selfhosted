import { pathToFileURL } from "node:url";

function createMemoryCache() {
  const values = new Map();

  return {
    get: (key) => values.get(key),
    set: (key, value) => values.set(key, value),
  };
}

async function loadAdapter(adapterPath) {
  const moduleUrl = `${pathToFileURL(adapterPath).href}?t=${Date.now()}`;
  const adapter = await import(moduleUrl);

  if (typeof adapter.testConnection !== "function") {
    throw new Error("Adapter must export testConnection(config, context)");
  }

  if (typeof adapter.fetchState !== "function") {
    throw new Error("Adapter must export fetchState(config, context)");
  }

  return adapter;
}

export function createAdapterRuntime({
  fetchImpl = fetch,
  logger = console,
  now = () => new Date().toISOString(),
  snmpImpl = null,
} = {}) {
  function createContext({ service }) {
    return {
      cache: createMemoryCache(),
      fetch: fetchImpl,
      logger,
      now,
      snmp: snmpImpl,
      service,
    };
  }

  return {
    async fetchAdapterState({ adapterPath, config, service }) {
      const adapter = await loadAdapter(adapterPath);

      return adapter.fetchState(config, createContext({ service }));
    },
    async getWidgetData({ adapterPath, state, widgetConfig, service }) {
      const adapter = await loadAdapter(adapterPath);

      if (typeof adapter.getWidgetData !== "function") {
        return state?.[widgetConfig.dataPath] || state || {};
      }

      return adapter.getWidgetData(state, widgetConfig, createContext({ service }));
    },
    async testAdapter({ adapterPath, config, service }) {
      const adapter = await loadAdapter(adapterPath);

      return adapter.testConnection(config, createContext({ service }));
    },
  };
}
