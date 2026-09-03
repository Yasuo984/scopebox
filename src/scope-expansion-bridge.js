const DEFAULT_TIMEOUT_MS = 120_000;

function hold(code, message, extra = {}) {
  return {
    ok: false,
    code,
    message,
    hold: true,
    ...extra,
  };
}

function cloneScope(state) {
  return Array.isArray(state?.scope) ? structuredClone(state.scope) : [];
}

function lastActivityRequestId(state) {
  const activity = Array.isArray(state?.activity) ? state.activity.at(-1) : null;
  return typeof activity?.details?.requestId === "string"
    ? activity.details.requestId
    : null;
}

export class ScopeExpansionDecisionBridge extends EventTarget {
  #store;
  #pending = null;
  #settling = false;
  #disposed = false;
  #timeoutMs;
  #setTimeout;
  #clearTimeout;
  #onStoreChange;

  constructor(
    store,
    {
      timeoutMs = DEFAULT_TIMEOUT_MS,
      setTimeoutFn = globalThis.setTimeout?.bind(globalThis),
      clearTimeoutFn = globalThis.clearTimeout?.bind(globalThis),
    } = {},
  ) {
    super();
    if (!store?.addEventListener || !store?.requestScopeExpansion) {
      throw new TypeError("ScopeExpansionDecisionBridge requires a Scopebox store.");
    }

    this.#store = store;
    this.#timeoutMs = timeoutMs;
    this.#setTimeout = setTimeoutFn;
    this.#clearTimeout = clearTimeoutFn;
    this.#onStoreChange = (event) => this.#handleStoreChange(event.detail);
    this.#store.addEventListener("change", this.#onStoreChange);
  }

  get isWaiting() {
    return Boolean(this.#pending);
  }

  get shouldDeferRefresh() {
    return Boolean(this.#pending) || this.#settling;
  }

  requestAndWait(payload, registeredScopeVersion, context = {}) {
    if (this.#disposed) {
      return Promise.resolve(
        hold(
          "EXPANSION_BRIDGE_DISPOSED",
          "HOLD / EXPANSION_BRIDGE_DISPOSED: the page is no longer accepting scope decisions.",
        ),
      );
    }

    if (this.#pending) {
      return Promise.resolve(
        hold(
          "EXPANSION_BRIDGE_BUSY",
          "HOLD / EXPANSION_BRIDGE_BUSY: another Human scope decision is already in flight.",
          { requestId: this.#pending.requestId },
        ),
      );
    }

    let resolvePromise;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    const pending = {
      requestId: null,
      basedOnScopeVersion: registeredScopeVersion,
      resolve: resolvePromise,
      timer: null,
      signal: null,
      abortHandler: null,
    };
    this.#pending = pending;

    let outcome;
    try {
      outcome = this.#store.requestScopeExpansion(
        payload,
        registeredScopeVersion,
      );
    } catch (error) {
      this.#finish(
        hold(
          "EXPANSION_REQUEST_FAILED",
          "HOLD / EXPANSION_REQUEST_FAILED: the scope request could not be created.",
          { error: error instanceof Error ? error.message : String(error) },
        ),
      );
      return promise;
    }

    if (!outcome?.ok) {
      this.#finish(
        outcome ??
          hold(
            "EXPANSION_REQUEST_FAILED",
            "HOLD / EXPANSION_REQUEST_FAILED: the scope request returned no result.",
          ),
      );
      return promise;
    }

    pending.requestId =
      typeof outcome.id === "string"
        ? outcome.id
        : typeof outcome.requestId === "string"
          ? outcome.requestId
          : null;

    if (!pending.requestId) {
      this.#finish(
        hold(
          "EXPANSION_REQUEST_ID_MISSING",
          "HOLD / EXPANSION_REQUEST_ID_MISSING: the Human decision cannot be bound to an exact request.",
        ),
      );
      return promise;
    }

    const signal = context?.signal;
    if (signal?.aborted) {
      this.#finish(
        hold(
          "EXPANSION_WAIT_ABORTED",
          "HOLD / EXPANSION_WAIT_ABORTED: the Agent stopped waiting for the Human decision.",
          { requestId: pending.requestId },
        ),
      );
      return promise;
    }

    if (signal?.addEventListener) {
      pending.signal = signal;
      pending.abortHandler = () =>
        this.#finish(
          hold(
            "EXPANSION_WAIT_ABORTED",
            "HOLD / EXPANSION_WAIT_ABORTED: the Agent stopped waiting for the Human decision.",
            { requestId: pending.requestId },
          ),
        );
      signal.addEventListener("abort", pending.abortHandler, { once: true });
    }

    if (
      Number.isFinite(this.#timeoutMs) &&
      this.#timeoutMs > 0 &&
      typeof this.#setTimeout === "function"
    ) {
      pending.timer = this.#setTimeout(
        () =>
          this.#finish(
            hold(
              "HUMAN_DECISION_TIMEOUT",
              "HOLD / HUMAN_DECISION_TIMEOUT: the scope request is still visible, but the Agent stopped waiting. No permission was granted.",
              {
                requestId: pending.requestId,
                basedOnScopeVersion: pending.basedOnScopeVersion,
              },
            ),
          ),
        this.#timeoutMs,
      );
    }

    return promise;
  }

  #handleStoreChange(detail) {
    const pending = this.#pending;
    if (!pending?.requestId) return;

    const state = detail?.state;
    const outcome = detail?.result;
    const decisionCode = outcome?.code;

    if (
      decisionCode === "EXPANSION_APPROVED" ||
      decisionCode === "EXPANSION_DENIED"
    ) {
      const eventRequestId =
        typeof outcome?.requestId === "string"
          ? outcome.requestId
          : lastActivityRequestId(state);

      if (eventRequestId && eventRequestId !== pending.requestId) return;

      const approved = decisionCode === "EXPANSION_APPROVED";
      this.#finish({
        ...outcome,
        requestId: pending.requestId,
        decision: approved ? "approved" : "denied",
        permissionChanged: approved,
        currentScopeVersion: state?.scopeVersion,
        scope: cloneScope(state),
        nextAction: approved
          ? "The Human granted the wider frame. Re-inspect the active scope, then continue the task with the newly available Site tool capability without asking the Human to confirm again."
          : "The Human kept the current frame. Do not edit the requested fields.",
      });
      return;
    }

    const activeRequestId = state?.pendingExpansion?.id;
    if (activeRequestId === pending.requestId) return;

    this.#finish(
      hold(
        "SCOPE_STALE",
        "HOLD / SCOPE_STALE: the pending Human decision no longer matches the active scope request.",
        {
          requestId: pending.requestId,
          activeRequestId: activeRequestId ?? null,
          currentScopeVersion: state?.scopeVersion,
        },
      ),
    );
  }

  #finish(outcome) {
    const pending = this.#pending;
    if (!pending) return;

    this.#pending = null;
    this.#settling = true;

    if (pending.timer != null && typeof this.#clearTimeout === "function") {
      this.#clearTimeout(pending.timer);
    }
    if (pending.signal && pending.abortHandler) {
      pending.signal.removeEventListener?.("abort", pending.abortHandler);
    }

    pending.resolve(outcome);

    const settle = () => {
      this.#settling = false;
      this.dispatchEvent(new Event("settled"));
    };
    if (typeof this.#setTimeout === "function") {
      this.#setTimeout(settle, 0);
    } else {
      queueMicrotask(settle);
    }
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#store.removeEventListener?.("change", this.#onStoreChange);

    if (this.#pending) {
      this.#finish(
        hold(
          "EXPANSION_BRIDGE_DISPOSED",
          "HOLD / EXPANSION_BRIDGE_DISPOSED: the page closed while waiting for the Human decision.",
          { requestId: this.#pending.requestId },
        ),
      );
    }
  }
}
