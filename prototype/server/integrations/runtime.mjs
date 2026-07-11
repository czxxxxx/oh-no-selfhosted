import { pathToFileURL } from "node:url";

async function loadIntegration(integrationPath) {
  const moduleUrl = `${pathToFileURL(integrationPath).href}?t=${Date.now()}`;
  const integration = await import(moduleUrl);

  if (typeof integration.readState !== "function") {
    throw new Error("Integration plugin must export readState(config, context)");
  }

  return integration;
}

export function createIntegrationRuntime({
  codexAuthPath,
  fetchImpl = fetch,
  logger = console,
  now = () => new Date().toISOString(),
} = {}) {
  function createContext({ integration }) {
    return {
      codexAuthPath,
      fetch: fetchImpl,
      integration,
      logger,
      now,
    };
  }

  return {
    async readState({ config = {}, integration, integrationPath }) {
      const plugin = await loadIntegration(integrationPath);

      return plugin.readState(config, createContext({ integration }));
    },
  };
}
