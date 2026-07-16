import { useState } from "react";
import { FiDownloadCloud, FiRefreshCw, FiTrash2 } from "react-icons/fi";

function sourceTypeLabel(sourceType) {
  if (sourceType === "built-in") return "Built-in";
  if (sourceType === "github") return "GitHub";
  if (sourceType === "local") return "Local";

  return sourceType;
}

export function EnhancedRegistryPanel({
  adapters,
  externalPluginsEnabled,
  onAddSource,
  onDeleteSource,
  onInstall,
  onSyncSource,
  onUninstall,
  service,
  sources,
}) {
  const [sourceError, setSourceError] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [trustSource, setTrustSource] = useState(false);

  async function handleAddSource(event) {
    event.preventDefault();

    const nextSourceUrl = sourceUrl.trim();

    if (!nextSourceUrl) {
      setSourceError("Enter a GitHub registry URL.");
      return;
    }

    try {
      const parsedUrl = new URL(nextSourceUrl);

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        setSourceError("Use a full URL that starts with http:// or https://.");
        return;
      }

      if (!trustSource) {
        setSourceError("Confirm that you trust this registry before adding it.");
        return;
      }

      setSourceError("");
      const source = await onAddSource({
        name: "GitHub Registry",
        trusted: true,
        type: "github",
        url: nextSourceUrl,
      });
      await onSyncSource(source.id);
      setSourceUrl("");
      setTrustSource(false);
    } catch (sourceSaveError) {
      setSourceError(sourceSaveError.message || "Unable to add registry source.");
    }
  }

  return (
    <aside className="enhanced-registry-panel" aria-label="Enhanced Registry">
      <header>
        <strong>Enhanced Registry</strong>
        <small>Built-in adapters and optional external sources</small>
      </header>

      {externalPluginsEnabled ? (
        <form className="registry-source-form" onSubmit={handleAddSource}>
        <label className="field">
          <span>GitHub Registry URL</span>
          <input
            aria-describedby={sourceError ? "registry-source-error" : undefined}
            aria-invalid={sourceError ? "true" : undefined}
            aria-label="GitHub Registry URL"
            type="url"
            value={sourceUrl}
            onChange={(event) => {
              setSourceUrl(event.target.value);
              setSourceError("");
            }}
          />
        </label>
        <button className="secondary-button" type="submit">
          Add Source
        </button>
        <label className="registry-trust-control">
          <input
            checked={trustSource}
            type="checkbox"
            onChange={(event) => {
              setTrustSource(event.target.checked);
              setSourceError("");
            }}
          />
          <span>I trust code from this registry</span>
        </label>
        <p className="registry-security-note">
          Installed adapters may execute server modules and React frontends. Only add repositories you trust.
        </p>
        {sourceError ? (
          <p className="form-error" id="registry-source-error" role="alert">
            {sourceError}
          </p>
        ) : null}
        </form>
      ) : (
        <aside className="registry-policy-note" role="status">
          <strong>Built-in adapters remain available.</strong>
          <span>
            External registries are off. Restart with --allow-unsafe-plugins only to add trusted third-party code.
          </span>
        </aside>
      )}

      <div className="registry-source-list">
        {sources.map((source) => (
          <div className="registry-source-row" key={source.id}>
            <span>
              <strong>{source.name}</strong>
              <small>{source.lastSyncMessage || source.url}</small>
            </span>
            <button
              aria-label={`Sync ${source.name}`}
              disabled={!externalPluginsEnabled}
              type="button"
              onClick={() => onSyncSource(source.id)}
            >
              <FiRefreshCw aria-hidden="true" />
            </button>
            <button aria-label={`Delete ${source.name}`} type="button" onClick={() => onDeleteSource(source.id)}>
              <FiTrash2 aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      <div className="enhanced-registry-list">
        {adapters.map((adapter) => {
          const serviceTypes = adapter.manifest?.serviceTypes || adapter.serviceTypes || [];
          const supportsService = serviceTypes.length === 0 || serviceTypes.includes(service.typeId);

          return (
            <div className="enhanced-registry-row" key={`${adapter.sourceType}:${adapter.sourceId || adapter.id}`}>
              <button
                aria-label={`${adapter.installed ? "Update" : "Install"} ${adapter.name}`}
                disabled={!supportsService}
                type="button"
                onClick={() => onInstall(adapter)}
              >
                <FiDownloadCloud aria-hidden="true" />
                <span>
                  <strong>{adapter.name}</strong>
                  <small>
                    {supportsService ? sourceTypeLabel(adapter.sourceType) : "Not for this service"}
                    {adapter.installed ? " · installed" : ""}
                  </small>
                </span>
              </button>
              {adapter.installed ? (
                <button aria-label={`Uninstall ${adapter.name}`} type="button" onClick={() => onUninstall(adapter)}>
                  <FiTrash2 aria-hidden="true" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
