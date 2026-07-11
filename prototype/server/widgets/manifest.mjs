import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createPluginWidgetTemplateId, PLUGIN_WIDGET_TEMPLATE_KIND } from "../../src/pluginWidgetContract.js";
import { validateCommonPluginManifest, validateSemver } from "../plugins/contract.mjs";
import { createReactWidgetReference, validateFrontendDefinition } from "../plugins/frontend.mjs";

export const PLUGIN_WIDGET_RENDERERS = new Set([
  "generic",
  "json-preview",
  "metric-list",
  "metric-pair",
  "react",
  "sparkline",
  "status-summary",
  "system",
  "table",
]);
const CONFIG_FIELD_TYPES = new Set(["text", "password", "url", "number", "boolean", "select"]);

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

  if (!Number.isInteger(h) || !Number.isInteger(w) || h <= 0 || w <= 0 || w > 12) {
    throw new Error(`${label} must include positive integer w and h with w <= 12`);
  }

  return { h, w };
}

function validateConfigField(value) {
  const field = assertPlainObject(value, "Plugin widget config field");
  const type = assertNonEmptyString(field.type, "Plugin widget config field type");

  if (!CONFIG_FIELD_TYPES.has(type)) {
    throw new Error(`Unsupported plugin widget config field type: ${type}`);
  }

  return {
    ...field,
    key: assertNonEmptyString(field.key, "Plugin widget config field key"),
    label: assertNonEmptyString(field.label, "Plugin widget config field label"),
    type,
  };
}

export function validateWidgetPluginManifest(input) {
  const manifest = assertPlainObject(input, "Widget plugin manifest");
  const common = validateCommonPluginManifest(manifest, { kind: "widget" });

  const registration = manifest.registration || "plugin";

  if (!new Set(["native", "plugin"]).has(registration)) {
    throw new Error("Widget plugin registration must be native or plugin");
  }

  return {
    ...manifest,
    ...common,
    description: assertNonEmptyString(manifest.description, "Widget plugin description"),
    frontend: validateFrontendDefinition(manifest.frontend),
    id: assertNonEmptyString(manifest.id, "Widget plugin id"),
    name: assertNonEmptyString(manifest.name, "Widget plugin name"),
    registration,
    version: validateSemver(manifest.version, "Widget plugin version"),
    widgets: assertNonEmptyString(manifest.widgets, "Widget plugin definitions path"),
  };
}

export function validateWidgetPluginDefinitions(input, manifest) {
  if (!Array.isArray(input) || !input.length) {
    throw new Error("Widget plugin definitions must be a non-empty array");
  }

  const ids = new Set();

  return input.map((value) => {
    const widget = assertPlainObject(value, "Widget plugin definition");
    const widgetId = assertNonEmptyString(widget.id, "Widget plugin definition id");
    const renderer = assertNonEmptyString(widget.renderer, "Widget plugin renderer");

    if (ids.has(widgetId)) {
      throw new Error(`Widget plugin definitions contains duplicate id: ${widgetId}`);
    }

    if (!PLUGIN_WIDGET_RENDERERS.has(renderer)) {
      throw new Error(`Unsupported plugin widget renderer: ${renderer}`);
    }

    if (renderer === "react" && !manifest.frontend) {
      throw new Error("React plugin widgets require a manifest frontend entry");
    }

    ids.add(widgetId);
    const defaultLayout = validateLayout(widget.defaultLayout, `Plugin widget ${widgetId} defaultLayout`);
    const minLayout = validateLayout(widget.minLayout || widget.defaultLayout, `Plugin widget ${widgetId} minLayout`);

    if (minLayout.w > defaultLayout.w || minLayout.h > defaultLayout.h) {
      throw new Error(`Plugin widget ${widgetId} minLayout must not exceed defaultLayout`);
    }

    const isNative = manifest.registration === "native";
    const templateId = isNative ? widgetId : createPluginWidgetTemplateId(manifest.id, widgetId);
    const aliases = Array.isArray(widget.aliases)
      ? [...new Set(widget.aliases.map((alias) => isNative ? alias : createPluginWidgetTemplateId(manifest.id, alias)))]
      : [];

    return {
      aliases,
      defaultData: widget.defaultData && typeof widget.defaultData === "object" ? widget.defaultData : {},
      defaultLayout,
      defaultStyle: widget.defaultStyle,
      description: assertNonEmptyString(widget.description, `Plugin widget ${widgetId} description`),
      id: templateId,
      kind: isNative ? "native-widget" : PLUGIN_WIDGET_TEMPLATE_KIND,
      minLayout,
      name: assertNonEmptyString(widget.name, `Plugin widget ${widgetId} name`),
      nativeOnly: Boolean(widget.nativeOnly),
      plugin: isNative
        ? null
        : {
            configFields: Array.isArray(widget.configFields) ? widget.configFields.map(validateConfigField) : [],
            id: manifest.id,
            renderer,
            widgetId,
          },
      react:
        renderer === "react"
          ? createReactWidgetReference({
              component: widget.component,
              manifest,
              pluginKind: "widget",
            })
          : null,
      renderer,
      systemOnly: Boolean(widget.systemOnly),
      supportedStyleControls: widget.supportedStyleControls,
    };
  });
}

export async function loadWidgetPluginDefinition(pluginDir) {
  const manifest = validateWidgetPluginManifest(JSON.parse(await readFile(join(pluginDir, "manifest.json"), "utf8")));
  const widgets = validateWidgetPluginDefinitions(
    JSON.parse(await readFile(join(pluginDir, manifest.widgets), "utf8")),
    manifest,
  );

  return { manifest, pluginDir, widgets };
}
