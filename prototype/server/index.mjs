import { createServer } from "node:http";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApiHandler } from "./api.mjs";
import { createAdapterRuntime } from "./enhanced/runtime.mjs";
import { createEnhancedRefreshScheduler } from "./enhanced/serviceRefresh.mjs";
import { createServiceStore } from "./storage.mjs";
import { createStaticAssetHandler } from "./static.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..");

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));

  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(`--${name}`);

  if (index !== -1) {
    return process.argv[index + 1] || fallback;
  }

  return process.env[name.toUpperCase().replaceAll("-", "_")] || fallback;
}

const host = argValue("host", process.env.HOST || "127.0.0.1");
const port = Number(argValue("port", process.env.PORT || "8787"));
const allowUnsafePlugins = argValue(
  "allow-unsafe-plugins",
  process.env.ALLOW_UNSAFE_PLUGINS || "false",
) === "true";
const dataDir = resolve(argValue("data-dir", process.env.DATA_DIR || join(projectRoot, "data")));
const integrationPluginDirs = String(
  argValue("integration-plugin-dirs", process.env.INTEGRATION_PLUGIN_DIRS || ""),
)
  .split(delimiter)
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => resolve(entry));
const widgetPluginDirs = String(argValue("widget-plugin-dirs", process.env.WIDGET_PLUGIN_DIRS || ""))
  .split(delimiter)
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => resolve(entry));
const staticDir = resolve(argValue("static-dir", process.env.STATIC_DIR || join(projectRoot, "dist")));
const serveStatic = argValue("serve-static", process.env.SERVE_STATIC || "true") !== "false";

const store = createServiceStore({ dataDir });
const apiHandler = createApiHandler({
  allowUnsafePlugins,
  dataDir,
  integrationPluginDirs,
  store,
  widgetPluginDirs,
});
const staticAssetHandler = createStaticAssetHandler({ staticDir });
const enhancedScheduler = createEnhancedRefreshScheduler({
  allowUnsafePlugins,
  runtime: createAdapterRuntime({ logger: console }),
  store,
});

function requestHasAllowedOrigin(request) {
  const origin = request.headers.origin;

  if (!origin) return true;

  try {
    const originHost = new URL(origin).host;
    const forwardedHosts = String(request.headers["x-forwarded-host"] || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    return [request.headers.host, ...forwardedHosts].includes(originHost);
  } catch {
    return false;
  }
}

const server = createServer((request, response) => {
  if (request.url.startsWith("/api/")) {
    if (!requestHasAllowedOrigin(request)) {
      response.writeHead(403, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Cross-origin API requests are not allowed" }));
      return;
    }

    apiHandler(request, response);
    return;
  }

  if (serveStatic) {
    staticAssetHandler(request, response);
    return;
  }

  response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Not found" }));
});

server.listen(port, host, () => {
  console.log(`oh-no-selfhosted server listening on http://${host}:${port}`);
  console.log(`data directory: ${dataDir}`);
  if (allowUnsafePlugins) {
    console.warn("external plugin execution is enabled; install code only from sources you fully trust");
  }
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    enhancedScheduler.stop();
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}
