import { describe, expect, test } from "vitest";
import {
  ENHANCED_WIDGET_TEMPLATE_KIND,
  ENHANCED_WIDGET_TEMPLATE_SCOPE,
  buildEnhancedWidgetTemplate,
  createEnhancedTemplateId,
  getEnhancedTemplateServiceId,
  isEnhancedWidgetTemplate,
  parseEnhancedTemplateId,
} from "./enhancedWidgetContract.js";

describe("enhanced widget contract", () => {
  test("creates and parses service-scoped enhanced template ids", () => {
    const templateId = createEnhancedTemplateId("service:qbit", "transfer/speed");

    expect(templateId).toBe("enhanced:service%3Aqbit:transfer%2Fspeed");
    expect(parseEnhancedTemplateId(templateId)).toEqual({
      serviceId: "service:qbit",
      widgetId: "transfer/speed",
    });
  });

  test("builds app-owned widget templates for one concrete service enhancement", () => {
    const template = buildEnhancedWidgetTemplate({
      adapter: {
        manifest: { description: "qBittorrent metrics" },
      },
      enhancement: {
        adapterId: "qbittorrent",
        id: "enhancement-qbit",
      },
      service: {
        id: "service-qbit",
        typeId: "qbittorrent",
      },
      widget: {
        defaultLayout: { h: 2, w: 4 },
        fields: [{ key: "downloadSpeed", label: "Download" }],
        id: "transfer-speed",
        minLayout: { h: 2, w: 3 },
        name: "Transfer Speed",
        renderer: "metric-pair",
      },
    });

    expect(template).toMatchObject({
      enhanced: {
        adapterId: "qbittorrent",
        enhancementId: "enhancement-qbit",
        serviceId: "service-qbit",
        serviceTypeId: "qbittorrent",
        widgetId: "transfer-speed",
      },
      id: "enhanced:service-qbit:transfer-speed",
      kind: ENHANCED_WIDGET_TEMPLATE_KIND,
      scope: ENHANCED_WIDGET_TEMPLATE_SCOPE,
    });
    expect(isEnhancedWidgetTemplate(template)).toBe(true);
    expect(getEnhancedTemplateServiceId(template)).toBe("service-qbit");
  });
});
