import * as React from "react";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as jsxDevRuntime from "react/jsx-dev-runtime";
import * as jsxRuntime from "react/jsx-runtime";
import { Component, useEffect, useState } from "react";

const moduleCache = new Map();
const stylesheetRegistry = new Map();
const MAX_REMOTE_MODULES = 64;

export function initializePluginReactRuntime() {
  const current = globalThis.__OH_NO_PLUGIN_RUNTIME__ || {};

  globalThis.__OH_NO_PLUGIN_RUNTIME__ = {
    ...current,
    React,
    ReactDOM,
    ReactDOMClient,
    jsxDevRuntime,
    jsxRuntime,
  };

  return globalThis.__OH_NO_PLUGIN_RUNTIME__;
}

export function loadRemoteReactModule(moduleUrl) {
  initializePluginReactRuntime();

  if (!moduleCache.has(moduleUrl)) {
    if (moduleCache.size >= MAX_REMOTE_MODULES) {
      moduleCache.delete(moduleCache.keys().next().value);
    }

    moduleCache.set(moduleUrl, import(/* @vite-ignore */ moduleUrl));
  }

  return moduleCache.get(moduleUrl);
}

export function clearRemoteReactModuleCache() {
  moduleCache.clear();
}

class RemoteWidgetErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="remote-react-widget-state is-error" role="alert">
          <strong>Plugin render failed</strong>
          <small>{this.state.error.message || "Unknown React plugin error"}</small>
        </div>
      );
    }

    return this.props.children;
  }
}

function usePluginStylesheet(stylesheetUrl) {
  useEffect(() => {
    if (!stylesheetUrl || typeof document === "undefined") {
      return;
    }

    let registered = stylesheetRegistry.get(stylesheetUrl);

    if (!registered) {
      const link = document.createElement("link");
      link.dataset.ohNoPluginStylesheet = "true";
      link.href = stylesheetUrl;
      link.rel = "stylesheet";
      document.head.append(link);
      registered = { count: 0, link };
      stylesheetRegistry.set(stylesheetUrl, registered);
    }

    registered.count += 1;

    return () => {
      registered.count -= 1;

      if (registered.count <= 0) {
        registered.link.remove();
        stylesheetRegistry.delete(stylesheetUrl);
      }
    };
  }, [stylesheetUrl]);
}

export function RemoteReactWidgetRenderer({ mode = "live", onRefresh, openUrl, service, style, template, widget }) {
  const reference = template.react;
  const [state, setState] = useState({ component: null, error: null });
  usePluginStylesheet(reference?.stylesheetUrl);

  useEffect(() => {
    let active = true;

    setState({ component: null, error: null });
    loadRemoteReactModule(reference.moduleUrl)
      .then((pluginModule) => {
        const RemoteComponent =
          pluginModule[reference.exportName] ||
          (reference.exportName === "default" ? pluginModule.default : null);

        if (typeof RemoteComponent !== "function") {
          throw new Error(`React export not found: ${reference.exportName}`);
        }

        if (active) {
          setState({ component: RemoteComponent, error: null });
        }
      })
      .catch((error) => {
        if (active) {
          setState({ component: null, error });
        }
      });

    return () => {
      active = false;
    };
  }, [reference.exportName, reference.moduleUrl]);

  if (state.error) {
    return (
      <div data-oh-no-plugin-root={reference.pluginId}>
        <div className="remote-react-widget-state is-error" role="alert">
          <strong>Plugin load failed</strong>
          <small>{state.error.message || "Unable to load React plugin"}</small>
        </div>
      </div>
    );
  }

  if (!state.component) {
    return (
      <div data-oh-no-plugin-root={reference.pluginId}>
        <div className="remote-react-widget-state" role="status">
          <strong>Loading plugin…</strong>
          <small>{reference.pluginId}</small>
        </div>
      </div>
    );
  }

  const RemoteComponent = state.component;

  return (
    <div data-oh-no-plugin-root={reference.pluginId}>
      <RemoteWidgetErrorBoundary key={`${reference.moduleUrl}:${reference.exportName}`}>
        <RemoteComponent
          capabilities={{
            declared: reference.capabilities || [],
            openUrl: mode === "live",
            refresh: mode === "live",
          }}
          config={widget.enhancedRenderer?.config || {}}
          data={widget.enhancedData || {}}
          isPreview={mode === "preview"}
          mode={mode}
          openUrl={mode === "preview" ? () => {} : openUrl}
          service={service}
          style={style}
          template={template}
          widget={widget}
          onRefresh={mode === "preview" ? () => {} : () => onRefresh?.(widget.id)}
        />
      </RemoteWidgetErrorBoundary>
    </div>
  );
}
