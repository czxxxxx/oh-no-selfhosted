import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiActivity,
  FiBox,
  FiGrid,
  FiLink,
  FiPlus,
  FiPackage,
  FiRefreshCw,
  FiSearch,
  FiX,
  FiZap,
} from "react-icons/fi";
import { getEnhancedTemplateServiceId, isEnhancedWidgetTemplate } from "../../enhancedWidgetContract.js";
import { iconComponents, ServiceIcon } from "../../iconRegistry.jsx";
import { isPluginWidgetTemplate } from "../../pluginWidgetContract.js";
import { getDefaultWidgetStyle } from "../../widgetTemplates.js";
import { useDialogFocus } from "../useDialogFocus.js";
import { WidgetRenderer } from "./WidgetRenderer.jsx";

const WIDGET_SOURCE_TABS = [
  {
    description: "Navigation services that open in a new tab or window.",
    icon: FiGrid,
    id: "services",
    label: "Services",
  },
  {
    description: "Data sources that power widgets without a launcher URL.",
    icon: FiZap,
    id: "integrations",
    label: "Integrations",
  },
  {
    description: "Standalone widgets installed from plugin registries.",
    icon: FiPackage,
    id: "plugins",
    label: "Plugins",
  },
];

const EMPTY_INTEGRATION = {
  config: "",
  color: "#667085",
  description: "No integrations are registered.",
  iconKey: "custom",
  iconKind: "preset",
  id: "",
  name: "Integration",
  widgets: [],
};

const CUSTOM_SERVICE = {
  category: "Custom",
  color: "#667085",
  description: "Standalone card with its own URL.",
  iconKey: "custom",
  iconKind: "preset",
  id: "",
  name: "Custom URL",
  url: "",
};

const PREVIEW_COLUMN_WIDTH = 92;
const PREVIEW_ROW_HEIGHT = 92;
const PREVIEW_GRID_GAP = 18;
const PREVIEW_MAX_WIDTH = 300;
const PREVIEW_MAX_HEIGHT = 320;

function previewSizeForLayout(layout) {
  const widthUnits = Math.max(Number(layout?.w) || 4, 1);
  const heightUnits = Math.max(Number(layout?.h) || 3, 1);
  const sourceWidth = widthUnits * PREVIEW_COLUMN_WIDTH + Math.max(widthUnits - 1, 0) * PREVIEW_GRID_GAP;
  const sourceHeight = heightUnits * PREVIEW_ROW_HEIGHT + Math.max(heightUnits - 1, 0) * PREVIEW_GRID_GAP;
  const scale = Math.min(1, PREVIEW_MAX_WIDTH / sourceWidth, PREVIEW_MAX_HEIGHT / sourceHeight);

  return {
    height: Math.round(sourceHeight * scale),
    scale,
    sourceHeight,
    sourceWidth,
    width: Math.round(sourceWidth * scale),
  };
}

function handleTemplateKeyDown(event, templates, selectedTemplateId, onSelect) {
  if (templates.length === 0) {
    return;
  }

  const currentIndex = Math.max(
    0,
    templates.findIndex((template) => template.id === selectedTemplateId),
  );
  let nextIndex = currentIndex;

  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextIndex = (currentIndex + 1) % templates.length;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex = (currentIndex - 1 + templates.length) % templates.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = templates.length - 1;
  } else {
    return;
  }

  event.preventDefault();
  const nextTemplate = templates[nextIndex];
  onSelect(nextTemplate);
  requestAnimationFrame(() => {
    document.getElementById(`add-widget-template-${nextTemplate.id}`)?.focus();
  });
}

function handleSourceKeyDown(event, sourceTabs, activeSource, onSelect) {
  const currentIndex = Math.max(
    0,
    sourceTabs.findIndex((source) => source.id === activeSource),
  );
  let nextIndex = currentIndex;

  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextIndex = (currentIndex + 1) % sourceTabs.length;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex = (currentIndex - 1 + sourceTabs.length) % sourceTabs.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = sourceTabs.length - 1;
  } else {
    return;
  }

  event.preventDefault();
  const nextSource = sourceTabs[nextIndex];
  onSelect(nextSource.id);
  requestAnimationFrame(() => {
    document.getElementById(`add-widget-source-${nextSource.id}`)?.focus();
  });
}

function previewValueForField(field) {
  if (field.format === "bytesPerSecond") {
    return field.key.toLowerCase().includes("upload") ? 2.1 * 1024 * 1024 : 18.4 * 1024 * 1024;
  }

  if (field.format === "bytes") {
    return field.key.toLowerCase().includes("total") ? 6 * 1024 ** 4 : 2.4 * 1024 ** 4;
  }

  if (field.format === "percent") {
    return 40;
  }

  if (field.format === "number") {
    return 5;
  }

  return "Running";
}

function defaultConfigForTemplate(template) {
  return (template?.integration?.configFields || template?.plugin?.configFields || []).reduce((config, field) => {
    if (field.default !== undefined) {
      return { ...config, [field.key]: field.default };
    }

    return config;
  }, {});
}

function buildPreviewData(renderer) {
  if (renderer?.renderer === "codex-usage") {
    return {
      available: true,
      refreshedAt: "2026-07-04T12:00:00.000Z",
      resetCreditSummary: { availableCount: 1, totalEarnedCount: 3 },
      resetCredits: [
        { expiresAt: "2026-07-05T00:00:00.000Z", id: "preview-reset-credit", label: "Reset credit", status: "active" },
      ],
      source: "sample",
      windows: [
        {
          code: "5h",
          label: "5 hour",
          limit: 100,
          percentRemaining: 62,
          percentUsed: 38,
          remaining: 62,
          resetAt: "2026-07-04T14:00:00.000Z",
          used: 38,
        },
        {
          code: "7d",
          label: "7 day",
          limit: 400,
          percentRemaining: 78,
          percentUsed: 22,
          remaining: 312,
          resetAt: "2026-07-08T00:00:00.000Z",
          used: 88,
        },
      ],
    };
  }

  if (renderer?.renderer === "weather-current") {
    const location = renderer?.config?.location || "Shanghai";

    return {
      available: true,
      condition: "Overcast",
      feelsLike: 30.9,
      high: 30.2,
      humidity: 84,
      isDay: false,
      location: { label: location, name: location },
      low: 24.2,
      source: "sample",
      temperature: 26.7,
      units: { temperature: "°C", windSpeed: "km/h" },
      windSpeed: 11.1,
    };
  }

  return (renderer?.fields || []).reduce((data, field) => {
    return {
      ...data,
      [field.key]: previewValueForField(field),
    };
  }, {});
}

function displayTitleFor(template, service, fallbackTitle) {
  if (template?.enhanced) {
    return `${service?.name || "Service"} ${template.name}`;
  }

  return service?.name || fallbackTitle || template?.name || "Widget";
}

function selectedTemplateIcon(template) {
  if (template?.enhanced) {
    return FiActivity;
  }

  if (template?.integration) {
    return iconComponents[template.integration.iconKey] || FiZap;
  }

  if (template?.plugin) {
    return FiPackage;
  }

  if (template?.id === "compact") {
    return FiLink;
  }

  return FiBox;
}

function formatTemplateDescription(template) {
  if (template?.enhanced?.renderer === "metric-pair") {
    return "Download and upload speeds";
  }

  return template?.description || "Open this service from the dashboard.";
}

function serviceMatchesQuery(service, query) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return `${service.name} ${service.description} ${service.category}`.toLowerCase().includes(normalizedQuery);
}

function ConfigFieldControl({ field, onChange, value }) {
  if (field.type === "select") {
    return (
      <select
        aria-label={field.label}
        required={field.required}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      >
        {!field.required ? <option value="">Use default</option> : null}
        {(field.options || []).map((option) => {
          const optionValue = typeof option === "object" ? option.value : option;
          const optionLabel = typeof option === "object" ? option.label : option;

          return <option key={String(optionValue)} value={optionValue}>{optionLabel}</option>;
        })}
      </select>
    );
  }

  if (field.type === "boolean") {
    return (
      <input
        aria-label={field.label}
        checked={Boolean(value)}
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  }

  return (
    <input
      aria-label={field.label}
      required={field.required}
      type={new Set(["number", "password", "url"]).has(field.type) ? field.type : "text"}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function AddWidgetDialog({ integrationInstances = [], integrations = [], onClose, onCreate, services, templates }) {
  const [activeSource, setActiveSource] = useState("services");
  const [selectedIntegrationId, setSelectedIntegrationId] = useState("");
  const [selectedIntegrationInstanceId, setSelectedIntegrationInstanceId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("custom-card");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [serviceQuery, setServiceQuery] = useState("");
  const [title, setTitle] = useState(CUSTOM_SERVICE.name);
  const [subtitle, setSubtitle] = useState("");
  const [url, setUrl] = useState("");
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState("");
  const [integrationConfigValues, setIntegrationConfigValues] = useState({});
  const [pluginConfigValues, setPluginConfigValues] = useState({});
  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const commonTemplates = useMemo(
    () =>
      templates.filter(
        (template) => !template.systemOnly && !isEnhancedWidgetTemplate(template) && !isPluginWidgetTemplate(template),
      ),
    [templates],
  );
  const serviceCommonTemplates = useMemo(
    () => commonTemplates.filter((template) => template.id === "compact"),
    [commonTemplates],
  );
  const selectedIntegration = useMemo(
    () => integrations.find((integration) => integration.id === selectedIntegrationId) || integrations[0] || EMPTY_INTEGRATION,
    [integrations, selectedIntegrationId],
  );
  const integrationTemplates = useMemo(
    () => templates.filter((template) => template.integration?.id === selectedIntegration.id),
    [selectedIntegration.id, templates],
  );
  const selectedIntegrationInstances = useMemo(
    () => integrationInstances.filter((instance) => instance.integrationId === selectedIntegration.id),
    [integrationInstances, selectedIntegration.id],
  );
  const serviceTemplates = useMemo(
    () =>
      selectedServiceId
        ? templates.filter(
            (template) => !template.systemOnly && getEnhancedTemplateServiceId(template) === selectedServiceId,
          )
        : [],
    [selectedServiceId, templates],
  );
  const pluginTemplates = useMemo(
    () => templates.filter(isPluginWidgetTemplate),
    [templates],
  );
  const visibleTemplates = useMemo(() => {
    if (activeSource === "services") {
      return [...serviceCommonTemplates, ...serviceTemplates];
    }

    if (activeSource === "plugins") {
      return pluginTemplates;
    }

    return integrationTemplates;
  }, [activeSource, integrationTemplates, pluginTemplates, serviceCommonTemplates, serviceTemplates]);
  const selectedTemplate = visibleTemplates.find((template) => template.id === selectedTemplateId) || visibleTemplates[0];
  const selectedService = services.find((service) => service.id === selectedServiceId) || null;
  const activeService = activeSource === "services" ? selectedService : null;
  const selectedIntegrationConfig = useMemo(
    () => ({
      ...defaultConfigForTemplate(selectedTemplate),
      ...(integrationConfigValues[selectedIntegration.id] || {}),
    }),
    [integrationConfigValues, selectedIntegration.id, selectedTemplate],
  );
  const selectedPluginConfig = useMemo(
    () => ({
      ...defaultConfigForTemplate(selectedTemplate),
      ...(pluginConfigValues[selectedTemplate?.id] || {}),
    }),
    [pluginConfigValues, selectedTemplate],
  );
  const selectedRefreshInterval =
    refreshIntervalSeconds === ""
      ? selectedTemplate?.refreshIntervalSeconds ?? ""
      : Math.max(Number(refreshIntervalSeconds) || 0, 0);
  const previewLayout = selectedTemplate?.defaultLayout || { h: 3, w: 4 };
  const previewSize = useMemo(() => previewSizeForLayout(previewLayout), [previewLayout]);
  const serviceChoices = useMemo(() => [CUSTOM_SERVICE, ...services], [services]);
  const filteredServiceChoices = useMemo(
    () => serviceChoices.filter((service) => serviceMatchesQuery(service, serviceQuery)),
    [serviceChoices, serviceQuery],
  );
  const sourceTabs = useMemo(
    () =>
      WIDGET_SOURCE_TABS.map((source) => ({
        ...source,
        count:
          source.id === "services"
            ? services.length + 1
            : source.id === "integrations"
              ? integrations.length
              : pluginTemplates.length,
      })),
    [integrations.length, pluginTemplates.length, services.length],
  );
  const activeSourceConfig = sourceTabs.find((source) => source.id === activeSource) || sourceTabs[0];

  useEffect(() => {
    if (!integrations.length) {
      return;
    }

    if (integrations.some((integration) => integration.id === selectedIntegrationId)) {
      return;
    }

    setSelectedIntegrationId(integrations[0].id);
  }, [integrations, selectedIntegrationId]);

  useEffect(() => {
    if (
      selectedIntegrationInstances.some(
        (instance) => instance.id === selectedIntegrationInstanceId,
      )
    ) {
      return;
    }

    setSelectedIntegrationInstanceId(selectedIntegrationInstances[0]?.id || "");
  }, [selectedIntegrationInstanceId, selectedIntegrationInstances]);

  useEffect(() => {
    if (visibleTemplates.length === 0) {
      return;
    }

    if (visibleTemplates.some((template) => template.id === selectedTemplateId)) {
      return;
    }

    const fallbackTemplate =
      activeSource === "services"
        ? serviceTemplates[0] || serviceCommonTemplates[0] || visibleTemplates[0]
        : activeSource === "integrations"
          ? integrationTemplates[0] || visibleTemplates[0]
          : visibleTemplates[0];

    setSelectedTemplateId(fallbackTemplate.id);
    setRefreshIntervalSeconds(fallbackTemplate.refreshIntervalSeconds ?? "");

    if (activeSource === "integrations" || activeSource === "plugins") {
      setTitle(fallbackTemplate.name);
      setSubtitle(fallbackTemplate.description || "");
      setUrl("");
    }
  }, [
    activeSource,
    integrationTemplates,
    selectedTemplateId,
    serviceCommonTemplates,
    serviceTemplates,
    visibleTemplates,
  ]);

  const payload = useMemo(() => {
    const enhancedRenderer = selectedTemplate?.integration
      ? {
          dataPath: selectedTemplate.integration.dataPath || "",
          fields: selectedTemplate.integration.fields || [],
          iconKey: selectedTemplate.integration.iconKey || selectedIntegration.iconKey,
          iconKind: selectedTemplate.integration.iconKind || selectedIntegration.iconKind,
          color: selectedTemplate.integration.color || selectedIntegration.color,
          config: selectedIntegrationConfig,
          renderer: selectedTemplate.integration.renderer,
        }
      : selectedTemplate?.enhanced
        ? {
            dataPath: selectedTemplate.enhanced.dataPath,
            fields: selectedTemplate.enhanced.fields,
            renderer: selectedTemplate.enhanced.renderer,
          }
        : selectedTemplate?.plugin
          ? {
              config: selectedPluginConfig,
              fields: [],
              renderer: selectedTemplate.plugin.renderer,
            }
          : null;

    return {
      enhancedData: enhancedRenderer ? buildPreviewData(enhancedRenderer) : null,
      enhancedRenderer,
      enhancedWidgetId: selectedTemplate?.enhanced?.widgetId || null,
      enhancementId: selectedTemplate?.enhanced?.enhancementId || null,
      h: selectedTemplate?.defaultLayout?.h || 3,
      integrationId: activeSource === "integrations" ? selectedTemplate?.integration?.id || selectedIntegration.id : null,
      integrationInstanceId:
        activeSource === "integrations" ? selectedIntegrationInstanceId || null : null,
      integrationInstanceName:
        activeSource === "integrations" && !selectedIntegrationInstanceId
          ? `${title || selectedIntegration.name} connection`
          : undefined,
      minH: selectedTemplate?.minLayout?.h || 1,
      minW: selectedTemplate?.minLayout?.w || 1,
      refreshIntervalSeconds: selectedRefreshInterval === "" ? null : selectedRefreshInterval,
      pluginId: activeSource === "plugins" ? selectedTemplate?.plugin?.id || null : null,
      serviceId:
        activeSource === "services" ? selectedTemplate?.enhanced?.serviceId || activeService?.id || null : null,
      style: {
        ...getDefaultWidgetStyle(selectedTemplate?.id),
        ...(selectedTemplate?.defaultStyle || {}),
      },
      subtitle:
        activeSource === "integrations" || activeSource === "plugins"
          ? subtitle || selectedTemplate?.description || selectedIntegration.description
          : activeService?.description || subtitle || selectedTemplate?.description || "",
      templateId: selectedTemplate?.id || selectedTemplateId,
      title:
        activeSource === "integrations" || activeSource === "plugins"
          ? title || selectedTemplate?.name || selectedIntegration.name
          : displayTitleFor(selectedTemplate, activeService, title),
      url: activeService?.url || (["integrations", "plugins"].includes(activeSource) ? "" : url),
      w: selectedTemplate?.defaultLayout?.w || 4,
    };
  },
    [
      activeService,
      activeSource,
      selectedIntegration.color,
      selectedIntegration.description,
      selectedIntegration.iconKey,
      selectedIntegration.iconKind,
      selectedIntegration.id,
      selectedIntegration.name,
      selectedIntegrationInstanceId,
      selectedIntegrationConfig,
      selectedPluginConfig,
      selectedRefreshInterval,
      selectedTemplate,
      selectedTemplateId,
      subtitle,
      title,
      url,
    ],
  );
  const previewWidget = useMemo(
    () => ({
      ...payload,
      enhancedData: payload.enhancedRenderer ? buildPreviewData(payload.enhancedRenderer) : {},
      enhancedStateStatus: payload.enhancedRenderer ? "ok" : null,
      id: "add-widget-preview",
      minH: selectedTemplate?.minLayout?.h || 1,
      minW: selectedTemplate?.minLayout?.w || 1,
      scopedCss: "",
      style: {
        ...getDefaultWidgetStyle(selectedTemplate?.id),
        accentColor: activeService?.color || selectedTemplate?.defaultStyle?.accentColor || "#2f80d1",
        backgroundOpacity: 0.76,
        radius: 20,
      },
      zIndex: 1,
    }),
    [activeService, payload, selectedTemplate],
  );

  function selectTemplate(template) {
    setSelectedTemplateId(template.id);
    setRefreshIntervalSeconds(template.refreshIntervalSeconds ?? "");

    if (template.enhanced) {
      setTitle(displayTitleFor(template, selectedService, title));
      setSubtitle(selectedService?.description || "");
      return;
    }

    if (activeSource === "integrations" || activeSource === "plugins") {
      setTitle(template.name);
      setSubtitle(template.description || "");
      setUrl("");
    }
  }

  function selectIntegration(integrationId) {
    const nextIntegration = integrations.find((integration) => integration.id === integrationId) || integrations[0] || EMPTY_INTEGRATION;
    const nextTemplate = templates.find((template) => template.integration?.id === nextIntegration.id);

    setSelectedIntegrationId(nextIntegration.id);
    setSelectedIntegrationInstanceId(
      integrationInstances.find((instance) => instance.integrationId === nextIntegration.id)?.id || "",
    );
    setIntegrationConfigValues((currentValues) => ({
      ...currentValues,
      [nextIntegration.id]: {
        ...defaultConfigForTemplate(nextTemplate),
        ...(currentValues[nextIntegration.id] || {}),
      },
    }));

    if (nextTemplate) {
      setSelectedTemplateId(nextTemplate.id);
      setRefreshIntervalSeconds(nextTemplate.refreshIntervalSeconds ?? "");
      setTitle(nextTemplate.name);
      setSubtitle(nextTemplate.description || nextIntegration.description);
      setUrl("");
    }
  }

  function selectService(serviceId) {
    const nextService = services.find((service) => service.id === serviceId) || null;
    const nextServiceTemplates = serviceId
      ? templates.filter((template) => !template.systemOnly && getEnhancedTemplateServiceId(template) === serviceId)
      : [];
    const fallbackTemplate =
      nextServiceTemplates[0] ||
      serviceCommonTemplates.find((template) => template.id === selectedTemplateId) ||
      serviceCommonTemplates[0];

    setSelectedServiceId(serviceId);
    setSelectedTemplateId(fallbackTemplate?.id || selectedTemplateId);
    setRefreshIntervalSeconds(fallbackTemplate?.refreshIntervalSeconds ?? "");

    if (nextService) {
      setTitle(displayTitleFor(fallbackTemplate, nextService, nextService.name));
      setSubtitle(nextService.description || "");
      setUrl(nextService.url || "");
    } else {
      setTitle(CUSTOM_SERVICE.name);
      setSubtitle("");
      setUrl("");
    }
  }

  function selectSource(sourceId) {
    setActiveSource(sourceId);

    if (sourceId === "integrations") {
      const fallbackTemplate =
        integrationTemplates.find((template) => template.id === selectedTemplateId) || integrationTemplates[0];

      if (fallbackTemplate) {
        setSelectedTemplateId(fallbackTemplate.id);
        setRefreshIntervalSeconds(fallbackTemplate.refreshIntervalSeconds ?? "");
        setTitle(fallbackTemplate.name);
        setSubtitle(fallbackTemplate.description || selectedIntegration.description || "");
        setUrl("");
      }
    } else if (sourceId === "services") {
      const fallbackTemplate =
        (selectedServiceId ? serviceTemplates[0] : null) ||
        serviceCommonTemplates.find((template) => template.id === selectedTemplateId) ||
        serviceCommonTemplates[0];

      if (fallbackTemplate) {
        setSelectedTemplateId(fallbackTemplate.id);
        setRefreshIntervalSeconds(fallbackTemplate.refreshIntervalSeconds ?? "");
      }
    } else if (sourceId === "plugins") {
      const fallbackTemplate =
        pluginTemplates.find((template) => template.id === selectedTemplateId) || pluginTemplates[0];

      if (fallbackTemplate) {
        setSelectedTemplateId(fallbackTemplate.id);
        setRefreshIntervalSeconds("");
        setTitle(fallbackTemplate.name);
        setSubtitle(fallbackTemplate.description || "");
        setUrl("");
      }
    }
  }

  function updateIntegrationConfigValue(fieldKey, value) {
    setIntegrationConfigValues((currentValues) => ({
      ...currentValues,
      [selectedIntegration.id]: {
        ...defaultConfigForTemplate(selectedTemplate),
        ...(currentValues[selectedIntegration.id] || {}),
        [fieldKey]: value,
      },
    }));
  }

  function updatePluginConfigValue(fieldKey, value) {
    setPluginConfigValues((currentValues) => ({
      ...currentValues,
      [selectedTemplate.id]: {
        ...defaultConfigForTemplate(selectedTemplate),
        ...(currentValues[selectedTemplate.id] || {}),
        [fieldKey]: value,
      },
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    await onCreate(payload);
    onClose();
  }

  useDialogFocus(dialogRef, { initialFocusRef: titleRef, onClose });

  return (
    <div className="add-widget-layer">
      <section
        aria-labelledby="add-widget-title"
        aria-modal="true"
        className="add-widget-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="add-service-header add-widget-header">
          <h2 id="add-widget-title" ref={titleRef} tabIndex={-1}>
            <FiPlus aria-hidden="true" />
            Add Widget
          </h2>
          <button aria-label="Close Add Widget" className="icon-button close-button" type="button" onClick={onClose}>
            <FiX aria-hidden="true" />
          </button>
        </header>

        <div aria-label="Widget source" className="add-widget-source-tabs" role="tablist">
          {sourceTabs.map((source) => {
            const SourceIcon = source.icon;
            const isSelected = source.id === activeSource;

            return (
              <button
                aria-controls={`add-widget-panel-${source.id}`}
                aria-label={source.label}
                aria-selected={isSelected ? "true" : "false"}
                className={isSelected ? "add-widget-source-tab is-selected" : "add-widget-source-tab"}
                id={`add-widget-source-${source.id}`}
                key={source.id}
                role="tab"
                tabIndex={isSelected ? 0 : -1}
                type="button"
                onClick={() => selectSource(source.id)}
                onKeyDown={(event) => handleSourceKeyDown(event, sourceTabs, activeSource, selectSource)}
              >
                <SourceIcon aria-hidden="true" />
                <span>{source.label}</span>
              </button>
            );
          })}
        </div>

        <form className={`add-widget-body add-widget-body-${activeSource}`} onSubmit={handleSubmit}>
          {activeSource === "integrations" ? (
            <>
              <section
                aria-labelledby="add-widget-source-integrations"
                className="widget-picker-column widget-integration-column"
                id="add-widget-panel-integrations"
                role="tabpanel"
              >
                <header className="add-widget-step-header">
                  <strong>1. Choose an integration</strong>
                  <small>{activeSourceConfig.description}</small>
                </header>

                <div aria-label="Integration sources" className="integration-source-list">
                  {integrations.map((integration) => {
                    const IntegrationIcon = iconComponents[integration.iconKey] || FiZap;
                    const isSelected = integration.id === selectedIntegration.id;

                    return (
                      <button
                        aria-pressed={isSelected ? "true" : "false"}
                        aria-label={integration.name}
                        className={isSelected ? "integration-source-card is-selected" : "integration-source-card"}
                        key={integration.id}
                        type="button"
                        onClick={() => selectIntegration(integration.id)}
                      >
                        <span className="integration-source-icon" aria-hidden="true">
                          <IntegrationIcon />
                        </span>
                        <span>
                          <strong>{integration.name}</strong>
                          <small>{integration.description}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section aria-label="Widget style and configuration" className="widget-picker-column widget-style-column">
                <header className="add-widget-step-header">
                  <strong>2. Choose card type</strong>
                  <small>{selectedIntegration.widgets.join(", ")}</small>
                </header>

                <section aria-label="Widget templates" className="widget-template-list" role="radiogroup">
                  {visibleTemplates.map((template) => {
                    const isSelected = template.id === selectedTemplateId;
                    const TemplateIcon = selectedTemplateIcon(template);

                    return (
                      <button
                        aria-checked={isSelected ? "true" : "false"}
                        aria-label={template.name}
                        className={isSelected ? "is-selected" : ""}
                        id={`add-widget-template-${template.id}`}
                        key={template.id}
                        role="radio"
                        tabIndex={isSelected ? 0 : -1}
                        type="button"
                        onClick={() => selectTemplate(template)}
                        onKeyDown={(event) =>
                          handleTemplateKeyDown(event, visibleTemplates, selectedTemplateId, selectTemplate)
                        }
                      >
                        <span className="widget-template-icon" aria-hidden="true">
                          <TemplateIcon />
                        </span>
                        <span>
                          <strong>{template.name}</strong>
                          <small>{template.description || selectedIntegration.description}</small>
                        </span>
                      </button>
                    );
                  })}
                </section>
              </section>

              <section className="widget-config-column" aria-label="Widget configuration">
                <header className="add-widget-step-header">
                  <strong>3. Configure</strong>
                  <small>Set the label and refresh behavior.</small>
                </header>

                <section className="widget-config-panel" aria-label="Widget fields">
                  <h3>Widget configuration</h3>
                  <label className="field">
                    <span>Widget Title</span>
                    <input aria-label="Widget title" value={title} onChange={(event) => setTitle(event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Subtitle</span>
                    <input aria-label="Subtitle" value={subtitle} onChange={(event) => setSubtitle(event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Connection</span>
                    <select
                      aria-label="Integration connection"
                      value={selectedIntegrationInstanceId}
                      onChange={(event) => setSelectedIntegrationInstanceId(event.target.value)}
                    >
                      <option value="">Create a new connection</option>
                      {selectedIntegrationInstances.map((instance) => (
                        <option key={instance.id} value={instance.id}>
                          {instance.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!selectedIntegrationInstanceId
                    ? (selectedTemplate?.integration?.configFields || []).map((field) => (
                    <label className="field" key={field.key}>
                      <span>{field.label}</span>
                      <ConfigFieldControl
                        field={field}
                        value={selectedIntegrationConfig[field.key]}
                        onChange={(value) => updateIntegrationConfigValue(field.key, value)}
                      />
                      {field.helpText ? <small className="field-help">{field.helpText}</small> : null}
                    </label>
                      ))
                    : null}
                  {selectedIntegrationInstanceId ? (
                    <p className="inspector-help-text">
                      This widget will reuse the saved connection and its cached state.
                    </p>
                  ) : null}
                  <label className="field">
                    <span>Refresh interval</span>
                    <input
                      aria-label="Widget refresh interval"
                      min="0"
                      step="1"
                      type="number"
                      value={selectedRefreshInterval}
                      onChange={(event) => setRefreshIntervalSeconds(event.target.value)}
                    />
                  </label>
                  <p className="inspector-help-text">{selectedIntegration.config}.</p>
                </section>
              </section>

              <section aria-label="Widget preview" className="add-widget-preview-column" role="region">
                <header className="add-widget-step-header">
                  <strong>4. Preview</strong>
                  <small>Current widget appearance.</small>
                </header>
                <div className="add-widget-preview-stage">
                  {selectedTemplate ? (
                    <div
                      className="add-widget-preview-frame"
                      style={{
                        "--preview-height": `${previewSize.height}px`,
                        "--preview-h": previewLayout.h,
                        "--preview-scale": previewSize.scale,
                        "--preview-source-height": `${previewSize.sourceHeight}px`,
                        "--preview-source-width": `${previewSize.sourceWidth}px`,
                        "--preview-width": `${previewSize.width}px`,
                        "--preview-w": previewLayout.w,
                      }}
                    >
                      <div className="add-widget-preview-scaler">
                        <WidgetRenderer mode="preview" service={null} template={selectedTemplate} widget={previewWidget} />
                        <button aria-label="Preview refresh" className="widget-refresh-control" disabled type="button">
                          <FiRefreshCw aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="integration-empty">Choose a widget style to preview it.</p>
                  )}
                </div>
                <footer className="add-widget-actions">
                  <button className="secondary-button" type="button" onClick={onClose}>
                    Cancel
                  </button>
                  <button className="primary-button" type="submit">
                    Add Widget
                  </button>
                </footer>
              </section>
            </>
          ) : (
            <>
              {activeSource === "services" ? (
                <section
                  aria-labelledby="add-widget-source-services"
                  className="widget-service-column"
                  id="add-widget-panel-services"
                  role="tabpanel"
                >
                  <header className="add-widget-step-header">
                    <strong>1. Choose a service</strong>
                    <small>Pick what this widget belongs to.</small>
                  </header>

                  <label className="widget-service-search">
                    <FiSearch aria-hidden="true" />
                    <input
                      aria-label="Search services"
                      type="search"
                      value={serviceQuery}
                      placeholder="Search services..."
                      onChange={(event) => setServiceQuery(event.target.value)}
                    />
                  </label>

                  <div aria-label="Services" className="widget-service-list">
                    {filteredServiceChoices.map((service) => {
                      const isSelected = service.id === selectedServiceId;

                      return (
                        <button
                          aria-label={`Select service ${service.name}`}
                          aria-pressed={isSelected ? "true" : "false"}
                          className={isSelected ? "widget-service-choice is-selected" : "widget-service-choice"}
                          key={service.id || "custom-service"}
                          type="button"
                          onClick={() => selectService(service.id)}
                        >
                          <ServiceIcon service={service} />
                          <span>
                            <strong>{service.name}</strong>
                            <small>{service.description || service.category}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <section
                aria-label={activeSource === "services" ? "Widget style and configuration" : undefined}
                className="widget-picker-column widget-style-column"
              >
                <header className="add-widget-step-header">
                  <strong>{activeSource === "services" ? "2. Choose card type" : "1. Choose card type"}</strong>
                  <small>{activeSourceConfig.description}</small>
                </header>

                <section aria-label="Widget templates" className="widget-template-list" role="radiogroup">
                  {visibleTemplates.map((template) => {
                    const isSelected = template.id === selectedTemplateId;
                    const TemplateIcon = selectedTemplateIcon(template);

                    return (
                      <button
                        aria-checked={isSelected ? "true" : "false"}
                        aria-label={template.name}
                        className={isSelected ? "is-selected" : ""}
                        id={`add-widget-template-${template.id}`}
                        key={template.id}
                        role="radio"
                        tabIndex={isSelected ? 0 : -1}
                        type="button"
                        onClick={() => selectTemplate(template)}
                        onKeyDown={(event) =>
                          handleTemplateKeyDown(event, visibleTemplates, selectedTemplateId, selectTemplate)
                        }
                      >
                        <span className="widget-template-icon" aria-hidden="true">
                          <TemplateIcon />
                        </span>
                        <span>
                          <strong>{template.name}</strong>
                          <small>{formatTemplateDescription(template)}</small>
                        </span>
                      </button>
                    );
                  })}
                </section>
              </section>

              <section className="widget-config-column" aria-label="Widget configuration">
                <header className="add-widget-step-header">
                  <strong>{activeSource === "services" ? "3. Configure" : "2. Configure"}</strong>
                  <small>
                    {payload.enhancedRenderer
                      ? "Set the label and data refresh behavior."
                      : activeService
                        ? "Set the label while using the service URL."
                        : "Set the title and widget details."}
                  </small>
                </header>

                <section className="widget-config-panel" aria-label="Widget fields">
                  <h3>Widget configuration</h3>
                  <label className="field">
                    <span>Widget Title</span>
                    <input aria-label="Widget title" value={title} onChange={(event) => setTitle(event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Subtitle</span>
                    <input aria-label="Subtitle" value={subtitle} onChange={(event) => setSubtitle(event.target.value)} />
                  </label>
                  {activeSource === "plugins"
                    ? (selectedTemplate?.plugin?.configFields || []).map((field) => (
                        <label className="field" key={field.key}>
                          <span>{field.label}</span>
                          <ConfigFieldControl
                            field={field}
                            value={selectedPluginConfig[field.key]}
                            onChange={(value) => updatePluginConfigValue(field.key, value)}
                          />
                          {field.helpText ? <small className="field-help">{field.helpText}</small> : null}
                        </label>
                      ))
                    : null}
                  {!activeService && activeSource === "services" ? (
                    <label className="field">
                      <span>Widget URL</span>
                      <input aria-label="Widget URL" value={url} onChange={(event) => setUrl(event.target.value)} />
                    </label>
                  ) : null}
                  {payload.enhancedRenderer && activeSource !== "plugins" ? (
                    <label className="field">
                      <span>Refresh interval</span>
                      <input
                        aria-label="Widget refresh interval"
                        min="0"
                        step="1"
                        type="number"
                        value={selectedRefreshInterval}
                        onChange={(event) => setRefreshIntervalSeconds(event.target.value)}
                      />
                    </label>
                  ) : null}
                  {activeService ? (
                    <p className="inspector-help-text">Uses {activeService.name}'s service URL.</p>
                  ) : null}
                </section>
              </section>

              <section aria-label="Widget preview" className="add-widget-preview-column" role="region">
                <header className="add-widget-step-header">
                  <strong>{activeSource === "services" ? "4. Preview" : "3. Preview"}</strong>
                  <small>Current widget appearance.</small>
                </header>
                <div className="add-widget-preview-stage">
                  {selectedTemplate ? (
                    <div
                      className="add-widget-preview-frame"
                      style={{
                        "--preview-height": `${previewSize.height}px`,
                        "--preview-h": previewLayout.h,
                        "--preview-scale": previewSize.scale,
                        "--preview-source-height": `${previewSize.sourceHeight}px`,
                        "--preview-source-width": `${previewSize.sourceWidth}px`,
                        "--preview-width": `${previewSize.width}px`,
                        "--preview-w": previewLayout.w,
                      }}
                    >
                      <div className="add-widget-preview-scaler">
                        <WidgetRenderer
                          mode="preview"
                          service={activeService}
                          template={selectedTemplate}
                          widget={previewWidget}
                        />
                        {payload.enhancedRenderer && activeSource !== "plugins" ? (
                          <button aria-label="Preview refresh" className="widget-refresh-control" disabled type="button">
                            <FiRefreshCw aria-hidden="true" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <p className="integration-empty">Choose a widget style to preview it.</p>
                  )}
                </div>
                <footer className="add-widget-actions">
                  <button className="secondary-button" type="button" onClick={onClose}>
                    Cancel
                  </button>
                  <button className="primary-button" type="submit">
                    Add Widget
                  </button>
                </footer>
              </section>
            </>
          )}
        </form>
      </section>
    </div>
  );
}
