import {
  deriveState,
  FIELD_DEFINITIONS,
  getFieldDefinition,
  getFieldLabel,
  toolScopeSnapshot,
  toolWorkspaceSnapshot,
} from "./domain.js";

function writableFieldSchema(fieldId) {
  const field = getFieldDefinition(fieldId);
  const schema = {
    type: "string",
    title: field.label,
    description: field.help,
    minLength: 1,
    maxLength: field.maxLength,
  };
  if (field.kind === "date") {
    schema.pattern = "^\\d{4}-\\d{2}-\\d{2}$";
  }
  return schema;
}


function withTimeout(promise, milliseconds, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

function buildToolDefinitions(store) {
  const state = store.getState();
  const derived = deriveState(state);
  const tools = [];

  tools.push({
    name: "inspect_workspace",
    description:
      "Read the live launch brief, every board field, current human-defined write scope, pending expansion request, and review status.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async () => toolWorkspaceSnapshot(store.getState()),
  });

  tools.push({
    name: "inspect_active_scope",
    description:
      "Read the current scope version and which launch fields the human has made editable or kept read-only for the agent.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: async () => toolScopeSnapshot(store.getState()),
  });

  if (derived.canEdit) {
    const registeredScopeVersion = state.scopeVersion;
    const scopedLabels = derived.scoped.map(getFieldLabel).join(", ");
    const updateProperties = Object.fromEntries(
      derived.scoped.map((fieldId) => [fieldId, writableFieldSchema(fieldId)]),
    );

    tools.push({
      name: "edit_scoped_fields",
      description: `Atomically edit fields currently framed by the human: ${scopedLabels}. This capability is bound to scope v${registeredScopeVersion}.`,
      inputSchema: {
        type: "object",
        properties: {
          scopeVersion: {
            type: "integer",
            const: registeredScopeVersion,
            description: "The active scope version returned by inspect_active_scope.",
          },
          updates: {
            type: "object",
            description: "One or more replacement values within the active write scope.",
            properties: updateProperties,
            additionalProperties: false,
            minProperties: 1,
          },
        },
        required: ["scopeVersion", "updates"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input) => {
        const outcome = store.editScopedFields(input, registeredScopeVersion);
        const latest = store.getState();
        return {
          ...outcome,
          phase: latest.phase,
          scopeVersion: latest.scopeVersion,
          changedValues: outcome.changed
            ? Object.fromEntries(
                outcome.changed.map((item) => [item.fieldId, item.after]),
              )
            : undefined,
        };
      },
    });
  }

  if (derived.canRequestExpansion) {
    const registeredScopeVersion = state.scopeVersion;
    tools.push({
      name: "request_scope_expansion",
      description:
        "Ask the human to add blocked fields to the agent write scope. This creates a visible request and does not expand permissions by itself.",
      inputSchema: {
        type: "object",
        properties: {
          scopeVersion: {
            type: "integer",
            const: registeredScopeVersion,
            description: "The active scope version returned by inspect_active_scope.",
          },
          fields: {
            type: "array",
            description: "Blocked field IDs needed to complete the user's task.",
            items: {
              type: "string",
              enum: derived.blocked,
            },
            minItems: 1,
            uniqueItems: true,
          },
          reason: {
            type: "string",
            description: "A concise explanation shown to the human before they decide.",
            minLength: 8,
            maxLength: 280,
          },
        },
        required: ["scopeVersion", "fields", "reason"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input) => {
        const outcome = store.requestScopeExpansion(input, registeredScopeVersion);
        return {
          ...outcome,
          currentScopeVersion: store.getState().scopeVersion,
          permissionChanged: false,
        };
      },
    });
  }

  if (derived.canSubmit) {
    const registeredScopeVersion = state.scopeVersion;
    tools.push({
      name: "submit_changes_for_review",
      description:
        "Freeze the current change set into a visible human review card. This does not accept, publish, or deploy the changes.",
      inputSchema: {
        type: "object",
        properties: {
          scopeVersion: {
            type: "integer",
            const: registeredScopeVersion,
            description: "The active scope version returned by inspect_active_scope.",
          },
        },
        required: ["scopeVersion"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input) =>
        store.submitChangesForReview(input, registeredScopeVersion),
    });
  }

  return tools;
}

export class WebMCPManager extends EventTarget {
  #store;
  #controllers = [];
  #definitions = new Map();
  #refreshQueue = Promise.resolve();
  #generation = 0;
  #disposed = false;
  #lastStatus = null;

  constructor(store) {
    super();
    this.#store = store;
    this.#store.addEventListener("change", () => this.refresh());
  }

  get status() {
    return this.#lastStatus ? structuredClone(this.#lastStatus) : null;
  }

  getDefinitions() {
    return [...this.#definitions.values()].map((definition) => ({
      name: definition.name,
      description: definition.description,
      annotations: definition.annotations,
    }));
  }

  async start() {
    await this.refresh();
  }

  refresh() {
    const generation = ++this.#generation;
    this.#refreshQueue = this.#refreshQueue.then(() => this.#performRefresh(generation));
    return this.#refreshQueue;
  }

  async #performRefresh(generation) {
    if (this.#disposed || generation !== this.#generation) {
      return;
    }

    for (const controller of this.#controllers) {
      controller.abort();
    }
    this.#controllers = [];
    await Promise.resolve();

    const definitions = buildToolDefinitions(this.#store);
    this.#definitions = new Map(definitions.map((tool) => [tool.name, tool]));

    const modelContext = document.modelContext;
    const supported = typeof modelContext?.registerTool === "function";
    const registered = [];
    const errors = [];

    if (supported) {
      for (const definition of definitions) {
        if (generation !== this.#generation || this.#disposed) {
          break;
        }
        const controller = new AbortController();
        try {
          await withTimeout(
            modelContext.registerTool(definition, { signal: controller.signal }),
            1800,
            `registerTool(${definition.name})`,
          );
          this.#controllers.push(controller);
          registered.push(definition.name);
        } catch (error) {
          controller.abort();
          errors.push({
            name: definition.name,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    this.#lastStatus = {
      supported,
      registered,
      expected: definitions.map((tool) => tool.name),
      errors,
      generation,
    };
    this.dispatchEvent(
      new CustomEvent("status", { detail: structuredClone(this.#lastStatus) }),
    );
  }

  async invokeLocally(name, input = {}) {
    const definition = this.#definitions.get(name);
    if (!definition) {
      return {
        ok: false,
        code: "TOOL_UNAVAILABLE",
        message: `${name} is not available in the current page state.`,
      };
    }
    return definition.execute(input, { signal: new AbortController().signal });
  }

  dispose() {
    this.#disposed = true;
    for (const controller of this.#controllers) {
      controller.abort();
    }
    this.#controllers = [];
  }
}

export function expectedToolSurface(state) {
  const derived = deriveState(state);
  const tools = [
    { name: "inspect_workspace", mode: "read" },
    { name: "inspect_active_scope", mode: "read" },
  ];
  if (derived.canEdit) {
    tools.push({ name: "edit_scoped_fields", mode: "write" });
  }
  if (derived.canRequestExpansion) {
    tools.push({ name: "request_scope_expansion", mode: "write" });
  }
  if (derived.canSubmit) {
    tools.push({ name: "submit_changes_for_review", mode: "write" });
  }
  return tools;
}

export function summarizeScopeForUi(state) {
  const derived = deriveState(state);
  return FIELD_DEFINITIONS.map((field) => {
    const scoped = derived.scoped.includes(field.id);
    return {
      id: field.id,
      label: field.label,
      access: scoped ? (state.phase === "DRAFT" ? "write" : "framed") : "read",
    };
  });
}
