import { parseEnhancedTemplateId } from "../../src/enhancedWidgetContract.js";

export function normalizeEnhancedWidgetBinding(widget, { getAdapterById, getEnhancementById }) {
  const templateScope = parseEnhancedTemplateId(widget.templateId);
  const hasEnhancedBinding = Boolean(templateScope || widget.enhancementId || widget.enhancedWidgetId);

  if (!hasEnhancedBinding) {
    return widget;
  }

  const enhancedWidgetId = widget.enhancedWidgetId || templateScope?.widgetId;

  if (!widget.serviceId) {
    throw new Error("Enhanced widgets must be bound to a service");
  }

  if (!widget.enhancementId) {
    throw new Error("Enhanced widgets must be bound to a service enhancement");
  }

  if (!enhancedWidgetId) {
    throw new Error("Enhanced widget id is required");
  }

  if (templateScope?.serviceId && templateScope.serviceId !== widget.serviceId) {
    throw new Error("Enhanced widget template must match its bound service");
  }

  if (templateScope?.widgetId && templateScope.widgetId !== enhancedWidgetId) {
    throw new Error("Enhanced widget template must match its enhanced widget id");
  }

  const enhancement = getEnhancementById(widget.enhancementId);

  if (!enhancement || enhancement.serviceId !== widget.serviceId) {
    throw new Error("Enhanced widget must use an enhancement for the same service");
  }

  const adapter = getAdapterById(enhancement.adapterId);

  if (!adapter?.widgets?.some((candidate) => candidate.id === enhancedWidgetId)) {
    throw new Error("Enhanced widget is not provided by the selected adapter");
  }

  return {
    ...widget,
    enhancedWidgetId,
  };
}
