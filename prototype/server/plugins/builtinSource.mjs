import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const serverPluginDir = dirname(fileURLToPath(import.meta.url));

export const BUILTIN_REGISTRY_ID = "oh-no-builtins";
export const BUILTIN_REGISTRY_PATH = resolve(serverPluginDir, "..", "..", "builtins", "registry.json");
export const BUILTIN_REGISTRY_URL = pathToFileURL(BUILTIN_REGISTRY_PATH).href;
export const BUILTIN_REGISTRY_ROOT = join(dirname(BUILTIN_REGISTRY_PATH));

export function isBuiltInSource(source) {
  return source?.sourceId === BUILTIN_REGISTRY_ID || source?.sourceRef === BUILTIN_REGISTRY_URL;
}
