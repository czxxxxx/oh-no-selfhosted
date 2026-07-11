import { buildEnhancedWidgetTemplate } from "../../src/enhancedWidgetContract.js";

function widgetsForAdapter(adapter, currentBuiltInAdapters) {
  if (adapter?.sourceType !== "built-in") {
    return adapter?.widgets || [];
  }

  return currentBuiltInAdapters.find((definition) => definition.manifest.id === adapter.id)?.widgets || adapter.widgets || [];
}

export function buildServiceEnhancedWidgetTemplates(store, currentBuiltInAdapters = []) {
  const adapters = new Map(store.listEnhancedAdapters().map((adapter) => [adapter.id, adapter]));

  return store
    .listServices()
    .map((service) => ({ enhancement: store.getServiceEnhancement(service.id), service }))
    .filter(({ enhancement }) => enhancement?.enabled)
    .flatMap(({ enhancement, service }) => {
      const adapter = adapters.get(enhancement.adapterId);

      return widgetsForAdapter(adapter, currentBuiltInAdapters).map((widget) =>
        buildEnhancedWidgetTemplate({ adapter, enhancement, service, widget }),
      );
    });
}
