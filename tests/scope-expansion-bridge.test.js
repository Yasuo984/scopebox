import test from "node:test";
import assert from "node:assert/strict";

import { ScopeExpansionDecisionBridge } from "../src/scope-expansion-bridge.js";

function emitChange(target, state, result) {
  const event = new Event("change");
  Object.defineProperty(event, "detail", {
    value: {
      state: structuredClone(state),
      result: structuredClone(result),
    },
  });
  target.dispatchEvent(event);
}

class FakeScopeboxStore extends EventTarget {
  constructor() {
    super();
    this.sequence = 0;
    this.state = {
      scope: ["headline", "description"],
      scopeVersion: 1,
      pendingExpansion: null,
      activity: [],
    };
  }

  requestScopeExpansion(payload, registeredScopeVersion) {
    assert.equal(payload.scopeVersion, registeredScopeVersion);
    if (this.state.pendingExpansion) {
      return {
        ok: false,
        code: "EXPANSION_PENDING",
        hold: true,
        message: "A request is already pending.",
        requestId: this.state.pendingExpansion.id,
      };
    }

    this.sequence += 1;
    const request = {
      id: `scope_request_${this.sequence}`,
      fields: structuredClone(payload.fields),
      reason: payload.reason,
      basedOnScopeVersion: this.state.scopeVersion,
    };
    this.state.pendingExpansion = request;
    const result = {
      ok: true,
      code: "EXPANSION_REQUESTED",
      message: "Human decision required.",
      ...structuredClone(request),
    };
    emitChange(this, this.state, result);
    return structuredClone(result);
  }

  approve() {
    const request = this.state.pendingExpansion;
    assert.ok(request);
    this.state.scope = [...new Set([...this.state.scope, ...request.fields])].sort();
    this.state.scopeVersion += 1;
    this.state.pendingExpansion = null;
    this.state.activity.push({
      type: "EXPANSION_APPROVED",
      details: { requestId: request.id },
    });
    const result = {
      ok: true,
      code: "EXPANSION_APPROVED",
      message: "The Human expanded the write scope.",
      scope: structuredClone(this.state.scope),
      scopeVersion: this.state.scopeVersion,
    };
    emitChange(this, this.state, result);
  }

  deny() {
    const request = this.state.pendingExpansion;
    assert.ok(request);
    this.state.pendingExpansion = null;
    this.state.activity.push({
      type: "EXPANSION_DENIED",
      details: { requestId: request.id },
    });
    const result = {
      ok: true,
      code: "EXPANSION_DENIED",
      message: "The Human kept the current scope.",
    };
    emitChange(this, this.state, result);
  }

  replaceScopeWithoutDecision() {
    this.state.scope = ["description"];
    this.state.scopeVersion += 1;
    this.state.pendingExpansion = null;
    this.state.activity.push({ type: "SCOPE_CHANGED", details: {} });
    emitChange(this, this.state, {
      ok: true,
      code: "SCOPE_UPDATED",
      message: "The Human changed the scope directly.",
    });
  }
}

function requestPrice(bridge, context = {}) {
  return bridge.requestAndWait(
    {
      scopeVersion: 1,
      fields: ["price"],
      reason: "The Human asked for a lower public price.",
    },
    1,
    context,
  );
}

test("the scope request stays pending until the Human approves it", async () => {
  const store = new FakeScopeboxStore();
  const bridge = new ScopeExpansionDecisionBridge(store, { timeoutMs: 0 });
  let resolved = false;
  const pending = requestPrice(bridge).then((result) => {
    resolved = true;
    return result;
  });

  await Promise.resolve();
  assert.equal(resolved, false);
  assert.equal(bridge.isWaiting, true);
  assert.equal(bridge.shouldDeferRefresh, true);
  assert.equal(store.state.pendingExpansion.id, "scope_request_1");

  store.approve();
  const result = await pending;

  assert.equal(result.code, "EXPANSION_APPROVED");
  assert.equal(result.decision, "approved");
  assert.equal(result.permissionChanged, true);
  assert.equal(result.requestId, "scope_request_1");
  assert.equal(result.currentScopeVersion, 2);
  assert.deepEqual(result.scope, ["description", "headline", "price"]);
  assert.match(result.nextAction, /without asking the Human to confirm again/);
  bridge.dispose();
});

test("a Human denial resolves the same tool call without expanding scope", async () => {
  const store = new FakeScopeboxStore();
  const bridge = new ScopeExpansionDecisionBridge(store, { timeoutMs: 0 });
  const pending = requestPrice(bridge);

  store.deny();
  const result = await pending;

  assert.equal(result.code, "EXPANSION_DENIED");
  assert.equal(result.decision, "denied");
  assert.equal(result.permissionChanged, false);
  assert.equal(result.currentScopeVersion, 1);
  assert.deepEqual(result.scope, ["headline", "description"]);
  assert.match(result.nextAction, /Do not edit the requested fields/);
  bridge.dispose();
});

test("a direct scope change makes the waiting request fail closed as stale", async () => {
  const store = new FakeScopeboxStore();
  const bridge = new ScopeExpansionDecisionBridge(store, { timeoutMs: 0 });
  const pending = requestPrice(bridge);

  store.replaceScopeWithoutDecision();
  const result = await pending;

  assert.equal(result.code, "SCOPE_STALE");
  assert.equal(result.hold, true);
  assert.equal(result.requestId, "scope_request_1");
  assert.equal(result.currentScopeVersion, 2);
  bridge.dispose();
});

test("an aborted Agent wait fails closed without granting permission", async () => {
  const store = new FakeScopeboxStore();
  const bridge = new ScopeExpansionDecisionBridge(store, { timeoutMs: 0 });
  const controller = new AbortController();
  const pending = requestPrice(bridge, { signal: controller.signal });

  controller.abort();
  const result = await pending;

  assert.equal(result.code, "EXPANSION_WAIT_ABORTED");
  assert.equal(result.hold, true);
  assert.equal(result.requestId, "scope_request_1");
  assert.equal(store.state.scopeVersion, 1);
  assert.deepEqual(store.state.scope, ["headline", "description"]);
  assert.equal(store.state.pendingExpansion.id, "scope_request_1");
  bridge.dispose();
});

test("a decision timeout returns HOLD while leaving the visible request ungranted", async () => {
  const store = new FakeScopeboxStore();
  const scheduled = [];
  const bridge = new ScopeExpansionDecisionBridge(store, {
    timeoutMs: 500,
    setTimeoutFn(callback, milliseconds) {
      const handle = { callback, milliseconds, cancelled: false };
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn(handle) {
      handle.cancelled = true;
    },
  });
  const pending = requestPrice(bridge);
  const timeout = scheduled.find((handle) => handle.milliseconds === 500);
  assert.ok(timeout);

  timeout.callback();
  const result = await pending;

  assert.equal(result.code, "HUMAN_DECISION_TIMEOUT");
  assert.equal(result.hold, true);
  assert.equal(result.requestId, "scope_request_1");
  assert.equal(store.state.scopeVersion, 1);
  assert.equal(store.state.pendingExpansion.id, "scope_request_1");
  bridge.dispose();
});
