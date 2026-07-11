import { WIDGET_GRID_COLUMNS } from "../../src/widgetTemplates.js";
import { validateBuiltInServiceTypes } from "../serviceTypeRegistry.mjs";
import { BUILTIN_REGISTRY_ID, BUILTIN_REGISTRY_URL } from "./builtinSource.mjs";

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value;
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required`);
  }

  return value.trim();
}

function validateLayout(value, label) {
  const layout = assertPlainObject(value, label);
  const h = Number(layout.h);
  const w = Number(layout.w);

  if (!Number.isInteger(h) || !Number.isInteger(w) || h <= 0 || w <= 0 || w > WIDGET_GRID_COLUMNS) {
    throw new Error(`${label} must include positive integer w and h with w <= ${WIDGET_GRID_COLUMNS}`);
  }

  return { h, w };
}

function assertUniqueIds(items, label) {
  const ids = new Set();

  for (const item of items) {
    if (ids.has(item.id)) {
      throw new Error(`${label} contains duplicate id: ${item.id}`);
    }

    ids.add(item.id);
  }
}

export function validateNativeWidgetTemplates(templates = []) {
  if (!Array.isArray(templates)) {
    throw new Error("Native widget templates must be an array");
  }

  const normalized = templates.map((template) => {
    const widget = assertPlainObject(template, "Native widget template");
    const id = assertNonEmptyString(widget.id, "Native widget template id");

    if (id.startsWith("enhanced:") || id.startsWith("integration:")) {
      throw new Error(`Native widget template must use a local id: ${id}`);
    }

    return {
      ...widget,
      defaultLayout: validateLayout(widget.defaultLayout, `Native widget ${id} defaultLayout`),
      defaultStyle: assertPlainObject(widget.defaultStyle, `Native widget ${id} defaultStyle`),
      description: assertNonEmptyString(widget.description, `Native widget ${id} description`),
      id,
      minLayout: validateLayout(widget.minLayout, `Native widget ${id} minLayout`),
      name: assertNonEmptyString(widget.name, `Native widget ${id} name`),
      supportedStyleControls: Array.isArray(widget.supportedStyleControls)
        ? [...widget.supportedStyleControls]
        : [],
    };
  });

  assertUniqueIds(normalized, "Native widget templates");
  return normalized;
}

function summarizeAdapter(definition) {
  return {
    id: definition.manifest.id,
    name: definition.manifest.name,
    serviceTypes: definition.manifest.serviceTypes,
    version: definition.manifest.version,
    widgetIds: definition.widgets.map((widget) => widget.id),
  };
}

function summarizeIntegration(definition) {
  return {
    id: definition.manifest.id,
    name: definition.manifest.name,
    version: definition.manifest.version,
    widgetIds: definition.templates.map((template) => template.id),
  };
}

export function createBuiltInPluginRegistry({ enhancedRegistry, integrationRegistry, widgetPluginRegistry }) {
  return {
    async listNativeWidgetTemplates() {
      const plugins = await widgetPluginRegistry.listBuiltInPlugins();
      const templates = plugins
        .filter((definition) => definition.manifest.registration === "native")
        .flatMap((definition) => definition.widgets);

      return validateNativeWidgetTemplates(templates);
    },
    listServiceTypes() {
      return validateBuiltInServiceTypes();
    },
    async inspect() {
      const [adapters, integrations, nativeWidgets] = await Promise.all([
        enhancedRegistry.listBuiltInAdapters(),
        integrationRegistry.listBuiltInIntegrations(),
        this.listNativeWidgetTemplates(),
      ]);
      const serviceTypes = this.listServiceTypes();
      const summarizedAdapters = adapters.map(summarizeAdapter);
      const summarizedIntegrations = integrations.map(summarizeIntegration);

      assertUniqueIds(summarizedAdapters, "Built-in service adapters");
      assertUniqueIds(summarizedIntegrations, "Built-in integrations");

      return {
        contributions: {
          integrations: summarizedIntegrations,
          nativeWidgets,
          serviceAdapters: summarizedAdapters,
          serviceTypes,
        },
        counts: {
          adapterWidgets: adapters.reduce((total, adapter) => total + adapter.widgets.length, 0),
          integrationWidgets: integrations.reduce(
            (total, integration) => total + integration.templates.length,
            0,
          ),
          integrations: integrations.length,
          nativeWidgets: nativeWidgets.length,
          serviceAdapters: adapters.length,
          serviceTypes: serviceTypes.length,
        },
        id: BUILTIN_REGISTRY_ID,
        name: "Oh No Built-ins",
        sourceRef: BUILTIN_REGISTRY_URL,
        sourceType: "local",
        status: "verified",
        version: 1,
      };
    },
  };
}
