import { useEffect, useLayoutEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableElements(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => {
    const ariaHidden = element.getAttribute("aria-hidden") === "true";
    const disabled = element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";

    return !ariaHidden && !disabled;
  });
}

export function useDialogFocus(dialogRef, { fallbackFocusRef, initialFocusRef, onClose }) {
  const initialFocusRefRef = useRef(initialFocusRef);
  const fallbackFocusRefRef = useRef(fallbackFocusRef);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    initialFocusRefRef.current = initialFocusRef;
    fallbackFocusRefRef.current = fallbackFocusRef;
    onCloseRef.current = onClose;
  }, [fallbackFocusRef, initialFocusRef, onClose]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return undefined;
    }

    const previousActiveElement = document.activeElement;
    const focusTarget = initialFocusRefRef.current?.current || focusableElements(dialog)[0] || dialog;

    if (document.contains(focusTarget)) {
      focusTarget.focus();
    }

    function handleKeyDown(event) {
      if (event.defaultPrevented) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = focusableElements(dialog);

      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1);

      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    dialog.addEventListener("keydown", handleKeyDown);

    return () => {
      dialog.removeEventListener("keydown", handleKeyDown);

      if (previousActiveElement && previousActiveElement !== document.body && document.contains(previousActiveElement)) {
        previousActiveElement.focus();
      } else if (fallbackFocusRefRef.current?.current && document.contains(fallbackFocusRefRef.current.current)) {
        fallbackFocusRefRef.current.current.focus();
      }
    };
  }, [dialogRef]);
}
