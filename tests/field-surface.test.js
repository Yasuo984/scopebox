import test from "node:test";
import assert from "node:assert/strict";

import {
  createCanonicalFieldModel,
  formatFieldDisplayValue,
  replaceEditableFieldControl,
  synchronizeCanonicalFieldSurface,
} from "../src/field-surface.js";

function createFakeOutput() {
  const attributes = new Map();
  return {
    attributes,
    dataset: {},
    id: "",
    className: "",
    textContent: "",
    title: "",
    contentEditable: "inherit",
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    hasAttribute(name) {
      return attributes.has(name);
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
  };
}

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
  assert.equal(model.id, "field-description");
  assert.equal(model.className, "field-value field-value-multiline");
  assert.equal(model.text, "A canonical description.");
  assert.equal(model.ariaLabel, "Description, display only");
  assert.equal(model.ariaDescribedBy, "field-description-count");
});

test("a DOM-only control value cannot replace the stored canonical value", () => {
  const output = createFakeOutput();
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
    assert.equal(output.id, "field-headline");
    assert.equal(output.textContent, "Stored canonical headline");
    assert.equal(output.dataset.contentSurface, "canonical");
    assert.equal(output.contentEditable, "false");
    assert.equal(output.attributes.get("aria-readonly"), "true");
    assert.equal(
      output.attributes.get("aria-describedby"),
      "field-headline-count",
    );
  } finally {
    if (previousScopebox === undefined) {
      delete globalThis.scopebox;
    } else {
      globalThis.scopebox = previousScopebox;
    }
  }
});

test("a mutated display value is restored from canonical state", () => {
  const output = createFakeOutput();
  output.id = "field-headline";
  output.className = "field-value";
  output.textContent = "DOM-only ghost copy";
  output.dataset.contentSurface = "canonical";

  const card = {
    dataset: { fieldId: "headline" },
    querySelector(selector) {
      if (selector === ".field-input, .field-textarea") return null;
      if (
        selector ===
        "output.field-value[data-content-surface='canonical']"
      ) {
        return output;
      }
      return null;
    },
  };
  const root = {
    querySelectorAll(selector) {
      return selector === ".field-card" ? [card] : [];
    },
  };
  const documentRef = {
    createElement() {
      throw new Error("Existing canonical output should be reused");
    },
  };

  const previousScopebox = globalThis.scopebox;
  globalThis.scopebox = {
    getState: () => ({
      fields: { headline: "Stored canonical headline" },
    }),
  };

  try {
    const count = synchronizeCanonicalFieldSurface(root, documentRef);
    assert.equal(count, 1);
    assert.equal(output.textContent, "Stored canonical headline");
    assert.equal(output.contentEditable, "false");
    assert.equal(output.attributes.get("aria-readonly"), "true");
  } finally {
    if (previousScopebox === undefined) {
      delete globalThis.scopebox;
    } else {
      globalThis.scopebox = previousScopebox;
    }
  }
});
