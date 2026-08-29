import test from "node:test";
import assert from "node:assert/strict";

import {
  createInitialState,
  decideReview,
  decideScopeExpansion,
  deriveState,
  editScopedFields,
  requestScopeExpansion,
  setHumanScope,
  submitChangesForReview,
} from "../src/domain.js";

function frameCopy(state) {
  return setHumanScope(state, ["headline", "description"]).state;
}

test("an empty human frame exposes no write-intent capability", () => {
  const initial = createInitialState();
  const derived = deriveState(initial);

  assert.equal(derived.canEdit, false);
  assert.equal(derived.canRequestExpansion, false);
});

test("the human frame creates a versioned write scope", () => {
  const initial = createInitialState();
  const outcome = setHumanScope(initial, ["headline", "description"]);

  assert.equal(outcome.result.ok, true);
  assert.equal(outcome.state.scopeVersion, 1);
  assert.deepEqual(outcome.state.scope, ["description", "headline"]);
  assert.equal(deriveState(outcome.state).canEdit, true);
});

test("scoped edits succeed atomically", () => {
  const scoped = frameCopy(createInitialState());
  const outcome = editScopedFields(
    scoped,
    {
      scopeVersion: 1,
      updates: {
        headline: "Carry light. Move freely.",
        description: "A quiet carry for city commutes and short trips.",
      },
    },
    1,
  );

  assert.equal(outcome.result.code, "SCOPED_EDIT_APPLIED");
  assert.equal(outcome.state.fields.headline, "Carry light. Move freely.");
  assert.equal(outcome.state.fields.description, "A quiet carry for city commutes and short trips.");
  assert.equal(deriveState(outcome.state).diff.length, 2);
});

test("one out-of-scope field rejects the whole edit", () => {
  const scoped = frameCopy(createInitialState());
  const originalHeadline = scoped.fields.headline;
  const originalDate = scoped.fields.launch_date;

  const outcome = editScopedFields(
    scoped,
    {
      scopeVersion: 1,
      updates: {
        headline: "This must not partially apply",
        launch_date: "2026-09-12",
      },
    },
    1,
  );

  assert.equal(outcome.result.code, "OUT_OF_SCOPE");
  assert.equal(outcome.result.hold, true);
  assert.equal(outcome.state.fields.headline, originalHeadline);
  assert.equal(outcome.state.fields.launch_date, originalDate);
});

test("an old capability fails closed after the human changes scope", () => {
  const scopedV1 = frameCopy(createInitialState());
  const scopedV2 = setHumanScope(scopedV1, ["headline"]).state;

  const outcome = editScopedFields(
    scopedV2,
    {
      scopeVersion: 1,
      updates: { headline: "Old capability" },
    },
    1,
  );

  assert.equal(scopedV2.scopeVersion, 2);
  assert.equal(outcome.result.code, "SCOPE_STALE");
  assert.equal(outcome.result.hold, true);
  assert.equal(outcome.state.fields.headline, scopedV2.fields.headline);
});

test("the agent can request expansion but cannot grant it", () => {
  const scoped = frameCopy(createInitialState());
  const requested = requestScopeExpansion(
    scoped,
    {
      scopeVersion: 1,
      fields: ["launch_date"],
      reason: "The brief and the current launch date conflict.",
    },
    1,
  );

  assert.equal(requested.result.code, "EXPANSION_REQUESTED");
  assert.deepEqual(requested.state.scope, ["description", "headline"]);
  assert.deepEqual(requested.state.pendingExpansion.fields, ["launch_date"]);

  const approved = decideScopeExpansion(requested.state, "approve");
  assert.equal(approved.result.code, "EXPANSION_APPROVED");
  assert.equal(approved.state.scopeVersion, 2);
  assert.deepEqual(approved.state.scope, ["description", "headline", "launch_date"]);
});

test("review submission remains separate from human acceptance", () => {
  const scoped = frameCopy(createInitialState());
  const edited = editScopedFields(
    scoped,
    {
      scopeVersion: 1,
      updates: { headline: "Carry light. Move freely." },
    },
    1,
  ).state;

  const submitted = submitChangesForReview(
    edited,
    { scopeVersion: 1 },
    1,
  );
  assert.equal(submitted.result.code, "REVIEW_SUBMITTED");
  assert.equal(submitted.state.phase, "REVIEW");
  assert.equal(submitted.state.acceptedAt, null);

  const accepted = decideReview(submitted.state, "accept");
  assert.equal(accepted.result.code, "REVIEW_ACCEPTED");
  assert.equal(accepted.state.phase, "ACCEPTED");
  assert.ok(accepted.state.acceptedAt);
});
