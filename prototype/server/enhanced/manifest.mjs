import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateCommonPluginManifest, validateSemver } from "../plugins/contract.mjs";
import { createReactWidgetReference, validateFrontendDefinition } from "../plugins/frontend.mjs";

export const CONFIG_FIELD_TYPES = new Set(["text", "password", "url", "number", "boolean", "select"]);
export const HOST_RENDERERS = new Set([
  "json-preview",
  "metric-list",
  "metric-pair",
  "recent-media-row",
  "sparkline",
  "status-summary",
  "storage-donut",
  "table",
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

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${label} must be a non-empty string array`);
  }

  return value.map((item) => item.trim());
}

function validateConfigField(field) {
  const normalized = assertPlainObject(field, "Config field");
  const type = assertNonEmptyString(normalized.type, "Config field type");

  if (!CONFIG_FIELD_TYPES.has(type)) {
    throw new Error(`Unsupported config field type: ${type}`);
  }

  return {
    ...normalized,
    key: assertNonEmptyString(normalized.key, "Config field key"),
    label: assertNonEmptyString(normalized.label, "Config field label"),
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

export function validateManifest(manifest) {
  const normalized = assertPlainObject(manifest, "Manifest");
  const common = validateCommonPluginManifest(normalized, { kind: "service-adapter" });
  const configSchema = Array.isArray(normalized.configSchema) ? normalized.configSchema.map(validateConfigField) : [];

  return {
    ...normalized,
    ...common,
    configSchema,
    entry: assertNonEmptyString(normalized.entry, "Manifest entry"),
    frontend: validateFrontendDefinition(normalized.frontend),
    id: assertNonEmptyString(normalized.id, "Manifest id"),
    name: assertNonEmptyString(normalized.name, "Manifest name"),
    serviceTypes: assertStringArray(normalized.serviceTypes, "Manifest serviceTypes"),
    version: validateSemver(normalized.version, "Manifest version"),
    widgets: assertNonEmptyString(normalized.widgets, "Manifest widgets"),
  };
}

export function validateWidgetDefinitions(widgets, manifest = {}) {
  if (!Array.isArray(widgets)) {
    throw new Error("Widget definitions must be an array");
  }

  const ids = new Set();

  return widgets.map((widget) => {
    const normalized = assertPlainObject(widget, "Widget definition");
    const renderer = assertNonEmptyString(normalized.renderer, "Widget renderer");
    const id = assertNonEmptyString(normalized.id, "Widget id");

    if (ids.has(id)) {
      throw new Error(`Widget definitions contains duplicate id: ${id}`);
    }

    if (renderer !== "react" && !HOST_RENDERERS.has(renderer)) {
      throw new Error(`Unsupported enhanced widget renderer: ${renderer}`);
    }

    if (renderer === "react" && !manifest.frontend) {
      throw new Error("React enhanced widgets require a manifest frontend entry");
    }

    ids.add(id);
    const defaultLayout = validateLayout(normalized.defaultLayout, "Widget defaultLayout");
    const minLayout = validateLayout(normalized.minLayout || normalized.defaultLayout, "Widget minLayout");

    if (minLayout.w > defaultLayout.w || minLayout.h > defaultLayout.h) {
      throw new Error(`Widget ${id} minLayout must not exceed defaultLayout`);
    }

    return {
      ...normalized,
      aliases: Array.isArray(normalized.aliases)
        ? [...new Set(normalized.aliases.map((alias) => assertNonEmptyString(alias, "Widget alias")))]
        : [],
      defaultLayout,
      fields: Array.isArray(normalized.fields) ? normalized.fields : [],
      id,
      minLayout,
      name: assertNonEmptyString(normalized.name, "Widget name"),
      react:
        renderer === "react"
          ? createReactWidgetReference({
              component: normalized.component,
              manifest,
              pluginKind: "service-adapter",
            })
          : null,
      renderer,
    };
  });
}

export async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function loadPluginDefinition(pluginDir) {
  const manifest = validateManifest(await readJsonFile(join(pluginDir, "manifest.json")));
  const widgets = validateWidgetDefinitions(await readJsonFile(join(pluginDir, manifest.widgets)), manifest);

  return { manifest, pluginDir, widgets };
}
