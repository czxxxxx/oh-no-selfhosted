import defaultSnmp from "net-snmp";

const OIDS = {
  ifEntry: "1.3.6.1.2.1.2.2.1",
  hrMemorySize: "1.3.6.1.2.1.25.2.2.0",
  hrProcessorLoad: "1.3.6.1.2.1.25.3.3.1.2",
  hrStorageEntry: "1.3.6.1.2.1.25.2.3.1",
  sysDescr: "1.3.6.1.2.1.1.1.0",
  sysUpTime: "1.3.6.1.2.1.1.3.0",
};

const HR_STORAGE_FIXED_DISK = "1.3.6.1.2.1.25.2.1.4";
const HR_STORAGE_RAM = "1.3.6.1.2.1.25.2.1.2";
const SYSTEM_STORAGE_MOUNT_PATTERNS = [
  /^\/dev(?:\/|$)/,
  /^\/mnt\/(?:boot_config|ext|HDA_ROOT|pool\d*|snapshot)(?:\/|$)/,
  /^\/new_root(?:\/|$)/,
  /^\/proc(?:\/|$)/,
  /^\/run(?:\/|$)/,
  /^\/samba_third_party(?:\/|$)/,
  /^\/share\/NFSv=4(?:\/|$)/,
  /^\/share\/?$/,
  /^\/sys(?:\/|$)/,
  /^\/tmp(?:\/|$)/,
  /\/\.samba(?:\/|$)/,
  /\/msg\.(?:lock|sock)(?:\/|$)/,
];

function valueToString(value) {
  if (value === undefined || value === null) {
    return "";
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  return String(value);
}

function valueToNumber(value) {
  if (typeof value === "bigint") {
    return Number(value);
  }

  if (Buffer.isBuffer(value)) {
    return Number.parseInt(value.toString("utf8"), 10);
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

function usedPercent(usedBytes, totalBytes) {
  if (!totalBytes) {
    return 0;
  }

  return Number(((usedBytes / totalBytes) * 100).toFixed(1));
}

function average(values) {
  const numbers = values.map(Number).filter(Number.isFinite);

  if (!numbers.length) {
    return 0;
  }

  return Number((numbers.reduce((total, value) => total + value, 0) / numbers.length).toFixed(1));
}

function normalizeVersion(config) {
  return String(config.snmpVersion || "v3").toLowerCase();
}

function parseTarget(config, context) {
  const rawHost = String(config.host || "").trim();
  const rawUrl = String(config.baseUrl || context.service?.url || "").trim();
  let host = rawHost;

  if (!host && rawUrl) {
    try {
      host = new URL(rawUrl).hostname;
    } catch {
      host = rawUrl.replace(/^[a-z]+:\/\//i, "").split("/")[0].split(":")[0];
    }
  }

  if (!host) {
    throw new Error("QNAP SNMP host is required");
  }

  return {
    host,
    port: Number(config.port || 161),
  };
}

function optionNumber(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function sessionOptions(config, snmpModule) {
  return {
    port: optionNumber(config.port, 161),
    retries: optionNumber(config.retries, 1),
    timeout: optionNumber(config.timeoutMs, 3000),
    transport: config.transport || "udp4",
    version: snmpModule.Version3,
  };
}

function protocolValue(protocols, key, fallback) {
  const normalized = String(key || fallback || "").toLowerCase();

  return protocols[normalized] || protocols[fallback] || Object.values(protocols).find((value) => typeof value === "number");
}

function inferSecurityLevel(config) {
  if (config.securityLevel) {
    return String(config.securityLevel);
  }

  if (config.privacyPassword) {
    return "authPriv";
  }

  if (config.authPassword) {
    return "authNoPriv";
  }

  return "noAuthNoPriv";
}

function createV3User(config, snmpModule) {
  const username = String(config.username || "").trim();

  if (!username) {
    throw new Error("SNMPv3 username is required");
  }

  const securityLevel = inferSecurityLevel(config);
  const level = snmpModule.SecurityLevel[securityLevel];

  if (!level) {
    throw new Error(`Unsupported SNMPv3 security level: ${securityLevel}`);
  }

  const user = {
    level,
    name: username,
  };

  if (securityLevel === "authNoPriv" || securityLevel === "authPriv") {
    if (!config.authPassword) {
      throw new Error("SNMPv3 authentication password is required for the selected security level");
    }

    user.authKey = String(config.authPassword);
    user.authProtocol = protocolValue(snmpModule.AuthProtocols, config.authProtocol, "sha");
  }

  if (securityLevel === "authPriv") {
    if (!config.privacyPassword) {
      throw new Error("SNMPv3 privacy password is required for the selected security level");
    }

    user.privKey = String(config.privacyPassword);
    user.privProtocol = protocolValue(snmpModule.PrivProtocols, config.privacyProtocol, "aes");
  }

  return user;
}

function createSession(config, context) {
  const snmpModule = context.snmp || defaultSnmp;
  const { host, port } = parseTarget(config, context);
  const options = { ...sessionOptions({ ...config, port }, snmpModule), port };
  const version = normalizeVersion(config);

  if (version === "v3") {
    return {
      session: snmpModule.createV3Session(host, createV3User(config, snmpModule), options),
      snmpModule,
    };
  }

  const community = String(config.community || "").trim();

  if (!community) {
    throw new Error("SNMP community is required for SNMPv1/v2c");
  }

  return {
    session: snmpModule.createSession(host, community, {
      ...options,
      version: version === "v1" ? snmpModule.Version1 : snmpModule.Version2c,
    }),
    snmpModule,
  };
}

function rejectVarbindError(snmpModule, varbind) {
  if (snmpModule.isVarbindError?.(varbind)) {
    throw new Error(snmpModule.varbindError?.(varbind) || "SNMP varbind error");
  }
}

async function snmpGet(session, snmpModule, oids) {
  return new Promise((resolve, reject) => {
    session.get(oids, (error, varbinds) => {
      if (error) {
        reject(error);
        return;
      }

      try {
        const values = {};

        for (const varbind of varbinds || []) {
          rejectVarbindError(snmpModule, varbind);
          values[varbind.oid] = varbind.value;
        }

        resolve(values);
      } catch (varbindError) {
        reject(varbindError);
      }
    });
  });
}

async function snmpSubtree(session, snmpModule, oid) {
  return new Promise((resolve, reject) => {
    const rows = [];

    session.subtree(
      oid,
      20,
      (varbinds) => {
        for (const varbind of varbinds || []) {
          rejectVarbindError(snmpModule, varbind);
          rows.push(varbind);
        }
      },
      (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(rows);
      },
    );
  });
}

function tableRows(varbinds, entryOid) {
  const rows = new Map();

  for (const varbind of varbinds) {
    const rest = varbind.oid.startsWith(`${entryOid}.`) ? varbind.oid.slice(entryOid.length + 1).split(".") : [];
    const column = rest.shift();
    const index = rest.join(".");

    if (!column || !index) {
      continue;
    }

    if (!rows.has(index)) {
      rows.set(index, { index });
    }

    rows.get(index)[column] = varbind.value;
  }

  return [...rows.values()];
}

function buildCpuState(varbinds) {
  return average(varbinds.map((varbind) => valueToNumber(varbind.value)));
}

function isSystemStorageMount(name) {
  return SYSTEM_STORAGE_MOUNT_PATTERNS.some((pattern) => pattern.test(name));
}

function deduplicateStorageRows(rows) {
  const seen = new Set();

  return rows.filter((row) => {
    const key = `${row.totalBytes}:${row.usedBytes}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildStorageState(varbinds, memorySizeKb) {
  const rows = tableRows(varbinds, OIDS.hrStorageEntry).map((row) => {
    const allocationUnits = valueToNumber(row["4"]);
    const totalBytes = allocationUnits * valueToNumber(row["5"]);
    const usedBytes = allocationUnits * valueToNumber(row["6"]);

    return {
      index: row.index,
      name: valueToString(row["3"]) || `Storage ${row.index}`,
      totalBytes,
      type: valueToString(row["2"]),
      usedBytes,
      usedPercent: usedPercent(usedBytes, totalBytes),
    };
  });
  const memoryRow = rows.find((row) => row.type === HR_STORAGE_RAM || /memory/i.test(row.name));
  const memoryTotalBytes = memorySizeKb ? memorySizeKb * 1024 : memoryRow?.totalBytes || 0;
  const memoryUsedBytes = memoryRow?.usedBytes || 0;
  const fixedDiskRows = rows.filter((row) => row.type === HR_STORAGE_FIXED_DISK && row.totalBytes > 0);
  const userStorageRows = deduplicateStorageRows(fixedDiskRows.filter((row) => !isSystemStorageMount(row.name)));
  const storageRows = (userStorageRows.length ? userStorageRows : fixedDiskRows).sort(
    (a, b) => b.totalBytes - a.totalBytes,
  );
  const primaryStorage = storageRows[0] || null;
  const storageTotalBytes = storageRows.reduce((total, row) => total + row.totalBytes, 0);
  const storageUsedBytes = storageRows.reduce((total, row) => total + row.usedBytes, 0);

  return {
    memoryTotalBytes,
    memoryUsedBytes,
    storage: {
      name: primaryStorage?.name || "Unavailable",
      rows: storageRows,
      totalBytes: storageTotalBytes,
      usedBytes: storageUsedBytes,
      usedPercent: usedPercent(storageUsedBytes, storageTotalBytes),
    },
  };
}

function interfaceStatus(code) {
  return (
    {
      1: "up",
      2: "down",
      3: "testing",
      4: "unknown",
      5: "dormant",
      6: "notPresent",
      7: "lowerLayerDown",
    }[valueToNumber(code)] || "unknown"
  );
}

function buildNetworkState(varbinds) {
  const rows = tableRows(varbinds, OIDS.ifEntry)
    .map((row) => ({
      index: row.index,
      name: valueToString(row["2"]) || `Interface ${row.index}`,
      rxBytes: valueToNumber(row["10"]),
      status: interfaceStatus(row["8"]),
      txBytes: valueToNumber(row["16"]),
    }))
    .filter((row) => row.name !== "lo")
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    activeInterfaces: rows.filter((row) => row.status === "up").length,
    rows,
  };
}

function inferModel(description) {
  const model = description.match(/\b(?:TS|TVS|TBS|SS|QGD|GM|TS-h|TVS-h)[A-Z0-9-]*\b/i)?.[0];

  return model || "QNAP NAS";
}

function closeSession(session) {
  try {
    session.close?.();
  } catch {
    // Closing the UDP socket should not hide a successful SNMP read.
  }
}

export async function testConnection(config, context) {
  const { session, snmpModule } = createSession(config, context);

  try {
    const values = await snmpGet(session, snmpModule, [OIDS.sysDescr]);
    const description = valueToString(values[OIDS.sysDescr]);

    return { ok: true, message: `SNMP reachable: ${description || "QNAP NAS"}` };
  } finally {
    closeSession(session);
  }
}

export async function fetchState(config, context) {
  const { session, snmpModule } = createSession(config, context);

  try {
    const scalarValues = await snmpGet(session, snmpModule, [OIDS.sysDescr, OIDS.sysUpTime, OIDS.hrMemorySize]);
    const [cpuRows, storageRows, networkRows] = await Promise.all([
      snmpSubtree(session, snmpModule, OIDS.hrProcessorLoad),
      snmpSubtree(session, snmpModule, OIDS.hrStorageEntry),
      snmpSubtree(session, snmpModule, OIDS.ifEntry),
    ]);
    const description = valueToString(scalarValues[OIDS.sysDescr]);
    const uptimeSeconds = Math.floor(valueToNumber(scalarValues[OIDS.sysUpTime]) / 100);
    const cpuLoadPercent = buildCpuState(cpuRows);
    const storageState = buildStorageState(storageRows, valueToNumber(scalarValues[OIDS.hrMemorySize]));
    const memoryUsedPercent = usedPercent(storageState.memoryUsedBytes, storageState.memoryTotalBytes);
    const network = buildNetworkState(networkRows);

    return {
      network,
      resources: {
        cpuLoadPercent,
        memoryTotalBytes: storageState.memoryTotalBytes,
        memoryUsedBytes: storageState.memoryUsedBytes,
        memoryUsedPercent,
      },
      storage: storageState.storage,
      summary: {
        cpuLoadPercent,
        memoryUsedPercent,
        status: "online",
        storageUsedPercent: storageState.storage.usedPercent,
      },
      system: {
        checkedAt: context.now?.(),
        description,
        model: inferModel(description),
        status: "online",
        uptimeSeconds,
      },
    };
  } finally {
    closeSession(session);
  }
}

export function getWidgetData(state, widgetConfig) {
  return state?.[widgetConfig.dataPath] || state || {};
}
