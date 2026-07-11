function widgetHasDeferredData(widget) {
  return Boolean(
    widget.integrationId || widget.integrationInstanceId ||
      (widget.enhancedRenderer && (widget.enhancementId || widget.enhancedWidgetId || widget.serviceId)),
  );
}

function enhancedDataFromCachedState(widget, enhancedState) {
  if (!enhancedState?.state) {
    return null;
  }

  const dataPath = widget.enhancedRenderer?.dataPath;

  return dataPath ? enhancedState.state?.[dataPath] : enhancedState.state;
}

export function prepareWidgetForClient(store, widget) {
  const sanitizedWidget = widget.integrationInstanceId && widget.enhancedRenderer?.config
    ? {
        ...widget,
        enhancedRenderer: Object.fromEntries(
          Object.entries(widget.enhancedRenderer).filter(([key]) => key !== "config"),
        ),
      }
    : widget;

  if (sanitizedWidget.integrationInstanceId) {
    const integrationState = store.getIntegrationState(sanitizedWidget.integrationInstanceId);
    const dataPath = sanitizedWidget.enhancedRenderer?.dataPath;
    const enhancedData = dataPath ? integrationState?.state?.[dataPath] : integrationState?.state;

    if (integrationState) {
      return {
        ...sanitizedWidget,
        enhancedData: enhancedData || null,
        enhancedStateStatus: integrationState.status || "missing",
      };
    }
  }

  if (!widgetHasDeferredData(sanitizedWidget)) {
    return sanitizedWidget;
  }

  if (sanitizedWidget.enhancementId) {
    const enhancedState = store.getEnhancedState(sanitizedWidget.enhancementId);
    const enhancedData = enhancedDataFromCachedState(sanitizedWidget, enhancedState);

    if (enhancedState && enhancedData) {
      return {
        ...sanitizedWidget,
        enhancedData,
        enhancedStateStatus: enhancedState.status || "missing",
      };
    }
  }

  return {
    ...sanitizedWidget,
    enhancedData: null,
    enhancedStateStatus: "querying",
  };
}
