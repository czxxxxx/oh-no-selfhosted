import { EnhancedWidgetRenderer } from "./renderers/EnhancedWidgetRenderer.jsx";
import { GenericWidgetRenderer } from "./renderers/GenericWidgetRenderer.jsx";
import { RemoteReactWidgetRenderer } from "./renderers/RemoteReactWidgetRenderer.jsx";
import { SYSTEM_WIDGET_TEMPLATE_IDS, SystemWidgetRenderer } from "./renderers/SystemWidgetRenderer.jsx";

export function WidgetRenderer({ mode = "live", onRefresh, openUrl, service, template, widget }) {
  const style = widget.style || {};

  if (template.react) {
    return (
      <RemoteReactWidgetRenderer
        onRefresh={onRefresh}
        openUrl={openUrl}
        mode={mode}
        service={service}
        style={style}
        template={template}
        widget={widget}
      />
    );
  }

  if (widget.enhancedRenderer || widget.enhancedWidgetId || template.enhanced || template.integration) {
    return <EnhancedWidgetRenderer openUrl={openUrl} service={service} style={style} template={template} widget={widget} />;
  }

  if (SYSTEM_WIDGET_TEMPLATE_IDS.has(template.id)) {
    return <SystemWidgetRenderer service={service} template={template} widget={widget} />;
  }

  return <GenericWidgetRenderer service={service} template={template} widget={widget} />;
}
