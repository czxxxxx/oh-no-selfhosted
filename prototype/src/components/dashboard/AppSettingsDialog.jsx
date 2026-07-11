import { lazy, Suspense, useRef, useState } from "react";
import { FiCheckCircle, FiDownload, FiImage, FiSettings, FiTrash2, FiUploadCloud, FiUser, FiX } from "react-icons/fi";
import { useDialogFocus } from "../useDialogFocus.js";

const MAX_BACKGROUND_UPLOAD_BYTES = 10 * 1024 * 1024;
const PluginRegistrySettings = lazy(() =>
  import("../plugins/PluginRegistrySettings.jsx").then((module) => ({
    default: module.PluginRegistrySettings,
  })),
);

export function AppSettingsDialog({
  backgroundPresets,
  fallbackFocusRef,
  mode,
  onClose,
  onDeleteBackground,
  onOpenMode,
  onPluginsChanged,
  onSelectBackground,
  onToggleTheme,
  onUploadBackground,
  selectedBackgroundId,
  serviceCount,
  theme,
  widgetCount,
}) {
  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const [backgroundError, setBackgroundError] = useState("");
  const [deletingBackgroundId, setDeletingBackgroundId] = useState("");
  const [isUploadingBackground, setIsUploadingBackground] = useState(false);
  const title = mode === "profile" ? "Profile" : mode === "plugins" ? "Plugins" : "Settings";

  useDialogFocus(dialogRef, { fallbackFocusRef, initialFocusRef: titleRef, onClose });

  async function handleBackgroundUpload(event) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    setBackgroundError("");

    if (file.size > MAX_BACKGROUND_UPLOAD_BYTES) {
      setBackgroundError("Background image must be smaller than 10 MB.");
      return;
    }

    setIsUploadingBackground(true);

    try {
      await onUploadBackground(file);
    } catch (error) {
      setBackgroundError(error.message || "Unable to upload background");
    } finally {
      setIsUploadingBackground(false);
    }
  }

  async function handleBackgroundDelete(backgroundId) {
    setBackgroundError("");
    setDeletingBackgroundId(backgroundId);

    try {
      await onDeleteBackground(backgroundId);
    } catch (error) {
      setBackgroundError(error.message || "Unable to delete background");
    } finally {
      setDeletingBackgroundId("");
    }
  }

  return (
    <div className="app-settings-layer">
      <section
        aria-labelledby="app-settings-title"
        aria-modal="true"
        className="app-settings-dialog"
        data-mode={mode}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="app-settings-header">
          <span className="settings-mark" aria-hidden="true">
            {mode === "profile" ? <FiUser /> : mode === "plugins" ? <FiDownload /> : <FiSettings />}
          </span>
          <span>
            <h2 id="app-settings-title" ref={titleRef} tabIndex={-1}>
              {title}
            </h2>
            <small>Workspace controls for this dashboard</small>
          </span>
          <button
            aria-label={`Close ${title}`}
            className="icon-button close-button"
            type="button"
            onClick={onClose}
          >
            <FiX aria-hidden="true" />
          </button>
        </header>

        <div aria-label="Settings sections" className="settings-mode-switch">
          {["settings", "plugins", "profile"].map((nextMode) => (
            <button
              aria-pressed={mode === nextMode}
              className={mode === nextMode ? "is-selected" : ""}
              key={nextMode}
              type="button"
              onClick={() => onOpenMode(nextMode)}
            >
              {nextMode === "profile" ? "Profile" : nextMode === "plugins" ? "Plugins" : "Settings"}
            </button>
          ))}
        </div>

        {mode === "profile" ? (
          <section className="settings-summary-panel" aria-labelledby="profile-panel-title">
            <h3 id="profile-panel-title">Operator</h3>
            <div className="profile-summary">
              <span aria-hidden="true">A</span>
              <div>
                <strong>Admin</strong>
                <small>Local dashboard profile</small>
              </div>
            </div>
          </section>
        ) : mode === "plugins" ? (
          <Suspense fallback={<p role="status">Loading plugins…</p>}>
            <PluginRegistrySettings onChanged={onPluginsChanged} />
          </Suspense>
        ) : (
          <section className="settings-summary-panel" aria-labelledby="settings-panel-title">
            <h3 id="settings-panel-title">Dashboard</h3>
            <label className="toggle-row">
              <span>
                <strong>Dark theme</strong>
                <small>Use the midnight lake glass interface</small>
              </span>
              <input
                aria-label="Dark theme"
                checked={theme === "dark"}
                type="checkbox"
                onChange={onToggleTheme}
              />
            </label>
            <fieldset className="background-picker">
              <legend>Background</legend>
              <label className={`background-upload-control ${isUploadingBackground ? "is-uploading" : ""}`}>
                <input
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif,.jpg,.jpeg,.png,.webp,.gif,.avif"
                  aria-label="Upload custom background"
                  disabled={isUploadingBackground}
                  type="file"
                  onChange={handleBackgroundUpload}
                />
                <span className="background-upload-icon" aria-hidden="true">
                  <FiImage />
                </span>
                <span className="background-upload-copy">
                  <strong>{isUploadingBackground ? "Uploading background..." : "Use your own image"}</strong>
                  <small>JPG, PNG, WEBP, GIF, or AVIF · up to 10 MB</small>
                </span>
                <span className="background-upload-action">
                  <FiUploadCloud aria-hidden="true" />
                  {isUploadingBackground ? "Uploading" : "Choose image"}
                </span>
              </label>
              {backgroundError ? (
                <p className="background-upload-error" role="alert">
                  {backgroundError}
                </p>
              ) : null}
              <div className="background-option-grid">
                {backgroundPresets.map((preset) => (
                  <div
                    className={`background-option ${preset.custom ? "has-delete" : ""} ${
                      selectedBackgroundId === preset.id ? "is-selected" : ""
                    }`}
                    key={preset.id}
                  >
                    <label className="background-option-select">
                      <input
                        checked={selectedBackgroundId === preset.id}
                        name="dashboard-background"
                        type="radio"
                        value={preset.id}
                        onChange={() => onSelectBackground(preset.id)}
                      />
                      <span
                        aria-hidden="true"
                        className="background-option-preview"
                        style={{ "--background-swatch": preset.swatch }}
                      />
                      <span className="background-option-copy">
                        <strong>{preset.name}</strong>
                        <small>{preset.description}</small>
                      </span>
                    </label>
                    {selectedBackgroundId === preset.id ? <FiCheckCircle aria-hidden="true" /> : null}
                    {preset.custom ? (
                      <button
                        aria-label={`Delete ${preset.name} background`}
                        className="background-option-delete"
                        disabled={deletingBackgroundId === preset.id}
                        title={`Delete ${preset.name}`}
                        type="button"
                        onClick={() => handleBackgroundDelete(preset.id)}
                      >
                        <FiTrash2 aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </fieldset>
            <dl className="settings-stats">
              <div>
                <dt>Services</dt>
                <dd>{serviceCount}</dd>
              </div>
              <div>
                <dt>Widgets</dt>
                <dd>{widgetCount}</dd>
              </div>
            </dl>
          </section>
        )}
      </section>
    </div>
  );
}

