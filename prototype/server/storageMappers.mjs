import { randomUUID } from "node:crypto";
import { findServiceType } from "../src/serviceCatalog.js";

export function assertServiceUrl(url) {
  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URL must be a valid URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("URL must start with http:// or https://");
  }

  return parsed.toString().replace(/\/$/, "");
}

export function toRow(service, sortOrder, now, serviceTypes) {
  const serviceType = findServiceType(service.typeId, serviceTypes);

  if (!serviceType) {
    throw new Error(`Unsupported service type: ${service.typeId}`);
  }

  const isCustom = service.typeId === "custom";
  const name = (isCustom ? service.name : service.name || serviceType.name)?.trim();

  if (!name) {
    throw new Error("Service name is required");
  }

  const iconKind = service.iconKind || serviceType.iconKind || (isCustom ? "default" : "preset");
  const iconKey = service.iconKey || serviceType.iconKey;

  return {
    category: service.category || serviceType.category,
    color: service.color || serviceType.color,
    created_at: now,
    description: service.description || (isCustom ? "Custom Service" : serviceType.description),
    dock_sort_order:
      service.dockSortOrder === null || service.dockSortOrder === undefined
        ? null
        : Number(service.dockSortOrder),
    icon_key: iconKey,
    icon_kind: iconKind,
    icon_url: service.iconUrl || serviceType.iconUrl || null,
    id: service.id || randomUUID(),
    name,
    sort_order: sortOrder,
    status: service.status || "Online",
    type_id: service.typeId,
    updated_at: now,
    url: assertServiceUrl(service.url),
    pinned_to_dock: service.pinnedToDock ? 1 : 0,
  };
}

export function mapRow(row) {
  return {
    category: row.category,
    color: row.color,
    createdAt: row.created_at,
    description: row.description,
    dockSortOrder: row.dock_sort_order === null || row.dock_sort_order === undefined ? null : row.dock_sort_order,
    iconKey: row.icon_key,
    iconKind: row.icon_kind,
    iconUrl: row.icon_url,
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    status: row.status,
    typeId: row.type_id,
    updatedAt: row.updated_at,
    url: row.url,
    pinnedToDock: Boolean(row.pinned_to_dock),
  };
}

export function mapWidgetRow(row) {
  return {
    createdAt: row.created_at,
    enhancedRenderer: parseJson(row.enhanced_renderer_json, null),
    enhancedWidgetId: row.enhanced_widget_id,
    enhancementId: row.enhancement_id,
    h: row.h,
    id: row.id,
    integrationId: row.integration_id,
    integrationInstanceId: row.integration_instance_id,
    minH: row.min_h,
    minW: row.min_w,
    pluginId: row.plugin_id,
    refreshIntervalSeconds:
      row.refresh_interval_seconds === null || row.refresh_interval_seconds === undefined
        ? null
        : row.refresh_interval_seconds,
    scopedCss: row.scoped_css,
    serviceId: row.service_id,
    style: JSON.parse(row.style_json),
    subtitle: row.subtitle,
    templateId: row.template_id,
    title: row.title,
    updatedAt: row.updated_at,
    url: row.url,
    w: row.w,
    x: row.x,
    y: row.y,
    zIndex: row.z_index,
  };
}

export function parseJson(value, fallback) {
  if (!value) {
    return fallback;
  }

  return JSON.parse(value);
}

export function mapEnhancedAdapterRow(row) {
  if (!row) {
    return null;
  }

  return {
    createdAt: row.created_at,
    id: row.id,
    installedPath: row.installed_path,
    manifest: parseJson(row.manifest_json, {}),
    name: row.name,
    sourceId: row.source_id,
    sourceRef: row.source_ref,
    sourceType: row.source_type,
    updatedAt: row.updated_at,
    version: row.version,
    widgets: parseJson(row.widgets_json, []),
  };
}

export function mapServiceEnhancementRow(row) {
  if (!row) {
    return null;
  }

  return {
    adapterId: row.adapter_id,
    config: parseJson(row.config_json, {}),
    createdAt: row.created_at,
    enabled: Boolean(row.enabled),
    id: row.id,
    lastTestMessage: row.last_test_message,
    lastTestStatus: row.last_test_status,
    pollIntervalSeconds: row.poll_interval_seconds,
    serviceId: row.service_id,
    updatedAt: row.updated_at,
  };
}

export function mapEnhancedStateRow(row) {
  if (!row) {
    return null;
  }

  return {
    createdAt: row.created_at,
    errorMessage: row.error_message,
    fetchedAt: row.fetched_at,
    id: row.id,
    serviceEnhancementId: row.service_enhancement_id,
    state: parseJson(row.state_json, {}),
    status: row.status,
    updatedAt: row.updated_at,
  };
}

export function mapEnhancedRegistrySourceRow(row, { includeSecrets = false } = {}) {
  return {
    authToken: includeSecrets ? row.auth_token || null : undefined,
    createdAt: row.created_at,
    id: row.id,
    hasAuthToken: Boolean(row.auth_token),
    lastSyncMessage: row.last_sync_message,
    lastSyncStatus: row.last_sync_status,
    lastSyncedAt: row.last_synced_at,
    name: row.name,
    ref: row.ref_name || null,
    registryIndex: parseJson(row.index_json, null),
    trusted: Boolean(row.trusted),
    type: row.type,
    updatedAt: row.updated_at,
    url: row.url,
  };
}

export function mapInstalledIntegrationRow(row) {
  if (!row) {
    return null;
  }

  return {
    createdAt: row.created_at,
    id: row.id,
    installedPath: row.installed_path,
    manifest: parseJson(row.manifest_json, {}),
    name: row.name,
    sourceId: row.source_id,
    sourceRef: row.source_ref,
    sourceType: row.source_type,
    templates: parseJson(row.templates_json, []),
    updatedAt: row.updated_at,
    version: row.version,
  };
}

export function mapInstalledWidgetPluginRow(row) {
  if (!row) {
    return null;
  }

  return {
    createdAt: row.created_at,
    id: row.id,
    installedPath: row.installed_path,
    manifest: parseJson(row.manifest_json, {}),
    name: row.name,
    sourceId: row.source_id,
    sourceRef: row.source_ref,
    sourceType: row.source_type,
    updatedAt: row.updated_at,
    version: row.version,
    widgets: parseJson(row.widgets_json, []),
  };
}

export function mapIntegrationInstanceRow(row, { includeConfig = true } = {}) {
  if (!row) {
    return null;
  }

  return {
    config: includeConfig ? parseJson(row.config_json, {}) : undefined,
    createdAt: row.created_at,
    id: row.id,
    integrationId: row.integration_id,
    name: row.name,
    updatedAt: row.updated_at,
  };
}

export function mapIntegrationStateRow(row) {
  if (!row) {
    return null;
  }

  return {
    errorMessage: row.error_message,
    fetchedAt: row.fetched_at,
    instanceId: row.instance_id,
    state: parseJson(row.state_json, {}),
    status: row.status,
    updatedAt: row.updated_at,
  };
}

