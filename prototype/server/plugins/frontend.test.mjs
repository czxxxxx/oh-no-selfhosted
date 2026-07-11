import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as React from "react";
import * as ReactDom from "react-dom";
import * as ReactDomClient from "react-dom/client";
import * as jsxDevRuntime from "react/jsx-dev-runtime";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test } from "vitest";
import {
  compilePluginFrontend,
  createReactWidgetReference,
  scopePluginCss,
  validateFrontendDefinition,
} from "./frontend.mjs";

describe("React plugin frontend", () => {
  let pluginDir;

  afterEach(async () => {
    delete globalThis.__OH_NO_PLUGIN_RUNTIME__;

    if (pluginDir) {
      await rm(pluginDir, { force: true, recursive: true });
    }
  });

  test("validates a multi-file frontend and creates a cache-busted widget reference", () => {
    const manifest = {
      frontend: { entry: "frontend.jsx", files: ["frontend.jsx", "widget.css"] },
      id: "status-lab",
      version: "1.2.3",
    };

    expect(validateFrontendDefinition(manifest.frontend)).toEqual({
      dependencies: {},
      entry: "frontend.jsx",
      files: ["frontend.jsx", "widget.css"],
      styleIsolation: "scoped",
    });
    expect(
      createReactWidgetReference({ component: "StatusWidget", manifest, pluginKind: "integration" }),
    ).toEqual({
      capabilities: [],
      exportName: "StatusWidget",
      moduleUrl: "/api/plugins/frontend/integration/status-lab/frontend.js?v=1.2.3",
      pluginId: "status-lab",
      pluginKind: "integration",
      styleIsolation: "scoped",
      stylesheetUrl: "/api/plugins/frontend/integration/status-lab/frontend.css?v=1.2.3",
      version: "1.2.3",
    });
  });

  test("bundles JSX, hooks, local imports, and CSS against the host React runtime", async () => {
    pluginDir = await mkdtemp(join(tmpdir(), "oh-no-react-plugin-"));
    await writeFile(
      join(pluginDir, "frontend.jsx"),
      `
import React, { useState } from "react";
import { label } from "./label.js";
import "./widget.css";

export function StatusWidget({ data }) {
  const [count] = useState(data.count);
  return <button className="remote-counter">{label}: {count}</button>;
}
`,
      "utf8",
    );
    await writeFile(join(pluginDir, "label.js"), 'export const label = "Remote";\n', "utf8");
    await writeFile(join(pluginDir, "widget.css"), ".remote-counter { color: rgb(255, 0, 0); }\n", "utf8");
    const manifest = {
      frontend: {
        entry: "frontend.jsx",
        files: ["frontend.jsx", "label.js", "widget.css"],
      },
      id: "status-lab",
      version: "1.0.0",
    };
    const artifacts = await compilePluginFrontend({ force: true, manifest, pluginDir });
    const javascript = await readFile(artifacts.javascript, "utf8");
    const css = await readFile(artifacts.css, "utf8");

    expect(javascript).toContain("__OH_NO_PLUGIN_RUNTIME__");
    expect(javascript).not.toMatch(/from\s+["']react/);
    expect(css).toContain('[data-oh-no-plugin-root="status-lab"] .remote-counter');

    globalThis.__OH_NO_PLUGIN_RUNTIME__ = {
      React,
      ReactDOM: ReactDom,
      ReactDOMClient: ReactDomClient,
      jsxDevRuntime,
      jsxRuntime,
    };
    const encoded = Buffer.from(javascript).toString("base64");
    const module = await import(`data:text/javascript;base64,${encoded}`);

    expect(renderToStaticMarkup(React.createElement(module.StatusWidget, { data: { count: 7 } }))).toContain(
      "Remote: 7",
    );
  });

  test("scopes plugin selectors while preserving keyframe steps", () => {
    expect(
      scopePluginCss(
        ":root { --accent: red; } body .card, .button { color: var(--accent); } @keyframes pulse { from { opacity: 0; } to { opacity: 1; } }",
        "status-lab",
      ),
    ).toContain('[data-oh-no-plugin-root="status-lab"] .card');
    expect(scopePluginCss(".button { color: red; }", "status-lab")).toContain(
      '[data-oh-no-plugin-root="status-lab"] .button',
    );
    expect(scopePluginCss("@keyframes pulse { from { opacity: 0; } }", "status-lab")).toContain(
      "from { opacity: 0; }",
    );
  });

  test("validates exact third-party dependency versions", () => {
    expect(
      validateFrontendDefinition({
        dependencies: { "date-fns": "4.1.0" },
        entry: "frontend.jsx",
      }).dependencies,
    ).toEqual({ "date-fns": "4.1.0" });
    expect(() =>
      validateFrontendDefinition({ dependencies: { "date-fns": "latest" }, entry: "frontend.jsx" }),
    ).toThrow(/semantic version/);
  });
});
