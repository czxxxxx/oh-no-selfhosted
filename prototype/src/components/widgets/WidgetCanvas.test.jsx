// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { createEnhancedTemplateId } from "../../enhancedWidgetContract.js";
import { resolveWidgetMinimums } from "./WidgetCanvas.jsx";

describe("resolveWidgetMinimums", () => {
  test("keeps the qBittorrent transfer speed widget large enough for the operations card", () => {
    expect(
      resolveWidgetMinimums({
        enhancedWidgetId: "transfer-speed",
        minH: 2,
        minW: 3,
        templateId: createEnhancedTemplateId("service-qbit", "transfer-speed"),
      }),
    ).toEqual({ minH: 3, minW: 6 });
  });

  test("uses registry template minimums for external integration widgets", () => {
    const template = {
      id: "integration:pingdom-lite:status",
      minLayout: { h: 4, w: 5 },
    };

    expect(
      resolveWidgetMinimums(
        {
          templateId: template.id,
        },
        template,
      ),
    ).toEqual({ minH: 4, minW: 5 });
  });
});
