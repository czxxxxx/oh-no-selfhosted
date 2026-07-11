async function readJson(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || fallbackMessage);
  }

  return payload;
}

export async function loadDashboardData() {
  const [
    typesResponse,
    servicesResponse,
    templatesResponse,
    integrationsResponse,
    widgetsResponse,
    backgroundsResponse,
  ] = await Promise.all([
    fetch("/api/service-types"),
    fetch("/api/services"),
    fetch("/api/widget-templates"),
    fetch("/api/integrations"),
    fetch("/api/widgets"),
    fetch("/api/backgrounds"),
  ]);

  const [
    typesPayload,
    servicesPayload,
    templatesPayload,
    integrationsPayload,
    widgetsPayload,
    backgroundsPayload,
  ] = await Promise.all([
    readJson(typesResponse, "Unable to load service types"),
    readJson(servicesResponse, "Unable to load services"),
    readJson(templatesResponse, "Unable to load widget templates"),
    readJson(integrationsResponse, "Unable to load integrations"),
    readJson(widgetsResponse, "Unable to load widgets"),
    readJson(backgroundsResponse, "Unable to load custom backgrounds"),
  ]);

  return {
    backgrounds: backgroundsPayload.backgrounds || [],
    categories: typesPayload.categories || [],
    services: servicesPayload.services || [],
    serviceTypes: typesPayload.serviceTypes || [],
    templates:
      templatesPayload.templates ||
      [
        ...(templatesPayload.baseTemplates || []),
        ...(templatesPayload.integrationTemplates || []),
        ...(templatesPayload.enhancedTemplates || []),
      ],
    integrations: integrationsPayload.integrations || [],
    integrationInstances: integrationsPayload.instances || [],
    widgets: widgetsPayload.widgets || [],
  };
}

export async function createServiceRequest(input) {
  const payload = await readJson(
    await fetch("/api/services", {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    "Unable to add service",
  );

  return payload.service;
}

export async function updateServiceRequest(id, input) {
  const payload = await readJson(
    await fetch(`/api/services/${encodeURIComponent(id)}`, {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    }),
    "Unable to update service",
  );

  return payload.service;
}

function readFileAsDataUrl(file, fallbackMessage = "Unable to read image file") {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error(fallbackMessage)));
    reader.readAsDataURL(file);
  });
}

export async function uploadIconRequest(file) {
  const dataUrl = await readFileAsDataUrl(file, "Unable to read icon file");
  const payload = await readJson(
    await fetch("/api/icons", {
      body: JSON.stringify({ dataUrl, filename: file.name }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    "Unable to upload icon",
  );

  return payload.icon;
}

export async function uploadBackgroundRequest(file) {
  const dataUrl = await readFileAsDataUrl(file, "Unable to read background image");
  const payload = await readJson(
    await fetch("/api/backgrounds", {
      body: JSON.stringify({ dataUrl, filename: file.name }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    "Unable to upload background",
  );

  return payload.background;
}

export async function deleteBackgroundRequest(id) {
  const response = await fetch(`/api/backgrounds/${encodeURIComponent(id)}`, { method: "DELETE" });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Unable to delete background");
  }

  return true;
}

export async function deleteServiceRequest(id) {
  const response = await fetch(`/api/services/${encodeURIComponent(id)}`, { method: "DELETE" });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Unable to delete service");
  }

  return true;
}

export async function saveDockOrderRequest(serviceIds) {
  const payload = await readJson(
    await fetch("/api/dock", {
      body: JSON.stringify({ serviceIds }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    }),
    "Unable to save Dock order",
  );

  return payload.services || [];
}

export async function createWidgetRequest(input) {
  const payload = await readJson(
    await fetch("/api/widgets", {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    "Unable to create widget",
  );

  return payload.widget;
}

export async function updateWidgetRequest(id, input) {
  const payload = await readJson(
    await fetch(`/api/widgets/${encodeURIComponent(id)}`, {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    }),
    "Unable to update widget",
  );

  return payload.widget;
}

export async function deleteWidgetRequest(id) {
  const response = await fetch(`/api/widgets/${encodeURIComponent(id)}`, { method: "DELETE" });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Unable to delete widget");
  }

  return true;
}

export async function saveWidgetsRequest(widgets) {
  const payload = await readJson(
    await fetch("/api/widgets", {
      body: JSON.stringify({ widgets }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    }),
    "Unable to save widgets",
  );

  return payload.widgets || [];
}

export async function listEnhancedAdaptersRequest() {
  const payload = await readJson(await fetch("/api/enhanced/adapters"), "Unable to load enhanced adapters");

  return payload.adapters || [];
}

export async function listEnhancedRegistrySourcesRequest() {
  const payload = await readJson(
    await fetch("/api/enhanced/registry-sources"),
    "Unable to load enhanced registry sources",
  );

  return {
    externalPluginsEnabled: payload.externalPluginsEnabled !== false,
    sources: payload.sources || [],
  };
}

export async function createEnhancedRegistrySourceRequest(input) {
  const payload = await readJson(
    await fetch("/api/enhanced/registry-sources", {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    "Unable to add enhanced registry source",
  );

  return payload.source;
}

export async function syncEnhancedRegistrySourceRequest(sourceId) {
  return readJson(
    await fetch(`/api/enhanced/registry-sources/${encodeURIComponent(sourceId)}/sync`, { method: "POST" }),
    "Unable to sync enhanced registry source",
  );
}

export async function deleteEnhancedRegistrySourceRequest(sourceId) {
  const response = await fetch(`/api/enhanced/registry-sources/${encodeURIComponent(sourceId)}`, { method: "DELETE" });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Unable to delete enhanced registry source");
  }

  return true;
}

export async function loadPluginRegistryRequest() {
  return readJson(await fetch("/api/plugins"), "Unable to load plugin registry");
}

export async function createPluginRegistrySourceRequest(input) {
  const payload = await readJson(
    await fetch("/api/plugins/registry-sources", {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    "Unable to add plugin registry source",
  );

  return payload.source;
}

export async function syncPluginRegistrySourceRequest(sourceId) {
  return readJson(
    await fetch(`/api/plugins/registry-sources/${encodeURIComponent(sourceId)}/sync`, { method: "POST" }),
    "Unable to sync plugin registry source",
  );
}

export async function deletePluginRegistrySourceRequest(sourceId) {
  const response = await fetch(`/api/plugins/registry-sources/${encodeURIComponent(sourceId)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Unable to delete plugin registry source");
  }

  return true;
}

export async function installPluginContributionRequest(input) {
  const payload = await readJson(
    await fetch("/api/plugins/install", {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    "Unable to install plugin contribution",
  );

  return payload.plugin;
}

export async function uninstallPluginContributionRequest(kind, pluginId) {
  const response = await fetch(`/api/plugins/${encodeURIComponent(kind)}/${encodeURIComponent(pluginId)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Unable to uninstall plugin contribution");
  }

  return true;
}

export async function installEnhancedAdapterRequest(input) {
  const payload = await readJson(
    await fetch("/api/enhanced/adapters/install", {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    "Unable to install enhanced adapter",
  );

  return payload.adapter;
}

export async function deleteEnhancedAdapterRequest(adapterId) {
  const response = await fetch(`/api/enhanced/adapters/${encodeURIComponent(adapterId)}`, { method: "DELETE" });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Unable to uninstall enhanced adapter");
  }

  return true;
}

export async function getServiceEnhancementRequest(serviceId) {
  const payload = await readJson(
    await fetch(`/api/services/${encodeURIComponent(serviceId)}/enhancement`),
    "Unable to load service enhancement",
  );

  return payload.enhancement;
}

export async function saveServiceEnhancementRequest(serviceId, input) {
  const payload = await readJson(
    await fetch(`/api/services/${encodeURIComponent(serviceId)}/enhancement`, {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "PUT",
    }),
    "Unable to save service enhancement",
  );

  return payload.enhancement;
}

export async function testServiceEnhancementRequest(serviceId) {
  return readJson(
    await fetch(`/api/services/${encodeURIComponent(serviceId)}/enhancement/test`, { method: "POST" }),
    "Unable to test service enhancement",
  );
}

export async function refreshServiceEnhancementRequest(serviceId) {
  return readJson(
    await fetch(`/api/services/${encodeURIComponent(serviceId)}/enhancement/refresh`, { method: "POST" }),
    "Unable to refresh service enhancement",
  );
}

export async function refreshIntegrationWidgetRequest(integrationId, config = {}) {
  const hasConfig = config && Object.keys(config).length > 0;

  return readJson(
    await fetch(`/api/integrations/${encodeURIComponent(integrationId)}/refresh`, {
      body: hasConfig ? JSON.stringify({ config }) : undefined,
      headers: hasConfig ? { "content-type": "application/json" } : undefined,
      method: "POST",
    }),
    "Unable to refresh integration widget",
  );
}

export async function refreshIntegrationInstanceRequest(instanceId) {
  return readJson(
    await fetch(`/api/integration-instances/${encodeURIComponent(instanceId)}/refresh`, {
      method: "POST",
    }),
    "Unable to refresh integration instance",
  );
}
