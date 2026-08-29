export const FIELD_DEFINITIONS = Object.freeze([
  {
    id: "product_name",
    label: "Product name",
    kind: "text",
    maxLength: 60,
    initialValue: "Kumo One",
    help: "The public product name.",
  },
  {
    id: "headline",
    label: "Headline",
    kind: "text",
    maxLength: 80,
    initialValue: "A better bag for every day",
    help: "The primary launch headline.",
  },
  {
    id: "description",
    label: "Description",
    kind: "textarea",
    maxLength: 180,
    initialValue:
      "A lightweight everyday bag for work, travel, and everything in between.",
    help: "A concise public description.",
  },
  {
    id: "audience",
    label: "Audience",
    kind: "text",
    maxLength: 100,
    initialValue: "Design-conscious city commuters",
    help: "The intended launch audience.",
  },
  {
    id: "launch_date",
    label: "Launch date",
    kind: "date",
    maxLength: 10,
    initialValue: "2026-09-18",
    help: "The public availability date.",
  },
  {
    id: "price",
    label: "Price",
    kind: "text",
    maxLength: 30,
    initialValue: "¥24,800",
    help: "The public list price.",
  },
]);

export const FIELD_IDS = Object.freeze(FIELD_DEFINITIONS.map((field) => field.id));

export const INITIAL_BRIEF = Object.freeze({
  title: "Tokyo preview launch",
  objective:
    "Ready this board for a September 12 launch. Make the copy calm, specific, and concise.",
  constraints: [
    "Keep the audience and price unchanged.",
    "Headline: 60 characters or fewer.",
    "Description: 140 characters or fewer.",
  ],
  targetLaunchDate: "2026-09-12",
});

const FIELD_ID_SET = new Set(FIELD_IDS);

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clone(value) {
  return structuredClone(value);
}

function appendActivity(state, entry) {
  state.activity.push({
    id: makeId("activity"),
    at: nowIso(),
    ...entry,
  });
  state.activity = state.activity.slice(-30);
}

function sortedUniqueFieldIds(fieldIds) {
  if (!Array.isArray(fieldIds)) {
    return [];
  }
  return [...new Set(fieldIds)].filter((fieldId) => FIELD_ID_SET.has(fieldId)).sort();
}

function sameFieldSet(left, right) {
  const a = sortedUniqueFieldIds(left);
  const b = sortedUniqueFieldIds(right);
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function fieldLabel(fieldId) {
  return FIELD_DEFINITIONS.find((field) => field.id === fieldId)?.label ?? fieldId;
}

function result(ok, code, message, extra = {}) {
  return { ok, code, message, ...extra };
}

function hold(code, message, extra = {}) {
  return result(false, code, message, { hold: true, ...extra });
}

export function createInitialState() {
  const fields = Object.fromEntries(
    FIELD_DEFINITIONS.map((field) => [field.id, field.initialValue]),
  );

  return {
    schemaVersion: 1,
    boardId: "scopebox_launch_kumo_one",
    brief: clone(INITIAL_BRIEF),
    fields,
    baselineFields: clone(fields),
    scope: [],
    scopeVersion: 0,
    phase: "DRAFT",
    pendingExpansion: null,
    review: null,
    acceptedAt: null,
    activity: [
      {
        id: makeId("activity"),
        at: nowIso(),
        actor: "system",
        type: "SESSION_READY",
        message: "Launch board ready. No write scope has been framed yet.",
      },
    ],
    updatedAt: nowIso(),
  };
}

export function sanitizePersistedState(candidate) {
  if (!candidate || candidate.schemaVersion !== 1) {
    return createInitialState();
  }

  const initial = createInitialState();
  const fields = { ...initial.fields };
  for (const fieldId of FIELD_IDS) {
    const value = candidate.fields?.[fieldId];
    if (typeof value === "string") {
      fields[fieldId] = value;
    }
  }

  return {
    ...initial,
    fields,
    baselineFields: { ...initial.baselineFields },
    scope: sortedUniqueFieldIds(candidate.scope),
    scopeVersion:
      Number.isInteger(candidate.scopeVersion) && candidate.scopeVersion >= 0
        ? candidate.scopeVersion
        : 0,
    phase: ["DRAFT", "REVIEW", "ACCEPTED"].includes(candidate.phase)
      ? candidate.phase
      : "DRAFT",
    pendingExpansion:
      candidate.pendingExpansion && Array.isArray(candidate.pendingExpansion.fields)
        ? {
            ...candidate.pendingExpansion,
            fields: sortedUniqueFieldIds(candidate.pendingExpansion.fields),
          }
        : null,
    review: candidate.review ?? null,
    acceptedAt: candidate.acceptedAt ?? null,
    activity: Array.isArray(candidate.activity)
      ? candidate.activity.slice(-30)
      : initial.activity,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : nowIso(),
  };
}

export function deriveState(state) {
  const scoped = sortedUniqueFieldIds(state.scope);
  const blocked = FIELD_IDS.filter((fieldId) => !scoped.includes(fieldId));
  const diff = FIELD_IDS.flatMap((fieldId) => {
    const before = state.baselineFields[fieldId];
    const after = state.fields[fieldId];
    return before === after
      ? []
      : [
          {
            fieldId,
            label: fieldLabel(fieldId),
            before,
            after,
          },
        ];
  });

  return {
    scoped,
    blocked,
    diff,
    hasChanges: diff.length > 0,
    canEdit: state.phase === "DRAFT" && scoped.length > 0,
    canRequestExpansion:
      state.phase === "DRAFT" &&
      scoped.length > 0 &&
      blocked.length > 0 &&
      !state.pendingExpansion,
    canSubmit:
      state.phase === "DRAFT" && diff.length > 0 && !state.pendingExpansion,
  };
}

export function setHumanScope(currentState, fieldIds) {
  const state = clone(currentState);
  if (state.phase !== "DRAFT") {
    return {
      state: currentState,
      result: hold(
        "BOARD_NOT_DRAFT",
        "Return the board to draft before changing the agent scope.",
      ),
    };
  }

  const nextScope = sortedUniqueFieldIds(fieldIds);
  if (sameFieldSet(nextScope, state.scope)) {
    return {
      state: currentState,
      result: result(true, "SCOPE_UNCHANGED", "The human-defined scope is unchanged.", {
        scope: nextScope,
        scopeVersion: state.scopeVersion,
      }),
    };
  }

  const previousScope = sortedUniqueFieldIds(state.scope);
  state.scope = nextScope;
  state.scopeVersion += 1;
  state.pendingExpansion = null;
  state.updatedAt = nowIso();

  appendActivity(state, {
    actor: "human",
    type: "SCOPE_CHANGED",
    message:
      nextScope.length > 0
        ? `Framed ${nextScope.map(fieldLabel).join(", ")} for agent editing.`
        : "Removed the agent write scope.",
    details: {
      previousScope,
      scope: nextScope,
      scopeVersion: state.scopeVersion,
    },
  });

  return {
    state,
    result: result(true, "SCOPE_UPDATED", "The agent write scope was updated.", {
      scope: nextScope,
      scopeVersion: state.scopeVersion,
    }),
  };
}

export function humanEditField(currentState, fieldId, value) {
  const state = clone(currentState);
  if (state.phase !== "DRAFT") {
    return {
      state: currentState,
      result: hold("BOARD_NOT_DRAFT", "Return the board to draft before editing fields."),
    };
  }

  const validation = validateFieldValue(fieldId, value);
  if (!validation.ok) {
    return { state: currentState, result: validation };
  }

  if (state.fields[fieldId] === validation.value) {
    return {
      state: currentState,
      result: result(true, "FIELD_UNCHANGED", `${fieldLabel(fieldId)} is unchanged.`),
    };
  }

  const before = state.fields[fieldId];
  state.fields[fieldId] = validation.value;
  state.review = null;
  state.updatedAt = nowIso();
  appendActivity(state, {
    actor: "human",
    type: "HUMAN_EDITED",
    message: `Human edited ${fieldLabel(fieldId)}.`,
    details: { fieldId, before, after: validation.value },
  });

  return {
    state,
    result: result(true, "FIELD_UPDATED", `${fieldLabel(fieldId)} was updated.`, {
      fieldId,
      value: validation.value,
    }),
  };
}

function validateFieldValue(fieldId, rawValue) {
  const definition = FIELD_DEFINITIONS.find((field) => field.id === fieldId);
  if (!definition) {
    return result(false, "UNKNOWN_FIELD", `Unknown field: ${fieldId}.`);
  }
  if (typeof rawValue !== "string") {
    return result(false, "INVALID_VALUE", `${definition.label} must be a string.`);
  }

  const value = rawValue.trim();
  if (!value) {
    return result(false, "EMPTY_VALUE", `${definition.label} cannot be empty.`);
  }
  if (value.length > definition.maxLength) {
    return result(
      false,
      "VALUE_TOO_LONG",
      `${definition.label} must be ${definition.maxLength} characters or fewer.`,
    );
  }
  if (definition.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return result(false, "INVALID_DATE", `${definition.label} must use YYYY-MM-DD.`);
  }

  return { ok: true, value };
}

export function editScopedFields(
  currentState,
  { scopeVersion, updates },
  registeredScopeVersion = scopeVersion,
) {
  const state = clone(currentState);
  if (state.phase !== "DRAFT") {
    return {
      state: currentState,
      result: hold("BOARD_NOT_DRAFT", "The board is not accepting agent edits."),
    };
  }

  if (
    !Number.isInteger(scopeVersion) ||
    scopeVersion !== state.scopeVersion ||
    registeredScopeVersion !== state.scopeVersion
  ) {
    return {
      state: currentState,
      result: hold(
        "SCOPE_STALE",
        "HOLD / SCOPE_STALE: the human changed the scope after this capability was issued. Inspect the active scope again.",
        {
          expectedScopeVersion: state.scopeVersion,
          receivedScopeVersion: scopeVersion,
          registeredScopeVersion,
        },
      ),
    };
  }

  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    return {
      state: currentState,
      result: result(false, "INVALID_UPDATES", "Provide an object of field updates."),
    };
  }

  const entries = Object.entries(updates);
  if (entries.length === 0) {
    return {
      state: currentState,
      result: result(false, "NO_UPDATES", "Provide at least one field update."),
    };
  }

  const unknown = entries.map(([fieldId]) => fieldId).filter((fieldId) => !FIELD_ID_SET.has(fieldId));
  if (unknown.length > 0) {
    return {
      state: currentState,
      result: result(false, "UNKNOWN_FIELD", `Unknown fields: ${unknown.join(", ")}.`),
    };
  }

  const outOfScope = entries
    .map(([fieldId]) => fieldId)
    .filter((fieldId) => !state.scope.includes(fieldId));
  if (outOfScope.length > 0) {
    return {
      state: currentState,
      result: hold(
        "OUT_OF_SCOPE",
        `HOLD / OUT_OF_SCOPE: ${outOfScope.map(fieldLabel).join(", ")} is not in the human-defined write scope.`,
        { outOfScope },
      ),
    };
  }

  const validated = [];
  for (const [fieldId, value] of entries) {
    const validation = validateFieldValue(fieldId, value);
    if (!validation.ok) {
      return { state: currentState, result: validation };
    }
    validated.push([fieldId, validation.value]);
  }

  const changed = [];
  for (const [fieldId, value] of validated) {
    const before = state.fields[fieldId];
    if (before !== value) {
      state.fields[fieldId] = value;
      changed.push({ fieldId, label: fieldLabel(fieldId), before, after: value });
    }
  }

  if (changed.length === 0) {
    return {
      state: currentState,
      result: result(true, "NO_CHANGE", "All supplied values already match the board."),
    };
  }

  state.review = null;
  state.updatedAt = nowIso();
  appendActivity(state, {
    actor: "agent",
    type: "AGENT_EDITED",
    message: `Agent edited ${changed.map((item) => item.label).join(", ")} within scope v${state.scopeVersion}.`,
    details: { changed, scopeVersion: state.scopeVersion },
  });

  return {
    state,
    result: result(true, "SCOPED_EDIT_APPLIED", "Scoped edits were applied atomically.", {
      scopeVersion: state.scopeVersion,
      changed,
    }),
  };
}

export function requestScopeExpansion(
  currentState,
  { scopeVersion, fields, reason },
  registeredScopeVersion = scopeVersion,
) {
  const state = clone(currentState);
  if (state.phase !== "DRAFT") {
    return {
      state: currentState,
      result: hold("BOARD_NOT_DRAFT", "The board is not accepting scope requests."),
    };
  }

  if (
    !Number.isInteger(scopeVersion) ||
    scopeVersion !== state.scopeVersion ||
    registeredScopeVersion !== state.scopeVersion
  ) {
    return {
      state: currentState,
      result: hold(
        "SCOPE_STALE",
        "HOLD / SCOPE_STALE: the requested expansion was based on an older human scope. Inspect the active scope again.",
        {
          expectedScopeVersion: state.scopeVersion,
          receivedScopeVersion: scopeVersion,
          registeredScopeVersion,
        },
      ),
    };
  }

  if (state.pendingExpansion) {
    return {
      state: currentState,
      result: hold(
        "EXPANSION_PENDING",
        "A scope-expansion request is already waiting for the human.",
        { requestId: state.pendingExpansion.id },
      ),
    };
  }

  const requestedFields = sortedUniqueFieldIds(fields);
  if (requestedFields.length === 0) {
    return {
      state: currentState,
      result: result(false, "NO_FIELDS", "Request at least one blocked field."),
    };
  }

  const alreadyScoped = requestedFields.filter((fieldId) => state.scope.includes(fieldId));
  if (alreadyScoped.length > 0) {
    return {
      state: currentState,
      result: result(
        false,
        "ALREADY_SCOPED",
        `${alreadyScoped.map(fieldLabel).join(", ")} is already editable.`,
      ),
    };
  }

  if (typeof reason !== "string" || reason.trim().length < 8) {
    return {
      state: currentState,
      result: result(
        false,
        "REASON_REQUIRED",
        "Explain why the additional field is needed in at least 8 characters.",
      ),
    };
  }

  const cleanReason = reason.trim().slice(0, 280);
  state.pendingExpansion = {
    id: makeId("scope_request"),
    fields: requestedFields,
    reason: cleanReason,
    basedOnScopeVersion: state.scopeVersion,
    requestedAt: nowIso(),
  };
  state.updatedAt = nowIso();

  appendActivity(state, {
    actor: "agent",
    type: "EXPANSION_REQUESTED",
    message: `Agent requested ${requestedFields.map(fieldLabel).join(", ")}. Human decision required.`,
    details: clone(state.pendingExpansion),
  });

  return {
    state,
    result: result(
      true,
      "EXPANSION_REQUESTED",
      "The request is visible to the human. The write scope has not changed.",
      clone(state.pendingExpansion),
    ),
  };
}

export function decideScopeExpansion(currentState, decision) {
  const state = clone(currentState);
  const request = state.pendingExpansion;
  if (!request) {
    return {
      state: currentState,
      result: result(false, "NO_PENDING_REQUEST", "There is no pending scope request."),
    };
  }

  if (request.basedOnScopeVersion !== state.scopeVersion) {
    state.pendingExpansion = null;
    state.updatedAt = nowIso();
    appendActivity(state, {
      actor: "system",
      type: "EXPANSION_EXPIRED",
      message: "The pending expansion expired because the human scope changed.",
    });
    return {
      state,
      result: hold(
        "SCOPE_STALE",
        "HOLD / SCOPE_STALE: the expansion request no longer matches the active scope.",
      ),
    };
  }

  if (decision === "approve") {
    state.scope = sortedUniqueFieldIds([...state.scope, ...request.fields]);
    state.scopeVersion += 1;
    state.pendingExpansion = null;
    state.updatedAt = nowIso();
    appendActivity(state, {
      actor: "human",
      type: "EXPANSION_APPROVED",
      message: `Human added ${request.fields.map(fieldLabel).join(", ")} to the agent scope.`,
      details: {
        requestId: request.id,
        scope: clone(state.scope),
        scopeVersion: state.scopeVersion,
      },
    });
    return {
      state,
      result: result(true, "EXPANSION_APPROVED", "The human expanded the write scope.", {
        scope: clone(state.scope),
        scopeVersion: state.scopeVersion,
      }),
    };
  }

  if (decision === "deny") {
    state.pendingExpansion = null;
    state.updatedAt = nowIso();
    appendActivity(state, {
      actor: "human",
      type: "EXPANSION_DENIED",
      message: `Human kept ${request.fields.map(fieldLabel).join(", ")} outside the agent scope.`,
      details: { requestId: request.id },
    });
    return {
      state,
      result: result(true, "EXPANSION_DENIED", "The human kept the current scope."),
    };
  }

  return {
    state: currentState,
    result: result(false, "INVALID_DECISION", "Decision must be approve or deny."),
  };
}

export function submitChangesForReview(
  currentState,
  { scopeVersion },
  registeredScopeVersion = scopeVersion,
) {
  const state = clone(currentState);
  const derived = deriveState(state);

  if (state.phase !== "DRAFT") {
    return {
      state: currentState,
      result: hold("BOARD_NOT_DRAFT", "The board has already left draft."),
    };
  }

  if (
    !Number.isInteger(scopeVersion) ||
    scopeVersion !== state.scopeVersion ||
    registeredScopeVersion !== state.scopeVersion
  ) {
    return {
      state: currentState,
      result: hold(
        "SCOPE_STALE",
        "HOLD / SCOPE_STALE: the review submission was prepared under an older scope.",
        {
          expectedScopeVersion: state.scopeVersion,
          receivedScopeVersion: scopeVersion,
          registeredScopeVersion,
        },
      ),
    };
  }

  if (state.pendingExpansion) {
    return {
      state: currentState,
      result: hold(
        "HUMAN_DECISION_PENDING",
        "Resolve the scope-expansion request before submitting changes.",
      ),
    };
  }

  if (!derived.hasChanges) {
    return {
      state: currentState,
      result: result(false, "NO_CHANGES", "There are no changes to review."),
    };
  }

  state.phase = "REVIEW";
  state.review = {
    id: makeId("review"),
    submittedAt: nowIso(),
    scopeVersion: state.scopeVersion,
    diff: clone(derived.diff),
  };
  state.updatedAt = nowIso();
  appendActivity(state, {
    actor: "agent",
    type: "REVIEW_SUBMITTED",
    message: `Agent submitted ${derived.diff.length} change${derived.diff.length === 1 ? "" : "s"} for human review.`,
    details: { reviewId: state.review.id, scopeVersion: state.scopeVersion },
  });

  return {
    state,
    result: result(
      true,
      "REVIEW_SUBMITTED",
      "The change set is frozen for human review. Nothing has been published.",
      { reviewId: state.review.id, diff: clone(state.review.diff) },
    ),
  };
}

export function decideReview(currentState, decision) {
  const state = clone(currentState);
  if (state.phase !== "REVIEW" || !state.review) {
    return {
      state: currentState,
      result: result(false, "NO_ACTIVE_REVIEW", "There is no active review."),
    };
  }

  if (decision === "accept") {
    state.phase = "ACCEPTED";
    state.acceptedAt = nowIso();
    state.updatedAt = nowIso();
    appendActivity(state, {
      actor: "human",
      type: "REVIEW_ACCEPTED",
      message: "Human accepted the scoped change set.",
      details: { reviewId: state.review.id },
    });
    return {
      state,
      result: result(true, "REVIEW_ACCEPTED", "The scoped change set was accepted."),
    };
  }

  if (decision === "return") {
    state.phase = "DRAFT";
    state.review = null;
    state.updatedAt = nowIso();
    appendActivity(state, {
      actor: "human",
      type: "REVIEW_RETURNED",
      message: "Human returned the change set to draft.",
    });
    return {
      state,
      result: result(true, "REVIEW_RETURNED", "The board is editable again."),
    };
  }

  return {
    state: currentState,
    result: result(false, "INVALID_DECISION", "Decision must be accept or return."),
  };
}

export function resetState() {
  return {
    state: createInitialState(),
    result: result(true, "DEMO_RESET", "Scopebox was reset to its initial state."),
  };
}

export function toolWorkspaceSnapshot(state) {
  const derived = deriveState(state);
  return {
    boardId: state.boardId,
    phase: state.phase,
    brief: clone(state.brief),
    fields: FIELD_DEFINITIONS.map((definition) => ({
      id: definition.id,
      label: definition.label,
      value: state.fields[definition.id],
      agentAccess: state.scope.includes(definition.id) ? "write" : "read",
    })),
    scopeVersion: state.scopeVersion,
    pendingExpansion: state.pendingExpansion
      ? {
          fields: clone(state.pendingExpansion.fields),
          reason: state.pendingExpansion.reason,
        }
      : null,
    changes: clone(derived.diff),
  };
}

export function toolScopeSnapshot(state) {
  const derived = deriveState(state);
  return {
    scopeVersion: state.scopeVersion,
    editableFields: derived.scoped.map((fieldId) => ({
      id: fieldId,
      label: fieldLabel(fieldId),
    })),
    readOnlyFields: derived.blocked.map((fieldId) => ({
      id: fieldId,
      label: fieldLabel(fieldId),
    })),
    pendingHumanDecision: Boolean(state.pendingExpansion),
  };
}

export function getFieldDefinition(fieldId) {
  return FIELD_DEFINITIONS.find((field) => field.id === fieldId) ?? null;
}

export function getFieldLabel(fieldId) {
  return fieldLabel(fieldId);
}
