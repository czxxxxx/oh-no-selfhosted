// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import "../../setupTests.js";
import { WidgetFrame } from "./WidgetFrame.jsx";

describe("WidgetFrame", () => {
  test("uses a group wrapper instead of an outer link when content is interactive", () => {
    render(
      <WidgetFrame
        containsInteractiveContent
        editMode={false}
        openUrl="http://media.example.test:8096"
        template={{ name: "Recently Added" }}
        widget={{ h: 3, id: "widget-jellyfin", title: "Recently Added", w: 6 }}
        onBeginDrag={vi.fn()}
        onBeginResize={vi.fn()}
        onSelect={vi.fn()}
      >
        <a href="http://media.example.test:8096/web/#/details?id=movie-1">Open Quiet Shore</a>
        <button type="button">All</button>
      </WidgetFrame>,
    );

    expect(screen.getByRole("group", { name: "Widget Recently Added" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open widget Recently Added" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Quiet Shore" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
  });

  test("renders the edge aura shell with widget accent and radius variables", () => {
    const { container } = render(
      <WidgetFrame
        editMode={false}
        openUrl="http://metrics.example.test"
        service={{ color: "#7e5bef", name: "Grafana" }}
        template={{ defaultStyle: { radius: 18 }, name: "System Load" }}
        widget={{
          h: 2,
          id: "widget-grafana",
          style: { accentColor: "#c084fc", radius: 22 },
          title: "System Load",
          w: 4,
        }}
        onBeginDrag={vi.fn()}
        onBeginResize={vi.fn()}
        onSelect={vi.fn()}
      >
        <div>System load content</div>
      </WidgetFrame>,
    );

    const frame = screen.getByRole("link", { name: "Open widget System Load" });

    expect(frame).toHaveClass("widget-frame", "border-glow-card");
    expect(container.querySelector(".edge-light")).toBeInTheDocument();
    expect(container.querySelector(".border-glow-inner")).toBeInTheDocument();
    expect(frame.style.getPropertyValue("--border-radius")).toBe("22px");
    expect(frame.style.getPropertyValue("--glow-padding")).toBe("26px");
    expect(frame.style.getPropertyValue("--cone-spread")).toBe("18");
    expect(frame.style.getPropertyValue("--fill-opacity")).toBe("0.1");
    expect(frame.style.getPropertyValue("--gradient-base")).toBe("linear-gradient(#c084fc 0 100%)");
    expect(frame.style.getPropertyValue("--gradient-two")).toContain("#67e8f9");
  });
});
