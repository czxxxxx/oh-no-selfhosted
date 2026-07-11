import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const CODEX_RESET_CREDITS_URL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";
const CODEX_TOKEN_URL = "https://auth.openai.com/oauth/token";
const CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const ACCOUNT_CLAIM_NAMESPACE = "https://api.openai.com/auth";
const CODEX_USAGE_CACHE_TTL_MS = 5 * 60 * 1000;
const codexUsageSnapshotCache = new Map();
const fetchImplCacheIds = new WeakMap();
let nextFetchImplCacheId = 1;

function nowDate(now) {
  return now instanceof Date ? now : new Date(now);
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

function firstFinite(...values) {
  for (const value of values) {
    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
}

function clampPercent(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.min(Math.max(number, 0), 100);
}

function toIsoDate(value) {
  if (!value) {
    return null;
  }

  const rawNumber = Number(value);
  const date = Number.isFinite(rawNumber)
    ? new Date(rawNumber < 10_000_000_000 ? rawNumber * 1000 : rawNumber)
    : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function addHours(now, hours) {
  return new Date(nowDate(now).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function codeFromHint(hint, fallbackCode = "") {
  const normalized = String(hint || "").toLowerCase();

  if (/\b5\s*h\b|5h|five|primary|short/.test(normalized)) {
    return "5h";
  }

  if (/\b7\s*d\b|7d|week|secondary|weekly|long/.test(normalized)) {
    return "7d";
  }

  return fallbackCode;
}

function labelForCode(code) {
  return code === "7d" ? "7 day" : "5 hour";
}

function decodeJwtPayload(token) {
  const [, encodedPayload] = String(token || "").split(".");

  if (!encodedPayload) {
    return {};
  }

  try {
    return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

function accountIdFromToken({ accountId, idToken }) {
  const payload = decodeJwtPayload(idToken);

  return firstString(
    accountId,
    payload?.[ACCOUNT_CLAIM_NAMESPACE]?.chatgpt_account_id,
    payload?.chatgpt_account_id,
    payload?.account_id,
  );
}

function authPathFor({ authPath, homeDir = homedir() } = {}) {
  return authPath || join(homeDir, ".codex", "auth.json");
}

function fetchImplCacheId(fetchImpl) {
  if ((typeof fetchImpl !== "function" && typeof fetchImpl !== "object") || fetchImpl === null) {
    return String(fetchImpl);
  }

  const existingId = fetchImplCacheIds.get(fetchImpl);

  if (existingId) {
    return existingId;
  }

  const nextId = nextFetchImplCacheId;
  nextFetchImplCacheId += 1;
  fetchImplCacheIds.set(fetchImpl, nextId);

  return nextId;
}

function codexUsageCacheKey({ authPath, fetchImpl, homeDir }) {
  return `${authPathFor({ authPath, homeDir })}:${fetchImplCacheId(fetchImpl)}`;
}

function cloneCodexUsageSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot));
}

function cachedCodexUsageSnapshot(cacheKey, timestamp) {
  const cached = codexUsageSnapshotCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  const age = timestamp.getTime() - cached.cachedAt;

  if (age >= 0 && age < CODEX_USAGE_CACHE_TTL_MS) {
    return cloneCodexUsageSnapshot(cached.snapshot);
  }

  codexUsageSnapshotCache.delete(cacheKey);

  return null;
}

function cacheCodexUsageSnapshot(cacheKey, timestamp, snapshot) {
  codexUsageSnapshotCache.set(cacheKey, {
    cachedAt: timestamp.getTime(),
    snapshot: cloneCodexUsageSnapshot(snapshot),
  });

  return snapshot;
}

async function readLocalCodexAuth({ authPath, homeDir } = {}) {
  const payload = JSON.parse(await readFile(authPathFor({ authPath, homeDir }), "utf8"));
  const tokens = payload.tokens || payload.auth || payload;

  return {
    accessToken: firstString(tokens.access_token, tokens.accessToken, payload.access_token, payload.accessToken),
    accountId: firstString(tokens.account_id, tokens.accountId, payload.account_id, payload.accountId),
    idToken: firstString(tokens.id_token, tokens.idToken, payload.id_token, payload.idToken),
    refreshToken: firstString(tokens.refresh_token, tokens.refreshToken, payload.refresh_token, payload.refreshToken),
  };
}

export function buildCodexUsageHeaders({ accessToken, accountId, idToken }) {
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    "OpenAI-Beta": "codex-1",
    originator: "Codex Desktop",
    "User-Agent": "OhNoSelfhosted/0.1 Codex Usage",
  };
  const chatGptAccountId = accountIdFromToken({ accountId, idToken });

  if (chatGptAccountId) {
    headers["ChatGPT-Account-Id"] = chatGptAccountId;
  }

  return headers;
}

function normalizeUsageWindow(rawWindow, { fallbackCode = "", hint = "", now = new Date() } = {}) {
  if (!rawWindow || typeof rawWindow !== "object") {
    return null;
  }

  const code = codeFromHint(
    firstString(rawWindow.code, rawWindow.window, rawWindow.interval, rawWindow.period, rawWindow.name, rawWindow.label, hint),
    fallbackCode,
  );

  if (!code) {
    return null;
  }

  const limit = firstFinite(rawWindow.limit, rawWindow.quota, rawWindow.total, rawWindow.max, rawWindow.cap);
  let remaining = firstFinite(
    rawWindow.remaining,
    rawWindow.remaining_quota,
    rawWindow.remainingQuota,
    rawWindow.available,
    rawWindow.available_quota,
    rawWindow.availableQuota,
  );
  let used = firstFinite(
    rawWindow.used,
    rawWindow.current_usage,
    rawWindow.currentUsage,
    rawWindow.consumed,
    rawWindow.value,
  );
  const explicitPercent = firstFinite(
    rawWindow.percentUsed,
    rawWindow.percent_used,
    rawWindow.used_percent,
    rawWindow.usage_percent,
    rawWindow.percentage,
    rawWindow.percent,
  );
  const explicitRemainingPercent = firstFinite(
    rawWindow.percentRemaining,
    rawWindow.percent_remaining,
    rawWindow.remaining_percent,
    rawWindow.available_percent,
  );

  if (used === null && limit !== null && remaining !== null) {
    used = Math.max(limit - remaining, 0);
  }

  const percentUsed =
    explicitPercent !== null
      ? clampPercent(explicitPercent)
      : explicitRemainingPercent !== null
        ? clampPercent(100 - explicitRemainingPercent)
      : limit && used !== null
        ? clampPercent((used / limit) * 100)
        : clampPercent(used);
  const normalizedLimit = limit ?? 100;
  const percentRemaining =
    explicitRemainingPercent !== null ? clampPercent(explicitRemainingPercent) : clampPercent(100 - percentUsed);

  if (used === null && normalizedLimit !== null) {
    used = Math.max(normalizedLimit - (remaining ?? (normalizedLimit * percentRemaining) / 100), 0);
  }

  if (remaining === null && normalizedLimit !== null) {
    remaining = Math.max(normalizedLimit - (used ?? (normalizedLimit * percentUsed) / 100), 0);
  }

  return {
    code,
    label: firstString(rawWindow.display_name, rawWindow.title, rawWindow.label) || labelForCode(code),
    limit: normalizedLimit,
    percentRemaining,
    percentUsed,
    remaining,
    resetAt:
      toIsoDate(
        rawWindow.resetAt ||
          rawWindow.reset_at ||
          rawWindow.next_reset_at ||
          rawWindow.nextResetAt ||
          rawWindow.resets_at ||
          rawWindow.expires_at,
      ) || addHours(now, code === "7d" ? 7 * 24 : 5),
    used: used ?? percentUsed,
  };
}

function usageLimitEntries(payload) {
  const limits = payload?.usage?.limits || payload?.limits || payload?.rate_limits;

  if (Array.isArray(limits)) {
    return limits.map((value, index) => [index, value]);
  }

  if (limits && typeof limits === "object") {
    return Object.entries(limits);
  }

  return [];
}

function rateLimitEntries(payload) {
  const rateLimit = payload?.usage?.rate_limit || payload?.rate_limit || payload?.rateLimit || {};

  return [
    ["primary_window", rateLimit.primary_window || rateLimit.primaryWindow],
    ["secondary_window", rateLimit.secondary_window || rateLimit.secondaryWindow],
  ].filter(([, value]) => value);
}

function addWindow(windowsByCode, window) {
  if (window && !windowsByCode.has(window.code)) {
    windowsByCode.set(window.code, window);
  }
}

export function parseCodexUsagePayload(payload, now = new Date()) {
  const timestamp = nowDate(now);
  const windowsByCode = new Map();

  for (const [hint, value] of usageLimitEntries(payload)) {
    addWindow(windowsByCode, normalizeUsageWindow(value, { hint, now: timestamp }));
  }

  for (const [hint, value] of rateLimitEntries(payload)) {
    const fallbackCode = hint === "secondary_window" ? "7d" : "5h";

    addWindow(windowsByCode, normalizeUsageWindow(value, { fallbackCode, hint, now: timestamp }));
  }

  const windows = ["5h", "7d"].map((code) => windowsByCode.get(code)).filter(Boolean);

  return {
    available: windows.length > 0,
    planType: firstString(payload?.plan_type, payload?.planType, payload?.plan?.type, payload?.account?.plan_type),
    refreshedAt: timestamp.toISOString(),
    source: "codex",
    windows,
  };
}

function resetCreditsFromPayload(payload) {
  const credits = Array.isArray(payload)
    ? payload
    : payload?.reset_credits || payload?.resetCredits || payload?.renewal_credits || payload?.credits || payload?.data || [];

  if (!Array.isArray(credits)) {
    return [];
  }

  return credits;
}

export function parseResetCreditsPayload(payload) {
  const credits = resetCreditsFromPayload(payload);

  return credits.slice(0, 4).map((credit, index) => ({
    amount: firstFinite(credit.amount, credit.credits, credit.value),
    expiresAt: toIsoDate(credit.expiresAt || credit.expires_at || credit.reset_at || credit.renewal_at),
    id: firstString(credit.id) || `reset-credit-${index}`,
    label: firstString(credit.label, credit.name, credit.type) || "Reset credit",
    status: firstString(credit.status, credit.state),
  }));
}

export function parseResetCreditSummaryPayload(payload) {
  const summary = payload?.rate_limit_reset_credits || payload?.resetCreditSummary || payload?.summary || payload || {};
  const credits = resetCreditsFromPayload(summary);
  const availableCount = firstFinite(
    summary.available_count,
    summary.availableCount,
    summary.remaining_count,
    summary.remainingCount,
    summary.count,
    credits.length,
  );
  const totalEarnedCount = firstFinite(
    summary.total_earned_count,
    summary.totalEarnedCount,
    summary.earned_count,
    summary.earnedCount,
    summary.total_count,
    summary.totalCount,
    availableCount,
  );

  return {
    availableCount: Math.max(availableCount ?? 0, 0),
    totalEarnedCount: Math.max(totalEarnedCount ?? availableCount ?? 0, 0),
  };
}

export function sampleCodexUsageData(now = new Date()) {
  const timestamp = nowDate(now);

  return {
    available: true,
    planType: "Plus",
    refreshedAt: timestamp.toISOString(),
    resetCreditSummary: { availableCount: 1, totalEarnedCount: 3 },
    resetCredits: [{ expiresAt: addHours(timestamp, 18), id: "sample-reset-credit", label: "Reset credit" }],
    source: "sample",
    windows: [
      {
        code: "5h",
        label: "5 hour",
        limit: 100,
        percentRemaining: 62,
        percentUsed: 38,
        remaining: 62,
        resetAt: addHours(timestamp, 2),
        used: 38,
      },
      {
        code: "7d",
        label: "7 day",
        limit: 400,
        percentRemaining: 78,
        percentUsed: 22,
        remaining: 312,
        resetAt: addHours(timestamp, 4 * 24),
        used: 88,
      },
    ],
  };
}

function unavailableCodexUsageData(now = new Date(), errorMessage = "Codex usage unavailable") {
  return {
    available: false,
    errorMessage,
    refreshedAt: nowDate(now).toISOString(),
    resetCreditSummary: { availableCount: 0, totalEarnedCount: 0 },
    resetCredits: [],
    source: "unavailable",
    windows: [],
  };
}

async function refreshCodexTokens({ fetchImpl, refreshToken }) {
  if (!refreshToken) {
    return null;
  }

  const body = new URLSearchParams({
    client_id: CODEX_OAUTH_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const response = await fetchImpl(CODEX_TOKEN_URL, {
    body,
    headers: {
      Accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function fetchJson(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error || fallbackMessage);
    error.statusCode = response.status;
    throw error;
  }

  return payload;
}

async function fetchUsagePayload({ auth, fetchImpl }) {
  const headers = buildCodexUsageHeaders(auth);
  const response = await fetchImpl(CODEX_USAGE_URL, { headers });

  return fetchJson(response, "Unable to load Codex usage");
}

export async function readCodexUsageSnapshot({
  authPath,
  fetchImpl = fetch,
  homeDir,
  now = new Date(),
} = {}) {
  const timestamp = nowDate(now);
  const cacheKey = codexUsageCacheKey({ authPath, fetchImpl, homeDir });
  const cachedSnapshot = cachedCodexUsageSnapshot(cacheKey, timestamp);

  if (cachedSnapshot) {
    return cachedSnapshot;
  }

  try {
    let auth = await readLocalCodexAuth({ authPath, homeDir });

    if (!auth.accessToken) {
      return unavailableCodexUsageData(timestamp, "Run codex login on this machine");
    }

    let usagePayload;

    try {
      usagePayload = await fetchUsagePayload({ auth, fetchImpl });
    } catch (error) {
      if (error.statusCode !== 401 || !auth.refreshToken) {
        throw error;
      }

      const refreshedTokens = await refreshCodexTokens({ fetchImpl, refreshToken: auth.refreshToken });

      if (!refreshedTokens?.access_token) {
        throw error;
      }

      auth = {
        ...auth,
        accessToken: refreshedTokens.access_token,
        idToken: refreshedTokens.id_token || auth.idToken,
        refreshToken: refreshedTokens.refresh_token || auth.refreshToken,
      };
      usagePayload = await fetchUsagePayload({ auth, fetchImpl });
    }

    const snapshot = parseCodexUsagePayload(usagePayload, timestamp);
    let resetCredits = [];
    let resetCreditSummary = parseResetCreditSummaryPayload(usagePayload);

    try {
      const resetPayload = await fetchJson(
        await fetchImpl(CODEX_RESET_CREDITS_URL, { headers: buildCodexUsageHeaders(auth) }),
        "Unable to load Codex reset credits",
      );

      resetCredits = parseResetCreditsPayload(resetPayload);
      resetCreditSummary = parseResetCreditSummaryPayload(resetPayload);
    } catch {
      resetCredits = [];
    }

    return cacheCodexUsageSnapshot(cacheKey, timestamp, { ...snapshot, resetCreditSummary, resetCredits });
  } catch (error) {
    return unavailableCodexUsageData(timestamp, error.message || "Codex usage unavailable");
  }
}
