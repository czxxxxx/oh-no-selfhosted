import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateCommonPluginManifest, validateSemver } from "../plugins/contract.mjs";
import { createReactWidgetReference, validateFrontendDefinition } from "../plugins/frontend.mjs";

export const INTEGRATION_CONFIG_FIELD_TYPES = new Set(["text", "password", "url", "number", "boolean", "select"]);
export const INTEGRATION_RENDERERS = new Set([
  "codex-usage",
  "json-preview",
  "metric-list",
  "metric-pair",
  "react",
  "recent-media-row",
  "sparkline",
  "status-summary",
  "storage-donut",
  "table",
  "weather-current",
]);

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value;
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }

  return value.trim();
}

function validateColor(value, fallback) {
  if (typeof value === "string" && /^#[\da-f]{6}$/i.test(value)) {
    return value;
  }

  return fallback;
}

function validateConfigField(field) {
  const normalized = assertPlainObject(field, "Integration config field");
  const type = assertNonEmptyString(normalized.type, "Integration config field type");

  if (!INTEGRATION_CONFIG_FIELD_TYPES.has(type)) {
    throw new Error(`Unsupported integration config field type: ${type}`);
  }

  return {
    ...normalized,
    key: assertNonEmptyString(normalized.key, "Integration config field key"),
    label: assertNonEmptyString(normalized.label, "Integration config field label"),
    type,
  };
}

function validateLayout(layout, label) {
  const normalized = assertPlainObject(layout, label);
  const w = Number(normalized.w);
  const h = Number(normalized.h);

  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0 || w > 12) {
    throw new Error(`${label} must include positive integer w and h with w <= 12`);
  }

  return { h, w };
}

function normalizeTemplateId(id, integrationId) {
  const rawId = assertNonEmptyString(id, "Integration widget id");

  return rawId.startsWith("integration:") ? rawId : `integration:${integrationId}:${rawId}`;
}

function validateFields(fields) {
  if (!Array.isArray(fields)) {
    return [];
  }

  return fields.map((field) => assertPlainObject(field, "Integration widget field"));
}

export function validateIntegrationManifest(manifest) {
  const normalized = assertPlainObject(manifest, "Integration manifest");
  const common = validateCommonPluginManifest(normalized, { kind: "integration" });
  const configFields = Array.isArray(normalized.configFields)
    ? normalized.configFields.map(validateConfigField)
    : [];

  return {
    ...normalized,
    ...common,
    color: validateColor(normalized.color, "#2f80d1"),
    config: typeof normalized.config === "string" ? normalized.config : "",
    configFields,
    description: assertNonEmptyString(normalized.description, "Integration manifest description"),
    entry: assertNonEmptyString(normalized.entry, "Integration manifest entry"),
    frontend: validateFrontendDefinition(normalized.frontend),
    iconKey: assertNonEmptyString(normalized.iconKey || "custom", "Integration manifest iconKey"),
    iconKind: normalized.iconKind || "preset",
    id: assertNonEmptyString(normalized.id, "Integration manifest id"),
    name: assertNonEmptyString(normalized.name, "Integration manifest name"),
    templates: assertNonEmptyString(normalized.templates, "Integration manifest templates"),
    version: validateSemver(normalized.version, "Integration manifest version"),
  };
}

export function validateIntegrationWidgetDefinitions(widgets, manifest) {
  if (!Array.isArray(widgets)) {
    throw new Error("Integration widget definitions must be an array");
  }

  const ids = new Set();

  return widgets.map((widget) => {
    const normalized = assertPlainObject(widget, "Integration widget definition");
    const renderer = assertNonEmptyString(normalized.renderer, "Integration widget renderer");

    if (!INTEGRATION_RENDERERS.has(renderer)) {
      throw new Error(`Unsupported integration widget renderer: ${renderer}`);
    }

    if (renderer === "react" && !manifest.frontend) {
      throw new Error("React integration widgets require a manifest frontend entry");
    }

    const id = normalizeTemplateId(normalized.id, manifest.id);

    if (ids.has(id)) {
      throw new Error(`Integration widget definitions contains duplicate id: ${id}`);
    }

    ids.add(id);
    const defaultLayout = validateLayout(normalized.defaultLayout, "Integration widget defaultLayout");
    const minLayout = validateLayout(normalized.minLayout || normalized.defaultLayout, "Integration widget minLayout");

    if (minLayout.w > defaultLayout.w || minLayout.h > defaultLayout.h) {
      throw new Error(`Integration widget ${id} minLayout must not exceed defaultLayout`);
    }
    const integrationConfigFields = Array.isArray(normalized.configFields)
      ? normalized.configFields.map(validateConfigField)
      : manifest.configFields;

    return {
      aliases: Array.isArray(normalized.aliases)
        ? [...new Set(normalized.aliases.map((alias) => normalizeTemplateId(alias, manifest.id)))]
        : [],
      defaultLayout,
      defaultStyle: normalized.defaultStyle,
      description: assertNonEmptyString(normalized.description, "Integration widget description"),
      id,
      integration: {
        color: validateColor(normalized.color, manifest.color),
        configFields: integrationConfigFields,
        dataPath: normalized.dataPath || "",
        fields: validateFields(normalized.fields),
        iconKey: normalized.iconKey || manifest.iconKey,
        iconKind: normalized.iconKind || manifest.iconKind,
        id: manifest.id,
        renderer,
      },
      minLayout,
      name: assertNonEmptyString(normalized.name, "Integration widget name"),
      react:
        renderer === "react"
          ? createReactWidgetReference({
              component: normalized.component,
              manifest,
              pluginKind: "integration",
            })
          : null,
      refreshIntervalSeconds: normalized.refreshIntervalSeconds ?? null,
      supportedStyleControls: normalized.supportedStyleControls,
      systemOnly: normalized.systemOnly !== false,
    };
  });
}

export async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function loadIntegrationDefinition(pluginDir) {
  const manifest = validateIntegrationManifest(await readJsonFile(join(pluginDir, "manifest.json")));
  const templates = validateIntegrationWidgetDefinitions(await readJsonFile(join(pluginDir, manifest.templates)), manifest);

  return { manifest, pluginDir, templates };
}
