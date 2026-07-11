import { useEffect, useMemo, useRef, useState } from "react";
import { FiCheckCircle, FiExternalLink, FiMoreHorizontal, FiPlus, FiSearch, FiX, FiZap } from "react-icons/fi";
import { useDialogFocus } from "../useDialogFocus.js";
import { ServiceIcon } from "../../iconRegistry.jsx";
import { SERVICE_TYPES } from "../../serviceCatalog.js";

function isFullHttpUrl(value) {
  try {
    const parsed = new URL(value);

    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function handleRadioOptionKeyDown(event, options, selectedId, onSelect) {
  const currentIndex = Math.max(
    0,
    options.findIndex((option) => option.id === selectedId),
  );
  let nextIndex = currentIndex;

  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextIndex = (currentIndex + 1) % options.length;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex = (currentIndex - 1 + options.length) % options.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = options.length - 1;
  } else {
    return;
  }

  event.preventDefault();
  const nextOption = options[nextIndex];
  onSelect(nextOption.id);
  requestAnimationFrame(() => {
    document.getElementById(nextOption.elementId)?.focus();
  });
}

function getInitialAddServiceType(serviceTypes) {
  return serviceTypes.find((type) => type.id === "custom") || serviceTypes[0] || null;
}

function ServiceTile({ isActionsOpen, onEdit, onToggleActions, service }) {
  return (
    <article className="service-tile service-tile-with-actions">
      <a
        aria-label={`Open ${service.name}`}
        className="service-open-button"
        href={service.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <ServiceIcon service={service} />
        <span className="service-copy">
          <strong>{service.name}</strong>
          <span className="service-description">{service.description}</span>
        </span>
      </a>
      <button
        aria-expanded={isActionsOpen ? "true" : "false"}
        aria-haspopup="true"
        aria-label={`Open ${service.name} actions`}
        className="service-actions-button"
        type="button"
        onClick={onToggleActions}
      >
        <FiMoreHorizontal aria-hidden="true" />
      </button>
      {isActionsOpen ? (
        <div className="service-actions-menu">
          <button type="button" onClick={() => onEdit(service)}>
            Edit {service.name}
          </button>
        </div>
      ) : null}
    </article>
  );
}

function AddServiceDialog({ onClose, onCreate, serviceTypes }) {
  const initialServiceType = getInitialAddServiceType(serviceTypes);
  const [typeQuery, setTypeQuery] = useState("");
  const [selectedTypeId, setSelectedTypeId] = useState(() => initialServiceType?.id || "");
  const [name, setName] = useState(() => (initialServiceType?.id === "custom" ? "" : initialServiceType?.name || ""));
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [urlError, setUrlError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const dialogRef = useRef(null);
  const searchInputRef = useRef(null);
  const urlInputRef = useRef(null);
  const selectedType = serviceTypes.find((type) => type.id === selectedTypeId) || initialServiceType || SERVICE_TYPES[0];

  useEffect(() => {
    if (selectedType?.id !== "custom") {
      setName(selectedType?.name || "");
    }
  }, [selectedType]);

  useEffect(() => {
    if (serviceTypes.some((type) => type.id === selectedTypeId)) {
      return;
    }

    const nextInitialType = getInitialAddServiceType(serviceTypes);
    if (nextInitialType) {
      setSelectedTypeId(nextInitialType.id);
      setName(nextInitialType.id === "custom" ? "" : nextInitialType.name || "");
    }
  }, [selectedTypeId, serviceTypes]);

  useDialogFocus(dialogRef, { initialFocusRef: searchInputRef, onClose });

  const filteredTypes = useMemo(() => {
    const normalizedQuery = typeQuery.trim().toLowerCase();
    const customType = serviceTypes.find((type) => type.id === "custom");
    const matched = serviceTypes.filter((type) => {
      if (type.id === "custom") {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return `${type.name} ${type.description} ${type.category} ${type.aliases?.join(" ") || ""}`
        .toLowerCase()
        .includes(normalizedQuery);
    });

    return customType ? [customType, ...matched] : matched;
  }, [serviceTypes, typeQuery]);
  const visibleSelectedTypeId = filteredTypes.some((type) => type.id === selectedType.id)
    ? selectedType.id
    : filteredTypes[0]?.id;

  function selectType(typeId) {
    const nextType = serviceTypes.find((type) => type.id === typeId);
    setSelectedTypeId(typeId);
    setName(nextType?.id === "custom" ? "" : nextType?.name || "");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!isFullHttpUrl(url.trim())) {
      setUrlError("Enter a full URL including http:// or https://.");
      urlInputRef.current?.focus();
      requestAnimationFrame(() => {
        urlInputRef.current?.scrollIntoView({ block: "center", inline: "nearest" });
      });
      return;
    }

    setUrlError("");
    setIsSaving(true);

    try {
      await onCreate({
        name,
        typeId: selectedType.id,
        url,
      });
      onClose();
    } catch (creationError) {
      setError(creationError.message || "Unable to add service");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="add-service-layer">
      <section
        aria-labelledby="add-service-title"
        aria-modal="true"
        className="add-service-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="add-service-header">
          <h2 id="add-service-title">
            <FiPlus aria-hidden="true" />
            Add Service
          </h2>
          <button className="icon-button close-button" type="button" aria-label="Close Add Service" onClick={onClose}>
            <FiX aria-hidden="true" />
          </button>
        </header>

        <form className="add-service-body" noValidate onSubmit={handleSubmit}>
          <section className="service-type-column" aria-label="Service type">
            <label className="launchpad-search add-service-search">
              <FiSearch aria-hidden="true" />
              <input
                aria-label="Search service type"
                ref={searchInputRef}
                type="search"
                value={typeQuery}
                placeholder="Search service type..."
                onChange={(event) => setTypeQuery(event.target.value)}
              />
            </label>

            <div aria-label="Service type" className="service-type-list" role="radiogroup">
              {filteredTypes.map((type) => {
                const isSelected = type.id === selectedType.id;
                const isTabStop = type.id === visibleSelectedTypeId;
                const optionId = `add-service-type-${type.id}`;
                const optionItems = filteredTypes.map((candidate) => ({
                  elementId: `add-service-type-${candidate.id}`,
                  id: candidate.id,
                }));

                return (
                  <button
                    aria-checked={isSelected ? "true" : "false"}
                    aria-label={`${type.name} ${type.description}`}
                    className={isSelected ? "is-selected" : ""}
                    id={optionId}
                    key={type.id}
                    role="radio"
                    tabIndex={isTabStop ? 0 : -1}
                    type="button"
                    onClick={() => selectType(type.id)}
                    onKeyDown={(event) => handleRadioOptionKeyDown(event, optionItems, selectedType.id, selectType)}
                  >
                    <ServiceIcon service={type} compact />
                    <span>
                      <strong>{type.name}</strong>
                      <small>{type.description}</small>
                    </span>
                    {isSelected ? <FiCheckCircle aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="service-detail-column" aria-label="Service details">
            <div className="service-preview">
              <ServiceIcon service={selectedType} />
              <span>
                <strong>{name || selectedType.name}</strong>
                <small>{selectedType.description}</small>
              </span>
              <FiExternalLink aria-hidden="true" />
            </div>

            <label className="field">
              <span>Name</span>
              <input
                aria-label="Service name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label className="field">
              <span>URL</span>
              <input
                aria-describedby={urlError ? "add-service-url-error" : undefined}
                aria-invalid={urlError ? "true" : undefined}
                aria-label="Service URL"
                placeholder="http://192.0.2.20:8080"
                ref={urlInputRef}
                required
                type="url"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setUrlError("");
                }}
              />
            </label>

            {urlError ? (
              <p className="form-error" id="add-service-url-error" role="alert">
                {urlError}
              </p>
            ) : null}

            {error ? <p className="form-error" role="alert">{error}</p> : null}

            <footer className="add-service-actions">
              <button className="secondary-button" type="button" onClick={onClose}>
                Cancel
              </button>
              <button className="primary-button" type="submit" disabled={isSaving}>
                {isSaving ? "Adding..." : "Add Service"}
              </button>
            </footer>
          </section>
        </form>
      </section>
    </div>
  );
}

export function Launchpad({
  filteredServices,
  isAddServiceOpen,
  isLoading,
  onAddService,
  onCloseAddService,
  onClose,
  onCreateService,
  onEditService,
  query,
  serviceTypes,
  setQuery,
}) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const [openActionsServiceId, setOpenActionsServiceId] = useState("");
  const pageCount = Math.max(1, Math.ceil(filteredServices.length / 8));
  const hasQuery = query.trim().length > 0;
  const resultStatus = filteredServices.length === 0
    ? "No services found"
    : `${filteredServices.length} service${filteredServices.length === 1 ? "" : "s"} found`;

  useDialogFocus(dialogRef, { initialFocusRef: closeButtonRef, onClose });

  const editService = (service) => {
    onEditService(service);
  };

  return (
    <div
      className="overlay-scrim"
      data-testid="launchpad-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="launchpad-title"
        aria-modal={isAddServiceOpen ? undefined : "true"}
        aria-hidden={isAddServiceOpen ? "true" : undefined}
        className="launchpad"
        inert={isAddServiceOpen ? true : undefined}
        ref={dialogRef}
        role={isAddServiceOpen ? undefined : "dialog"}
        tabIndex={-1}
      >
        <header className="launchpad-header">
          <h2 id="launchpad-title">
            <FiZap aria-hidden="true" />
            Launchpad
          </h2>
          <div className="launchpad-header-actions">
            <button className="header-add-service-button" type="button" onClick={onAddService}>
              <FiPlus aria-hidden="true" />
              Add Service
            </button>
            <button
              aria-label="Close Launchpad"
              className="icon-button close-button"
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
            >
              <FiX aria-hidden="true" />
            </button>
          </div>
        </header>

        <label className="launchpad-search">
          <FiSearch aria-hidden="true" />
          <input
            aria-label="Search services"
            type="search"
            value={query}
            placeholder="Search services..."
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          {resultStatus}
        </p>

        <div className="service-grid">
          {isLoading ? <p className="service-grid-note">Loading services...</p> : null}
          {!isLoading && filteredServices.length === 0 ? (
            <div className="service-grid-note empty-state">
              <strong>No services match "{query}".</strong>
              {hasQuery ? (
                <button className="secondary-button" type="button" onClick={() => setQuery("")}>
                  Clear service search
                </button>
              ) : null}
            </div>
          ) : null}
          {filteredServices.map((service) => (
            <ServiceTile
              key={service.id || service.name}
              service={service}
              isActionsOpen={openActionsServiceId === service.id}
              onEdit={editService}
              onToggleActions={() => {
                setOpenActionsServiceId((currentServiceId) => (
                  currentServiceId === service.id ? "" : service.id
                ));
              }}
            />
          ))}
        </div>

        <div aria-hidden="true" className="launchpad-pages" data-testid="launchpad-pages">
          {Array.from({ length: pageCount }, (_, index) => (
            <span className={index === 0 ? "is-active" : ""} key={index} />
          ))}
        </div>
      </section>

      {isAddServiceOpen ? (
        <AddServiceDialog onClose={onCloseAddService} onCreate={onCreateService} serviceTypes={serviceTypes} />
      ) : null}
    </div>
  );
}

