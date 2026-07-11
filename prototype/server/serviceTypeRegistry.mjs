import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  getServiceCategories,
  normalizeServiceType,
} from "../src/serviceCatalog.js";
import { BUILTIN_REGISTRY_ID, BUILTIN_REGISTRY_PATH } from "./plugins/builtinSource.mjs";

const SERVICE_TYPES_FILE = "service-types.json";

function configuredPath(dataDir) {
  return join(dataDir, SERVICE_TYPES_FILE);
}

function readConfiguredTypes(dataDir) {
  const filePath = configuredPath(dataDir);

  if (!existsSync(filePath)) {
    return [];
  }

  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  const serviceTypes = Array.isArray(parsed) ? parsed : parsed.serviceTypes;

  if (!Array.isArray(serviceTypes)) {
    throw new Error("service-types.json must contain a serviceTypes array");
  }

  return serviceTypes.map(normalizeServiceType);
}

function readBuiltInTypes(registryPath = BUILTIN_REGISTRY_PATH) {
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));

  if (!Array.isArray(registry.serviceTypes)) {
    throw new Error("Built-in registry must contain a serviceTypes array");
  }

  return registry.serviceTypes;
}

function mergeRegisteredServiceTypes(serviceTypes) {
  const byId = new Map();

  for (const serviceType of serviceTypes) {
    const normalized = normalizeServiceType(serviceType);
    byId.set(normalized.id, { ...(byId.get(normalized.id) || {}), ...normalized });
  }

  const custom = byId.get("custom");
  byId.delete("custom");

  return [...byId.values(), custom].filter(Boolean);
}

function writeConfiguredTypes(dataDir, serviceTypes) {
  const filePath = configuredPath(dataDir);
  const temporaryPath = `${filePath}.stage-${randomUUID()}`;
  mkdirSync(dirname(filePath), { recursive: true });

  try {
    writeFileSync(
      temporaryPath,
      `${JSON.stringify({ serviceTypes: serviceTypes.map(normalizeServiceType) }, null, 2)}\n`,
      "utf8",
    );
    renameSync(temporaryPath, filePath);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}

export function validateBuiltInServiceTypes(serviceTypes = readBuiltInTypes()) {
  if (!Array.isArray(serviceTypes)) {
    throw new Error("Built-in service types must be an array");
  }

  const ids = new Set();
  const normalized = serviceTypes.map((serviceType) => {
    const registered = {
      ...normalizeServiceType(serviceType),
      source: "local-registry",
      sourceId: BUILTIN_REGISTRY_ID,
    };

    if (ids.has(registered.id)) {
      throw new Error(`Built-in service types contains duplicate id: ${registered.id}`);
    }

    ids.add(registered.id);
    return registered;
  });

  return normalized;
}

export function loadServiceTypes(dataDir) {
  return mergeRegisteredServiceTypes([...validateBuiltInServiceTypes(), ...readConfiguredTypes(dataDir)]);
}

export function createServiceTypeRegistry({ dataDir }) {
  function listConfiguredTypes() {
    return readConfiguredTypes(dataDir);
  }

  return {
    get filePath() {
      return configuredPath(dataDir);
    },
    listCategories() {
      return getServiceCategories(this.listServiceTypes());
    },
    listConfiguredServiceTypes() {
      return listConfiguredTypes();
    },
    listServiceTypes() {
      return loadServiceTypes(dataDir);
    },
    upsertServiceType(input) {
      const serviceType = normalizeServiceType(input);
      const configured = listConfiguredTypes().filter((candidate) => candidate.id !== serviceType.id);
      const nextConfigured = [...configured, serviceType];

      writeConfiguredTypes(dataDir, nextConfigured);

      return serviceType;
    },
    deleteServiceType(typeId) {
      const configured = listConfiguredTypes();
      const nextConfigured = configured.filter((candidate) => candidate.id !== typeId);

      if (configured.length === nextConfigured.length) {
        return false;
      }

      writeConfiguredTypes(dataDir, nextConfigured);

      return true;
    },
  };
}
