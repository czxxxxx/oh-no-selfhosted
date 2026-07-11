export const PLUGIN_WIDGET_TEMPLATE_KIND = "plugin-widget";

const PLUGIN_WIDGET_TEMPLATE_PREFIX = "plugin";

export function createPluginWidgetTemplateId(pluginId, widgetId) {
  return [PLUGIN_WIDGET_TEMPLATE_PREFIX, pluginId, widgetId].map(encodeURIComponent).join(":");
}

export function parsePluginWidgetTemplateId(templateId) {
  if (typeof templateId !== "string") {
    return null;
  }

  let parts;

  try {
    parts = templateId.split(":").map(decodeURIComponent);
  } catch {
    return null;
  }

  const [prefix, pluginId, widgetId, ...rest] = parts;

  if (prefix !== PLUGIN_WIDGET_TEMPLATE_PREFIX || !pluginId || !widgetId || rest.length) {
    return null;
  }

  return { pluginId, widgetId };
}

export function isPluginWidgetTemplate(template) {
  return template?.kind === PLUGIN_WIDGET_TEMPLATE_KIND || Boolean(template?.plugin?.id);
}

export function isPluginWidgetTemplateId(templateId) {
  return Boolean(parsePluginWidgetTemplateId(templateId));
}
