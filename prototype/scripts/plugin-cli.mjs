#!/usr/bin/env node
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { loadPluginDefinition } from "../server/enhanced/manifest.mjs";
import { loadIntegrationDefinition } from "../server/integrations/manifest.mjs";
import { assertSafePluginId, assertSafeRelativePath, validateRegistryIndex } from "../server/plugins/registry.mjs";
import { loadWidgetPluginDefinition } from "../server/widgets/manifest.mjs";

const API_VERSION = "oh-no.dev/v1";
const SUPPORTED_KINDS = new Set(["integration", "service-adapter", "widget"]);

function usage() {
  return `Oh No plugin tools

Usage:
  oh-no-plugin validate <registry-or-plugin-directory>
  oh-no-plugin scaffold <widget|integration|service-adapter> <plugin-id> [directory]
`;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`${path}: ${error.message}`);
  }
}

async function pathExists(path) {
  return access(path).then(() => true).catch(() => false);
}

async function validatePluginDirectory(directory) {
  const manifest = await readJson(join(directory, "manifest.json"));
  let definition;

  for (const filename of manifest.files || []) {
    const safeFilename = assertSafeRelativePath(filename, "Plugin file");

    if (!await pathExists(join(directory, safeFilename))) {
      throw new Error(`${directory}: declared plugin file not found: ${safeFilename}`);
    }
  }

  if (manifest.kind === "widget") {
    definition = await loadWidgetPluginDefinition(directory);
  } else if (manifest.kind === "integration") {
    definition = await loadIntegrationDefinition(directory);
  } else if (manifest.kind === "service-adapter") {
    definition = await loadPluginDefinition(directory);
  } else {
    throw new Error(`Unsupported plugin manifest kind: ${manifest.kind || "missing"}`);
  }

  return {
    id: definition.manifest.id,
    kind: definition.manifest.kind,
    version: definition.manifest.version,
  };
}

async function validateRegistryDirectory(directory) {
  const index = validateRegistryIndex(await readJson(join(directory, "registry.json")));
  const checks = [
    ...index.apps.map((entry) => ({ entry, kind: "service-adapter" })),
    ...index.integrations.map((entry) => ({ entry, kind: "integration" })),
    ...index.widgets.map((entry) => ({ entry, kind: "widget" })),
  ];
  const plugins = [];

  for (const check of checks) {
    const plugin = await validatePluginDirectory(join(directory, check.entry.path));

    if (plugin.id !== check.entry.id || plugin.kind !== check.kind) {
      throw new Error(
        `${check.entry.path}: registry declares ${check.kind} ${check.entry.id}, manifest declares ${plugin.kind} ${plugin.id}`,
      );
    }

    if (check.entry.version && check.entry.version !== plugin.version) {
      throw new Error(`${check.entry.path}: registry and manifest versions must match`);
    }

    plugins.push(plugin);
  }

  return { index, plugins };
}

async function validateTarget(inputPath) {
  const target = resolve(inputPath || ".");
  const targetStat = await stat(target).catch(() => null);

  if (!targetStat) {
    throw new Error(`Path not found: ${target}`);
  }

  const directory = targetStat.isDirectory() ? target : resolve(target, "..");
  const filename = targetStat.isDirectory() ? "" : basename(target);

  if (filename === "registry.json" || await pathExists(join(directory, "registry.json"))) {
    const result = await validateRegistryDirectory(directory);
    process.stdout.write(
      `Valid registry ${result.index.name}: ${result.plugins.length} code plugin(s), ${result.index.serviceTypes.length} service type(s)\n`,
    );
    return;
  }

  const plugin = await validatePluginDirectory(directory);
  process.stdout.write(`Valid ${plugin.kind} ${plugin.id}@${plugin.version}\n`);
}

function scaffoldFiles(kind, id) {
  const displayName = id
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(" ");
  const common = {
    apiVersion: API_VERSION,
    capabilities:
      kind === "widget"
        ? ["react", "host-refresh", "host-navigation"]
        : kind === "integration"
          ? ["integration-state"]
          : ["network", "service-state"],
    description: `${displayName} plugin for Oh No Selfhosted.`,
    id,
    kind,
    minHostVersion: "0.1.0",
    name: displayName,
    version: "0.1.0",
  };

  if (kind === "widget") {
    return {
      "frontend.jsx": `import React from "react";\nimport "./widget.css";\n\nexport function HelloWidget({ config, isPreview }) {\n  return (\n    <section className="hello-widget">\n      <strong>{config.message || "Hello from ${displayName}"}</strong>\n      <small>{isPreview ? "Preview" : "Live"}</small>\n    </section>\n  );\n}\n`,
      "manifest.json": JSON.stringify({
        ...common,
        frontend: {
          entry: "frontend.jsx",
          files: ["frontend.jsx", "widget.css"],
          styleIsolation: "scoped",
        },
        widgets: "widgets.json",
      }, null, 2) + "\n",
      "widget.css": ".hello-widget { display: grid; gap: 8px; padding: 16px; }\n",
      "widgets.json": JSON.stringify([{
        component: "HelloWidget",
        configFields: [{ default: "Hello", key: "message", label: "Message", type: "text" }],
        defaultLayout: { h: 2, w: 3 },
        description: `A starter widget from ${displayName}.`,
        id: "hello",
        minLayout: { h: 2, w: 2 },
        name: "Hello",
        renderer: "react",
      }], null, 2) + "\n",
    };
  }

  if (kind === "integration") {
    return {
      "integration.mjs": "export async function readState(config, context) {\n  return { available: true, message: config.message || \"Connected\", refreshedAt: context.now() };\n}\n",
      "manifest.json": JSON.stringify({
        ...common,
        color: "#2f80d1",
        config: "A shared connection used by one or more widgets.",
        configFields: [{ default: "Connected", key: "message", label: "Message", type: "text" }],
        entry: "integration.mjs",
        iconKey: "custom",
        iconKind: "preset",
        templates: "templates.json",
      }, null, 2) + "\n",
      "templates.json": JSON.stringify([{
        dataPath: "",
        defaultLayout: { h: 2, w: 3 },
        description: `Status supplied by ${displayName}.`,
        fields: [{ key: "message", label: "Status" }],
        id: "status",
        minLayout: { h: 2, w: 2 },
        name: "Status",
        renderer: "status-summary",
      }], null, 2) + "\n",
    };
  }

  return {
    "adapter.mjs": "export async function testConnection() { return { ok: true, message: \"Connected\" }; }\nexport async function fetchState() { return { status: \"online\" }; }\n",
    "manifest.json": JSON.stringify({
      ...common,
      configSchema: [{ key: "baseUrl", label: "Base URL", required: true, type: "url" }],
      entry: "adapter.mjs",
      serviceTypes: ["custom"],
      widgets: "widgets.json",
    }, null, 2) + "\n",
    "widgets.json": JSON.stringify([{
      defaultLayout: { h: 2, w: 3 },
      description: `Status supplied by ${displayName}.`,
      fields: [{ key: "status", label: "Status" }],
      id: "status",
      minLayout: { h: 2, w: 2 },
      name: "Status",
      renderer: "status-summary",
    }], null, 2) + "\n",
  };
}

async function scaffold(kind, rawId, outputPath) {
  if (!SUPPORTED_KINDS.has(kind)) {
    throw new Error(`Scaffold kind must be one of: ${[...SUPPORTED_KINDS].join(", ")}`);
  }

  const id = assertSafePluginId(rawId);
  const directory = resolve(outputPath || id);
  const existingEntries = await readdir(directory).catch(() => []);

  if (existingEntries.length) {
    throw new Error(`Scaffold directory is not empty: ${directory}`);
  }

  await mkdir(directory, { recursive: true });

  for (const [filename, source] of Object.entries(scaffoldFiles(kind, id))) {
    await writeFile(join(directory, filename), source, "utf8");
  }

  await validatePluginDirectory(directory);
  process.stdout.write(`Created ${kind} ${id} in ${directory}\n`);
}

const [, , command, ...args] = process.argv;

try {
  if (command === "validate") {
    await validateTarget(args[0]);
  } else if (command === "scaffold") {
    await scaffold(args[0], args[1], args[2]);
  } else {
    process.stdout.write(usage());
    process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  process.stderr.write(`Plugin tool failed: ${error.message}\n`);
  process.exitCode = 1;
}
