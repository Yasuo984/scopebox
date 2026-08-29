import {
  createInitialState,
  decideReview,
  decideScopeExpansion,
  editScopedFields,
  humanEditField,
  requestScopeExpansion,
  resetState,
  sanitizePersistedState,
  setHumanScope,
  submitChangesForReview,
} from "./domain.js";

const STORAGE_KEY = "scopebox:v0.1:state";

function readStoredState() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? sanitizePersistedState(JSON.parse(raw)) : createInitialState();
  } catch {
    return createInitialState();
  }
}

function writeStoredState(state) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Persistence is progressive enhancement; the live session still works.
  }
}

export class ScopeboxStore extends EventTarget {
  #state;

  constructor({ persist = true, initialState } = {}) {
    super();
    this.persist = persist;
    this.#state = initialState
      ? sanitizePersistedState(initialState)
      : persist
        ? readStoredState()
        : createInitialState();
  }

  getState() {
    return structuredClone(this.#state);
  }

  #commit(outcome) {
    const previous = this.#state;
    this.#state = outcome.state;
    if (this.persist && previous !== this.#state) {
      writeStoredState(this.#state);
    }
    this.dispatchEvent(
      new CustomEvent("change", {
        detail: {
          state: this.getState(),
          result: structuredClone(outcome.result),
        },
      }),
    );
    return structuredClone(outcome.result);
  }

  setHumanScope(fieldIds) {
    return this.#commit(setHumanScope(this.#state, fieldIds));
  }

  humanEditField(fieldId, value) {
    return this.#commit(humanEditField(this.#state, fieldId, value));
  }

  editScopedFields(payload, registeredScopeVersion) {
    return this.#commit(
      editScopedFields(this.#state, payload, registeredScopeVersion),
    );
  }

  requestScopeExpansion(payload, registeredScopeVersion) {
    return this.#commit(
      requestScopeExpansion(this.#state, payload, registeredScopeVersion),
    );
  }

  decideScopeExpansion(decision) {
    return this.#commit(decideScopeExpansion(this.#state, decision));
  }

  submitChangesForReview(payload, registeredScopeVersion) {
    return this.#commit(
      submitChangesForReview(this.#state, payload, registeredScopeVersion),
    );
  }

  decideReview(decision) {
    return this.#commit(decideReview(this.#state, decision));
  }

  reset() {
    return this.#commit(resetState());
  }
}
