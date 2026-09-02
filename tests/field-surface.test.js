import test from "node:test";
import assert from "node:assert/strict";

import {
  createCanonicalFieldModel,
  formatFieldDisplayValue,
  replaceEditableFieldControl,
} from "../src/field-surface.js";

test("launch dates keep canonical storage while using a friendly display form", () => {
  assert.equal(
    formatFieldDisplayValue("launch_date", "2026-09-18"),
    "2026/09/18",
  );
  assert.equal(
    formatFieldDisplayValue("headline", "A better bag for every day"),
    "A better bag for every day",
  );
});

test("the field presentation model is explicitly non-editable", () => {
  const model = createCanonicalFieldModel(
    "description",
    "A canonical description.",
    "field-description-count",
  );

  assert.equal(model.tagName, "output");
  assert.equal(model.className, "field-value field-value-multiline");
  assert.equal(model.text, "A canonical description.");
  assert.equal(model.ariaLabel, "Description, display only");
  assert.equal(model.ariaDescribedBy, "field-description-count");
});

test("a DOM-only value cannot replace the stored canonical value", () => {
  const attributes = new Map();
  const output = {
    dataset: {},
    className: "",
    textContent: "",
    title: "",
    contentEditable: "inherit",
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
  };
  const documentRef = {
    createElement(tagName) {
      assert.equal(tagName, "output");
      return output;
    },
  };
  const card = { dataset: { fieldId: "headline" } };
  let replacement = null;
  const control = {
    id: "field-headline",
    value: "DOM-only ghost copy",
    closest(selector) {
      return selector === ".field-card" ? card : null;
    },
    getAttribute(name) {
      return name === "aria-describedby" ? "field-headline-count" : null;
    },
    replaceWith(node) {
      replacement = node;
    },
  };

  const previousScopebox = globalThis.scopebox;
  globalThis.scopebox = {
    getState: () => ({
      fields: { headline: "Stored canonical headline" },
    }),
  };

  try {
    const result = replaceEditableFieldControl(control, documentRef);

    assert.equal(result, output);
    assert.equal(replacement, output);
    assert.equal(output.textContent, "Stored canonical headline");
    assert.equal(output.dataset.contentSurface, "canonical");
    assert.equal(output.contentEditable, "false");
    assert.equal(attributes.get("aria-readonly"), "true");
    assert.equal(attributes.get("aria-describedby"), "field-headline-count");
    assert.equal("value" in output, false);
  } finally {
    if (previousScopebox === undefined) {
      delete globalThis.scopebox;
    } else {
      globalThis.scopebox = previousScopebox;
    }
  }
});
