import {
  deriveState,
  FIELD_DEFINITIONS,
  getFieldLabel,
} from "./domain.js";
import { ScopeboxStore } from "./store.js";
import {
  expectedToolSurface,
  summarizeScopeForUi,
  WebMCPManager,
} from "./webmcp.js";

const store = new ScopeboxStore();
const webmcp = new WebMCPManager(store);

const refs = {
  phasePill: document.querySelector("#phase-pill"),
  scopeVersion: document.querySelector("#scope-version"),
  briefTitle: document.querySelector("#brief-title"),
  briefObjective: document.querySelector("#brief-objective"),
  briefConstraints: document.querySelector("#brief-constraints"),
  briefTargetDate: document.querySelector("#brief-target-date"),
  fieldGrid: document.querySelector("#field-grid"),
  decisionZone: document.querySelector("#decision-zone"),
  toolList: document.querySelector("#tool-list"),
  accessTitle: document.querySelector("#access-title"),
  accessList: document.querySelector("#access-list"),
  activityList: document.querySelector("#activity-list"),
  supportLine: document.querySelector("#support-line"),
  connectionDot: document.querySelector("#connection-dot"),
  frameCopyButton: document.querySelector("#frame-copy-button"),
  resetButton: document.querySelector("#reset-button"),
  toastRegion: document.querySelector("#toast-region"),
  debugPanel: document.querySelector("#debug-panel"),
  debugActions: document.querySelector("#debug-actions"),
  debugOutput: document.querySelector("#debug-output"),
};

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function showToast(message, isError = false) {
  if (!message) return;
  const toast = element("div", `toast${isError ? " error" : ""}`, message);
  refs.toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 3400);
}

function renderBrief(state) {
  refs.briefTitle.textContent = state.brief.title;
  refs.briefObjective.textContent = state.brief.objective;
  refs.briefTargetDate.textContent = formatDate(state.brief.targetLaunchDate);
  refs.briefConstraints.replaceChildren(
    ...state.brief.constraints.map((constraint) => element("li", "", constraint)),
  );
}

function renderFields(state) {
  const isDraft = state.phase === "DRAFT";
  const cards = FIELD_DEFINITIONS.map((field) => {
    const scoped = state.scope.includes(field.id);
    const card = element(
      "article",
      `field-card${scoped ? " is-scoped" : ""}${isDraft ? "" : " is-locked"}`,
    );
    card.dataset.fieldId = field.id;

    const head = element("div", "field-card-head");
    const meta = element("div", "field-meta");
    const valueId = `field-${field.id}`;
    const fieldLabel = element("label", "", field.label);
    fieldLabel.htmlFor = valueId;
    meta.append(fieldLabel, element("small", "", field.help));

    const toggle = element("label", "scope-toggle");
    toggle.title = scoped
      ? "Remove this field from the agent write scope"
      : "Add this field to the agent write scope";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = scoped;
    checkbox.disabled = !isDraft;
    checkbox.setAttribute("aria-label", `Frame ${field.label} for agent editing`);
    checkbox.addEventListener("change", () => {
      const nextScope = checkbox.checked
        ? [...state.scope, field.id]
        : state.scope.filter((fieldId) => fieldId !== field.id);
      const outcome = store.setHumanScope(nextScope);
      if (!outcome.ok) showToast(outcome.message, true);
    });
    toggle.append(
      checkbox,
      element("span", "toggle-track"),
      element("span", "toggle-label", scoped ? "Framed" : "Frame"),
    );
    head.append(meta, toggle);

    const input = document.createElement(field.kind === "textarea" ? "textarea" : "input");
    input.id = valueId;
    input.className = field.kind === "textarea" ? "field-textarea" : "field-input";
    if (field.kind !== "textarea") input.type = field.kind === "date" ? "date" : "text";
    input.value = state.fields[field.id];
    input.maxLength = field.maxLength;
    input.disabled = !isDraft;
    input.setAttribute("aria-describedby", `${valueId}-count`);

    const footer = element("div", "field-footer");
    const accessBadge = element(
      "span",
      "access-badge",
      scoped ? (isDraft ? "Agent write" : "Frame preserved") : "Agent read only",
    );
    const charCount = element(
      "span",
      "char-count",
      field.kind === "date" ? "YYYY-MM-DD" : `${input.value.length}/${field.maxLength}`,
    );
    charCount.id = `${valueId}-count`;

    input.addEventListener("input", () => {
      if (field.kind !== "date") {
        charCount.textContent = `${input.value.length}/${field.maxLength}`;
      }
    });
    input.addEventListener("change", () => {
      const outcome = store.humanEditField(field.id, input.value);
      if (!outcome.ok) {
        showToast(outcome.message, true);
        input.value = store.getState().fields[field.id];
      }
    });

    footer.append(accessBadge, charCount);
    card.append(head, input, footer);
    return card;
  });

  refs.fieldGrid.replaceChildren(...cards);
}

function createDiffList(diff) {
  const list = element("ul", "diff-list");
  for (const change of diff) {
    const item = element("li", "diff-item");
    item.append(
      element("span", "diff-label", change.label),
      element("span", "diff-before", change.before),
      element("span", "diff-arrow", "→"),
      element("span", "diff-after", change.after),
    );
    list.append(item);
  }
  return list;
}

function renderDecisionZone(state) {
  const derived = deriveState(state);
  refs.decisionZone.replaceChildren();

  if (state.pendingExpansion) {
    const card = element("article", "decision-card pending");
    const header = element("div", "decision-header");
    const copy = element("div");
    copy.append(
      element("p", "decision-kicker", "Human decision required"),
      element("h3", "", "The agent is asking for a wider frame"),
      element("p", "", state.pendingExpansion.reason),
    );
    const fieldWrap = element("div", "request-fields");
    for (const fieldId of state.pendingExpansion.fields) {
      fieldWrap.append(element("span", "request-field", getFieldLabel(fieldId)));
    }
    copy.append(fieldWrap);

    const actions = element("div", "decision-actions");
    const deny = element("button", "button button-danger-quiet", "Keep current scope");
    deny.type = "button";
    deny.addEventListener("click", () => store.decideScopeExpansion("deny"));
    const approve = element("button", "button button-primary", "Expand scope");
    approve.type = "button";
    approve.addEventListener("click", () => store.decideScopeExpansion("approve"));
    actions.append(deny, approve);
    header.append(copy, actions);
    card.append(header);
    refs.decisionZone.append(card);
    return;
  }

  if (state.phase === "REVIEW" && state.review) {
    const card = element("article", "decision-card review");
    const header = element("div", "decision-header");
    const copy = element("div");
    copy.append(
      element("p", "decision-kicker", "Human review"),
      element("h3", "", `${state.review.diff.length} scoped change${state.review.diff.length === 1 ? "" : "s"} ready`),
      element(
        "p",
        "",
        "The agent froze this change set for review. Nothing has been published.",
      ),
    );
    const actions = element("div", "decision-actions");
    const returnButton = element("button", "button button-ghost", "Return to draft");
    returnButton.type = "button";
    returnButton.addEventListener("click", () => store.decideReview("return"));
    const acceptButton = element("button", "button button-success", "Accept change set");
    acceptButton.type = "button";
    acceptButton.addEventListener("click", () => store.decideReview("accept"));
    actions.append(returnButton, acceptButton);
    header.append(copy, actions);
    card.append(header, createDiffList(state.review.diff));
    refs.decisionZone.append(card);
    return;
  }

  if (state.phase === "ACCEPTED") {
    const card = element("article", "decision-card accepted");
    const header = element("div", "decision-header");
    const copy = element("div");
    copy.append(
      element("p", "decision-kicker", "Human accepted"),
      element("h3", "", "The bounded change set is complete"),
      element(
        "p",
        "",
        "Scope, edits, expansion, and approval remain visible in the shared history.",
      ),
    );
    const actions = element("div", "decision-actions");
    const reset = element("button", "button button-ghost", "Run demo again");
    reset.type = "button";
    reset.addEventListener("click", () => store.reset());
    actions.append(reset);
    header.append(copy, actions);
    card.append(header, createDiffList(derived.diff));
    refs.decisionZone.append(card);
    return;
  }

  if (derived.hasChanges) {
    const card = element("article", "decision-card review");
    const header = element("div", "decision-header");
    const copy = element("div");
    copy.append(
      element("p", "decision-kicker", "Open change set"),
      element("h3", "", `${derived.diff.length} change${derived.diff.length === 1 ? "" : "s"} in the shared page`),
      element(
        "p",
        "",
        "The review tool is now available to the agent. Human acceptance remains a separate step.",
      ),
    );
    header.append(copy);
    card.append(header, createDiffList(derived.diff));
    refs.decisionZone.append(card);
  }
}

function renderTools(state) {
  const tools = expectedToolSurface(state);
  refs.toolList.replaceChildren(
    ...tools.map((tool, index) => {
      const item = element("div", "tool-item");
      item.dataset.mode = tool.mode;
      item.style.animationDelay = `${index * 28}ms`;
      item.append(
        element("span", "tool-icon", tool.mode === "read" ? "R" : "W"),
        element("code", "tool-name", tool.name),
        element("span", "tool-mode", tool.mode),
      );
      return item;
    }),
  );

  const status = webmcp.status;
  refs.connectionDot.className = "connection-dot";
  if (!status) {
    refs.supportLine.textContent = "Checking WebMCP support…";
  } else if (!status.supported) {
    refs.supportLine.textContent =
      "Preview mode · the expected tool surface is shown. Open in ChatGPT or WebMCP-enabled Chrome for live registration.";
  } else if (status.errors.length > 0) {
    refs.connectionDot.classList.add("has-error");
    refs.supportLine.textContent = `WebMCP detected · ${status.registered.length}/${status.expected.length} tools registered.`;
  } else {
    refs.connectionDot.classList.add("is-live");
    refs.supportLine.textContent = `WebMCP live · ${status.registered.length} tool${status.registered.length === 1 ? "" : "s"} registered for this page state.`;
  }
}

function renderAccess(state) {
  refs.accessTitle.textContent =
    state.phase === "DRAFT"
      ? "Read everywhere. Write inside the frame."
      : state.phase === "REVIEW"
        ? "Write tools paused. Frame preserved."
        : "Write tools closed. Frame preserved.";

  refs.accessList.replaceChildren(
    ...summarizeScopeForUi(state).map((item) => {
      const row = element("div", "access-row");
      row.append(
        element("span", "", item.label),
        element("span", `access-state ${item.access}`, item.access),
      );
      return row;
    }),
  );
}

function renderActivity(state) {
  const recent = [...state.activity].reverse().slice(0, 10);
  refs.activityList.replaceChildren(
    ...recent.map((entry) => {
      const item = element("li", "activity-item");
      const actor = entry.actor === "agent" ? "A" : entry.actor === "human" ? "H" : "S";
      const dot = element("span", `actor-dot ${entry.actor}`, actor);
      const copy = element("div", "activity-copy");
      const time = element("time", "", formatTime(entry.at));
      time.dateTime = entry.at;
      copy.append(element("p", "", entry.message), time);
      item.append(dot, copy);
      return item;
    }),
  );
}

function renderDebug(state) {
  if (refs.debugPanel.hidden) return;
  refs.debugActions.replaceChildren();

  const addAction = (label, action) => {
    const button = element("button", "", label);
    button.type = "button";
    button.addEventListener("click", async () => {
      try {
        const output = await action();
        refs.debugOutput.textContent = JSON.stringify(output, null, 2);
      } catch (error) {
        refs.debugOutput.textContent = String(error);
      }
    });
    refs.debugActions.append(button);
  };

  addAction("Inspect workspace", () => webmcp.invokeLocally("inspect_workspace", {}));
  addAction("Frame copy", async () => {
    const output = store.setHumanScope(["headline", "description"]);
    await webmcp.refresh();
    return output;
  });

  if (expectedToolSurface(state).some((tool) => tool.name === "edit_scoped_fields")) {
    addAction("Edit copy", () =>
      webmcp.invokeLocally("edit_scoped_fields", {
        scopeVersion: state.scopeVersion,
        updates: {
          headline: "Carry light. Move freely.",
          description:
            "A quiet, lightweight carry for city commutes and short trips.",
        },
      }),
    );
  }

  if (
    expectedToolSurface(state).some(
      (tool) => tool.name === "request_scope_expansion",
    ) && !state.scope.includes("launch_date")
  ) {
    addAction("Request launch date", () =>
      webmcp.invokeLocally("request_scope_expansion", {
        scopeVersion: state.scopeVersion,
        fields: ["launch_date"],
        reason:
          "The brief requires September 12, but the board still shows September 18.",
      }),
    );
  }

  if (state.pendingExpansion) {
    addAction("Approve request", async () => {
      const output = store.decideScopeExpansion("approve");
      await webmcp.refresh();
      return output;
    });
  }

  if (state.scope.includes("launch_date") && state.fields.launch_date !== "2026-09-12") {
    addAction("Edit launch date", () =>
      webmcp.invokeLocally("edit_scoped_fields", {
        scopeVersion: state.scopeVersion,
        updates: { launch_date: "2026-09-12" },
      }),
    );
  }

  if (
    expectedToolSurface(state).some(
      (tool) => tool.name === "submit_changes_for_review",
    )
  ) {
    addAction("Submit review", () =>
      webmcp.invokeLocally("submit_changes_for_review", {
        scopeVersion: state.scopeVersion,
      }),
    );
  }

  if (state.phase === "REVIEW") {
    addAction("Accept review", () => store.decideReview("accept"));
  }

  addAction("Reset", () => store.reset());
}

function render(state) {
  refs.phasePill.textContent =
    state.phase === "DRAFT" ? "Draft" : state.phase === "REVIEW" ? "Review" : "Accepted";
  refs.phasePill.dataset.phase = state.phase;
  refs.scopeVersion.textContent = `v${state.scopeVersion}`;
  refs.frameCopyButton.disabled = state.phase !== "DRAFT";
  renderBrief(state);
  renderFields(state);
  renderDecisionZone(state);
  renderTools(state);
  renderAccess(state);
  renderActivity(state);
  renderDebug(state);
}

refs.frameCopyButton.addEventListener("click", () => {
  const outcome = store.setHumanScope(["headline", "description"]);
  if (!outcome.ok) showToast(outcome.message, true);
});

refs.resetButton.addEventListener("click", () => store.reset());

store.addEventListener("change", (event) => {
  render(event.detail.state);
  const outcome = event.detail.result;
  if (!outcome.ok) showToast(outcome.message, true);
});

webmcp.addEventListener("status", () => render(store.getState()));

const debugEnabled = new URLSearchParams(window.location.search).get("debug") === "1";
refs.debugPanel.hidden = !debugEnabled;

render(store.getState());
webmcp
  .start()
  .catch((error) => {
    console.warn("WebMCP registration did not complete", error);
  })
  .finally(() => render(store.getState()));

window.scopebox = {
  getState: () => store.getState(),
  getTools: () => webmcp.getDefinitions(),
  invoke: (name, input) => webmcp.invokeLocally(name, input),
  reset: () => store.reset(),
};

window.addEventListener("beforeunload", () => webmcp.dispose(), { once: true });
