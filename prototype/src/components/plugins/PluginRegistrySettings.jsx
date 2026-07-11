import { useEffect, useMemo, useState } from "react";
import { FiBox, FiDownloadCloud, FiRefreshCw, FiTrash2 } from "react-icons/fi";
import {
  createPluginRegistrySourceRequest,
  deletePluginRegistrySourceRequest,
  installPluginContributionRequest,
  loadPluginRegistryRequest,
  syncPluginRegistrySourceRequest,
  uninstallPluginContributionRequest,
} from "../../apiClient.js";

const KIND_LABELS = {
  integration: "Integration",
  "service-adapter": "Service adapter",
  "service-type": "Service type",
  widget: "Widget pack",
};

function contributionDescription(contribution) {
  if (contribution.description) {
    return contribution.description;
  }

  if (contribution.kind === "service-adapter" && contribution.serviceTypes?.length) {
    return `Supports ${contribution.serviceTypes.join(", ")}`;
  }

  return KIND_LABELS[contribution.kind];
}

function installActionLabel(contribution) {
  if (!contribution.installed) {
    return "Install";
  }

  if (contribution.updateAvailable) {
    return "Update";
  }

  if (contribution.versionState === "newer-installed") {
    return "Newer installed";
  }

  return "Reinstall";
}

export function PluginRegistrySettings({ onChanged }) {
  const [busyKey, setBusyKey] = useState("");
  const [catalog, setCatalog] = useState({
    builtInRegistry: null,
    contributions: [],
    externalPluginsEnabled: true,
    invalidPlugins: [],
    sources: [],
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceRef, setSourceRef] = useState("");
  const [sourceToken, setSourceToken] = useState("");
  const [trustSource, setTrustSource] = useState(false);

  async function reload() {
    const payload = await loadPluginRegistryRequest();
    setCatalog({
      builtInRegistry: payload.builtInRegistry || null,
      contributions: payload.contributions || [],
      externalPluginsEnabled: payload.externalPluginsEnabled !== false,
      invalidPlugins: payload.invalidPlugins || [],
      sources: payload.sources || [],
    });
  }

  useEffect(() => {
    reload().catch((loadError) => setError(loadError.message || "Unable to load plugin registry"));
  }, []);

  const contributions = useMemo(
    () =>
      [...catalog.contributions].sort((a, b) =>
        `${a.sourceName}:${a.kind}:${a.name}`.localeCompare(`${b.sourceName}:${b.kind}:${b.name}`),
      ),
    [catalog.contributions],
  );

  async function runAction(key, action, successMessage) {
    setBusyKey(key);
    setError("");
    setMessage("");

    try {
      await action();
      setMessage(successMessage);
    } catch (actionError) {
      setError(actionError.message || "Plugin action failed");
    } finally {
      await reload().catch(() => {});
      onChanged?.();
      setBusyKey("");
    }
  }

  async function handleAddSource(event) {
    event.preventDefault();
    const url = sourceUrl.trim();

    if (!url) {
      setError("Enter a GitHub repository or registry.json URL.");
      return;
    }

    if (!trustSource) {
      setError("Confirm that you trust this registry before adding it.");
      return;
    }

    await runAction(
      "add-source",
      async () => {
        const source = await createPluginRegistrySourceRequest({
          authToken: sourceToken.trim() || undefined,
          name: "GitHub Plugin Registry",
          ref: sourceRef.trim() || undefined,
          trusted: true,
          type: "github",
          url,
        });
        await syncPluginRegistrySourceRequest(source.id);
        setSourceUrl("");
        setSourceRef("");
        setSourceToken("");
        setTrustSource(false);
      },
      "Plugin registry added and synced.",
    );
  }

  async function installAll(sourceId) {
    const pending = contributions.filter((contribution) => contribution.sourceId === sourceId && !contribution.installed);

    await runAction(
      `install-all:${sourceId}`,
      async () => {
        for (const contribution of pending) {
          await installPluginContributionRequest({
            kind: contribution.kind,
            pluginId: contribution.id,
            sourceId,
          });
        }
      },
      `${pending.length} plugin contribution${pending.length === 1 ? "" : "s"} installed.`,
    );
  }

  return (
    <section className="plugin-registry-settings" aria-labelledby="plugin-registry-title">
      <header className="plugin-registry-heading">
        <span className="settings-mark" aria-hidden="true">
          <FiBox />
        </span>
        <span>
          <h3 id="plugin-registry-title">Plugin Registry</h3>
          <small>Install widgets, services, and integrations from a compatible GitHub repository.</small>
        </span>
      </header>

      <aside className="plugin-security-warning">
        <strong>Remote plugins run with full local app access.</strong>
        <span>Server modules and React frontends are compiled locally and are not sandboxed.</span>
      </aside>

      {!catalog.externalPluginsEnabled ? (
        <aside className="plugin-security-warning" role="status">
          <strong>External plugins are disabled.</strong>
          <span>Restart with --allow-unsafe-plugins only when you intend to run trusted third-party code.</span>
        </aside>
      ) : (
        <form className="plugin-source-form" onSubmit={handleAddSource}>
        <label className="field">
          <span>GitHub repository or registry URL</span>
          <input
            aria-label="Plugin registry URL"
            placeholder="https://github.com/owner/oh-no-plugins"
            type="url"
            value={sourceUrl}
            onChange={(event) => {
              setSourceUrl(event.target.value);
              setError("");
            }}
          />
        </label>
        <label className="field">
          <span>Branch or tag (optional)</span>
          <input
            aria-label="Plugin registry branch or tag"
            placeholder="Auto-detect default branch"
            value={sourceRef}
            onChange={(event) => setSourceRef(event.target.value)}
          />
        </label>
        <label className="field">
          <span>GitHub token (optional, for private repositories)</span>
          <input
            aria-label="Plugin registry GitHub token"
            autoComplete="off"
            placeholder="github_pat_…"
            type="password"
            value={sourceToken}
            onChange={(event) => setSourceToken(event.target.value)}
          />
        </label>
        <label className="registry-trust-control">
          <input
            aria-label="Trust plugin registry"
            checked={trustSource}
            type="checkbox"
            onChange={(event) => {
              setTrustSource(event.target.checked);
              setError("");
            }}
          />
          <span>I trust server and React code from this registry</span>
        </label>
        <button className="primary-button" disabled={busyKey === "add-source"} type="submit">
          {busyKey === "add-source" ? "Adding..." : "Add GitHub Registry"}
        </button>
        </form>
      )}

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="form-success" role="status">{message}</p> : null}
      {catalog.invalidPlugins.length ? (
        <section className="plugin-invalid-list" aria-label="Invalid plugins">
          <strong>{catalog.invalidPlugins.length} plugin{catalog.invalidPlugins.length === 1 ? "" : "s"} skipped</strong>
          {catalog.invalidPlugins.map((plugin, index) => (
            <small key={`${plugin.sourceType}:${plugin.id}:${index}`}>
              {plugin.id}: {plugin.message}
            </small>
          ))}
        </section>
      ) : null}

      <div className="plugin-source-list">
        {catalog.builtInRegistry ? (
          <article className="plugin-source-card plugin-builtin-source-card">
            <header>
              <span>
                <strong>{catalog.builtInRegistry.name}</strong>
                <small>
                  {catalog.builtInRegistry.sourceType === "local" ? "Local registry · " : ""}
                  {catalog.builtInRegistry.counts.serviceTypes} service types ·{" "}
                  {catalog.builtInRegistry.counts.nativeWidgets +
                    catalog.builtInRegistry.counts.adapterWidgets +
                    catalog.builtInRegistry.counts.integrationWidgets} widget definitions ·{" "}
                  {catalog.builtInRegistry.counts.serviceAdapters} adapters ·{" "}
                  {catalog.builtInRegistry.counts.integrations} integrations
                </small>
              </span>
              <span className="plugin-kind-badge">
                {catalog.builtInRegistry.sourceType === "local" ? "Local · Verified" : "Verified"}
              </span>
            </header>
          </article>
        ) : null}
        {catalog.sources.map((source) => {
          const sourceContributions = contributions.filter((contribution) => contribution.sourceId === source.id);
          const pendingCount = sourceContributions.filter((contribution) => !contribution.installed).length;

          return (
            <article className="plugin-source-card" key={source.id}>
              <header>
                <span>
                  <strong>{source.registryIndex?.name || source.name}</strong>
                  <small>
                    {source.lastSyncMessage || source.url}
                    {source.ref ? ` · ${source.ref}` : " · default branch"}
                    {source.hasAuthToken ? " · private access" : ""}
                  </small>
                </span>
                <div className="plugin-source-actions">
                  <button
                    aria-label={`Sync ${source.name}`}
                    disabled={Boolean(busyKey) || !catalog.externalPluginsEnabled}
                    type="button"
                    onClick={() =>
                      runAction(
                        `sync:${source.id}`,
                        () => syncPluginRegistrySourceRequest(source.id),
                        "Plugin registry synced.",
                      )
                    }
                  >
                    <FiRefreshCw aria-hidden="true" />
                  </button>
                  <button
                    aria-label={`Delete ${source.name}`}
                    disabled={Boolean(busyKey)}
                    type="button"
                    onClick={() =>
                      runAction(
                        `delete-source:${source.id}`,
                        () => deletePluginRegistrySourceRequest(source.id),
                        "Registry source removed. Installed plugins were kept.",
                      )
                    }
                  >
                    <FiTrash2 aria-hidden="true" />
                  </button>
                </div>
              </header>
              {pendingCount ? (
                <button
                  className="secondary-button plugin-install-all"
                  disabled={Boolean(busyKey) || !catalog.externalPluginsEnabled}
                  type="button"
                  onClick={() => installAll(source.id)}
                >
                  <FiDownloadCloud aria-hidden="true" />
                  Install all {pendingCount}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="plugin-contribution-list" aria-label="Registry contributions">
        {contributions.map((contribution) => {
          const key = `${contribution.sourceId}:${contribution.kind}:${contribution.id}`;

          return (
            <article className="plugin-contribution-row" key={key}>
              <span className="plugin-kind-badge">{KIND_LABELS[contribution.kind]}</span>
              <span className="plugin-contribution-copy">
                <strong>{contribution.name}</strong>
                <small>
                  {contributionDescription(contribution)}
                  {contribution.version ? ` · ${contribution.version}` : ""}
                  {contribution.updateAvailable ? ` (installed ${contribution.installedVersion})` : ""}
                </small>
              </span>
              <span className="plugin-contribution-actions">
                <button
                  className={contribution.installed ? "secondary-button" : "primary-button"}
                  disabled={
                    Boolean(busyKey) ||
                    !catalog.externalPluginsEnabled ||
                    contribution.versionState === "newer-installed"
                  }
                  type="button"
                  onClick={() =>
                    runAction(
                      `${contribution.installed ? "update" : "install"}:${key}`,
                      () =>
                        installPluginContributionRequest({
                          kind: contribution.kind,
                          pluginId: contribution.id,
                          sourceId: contribution.sourceId,
                        }),
                      `${contribution.name} ${contribution.installed ? "updated" : "installed"}.`,
                    )
                  }
                >
                  {installActionLabel(contribution)}
                </button>
                {contribution.installed ? (
                  <button
                    className="secondary-button"
                    disabled={Boolean(busyKey)}
                    type="button"
                    onClick={() =>
                      runAction(
                        `uninstall:${key}`,
                        () => uninstallPluginContributionRequest(contribution.kind, contribution.id),
                        `${contribution.name} uninstalled.`,
                      )
                    }
                  >
                    Uninstall
                  </button>
                ) : null}
              </span>
            </article>
          );
        })}
        {catalog.sources.length && !contributions.length ? (
          <p className="plugin-empty-state">Sync a registry to discover its contributions.</p>
        ) : null}
        {!catalog.sources.length && !contributions.length ? (
          <p className="plugin-empty-state">
            {catalog.externalPluginsEnabled
              ? "Add a compatible GitHub registry to discover plugins."
              : "Built-in plugins remain available while external plugins are disabled."}
          </p>
        ) : null}
      </div>
    </section>
  );
}
