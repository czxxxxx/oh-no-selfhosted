import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILTIN_SERVICE_TYPES } from "../src/serviceCatalog.js";
import { BASE_WIDGET_TEMPLATES } from "../src/widgetTemplates.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const builtinsRoot = join(projectRoot, "builtins");
const packagesRoot = join(builtinsRoot, "packages");
const adapterIds = ["jellyfin", "portainer", "qbittorrent", "qnap"];
const integrationIds = ["codex-usage", "weather"];
const systemWidgetIds = new Set([
  "download-stats",
  "media-queue",
  "quick-actions",
  "storage-trend",
  "uptime-list",
]);

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeJson(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, json(value), "utf8");
}

async function normalizePackageManifest(packageDir, patch) {
  const manifestPath = join(packageDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  await writeJson(manifestPath, {
    apiVersion: "oh-no.dev/v1",
    ...manifest,
    ...patch,
  });
}

async function copyAdapter(adapterId) {
  const packageDir = join(packagesRoot, "service-adapters", adapterId);

  await cp(join(projectRoot, "server", "enhanced", "builtins", adapterId), packageDir, {
    force: true,
    recursive: true,
  });
  await normalizePackageManifest(packageDir, {
    capabilities: ["network", "service-state"],
    dependencies: adapterId === "qnap" ? { "net-snmp": "3.26.3" } : {},
    kind: "service-adapter",
    minHostVersion: "0.1.0",
    replaces: [adapterId],
  });
}

async function copyIntegration(integrationId) {
  const packageDir = join(packagesRoot, "integrations", integrationId);
  const sourceDir = join(projectRoot, "server", "integrations", "builtins", integrationId);
  const implementationName = integrationId === "codex-usage" ? "codexUsage.mjs" : "weather.mjs";

  await cp(sourceDir, packageDir, { force: true, recursive: true });
  await cp(join(projectRoot, "server", "integrations", implementationName), join(packageDir, implementationName), {
    force: true,
  });
  const entryPath = join(packageDir, "integration.mjs");
  const entry = await readFile(entryPath, "utf8");
  await writeFile(
    entryPath,
    entry
      .replace("../../codexUsage.mjs", "./codexUsage.mjs")
      .replace("../../weather.mjs", "./weather.mjs"),
    "utf8",
  );
  await normalizePackageManifest(packageDir, {
    capabilities: integrationId === "codex-usage"
      ? ["filesystem", "integration-state", "network"]
      : ["integration-state", "network"],
    files: [implementationName],
    kind: "integration",
    minHostVersion: "0.1.0",
    replaces: [integrationId],
  });
}

async function writeNativeWidgetPackage() {
  const packageDir = join(packagesRoot, "widgets", "oh-no.core-widgets");
  const widgets = BASE_WIDGET_TEMPLATES.map((template) => ({
    ...template,
    renderer: systemWidgetIds.has(template.id) ? "system" : "generic",
  }));

  await writeJson(join(packageDir, "manifest.json"), {
    apiVersion: "oh-no.dev/v1",
    capabilities: ["host-navigation"],
    description: "Core service cards and local dashboard widgets.",
    id: "oh-no.core-widgets",
    kind: "widget",
    minHostVersion: "0.1.0",
    name: "Oh No Core Widgets",
    registration: "native",
    replaces: ["oh-no.core-widgets"],
    version: "0.1.0",
    widgets: "widgets.json",
  });
  await writeJson(join(packageDir, "widgets.json"), widgets);
}

async function main() {
  await rm(packagesRoot, { force: true, recursive: true });
  await Promise.all(adapterIds.map(copyAdapter));
  await Promise.all(integrationIds.map(copyIntegration));
  await writeNativeWidgetPackage();

  const serviceTypes = BUILTIN_SERVICE_TYPES.map((serviceType) => ({
    ...serviceType,
    apiVersion: "oh-no.dev/v1",
    kind: "service-type",
    minHostVersion: "0.1.0",
    replaces: [serviceType.id],
    version: "0.1.0",
  }));
  const registry = {
    $schema: "../plugin-sdk/registry.schema.json",
    version: 1,
    name: "Oh No Built-ins",
    apps: adapterIds.map((id) => ({
      id,
      name: `${id} service adapter`,
      path: `packages/service-adapters/${id}`,
      version: "0.1.0",
    })),
    integrations: integrationIds.map((id) => ({
      id,
      name: id === "codex-usage" ? "Codex Usage" : "Weather",
      path: `packages/integrations/${id}`,
      version: "0.1.0",
    })),
    serviceTypes,
    widgets: [
      {
        id: "oh-no.core-widgets",
        name: "Oh No Core Widgets",
        path: "packages/widgets/oh-no.core-widgets",
        version: "0.1.0",
      },
    ],
  };

  await writeJson(join(builtinsRoot, "registry.json"), registry);
}

await main();
