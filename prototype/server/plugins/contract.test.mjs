import { describe, expect, test } from "vitest";
import {
  compareSemver,
  PLUGIN_API_VERSION,
  validateCommonPluginManifest,
} from "./contract.mjs";

describe("plugin contract", () => {
  test("normalizes v1 capabilities, dependencies, and replacements", () => {
    expect(
      validateCommonPluginManifest(
        {
          apiVersion: PLUGIN_API_VERSION,
          capabilities: ["react", "host-refresh", "react"],
          kind: "widget",
          minHostVersion: "0.1.0",
          replaces: ["legacy-clock", "legacy-clock"],
          requires: [{ id: "weather", kind: "integration", minVersion: "1.2.0" }],
        },
        { kind: "widget" },
      ),
    ).toEqual({
      apiVersion: PLUGIN_API_VERSION,
      capabilities: ["react", "host-refresh"],
      dependencies: {},
      kind: "widget",
      minHostVersion: "0.1.0",
      replaces: ["legacy-clock"],
      requires: [{ id: "weather", kind: "integration", minVersion: "1.2.0" }],
    });
  });

  test("rejects incompatible API and host versions", () => {
    expect(() => validateCommonPluginManifest({ apiVersion: "oh-no.dev/v2" }, { kind: "widget" })).toThrow(
      /unsupported plugin apiVersion/i,
    );
    expect(() =>
      validateCommonPluginManifest({ minHostVersion: "99.0.0" }, { kind: "widget" }),
    ).toThrow(/requires Oh No Selfhosted/i);
  });

  test("compares semantic versions", () => {
    expect(compareSemver("1.2.0", "1.1.9")).toBe(1);
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
    expect(compareSemver("0.9.0", "1.0.0")).toBe(-1);
  });
});
