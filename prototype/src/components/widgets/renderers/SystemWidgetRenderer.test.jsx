import { describe, expect, test } from "vitest";
import "../../../setupTests.js";
import { SYSTEM_WIDGET_TEMPLATE_IDS } from "./SystemWidgetRenderer.jsx";

describe("SystemWidgetRenderer", () => {
  test("does not register weather as a native system widget", () => {
    expect(SYSTEM_WIDGET_TEMPLATE_IDS.has("weather-current")).toBe(false);
  });
});
