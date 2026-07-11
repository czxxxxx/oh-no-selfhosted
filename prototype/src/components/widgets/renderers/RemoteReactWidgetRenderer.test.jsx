// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import {
  clearRemoteReactModuleCache,
  RemoteReactWidgetRenderer,
} from "./RemoteReactWidgetRenderer.jsx";

describe("RemoteReactWidgetRenderer", () => {
  afterEach(() => {
    cleanup();
    clearRemoteReactModuleCache();
    document.querySelectorAll("link[data-oh-no-plugin-stylesheet]").forEach((link) => link.remove());
  });

  test("loads a stateful remote component with the host React runtime", async () => {
    const source = `
const React = globalThis.__OH_NO_PLUGIN_RUNTIME__.React;
export function CounterWidget({ data, onRefresh }) {
  const [count, setCount] = React.useState(data.count);
  return React.createElement(
    "section",
    null,
    React.createElement("strong", null, "Remote count: " + count),
    React.createElement("button", { onClick: () => setCount((value) => value + 1) }, "Increment"),
    React.createElement("button", { onClick: onRefresh }, "Refresh source"),
  );
}
`;
    const moduleUrl = `data:text/javascript;base64,${btoa(source)}`;
    const refreshed = [];

    render(
      <RemoteReactWidgetRenderer
        onRefresh={(widgetId) => refreshed.push(widgetId)}
        openUrl=""
        service={null}
        style={{}}
        template={{
          react: {
            exportName: "CounterWidget",
            moduleUrl,
            pluginId: "counter-plugin",
            stylesheetUrl: "/counter-plugin.css?v=1",
          },
        }}
        widget={{ enhancedData: { count: 4 }, id: "widget-remote" }}
      />,
    );

    expect(await screen.findByText("Remote count: 4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Increment" }));
    expect(screen.getByText("Remote count: 5")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh source" }));
    expect(refreshed).toEqual(["widget-remote"]);

    await waitFor(() => {
      expect(document.querySelector('link[href="/counter-plugin.css?v=1"]')).toBeTruthy();
    });
  });
});
