import { useEffect, useState } from "react";
import { FiCheck, FiX } from "react-icons/fi";
import { getEnhancedTemplateServiceId, isEnhancedWidgetTemplate } from "../../enhancedWidgetContract.js";

function handleTemplateKeyDown(event, templates, selectedTemplateId, onSelect) {
  const currentIndex = Math.max(
    0,
    templates.findIndex((template) => template.id === selectedTemplateId),
  );
  let nextIndex = currentIndex;

  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextIndex = (currentIndex + 1) % templates.length;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex = (currentIndex - 1 + templates.length) % templates.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = templates.length - 1;
  } else {
    return;
  }

  event.preventDefault();
  const nextTemplate = templates[nextIndex];
  onSelect(nextTemplate);
  requestAnimationFrame(() => {
    document.getElementById(`inspector-template-${nextTemplate.id}`)?.focus();
  });
}

export function WidgetInspector({ onChange, onClose, onDelete, selectedWidget, templates }) {
  const [draft, setDraft] = useState(selectedWidget);

  useEffect(() => {
    setDraft((currentDraft) => {
      if (!currentDraft || !selectedWidget || currentDraft.id !== selectedWidget.id) {
        return selectedWidget;
      }

      return {
        ...selectedWidget,
        scopedCss: currentDraft.scopedCss ?? selectedWidget.scopedCss,
      };
    });
  }, [selectedWidget]);

  if (!draft) {
    return null;
  }

  function publishDraft(nextDraft, patch) {
    setDraft(nextDraft);
    onChange(nextDraft.id, patch);
  }

  function updateTitle(value) {
    publishDraft(
      {
        ...draft,
        title: value,
      },
      { title: value },
    );
  }

  function updateRefreshIntervalSeconds(value) {
    const refreshIntervalSeconds = value === "" ? null : Math.max(Number(value) || 0, 0);

    publishDraft(
      {
        ...draft,
        refreshIntervalSeconds,
      },
      { refreshIntervalSeconds },
    );
  }

  function applyTemplate(template) {
    const patch = templatePatch(template);

    publishDraft(
      {
        ...draft,
        ...patch,
      },
      patch,
    );
  }

  function templatePatch(template) {
    if (!isEnhancedWidgetTemplate(template)) {
      return {
        enhancedRenderer: null,
        enhancedWidgetId: null,
        enhancementId: null,
        templateId: template.id,
      };
    }

    return {
      enhancedRenderer: {
        dataPath: template.enhanced.dataPath,
        fields: template.enhanced.fields,
        renderer: template.enhanced.renderer,
      },
      enhancedWidgetId: template.enhanced.widgetId,
      enhancementId: template.enhanced.enhancementId,
      serviceId: template.enhanced.serviceId,
      templateId: template.id,
      refreshIntervalSeconds: template.refreshIntervalSeconds ?? draft.refreshIntervalSeconds ?? null,
    };
  }

  const visibleTemplates = templates.filter((template) => {
    if (template.systemOnly && template.id !== draft.templateId) {
      return false;
    }

    if (isEnhancedWidgetTemplate(template)) {
      return Boolean(draft.enhancedWidgetId) && getEnhancedTemplateServiceId(template) === draft.serviceId;
    }

    return !draft.enhancedWidgetId;
  });
  const currentTemplate = templates.find((template) => template.id === draft.templateId);
  const isEnhancedDraft = Boolean(draft.enhancedWidgetId || currentTemplate?.enhanced);

  return (
    <aside aria-label="Widget Inspector" className="widget-inspector">
      <header className="inspector-header">
        <strong>Widget Inspector</strong>
        <span>
          {draft.w} x {draft.h}
        </span>
        <button aria-label="Close Widget Inspector" className="inspector-close" type="button" onClick={onClose}>
          <FiX aria-hidden="true" />
        </button>
      </header>

      <section className="inspector-section">
        <span className="inspector-section-title">Template</span>
        <div aria-label="Widget template" className="inspector-template-grid" role="radiogroup">
          {visibleTemplates.map((template) => (
            <button
              aria-checked={template.id === draft.templateId ? "true" : "false"}
              className={template.id === draft.templateId ? "is-selected" : ""}
              id={`inspector-template-${template.id}`}
              key={template.id}
              role="radio"
              tabIndex={template.id === draft.templateId ? 0 : -1}
              type="button"
              onClick={() => applyTemplate(template)}
              onKeyDown={(event) => handleTemplateKeyDown(event, visibleTemplates, draft.templateId, applyTemplate)}
            >
              <span>
                <strong>{template.name}</strong>
                <small>{template.description}</small>
              </span>
              {template.id === draft.templateId ? <FiCheck aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="inspector-section">
        <span className="inspector-section-title">Content</span>
        <label className="field">
          <span>Widget Title</span>
          <input
            aria-label="Widget title"
            value={draft.title}
            onChange={(event) => updateTitle(event.target.value)}
          />
        </label>
      </section>

      {isEnhancedDraft ? (
        <section className="inspector-section">
          <span className="inspector-section-title">Data Refresh</span>
          <label className="field">
            <span>Refresh interval</span>
            <input
              aria-label="Widget refresh interval"
              min="0"
              step="1"
              type="number"
              value={draft.refreshIntervalSeconds ?? currentTemplate?.refreshIntervalSeconds ?? ""}
              onChange={(event) => updateRefreshIntervalSeconds(event.target.value)}
            />
          </label>
          <p className="inspector-help-text">Seconds. Use 0 to disable automatic refresh for this widget.</p>
        </section>
      ) : null}

      <footer className="inspector-actions">
        <button className="secondary-button danger-button" type="button" onClick={() => onDelete(draft.id)}>
          Delete
        </button>
      </footer>
    </aside>
  );
}
