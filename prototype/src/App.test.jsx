// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "./App.jsx";
import { normalizeLoadedWidgets } from "./widgetLayout.js";
import "./setupTests.js";

const serviceTypes = [
  {
    aliases: ["media"],
    category: "Media",
    color: "#7e5bef",
    description: "Media Server",
    iconKey: "jellyfin",
    id: "jellyfin",
    name: "Jellyfin",
  },
  {
    aliases: ["torrent", "qbit"],
    category: "Download",
    color: "#2f80d1",
    description: "Download Client",
    iconKey: "qbittorrent",
    id: "qbittorrent",
    name: "qBittorrent",
  },
  {
    aliases: ["monitoring"],
    category: "Monitoring",
    color: "#f46800",
    description: "Analytics",
    iconKey: "grafana",
    id: "grafana",
    name: "Grafana",
  },
  {
    aliases: ["metrics"],
    category: "Monitoring",
    color: "#e6522c",
    description: "Monitoring",
    iconKey: "prometheus",
    id: "prometheus",
    name: "Prometheus",
  },
  {
    aliases: ["password"],
    category: "Security",
    color: "#111827",
    description: "Password Manager",
    iconKey: "vaultwarden",
    id: "vaultwarden",
    name: "Vaultwarden",
  },
  {
    aliases: ["custom"],
    category: "Custom",
    color: "#667085",
    description: "Add any service by URL",
    iconKey: "custom",
    id: "custom",
    name: "Custom URL",
  },
  {
    aliases: ["nas", "qnap.com"],
    category: "Infrastructure",
    color: "#c2410c",
    description: "QNAP Systems, Inc.",
    iconKey: "nas",
    iconKind: "preset",
    id: "qnap",
    name: "QNAP",
  },
];

const storedServices = [
  {
    category: "Media",
    color: "#7e5bef",
    description: "Media Server",
    iconKey: "jellyfin",
    iconKind: "preset",
    id: "service-jellyfin",
    name: "Jellyfin",
    status: "Online",
    typeId: "jellyfin",
    url: "http://192.0.2.20:8096",
  },
  {
    category: "Monitoring",
    color: "#f46800",
    description: "Analytics",
    iconKey: "grafana",
    iconKind: "preset",
    id: "service-grafana",
    name: "Grafana",
    pinnedToDock: true,
    dockSortOrder: 1,
    status: "Online",
    typeId: "grafana",
    url: "http://192.0.2.20:3001",
  },
  {
    category: "Monitoring",
    color: "#e6522c",
    description: "Monitoring",
    iconKey: "prometheus",
    iconKind: "preset",
    id: "service-prometheus",
    name: "Prometheus",
    status: "Online",
    typeId: "prometheus",
    url: "http://192.0.2.20:9090",
  },
  {
    category: "Security",
    color: "#111827",
    description: "Password Manager",
    iconKey: "vaultwarden",
    iconKind: "preset",
    id: "service-vaultwarden",
    name: "Vaultwarden",
    status: "Online",
    typeId: "vaultwarden",
    url: "http://192.0.2.20:8082",
  },
  {
    category: "Download",
    color: "#2f80d1",
    description: "Download Client",
    iconKey: "qbittorrent",
    iconKind: "preset",
    id: "service-qbit",
    name: "qBittorrent",
    dockSortOrder: 0,
    pinnedToDock: true,
    status: "Online",
    typeId: "qbittorrent",
    url: "http://192.0.2.20:8080",
  },
  {
    category: "Infrastructure",
    color: "#c2410c",
    description: "QNAP Systems, Inc.",
    iconKey: "nas",
    iconKind: "preset",
    id: "service-qnap",
    name: "QNAP",
    status: "Online",
    typeId: "qnap",
    url: "http://nas.example.test",
  },
];

const widgetTemplates = [
  {
    defaultLayout: { h: 1, w: 3 },
    id: "compact",
    minLayout: { h: 1, w: 2 },
    name: "Compact",
  },
  {
    defaultLayout: { h: 2, w: 4 },
    id: "wide",
    minLayout: { h: 2, w: 3 },
    name: "Wide",
  },
  {
    defaultLayout: { h: 4, w: 6 },
    id: "hero",
    minLayout: { h: 3, w: 4 },
    name: "Hero",
  },
  {
    defaultLayout: { h: 5, w: 8 },
    id: "custom-card",
    minLayout: { h: 2, w: 2 },
    name: "Custom Card",
  },
  {
    defaultLayout: { h: 3, w: 3 },
    description: "Storage capacity card with a compact trend chart.",
    id: "storage-trend",
    minLayout: { h: 2, w: 3 },
    name: "Storage Trend",
    systemOnly: true,
  },
  {
    defaultLayout: { h: 2, w: 5 },
    description: "Shortcut row for common homelab actions.",
    id: "quick-actions",
    minLayout: { h: 2, w: 4 },
    name: "Quick Actions",
    nativeOnly: true,
    systemOnly: true,
  },
  {
    defaultLayout: { h: 3, w: 6 },
    description: "Download, upload, queue, and active transfer card.",
    enhanced: {
      dataPath: "transfer",
      enhancementId: "enhancement-qbit",
      fields: [
        { format: "bytesPerSecond", key: "downloadSpeed", label: "Download" },
        { format: "bytesPerSecond", key: "uploadSpeed", label: "Upload" },
      ],
      renderer: "metric-pair",
      serviceId: "service-qbit",
      widgetId: "transfer-speed",
    },
    id: "enhanced:service-qbit:transfer-speed",
    minLayout: { h: 3, w: 6 },
    name: "Transfer Speed",
    refreshIntervalSeconds: 5,
  },
  {
    defaultLayout: { h: 3, w: 4 },
    description: "Local Codex subscription usage and reset windows.",
    id: "integration:codex-usage",
    integration: {
      color: "#10a37f",
      iconKey: "codex",
      iconKind: "preset",
      id: "codex-usage",
      renderer: "codex-usage",
    },
    minLayout: { h: 3, w: 3 },
    name: "Codex Usage",
    refreshIntervalSeconds: 300,
    systemOnly: true,
  },
  {
    defaultLayout: { h: 3, w: 2 },
    description: "Current Open-Meteo conditions for a configured location.",
    id: "integration:weather-current",
    integration: {
      color: "#d97706",
      configFields: [
        { default: "Shanghai", helpText: "City, postal code, or address search term.", key: "location", label: "Location", required: true, type: "text" },
      ],
      dataPath: "",
      iconKey: "weather",
      iconKind: "preset",
      id: "weather",
      renderer: "weather-current",
    },
    minLayout: { h: 3, w: 2 },
    name: "Weather",
    refreshIntervalSeconds: 900,
    systemOnly: true,
  },
];

const integrations = [
  {
    color: "#10a37f",
    config: "Reads ~/.codex/auth.json on this server",
    description: "Local Codex subscription usage with 5h and 7d quota windows.",
    iconKey: "codex",
    iconKind: "preset",
    id: "codex-usage",
    name: "Codex Usage",
    widgets: ["Codex Usage"],
  },
  {
    color: "#d97706",
    config: "Open-Meteo location search",
    description: "Current conditions from Open-Meteo for a configured location.",
    iconKey: "weather",
    iconKind: "preset",
    id: "weather",
    name: "Weather",
    widgets: ["Weather"],
  },
];

const storedWidgets = [
  {
    h: 4,
    id: "widget-home-focus",
    minH: 2,
    minW: 2,
    scopedCss: "",
    serviceId: null,
    style: {
      accentColor: "#17202b",
      backgroundOpacity: 0.8,
      density: "comfortable",
      radius: 22,
      showCategory: true,
      showDescription: true,
      showStatus: true,
    },
    subtitle: "Open Launchpad for all services.",
    templateId: "custom-card",
    title: "Self-hosted home base",
    url: "",
    w: 6,
    x: 3,
    y: 0,
    zIndex: 1,
  },
  {
    h: 2,
    id: "widget-qbit-status",
    minH: 2,
    minW: 2,
    scopedCss: "",
    serviceId: "service-qbit",
    style: {
      accentColor: "#2f80d1",
      backgroundOpacity: 0.76,
      density: "comfortable",
      radius: 20,
      showCategory: true,
      showDescription: true,
      showStatus: true,
    },
    subtitle: "Bound service widget",
    templateId: "wide",
    title: "Download Status",
    url: "https://widget-specific.example",
    w: 4,
    x: 0,
    y: 0,
    zIndex: 2,
  },
];

const qnapEnhancedAdapter = {
  id: "qnap",
  installed: false,
  manifest: {
    configSchema: [
      { defaultFromService: "url", key: "baseUrl", label: "Service URL", required: true, type: "url" },
      { key: "host", label: "SNMP host override", type: "text" },
      { default: 161, key: "port", label: "SNMP port", min: 1, type: "number" },
      {
        default: "v3",
        key: "snmpVersion",
        label: "SNMP version",
        options: [
          { label: "SNMPv3", value: "v3" },
          { label: "SNMPv2c", value: "v2c" },
        ],
        type: "select",
      },
      {
        default: "noAuthNoPriv",
        key: "securityLevel",
        label: "SNMPv3 security",
        options: [
          { label: "No authentication / no privacy", value: "noAuthNoPriv" },
          { label: "Authentication only", value: "authNoPriv" },
          { label: "Authentication + privacy", value: "authPriv" },
        ],
        type: "select",
      },
      { key: "username", label: "SNMPv3 username", type: "text" },
      { default: "sha", key: "authProtocol", label: "Authentication protocol", options: ["sha", "md5"], type: "select" },
      { key: "authPassword", label: "Authentication password", type: "password" },
      { default: "aes", key: "privacyProtocol", label: "Privacy protocol", options: ["aes", "des"], type: "select" },
      { key: "privacyPassword", label: "Privacy password", type: "password" },
      { key: "community", label: "SNMPv1/v2c community", type: "password" },
      { default: 3000, key: "timeoutMs", label: "Timeout", min: 500, type: "number" },
    ],
    id: "qnap",
    name: "QNAP Enhanced",
    serviceTypes: ["qnap"],
  },
  name: "QNAP Enhanced",
  sourceType: "built-in",
  widgets: [{ id: "system-overview", name: "NAS Overview", renderer: "status-summary" }],
};

function mockApi() {
  let pluginInstalled = false;
  let uploadedBackgrounds = [];
  global.fetch = vi.fn(async (url, options = {}) => {
    if (url === "/api/service-types") {
      return Response.json({
        categories: ["All", "Media", "Monitoring", "Download", "Security", "Custom"],
        serviceTypes,
      });
    }

    if (url === "/api/services" && !options.method) {
      return Response.json({ services: storedServices });
    }

    if (url === "/api/backgrounds" && !options.method) {
      return Response.json({ backgrounds: uploadedBackgrounds });
    }

    if (url === "/api/backgrounds" && options.method === "POST") {
      const { filename } = JSON.parse(options.body);
      const background = {
        createdAt: "2026-07-10T09:00:00.000Z",
        id: `custom-${"a".repeat(64)}`,
        imageUrl: `/api/backgrounds/files/${"a".repeat(64)}.png`,
        name: filename.replace(/\.[^.]+$/, ""),
        sizeBytes: 8,
      };

      uploadedBackgrounds = [background];
      return Response.json({ background }, { status: 201 });
    }

    if (String(url).startsWith("/api/backgrounds/custom-") && options.method === "DELETE") {
      uploadedBackgrounds = [];
      return new Response(null, { status: 204 });
    }

    if (url === "/api/icons" && options.method === "POST") {
      return Response.json(
        {
          icon: {
            iconKey: "custom",
            iconKind: "url",
            iconUrl: "/api/icons/uploaded-test.png",
          },
        },
        { status: 201 },
      );
    }

    if (url === "/api/widget-templates") {
      return Response.json({ templates: widgetTemplates });
    }

    if (url === "/api/integrations") {
      return Response.json({ integrations });
    }

    if (url === "/api/widgets" && !options.method) {
      return Response.json({ widgets: storedWidgets });
    }

    if (url === "/api/enhanced/adapters" && !options.method) {
      return Response.json({
        adapters: [
          {
            id: "qbittorrent",
            installed: false,
            manifest: {
              configSchema: [
                { defaultFromService: "url", key: "baseUrl", label: "Endpoint URL", required: true, type: "url" },
                { key: "username", label: "Username", required: true, type: "text" },
                { key: "password", label: "Password", required: true, type: "password" },
                { default: true, key: "includeFreeSpace", label: "Include free space", type: "boolean" },
                {
                  default: "fast",
                  key: "mode",
                  label: "Mode",
                  options: [
                    { label: "Fast", value: "fast" },
                    { label: "Careful", value: "careful" },
                  ],
                  type: "select",
                },
              ],
              id: "qbittorrent",
              name: "qBittorrent Enhanced",
              serviceTypes: ["qbittorrent"],
            },
            name: "qBittorrent Enhanced",
            sourceType: "built-in",
            widgets: [{ id: "transfer-speed", name: "Transfer Speed", renderer: "metric-pair" }],
          },
          qnapEnhancedAdapter,
        ],
      });
    }

    if (url === "/api/enhanced/registry-sources" && !options.method) {
      return Response.json({ sources: [] });
    }

    if (url === "/api/plugins" && !options.method) {
      return Response.json({
        contributions: [
          {
            description: "Synthetic endpoint status checks.",
            id: "pingdom-lite",
            installed: pluginInstalled,
            kind: "integration",
            name: "Pingdom Lite",
            sourceId: "registry-1",
            sourceName: "Homelab Plugins",
          },
        ],
        sources: [
          {
            id: "registry-1",
            lastSyncMessage: "1 integration",
            name: "GitHub Plugin Registry",
            registryIndex: { name: "Homelab Plugins" },
            trusted: true,
            url: "https://github.com/example/homelab-plugins",
          },
        ],
      });
    }

    if (url === "/api/plugins/install" && options.method === "POST") {
      pluginInstalled = true;
      return Response.json({ plugin: { id: "pingdom-lite" } }, { status: 201 });
    }

    if (url === "/api/enhanced/adapters/install" && options.method === "POST") {
      const installInput = JSON.parse(options.body);

      if (installInput.adapterId === "qnap") {
        return Response.json(
          {
            adapter: {
              ...qnapEnhancedAdapter,
              installed: true,
            },
          },
          { status: 201 },
        );
      }

      return Response.json(
        {
          adapter: {
            id: "qbittorrent",
            installed: true,
            manifest: {
              configSchema: [
                { defaultFromService: "url", key: "baseUrl", label: "Endpoint URL", required: true, type: "url" },
                { key: "username", label: "Username", required: true, type: "text" },
                { key: "password", label: "Password", required: true, type: "password" },
                { default: true, key: "includeFreeSpace", label: "Include free space", type: "boolean" },
                {
                  default: "fast",
                  key: "mode",
                  label: "Mode",
                  options: [
                    { label: "Fast", value: "fast" },
                    { label: "Careful", value: "careful" },
                  ],
                  type: "select",
                },
              ],
              id: "qbittorrent",
              name: "qBittorrent Enhanced",
              serviceTypes: ["qbittorrent"],
            },
            name: "qBittorrent Enhanced",
            sourceType: "built-in",
            widgets: [{ id: "transfer-speed", name: "Transfer Speed", renderer: "metric-pair" }],
          },
        },
        { status: 201 },
      );
    }

    if (String(url).endsWith("/enhancement") && !options.method) {
      return Response.json({ enhancement: null });
    }

    if (String(url).endsWith("/enhancement") && options.method === "PUT") {
      const body = JSON.parse(options.body);
      const serviceId = String(url).replace("/api/services/", "").replace("/enhancement", "");
      return Response.json({ enhancement: { ...body, id: `enhancement-${serviceId}`, serviceId } });
    }

    if (String(url).endsWith("/enhancement/test") && options.method === "POST") {
      return Response.json({
        result: { ok: true, message: "Login cookie valid and transfer API reachable" },
      });
    }

    if (url === "/api/widgets" && options.method === "POST") {
      return Response.json(
        {
          widget: {
            ...storedWidgets[0],
            h: 5,
            id: "widget-docs",
            subtitle: "Internal docs",
            templateId: "custom-card",
            title: "Docs Hub",
            url: "https://docs.home",
            w: 8,
            x: 0,
            y: 0,
          },
        },
        { status: 201 },
      );
    }

    if (url === "/api/widgets" && options.method === "PUT") {
      const body = JSON.parse(options.body);

      return Response.json({
        widgets: body.widgets.map((widget) => ({
          ...storedWidgets[0],
          ...widget,
        })),
      });
    }

    if (String(url).startsWith("/api/widgets/") && options.method === "PATCH") {
      return Response.json({
        widget: {
          ...storedWidgets[0],
          ...JSON.parse(options.body),
          id: String(url).replace("/api/widgets/", ""),
        },
      });
    }

    if (String(url).startsWith("/api/widgets/") && options.method === "DELETE") {
      return new Response(null, { status: 204 });
    }

    if (String(url).startsWith("/api/services/") && options.method === "PATCH") {
      const body = JSON.parse(options.body);

      return Response.json({
        service: {
          ...storedServices.find((service) => String(url).endsWith(service.id)),
          ...body,
          id: String(url).replace("/api/services/", ""),
        },
      });
    }

    if (String(url).startsWith("/api/services/") && options.method === "DELETE") {
      return new Response(null, { status: 204 });
    }

    if (url === "/api/dock" && options.method === "PUT") {
      const { serviceIds } = JSON.parse(options.body);

      return Response.json({
        services: storedServices.map((service) => {
          const index = serviceIds.indexOf(service.id);

          return index === -1
            ? service
            : {
                ...service,
                dockSortOrder: index,
                pinnedToDock: true,
              };
        }),
      });
    }

    if (url === "/api/services" && options.method === "POST") {
      return Response.json(
        {
          service: {
            category: "Download",
            color: "#2f80d1",
            description: "Download Client",
            iconKey: "qbittorrent",
            iconKind: "preset",
            id: "service-qbit-new",
            name: "qBittorrent",
            pinnedToDock: false,
            status: "Online",
            typeId: "qbittorrent",
            url: "http://192.0.2.55:8080",
          },
        },
        { status: 201 },
      );
    }

    return Response.json({ error: "not found" }, { status: 404 });
  });
}

async function openServiceSettingsFromLaunchpad(user, serviceName = "qBittorrent") {
  const launchpad = screen.getByRole("dialog", { name: /launchpad/i });
  await user.click(within(launchpad).getByRole("button", { name: new RegExp(`open ${serviceName} actions`, "i") }));
  await user.click(within(launchpad).getByRole("button", { name: new RegExp(`^edit ${serviceName}$`, "i") }));
}

describe("Homelab navigation dashboard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockApi();
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("uses the selected Orbit Cut mark for the page icon assets", () => {
    const indexHtml = readFileSync("index.html", "utf8");
    const iconSvg = readFileSync("public/orbit-cut-icon.svg", "utf8");

    expect(indexHtml).toContain('rel="icon"');
    expect(indexHtml).toContain('href="/orbit-cut-icon.svg"');
    expect(indexHtml).toContain('rel="apple-touch-icon"');
    expect(iconSvg).toContain("<title>Orbit Cut</title>");
    expect(iconSvg).not.toContain("<rect");
    expect(iconSvg).toContain("M14 40.5");
  });

  test("defines dark-mode colors for Add Widget template cards", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\[data-theme="dark"\]\s+\.widget-template-list button\s*\{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.055\);[^}]*color:\s*#f6eee2;/s);
    expect(styles).toMatch(/\[data-theme="dark"\]\s+\.widget-template-list button small\s*\{[^}]*color:\s*#aeb8c3;/s);
    expect(styles).toMatch(/\[data-theme="dark"\]\s+\.widget-template-list button\.is-selected\s*\{[^}]*background:\s*rgba\(244,\s*189,\s*99,\s*0\.18\);/s);
  });

  test("defines dark-mode colors for Add Service type choices", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\[data-theme="dark"\]\s+\.service-type-list button\s*\{[^}]*color:\s*#f6eee2;/s);
    expect(styles).toMatch(/\[data-theme="dark"\]\s+\.service-type-list button small\s*\{[^}]*color:\s*#aeb8c3;/s);
    expect(styles).toMatch(/\[data-theme="dark"\]\s+\.service-type-list button\.is-selected small\s*\{[^}]*color:\s*#2f3a43;/s);
  });

  test("defines dark-mode colors for Widget Inspector template cards", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\[data-theme="dark"\]\s+\.inspector-template-grid button:not\(\.is-selected\)\s*\{[^}]*color:\s*#f6eee2;/s);
    expect(styles).toMatch(/\[data-theme="dark"\]\s+\.inspector-template-grid button:not\(\.is-selected\) small\s*\{[^}]*color:\s*#aeb8c3;/s);
  });

  test("keeps widget refresh controls quiet until hover or focus", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.widget-refresh-control\s*\{[^}]*border:\s*1px solid transparent;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
    expect(styles).toMatch(/\.widget-frame-root:hover\s+\.widget-refresh-control,[\s\S]*?\.widget-refresh-control\.is-refreshing\s*\{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.78\);/s);
    expect(styles).toMatch(/\[data-theme="dark"\]\s+\.widget-frame-root:hover\s+\.widget-refresh-control,[\s\S]*?\[data-theme="dark"\]\s+\.widget-refresh-control\.is-refreshing\s*\{[^}]*background:\s*rgba\(18,\s*24,\s*31,\s*0\.72\);/s);
  });

  test("keeps Settings stats cards dark in the dark theme", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\[data-theme="dark"\]\s+\.settings-stats div\s*\{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.055\);/s);
    expect(styles).toMatch(/\[data-theme="dark"\]\s+\.settings-stats dt\s*\{[^}]*color:\s*#aeb8c3;/s);
    expect(styles).toMatch(/\[data-theme="dark"\]\s+\.settings-stats dd\s*\{[^}]*color:\s*#f6eee2;/s);
  });

  test("keeps search inputs from drawing an inner focus box", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.command-bar input,[\s\S]*?\.launchpad-search input\s*\{[^}]*appearance:\s*none;[^}]*outline:\s*0;[^}]*box-shadow:\s*none;/s);
    expect(styles).toMatch(/\.command-bar input:focus,[\s\S]*?\.launchpad-search input:focus-visible\s*\{[^}]*outline:\s*0;[^}]*box-shadow:\s*none;/s);
    expect(styles).toMatch(/\.command-bar:focus-within,[\s\S]*?\.launchpad-search:focus-within\s*\{[^}]*border-color:\s*rgba\(11,\s*92,\s*173,\s*0\.72\);/s);
  });

  test("keeps the dock frame frosted while magnified items can protrude", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toMatch(/\.launcher\s*\{[^}]*align-items:\s*flex-end;[^}]*height:\s*70px;[^}]*overflow:\s*visible;[^}]*padding:\s*0 8px 8px;[^}]*border:\s*1px\s+solid\s+rgba\(23,\s*32,\s*43,\s*0\.2\);[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.22\);[^}]*backdrop-filter:\s*blur\(22px\) saturate\(130%\);/s);
    expect(styles).toMatch(/\.launcher button,[\s\S]*?\.launcher a\s*\{[^}]*color:\s*#17202b;[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.72\);/s);
    expect(styles).toMatch(/\[data-theme="dark"\]\s+\.launcher\s*\{[^}]*border-color:\s*rgba\(238,\s*214,\s*178,\s*0\.24\);[^}]*background:\s*rgba\(10,\s*13,\s*17,\s*0\.34\);[^}]*backdrop-filter:\s*blur\(22px\) saturate\(130%\);/s);
    expect(styles).toMatch(/\[data-theme="dark"\]\s+\.launcher button,[\s\S]*?\[data-theme="dark"\]\s+\.launcher a\s*\{[^}]*background:\s*#120f17;/s);
  });

  test("keeps Launchpad hidden until the Services launcher opens it as an overlay", async () => {
    const user = userEvent.setup();

    render(<App />);

    await waitFor(() => expect(document.title).toBe("Oh No Selfhosted"));
    expect(screen.getByRole("heading", { name: "Oh No Selfhosted" })).toBeInTheDocument();
    expect(screen.getByTestId("home-server-mark")).toHaveAttribute("data-mark", "orbit-cut");
    expect(screen.getByTestId("home-server-mark")).toHaveAttribute("data-variant", "transparent-svg");
    expect(await screen.findByText("Self-hosted home base")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /launchpad/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open qbittorrent from dock/i })).toHaveAttribute(
      "href",
      "http://192.0.2.20:8080",
    );
    expect(global.fetch).toHaveBeenCalledWith("/api/widget-templates");
    expect(global.fetch).toHaveBeenCalledWith("/api/integrations");
    expect(global.fetch).toHaveBeenCalledWith("/api/widgets");
    expect(global.fetch).toHaveBeenCalledWith("/api/backgrounds");

    await user.click(screen.getByRole("button", { name: /open services launchpad/i }));

    const launchpad = screen.getByRole("dialog", { name: /launchpad/i });

    expect(launchpad).toBeInTheDocument();
    await waitFor(() => expect(within(launchpad).getByRole("button", { name: /close launchpad/i })).toHaveFocus());
    expect(screen.getByTestId("launchpad-pages")).not.toHaveAttribute("aria-label");
    expect(screen.getByTestId("dashboard-shell")).toHaveClass("is-launchpad-open");
    expect(screen.getByRole("button", { name: /open services launchpad/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Self-hosted home base")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close launchpad/i }));

    expect(screen.queryByRole("dialog", { name: /launchpad/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("dashboard-shell")).not.toHaveClass("is-launchpad-open");
  });

  test("renders the Dock as icon-only items with pointer magnification", async () => {
    render(<App />);

    await screen.findByText("Self-hosted home base");

    const launcher = screen.getByRole("navigation", { name: /primary service launcher/i });
    const servicesLauncher = within(launcher).getByRole("button", { name: /open services launchpad/i });

    expect(within(launcher).queryByText("Services")).not.toBeInTheDocument();
    expect(within(launcher).queryByText("qBittorrent")).not.toBeInTheDocument();
    expect(servicesLauncher).toHaveAttribute("data-dock-item", "services");
    expect(servicesLauncher.style.getPropertyValue("--dock-item-size")).toBe("54px");

    servicesLauncher.getBoundingClientRect = () => ({
      bottom: 70,
      height: 54,
      left: 73,
      right: 127,
      top: 16,
      width: 54,
      x: 73,
      y: 20,
      toJSON: () => {},
    });

    fireEvent.pointerMove(launcher, { clientX: 100 });

    await waitFor(() => expect(servicesLauncher.style.getPropertyValue("--dock-scale")).toBe("1.72"));
    expect(servicesLauncher.style.getPropertyValue("--dock-item-size")).toBe("93px");
  });

  test("renders the brand title with the Shuffle text treatment", async () => {
    render(<App />);

    await screen.findByText("Self-hosted home base");

    const heading = screen.getByRole("heading", { name: "Oh No Selfhosted" });
    const visualLayer = heading.querySelector(".shuffle-visual");
    const firstStrip = heading.querySelector(".shuffle-char-strip");

    expect(heading).toHaveClass("brand-shuffle-title");
    expect(heading).toHaveAttribute("aria-label", "Oh No Selfhosted");
    expect(heading).toHaveAttribute("data-shuffle-direction", "down");
    expect(heading).toHaveAttribute("data-shuffle-loop", "true");
    expect(heading).toHaveAttribute("data-shuffle-loop-delay", "1.5");
    expect(visualLayer).toHaveAttribute("aria-hidden", "true");
    expect(firstStrip.style.getPropertyValue("--shuffle-duration")).toBe("0.7s");
    expect(heading.querySelectorAll(".shuffle-char-wrapper")).toHaveLength(16);
  });

  test("refreshes realtime enhanced widget data without reloading widgets", async () => {
    const baseFetch = global.fetch;
    let widgetLoads = 0;
    let refreshes = 0;
    const realtimeWidget = {
      ...storedWidgets[0],
      enhancedData: {
        downloadSpeed: 1024 * 1024,
        uploadSpeed: 0,
      },
      enhancedRenderer: {
        dataPath: "transfer",
        fields: [
          { format: "bytesPerSecond", key: "downloadSpeed", label: "Download" },
          { format: "bytesPerSecond", key: "uploadSpeed", label: "Upload" },
        ],
        renderer: "metric-pair",
      },
      enhancedStateStatus: "ok",
      enhancedWidgetId: "transfer-speed",
      enhancementId: "enhancement-qbit",
      h: 2,
      id: "widget-qbit-transfer",
      refreshIntervalSeconds: 1,
      serviceId: "service-qbit",
      templateId: "enhanced:service-qbit:transfer-speed",
      title: "qBittorrent Transfer Speed",
      w: 4,
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === "/api/widgets" && !options.method) {
        widgetLoads += 1;
        return Response.json({ widgets: [...storedWidgets, realtimeWidget] });
      }

      if (url === "/api/services/service-qbit/enhancement/refresh" && options.method === "POST") {
        refreshes += 1;
        return Response.json({
          state: {
            state: {
              transfer: {
                downloadSpeed: 2 * 1024 * 1024,
                uploadSpeed: 512 * 1024,
              },
            },
            status: "ok",
          },
        });
      }

      return baseFetch(url, options);
    });

    render(<App />);

    expect(await screen.findByText("qBittorrent Transfer Speed")).toBeInTheDocument();
    expect(screen.getByText("1.0 MB/s")).toBeInTheDocument();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    });

    await waitFor(() => expect(screen.getByText("2.0 MB/s")).toBeInTheDocument());
    expect(refreshes).toBeGreaterThanOrEqual(1);
    expect(widgetLoads).toBe(1);
  });

  test("manually refreshes enhanced widget data without reloading widgets", async () => {
    const user = userEvent.setup();
    const baseFetch = global.fetch;
    let widgetLoads = 0;
    let refreshes = 0;
    const realtimeWidget = {
      ...storedWidgets[0],
      enhancedData: {
        downloadSpeed: 1024 * 1024,
        uploadSpeed: 0,
      },
      enhancedRenderer: {
        dataPath: "transfer",
        fields: [
          { format: "bytesPerSecond", key: "downloadSpeed", label: "Download" },
          { format: "bytesPerSecond", key: "uploadSpeed", label: "Upload" },
        ],
        renderer: "metric-pair",
      },
      enhancedStateStatus: "ok",
      enhancedWidgetId: "transfer-speed",
      enhancementId: "enhancement-qbit",
      h: 2,
      id: "widget-qbit-transfer",
      refreshIntervalSeconds: 0,
      serviceId: "service-qbit",
      templateId: "enhanced:service-qbit:transfer-speed",
      title: "qBittorrent Transfer Speed",
      w: 4,
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === "/api/widgets" && !options.method) {
        widgetLoads += 1;
        return Response.json({ widgets: [...storedWidgets, realtimeWidget] });
      }

      if (url === "/api/services/service-qbit/enhancement/refresh" && options.method === "POST") {
        refreshes += 1;
        return Response.json({
          state: {
            state: {
              transfer: {
                downloadSpeed: 3 * 1024 * 1024,
                uploadSpeed: 768 * 1024,
              },
            },
            status: "ok",
          },
        });
      }

      return baseFetch(url, options);
    });

    render(<App />);

    expect(await screen.findByText("qBittorrent Transfer Speed")).toBeInTheDocument();
    expect(screen.getByText("1.0 MB/s")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /refresh qbittorrent transfer speed data/i }));

    await waitFor(() => expect(screen.getByText("3.0 MB/s")).toBeInTheDocument());
    expect(refreshes).toBe(1);
    expect(widgetLoads).toBe(1);
  });

  test("manually refreshes integration widget data without reloading widgets", async () => {
    const user = userEvent.setup();
    const baseFetch = global.fetch;
    let widgetLoads = 0;
    let refreshes = 0;
    const codexWidget = {
      ...storedWidgets[0],
      enhancedData: {
        available: true,
        windows: [
          {
            code: "5h",
            label: "5 hour",
            limit: 100,
            percentRemaining: 88,
            percentUsed: 12,
            remaining: 88,
            resetAt: "2026-07-04T18:00:00.000Z",
            used: 12,
          },
          {
            code: "7d",
            label: "7 day",
            limit: 400,
            percentRemaining: 80,
            percentUsed: 20,
            remaining: 320,
            resetAt: "2026-07-08T00:00:00.000Z",
            used: 80,
          },
        ],
      },
      enhancedRenderer: { renderer: "codex-usage" },
      h: 2,
      id: "widget-codex-usage",
      integrationId: "codex-usage",
      refreshIntervalSeconds: 0,
      serviceId: null,
      templateId: "integration:codex-usage",
      title: "Codex Usage",
      w: 4,
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === "/api/widgets" && !options.method) {
        widgetLoads += 1;
        return Response.json({ widgets: [...storedWidgets, codexWidget] });
      }

      if (url === "/api/integrations/codex-usage/refresh" && options.method === "POST") {
        refreshes += 1;
        return Response.json({
          state: {
            available: true,
            windows: [
              {
                code: "5h",
                label: "5 hour",
                limit: 100,
                percentRemaining: 42,
                percentUsed: 58,
                remaining: 42,
                resetAt: "2026-07-04T18:00:00.000Z",
                used: 58,
              },
              {
                code: "7d",
                label: "7 day",
                limit: 400,
                percentRemaining: 75,
                percentUsed: 25,
                remaining: 300,
                resetAt: "2026-07-08T00:00:00.000Z",
                used: 100,
              },
            ],
          },
        });
      }

      return baseFetch(url, options);
    });

    render(<App />);

    expect(await screen.findByText("Codex Usage")).toBeInTheDocument();
    expect(screen.getByText("88%")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /refresh codex usage data/i }));

    await waitFor(() => expect(screen.getByText("42%")).toBeInTheDocument());
    expect(refreshes).toBe(1);
    expect(widgetLoads).toBe(1);
  });

  test("renders widgets while integration data is still querying", async () => {
    const baseFetch = global.fetch;
    let resolveRefresh;
    const refreshResponse = new Promise((resolve) => {
      resolveRefresh = resolve;
    });
    const codexWidget = {
      ...storedWidgets[0],
      enhancedData: null,
      enhancedRenderer: { renderer: "codex-usage" },
      enhancedStateStatus: "querying",
      h: 3,
      id: "widget-codex-querying",
      integrationId: "codex-usage",
      refreshIntervalSeconds: 300,
      serviceId: null,
      templateId: "integration:codex-usage",
      title: "Codex Usage",
      w: 4,
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === "/api/widgets" && !options.method) {
        return Response.json({ widgets: [...storedWidgets, codexWidget] });
      }

      if (url === "/api/integrations/codex-usage/refresh" && options.method === "POST") {
        return refreshResponse;
      }

      return baseFetch(url, options);
    });

    render(<App />);

    expect(await screen.findByText("Self-hosted home base")).toBeInTheDocument();
    expect(screen.getByText("Codex Usage")).toBeInTheDocument();
    expect(screen.getByText(/querying codex usage/i)).toBeInTheDocument();

    resolveRefresh(
      Response.json({
        state: {
          available: true,
          resetCreditSummary: { availableCount: 0, totalEarnedCount: 0 },
          resetCredits: [],
          windows: [
            {
              code: "5h",
              label: "5 hour",
              limit: 100,
              percentRemaining: 88,
              percentUsed: 12,
              remaining: 88,
              resetAt: "2026-07-04T18:00:00.000Z",
              used: 12,
            },
          ],
        },
      }),
    );

    await waitFor(() => expect(screen.getByText("88%")).toBeInTheDocument());
  });

  test("retries querying widgets after a later widget save returns querying state", async () => {
    const user = userEvent.setup();
    const baseFetch = global.fetch;
    let refreshes = 0;
    const codexWidget = {
      ...storedWidgets[0],
      enhancedData: null,
      enhancedRenderer: { renderer: "codex-usage" },
      enhancedStateStatus: "querying",
      h: 3,
      id: "widget-codex-querying",
      integrationId: "codex-usage",
      refreshIntervalSeconds: 300,
      serviceId: null,
      templateId: "integration:codex-usage",
      title: "Codex Usage",
      w: 4,
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === "/api/widgets" && !options.method) {
        return Response.json({ widgets: [codexWidget] });
      }

      if (url === "/api/widgets" && options.method === "PUT") {
        return Response.json({ widgets: [codexWidget] });
      }

      if (url === "/api/integrations/codex-usage/refresh" && options.method === "POST") {
        refreshes += 1;

        return Response.json({
          state: {
            available: true,
            windows: [
              {
                code: "5h",
                label: "5 hour",
                limit: 100,
                percentRemaining: refreshes === 1 ? 88 : 77,
                percentUsed: refreshes === 1 ? 12 : 23,
                remaining: refreshes === 1 ? 88 : 77,
                resetAt: "2026-07-04T18:00:00.000Z",
                used: refreshes === 1 ? 12 : 23,
              },
            ],
          },
        });
      }

      return baseFetch(url, options);
    });

    render(<App />);

    expect(await screen.findByText("88%")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /edit widgets/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(screen.getByText("77%")).toBeInTheDocument());
    expect(refreshes).toBe(2);
  });

  test("closes Launchpad with Escape and returns focus to the Services launcher", async () => {
    const user = userEvent.setup();

    render(<App />);

    const servicesLauncher = screen.getByRole("button", { name: /open services launchpad/i });
    await user.click(servicesLauncher);
    const launchpad = screen.getByRole("dialog", { name: /launchpad/i });

    await waitFor(() => expect(launchpad).toContainElement(document.activeElement));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: /launchpad/i })).not.toBeInTheDocument();
    expect(servicesLauncher).toHaveFocus();
  });

  test("keeps the skip link out of modal overlay states", async () => {
    const user = userEvent.setup();

    render(<App />);

    const skipLink = screen.getByRole("link", { name: /skip to main content/i });
    expect(skipLink).not.toHaveAttribute("hidden");

    await user.click(screen.getByRole("button", { name: /open services launchpad/i }));

    expect(skipLink).toHaveAttribute("hidden");

    await user.keyboard("{Escape}");

    expect(skipLink).not.toHaveAttribute("hidden");
  });

  test("closes Launchpad when the desktop overlay is clicked", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: /open services launchpad/i }));
    const launchpad = screen.getByRole("dialog", { name: /launchpad/i });

    await user.click(launchpad);
    expect(launchpad).toBeInTheDocument();

    await user.click(screen.getByTestId("launchpad-overlay"));

    expect(screen.queryByRole("dialog", { name: /launchpad/i })).not.toBeInTheDocument();
  });

  test("shows all Launchpad services and filters by search", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: /open services launchpad/i }));
    const launchpad = screen.getByRole("dialog", { name: /launchpad/i });

    expect(within(launchpad).queryByLabelText(/service categories/i)).not.toBeInTheDocument();
    expect(within(launchpad).queryByRole("button", { name: "Monitoring" })).not.toBeInTheDocument();
    expect(screen.getByTestId("launchpad-pages").children).toHaveLength(1);
    expect(within(launchpad).getByText("Grafana")).toBeInTheDocument();
    expect(within(launchpad).getByText("Prometheus")).toBeInTheDocument();
    expect(within(launchpad).getByText("Jellyfin")).toBeInTheDocument();
    expect(within(launchpad).queryByText("Online")).not.toBeInTheDocument();

    await user.clear(within(launchpad).getByRole("searchbox", { name: /search services/i }));
    await user.type(within(launchpad).getByRole("searchbox", { name: /search services/i }), "vault");

    expect(within(launchpad).getByText("Vaultwarden")).toBeInTheDocument();
    expect(within(launchpad).queryByText("Grafana")).not.toBeInTheDocument();
  });

  test("announces empty Launchpad search results and offers a clear action", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: /open services launchpad/i }));
    const launchpad = screen.getByRole("dialog", { name: /launchpad/i });
    const search = within(launchpad).getByRole("searchbox", { name: /search services/i });

    await user.clear(search);
    await user.type(search, "notfound");

    expect(within(launchpad).getByText(/no services match "notfound"/i)).toBeInTheDocument();
    expect(within(launchpad).getByRole("status")).toHaveTextContent("No services found");

    await user.click(within(launchpad).getByRole("button", { name: /clear service search/i }));

    expect(search).toHaveValue("");
    expect(within(launchpad).getByText("Grafana")).toBeInTheDocument();
  });

  test("global search exposes services and commands, and keyboard shortcut focuses it", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByText("Self-hosted home base");
    const globalSearch = screen.getByRole("combobox", { name: /global search/i });
    expect(screen.queryByText("⌘ K")).not.toBeInTheDocument();

    await user.keyboard("{Meta>}k{/Meta}");
    expect(globalSearch).toHaveFocus();

    await user.type(globalSearch, "settings");
    expect(screen.getByRole("listbox", { name: /global search results/i })).toBeInTheDocument();
    const settingsOption = screen.getByRole("option", { name: /open settings/i });

    expect(settingsOption).toBeInTheDocument();

    await user.keyboard("{ArrowDown}");
    expect(globalSearch).toHaveFocus();
    expect(settingsOption).toHaveAttribute("aria-selected", "true");
    expect(globalSearch).toHaveAttribute("aria-activedescendant", settingsOption.id);

    await user.click(settingsOption);

    expect(await screen.findByRole("dialog", { name: /settings/i })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: /settings/i })).not.toBeInTheDocument();
    expect(globalSearch).toHaveFocus();
  });

  test("topbar and dock settings/profile controls open implemented dialogs", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByText("Self-hosted home base");
    const topActions = document.querySelector(".top-actions");
    await user.click(within(topActions).getByRole("button", { name: /^open settings$/i }));

    const settingsDialog = await screen.findByRole("dialog", { name: /^settings$/i });
    expect(settingsDialog).toBeInTheDocument();
    expect(within(settingsDialog).getByRole("radio", { name: /alpine lake/i })).toBeChecked();
    await user.click(within(settingsDialog).getByRole("radio", { name: /night server/i }));
    expect(screen.getByRole("main")).toHaveAttribute("data-background-id", "night-server");
    expect(window.localStorage.getItem("oh-no-selfhosted-background")).toBe("night-server");
    await user.click(within(settingsDialog).getByRole("radio", { name: /lightfall/i }));
    expect(screen.getByRole("main")).toHaveAttribute("data-background-id", "lightfall");
    expect(screen.getByTestId("lightfall-background")).toHaveAttribute("aria-hidden", "true");
    expect(window.localStorage.getItem("oh-no-selfhosted-background")).toBe("lightfall");
    await user.click(within(settingsDialog).getByRole("radio", { name: /shape grid/i }));
    expect(screen.getByRole("main")).toHaveAttribute("data-background-id", "shape-grid");
    expect(screen.getByTestId("shape-grid-background")).toHaveAttribute("aria-hidden", "true");
    expect(window.localStorage.getItem("oh-no-selfhosted-background")).toBe("shape-grid");
    await user.keyboard("{Escape}");
    expect(within(topActions).getByRole("button", { name: /^open settings$/i })).toHaveFocus();

    await user.click(within(topActions).getByRole("button", { name: /^open profile$/i }));
    expect(await screen.findByRole("dialog", { name: /^profile$/i })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    const launcher = screen.getByRole("navigation", { name: /primary service launcher/i });
    await user.click(within(launcher).getByRole("button", { name: /^open settings$/i }));
    expect(await screen.findByRole("dialog", { name: /^settings$/i })).toBeInTheDocument();
  });

  test("shows the external plugin execution policy in Settings without exposing a web toggle", async () => {
    const user = userEvent.setup();
    const baseFetch = global.fetch;

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === "/api/plugins" && !options.method) {
        return Response.json({
          builtInRegistry: { id: "oh-no-builtins", name: "Built-ins" },
          contributions: [],
          externalPluginsEnabled: false,
          invalidPlugins: [],
          sources: [],
        });
      }

      return baseFetch(url, options);
    });

    render(<App />);

    await screen.findByText("Self-hosted home base");
    await user.click(within(document.querySelector(".top-actions")).getByRole("button", { name: /^open settings$/i }));

    const dialog = await screen.findByRole("dialog", { name: /^settings$/i });
    expect(await within(dialog).findByLabelText("External plugin execution status")).toHaveTextContent(
      "allowUnsafePlugins=false",
    );
    expect(within(dialog).getByText(/built-in plugins remain enabled/i)).toBeInTheDocument();
    expect(within(dialog).queryByRole("checkbox", { name: /external plugin execution/i })).not.toBeInTheDocument();
  });

  test("uploads, selects, and deletes a custom dashboard background", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByText("Self-hosted home base");
    await user.click(within(document.querySelector(".top-actions")).getByRole("button", { name: /^open settings$/i }));

    const dialog = screen.getByRole("dialog", { name: /^settings$/i });
    const file = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "Studio Wall.png", {
      type: "image/png",
    });

    await user.upload(within(dialog).getByLabelText(/upload custom background/i), file);

    const customBackground = await within(dialog).findByRole("radio", { name: /studio wall/i });

    expect(customBackground).toBeChecked();
    expect(screen.getByRole("main")).toHaveAttribute("data-background-id", `custom-${"a".repeat(64)}`);
    expect(screen.getByRole("main").style.getPropertyValue("--dashboard-background")).toContain(
      `/api/backgrounds/files/${"a".repeat(64)}.png`,
    );
    expect(window.localStorage.getItem("oh-no-selfhosted-background")).toBe(`custom-${"a".repeat(64)}`);

    await user.click(within(dialog).getByRole("button", { name: /delete studio wall background/i }));

    await waitFor(() => expect(within(dialog).queryByRole("radio", { name: /studio wall/i })).not.toBeInTheDocument());
    expect(screen.getByRole("main")).toHaveAttribute("data-background-id", "alpine-lake");
    expect(window.localStorage.getItem("oh-no-selfhosted-background")).toBe("alpine-lake");
    expect(global.fetch).toHaveBeenCalledWith(`/api/backgrounds/custom-${"a".repeat(64)}`, { method: "DELETE" });
  });

  test("restores a previously selected uploaded background after reload", async () => {
    const backgroundId = `custom-${"b".repeat(64)}`;
    const baseFetch = global.fetch;

    window.localStorage.setItem("oh-no-selfhosted-background", backgroundId);
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === "/api/backgrounds" && !options.method) {
        return Response.json({
          backgrounds: [
            {
              createdAt: "2026-07-10T09:00:00.000Z",
              id: backgroundId,
              imageUrl: `/api/backgrounds/files/${"b".repeat(64)}.webp`,
              name: "Server Room",
              sizeBytes: 1024,
            },
          ],
        });
      }

      return baseFetch(url, options);
    });

    render(<App />);

    await screen.findByText("Self-hosted home base");
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-background-id", backgroundId));
    expect(screen.getByRole("main").style.getPropertyValue("--dashboard-background")).toContain(
      `/api/backgrounds/files/${"b".repeat(64)}.webp`,
    );
  });

  test("manages GitHub plugin registry contributions from Settings", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByText("Self-hosted home base");
    await user.click(within(document.querySelector(".top-actions")).getByRole("button", { name: /^open settings$/i }));
    await user.click(screen.getByRole("button", { name: /^plugins$/i }));

    const dialog = screen.getByRole("dialog", { name: /^plugins$/i });
    expect(await within(dialog).findByText(/remote plugins run with full local app access/i)).toBeInTheDocument();
    expect(await within(dialog).findByText("Pingdom Lite")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /^install$/i }));

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/plugins/install",
      expect.objectContaining({
        body: JSON.stringify({
          kind: "integration",
          pluginId: "pingdom-lite",
          sourceId: "registry-1",
        }),
        method: "POST",
      }),
    );
    expect(await within(dialog).findByRole("button", { name: /^reinstall$/i })).toBeInTheDocument();
    expect(await within(dialog).findByRole("button", { name: /^uninstall$/i })).toBeInTheDocument();
  });

  test("switches the dashboard between light and dark themes and persists the choice", async () => {
    const user = userEvent.setup();

    const { unmount } = render(<App />);

    await screen.findByText("Self-hosted home base");
    expect(screen.getByRole("main")).toHaveAttribute("data-theme", "light");

    await user.click(screen.getByRole("button", { name: /switch to dark theme/i }));

    expect(screen.getByRole("main")).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("oh-no-selfhosted-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: /switch to light theme/i })).toHaveAttribute("aria-pressed", "true");

    unmount();
    render(<App />);

    await screen.findByText("Self-hosted home base");
    expect(screen.getByRole("main")).toHaveAttribute("data-theme", "dark");
  });

  test("keeps Codex Usage readable in the dark theme", () => {
    const styles = readFileSync("src/styles.css", "utf8");

    expect(styles).toContain('[data-theme="dark"] .codex-usage-window-top strong');
    expect(styles).toContain('[data-theme="dark"] .codex-usage-window p');
    expect(styles).toContain('[data-theme="dark"] .codex-usage-footer strong');
    expect(styles).toContain('[data-theme="dark"] .codex-reset-credit-detail strong');
    expect(styles).toContain('[data-theme="dark"] .codex-usage-empty');
  });

  test("opens service actions from a three-dot menu instead of a persistent Edit button", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: /open services launchpad/i }));
    const launchpad = screen.getByRole("dialog", { name: /launchpad/i });

    expect(within(launchpad).queryByRole("button", { name: /^edit qbittorrent$/i })).not.toBeInTheDocument();

    const actionsButton = within(launchpad).getByRole("button", { name: /open qbittorrent actions/i });
    expect(actionsButton).toHaveAttribute("aria-expanded", "false");

    await user.click(actionsButton);

    expect(actionsButton).toHaveAttribute("aria-expanded", "true");
    await user.click(within(launchpad).getByRole("button", { name: /^edit qbittorrent$/i }));

    expect(await screen.findByRole("dialog", { name: /service settings/i })).toBeInTheDocument();
  });

  test("adds a qBittorrent service and keeps its service link usable", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: /open services launchpad/i }));
    const launchpad = screen.getByRole("dialog", { name: /launchpad/i });

    await user.click(within(launchpad).getByRole("button", { name: /add service/i }));

    const addDialog = screen.getByRole("dialog", { name: /add service/i });
    expect(addDialog.tagName).not.toBe("FORM");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await waitFor(() => expect(within(addDialog).getByRole("searchbox", { name: /search service type/i })).toHaveFocus());
    await user.type(within(addDialog).getByRole("searchbox", { name: /search service type/i }), "qbit");
    await user.click(within(addDialog).getByRole("radio", { name: /qbittorrent download client/i }));
    expect(within(addDialog).getByRole("radio", { name: /qbittorrent download client/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.clear(within(addDialog).getByLabelText(/service url/i));
    await user.type(within(addDialog).getByLabelText(/service url/i), "http://192.0.2.55:8080");
    await user.click(within(addDialog).getByRole("button", { name: /^add service$/i }));

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/services",
      expect.objectContaining({
        body: JSON.stringify({
          name: "qBittorrent",
          typeId: "qbittorrent",
          url: "http://192.0.2.55:8080",
        }),
        method: "POST",
      }),
    );

    const addedServices = await screen.findAllByRole("link", { name: /open qbittorrent/i });
    expect(addedServices.at(-1)).toHaveAttribute("href", "http://192.0.2.55:8080");
    expect(addedServices.at(-1)).toHaveAttribute("target", "_blank");
    expect(addedServices.at(-1)).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(addedServices.at(-1)).toHaveAccessibleName(/^open qbittorrent$/i);
  });

  test("places the custom service type first when adding a service", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: /open services launchpad/i }));
    await user.click(screen.getByRole("button", { name: /add service/i }));

    const addDialog = screen.getByRole("dialog", { name: /add service/i });
    const [customOption] = within(addDialog).getAllByRole("radio");

    expect(customOption).toHaveAccessibleName(/custom url/i);
    expect(customOption).toHaveAttribute("aria-checked", "true");
    expect(within(addDialog).getByLabelText(/service name/i)).toHaveValue("");
  });

  test("uses valid inert state when Add Service is stacked over Launchpad", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: /open services launchpad/i }));
    const launchpad = screen.getByRole("dialog", { name: /launchpad/i });
    await user.click(within(launchpad).getByRole("button", { name: /add service/i }));

    const addDialog = screen.getByRole("dialog", { name: /add service/i });
    expect(addDialog).toBeInTheDocument();
    expect(document.querySelector(".launchpad")).toHaveAttribute("inert");
    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining("Received an empty string for a boolean attribute"),
      expect.anything(),
      "inert",
    );
  });

  test("shows persistent Add Service URL errors with field association", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: /open services launchpad/i }));
    await user.click(screen.getByRole("button", { name: /add service/i }));

    const addDialog = screen.getByRole("dialog", { name: /add service/i });
    const urlInput = within(addDialog).getByLabelText(/service url/i);
    await user.type(urlInput, "foo");
    await user.click(within(addDialog).getByRole("button", { name: /^add service$/i }));

    const error = within(addDialog).getByText(/enter a full url including http/i);
    expect(error).toHaveAttribute("id", "add-service-url-error");
    expect(urlInput).toHaveAttribute("aria-invalid", "true");
    expect(urlInput).toHaveAttribute("aria-describedby", "add-service-url-error");
    expect(urlInput).toHaveFocus();
    expect(global.fetch).not.toHaveBeenCalledWith("/api/services", expect.objectContaining({ method: "POST" }));
  });

  test("closes the Add Service dialog with Escape and returns focus to Add Service", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: /open services launchpad/i }));
    const launchpad = screen.getByRole("dialog", { name: /launchpad/i });
    const addServiceButton = within(launchpad).getByRole("button", { name: /add service/i });

    await user.click(addServiceButton);
    const addDialog = screen.getByRole("dialog", { name: /add service/i });
    await waitFor(() => expect(addDialog).toContainElement(document.activeElement));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: /add service/i })).not.toBeInTheDocument();
    expect(addServiceButton).toHaveFocus();
  });

  test("enters widget edit mode and selects a widget", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByText("Self-hosted home base");
    await user.click(screen.getByRole("button", { name: /edit widgets/i }));

    expect(screen.getByRole("toolbar", { name: /widget editing/i })).toBeInTheDocument();
    expect(screen.getByTestId("widget-canvas")).toHaveClass("is-editing");
    expect(screen.queryByRole("complementary", { name: /widget inspector/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /snap grid/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /preview/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /select widget self-hosted home base/i }));

    expect(screen.getByRole("complementary", { name: /widget inspector/i })).toBeInTheDocument();
    expect(screen.getByText(/Custom Card .* 6 x 4/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Layout$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Grid units/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /transfer speed/i })).not.toBeInTheDocument();
  });

  test("opens a service-bound widget with the service URL by default", async () => {
    render(<App />);

    const widgetLink = await screen.findByRole("link", { name: /^open widget download status$/i });

    expect(widgetLink).toHaveAttribute("href", "http://192.0.2.20:8080");
    expect(widgetLink).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  test("keeps built-in enhanced adapters available when external registries are disabled", async () => {
    const user = userEvent.setup();
    const baseFetch = global.fetch;

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === "/api/enhanced/registry-sources" && !options.method) {
        return Response.json({ externalPluginsEnabled: false, sources: [] });
      }

      return baseFetch(url, options);
    });

    render(<App />);
    await user.click(await screen.findByRole("button", { name: /open services launchpad/i }));
    await openServiceSettingsFromLaunchpad(user);
    const dialog = await screen.findByRole("dialog", { name: /service settings/i });
    await user.click(within(dialog).getByRole("tab", { name: /enhanced/i }));

    const registry = await screen.findByRole("complementary", { name: /enhanced registry/i });
    expect(within(registry).getByRole("status")).toHaveTextContent(/built-in adapters remain available/i);

    const installButton = within(registry).getByRole("button", { name: /install qbittorrent enhanced/i });
    expect(installButton).toBeEnabled();
    await user.click(installButton);

    const installCall = global.fetch.mock.calls.find(
      ([url, options]) => url === "/api/enhanced/adapters/install" && options?.method === "POST",
    );
    expect(JSON.parse(installCall[1].body)).toMatchObject({
      adapterId: "qbittorrent",
      sourceType: "built-in",
    });
    expect(within(registry).getByRole("button", { name: /update qbittorrent enhanced/i })).toBeEnabled();
    expect(within(registry).getByRole("button", { name: /uninstall qbittorrent enhanced/i })).toBeEnabled();
  });

  test("opens service settings and configures qBittorrent enhanced mode", async () => {
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole("button", { name: /open services launchpad/i }));
    await openServiceSettingsFromLaunchpad(user);

    const dialog = screen.getByRole("dialog", { name: /service settings/i });

    expect(dialog).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole("heading", { name: /service settings/i })).toHaveFocus());
    await user.click(screen.getByRole("tab", { name: /enhanced/i }));

    expect(screen.getByText(/Enhanced Registry/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /install qbittorrent enhanced/i }));
    expect(screen.queryByLabelText(/endpoint url/i)).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /include free space/i })).toBeChecked();
    expect(screen.getByRole("combobox", { name: /mode/i })).toHaveValue("fast");
    await user.type(screen.getByLabelText(/username/i), "admin");
    await user.type(screen.getByLabelText(/password/i), "adminadmin");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await user.click(screen.getByRole("button", { name: /test connection/i }));

    expect(await screen.findByText(/Login cookie valid/i)).toBeInTheDocument();
    const saveCall = global.fetch.mock.calls.find(
      ([url, options]) => url === "/api/services/service-qbit/enhancement" && options?.method === "PUT",
    );
    expect(JSON.parse(saveCall[1].body)).toMatchObject({
      config: {
        baseUrl: "http://192.0.2.20:8080",
        password: "adminadmin",
        username: "admin",
      },
    });
  });

  test("saves QNAP SNMPv3 noAuthNoPriv enhanced configuration without passwords", async () => {
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole("button", { name: /open services launchpad/i }));
    await openServiceSettingsFromLaunchpad(user, "QNAP");

    const dialog = screen.getByRole("dialog", { name: /service settings/i });
    await user.click(within(dialog).getByRole("tab", { name: /enhanced/i }));

    await user.click(screen.getByRole("button", { name: /install qnap enhanced/i }));
    expect(screen.queryByLabelText(/service url/i)).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /snmp version/i })).toHaveValue("v3");
    expect(screen.getByRole("combobox", { name: /snmpv3 security/i })).toHaveValue("noAuthNoPriv");

    await user.type(screen.getByLabelText(/snmpv3 username/i), "admin");
    await user.click(screen.getByRole("button", { name: /^save changes$/i }));

    expect(await screen.findByText(/Enhanced configuration saved/i)).toBeInTheDocument();
    const saveCall = global.fetch.mock.calls.find(
      ([url, options]) => url === "/api/services/service-qnap/enhancement" && options?.method === "PUT",
    );

    expect(JSON.parse(saveCall[1].body)).toMatchObject({
      adapterId: "qnap",
      config: {
        authPassword: "",
        baseUrl: "http://nas.example.test",
        privacyPassword: "",
        securityLevel: "noAuthNoPriv",
        snmpVersion: "v3",
        username: "admin",
      },
      enabled: true,
    });
  });

  test("uploads an SVG service icon and saves its rasterized PNG URL", async () => {
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole("button", { name: /open services launchpad/i }));
    await openServiceSettingsFromLaunchpad(user);

    const dialog = screen.getByRole("dialog", { name: /service settings/i });
    const file = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/></svg>'],
      "qbit.svg",
      { type: "image/svg+xml" },
    );

    await user.upload(within(dialog).getByLabelText(/upload service icon/i), file);

    expect(await within(dialog).findByText(/using uploaded icon/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /save basic info/i }));

    const uploadCall = global.fetch.mock.calls.find(([url, options]) => url === "/api/icons" && options?.method === "POST");
    const saveCall = global.fetch.mock.calls.find(
      ([url, options]) => url === "/api/services/service-qbit" && options?.method === "PATCH",
    );

    expect(uploadCall).toBeTruthy();
    expect(JSON.parse(uploadCall[1].body).dataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(JSON.parse(saveCall[1].body)).toMatchObject({
      iconKind: "url",
      iconKey: "custom",
      iconUrl: "/api/icons/uploaded-test.png",
    });
  });

  test("shows confirmation after saving service overview changes", async () => {
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole("button", { name: /open services launchpad/i }));
    await openServiceSettingsFromLaunchpad(user);

    const dialog = screen.getByRole("dialog", { name: /service settings/i });
    await user.click(within(dialog).getByRole("button", { name: /save basic info/i }));

    const status = await within(dialog).findByRole("status");
    expect(status).toHaveTextContent(/saved changes/i);
  });

  test("shows pending and saved feedback for widget edits", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByText("Self-hosted home base");
    await user.click(screen.getByRole("button", { name: /edit widgets/i }));
    await user.click(screen.getByRole("button", { name: /select widget self-hosted home base/i }));

    const inspector = screen.getByRole("complementary", { name: /widget inspector/i });
    await user.clear(within(inspector).getByRole("textbox", { name: /widget title/i }));
    await user.type(within(inspector).getByRole("textbox", { name: /widget title/i }), "Docs Hub");

    const pendingStatus = screen.getByText(/widget changes pending/i);
    expect(pendingStatus).toHaveAttribute("role", "status");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    const savedStatus = await screen.findByText(/widget changes saved/i);
    expect(savedStatus).toHaveAttribute("role", "status");
  });

  test("keeps enhanced errors inside the dialog instead of throwing page errors", async () => {
    const user = userEvent.setup();
    const defaultFetch = global.fetch;

    global.fetch = vi.fn(async (url, options = {}) => {
      if (String(url).endsWith("/enhancement/test") && options.method === "POST") {
        return Response.json({ error: "Service enhancement not configured" }, { status: 400 });
      }

      return defaultFetch(url, options);
    });

    render(<App />);
    await user.click(screen.getByRole("button", { name: /open services launchpad/i }));
    await openServiceSettingsFromLaunchpad(user);

    await user.click(screen.getByRole("tab", { name: /enhanced/i }));
    expect(await screen.findByText(/Enhanced Registry/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /test connection/i }));
    expect(await screen.findByText(/Save enhanced configuration before testing/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^save changes$/i }));
    expect(await screen.findByText(/Username is required before saving/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add source/i }));
    expect(await screen.findByText(/Enter a GitHub registry URL/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /github registry url/i })).toHaveAttribute("aria-invalid", "true");
  });

  test("edits service overview while keeping service type and service name separate", async () => {
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole("button", { name: /open services launchpad/i }));
    await openServiceSettingsFromLaunchpad(user);

    const dialog = screen.getByRole("dialog", { name: /service settings/i });
    expect(within(dialog).getByRole("tab", { name: /overview/i })).toHaveAttribute("aria-selected", "true");

    await user.clear(within(dialog).getByLabelText(/service name/i));
    await user.type(within(dialog).getByLabelText(/service name/i), "qBittorrent - SSD");
    expect(within(dialog).getByLabelText(/service type/i)).toHaveValue("qbittorrent");
    await user.clear(within(dialog).getByLabelText(/service url/i));
    await user.type(within(dialog).getByLabelText(/service url/i), "http://192.0.2.56:8080");
    await user.clear(within(dialog).getByLabelText(/service description/i));
    await user.type(within(dialog).getByLabelText(/service description/i), "Primary downloader");
    await user.click(within(dialog).getByRole("checkbox", { name: /pin to dock/i }));
    await user.click(within(dialog).getByRole("button", { name: /save basic info/i }));

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/services/service-qbit",
      expect.objectContaining({
        body: JSON.stringify({
          description: "Primary downloader",
          iconKey: "qbittorrent",
          iconKind: "preset",
          iconUrl: null,
          name: "qBittorrent - SSD",
          pinnedToDock: false,
          typeId: "qbittorrent",
          url: "http://192.0.2.56:8080",
        }),
        method: "PATCH",
      }),
    );
    expect(await screen.findByRole("heading", { name: /service settings: qbittorrent - ssd/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open qbittorrent - ssd from dock/i })).not.toBeInTheDocument();
  });

  test("uses complete keyboard semantics for service settings tabs and Escape close", async () => {
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole("button", { name: /open services launchpad/i }));
    const launchpad = screen.getByRole("dialog", { name: /launchpad/i });
    const actionsButton = within(launchpad).getByRole("button", { name: /open qbittorrent actions/i });
    await user.click(actionsButton);
    const editButton = within(launchpad).getByRole("button", { name: /^edit qbittorrent$/i });
    await user.click(editButton);

    const dialog = screen.getByRole("dialog", { name: /service settings/i });
    expect(screen.queryByRole("dialog", { name: /launchpad/i })).not.toBeInTheDocument();
    const overviewTab = within(dialog).getByRole("tab", { name: /overview/i });
    const enhancedTab = within(dialog).getByRole("tab", { name: /enhanced/i });
    const dangerTab = within(dialog).getByRole("tab", { name: /danger zone/i });

    expect(overviewTab).toHaveAttribute("aria-controls", "service-settings-panel-overview");
    expect(enhancedTab).toHaveAttribute("aria-controls", "service-settings-panel-enhanced");
    expect(dangerTab).toHaveAttribute("aria-controls", "service-settings-panel-danger-zone");
    expect(overviewTab).toHaveAttribute("tabindex", "0");
    expect(enhancedTab).toHaveAttribute("tabindex", "-1");
    expect(within(dialog).getByRole("tabpanel", { name: /overview/i })).toHaveAttribute(
      "id",
      "service-settings-panel-overview",
    );

    overviewTab.focus();
    await user.keyboard("{ArrowRight}");

    expect(enhancedTab).toHaveFocus();
    expect(enhancedTab).toHaveAttribute("aria-selected", "true");
    expect(within(dialog).getByRole("tabpanel", { name: /enhanced/i })).toBeInTheDocument();

    await user.keyboard("{End}");
    expect(dangerTab).toHaveFocus();
    expect(dangerTab).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: /service settings/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open services launchpad/i })).toHaveFocus();
  });

  test("shows only implemented service settings tabs and confirms deletion from Danger Zone", async () => {
    const user = userEvent.setup();

    render(<App />);
    await user.click(screen.getByRole("button", { name: /open services launchpad/i }));
    await openServiceSettingsFromLaunchpad(user);

    const dialog = screen.getByRole("dialog", { name: /service settings/i });

    expect(within(dialog).getByRole("tab", { name: /overview/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: /enhanced/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: /danger zone/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole("tab", { name: /widgets/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("tab", { name: /credentials/i })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("tab", { name: /danger zone/i }));
    await user.click(within(dialog).getByRole("button", { name: /delete service/i }));

    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/services/service-qbit",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(within(dialog).getByText(/this removes qBittorrent/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /cancel delete/i })).toHaveFocus();

    await user.click(within(dialog).getByRole("button", { name: /confirm delete service/i }));

    expect(global.fetch).toHaveBeenCalledWith("/api/services/service-qbit", expect.objectContaining({ method: "DELETE" }));
    expect(screen.queryByRole("dialog", { name: /service settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open qbittorrent from dock/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open qbittorrent actions/i })).not.toBeInTheDocument();
  });

  test("reorders pinned Dock services by dragging", async () => {
    render(<App />);

    const qbitDockLink = await screen.findByRole("link", { name: /open qbittorrent from dock/i });
    const grafanaDockLink = screen.getByRole("link", { name: /open grafana from dock/i });
    const dataTransfer = {
      data: {},
      effectAllowed: "",
      dropEffect: "",
      getData(type) {
        return this.data[type] || "";
      },
      setData(type, value) {
        this.data[type] = value;
      },
    };

    fireEvent.dragStart(grafanaDockLink, { dataTransfer });
    fireEvent.dragOver(qbitDockLink, { dataTransfer });
    fireEvent.drop(qbitDockLink, { dataTransfer });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/dock",
      expect.objectContaining({
        body: JSON.stringify({ serviceIds: ["service-grafana", "service-qbit"] }),
        method: "PUT",
      }),
    );
  });

  test("adds a custom URL compact widget from edit mode", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByText("Self-hosted home base");
    await user.click(screen.getByRole("button", { name: /edit widgets/i }));
    const addWidgetButton = screen.getByRole("button", { name: /add widget/i });
    await user.click(addWidgetButton);
    const addDialog = await screen.findByRole("dialog", { name: /add widget/i });

    expect(addDialog.tagName).not.toBe("FORM");
    expect(within(addDialog).getByRole("heading", { level: 2, name: /add widget/i })).toBeInTheDocument();
    await waitFor(() => expect(within(addDialog).getByRole("heading", { name: /add widget/i })).toHaveFocus());
    await user.click(screen.getByRole("radio", { name: /^compact$/i }));
    expect(screen.getByRole("radio", { name: /^compact$/i })).toHaveAttribute("aria-checked", "true");
    await user.clear(screen.getByLabelText(/widget title/i));
    await user.type(screen.getByLabelText(/widget title/i), "Docs Hub");
    await user.clear(screen.getByLabelText(/widget url/i));
    await user.type(screen.getByLabelText(/widget url/i), "https://docs.home");
    await user.click(within(addDialog).getByRole("button", { name: /^add widget$/i }));

    expect(await screen.findByText("Docs Hub")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/widgets",
      expect.objectContaining({ method: "POST" }),
    );
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/widgets",
      expect.objectContaining({ method: "PUT" }),
    );
    const saveCall = global.fetch.mock.calls.find(([url, options]) => url === "/api/widgets" && options?.method === "PUT");
    expect(JSON.parse(saveCall[1].body).widgets).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Docs Hub", x: 9, y: 0 })]),
    );
  });

  test("groups Add Widget sources into Services and Integrations", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByText("Self-hosted home base");
    await user.click(screen.getByRole("button", { name: /edit widgets/i }));
    await user.click(screen.getByRole("button", { name: /add widget/i }));
    const addDialog = screen.getByRole("dialog", { name: /add widget/i });

    expect(within(addDialog).getByRole("tab", { name: /services/i })).toHaveAttribute("aria-selected", "true");
    expect(within(addDialog).getByRole("tab", { name: /integrations/i })).toBeInTheDocument();
    expect(within(addDialog).queryByRole("tab", { name: /native/i })).not.toBeInTheDocument();
    expect(within(addDialog).getByText(/navigation services that open in a new tab/i)).toBeInTheDocument();

    await user.click(within(addDialog).getByRole("tab", { name: /integrations/i }));

    expect(within(addDialog).getByRole("button", { name: /codex usage/i })).toBeInTheDocument();
    expect(within(addDialog).getByRole("button", { name: /^weather$/i })).toBeInTheDocument();
    expect(within(addDialog).queryByRole("button", { name: /rss feed/i })).not.toBeInTheDocument();
    expect(within(addDialog).queryByRole("button", { name: /calendar/i })).not.toBeInTheDocument();
    expect(within(addDialog).queryByText(/ready/i)).not.toBeInTheDocument();
    expect(within(addDialog).queryByText(/coming soon/i)).not.toBeInTheDocument();
    expect(within(addDialog).queryByText(/not a service launcher/i)).not.toBeInTheDocument();
    expect(within(addDialog).queryByText(/no url required/i)).not.toBeInTheDocument();
    expect(within(addDialog).getByText("1. Choose an integration")).toBeInTheDocument();
    expect(within(addDialog).getByText("2. Choose card type")).toBeInTheDocument();
    expect(within(addDialog).getByText("3. Configure")).toBeInTheDocument();
    expect(within(addDialog).getByText("4. Preview")).toBeInTheDocument();
    expect(within(addDialog).getByRole("meter", { name: /5 hour codex remaining/i })).toBeInTheDocument();
  });

  test("creates a configured weather integration widget from the Add Widget dialog", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByText("Self-hosted home base");
    await user.click(screen.getByRole("button", { name: /edit widgets/i }));
    await user.click(screen.getByRole("button", { name: /add widget/i }));
    const addDialog = screen.getByRole("dialog", { name: /add widget/i });

    await user.click(within(addDialog).getByRole("tab", { name: /integrations/i }));
    await user.click(within(addDialog).getByRole("button", { name: /^weather$/i }));
    expect(within(addDialog).getByLabelText(/^location$/i)).toHaveValue("Shanghai");
    await user.clear(within(addDialog).getByLabelText(/^location$/i));
    await user.type(within(addDialog).getByLabelText(/^location$/i), "Shenzhen");
    await user.click(within(addDialog).getByRole("button", { name: /^add widget$/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    const saveCall = global.fetch.mock.calls.find(([url, options]) => url === "/api/widgets" && options?.method === "PUT");

    expect(JSON.parse(saveCall[1].body).widgets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          h: 3,
          enhancedRenderer: expect.objectContaining({
            config: { location: "Shenzhen" },
            renderer: "weather-current",
          }),
          integrationId: "weather",
          minH: 3,
          minW: 2,
          serviceId: null,
          templateId: "integration:weather-current",
          title: "Weather",
          url: "",
          w: 2,
        }),
      ]),
    );
  });

  test("creates a Codex usage integration widget from the Add Widget dialog", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByText("Self-hosted home base");
    await user.click(screen.getByRole("button", { name: /edit widgets/i }));
    await user.click(screen.getByRole("button", { name: /add widget/i }));
    const addDialog = screen.getByRole("dialog", { name: /add widget/i });

    await user.click(within(addDialog).getByRole("tab", { name: /integrations/i }));
    await user.click(within(addDialog).getByRole("button", { name: /^add widget$/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    const saveCall = global.fetch.mock.calls.find(([url, options]) => url === "/api/widgets" && options?.method === "PUT");

    expect(JSON.parse(saveCall[1].body).widgets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          enhancedRenderer: expect.objectContaining({ renderer: "codex-usage" }),
          integrationId: "codex-usage",
          serviceId: null,
          templateId: "integration:codex-usage",
          title: "Codex Usage",
          url: "",
        }),
      ]),
    );
  });

  test("creates an external registry integration widget from the Add Widget dialog", async () => {
    const user = userEvent.setup();
    const baseFetch = global.fetch;
    const externalIntegration = {
      color: "#7c3aed",
      config: "HTTP status endpoint",
      description: "Synthetic endpoint status checks.",
      iconKey: "activity",
      iconKind: "preset",
      id: "pingdom-lite",
      name: "Pingdom Lite",
      widgets: ["Endpoint Status"],
    };
    const externalTemplate = {
      defaultLayout: { h: 2, w: 3 },
      defaultStyle: {
        accentColor: "#7c3aed",
        backgroundOpacity: 0.76,
        density: "comfortable",
        radius: 18,
        showCategory: true,
        showDescription: true,
        showStatus: true,
        visual: "glass",
      },
      description: "Endpoint availability snapshot.",
      id: "integration:pingdom-lite-status",
      integration: {
        color: "#7c3aed",
        configFields: [
          {
            default: "https://status.example.test",
            key: "endpoint",
            label: "Endpoint",
            required: true,
            type: "url",
          },
        ],
        fields: [
          { format: "text", key: "status", label: "Status" },
          { format: "number", key: "latencyMs", label: "Latency" },
        ],
        iconKey: "activity",
        iconKind: "preset",
        id: "pingdom-lite",
        renderer: "status-summary",
      },
      minLayout: { h: 2, w: 3 },
      name: "Endpoint Status",
      refreshIntervalSeconds: 60,
      systemOnly: true,
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === "/api/integrations") {
        return Response.json({ integrations: [externalIntegration] });
      }

      if (url === "/api/widget-templates") {
        return Response.json({ templates: [...widgetTemplates, externalTemplate] });
      }

      return baseFetch(url, options);
    });

    render(<App />);

    await screen.findByText("Self-hosted home base");
    await user.click(screen.getByRole("button", { name: /edit widgets/i }));
    await user.click(screen.getByRole("button", { name: /add widget/i }));
    const addDialog = screen.getByRole("dialog", { name: /add widget/i });

    await user.click(within(addDialog).getByRole("tab", { name: /integrations/i }));
    await user.click(within(addDialog).getByRole("button", { name: /pingdom lite/i }));
    expect(within(addDialog).getByLabelText(/^endpoint$/i)).toHaveValue("https://status.example.test");
    await user.clear(within(addDialog).getByLabelText(/^endpoint$/i));
    await user.type(within(addDialog).getByLabelText(/^endpoint$/i), "https://api.example.test/health");
    await user.click(within(addDialog).getByRole("button", { name: /^add widget$/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    const saveCall = global.fetch.mock.calls.find(([url, options]) => url === "/api/widgets" && options?.method === "PUT");

    expect(JSON.parse(saveCall[1].body).widgets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          enhancedRenderer: expect.objectContaining({
            config: { endpoint: "https://api.example.test/health" },
            renderer: "status-summary",
          }),
          integrationId: "pingdom-lite",
          serviceId: null,
          style: expect.objectContaining({ accentColor: "#7c3aed" }),
          templateId: "integration:pingdom-lite-status",
          title: "Endpoint Status",
          url: "",
        }),
      ]),
    );
  });

  test("selects a service before choosing an enhanced widget and shows a live preview", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByText("Self-hosted home base");
    await user.click(screen.getByRole("button", { name: /edit widgets/i }));
    await user.click(screen.getByRole("button", { name: /add widget/i }));
    const addDialog = screen.getByRole("dialog", { name: /add widget/i });

    expect(within(addDialog).getByRole("searchbox", { name: /search services/i })).toBeInTheDocument();
    expect(within(addDialog).queryByRole("combobox", { name: "Service" })).not.toBeInTheDocument();
    expect(within(addDialog).queryByRole("radio", { name: /transfer speed/i })).not.toBeInTheDocument();
    expect(within(addDialog).getByRole("radio", { name: /^compact$/i })).toBeInTheDocument();
    expect(within(addDialog).queryByRole("radio", { name: /^wide$/i })).not.toBeInTheDocument();
    expect(within(addDialog).queryByRole("radio", { name: /^hero$/i })).not.toBeInTheDocument();
    expect(within(addDialog).queryByRole("radio", { name: /custom card/i })).not.toBeInTheDocument();
    expect(within(addDialog).getByText("1. Choose a service")).toBeInTheDocument();
    expect(within(addDialog).getByText("2. Choose card type")).toBeInTheDocument();
    expect(within(addDialog).getByText("3. Configure")).toBeInTheDocument();
    expect(within(addDialog).getByText("4. Preview")).toBeInTheDocument();

    await user.click(within(addDialog).getByRole("radio", { name: /^compact$/i }));

    const compactPreviewFrame = addDialog.querySelector(".add-widget-preview-frame");

    expect(compactPreviewFrame).toHaveStyle("--preview-w: 3");
    expect(compactPreviewFrame).toHaveStyle("--preview-h: 1");

    await user.click(within(addDialog).getByRole("button", { name: /select service qbittorrent/i }));

    expect(within(addDialog).getByRole("button", { name: /select service qbittorrent/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(addDialog).getByRole("radio", { name: /transfer speed/i })).toBeInTheDocument();
    expect(within(addDialog).queryByRole("radio", { name: /^wide$/i })).not.toBeInTheDocument();
    expect(within(addDialog).queryByRole("radio", { name: /^hero$/i })).not.toBeInTheDocument();
    expect(within(addDialog).queryByRole("radio", { name: /custom card/i })).not.toBeInTheDocument();

    await user.click(within(addDialog).getByRole("radio", { name: /transfer speed/i }));

    const preview = within(addDialog).getByRole("region", { name: /widget preview/i });

    expect(within(preview).getByText("qBittorrent Transfer Speed")).toBeInTheDocument();
    expect(within(preview).getByText("18.4 MB/s")).toBeInTheDocument();
    expect(within(preview).getByText("2.1 MB/s")).toBeInTheDocument();
    expect(within(preview).getByRole("button", { name: /preview refresh/i })).toBeDisabled();
    expect(within(addDialog).getByLabelText(/widget refresh interval/i)).toHaveValue(5);
  });

  test("closes Add Widget with Escape and returns focus to the Add Widget button", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByText("Self-hosted home base");
    await user.click(screen.getByRole("button", { name: /edit widgets/i }));
    const addWidgetButton = screen.getByRole("button", { name: /add widget/i });

    await user.click(addWidgetButton);
    const addDialog = screen.getByRole("dialog", { name: /add widget/i });
    await waitFor(() => expect(addDialog).toContainElement(document.activeElement));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: /add widget/i })).not.toBeInTheDocument();
    expect(addWidgetButton).toHaveFocus();
  });

  test("creates an enhanced transfer speed widget from the Add Widget dialog", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByText("Self-hosted home base");
    await user.click(screen.getByRole("button", { name: /edit widgets/i }));
    await user.click(screen.getByRole("button", { name: /add widget/i }));
    const addDialog = screen.getByRole("dialog", { name: /add widget/i });
    expect(screen.queryByRole("button", { name: /transfer speed/i })).not.toBeInTheDocument();
    await user.click(within(addDialog).getByRole("button", { name: /select service qbittorrent/i }));
    await user.click(within(addDialog).getByRole("radio", { name: /transfer speed/i }));
    await user.click(within(addDialog).getByRole("button", { name: /^add widget$/i }));

    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/widgets",
      expect.objectContaining({
        body: expect.stringContaining("\"enhancedWidgetId\":\"transfer-speed\""),
        method: "PUT",
      }),
    );
    const saveCall = global.fetch.mock.calls.find(([url, options]) => url === "/api/widgets" && options?.method === "PUT");
    expect(JSON.parse(saveCall[1].body).widgets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          enhancedWidgetId: "transfer-speed",
          h: 3,
          minH: 3,
          minW: 6,
          serviceId: "service-qbit",
          w: 6,
          x: 0,
          y: 4,
        }),
      ]),
    );
  });

  test("keeps unused widget style controls out of the inspector", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByText("Self-hosted home base");
    await user.click(screen.getByRole("button", { name: /edit widgets/i }));
    await user.click(screen.getByRole("button", { name: /select widget self-hosted home base/i }));

    expect(screen.getByRole("complementary", { name: /widget inspector/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/widget title/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Style$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/accent color/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/background opacity/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/show status/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/show category/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/scoped css/i)).not.toBeInTheDocument();
  });

  test("normalizes persisted widget layouts that start far below the first viewport", () => {
    expect(normalizeLoadedWidgets([{ id: "offscreen", x: 0, y: 20, w: 4, h: 2 }])).toEqual([
      { id: "offscreen", x: 0, y: 0, w: 4, h: 2 },
    ]);
    expect(normalizeLoadedWidgets([{ id: "onscreen", x: 0, y: 3, w: 4, h: 2 }])).toEqual([
      { id: "onscreen", x: 0, y: 3, w: 4, h: 2 },
    ]);
  });

  test("keeps widget edits as a draft until Save Changes is clicked", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByText("Self-hosted home base");
    await user.click(screen.getByRole("button", { name: /edit widgets/i }));
    await user.click(screen.getByRole("button", { name: /select widget self-hosted home base/i }));
    await user.clear(screen.getByLabelText(/widget title/i));
    await user.type(screen.getByLabelText(/widget title/i), "Draft Home");

    expect(screen.getByText("Draft Home")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalledWith(
      "/api/widgets",
      expect.objectContaining({ method: "PUT" }),
    );

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByText("Draft Home")).not.toBeInTheDocument();
    expect(screen.getByText("Self-hosted home base")).toBeInTheDocument();
  });
});
