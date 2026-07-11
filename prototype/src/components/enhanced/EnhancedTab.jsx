import { useEffect, useMemo, useState } from "react";
import {
  createEnhancedRegistrySourceRequest,
  deleteEnhancedAdapterRequest,
  deleteEnhancedRegistrySourceRequest,
  getServiceEnhancementRequest,
  installEnhancedAdapterRequest,
  listEnhancedAdaptersRequest,
  listEnhancedRegistrySourcesRequest,
  saveServiceEnhancementRequest,
  syncEnhancedRegistrySourceRequest,
  testServiceEnhancementRequest,
} from "../../apiClient.js";
import { configWithServiceDefaults, visibleEnhancedConfigFields } from "../../enhancedConfig.js";
import { EnhancedRegistryPanel } from "./EnhancedRegistryPanel.jsx";

function EnhancedConfigField({ configured = false, field, onChange, value }) {
  if (field.type === "boolean") {
    return (
      <label className="toggle-control enhanced-toggle">
        <input
          aria-label={field.label}
          checked={Boolean(value)}
          type="checkbox"
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{field.label}</span>
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="field">
        <span>{field.label}</span>
        <select aria-label={field.label} value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
          {(field.options || []).map((option) => {
            const optionValue = typeof option === "string" ? option : option.value;
            const optionLabel = typeof option === "string" ? option : option.label || option.value;

            return (
              <option key={optionValue} value={optionValue}>
                {optionLabel}
              </option>
            );
          })}
        </select>
      </label>
    );
  }

  return (
    <label className="field">
      <span>{field.label}</span>
      <input
        aria-label={field.label}
        autoComplete={field.type === "password" ? "current-password" : undefined}
        min={field.min}
        placeholder={field.type === "password" && configured ? "Configured — leave blank to keep" : undefined}
        required={field.required && !configured}
        type={field.type === "password" ? "password" : field.type === "number" ? "number" : field.type === "url" ? "url" : "text"}
        value={value !== undefined ? value : ""}
        onChange={(event) => onChange(field.type === "number" ? Number(event.target.value) : event.target.value)}
      />
    </label>
  );
}

export function EnhancedTab({ onEnhancementSaved, service }) {
  const [adapters, setAdapters] = useState([]);
  const [config, setConfig] = useState({});
  const [enhancement, setEnhancement] = useState(null);
  const [externalPluginsEnabled, setExternalPluginsEnabled] = useState(true);
  const [message, setMessage] = useState("");
  const [selectedAdapterId, setSelectedAdapterId] = useState("");
  const [sources, setSources] = useState([]);

  useEffect(() => {
    let current = true;

    async function loadEnhanced() {
      const [nextAdapters, nextEnhancement, registryState] = await Promise.all([
        listEnhancedAdaptersRequest(),
        getServiceEnhancementRequest(service.id),
        listEnhancedRegistrySourcesRequest(),
      ]);

      if (!current) {
        return;
      }

      setAdapters(nextAdapters);
      setEnhancement(nextEnhancement);
      setExternalPluginsEnabled(registryState.externalPluginsEnabled);
      setSources(registryState.sources);
      setSelectedAdapterId(
        nextEnhancement?.adapterId ||
          nextAdapters.find((adapter) => adapter.manifest?.serviceTypes?.includes(service.typeId))?.id ||
          "",
      );
    }

    loadEnhanced();

    return () => {
      current = false;
    };
  }, [service.id, service.typeId]);

  const selectedAdapter = useMemo(
    () => adapters.find((adapter) => adapter.id === selectedAdapterId),
    [adapters, selectedAdapterId],
  );

  useEffect(() => {
    setConfig(configWithServiceDefaults(enhancement?.config, selectedAdapter, service));
  }, [enhancement, selectedAdapter, service]);

  async function handleInstall(adapter) {
    const installed = await installEnhancedAdapterRequest({
      adapterId: adapter.id,
      sourceId: adapter.sourceId,
      sourceType: adapter.sourceType,
    });
    setAdapters((current) => [installed, ...current.filter((candidate) => candidate.id !== installed.id)]);
    setSelectedAdapterId(installed.id);
  }

  async function handleUninstall(adapter) {
    await deleteEnhancedAdapterRequest(adapter.id);
    setAdapters((current) => current.filter((candidate) => candidate.id !== adapter.id));

    if (selectedAdapterId === adapter.id) {
      setSelectedAdapterId("");
      setEnhancement(null);
      setConfig({});
    }

    onEnhancementSaved?.();
    setMessage(`${adapter.name} uninstalled`);
  }

  async function handleAddSource(input) {
    const source = await createEnhancedRegistrySourceRequest(input);
    setSources((current) => [source, ...current]);

    return source;
  }

  async function handleSyncSource(sourceId) {
    const result = await syncEnhancedRegistrySourceRequest(sourceId);
    const registryAdapters = result.apps.map((app) => ({
      id: app.id,
      manifest: {
        id: app.id,
        name: app.name,
        serviceTypes: app.serviceTypes || [service.typeId],
      },
      name: app.name,
      sourceId,
      sourceType: "github",
      widgets: [],
    }));

    setSources((current) => current.map((source) => (source.id === sourceId ? result.source : source)));
    setAdapters((current) => [
      ...registryAdapters,
      ...current.filter((adapter) => !registryAdapters.some((registryAdapter) => registryAdapter.id === adapter.id)),
    ]);
    setMessage(result.source.lastSyncMessage || "Registry source synced");
  }

  async function handleDeleteSource(sourceId) {
    await deleteEnhancedRegistrySourceRequest(sourceId);
    setSources((current) => current.filter((source) => source.id !== sourceId));
  }

  async function handleSave() {
    if (!selectedAdapterId) {
      setMessage("Select or install an enhanced adapter before saving.");
      return;
    }

    const missingRequiredField = visibleEnhancedConfigFields(selectedAdapter).find((field) => {
      if (!field.required) {
        return false;
      }

      if (field.type === "password" && enhancement?.configuredFields?.includes(field.key)) {
        return false;
      }

      const value = config[field.key];

      return value === undefined || value === null || String(value).trim() === "";
    });

    if (missingRequiredField) {
      setMessage(`${missingRequiredField.label} is required before saving.`);
      return;
    }

    try {
      const nextConfig = configWithServiceDefaults(config, selectedAdapter, service);
      const saved = await saveServiceEnhancementRequest(service.id, {
        adapterId: selectedAdapterId,
        config: nextConfig,
        enabled: true,
      });
      setEnhancement(saved);
      setConfig(nextConfig);
      onEnhancementSaved?.(saved);
      setMessage("Enhanced configuration saved");
    } catch (saveError) {
      setMessage(saveError.message || "Unable to save enhanced configuration");
    }
  }

  async function handleTest() {
    if (!selectedAdapterId) {
      setMessage("Select or install an enhanced adapter before testing.");
      return;
    }

    if (!enhancement?.enabled) {
      setMessage("Save enhanced configuration before testing.");
      return;
    }

    try {
      const result = await testServiceEnhancementRequest(service.id);
      setMessage(result.result?.message || "Connection test completed");
    } catch (testError) {
      setMessage(testError.message || "Unable to test enhanced connection");
    }
  }

  return (
    <div className="enhanced-tab">
      <section className="enhanced-config-panel">
        <header>
          <strong>{selectedAdapter?.name || "Enhanced Adapter"}</strong>
          <small>{enhancement?.enabled ? "Enabled" : "Not enabled"}</small>
        </header>
        {visibleEnhancedConfigFields(selectedAdapter).map((field) => (
          <EnhancedConfigField
            configured={enhancement?.configuredFields?.includes(field.key)}
            field={field}
            key={field.key}
            value={config[field.key]}
            onChange={(value) => setConfig((current) => ({ ...current, [field.key]: value }))}
          />
        ))}
        {message ? <p className="enhanced-message" role="status">{message}</p> : null}
        <footer className="enhanced-actions">
          <button className="secondary-button" type="button" onClick={handleTest}>
            Test Connection
          </button>
          <button className="primary-button" type="button" onClick={handleSave}>
            Save Changes
          </button>
        </footer>
      </section>
      <EnhancedRegistryPanel
        adapters={adapters}
        externalPluginsEnabled={externalPluginsEnabled}
        service={service}
        sources={sources}
        onAddSource={handleAddSource}
        onInstall={handleInstall}
        onDeleteSource={handleDeleteSource}
        onUninstall={handleUninstall}
        onSyncSource={handleSyncSource}
      />
    </div>
  );
}
