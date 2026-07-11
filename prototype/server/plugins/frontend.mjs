import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname as pathDirname, join, posix, resolve, sep } from "node:path";
import { promisify } from "node:util";
import postcss from "postcss";
import { validatePluginPackageDependencies } from "./contract.mjs";
import { assertSafeRelativePath } from "./registry.mjs";

const ARTIFACT_DIR = ".oh-no-frontend";
const FRONTEND_MAX_FILES = 128;
const FRONTEND_MAX_DEPENDENCIES = 32;
const execFileAsync = promisify(execFile);

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value;
}

export function validateFrontendDefinition(input) {
  if (input === undefined || input === null || input === false) {
    return null;
  }

  const frontend = typeof input === "string" ? { entry: input } : assertPlainObject(input, "Plugin frontend");
  const entry = assertSafeRelativePath(frontend.entry, "Plugin frontend entry");
  const declaredFiles = Array.isArray(frontend.files) ? frontend.files : [];
  const styleIsolation = frontend.styleIsolation || "scoped";

  if (declaredFiles.length > FRONTEND_MAX_FILES) {
    throw new Error(`Plugin frontend files must contain at most ${FRONTEND_MAX_FILES} entries`);
  }

  const files = [...new Set([entry, ...declaredFiles.map((file) => assertSafeRelativePath(file, "Plugin frontend file"))])];
  const dependencyEntries = Object.entries(frontend.dependencies || {});

  if (dependencyEntries.length > FRONTEND_MAX_DEPENDENCIES) {
    throw new Error(`Plugin frontend dependencies must contain at most ${FRONTEND_MAX_DEPENDENCIES} entries`);
  }

  if (!new Set(["global", "scoped"]).has(styleIsolation)) {
    throw new Error("Plugin frontend styleIsolation must be scoped or global");
  }

  const dependencies = validatePluginPackageDependencies(
    frontend.dependencies,
    "Plugin frontend dependencies",
  );

  return { dependencies, entry, files, styleIsolation };
}

export function getFrontendArtifactPaths(pluginDir) {
  const artifactDir = join(resolve(pluginDir), ARTIFACT_DIR);

  return {
    artifactDir,
    css: join(artifactDir, "frontend.css"),
    javascript: join(artifactDir, "frontend.js"),
  };
}

function resolveInsidePlugin(pluginDir, relativePath) {
  const root = resolve(pluginDir);
  const filePath = resolve(root, relativePath);

  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    throw new Error("Plugin frontend file escapes its plugin directory");
  }

  return filePath;
}

function validExportName(name) {
  return /^[$A-Z_a-z][$\w]*$/.test(name);
}

function createRuntimeProxySource(globalKey, moduleExports) {
  const names = Object.keys(moduleExports).filter((name) => name !== "default" && validExportName(name));

  return [
    `const runtime = globalThis.__OH_NO_PLUGIN_RUNTIME__?.${globalKey};`,
    `if (!runtime) throw new Error("Oh No React plugin runtime ${globalKey} is not initialized");`,
    "export default runtime;",
    ...names.map((name) => `export const ${name} = runtime[${JSON.stringify(name)}];`),
  ].join("\n");
}

async function createRuntimeGlobalsPlugin() {
  const [React, ReactDom, ReactDomClient, jsxRuntime, jsxDevRuntime] = await Promise.all([
    import("react"),
    import("react-dom"),
    import("react-dom/client"),
    import("react/jsx-runtime"),
    import("react/jsx-dev-runtime"),
  ]);
  const modules = new Map([
    ["react", { globalKey: "React", moduleExports: React }],
    ["react-dom", { globalKey: "ReactDOM", moduleExports: ReactDom }],
    ["react-dom/client", { globalKey: "ReactDOMClient", moduleExports: ReactDomClient }],
    ["react/jsx-runtime", { globalKey: "jsxRuntime", moduleExports: jsxRuntime }],
    ["react/jsx-dev-runtime", { globalKey: "jsxDevRuntime", moduleExports: jsxDevRuntime }],
  ]);

  return {
    enforce: "pre",
    load(id) {
      if (!id.startsWith("\0oh-no-plugin-runtime:")) {
        return null;
      }

      const source = id.replace("\0oh-no-plugin-runtime:", "");
      const runtimeModule = modules.get(source);

      return runtimeModule
        ? createRuntimeProxySource(runtimeModule.globalKey, runtimeModule.moduleExports)
        : null;
    },
    name: "oh-no-plugin-react-runtime",
    resolveId(source) {
      return modules.has(source) ? `\0oh-no-plugin-runtime:${source}` : null;
    },
  };
}

function normalizeBuildOutput(result) {
  const outputs = Array.isArray(result) ? result : [result];

  return outputs.flatMap((output) => output?.output || []);
}

export async function compilePluginFrontend({ force = false, manifest, pluginDir }) {
  const frontend = validateFrontendDefinition(manifest?.frontend);

  if (!frontend) {
    return null;
  }

  const artifacts = getFrontendArtifactPaths(pluginDir);

  if (!force) {
    try {
      await access(artifacts.javascript);
      const css = await readFile(artifacts.css).catch(() => null);

      return { ...artifacts, hasCss: Boolean(css?.length) };
    } catch {
      // Compile below when no cached artifact exists.
    }
  }

  const entry = resolveInsidePlugin(pluginDir, frontend.entry);
  await access(entry).catch(() => {
    throw new Error(`Plugin frontend entry not found: ${frontend.entry}`);
  });

  const [{ build }, { default: react }] = await Promise.all([
    import("vite"),
    import("@vitejs/plugin-react"),
  ]);
  const result = await build({
    build: {
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      cssCodeSplit: false,
      emptyOutDir: false,
      lib: {
        cssFileName: "frontend",
        entry,
        fileName: () => "frontend.js",
        formats: ["es"],
      },
      minify: false,
      rollupOptions: {
        output: {
          assetFileNames: "[name][extname]",
          entryFileNames: "frontend.js",
        },
      },
      sourcemap: false,
      target: "es2022",
      write: false,
    },
    configFile: false,
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    logLevel: "silent",
    plugins: [await createRuntimeGlobalsPlugin(), react({ jsxRuntime: "automatic" })],
    root: resolve(pluginDir),
  });
  const output = normalizeBuildOutput(result);
  const javascript = output.find((item) => item.type === "chunk" && item.isEntry);
  const css = output.find((item) => item.type === "asset" && String(item.fileName).endsWith(".css"));

  if (!javascript) {
    throw new Error("Plugin frontend build did not produce a JavaScript entry");
  }

  await mkdir(artifacts.artifactDir, { recursive: true });
  await writeFile(artifacts.javascript, javascript.code, "utf8");

  if (css) {
    const rawSource = typeof css.source === "string" ? css.source : Buffer.from(css.source).toString("utf8");
    const source = frontend.styleIsolation === "scoped"
      ? scopePluginCss(rawSource, manifest.id)
      : rawSource;
    await writeFile(artifacts.css, source, "utf8");
  } else {
    await rm(artifacts.css, { force: true });
  }

  return { ...artifacts, hasCss: Boolean(css) };
}

export function scopePluginCss(source, pluginId) {
  const scope = `[data-oh-no-plugin-root=${JSON.stringify(String(pluginId))}]`;
  const root = postcss.parse(source);

  root.walkRules((rule) => {
    const parentName = rule.parent?.type === "atrule" ? String(rule.parent.name || "").toLowerCase() : "";

    if (parentName.endsWith("keyframes")) {
      return;
    }

    rule.selectors = rule.selectors.map((selector) => {
      const normalized = selector.trim();

      if (normalized.startsWith(scope)) {
        return normalized;
      }

      if (/^(?::root|html|body)(?=$|[\s.#:[>+~])/.test(normalized)) {
        return normalized.replace(/^(?::root|html|body)/, scope);
      }

      return `${scope} ${normalized}`;
    });
  });

  return root.toString();
}

export async function installPluginDependencies({ manifest, pluginDir }) {
  const frontend = validateFrontendDefinition(manifest?.frontend);
  const dependencies = {
    ...(manifest?.dependencies || {}),
    ...(frontend?.dependencies || {}),
  };

  if (Object.keys(dependencies).length === 0) {
    return null;
  }

  const packagePath = join(resolve(pluginDir), "package.json");
  const existingPackage = await readFile(packagePath, "utf8")
    .then((source) => JSON.parse(source))
    .catch(() => ({}));
  const packageJson = {
    ...existingPackage,
    dependencies: {
      ...(existingPackage.dependencies || {}),
      ...dependencies,
    },
    name: existingPackage.name || `oh-no-plugin-${manifest.id}`,
    private: true,
    version: existingPackage.version || manifest.version || "0.0.0",
  };
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

  try {
    await execFileAsync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--omit=dev"],
      { cwd: resolve(pluginDir), maxBuffer: 1024 * 1024 * 4 },
    );
  } catch (error) {
    throw new Error(`Plugin frontend dependency install failed: ${error.stderr || error.message}`);
  }

  return packageJson.dependencies;
}

export async function readPluginFrontendArtifact({ extension, manifest, pluginDir }) {
  const frontend = validateFrontendDefinition(manifest?.frontend);

  if (!frontend) {
    throw new Error("Plugin does not declare a React frontend");
  }

  const artifacts = await compilePluginFrontend({ manifest, pluginDir });
  const filePath = extension === "css" ? artifacts.css : artifacts.javascript;

  return readFile(filePath).catch(() => {
    if (extension === "css") {
      return Buffer.from("");
    }

    throw new Error(`Plugin frontend ${extension.toUpperCase()} artifact not found`);
  });
}

export function listFrontendSourceFiles(frontend) {
  return validateFrontendDefinition(frontend)?.files || [];
}

function importedRelativeSpecifiers(source, filename) {
  const imports = new Set();
  const patterns = filename.endsWith(".css")
    ? [/@import\s+(?:url\()?\s*["']([^"']+)["']/g]
    : [
        /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
        /import\(\s*["']([^"']+)["']\s*\)/g,
      ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1].split(/[?#]/)[0];

      if (specifier.startsWith(".")) {
        imports.add(specifier);
      }
    }
  }

  return [...imports];
}

function importCandidates(importer, specifier) {
  const resolved = posix.normalize(posix.join(posix.dirname(importer), specifier));

  if (posix.extname(resolved)) {
    return [assertSafeRelativePath(resolved, "Plugin frontend import")];
  }

  return [
    ...[".js", ".jsx", ".ts", ".tsx", ".css", ".json"].map((extension) => `${resolved}${extension}`),
    ...[".js", ".jsx", ".ts", ".tsx"].map((extension) => `${resolved}/index${extension}`),
  ].map((candidate) => assertSafeRelativePath(candidate, "Plugin frontend import"));
}

export async function downloadPluginFrontendSources({
  authToken = null,
  manifest,
  pluginDir,
  pluginPath,
  registryClient,
  registryUrl,
}) {
  const frontend = validateFrontendDefinition(manifest?.frontend);

  if (!frontend) {
    return [];
  }

  const queue = [...frontend.files];
  const discovered = new Set();

  while (queue.length) {
    if (discovered.size >= FRONTEND_MAX_FILES) {
      throw new Error(`Plugin frontend import graph exceeds ${FRONTEND_MAX_FILES} files`);
    }

    const requested = queue.shift();

    if (discovered.has(requested)) {
      continue;
    }

    let filename = requested;
    let filePath = join(pluginDir, filename);
    let bytes = await readFile(filePath).catch(() => null);

    if (!bytes) {
      const candidates = [requested];
      let lastError;

      for (const candidate of candidates) {
        try {
          bytes = await registryClient.fetchPluginFile({
            authToken,
            filename: candidate,
            pluginPath,
            registryUrl,
          });
          filename = candidate;
          filePath = join(pluginDir, filename);
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!bytes) {
        throw lastError || new Error(`Plugin frontend file not found: ${requested}`);
      }

      await mkdir(pathDirname(filePath), { recursive: true });
      await writeFile(filePath, bytes);
    }

    discovered.add(filename);

    if (!/\.(?:css|[cm]?[jt]sx?)$/i.test(filename)) {
      continue;
    }

    for (const specifier of importedRelativeSpecifiers(bytes.toString("utf8"), filename)) {
      const candidates = importCandidates(filename, specifier);
      let resolvedImport = candidates.find((candidate) => discovered.has(candidate) || queue.includes(candidate));

      if (!resolvedImport) {
        for (const candidate of candidates) {
          const candidatePath = join(pluginDir, candidate);

          if (await access(candidatePath).then(() => true).catch(() => false)) {
            resolvedImport = candidate;
            break;
          }

          try {
            const importedBytes = await registryClient.fetchPluginFile({
              authToken,
              filename: candidate,
              pluginPath,
              registryUrl,
            });
            await mkdir(pathDirname(candidatePath), { recursive: true });
            await writeFile(candidatePath, importedBytes);
            resolvedImport = candidate;
            break;
          } catch {
            // Try the next supported extension or index file.
          }
        }
      }

      if (!resolvedImport) {
        throw new Error(`Plugin frontend import not found: ${specifier} from ${filename}`);
      }

      queue.push(resolvedImport);
    }
  }

  return [...discovered];
}

export function createReactWidgetReference({ component = "default", manifest, pluginKind }) {
  const frontend = validateFrontendDefinition(manifest?.frontend);

  if (!frontend) {
    return null;
  }

  const encodedKind = encodeURIComponent(pluginKind);
  const encodedId = encodeURIComponent(manifest.id);
  const encodedVersion = encodeURIComponent(manifest.version || "dev");
  const baseUrl = `/api/plugins/frontend/${encodedKind}/${encodedId}`;

  return {
    capabilities: manifest.capabilities || [],
    exportName: String(component || "default").trim() || "default",
    moduleUrl: `${baseUrl}/frontend.js?v=${encodedVersion}`,
    pluginId: manifest.id,
    pluginKind,
    styleIsolation: frontend.styleIsolation,
    stylesheetUrl: `${baseUrl}/frontend.css?v=${encodedVersion}`,
    version: manifest.version,
  };
}
