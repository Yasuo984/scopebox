import { getFieldDefinition } from "./domain.js";

const CONTROL_SELECTOR = ".field-input, .field-textarea";
const OUTPUT_SELECTOR = "output.field-value[data-content-surface='canonical']";
const DISPLAY_NOTE =
  "Display only. Agent changes must use the currently available Site tool capability.";

function getCanonicalValue(fieldId, fallback = "") {
  const state = globalThis.scopebox?.getState?.();
  const value = state?.fields?.[fieldId];
  return typeof value === "string" ? value : fallback;
}

function setPropertyIfChanged(target, property, value) {
  if (target[property] !== value) target[property] = value;
}

function setAttributeIfChanged(target, name, value) {
  if (target.getAttribute?.(name) !== value) {
    target.setAttribute(name, value);
  }
}

function removeAttributeIfPresent(target, name) {
  if (target.hasAttribute?.(name) || target.getAttribute?.(name) != null) {
    target.removeAttribute(name);
  }
}

export function formatFieldDisplayValue(fieldId, value) {
  const text = typeof value === "string" ? value : "";
  return fieldId === "launch_date" && /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? text.replaceAll("-", "/")
    : text;
}

export function createCanonicalFieldModel(fieldId, value, describedBy = "") {
  const definition = getFieldDefinition(fieldId);
  const label = definition?.label ?? fieldId;
  const multiline = definition?.kind === "textarea";
  const text = formatFieldDisplayValue(fieldId, value);

  return {
    tagName: "output",
    id: `field-${fieldId}`,
    className: `field-value${multiline ? " field-value-multiline" : ""}`,
    text,
    title: DISPLAY_NOTE,
    ariaLabel: `${label}, display only`,
    ariaDescribedBy: describedBy || `field-${fieldId}-count`,
  };
}

function applyCanonicalModel(output, fieldId, describedBy = "") {
  const value = getCanonicalValue(fieldId, output.textContent ?? "");
  const model = createCanonicalFieldModel(fieldId, value, describedBy);

  setPropertyIfChanged(output, "id", model.id);
  setPropertyIfChanged(output, "className", model.className);
  setPropertyIfChanged(output, "textContent", model.text);
  setPropertyIfChanged(output, "title", model.title);
  if (output.dataset.fieldId !== fieldId) output.dataset.fieldId = fieldId;
  if (output.dataset.contentSurface !== "canonical") {
    output.dataset.contentSurface = "canonical";
  }
  setPropertyIfChanged(output, "contentEditable", "false");
  setAttributeIfChanged(output, "aria-readonly", "true");
  setAttributeIfChanged(output, "aria-label", model.ariaLabel);

  if (model.ariaDescribedBy) {
    setAttributeIfChanged(output, "aria-describedby", model.ariaDescribedBy);
  } else {
    removeAttributeIfPresent(output, "aria-describedby");
  }

  return output;
}

export function replaceEditableFieldControl(
  control,
  documentRef = globalThis.document,
) {
  if (!control || !documentRef?.createElement) return null;

  const card = control.closest?.(".field-card");
  const fieldId = card?.dataset?.fieldId;
  if (!fieldId) return null;

  const describedBy = control.getAttribute?.("aria-describedby") ?? "";
  const fallback = typeof control.value === "string" ? control.value : "";
  const output = documentRef.createElement("output");
  output.textContent = getCanonicalValue(fieldId, fallback);
  applyCanonicalModel(output, fieldId, describedBy);
  control.replaceWith(output);
  return output;
}

function ensureCardOutput(card, documentRef) {
  const fieldId = card?.dataset?.fieldId;
  if (!fieldId) return null;

  const control = card.querySelector?.(CONTROL_SELECTOR);
  if (control) {
    return replaceEditableFieldControl(control, documentRef);
  }

  let output = card.querySelector?.(OUTPUT_SELECTOR);
  if (!output) {
    output = documentRef.createElement("output");
    const footer = card.querySelector?.(".field-footer");
    if (footer) {
      card.insertBefore(output, footer);
    } else {
      card.append(output);
    }
  }

  return applyCanonicalModel(output, fieldId);
}

export function synchronizeCanonicalFieldSurface(
  root,
  documentRef = globalThis.document,
) {
  if (!root?.querySelectorAll || !documentRef?.createElement) return 0;

  let synchronized = 0;
  for (const card of root.querySelectorAll(".field-card")) {
    if (ensureCardOutput(card, documentRef)) synchronized += 1;
  }
  return synchronized;
}

function startCanonicalFieldSurface() {
  const grid = document.querySelector("#field-grid");
  if (!grid) return;

  let synchronizing = false;
  const synchronize = () => {
    if (synchronizing) return;
    synchronizing = true;
    try {
      synchronizeCanonicalFieldSurface(grid, document);
    } finally {
      synchronizing = false;
    }
  };

  const observer = new MutationObserver(synchronize);
  observer.observe(grid, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      "aria-describedby",
      "aria-label",
      "aria-readonly",
      "class",
      "contenteditable",
      "data-content-surface",
      "data-field-id",
      "id",
      "title",
    ],
  });

  synchronize();
  globalThis.addEventListener(
    "beforeunload",
    () => observer.disconnect(),
    { once: true },
  );
}

if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
  startCanonicalFieldSurface();
}
