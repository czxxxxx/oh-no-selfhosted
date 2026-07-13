import { useEffect, useRef, useState } from "react";
import { FiTrash2, FiUploadCloud, FiX } from "react-icons/fi";
import { deleteServiceRequest, updateServiceRequest, uploadIconRequest } from "../../apiClient.js";
import { ServiceIcon } from "../../iconRegistry.jsx";
import { SERVICE_TYPES } from "../../serviceCatalog.js";
import { useDialogFocus } from "../useDialogFocus.js";
import { EnhancedTab } from "./EnhancedTab.jsx";

const TABS = ["Overview", "Enhanced", "Danger Zone"];

function tabPanelId(tab) {
  return `service-settings-panel-${tab.toLowerCase().replaceAll(" ", "-")}`;
}

function tabButtonId(tab) {
  return `service-settings-tab-${tab.toLowerCase().replaceAll(" ", "-")}`;
}

function OverviewTab({ onServiceSaved, service, serviceTypes }) {
  const [draft, setDraft] = useState({
    description: service.description || "",
    iconKey: service.iconKey || "custom",
    iconKind: service.iconKind || "preset",
    iconUrl: service.iconUrl || null,
    name: service.name || "",
    pinnedToDock: Boolean(service.pinnedToDock),
    typeId: service.typeId || "custom",
    url: service.url || "",
  });
  const [error, setError] = useState("");
  const [iconError, setIconError] = useState("");
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const selectedType = serviceTypes.find((type) => type.id === draft.typeId) || serviceTypes[0];
  const previewService = {
    ...service,
    ...draft,
    color: selectedType?.color || service.color,
  };
  const hasCustomIcon = draft.iconKind === "url" && Boolean(draft.iconUrl);

  useEffect(() => {
    setDraft({
      description: service.description || "",
      iconKey: service.iconKey || "custom",
      iconKind: service.iconKind || "preset",
      iconUrl: service.iconUrl || null,
      name: service.name || "",
      pinnedToDock: Boolean(service.pinnedToDock),
      typeId: service.typeId || "custom",
      url: service.url || "",
    });
    setError("");
    setIconError("");
    setStatus("");
  }, [service.id]);

  function updateDraft(patch) {
    setDraft((currentDraft) => ({ ...currentDraft, ...patch }));
    setError("");
    setStatus("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setStatus("");
    setIsSaving(true);

    try {
      const saved = await updateServiceRequest(service.id, draft);
      onServiceSaved(saved);
      setStatus("Saved changes.");
    } catch (saveError) {
      setError(saveError.message || "Unable to save service");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleIconUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setIconError("");
    setStatus("");
    setIsUploadingIcon(true);

    try {
      const icon = await uploadIconRequest(file);
      setDraft((currentDraft) => ({
        ...currentDraft,
        iconKey: icon.iconKey,
        iconKind: icon.iconKind,
        iconUrl: icon.iconUrl,
      }));
      setStatus("Icon uploaded. Save Basic Info to keep it.");
    } catch (uploadError) {
      setIconError(uploadError.message || "Unable to upload icon");
    } finally {
      setIsUploadingIcon(false);
    }
  }

  function resetIconToType() {
    setDraft({
      ...draft,
      iconKey: selectedType?.iconKey || "custom",
      iconKind: selectedType?.iconKind || "preset",
      iconUrl: selectedType?.iconUrl || null,
    });
    setIconError("");
    setStatus("Service type icon selected. Save Basic Info to keep it.");
  }

  return (
    <form className="settings-overview-panel" onSubmit={handleSubmit}>
      <header>
        <strong>Basic Info</strong>
        <small>Type controls icon/category. Name is per-service, so duplicates are supported.</small>
      </header>

      <label className="field">
        <span>Service Name</span>
        <input
          aria-label="Service name"
          required
            value={draft.name}
            onChange={(event) => updateDraft({ name: event.target.value })}
          />
        </label>

      <label className="field">
        <span>Service Type</span>
        <select
          aria-label="Service type"
          value={draft.typeId}
          onChange={(event) => {
            const selectedType = serviceTypes.find((type) => type.id === event.target.value);
            updateDraft({
              description: selectedType?.description || draft.description,
              ...(hasCustomIcon
                ? {}
                : {
                    iconKey: selectedType?.iconKey || "custom",
                    iconKind: selectedType?.iconKind || "preset",
                    iconUrl: selectedType?.iconUrl || null,
                  }),
              typeId: event.target.value,
            });
          }}
        >
          {serviceTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Service URL</span>
        <input
          aria-label="Service URL"
            required
            type="url"
            value={draft.url}
            onChange={(event) => updateDraft({ url: event.target.value })}
          />
        </label>

      <label className="field">
        <span>Service Description</span>
        <input
            aria-label="Service description"
            value={draft.description}
            onChange={(event) => updateDraft({ description: event.target.value })}
          />
        </label>

      <section className="icon-upload-card" aria-labelledby="service-icon-upload-title">
        <ServiceIcon service={previewService} />
        <span>
          <strong id="service-icon-upload-title">Service Icon</strong>
          <small>{hasCustomIcon ? "Using uploaded icon" : "Using service type icon"}</small>
        </span>
        <label className="secondary-button icon-upload-button">
          <FiUploadCloud aria-hidden="true" />
          {isUploadingIcon ? "Uploading..." : "Upload Icon"}
          <input
            accept="image/png,image/jpeg,image/webp,image/x-icon,image/svg+xml"
            aria-label="Upload service icon"
            disabled={isUploadingIcon}
            type="file"
            onChange={handleIconUpload}
          />
        </label>
        {hasCustomIcon ? (
          <button className="secondary-button icon-reset-button" type="button" onClick={resetIconToType}>
            <FiTrash2 aria-hidden="true" />
            Use Type Icon
          </button>
        ) : null}
        {iconError ? <p className="form-error" role="alert">{iconError}</p> : null}
      </section>

      <label className="toggle-row">
        <span>
          <strong>Pin to Dock</strong>
          <small>Show this service in the bottom launcher</small>
        </span>
        <input
          aria-label="Pin to Dock"
          checked={draft.pinnedToDock}
          type="checkbox"
          onChange={(event) => updateDraft({ pinnedToDock: event.target.checked })}
        />
      </label>

      {status ? (
        <p className="form-success" role="status" aria-live="polite" aria-atomic="true">
          {status}
        </p>
      ) : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <footer className="settings-overview-actions">
        <button className="primary-button" type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Basic Info"}
        </button>
      </footer>
    </form>
  );
}

function DangerZoneTab({ onServiceDeleted, service }) {
  const cancelButtonRef = useRef(null);
  const [error, setError] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isConfirming) {
      cancelButtonRef.current?.focus();
    }
  }, [isConfirming]);

  async function handleDelete() {
    setError("");
    setIsDeleting(true);

    try {
      await deleteServiceRequest(service.id);
      onServiceDeleted?.(service.id);
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete service");
      setIsConfirming(false);
      setIsDeleting(false);
    }
  }

  return (
    <section className="settings-danger-panel">
      <header>
        <strong>Delete Service</strong>
        <small>Remove this service, its widgets, enhanced config, and Dock pin.</small>
      </header>
      <div className="danger-zone-card">
        <span>
          <strong>{service.name}</strong>
          <small>{service.url}</small>
        </span>
        {isConfirming ? (
          <div className="delete-confirmation" role="group" aria-label={`Confirm deleting ${service.name}`}>
            <p>This removes {service.name}, its widgets, enhanced config, and Dock pin.</p>
            <div className="delete-confirmation-actions">
              <button
                className="secondary-button"
                ref={cancelButtonRef}
                type="button"
                disabled={isDeleting}
                onClick={() => setIsConfirming(false)}
              >
                Cancel Delete
              </button>
              <button className="danger-action-button" type="button" disabled={isDeleting} onClick={handleDelete}>
                {isDeleting ? "Deleting..." : "Confirm Delete Service"}
              </button>
            </div>
          </div>
        ) : (
          <button className="danger-action-button" type="button" disabled={isDeleting} onClick={() => setIsConfirming(true)}>
            Delete Service
          </button>
        )}
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  );
}

export function ServiceSettingsDialog({
  fallbackFocusRef,
  onClose,
  onEnhancementSaved,
  onServiceDeleted,
  onServiceSaved,
  service,
  serviceTypes = SERVICE_TYPES,
}) {
  const [activeTab, setActiveTab] = useState("Overview");
  const [currentService, setCurrentService] = useState(service);
  const closeButtonRef = useRef(null);
  const dialogRef = useRef(null);
  const titleRef = useRef(null);

  useEffect(() => {
    setCurrentService(service);
  }, [service]);

  useDialogFocus(dialogRef, { fallbackFocusRef, initialFocusRef: titleRef, onClose });

  function handleServiceSaved(savedService) {
    setCurrentService(savedService);
    onServiceSaved(savedService);
  }

  function focusTab(tab) {
    setActiveTab(tab);
    document.getElementById(tabButtonId(tab))?.focus();
  }

  function handleTabKeyDown(event, tab) {
    const currentIndex = TABS.indexOf(tab);
    let nextIndex = currentIndex;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % TABS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = TABS.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    focusTab(TABS[nextIndex]);
  }

  function renderActivePanel() {
    if (activeTab === "Overview") {
      return (
        <OverviewTab
          service={currentService}
          serviceTypes={serviceTypes}
          onServiceSaved={handleServiceSaved}
        />
      );
    }

    if (activeTab === "Enhanced") {
      return <EnhancedTab service={currentService} onEnhancementSaved={onEnhancementSaved} />;
    }

    if (activeTab === "Danger Zone") {
      return <DangerZoneTab service={currentService} onServiceDeleted={onServiceDeleted} />;
    }

    return (
      <div className="settings-panel-empty">
        <strong>{activeTab}</strong>
        <span>{currentService.name}</span>
      </div>
    );
  }

  return (
    <div className="service-settings-layer">
      <section
        aria-labelledby="service-settings-title"
        aria-modal="true"
        className="service-settings-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="service-settings-header">
          <ServiceIcon service={currentService} />
          <span>
            <h2 id="service-settings-title" ref={titleRef} tabIndex={-1}>
              Service Settings: {currentService.name}
            </h2>
            <small>{currentService.url}</small>
          </span>
          <button
            aria-label="Close Service Settings"
            className="icon-button close-button"
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
          >
            <FiX aria-hidden="true" />
          </button>
        </header>

        <div aria-label="Service settings tabs" className="settings-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              aria-controls={tabPanelId(tab)}
              aria-selected={activeTab === tab}
              className={activeTab === tab ? "is-selected" : ""}
              id={tabButtonId(tab)}
              key={tab}
              role="tab"
              tabIndex={activeTab === tab ? 0 : -1}
              type="button"
              onClick={() => focusTab(tab)}
              onKeyDown={(event) => handleTabKeyDown(event, tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div
          aria-labelledby={tabButtonId(activeTab)}
          className="settings-panel"
          id={tabPanelId(activeTab)}
          role="tabpanel"
          tabIndex={0}
        >
          {renderActivePanel()}
        </div>
      </section>
    </div>
  );
}
