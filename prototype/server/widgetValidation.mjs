import {
  WIDGET_GRID_COLUMNS,
  getDefaultWidgetStyle,
  getWidgetTemplate,
  normalizeWidgetStyle,
} from "../src/widgetTemplates.js";

const BLOCKED_CSS_PATTERNS = [
  /\bscript\b/i,
  /@import/i,
  /url\s*\(/i,
  /\bbody\b/i,
  /\bhtml\b/i,
  /\.launcher\b/i,
  /\.launchpad\b/i,
  /\.dashboard-shell\b/i,
  /\.app\b/i,
];

function assertInteger(value, name) {
  const number = Number(value);

  if (!Number.isInteger(number)) {
    throw new Error(`${name} must be an integer`);
  }

  return number;
}

function normalizeRefreshIntervalSeconds(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const interval = assertInteger(value, "Widget refresh interval");

  if (interval < 0) {
    throw new Error("Widget refresh interval must be non-negative");
  }

  return interval;
}

export function validateWidgetConfig(config, fields = [], label = "Widget config") {
  if (config === undefined || config === null) {
    config = {};
  }

  if (typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`${label} must be an object`);
  }

  const knownFields = new Map(fields.map((field) => [field.key, field]));
  const unknownKey = Object.keys(config).find((key) => !knownFields.has(key));

  if (unknownKey) {
    throw new Error(`${label} contains an unknown field: ${unknownKey}`);
  }

  return Object.fromEntries(
    fields.flatMap((field) => {
      const rawValue = config[field.key] ?? field.default;

      if (rawValue === undefined || rawValue === null || rawValue === "") {
        if (field.required) {
          throw new Error(`${label} field ${field.label || field.key} is required`);
        }

        return [];
      }

      if (field.type === "number") {
        const number = Number(rawValue);

        if (!Number.isFinite(number)) {
          throw new Error(`${label} field ${field.label || field.key} must be a number`);
        }

        return [[field.key, number]];
      }

      if (field.type === "boolean") {
        if (![true, false, "true", "false"].includes(rawValue)) {
          throw new Error(`${label} field ${field.label || field.key} must be a boolean`);
        }

        return [[field.key, rawValue === true || rawValue === "true"]];
      }

      const value = String(rawValue).trim();

      if (field.type === "url") {
        let parsed;

        try {
          parsed = new URL(value);
        } catch {
          throw new Error(`${label} field ${field.label || field.key} must be a valid URL`);
        }

        if (!["http:", "https:"].includes(parsed.protocol)) {
          throw new Error(`${label} field ${field.label || field.key} must use HTTP or HTTPS`);
        }
      }

      if (field.type === "select" && Array.isArray(field.options)) {
        const options = field.options.map((option) =>
          String(typeof option === "object" ? option.value : option),
        );

        if (!options.includes(value)) {
          throw new Error(`${label} field ${field.label || field.key} must use an allowed option`);
        }
      }

      return [[field.key, value]];
    }),
  );
}

export function validateScopedCss(widgetId, css = "") {
  const normalizedCss = String(css || "").trim();

  if (!normalizedCss) {
    return "";
  }

  const rootSelector = `[data-widget-id="${widgetId}"]`;

  for (const pattern of BLOCKED_CSS_PATTERNS) {
    if (pattern.test(normalizedCss)) {
      throw new Error(`Scoped CSS selectors must start with ${rootSelector}`);
    }
  }

  const selectorPattern = /([^{}]+)\{/g;
  let match;

  while ((match = selectorPattern.exec(normalizedCss))) {
    const selectors = match[1].split(",").map((selector) => selector.trim());

    for (const selector of selectors) {
      if (!selector.startsWith(rootSelector)) {
        throw new Error(`Scoped CSS selectors must start with ${rootSelector}`);
      }
    }
  }

  return normalizedCss;
}

export function normalizeWidgetInput(
  input,
  { existing = {}, service = null, now = new Date().toISOString(), template: templateOverride = null } = {},
) {
  const templateId = input.templateId || existing.templateId || "compact";
  const template = templateOverride || getWidgetTemplate(templateId);

  if (!template) {
    throw new Error(`Unsupported widget template: ${templateId}`);
  }

  const x = assertInteger(input.x ?? existing.x ?? 0, "Widget x");
  const y = assertInteger(input.y ?? existing.y ?? 0, "Widget y");
  const w = assertInteger(input.w ?? existing.w ?? template.defaultLayout.w, "Widget width");
  const h = assertInteger(input.h ?? existing.h ?? template.defaultLayout.h, "Widget height");
  const minW = assertInteger(input.minW ?? existing.minW ?? template.minLayout.w, "Widget minimum width");
  const minH = assertInteger(input.minH ?? existing.minH ?? template.minLayout.h, "Widget minimum height");

  if (x < 0 || y < 0) {
    throw new Error("Widget x and y must be non-negative");
  }

  if (w <= 0 || h <= 0 || minW <= 0 || minH <= 0) {
    throw new Error("Widget width and height must be positive");
  }

  if (w > WIDGET_GRID_COLUMNS) {
    throw new Error(`Widget width must not exceed ${WIDGET_GRID_COLUMNS} columns`);
  }

  if (x + w > WIDGET_GRID_COLUMNS) {
    throw new Error(`Widget x and width must fit within ${WIDGET_GRID_COLUMNS} columns`);
  }

  if (minW > w || minH > h) {
    throw new Error("Widget minimum size must not exceed its current size");
  }

  const mergedStyle = normalizeWidgetStyle(templateId, {
    ...getDefaultWidgetStyle(templateId, template),
    ...(existing.style || {}),
    ...(input.style || {}),
  }, template);
  const integrationId = input.integrationId ?? existing.integrationId ?? template.integration?.id ?? null;
  const integrationInstanceId =
    input.integrationInstanceId ?? existing.integrationInstanceId ?? null;
  const pluginId = input.pluginId ?? existing.pluginId ?? template.plugin?.id ?? null;

  if (integrationId && !template.integration) {
    throw new Error("Integration widgets must use an integration template");
  }

  if (template.integration?.id && integrationId !== template.integration.id) {
    throw new Error("Integration widget must match its template");
  }

  if (integrationInstanceId && !integrationId) {
    throw new Error("Only integration widgets can use an integration instance");
  }

  if (pluginId && !template.plugin) {
    throw new Error("Plugin widgets must use a plugin widget template");
  }

  if (template.plugin?.id && pluginId !== template.plugin.id) {
    throw new Error("Plugin widget must match its template");
  }

  const baseRenderer =
    input.enhancedRenderer !== undefined
      ? input.enhancedRenderer
      : existing.enhancedRenderer ||
        (template.integration
          ? {
              dataPath: template.integration.dataPath || "",
              fields: template.integration.fields || [],
              renderer: template.integration.renderer,
            }
          : null);
  const enhancedRenderer = template.plugin
    ? {
        ...(baseRenderer || {}),
        config: validateWidgetConfig(
          baseRenderer?.config || {},
          template.plugin.configFields || [],
          "Plugin widget config",
        ),
      }
    : baseRenderer;
  const zIndex = assertInteger(input.zIndex ?? existing.zIndex ?? 1, "Widget z-index");

  if (zIndex < 0) {
    throw new Error("Widget z-index must be non-negative");
  }

  return {
    createdAt: existing.createdAt || now,
    enhancedRenderer,
    enhancedWidgetId:
      input.enhancedWidgetId !== undefined ? input.enhancedWidgetId : existing.enhancedWidgetId || null,
    enhancementId:
      input.enhancementId !== undefined ? input.enhancementId : existing.enhancementId || null,
    h,
    id: input.id || existing.id,
    integrationId,
    integrationInstanceId,
    minH,
    minW,
    pluginId,
    refreshIntervalSeconds: normalizeRefreshIntervalSeconds(
      input.refreshIntervalSeconds ?? existing.refreshIntervalSeconds ?? template.refreshIntervalSeconds ?? null,
    ),
    scopedCss: input.scopedCss ?? existing.scopedCss ?? "",
    serviceId: input.serviceId ?? existing.serviceId ?? service?.id ?? null,
    style: mergedStyle,
    subtitle: String(input.subtitle ?? existing.subtitle ?? service?.description ?? template.description).trim(),
    templateId,
    title: String(input.title ?? existing.title ?? service?.name ?? template.name).trim(),
    updatedAt: now,
    url: input.url ?? existing.url ?? service?.url ?? "",
    w,
    x,
    y,
    zIndex,
  };
}
