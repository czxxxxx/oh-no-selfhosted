import { isEnhancedTemplateId } from "./enhancedWidgetContract.js";
import { isPluginWidgetTemplateId } from "./pluginWidgetContract.js";

export const WIDGET_GRID_COLUMNS = 12;

const COLOR_FALLBACK = "#2f80d1";
const DENSITIES = new Set(["compact", "comfortable", "relaxed"]);
const VISUALS = new Set(["glass", "photo"]);

const STYLE_CONTROLS = [
  "accentColor",
  "backgroundOpacity",
  "radius",
  "density",
  "visual",
  "showStatus",
  "showCategory",
  "showDescription",
];
const INTEGRATION_TEMPLATE_PREFIX = "integration:";

export const BASE_WIDGET_TEMPLATES = [
  {
    id: "compact",
    name: "Compact",
    description: "Small launch card for one service.",
    defaultLayout: { h: 1, w: 3 },
    minLayout: { h: 1, w: 2 },
    defaultStyle: {
      accentColor: COLOR_FALLBACK,
      backgroundOpacity: 0.72,
      density: "compact",
      radius: 18,
      visual: "glass",
      showCategory: false,
      showDescription: false,
      showStatus: false,
    },
    supportedStyleControls: STYLE_CONTROLS,
  },
  {
    id: "wide",
    name: "Wide",
    description: "Horizontal card with status and description.",
    defaultLayout: { h: 2, w: 4 },
    minLayout: { h: 2, w: 3 },
    defaultStyle: {
      accentColor: COLOR_FALLBACK,
      backgroundOpacity: 0.76,
      density: "comfortable",
      radius: 20,
      visual: "glass",
      showCategory: true,
      showDescription: true,
      showStatus: true,
    },
    supportedStyleControls: STYLE_CONTROLS,
  },
  {
    id: "hero",
    name: "Hero",
    description: "Large visual widget for a primary service or group.",
    defaultLayout: { h: 4, w: 6 },
    minLayout: { h: 3, w: 4 },
    defaultStyle: {
      accentColor: COLOR_FALLBACK,
      backgroundOpacity: 0.62,
      density: "relaxed",
      radius: 24,
      visual: "photo",
      showCategory: true,
      showDescription: true,
      showStatus: true,
    },
    supportedStyleControls: STYLE_CONTROLS,
  },
  {
    id: "custom-card",
    name: "Custom Card",
    description: "Flexible large card with editable title, subtitle, URL, and style.",
    defaultLayout: { h: 5, w: 8 },
    minLayout: { h: 2, w: 2 },
    defaultStyle: {
      accentColor: COLOR_FALLBACK,
      backgroundOpacity: 0.8,
      density: "comfortable",
      radius: 22,
      visual: "glass",
      showCategory: true,
      showDescription: true,
      showStatus: true,
    },
    supportedStyleControls: STYLE_CONTROLS,
  },
  {
    id: "download-stats",
    name: "Download Stats",
    description: "Downloader status card with speed and peer counts.",
    defaultLayout: { h: 2, w: 3 },
    minLayout: { h: 2, w: 3 },
    systemOnly: true,
    defaultStyle: {
      accentColor: COLOR_FALLBACK,
      backgroundOpacity: 0.78,
      density: "comfortable",
      radius: 18,
      visual: "glass",
      showCategory: true,
      showDescription: true,
      showStatus: true,
    },
    supportedStyleControls: STYLE_CONTROLS,
  },
  {
    id: "media-queue",
    name: "Media Queue",
    description: "Large media card with progress and recently added items.",
    defaultLayout: { h: 4, w: 3 },
    minLayout: { h: 3, w: 3 },
    systemOnly: true,
    defaultStyle: {
      accentColor: "#7e5bef",
      backgroundOpacity: 0.72,
      density: "comfortable",
      radius: 18,
      visual: "glass",
      showCategory: true,
      showDescription: true,
      showStatus: true,
    },
    supportedStyleControls: STYLE_CONTROLS,
  },
  {
    id: "storage-trend",
    name: "Storage Trend",
    description: "Storage capacity card with a compact trend chart.",
    defaultLayout: { h: 3, w: 3 },
    minLayout: { h: 2, w: 3 },
    systemOnly: true,
    defaultStyle: {
      accentColor: "#4eaf6d",
      backgroundOpacity: 0.74,
      density: "comfortable",
      radius: 18,
      visual: "glass",
      showCategory: true,
      showDescription: true,
      showStatus: true,
    },
    supportedStyleControls: STYLE_CONTROLS,
  },
  {
    id: "uptime-list",
    name: "Uptime List",
    description: "Service uptime list for daily checks.",
    defaultLayout: { h: 3, w: 3 },
    minLayout: { h: 3, w: 3 },
    systemOnly: true,
    defaultStyle: {
      accentColor: "#4eaf6d",
      backgroundOpacity: 0.74,
      density: "comfortable",
      radius: 18,
      visual: "glass",
      showCategory: true,
      showDescription: true,
      showStatus: true,
    },
    supportedStyleControls: STYLE_CONTROLS,
  },
  {
    id: "quick-actions",
    name: "Quick Actions",
    description: "Shortcut row for common homelab actions.",
    defaultLayout: { h: 2, w: 5 },
    minLayout: { h: 2, w: 4 },
    nativeOnly: true,
    systemOnly: true,
    defaultStyle: {
      accentColor: "#17202b",
      backgroundOpacity: 0.7,
      density: "comfortable",
      radius: 18,
      visual: "glass",
      showCategory: true,
      showDescription: true,
      showStatus: true,
    },
    supportedStyleControls: STYLE_CONTROLS,
  },
];

export const WIDGET_TEMPLATES = [...BASE_WIDGET_TEMPLATES];

export function isIntegrationTemplateId(templateId) {
  return typeof templateId === "string" && templateId.startsWith(INTEGRATION_TEMPLATE_PREFIX);
}

export function getWidgetTemplate(templateId) {
  if (isEnhancedTemplateId(templateId)) {
    const wideTemplate = BASE_WIDGET_TEMPLATES.find((template) => template.id === "wide");

    return {
      defaultLayout: { h: 2, w: 3 },
      defaultStyle: { ...wideTemplate.defaultStyle },
      description: "Enhanced widget",
      id: templateId,
      minLayout: { h: 2, w: 2 },
      name: "Enhanced",
      supportedStyleControls: STYLE_CONTROLS,
    };
  }

  if (isIntegrationTemplateId(templateId)) {
    const wideTemplate = BASE_WIDGET_TEMPLATES.find((template) => template.id === "wide");

    return (
      WIDGET_TEMPLATES.find((template) => template.id === templateId) || {
        defaultLayout: { h: 3, w: 4 },
        defaultStyle: { ...wideTemplate.defaultStyle },
        description: "Integration widget",
        id: templateId,
        integration: {
          dataPath: "",
          fields: [],
          id: null,
          renderer: "metric-list",
        },
        minLayout: { h: 2, w: 2 },
        name: "Integration",
        supportedStyleControls: STYLE_CONTROLS,
      }
    );
  }

  if (isPluginWidgetTemplateId(templateId)) {
    const wideTemplate = BASE_WIDGET_TEMPLATES.find((template) => template.id === "wide");

    return {
      defaultLayout: { h: 2, w: 3 },
      defaultStyle: { ...wideTemplate.defaultStyle },
      description: "Unavailable plugin widget",
      id: templateId,
      minLayout: { h: 1, w: 2 },
      name: "Plugin Widget",
      supportedStyleControls: STYLE_CONTROLS,
    };
  }

  return WIDGET_TEMPLATES.find((template) => template.id === templateId);
}

export function getDefaultWidgetStyle(templateId, templateOverride = null) {
  const fallbackTemplate =
    isEnhancedTemplateId(templateId) || isIntegrationTemplateId(templateId) || isPluginWidgetTemplateId(templateId)
    ? BASE_WIDGET_TEMPLATES.find((template) => template.id === "wide")
    : BASE_WIDGET_TEMPLATES.find((template) => template.id === "compact");
  const template = templateOverride || getWidgetTemplate(templateId) || fallbackTemplate;

  return { ...fallbackTemplate.defaultStyle, ...(template.defaultStyle || {}) };
}

function normalizeColor(value, fallback) {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}

export function normalizeWidgetStyle(templateId, style = {}, templateOverride = null) {
  const defaults = getDefaultWidgetStyle(templateId, templateOverride);
  const density = DENSITIES.has(style.density) ? style.density : defaults.density;

  return {
    accentColor: normalizeColor(style.accentColor, defaults.accentColor),
    backgroundOpacity: clampNumber(style.backgroundOpacity, 0.18, 1, defaults.backgroundOpacity),
    density,
    radius: Math.round(clampNumber(style.radius, 8, 32, defaults.radius)),
    visual: VISUALS.has(style.visual) ? style.visual : defaults.visual,
    showCategory: typeof style.showCategory === "boolean" ? style.showCategory : defaults.showCategory,
    showDescription:
      typeof style.showDescription === "boolean" ? style.showDescription : defaults.showDescription,
    showStatus: density === "compact"
      ? false
      : typeof style.showStatus === "boolean"
        ? style.showStatus
        : defaults.showStatus,
  };
}
