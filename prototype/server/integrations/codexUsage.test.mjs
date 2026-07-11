import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  buildCodexUsageHeaders,
  parseResetCreditSummaryPayload,
  parseCodexUsagePayload,
  readCodexUsageSnapshot,
} from "./codexUsage.mjs";

function jwtWithPayload(payload) {
  return [
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "",
  ].join(".");
}

describe("Codex usage integration", () => {
  let dataDir;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "oh-no-codex-usage-"));
  });

  afterEach(async () => {
    await rm(dataDir, { force: true, recursive: true });
  });

  test("builds Codex usage headers with the ChatGPT account id from the id token", () => {
    const idToken = jwtWithPayload({
      "https://api.openai.com/auth": {
        chatgpt_account_id: "account-test",
      },
    });

    const headers = buildCodexUsageHeaders({
      accessToken: "access-test",
      idToken,
    });

    expect(headers).toMatchObject({
      Authorization: "Bearer access-test",
      "ChatGPT-Account-Id": "account-test",
      "OpenAI-Beta": "codex-1",
      originator: "Codex Desktop",
    });
  });

  test("parses five hour and weekly usage windows from usage limits", () => {
    const snapshot = parseCodexUsagePayload(
      {
        plan_type: "plus",
        usage: {
          limits: [
            {
              label: "5h",
              limit: 100,
              reset_at: "2026-07-04T18:00:00.000Z",
              used: 32,
              window: "5h",
            },
            {
              current_usage: 86,
              label: "weekly",
              next_reset_at: "2026-07-08T00:00:00.000Z",
              quota: 400,
              window: "7d",
            },
          ],
        },
      },
      new Date("2026-07-04T12:00:00.000Z"),
    );

    expect(snapshot).toMatchObject({
      available: true,
      planType: "plus",
      source: "codex",
      windows: [
        {
          code: "5h",
          limit: 100,
          percentUsed: 32,
          percentRemaining: 68,
          remaining: 68,
          resetAt: "2026-07-04T18:00:00.000Z",
          used: 32,
        },
        {
          code: "7d",
          limit: 400,
          percentUsed: 21.5,
          percentRemaining: 78.5,
          remaining: 314,
          resetAt: "2026-07-08T00:00:00.000Z",
          used: 86,
        },
      ],
    });
  });

  test("falls back to rate limit windows when usage limits are absent", () => {
    const snapshot = parseCodexUsagePayload(
      {
        rate_limit: {
          primary_window: {
            limit: 80,
            reset_at: "2026-07-04T17:00:00.000Z",
            used: 20,
          },
          secondary_window: {
            current_usage: 50,
            quota: 200,
            resets_at: "2026-07-10T00:00:00.000Z",
          },
        },
      },
      new Date("2026-07-04T12:00:00.000Z"),
    );

    expect(snapshot.windows.map((window) => window.code)).toEqual(["5h", "7d"]);
    expect(snapshot.windows[0]).toMatchObject({ limit: 80, percentRemaining: 75, percentUsed: 25, remaining: 60, used: 20 });
    expect(snapshot.windows[1]).toMatchObject({ limit: 200, percentRemaining: 75, percentUsed: 25, remaining: 150, used: 50 });
  });

  test("parses reset card summary counts from Codex reset credits payload", () => {
    expect(
      parseResetCreditSummaryPayload({
        available_count: 2,
        credits: [
          { amount: 1, expires_at: "2026-07-05T00:00:00.000Z", id: "credit-1", name: "Reset card", status: "active" },
        ],
        total_earned_count: 5,
      }),
    ).toMatchObject({
      availableCount: 2,
      totalEarnedCount: 5,
    });
  });

  test("reads local Codex auth and fetches usage plus reset credits", async () => {
    const authDir = join(dataDir, ".codex");
    const authPath = join(authDir, "auth.json");
    const calls = [];

    await mkdir(authDir, { recursive: true });
    await writeFile(
      authPath,
      JSON.stringify({
        tokens: {
          access_token: "access-test",
          id_token: jwtWithPayload({
            "https://api.openai.com/auth": {
              chatgpt_account_id: "account-test",
            },
          }),
        },
      }),
    );

    const fetchImpl = async (url, options = {}) => {
      calls.push({ headers: options.headers, url: String(url) });

      if (String(url).endsWith("/wham/usage")) {
        return Response.json({
          usage: {
            limits: [
              { limit: 100, reset_at: "2026-07-04T18:00:00.000Z", used: 32, window: "5h" },
              { limit: 400, reset_at: "2026-07-08T00:00:00.000Z", used: 86, window: "7d" },
            ],
          },
        });
      }

      return Response.json({
        available_count: 1,
        credits: [{ expires_at: "2026-07-05T00:00:00.000Z", name: "Codex reset credit", status: "active" }],
        total_earned_count: 3,
      });
    };

    const snapshot = await readCodexUsageSnapshot({
      authPath,
      fetchImpl,
      now: new Date("2026-07-04T12:00:00.000Z"),
    });

    expect(calls.map((call) => call.url)).toEqual([
      "https://chatgpt.com/backend-api/wham/usage",
      "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits",
    ]);
    expect(calls[0].headers).toMatchObject({
      Authorization: "Bearer access-test",
      "ChatGPT-Account-Id": "account-test",
    });
    expect(snapshot).toMatchObject({
      available: true,
      resetCredits: [{ expiresAt: "2026-07-05T00:00:00.000Z", label: "Codex reset credit" }],
      resetCreditSummary: { availableCount: 1, totalEarnedCount: 3 },
      windows: [expect.objectContaining({ code: "5h" }), expect.objectContaining({ code: "7d" })],
    });
  });

  test("caches Codex usage snapshots for five minutes", async () => {
    const authDir = join(dataDir, ".codex");
    const authPath = join(authDir, "auth.json");
    const calls = [];
    let usageReads = 0;

    await mkdir(authDir, { recursive: true });
    await writeFile(
      authPath,
      JSON.stringify({
        tokens: {
          access_token: "access-test",
          id_token: jwtWithPayload({
            "https://api.openai.com/auth": {
              chatgpt_account_id: "account-test",
            },
          }),
        },
      }),
    );

    const fetchImpl = async (url, options = {}) => {
      calls.push({ headers: options.headers, url: String(url) });

      if (String(url).endsWith("/wham/usage")) {
        usageReads += 1;

        return Response.json({
          usage: {
            limits: [
              {
                limit: 100,
                reset_at: "2026-07-04T18:00:00.000Z",
                used: usageReads * 10,
                window: "5h",
              },
              {
                limit: 400,
                reset_at: "2026-07-08T00:00:00.000Z",
                used: 80 + usageReads,
                window: "7d",
              },
            ],
          },
        });
      }

      return Response.json({ reset_credits: [] });
    };

    const firstSnapshot = await readCodexUsageSnapshot({
      authPath,
      fetchImpl,
      now: new Date("2026-07-04T12:00:00.000Z"),
    });
    const cachedSnapshot = await readCodexUsageSnapshot({
      authPath,
      fetchImpl,
      now: new Date("2026-07-04T12:04:59.000Z"),
    });
    const expiredSnapshot = await readCodexUsageSnapshot({
      authPath,
      fetchImpl,
      now: new Date("2026-07-04T12:05:01.000Z"),
    });

    expect(calls.map((call) => call.url)).toEqual([
      "https://chatgpt.com/backend-api/wham/usage",
      "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits",
      "https://chatgpt.com/backend-api/wham/usage",
      "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits",
    ]);
    expect(firstSnapshot.windows[0]).toMatchObject({ percentUsed: 10, used: 10 });
    expect(cachedSnapshot.windows[0]).toMatchObject({ percentUsed: 10, used: 10 });
    expect(cachedSnapshot.refreshedAt).toBe("2026-07-04T12:00:00.000Z");
    expect(expiredSnapshot.windows[0]).toMatchObject({ percentUsed: 20, used: 20 });
    expect(expiredSnapshot.refreshedAt).toBe("2026-07-04T12:05:01.000Z");
  });
});
