import test from "node:test";
import assert from "node:assert/strict";

import {
  createInitialState,
  editScopedFields,
  setHumanScope,
  submitChangesForReview,
} from "../src/domain.js";
import { decideReviewWithIdentity } from "../src/review-identity.js";

function createSubmittedReview() {
  const scoped = setHumanScope(createInitialState(), ["headline", "description"]).state;
  const edited = editScopedFields(
    scoped,
    {
      scopeVersion: scoped.scopeVersion,
      updates: { headline: "Carry light. Move freely." },
    },
    scoped.scopeVersion,
  ).state;

  return submitChangesForReview(
    edited,
    { scopeVersion: edited.scopeVersion },
    edited.scopeVersion,
  ).state;
}

test("human acceptance is bound to the exact active review ID", () => {
  const submitted = createSubmittedReview();
  const accepted = decideReviewWithIdentity(
    submitted,
    "accept",
    submitted.review.id,
  );

  assert.equal(accepted.result.code, "REVIEW_ACCEPTED");
  assert.equal(accepted.state.phase, "ACCEPTED");
  assert.ok(accepted.state.acceptedAt);
});

test("a review decision without an identity fails closed", () => {
  const submitted = createSubmittedReview();
  const before = structuredClone(submitted);
  const outcome = decideReviewWithIdentity(submitted, "accept", null);

  assert.equal(outcome.result.code, "REVIEW_ID_REQUIRED");
  assert.equal(outcome.result.hold, true);
  assert.deepEqual(outcome.state, before);
});

test("an old review decision cannot be applied to a newer change set", () => {
  const firstReview = createSubmittedReview();
  const firstReviewId = firstReview.review.id;

  const returned = decideReviewWithIdentity(
    firstReview,
    "return",
    firstReviewId,
  ).state;
  const secondReview = submitChangesForReview(
    returned,
    { scopeVersion: returned.scopeVersion },
    returned.scopeVersion,
  ).state;
  const secondReviewId = secondReview.review.id;
  const before = structuredClone(secondReview);

  assert.notEqual(secondReviewId, firstReviewId);

  const stale = decideReviewWithIdentity(
    secondReview,
    "accept",
    firstReviewId,
  );

  assert.equal(stale.result.code, "REVIEW_STALE");
  assert.equal(stale.result.hold, true);
  assert.equal(stale.result.expectedReviewId, firstReviewId);
  assert.equal(stale.result.activeReviewId, secondReviewId);
  assert.deepEqual(stale.state, before);

  const accepted = decideReviewWithIdentity(
    secondReview,
    "accept",
    secondReviewId,
  );
  assert.equal(accepted.result.code, "REVIEW_ACCEPTED");
  assert.equal(accepted.state.phase, "ACCEPTED");
});
