import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  FiGrid,
  FiMoon,
  FiSearch,
  FiSettings,
  FiSun,
  FiWifi,
} from "react-icons/fi";
import {
  createServiceRequest,
  createWidgetRequest,
  deleteBackgroundRequest,
  deleteWidgetRequest,
  loadDashboardData,
  refreshIntegrationInstanceRequest,
  refreshIntegrationWidgetRequest,
  refreshServiceEnhancementRequest,
  saveDockOrderRequest,
  saveWidgetsRequest,
  uploadBackgroundRequest,
  updateWidgetRequest,
} from "./apiClient.js";
import { ShuffleText } from "./components/text/ShuffleText.jsx";
import { Launchpad } from "./components/dashboard/Launchpad.jsx";
import { WidgetCanvas } from "./components/widgets/WidgetCanvas.jsx";
import { WidgetInspector } from "./components/widgets/WidgetInspector.jsx";
import { ServiceIcon } from "./iconRegistry.jsx";
import { SERVICE_TYPES } from "./serviceCatalog.js";
import { findAvailableWidgetPosition, normalizeLoadedWidgets } from "./widgetLayout.js";
import { getDefaultWidgetStyle } from "./widgetTemplates.js";

const Lightfall = lazy(() =>
  import("./components/backgrounds/Lightfall.jsx").then((module) => ({ default: module.Lightfall })),
);
const ShapeGrid = lazy(() =>
  import("./components/backgrounds/ShapeGrid.jsx").then((module) => ({ default: module.ShapeGrid })),
);
const AddWidgetDialog = lazy(() =>
  import("./components/widgets/AddWidgetDialog.jsx").then((module) => ({ default: module.AddWidgetDialog })),
);
const AppSettingsDialog = lazy(() =>
  import("./components/dashboard/AppSettingsDialog.jsx").then((module) => ({
    default: module.AppSettingsDialog,
  })),
);
const ServiceSettingsDialog = lazy(() =>
  import("./components/enhanced/ServiceSettingsDialog.jsx").then((module) => ({
    default: module.ServiceSettingsDialog,
  })),
);

const launcherUtilityItems = [{ id: "settings", label: "Settings", icon: FiSettings }];

const BACKGROUND_STORAGE_KEY = "oh-no-selfhosted-background";
const THEME_STORAGE_KEY = "oh-no-selfhosted-theme";
const DEFAULT_BACKGROUND_ID = "alpine-lake";
const DEFAULT_THEME = "light";
const LIGHTFALL_BACKGROUND_ID = "lightfall";
const SHAPE_GRID_BACKGROUND_ID = "shape-grid";
const CUSTOM_BACKGROUND_ID_PATTERN = /^custom-[a-f0-9]{64}$/;
const LIGHTFALL_COLORS = ["#d7efff", "#80c7ff", "#ffbde3", "#a8e96f"];
const LIGHTFALL_DARK_COLORS = ["#a6c8ff", "#67e8f9", "#ff9ffc", "#f4bd63"];
const DOCK_DISTANCE = 240;
const DOCK_BASE_ITEM_SIZE = 54;
const DOCK_MAX_SCALE = 1.72;
const SCENIC_BACKGROUND =
  "radial-gradient(circle at 22% 16%, rgba(255,255,255,.88), transparent 28%), radial-gradient(circle at 72% 38%, rgba(108,140,151,.5), transparent 32%), linear-gradient(155deg, #dfe9e8 0%, #b7c8c4 35%, #718b85 62%, #263b3a 100%)";
const BACKGROUND_PRESETS = [
  {
    id: "alpine-lake",
    name: "Alpine Lake",
    description: "Original glass dashboard scene",
    background: SCENIC_BACKGROUND,
    swatch: SCENIC_BACKGROUND,
  },
  {
    id: "night-server",
    name: "Night Server",
    description: "Quiet dark rack room glow",
    background:
      "linear-gradient(180deg, rgba(238, 247, 255, 0.2), rgba(10, 16, 24, 0.44)), linear-gradient(135deg, #102137 0%, #1a2f34 38%, #2e3c42 62%, #6c5847 100%)",
    swatch: "linear-gradient(135deg, #102137 0%, #1a2f34 42%, #6c5847 100%)",
  },
  {
    id: "morning-lab",
    name: "Morning Lab",
    description: "Soft warm workspace light",
    background:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.36), rgba(55, 65, 81, 0.16)), linear-gradient(135deg, #d8edf3 0%, #e8dac4 42%, #9fb6a8 100%)",
    swatch: "linear-gradient(135deg, #d8edf3 0%, #e8dac4 48%, #9fb6a8 100%)",
  },
  {
    id: LIGHTFALL_BACKGROUND_ID,
    name: "Lightfall",
    description: "Soft animated service lights",
    background:
      "linear-gradient(180deg, rgba(236, 247, 255, 0.82), rgba(186, 204, 219, 0.32)), linear-gradient(135deg, #dbefff 0%, #96bfe4 38%, #18273a 100%)",
    swatch:
      "radial-gradient(circle at 25% 12%, rgba(255, 255, 255, 0.94), transparent 24%), linear-gradient(135deg, #d7efff 0%, #80c7ff 36%, #ffbde3 66%, #17202b 100%)",
  },
  {
    id: SHAPE_GRID_BACKGROUND_ID,
    name: "Shape Grid",
    description: "Animated geometric service mesh",
    background:
      "linear-gradient(180deg, #f3f9fb 0%, #d9e9ee 52%, #aebdc2 100%)",
    swatch:
      "linear-gradient(135deg, rgba(15, 23, 42, 0.16) 0 1px, transparent 1px 14px), linear-gradient(135deg, #f3f9fb 0%, #d7e6ec 44%, #8da2aa 100%)",
  },
];

const REALTIME_ENHANCED_WIDGET_IDS = new Set(["transfer-speed"]);
const DEFAULT_REALTIME_REFRESH_INTERVAL_SECONDS = 5;

function getBackgroundPreset(backgroundId, backgroundPresets = BACKGROUND_PRESETS) {
  return backgroundPresets.find((preset) => preset.id === backgroundId) || backgroundPresets[0] || BACKGROUND_PRESETS[0];
}

function customBackgroundPreset(background) {
  const imageBackground = `url("${background.imageUrl}") center / cover no-repeat`;

  return {
    ...background,
    background: `linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(24, 31, 39, 0.18)), ${imageBackground}`,
    custom: true,
    description: "Uploaded image",
    swatch: imageBackground,
  };
}

function getInitialBackgroundId() {
  if (typeof window === "undefined") {
    return DEFAULT_BACKGROUND_ID;
  }

  try {
    const storedBackgroundId = window.localStorage.getItem(BACKGROUND_STORAGE_KEY);

    if (BACKGROUND_PRESETS.some((preset) => preset.id === storedBackgroundId)) {
      return storedBackgroundId;
    }

    return CUSTOM_BACKGROUND_ID_PATTERN.test(storedBackgroundId || "")
      ? storedBackgroundId
      : DEFAULT_BACKGROUND_ID;
  } catch {
    return DEFAULT_BACKGROUND_ID;
  }
}

function normalizeTheme(theme) {
  return theme === "dark" ? "dark" : DEFAULT_THEME;
}

function getInitialTheme() {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  try {
    return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

function persistBackgroundId(backgroundId) {
  try {
    window.localStorage.setItem(BACKGROUND_STORAGE_KEY, backgroundId);
  } catch {
    // Persisting the visual preference is best-effort only.
  }
}

function persistTheme(theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, normalizeTheme(theme));
  } catch {
    // Persisting the visual preference is best-effort only.
  }
}

function getDashboardBackground(backgroundPreset, theme) {
  if (backgroundPreset.id === LIGHTFALL_BACKGROUND_ID) {
    if (theme === "dark") {
      return "linear-gradient(180deg, #07111f 0%, #0d1724 46%, #17202b 100%)";
    }

    return backgroundPreset.background;
  }

  if (backgroundPreset.id === SHAPE_GRID_BACKGROUND_ID) {
    if (theme === "dark") {
      return "linear-gradient(180deg, #070d14 0%, #0d1821 50%, #17232a 100%)";
    }

    return backgroundPreset.background;
  }

  if (theme !== "dark") {
    return backgroundPreset.background;
  }

  if (backgroundPreset.id === "alpine-lake") {
    return `linear-gradient(180deg, rgba(2, 7, 12, 0.72), rgba(2, 7, 12, 0.94)), ${SCENIC_BACKGROUND}`;
  }

  return `linear-gradient(180deg, rgba(3, 8, 14, 0.26), rgba(2, 7, 12, 0.82)), ${backgroundPreset.background}`;
}

function getDockScaleForDistance(distance) {
  const proximity = Math.max(0, 1 - Math.abs(distance) / DOCK_DISTANCE);
  const scale = 1 + (DOCK_MAX_SCALE - 1) * proximity;

  return Number(scale.toFixed(3));
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setPrefersReducedMotion(media.matches);

    updateMotionPreference();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", updateMotionPreference);

      return () => media.removeEventListener("change", updateMotionPreference);
    }

    media.addListener(updateMotionPreference);

    return () => media.removeListener(updateMotionPreference);
  }, []);

  return prefersReducedMotion;
}

function DashboardBackgroundLayer({ backgroundPreset, prefersReducedMotion, theme }) {
  if (![LIGHTFALL_BACKGROUND_ID, SHAPE_GRID_BACKGROUND_ID].includes(backgroundPreset.id)) {
    return null;
  }

  const isDarkTheme = theme === "dark";

  if (backgroundPreset.id === SHAPE_GRID_BACKGROUND_ID) {
    return (
      <div aria-hidden="true" className="dashboard-shape-grid-background" data-testid="shape-grid-background">
        <Suspense fallback={null}>
          <ShapeGrid
            borderColor={isDarkTheme ? "rgba(168, 185, 198, 0.28)" : "rgba(43, 63, 77, 0.24)"}
            direction="diagonal"
            hoverFillColor={isDarkTheme ? "rgba(103, 232, 249, 0.18)" : "rgba(47, 128, 209, 0.14)"}
            hoverTrailAmount={5}
            paused={prefersReducedMotion}
            shape="hexagon"
            speed={isDarkTheme ? 0.32 : 0.24}
            squareSize={44}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div aria-hidden="true" className="dashboard-lightfall-background" data-testid="lightfall-background">
      <Suspense fallback={null}>
        <Lightfall
          backgroundColor={isDarkTheme ? "#102a5f" : "#7eb6ff"}
          backgroundGlow={isDarkTheme ? 0.4 : 0.24}
          colors={isDarkTheme ? LIGHTFALL_DARK_COLORS : LIGHTFALL_COLORS}
          density={isDarkTheme ? 0.58 : 0.48}
          dpr={1.35}
          glow={isDarkTheme ? 0.82 : 0.58}
          mixBlendMode="screen"
          mouseInteraction={!prefersReducedMotion}
          mouseRadius={0.72}
          mouseStrength={0.42}
          opacity={isDarkTheme ? 0.7 : 0.46}
          paused={prefersReducedMotion}
          speed={isDarkTheme ? 0.46 : 0.34}
          streakCount={isDarkTheme ? 4 : 3}
          streakLength={0.94}
          streakWidth={0.72}
          twinkle={0.56}
          zoom={2.6}
        />
      </Suspense>
    </div>
  );
}

function cloneWidgets(widgets) {
  return widgets.map((widget) => ({
    ...widget,
    enhancedRenderer: widget.enhancedRenderer
      ? { ...widget.enhancedRenderer, config: widget.enhancedRenderer.config ? { ...widget.enhancedRenderer.config } : undefined }
      : widget.enhancedRenderer,
    style: { ...(widget.style || {}) },
  }));
}

function createClientWidgetId() {
  return globalThis.crypto?.randomUUID?.() || `widget-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildDraftWidget(input, { services, templates, widgets = [] }) {
  const template = templates.find((candidate) => candidate.id === input.templateId) || {};
  const service = input.serviceId ? services.find((candidate) => candidate.id === input.serviceId) : null;
  const h = input.h || template.defaultLayout?.h || 3;
  const w = input.w || template.defaultLayout?.w || 4;
  const position =
    input.x == null || input.y == null
      ? findAvailableWidgetPosition(widgets, { h, w })
      : { x: input.x, y: input.y };
  const style = {
    ...getDefaultWidgetStyle(input.templateId, template),
    ...(input.style || {}),
  };

  if (service?.color && !input.style?.accentColor) {
    style.accentColor = service.color;
  }

  return {
    createdAt: new Date().toISOString(),
    enhancedData: input.enhancedData || null,
    enhancedRenderer: input.enhancedRenderer
      ? { ...input.enhancedRenderer, config: input.enhancedRenderer.config ? { ...input.enhancedRenderer.config } : undefined }
      : null,
    enhancedStateStatus: input.enhancedData ? "ok" : null,
    enhancedWidgetId: input.enhancedWidgetId || null,
    enhancementId: input.enhancementId || null,
    h,
    id: input.id || createClientWidgetId(),
    integrationId: input.integrationId || template.integration?.id || null,
    integrationInstanceId: input.integrationInstanceId || null,
    minH: input.minH || template.minLayout?.h || 1,
    minW: input.minW || template.minLayout?.w || 1,
    pluginId: input.pluginId || template.plugin?.id || null,
    refreshIntervalSeconds: input.refreshIntervalSeconds ?? template.refreshIntervalSeconds ?? null,
    scopedCss: input.scopedCss || "",
    serviceId: input.serviceId || null,
    style,
    subtitle: input.subtitle || service?.description || template.description || "",
    templateId: input.templateId || "compact",
    title: input.title || service?.name || template.name || "Widget",
    updatedAt: new Date().toISOString(),
    url: input.url || service?.url || "",
    w,
    x: position.x,
    y: position.y,
    zIndex: input.zIndex || 1,
  };
}

function resolveWidgetRefreshIntervalSeconds(widget, template) {
  const configuredInterval = Number(widget.refreshIntervalSeconds ?? template?.refreshIntervalSeconds);

  if (Number.isFinite(configuredInterval)) {
    return Math.max(configuredInterval, 0);
  }

  const enhancedWidgetId = widget.enhancedWidgetId || template?.enhanced?.widgetId;

  return REALTIME_ENHANCED_WIDGET_IDS.has(enhancedWidgetId) ? DEFAULT_REALTIME_REFRESH_INTERVAL_SECONDS : 0;
}

function dataFromEnhancedState(enhancedState, widget, template) {
  const state = enhancedState?.state || {};
  const dataPath = widget.enhancedRenderer?.dataPath || template?.enhanced?.dataPath;

  return dataPath ? state?.[dataPath] : state;
}

function applyEnhancedStateToWidget(widget, enhancedState, template) {
  return {
    ...widget,
    enhancedData: dataFromEnhancedState(enhancedState, widget, template) || null,
    enhancedStateStatus: enhancedState?.status || "missing",
  };
}

function resolveWidgetDataSource(widget, template) {
  const integrationId = widget.integrationId || template?.integration?.id;

  if (integrationId && (widget.enhancedRenderer || template?.integration)) {
    if (widget.integrationInstanceId) {
      return {
        id: widget.integrationInstanceId,
        kind: "integration-instance",
      };
    }

    return {
      config: widget.enhancedRenderer?.config || template?.integration?.config || {},
      id: integrationId,
      kind: "integration",
    };
  }

  if (
    widget.serviceId &&
    (widget.enhancedRenderer || template?.enhanced) &&
    (widget.enhancedWidgetId || template?.enhanced?.widgetId)
  ) {
    return { id: widget.serviceId, kind: "service" };
  }

  return null;
}

async function refreshWidgetDataSource(dataSource) {
  if (dataSource.kind === "integration-instance") {
    return refreshIntegrationInstanceRequest(dataSource.id);
  }

  if (dataSource.kind === "integration") {
    return refreshIntegrationWidgetRequest(dataSource.id, dataSource.config);
  }

  return refreshServiceEnhancementRequest(dataSource.id);
}

function widgetDataSourceKey(dataSource) {
  return `${dataSource.kind}:${dataSource.id}:${JSON.stringify(dataSource.config || {})}`;
}

function applyIntegrationStateToWidget(widget, integrationState) {
  return {
    ...widget,
    enhancedData: integrationState || null,
    enhancedStateStatus: integrationState?.available ? "ok" : "missing",
  };
}

function applyDataStateToWidget(widget, payload, template, dataSource) {
  if (dataSource?.kind === "integration" || dataSource?.kind === "integration-instance") {
    return applyIntegrationStateToWidget(widget, payload.state);
  }

  return applyEnhancedStateToWidget(widget, payload.state, template);
}

function PersonalHomeServerMark() {
  return (
    <svg
      aria-hidden="true"
      className="home-server-logo"
      focusable="false"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        className="home-server-logo__glyph"
        d="M14 40.5c10.8-20.8 24.2-28 36-25.5-7.7 4.6-13.6 11-17.6 19.1 7.7-1.2 14.4-3.3 20.1-6.4-6 10.6-17.4 17.7-34.1 21.4L14 40.5Z"
      />
      <path
        className="home-server-logo__cut"
        d="M20 38.3c9.6-11.8 19.8-17.9 30.5-18.3"
      />
    </svg>
  );
}

export function App() {
  const [isLaunchpadOpen, setIsLaunchpadOpen] = useState(false);
  const [isAddServiceOpen, setIsAddServiceOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [globalQuery, setGlobalQuery] = useState("");
  const [globalSearchActiveIndex, setGlobalSearchActiveIndex] = useState(-1);
  const [settingsDialogMode, setSettingsDialogMode] = useState("");
  const [theme, setTheme] = useState(getInitialTheme);
  const [backgroundId, setBackgroundId] = useState(getInitialBackgroundId);
  const [customBackgrounds, setCustomBackgrounds] = useState([]);
  const [services, setServices] = useState([]);
  const [serviceTypes, setServiceTypes] = useState(SERVICE_TYPES);
  const [widgetTemplates, setWidgetTemplates] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [integrationInstances, setIntegrationInstances] = useState([]);
  const [widgets, setWidgets] = useState([]);
  const [draftWidgets, setDraftWidgets] = useState([]);
  const [isWidgetEditing, setIsWidgetEditing] = useState(false);
  const [isSavingWidgets, setIsSavingWidgets] = useState(false);
  const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false);
  const [selectedWidgetId, setSelectedWidgetId] = useState("");
  const [selectedServiceSettings, setSelectedServiceSettings] = useState(null);
  const [draggedDockServiceId, setDraggedDockServiceId] = useState("");
  const [dockScales, setDockScales] = useState({});
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [appStatus, setAppStatus] = useState("");
  const [loadError, setLoadError] = useState("");
  const [widgetEditError, setWidgetEditError] = useState("");
  const [widgetEditStatus, setWidgetEditStatus] = useState("");
  const [refreshingWidgetIds, setRefreshingWidgetIds] = useState(() => new Set());
  const globalSearchRef = useRef(null);
  const inFlightWidgetDataQueryKeysRef = useRef(new Set());
  const servicesLauncherRef = useRef(null);
  const availableBackgroundPresets = useMemo(
    () => [...BACKGROUND_PRESETS, ...customBackgrounds.map(customBackgroundPreset)],
    [customBackgrounds],
  );
  const activeBackground = getBackgroundPreset(backgroundId, availableBackgroundPresets);
  const isDarkTheme = theme === "dark";
  const dashboardBackground = getDashboardBackground(activeBackground, theme);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    document.title = "Oh No Selfhosted";
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);

  useEffect(() => {
    if (prefersReducedMotion) {
      setDockScales({});
    }
  }, [prefersReducedMotion]);

  useEffect(() => {
    function handleShortcut(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        globalSearchRef.current?.focus();
        globalSearchRef.current?.select();
      }
    }

    window.addEventListener("keydown", handleShortcut);

    return () => {
      window.removeEventListener("keydown", handleShortcut);
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;

    async function loadServices() {
      setIsLoadingServices(true);
      setLoadError("");

      try {
        const payload = await loadDashboardData();

        if (!isCurrent) {
          return;
        }

        applyDashboardData(payload);
      } catch (error) {
        if (isCurrent) {
          setLoadError(error.message || "Unable to load services");
          setServiceTypes(SERVICE_TYPES);
          setServices([]);
          setCustomBackgrounds([]);
          setWidgetTemplates([]);
          setIntegrations([]);
          setIntegrationInstances([]);
          setWidgets([]);
        }
      } finally {
        if (isCurrent) {
          setIsLoadingServices(false);
        }
      }
    }

    loadServices();

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (isWidgetEditing || widgets.length === 0 || widgetTemplates.length === 0) {
      return undefined;
    }

    const templatesById = new Map(widgetTemplates.map((template) => [template.id, template]));
    const queryTargets = widgets
      .map((widget) => {
        const template = templatesById.get(widget.templateId);
        const dataSource = resolveWidgetDataSource(widget, template);
        const key = `${widget.id}:${widget.updatedAt || ""}`;
        const needsData =
          widget.enhancedStateStatus === "querying" ||
          (!widget.enhancedData && widget.enhancedStateStatus !== "ok" && widget.enhancedStateStatus !== "error");

        return { dataSource, key, needsData, template, widget };
      })
      .filter(({ dataSource, key, needsData }) => dataSource && needsData && !inFlightWidgetDataQueryKeysRef.current.has(key));

    if (queryTargets.length === 0) {
      return undefined;
    }

    let isCurrent = true;

    queryTargets.forEach(({ dataSource, key, template, widget }) => {
      inFlightWidgetDataQueryKeysRef.current.add(key);
      setWidgetRefreshing(widget.id, true);

      async function queryWidgetData() {
        try {
          const payload = await refreshWidgetDataSource(dataSource);

          if (!isCurrent) {
            return;
          }

          setWidgets((currentWidgets) =>
            currentWidgets.map((currentWidget) => {
              if (currentWidget.id !== widget.id) {
                return currentWidget;
              }

              const currentTemplate = templatesById.get(currentWidget.templateId) || template;

              return applyDataStateToWidget(
                currentWidget,
                payload,
                currentTemplate,
                resolveWidgetDataSource(currentWidget, currentTemplate) || dataSource,
              );
            }),
          );
        } catch {
          if (!isCurrent) {
            return;
          }

          setWidgets((currentWidgets) =>
            currentWidgets.map((currentWidget) =>
              currentWidget.id === widget.id ? { ...currentWidget, enhancedStateStatus: "error" } : currentWidget,
            ),
          );
        } finally {
          inFlightWidgetDataQueryKeysRef.current.delete(key);

          if (isCurrent) {
            setWidgetRefreshing(widget.id, false);
          }
        }
      }

      queryWidgetData();
    });

    return () => {
      isCurrent = false;
    };
  }, [isWidgetEditing, widgets, widgetTemplates]);

  useEffect(() => {
    if (isWidgetEditing || widgets.length === 0 || widgetTemplates.length === 0) {
      return undefined;
    }

    const templatesById = new Map(widgetTemplates.map((template) => [template.id, template]));
    const refreshableWidgets = widgets
      .map((widget) => {
        const template = templatesById.get(widget.templateId);
        const intervalSeconds = resolveWidgetRefreshIntervalSeconds(widget, template);

        return { dataSource: resolveWidgetDataSource(widget, template), intervalSeconds, template, widget };
      })
      .filter(({ dataSource, intervalSeconds }) => intervalSeconds > 0 && dataSource);

    if (refreshableWidgets.length === 0) {
      return undefined;
    }

    const refreshGroups = new Map();

    for (const target of refreshableWidgets) {
      const key = `${widgetDataSourceKey(target.dataSource)}:${target.intervalSeconds}`;
      const group = refreshGroups.get(key) || { ...target, widgetIds: new Set() };
      group.widgetIds.add(target.widget.id);
      refreshGroups.set(key, group);
    }

    let isCurrent = true;
    const timers = [...refreshGroups.values()].map(({ dataSource, intervalSeconds, template, widgetIds }) =>
      window.setInterval(async () => {
        try {
          const payload = await refreshWidgetDataSource(dataSource);

          if (!isCurrent) {
            return;
          }

          setWidgets((currentWidgets) =>
            currentWidgets.map((currentWidget) => {
              if (!widgetIds.has(currentWidget.id)) {
                return currentWidget;
              }

              return applyDataStateToWidget(
                currentWidget,
                payload,
                templatesById.get(currentWidget.templateId) || template,
                resolveWidgetDataSource(currentWidget, templatesById.get(currentWidget.templateId) || template) ||
                  dataSource,
              );
            }),
          );
        } catch {
          if (!isCurrent) {
            return;
          }

          setWidgets((currentWidgets) =>
            currentWidgets.map((currentWidget) =>
              widgetIds.has(currentWidget.id) ? { ...currentWidget, enhancedStateStatus: "error" } : currentWidget,
            ),
          );
        }
      }, intervalSeconds * 1000),
    );

    return () => {
      isCurrent = false;
      timers.forEach((timer) => window.clearInterval(timer));
    };
  }, [isWidgetEditing, widgetTemplates, widgets]);

  const filteredServices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return services.filter((service) => {
      return (
        normalizedQuery.length === 0 ||
        `${service.name} ${service.description} ${service.category}`.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [query, services]);
  const visibleWidgets = isWidgetEditing ? draftWidgets : widgets;
  const pinnedServices = useMemo(
    () =>
      services
        .filter((service) => service.pinnedToDock)
        .sort((first, second) => {
          const firstOrder = first.dockSortOrder ?? first.sortOrder ?? 9999;
          const secondOrder = second.dockSortOrder ?? second.sortOrder ?? 9999;

          return firstOrder - secondOrder || first.name.localeCompare(second.name);
        }),
    [services],
  );
  const globalSearchResults = useMemo(() => {
    const normalizedQuery = globalQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    const commandResults = [
      { id: "settings", kind: "command", label: "Open Settings", text: "Dashboard preferences" },
      { id: "plugins", kind: "command", label: "Open Plugins", text: "GitHub plugin registries" },
      { id: "profile", kind: "command", label: "Open Profile", text: "Local operator profile" },
      { id: "services", kind: "command", label: "Open Services", text: "Show Launchpad" },
      { id: "widgets", kind: "command", label: "Edit Widgets", text: "Customize dashboard widgets" },
    ].filter((item) => `${item.label} ${item.text}`.toLowerCase().includes(normalizedQuery));
    const serviceResults = services
      .filter((service) =>
        `${service.name} ${service.description} ${service.category}`.toLowerCase().includes(normalizedQuery),
      )
      .map((service) => ({
        id: service.id,
        kind: "service",
        label: `Show ${service.name}`,
        service,
        text: service.description,
      }));

    return [...commandResults, ...serviceResults].slice(0, 6);
  }, [globalQuery, services]);
  const globalSearchStatus = globalQuery.trim()
    ? globalSearchResults.length === 0
      ? "No global search results"
      : `${globalSearchResults.length} global search result${globalSearchResults.length === 1 ? "" : "s"}`
    : "";
  const activeGlobalSearchOptionId =
    globalSearchActiveIndex >= 0 && globalSearchResults[globalSearchActiveIndex]
      ? `global-search-option-${globalSearchActiveIndex}`
      : undefined;
  const isOverlayActive = isLaunchpadOpen || Boolean(selectedServiceSettings) || Boolean(settingsDialogMode);

  function activateGlobalSearchResult(result) {
    if (!result) {
      return;
    }

    if (result.kind === "service") {
      setIsLaunchpadOpen(true);
      setIsAddServiceOpen(false);
      setQuery(result.service.name);
    } else if (result.id === "settings") {
      openSettingsDialog("settings");
    } else if (result.id === "profile") {
      openSettingsDialog("profile");
    } else if (result.id === "plugins") {
      openSettingsDialog("plugins");
    } else if (result.id === "services") {
      openLaunchpad();
    } else if (result.id === "widgets") {
      beginWidgetEditing();
    }

    setGlobalQuery("");
    setGlobalSearchActiveIndex(-1);
  }

  function focusGlobalSearchOption(index) {
    if (!globalSearchResults.length) {
      return;
    }

    const nextIndex = (index + globalSearchResults.length) % globalSearchResults.length;

    setGlobalSearchActiveIndex(nextIndex);
  }

  async function reloadDashboardData() {
    const payload = await loadDashboardData();

    applyDashboardData(payload);
  }

  function applyDashboardData(payload) {
    const nextCustomBackgrounds = payload.backgrounds || [];
    const nextBackgroundIds = new Set([
      ...BACKGROUND_PRESETS.map((preset) => preset.id),
      ...nextCustomBackgrounds.map((background) => background.id),
    ]);

    setCustomBackgrounds(nextCustomBackgrounds);
    setServiceTypes(payload.serviceTypes.length ? payload.serviceTypes : SERVICE_TYPES);
    setServices(payload.services);
    setWidgetTemplates(payload.templates);
    setIntegrations(payload.integrations || []);
    setIntegrationInstances(payload.integrationInstances || []);
    setWidgets(normalizeLoadedWidgets(payload.widgets));
    setBackgroundId((currentBackgroundId) => {
      if (nextBackgroundIds.has(currentBackgroundId)) {
        return currentBackgroundId;
      }

      persistBackgroundId(DEFAULT_BACKGROUND_ID);
      return DEFAULT_BACKGROUND_ID;
    });
  }

  function setWidgetRefreshing(widgetId, isRefreshing) {
    setRefreshingWidgetIds((currentWidgetIds) => {
      const nextWidgetIds = new Set(currentWidgetIds);

      if (isRefreshing) {
        nextWidgetIds.add(widgetId);
      } else {
        nextWidgetIds.delete(widgetId);
      }

      return nextWidgetIds;
    });
  }

  async function refreshWidgetData(widgetId) {
    const sourceWidgets = isWidgetEditing ? draftWidgets : widgets;
    const targetWidget = sourceWidgets.find((widget) => widget.id === widgetId);
    const targetTemplate = widgetTemplates.find((template) => template.id === targetWidget?.templateId);
    const dataSource = resolveWidgetDataSource(targetWidget || {}, targetTemplate);

    if (!targetWidget || !dataSource) {
      return;
    }

    setAppStatus("");
    setWidgetRefreshing(widgetId, true);

    try {
      const payload = await refreshWidgetDataSource(dataSource);
      const applyRefresh = (currentWidgets) =>
        currentWidgets.map((currentWidget) => {
          if (currentWidget.id !== widgetId) {
            return currentWidget;
          }

          const currentTemplate =
            widgetTemplates.find((template) => template.id === currentWidget.templateId) || targetTemplate;

          return applyDataStateToWidget(
            currentWidget,
            payload,
            currentTemplate,
            resolveWidgetDataSource(currentWidget, currentTemplate) || dataSource,
          );
        });

      if (isWidgetEditing) {
        setDraftWidgets(applyRefresh);
        setWidgetEditStatus("Widget data refreshed.");
      } else {
        setWidgets(applyRefresh);
        setAppStatus("Widget data refreshed.");
      }
    } catch {
      const markRefreshError = (currentWidgets) =>
        currentWidgets.map((currentWidget) =>
          currentWidget.id === widgetId ? { ...currentWidget, enhancedStateStatus: "error" } : currentWidget,
        );

      if (isWidgetEditing) {
        setDraftWidgets(markRefreshError);
        setWidgetEditStatus("");
        setWidgetEditError("Unable to refresh widget data.");
      } else {
        setWidgets(markRefreshError);
        setAppStatus("Unable to refresh widget data.");
      }
    } finally {
      setWidgetRefreshing(widgetId, false);
    }
  }

  function openLaunchpad() {
    setIsLaunchpadOpen(true);
    setIsAddServiceOpen(false);
    setQuery("");
    setGlobalQuery("");
  }

  function closeLaunchpad() {
    setIsLaunchpadOpen(false);
    setIsAddServiceOpen(false);
  }

  async function patchWidget(widgetId, patch) {
    setWidgets((currentWidgets) =>
      currentWidgets.map((widget) => (widget.id === widgetId ? { ...widget, ...patch } : widget)),
    );

    const savedWidget = await updateWidgetRequest(widgetId, patch);
    setWidgets((currentWidgets) =>
      currentWidgets.map((widget) => (widget.id === widgetId ? savedWidget : widget)),
    );

    return savedWidget;
  }

  function beginWidgetEditing() {
    const nextDraftWidgets = cloneWidgets(widgets);

    setDraftWidgets(nextDraftWidgets);
    setIsWidgetEditing(true);
    setAppStatus("");
    setWidgetEditError("");
    setWidgetEditStatus("");
    setSelectedWidgetId("");
    setGlobalQuery("");
  }

  function cancelWidgetEditing() {
    setDraftWidgets([]);
    setIsAddWidgetOpen(false);
    setIsWidgetEditing(false);
    setSelectedWidgetId("");
    setWidgetEditError("");
    setWidgetEditStatus("");
  }

  function patchDraftWidget(widgetId, patch) {
    setDraftWidgets((currentWidgets) =>
      currentWidgets.map((widget) => (widget.id === widgetId ? { ...widget, ...patch } : widget)),
    );
    setWidgetEditStatus("Widget changes pending. Save Changes to apply.");

    return draftWidgets.find((widget) => widget.id === widgetId);
  }

  async function saveWidgetEdits() {
    setAppStatus("");
    setWidgetEditError("");
    setWidgetEditStatus("");
    setIsSavingWidgets(true);

    try {
      const savedWidgets = await saveWidgetsRequest(draftWidgets);

      setWidgets(savedWidgets);
      setIntegrationInstances((currentInstances) => {
        const instancesById = new Map(currentInstances.map((instance) => [instance.id, instance]));

        for (const widget of savedWidgets) {
          if (widget.integrationInstanceId && !instancesById.has(widget.integrationInstanceId)) {
            instancesById.set(widget.integrationInstanceId, {
              id: widget.integrationInstanceId,
              integrationId: widget.integrationId,
              name: `${widget.title} connection`,
            });
          }
        }

        return [...instancesById.values()];
      });
      setDraftWidgets([]);
      setIsAddWidgetOpen(false);
      setIsWidgetEditing(false);
      setSelectedWidgetId("");
      setAppStatus("Widget changes saved.");
    } catch (error) {
      setWidgetEditError(error.message || "Unable to save widgets");
    } finally {
      setIsSavingWidgets(false);
    }
  }

  async function createWidget(input) {
    if (isWidgetEditing) {
      const widget = buildDraftWidget(input, { services, templates: widgetTemplates, widgets: draftWidgets });

      setDraftWidgets((currentWidgets) => [...currentWidgets, widget]);
      setSelectedWidgetId(widget.id);
      setWidgetEditStatus("Widget added to draft. Save Changes to apply.");

      return widget;
    }

    const widget = await createWidgetRequest(input);

    setWidgets((currentWidgets) => [...currentWidgets, widget]);
    if (widget.integrationInstanceId) {
      setIntegrationInstances((currentInstances) =>
        currentInstances.some((instance) => instance.id === widget.integrationInstanceId)
          ? currentInstances
          : [
              ...currentInstances,
              {
                id: widget.integrationInstanceId,
                integrationId: widget.integrationId,
                name: input.integrationInstanceName || `${widget.title} connection`,
              },
            ],
      );
    }
    setSelectedWidgetId(widget.id);
    setAppStatus("Widget created.");

    return widget;
  }

  async function deleteWidget(widgetId) {
    if (isWidgetEditing) {
      setDraftWidgets((currentWidgets) => currentWidgets.filter((widget) => widget.id !== widgetId));
      setSelectedWidgetId("");
      setWidgetEditStatus("Widget removed from draft. Save Changes to apply.");
      return;
    }

    await deleteWidgetRequest(widgetId);
    setWidgets((currentWidgets) => currentWidgets.filter((widget) => widget.id !== widgetId));
    setSelectedWidgetId("");
    setAppStatus("Widget deleted.");
  }

  async function createService(input) {
    const service = await createServiceRequest(input);

    setServices((currentServices) => [...currentServices, service]);
    setQuery("");
    setAppStatus("Service added.");

    return service;
  }

  function updateService(savedService) {
    setServices((currentServices) =>
      currentServices.map((service) => (service.id === savedService.id ? savedService : service)),
    );
    setSelectedServiceSettings(savedService);
  }

  function deleteServiceLocally(serviceId) {
    setServices((currentServices) => currentServices.filter((service) => service.id !== serviceId));
    setWidgets((currentWidgets) => currentWidgets.filter((widget) => widget.serviceId !== serviceId));
    setDraftWidgets((currentWidgets) => currentWidgets.filter((widget) => widget.serviceId !== serviceId));
    setSelectedServiceSettings(null);
    setAppStatus("Service deleted.");
  }

  function openServiceSettings(service) {
    setAppStatus("");
    setSelectedServiceSettings(service);
    setIsLaunchpadOpen(false);
    setIsAddServiceOpen(false);
  }

  function openSettingsDialog(mode = "settings") {
    setSettingsDialogMode(mode);
    setGlobalQuery("");
  }

  function selectDashboardBackground(nextBackgroundId) {
    const nextBackground = getBackgroundPreset(nextBackgroundId, availableBackgroundPresets);

    setBackgroundId(nextBackground.id);
    persistBackgroundId(nextBackground.id);
    setAppStatus(`Background changed to ${nextBackground.name}.`);
  }

  async function uploadDashboardBackground(file) {
    setLoadError("");
    const uploadedBackground = await uploadBackgroundRequest(file);

    setCustomBackgrounds((currentBackgrounds) => [
      uploadedBackground,
      ...currentBackgrounds.filter((background) => background.id !== uploadedBackground.id),
    ]);
    setBackgroundId(uploadedBackground.id);
    persistBackgroundId(uploadedBackground.id);
    setAppStatus(`Background uploaded: ${uploadedBackground.name}.`);

    return uploadedBackground;
  }

  async function deleteDashboardBackground(backgroundIdToDelete) {
    setLoadError("");
    await deleteBackgroundRequest(backgroundIdToDelete);
    setCustomBackgrounds((currentBackgrounds) =>
      currentBackgrounds.filter((background) => background.id !== backgroundIdToDelete),
    );

    if (backgroundId === backgroundIdToDelete) {
      setBackgroundId(DEFAULT_BACKGROUND_ID);
      persistBackgroundId(DEFAULT_BACKGROUND_ID);
    }

    setAppStatus("Custom background deleted.");
  }

  function toggleTheme() {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";

      persistTheme(nextTheme);

      return nextTheme;
    });
  }

  function resetDockMagnification() {
    setDockScales({});
  }

  function updateDockMagnification(event) {
    if (prefersReducedMotion) {
      return;
    }

    const dockItems = event.currentTarget.querySelectorAll("[data-dock-item]");
    const nextScales = {};

    dockItems.forEach((item) => {
      const itemId = item.getAttribute("data-dock-item");
      const rect = item.getBoundingClientRect();

      if (!itemId || rect.width === 0) {
        return;
      }

      const centerX = rect.left + rect.width / 2;
      nextScales[itemId] = getDockScaleForDistance(event.clientX - centerX);
    });

    setDockScales(nextScales);
  }

  function focusDockItem(itemId) {
    if (!prefersReducedMotion) {
      setDockScales({ [itemId]: DOCK_MAX_SCALE });
    }
  }

  function getDockItemStyle(itemId) {
    const scale = dockScales[itemId] ?? 1;

    return {
      "--dock-item-size": `${Math.round(DOCK_BASE_ITEM_SIZE * scale)}px`,
      "--dock-scale": scale,
    };
  }

  async function reorderDockServices(sourceServiceId, targetServiceId) {
    if (!sourceServiceId || !targetServiceId || sourceServiceId === targetServiceId) {
      return;
    }

    const currentOrder = pinnedServices.map((service) => service.id);
    const sourceIndex = currentOrder.indexOf(sourceServiceId);
    const targetIndex = currentOrder.indexOf(targetServiceId);

    if (sourceIndex === -1 || targetIndex === -1) {
      return;
    }

    const nextOrder = [...currentOrder];
    const [movedServiceId] = nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, movedServiceId);

    setServices((currentServices) =>
      currentServices.map((service) => {
        const dockSortOrder = nextOrder.indexOf(service.id);

        return dockSortOrder === -1 ? service : { ...service, dockSortOrder, pinnedToDock: true };
      }),
    );

    try {
      const savedServices = await saveDockOrderRequest(nextOrder);
      setServices(savedServices);
      setAppStatus("Dock order saved.");
    } catch (error) {
      setLoadError(error.message || "Unable to save Dock order");
      reloadDashboardData().catch(() => {});
    }
  }

  return (
    <>
    <a className="skip-link" href="#main-content" hidden={isOverlayActive}>
      Skip to main content
    </a>
    <main
      className="app"
      data-background-id={activeBackground.id}
      data-theme={theme}
      id="main-content"
      style={{ "--dashboard-background": dashboardBackground }}
      tabIndex={-1}
    >
      <DashboardBackgroundLayer
        backgroundPreset={activeBackground}
        prefersReducedMotion={prefersReducedMotion}
        theme={theme}
      />
      <div
        className={`dashboard-shell ${isLaunchpadOpen ? "is-launchpad-open" : ""} ${
          isWidgetEditing ? "is-widget-editing" : ""
        }`}
        data-testid="dashboard-shell"
      >
        <header className="topbar">
          <div className="brand">
            <span
              className="brand-mark"
              data-mark="orbit-cut"
              data-testid="home-server-mark"
              data-variant="transparent-svg"
            >
              <PersonalHomeServerMark />
            </span>
            <ShuffleText
              animationMode="evenodd"
              className="brand-shuffle-title"
              duration={0.7}
              loop
              loopDelay={1.5}
              respectReducedMotion
              scrambleCharset="OHNOSELFHOSTED0123456789"
              shuffleDirection="down"
              shuffleTimes={1}
              stagger={0.03}
              tag="h1"
              text="Oh No Selfhosted"
              textAlign="left"
              triggerOnHover
            />
          </div>

          <label className="command-bar">
            <FiSearch aria-hidden="true" />
            <input
              aria-autocomplete="list"
              aria-activedescendant={activeGlobalSearchOptionId}
              aria-controls={globalQuery.trim() ? "global-search-results" : undefined}
              aria-expanded={globalSearchResults.length > 0 ? "true" : "false"}
              aria-label="Global search"
              autoComplete="off"
              ref={globalSearchRef}
              role="combobox"
              type="search"
              value={globalQuery}
              placeholder="Search services or commands"
              onChange={(event) => {
                setGlobalQuery(event.target.value);
                setGlobalSearchActiveIndex(-1);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setGlobalQuery("");
                  setGlobalSearchActiveIndex(-1);
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  activateGlobalSearchResult(globalSearchResults[globalSearchActiveIndex] || globalSearchResults[0]);
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  focusGlobalSearchOption(globalSearchActiveIndex + 1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  focusGlobalSearchOption(globalSearchActiveIndex - 1);
                }
              }}
            />
          </label>
          <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
            {globalSearchStatus}
          </p>
          {globalQuery.trim() ? (
            <div className="global-search-panel" id="global-search-results" role="listbox" aria-label="Global search results">
              {globalSearchResults.length ? (
                globalSearchResults.map((result, index) => (
                  <button
                    aria-selected={globalSearchActiveIndex === index ? "true" : "false"}
                    className="global-search-option"
                    id={`global-search-option-${index}`}
                    key={`${result.kind}:${result.id}`}
                    role="option"
                    type="button"
                    onFocus={() => setGlobalSearchActiveIndex(index)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        focusGlobalSearchOption(index + 1);
                      } else if (event.key === "ArrowUp") {
                        event.preventDefault();
                        if (index === 0) {
                          setGlobalSearchActiveIndex(-1);
                          globalSearchRef.current?.focus();
                        } else {
                          focusGlobalSearchOption(index - 1);
                        }
                      } else if (event.key === "Escape") {
                        setGlobalQuery("");
                        setGlobalSearchActiveIndex(-1);
                        globalSearchRef.current?.focus();
                      }
                    }}
                    onClick={() => activateGlobalSearchResult(result)}
                  >
                    <strong>{result.label}</strong>
                    <small>{result.text}</small>
                  </button>
                ))
              ) : (
                <p className="global-search-empty">No results for "{globalQuery}".</p>
              )}
            </div>
          ) : null}

          <div className="top-actions">
            <button
              aria-label="Edit widgets"
              className="icon-button"
              type="button"
              onClick={beginWidgetEditing}
            >
              <FiGrid aria-hidden="true" />
            </button>
            <button
              aria-label={isDarkTheme ? "Switch to light theme" : "Switch to dark theme"}
              aria-pressed={isDarkTheme}
              className="icon-button"
              type="button"
              onClick={toggleTheme}
            >
              {isDarkTheme ? <FiSun aria-hidden="true" /> : <FiMoon aria-hidden="true" />}
            </button>
            <button
              aria-haspopup="dialog"
              aria-label="Open settings"
              className="icon-button"
              type="button"
              onClick={() => openSettingsDialog("settings")}
            >
              <FiSettings aria-hidden="true" />
            </button>
            <button
              aria-haspopup="dialog"
              aria-label="Open profile"
              className="profile-button"
              type="button"
              onClick={() => openSettingsDialog("profile")}
            >
              A
            </button>
          </div>
        </header>

        <section className="widget-canvas" aria-label="Widget canvas" tabIndex={0}>
          <div className="desktop-stage">
            {isWidgetEditing ? (
              <div className="widget-edit-toolbar" role="toolbar" aria-label="Widget editing">
                <button className="primary-button" type="button" onClick={saveWidgetEdits} disabled={isSavingWidgets}>
                  {isSavingWidgets ? "Saving..." : "Save Changes"}
                </button>
                <button className="secondary-button" type="button" onClick={cancelWidgetEditing}>
                  Cancel
                </button>
                <button className="secondary-button" type="button" onClick={() => setIsAddWidgetOpen(true)}>
                  Add Widget
                </button>
                {widgetEditStatus ? (
                  <span className="toolbar-status" role="status" aria-live="polite" aria-atomic="true">
                    {widgetEditStatus}
                  </span>
                ) : null}
                {widgetEditError ? <span className="toolbar-error" role="alert">{widgetEditError}</span> : null}
              </div>
            ) : null}
            <WidgetCanvas
              editMode={isWidgetEditing}
              refreshingWidgetIds={refreshingWidgetIds}
              selectedWidgetId={selectedWidgetId}
              services={services}
              templates={widgetTemplates}
              widgets={visibleWidgets}
              onPatchWidget={isWidgetEditing ? patchDraftWidget : patchWidget}
              onRefreshWidget={refreshWidgetData}
              onSelectWidget={setSelectedWidgetId}
            />
          </div>
        </section>

        {isWidgetEditing && !isAddWidgetOpen ? (
          <WidgetInspector
            selectedWidget={visibleWidgets.find((widget) => widget.id === selectedWidgetId)}
            templates={widgetTemplates}
            onChange={patchDraftWidget}
            onClose={() => setSelectedWidgetId("")}
            onDelete={deleteWidget}
          />
        ) : null}
        {isAddWidgetOpen ? (
          <Suspense fallback={<p className="app-status-toast" role="status">Loading widget editor…</p>}>
            <AddWidgetDialog
              integrationInstances={integrationInstances}
              integrations={integrations}
              services={services}
              templates={widgetTemplates}
              onClose={() => setIsAddWidgetOpen(false)}
              onCreate={createWidget}
            />
          </Suspense>
        ) : null}

        <nav
          aria-label="Primary service launcher"
          className="launcher"
          onPointerLeave={resetDockMagnification}
          onPointerMove={updateDockMagnification}
        >
          <button
            aria-label="Open services Launchpad"
            aria-pressed={isLaunchpadOpen}
            className={isLaunchpadOpen ? "is-active" : ""}
            data-dock-item="services"
            ref={servicesLauncherRef}
            style={getDockItemStyle("services")}
            type="button"
            onBlur={resetDockMagnification}
            onFocus={() => focusDockItem("services")}
            onClick={openLaunchpad}
          >
            <span>
              <FiGrid aria-hidden="true" />
            </span>
          </button>

          {pinnedServices.map((service) => (
            <a
              aria-label={`Open ${service.name} from Dock`}
              className="dock-service-link"
              data-dock-item={service.id}
              draggable
              href={service.url}
              key={service.id}
              target="_blank"
              rel="noopener noreferrer"
              style={getDockItemStyle(service.id)}
              onBlur={resetDockMagnification}
              onDragEnd={() => setDraggedDockServiceId("")}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={(event) => {
                setDraggedDockServiceId(service.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", service.id);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const sourceServiceId = event.dataTransfer.getData("text/plain") || draggedDockServiceId;

                setDraggedDockServiceId("");
                reorderDockServices(sourceServiceId, service.id);
              }}
              onFocus={() => focusDockItem(service.id)}
            >
              <span className="dock-icon-wrap">
                <ServiceIcon service={service} compact />
              </span>
            </a>
          ))}

          {launcherUtilityItems.map((item) => {
            const Icon = item.icon;

            return (
              <button
                aria-label={`Open ${item.label}`}
                data-dock-item={item.id}
                key={item.id}
                style={getDockItemStyle(item.id)}
                type="button"
                onBlur={resetDockMagnification}
                onClick={() => openSettingsDialog(item.id)}
                onFocus={() => focusDockItem(item.id)}
              >
                <span>
                  <Icon aria-hidden="true" />
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {isLaunchpadOpen ? (
        <Launchpad
          filteredServices={filteredServices}
          isAddServiceOpen={isAddServiceOpen}
          isLoading={isLoadingServices}
          onAddService={() => setIsAddServiceOpen(true)}
          onClose={closeLaunchpad}
          onCloseAddService={() => setIsAddServiceOpen(false)}
          onCreateService={createService}
          onEditService={openServiceSettings}
          query={query}
          serviceTypes={serviceTypes}
          setQuery={setQuery}
        />
      ) : null}
      {selectedServiceSettings ? (
        <Suspense fallback={<p className="app-status-toast" role="status">Loading service settings…</p>}>
          <ServiceSettingsDialog
            service={selectedServiceSettings}
            serviceTypes={serviceTypes}
            fallbackFocusRef={servicesLauncherRef}
            onClose={() => setSelectedServiceSettings(null)}
            onEnhancementSaved={reloadDashboardData}
            onServiceDeleted={deleteServiceLocally}
            onServiceSaved={updateService}
          />
        </Suspense>
      ) : null}
      {settingsDialogMode ? (
        <Suspense fallback={<p className="app-status-toast" role="status">Loading settings…</p>}>
          <AppSettingsDialog
            backgroundPresets={availableBackgroundPresets}
            fallbackFocusRef={globalSearchRef}
            mode={settingsDialogMode}
            selectedBackgroundId={activeBackground.id}
            serviceCount={services.length}
            theme={theme}
            widgetCount={widgets.length}
            onClose={() => setSettingsDialogMode("")}
            onDeleteBackground={deleteDashboardBackground}
            onOpenMode={setSettingsDialogMode}
            onPluginsChanged={reloadDashboardData}
            onSelectBackground={selectDashboardBackground}
            onToggleTheme={toggleTheme}
            onUploadBackground={uploadDashboardBackground}
          />
        </Suspense>
      ) : null}
      {appStatus ? (
        <p className="app-status-toast" role="status" aria-live="polite" aria-atomic="true">
          {appStatus}
        </p>
      ) : null}
      {loadError ? <p className="load-error" role="status">{loadError}</p> : null}
    </main>
    </>
  );
}
