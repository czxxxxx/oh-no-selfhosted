export const ENHANCED_WIDGET_TEMPLATE_KIND = "enhanced-widget";
export const ENHANCED_WIDGET_TEMPLATE_SCOPE = "service";

const ENHANCED_TEMPLATE_PREFIX = "enhanced";

export function createEnhancedTemplateId(serviceId, widgetId) {
  return [ENHANCED_TEMPLATE_PREFIX, serviceId, widgetId].map(encodeURIComponent).join(":");
}

export function parseEnhancedTemplateId(templateId) {
  if (typeof templateId !== "string") {
    return null;
  }

  let parts;

  try {
    parts = templateId.split(":").map(decodeURIComponent);
  } catch {
    return null;
  }

  const [prefix, serviceId, widgetId, ...rest] = parts;

  if (prefix !== ENHANCED_TEMPLATE_PREFIX || !serviceId || !widgetId || rest.length > 0) {
    return null;
  }

  return { serviceId, widgetId };
}

export function isEnhancedTemplateId(templateId) {
  return Boolean(parseEnhancedTemplateId(templateId));
}

export function isEnhancedWidgetTemplate(template) {
  return (
    template?.kind === ENHANCED_WIDGET_TEMPLATE_KIND ||
    Boolean(template?.enhanced?.serviceId && template?.enhanced?.widgetId)
  );
}

export function getEnhancedTemplateServiceId(template) {
  return template?.enhanced?.serviceId || parseEnhancedTemplateId(template?.id)?.serviceId || null;
}

export function buildEnhancedWidgetTemplate({ adapter, enhancement, service, widget }) {
  return {
    aliases: (widget.aliases || []).map((alias) => createEnhancedTemplateId(service.id, alias)),
    defaultLayout: widget.defaultLayout,
    description: widget.description || adapter.manifest.description,
    enhanced: {
      adapterId: enhancement.adapterId,
      dataPath: widget.dataPath,
      enhancementId: enhancement.id,
      fields: widget.fields || [],
      renderer: widget.renderer,
      serviceId: service.id,
      serviceTypeId: service.typeId,
      widgetId: widget.id,
    },
    id: createEnhancedTemplateId(service.id, widget.id),
    kind: ENHANCED_WIDGET_TEMPLATE_KIND,
    minLayout: widget.minLayout,
    name: widget.name,
    refreshIntervalSeconds: widget.refreshIntervalSeconds ?? null,
    react: widget.react || null,
    scope: ENHANCED_WIDGET_TEMPLATE_SCOPE,
  };
}
