export function defaultEnhancedConfig(adapter, service) {
  return Object.fromEntries(
    (adapter?.manifest?.configSchema || []).map((field) => [
      field.key,
      field.defaultFromService === "url" ? service.url : field.default !== undefined ? field.default : "",
    ]),
  );
}

export function configWithServiceDefaults(config, adapter, service) {
  const nextConfig = {
    ...defaultEnhancedConfig(adapter, service),
    ...(config || {}),
  };

  for (const field of adapter?.manifest?.configSchema || []) {
    if (field.defaultFromService === "url") {
      nextConfig[field.key] = service.url;
    }
  }

  return nextConfig;
}

export function visibleEnhancedConfigFields(adapter) {
  return (adapter?.manifest?.configSchema || []).filter((field) => field.defaultFromService !== "url");
}
