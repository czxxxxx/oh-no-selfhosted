import { describe, expect, test } from "vitest";
import { SERVICE_TYPES } from "./serviceCatalog.js";

describe("service catalog", () => {
  test("ships the curated service types with custom last", () => {
    expect(SERVICE_TYPES.find((type) => type.id === "qbittorrent")).toMatchObject({
      iconKey: "qbittorrent",
      name: "qBittorrent",
    });
    expect(SERVICE_TYPES.find((type) => type.id === "jellyfin")).toMatchObject({
      category: "Media",
      name: "Jellyfin",
    });
    expect(SERVICE_TYPES.at(-1)).toMatchObject({ id: "custom" });
  });
});
