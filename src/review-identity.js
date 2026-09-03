import { decideReview } from "./domain.js";

let pendingReviewDecisionId = null;

function hold(code, message, extra = {}) {
  return {
    ok: false,
    code,
    message,
    hold: true,
    ...extra,
  };
}

function attachReviewIdentity(outcome, reviewId) {
  if (!outcome?.result?.ok) return outcome;

  const activity = Array.isArray(outcome.state?.activity)
    ? outcome.state.activity.at(-1)
    : null;
  if (activity) {
    activity.details = {
      ...(activity.details ?? {}),
      reviewId,
    };
  }

  outcome.result = {
    ...outcome.result,
    reviewId,
  };
  return outcome;
}

export function bindPendingReviewDecision(reviewId) {
  pendingReviewDecisionId = typeof reviewId === "string" ? reviewId : null;
}

export function consumePendingReviewDecision() {
  const reviewId = pendingReviewDecisionId;
  pendingReviewDecisionId = null;
  return reviewId;
}

export function decideReviewWithIdentity(currentState, decision, expectedReviewId) {
  if (currentState.phase !== "REVIEW" || !currentState.review) {
    return decideReview(currentState, decision);
  }

  const activeReviewId = currentState.review.id;
  if (typeof expectedReviewId !== "string" || expectedReviewId.length === 0) {
    return {
      state: currentState,
      result: hold(
        "REVIEW_ID_REQUIRED",
        "HOLD / REVIEW_ID_REQUIRED: bind the human decision to the review shown on screen.",
        { activeReviewId },
      ),
    };
  }

  if (expectedReviewId !== activeReviewId) {
    return {
      state: currentState,
      result: hold(
        "REVIEW_STALE",
        "HOLD / REVIEW_STALE: the review shown to the human is no longer the active change set. Refresh before deciding.",
        { expectedReviewId, activeReviewId },
      ),
    };
  }

  return attachReviewIdentity(
    decideReview(currentState, decision),
    activeReviewId,
  );
}
