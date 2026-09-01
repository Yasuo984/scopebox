import { bindPendingReviewDecision } from "./review-identity.js";

const REVIEW_DECISION_LABELS = new Set([
  "Return to draft",
  "Accept change set",
  "Accept review",
]);

function getActiveReviewId() {
  const state = globalThis.scopebox?.getState?.();
  return state?.phase === "REVIEW" && typeof state.review?.id === "string"
    ? state.review.id
    : null;
}

function decorateReviewControls() {
  const reviewId = getActiveReviewId();
  if (!reviewId) return;

  const buttons = document.querySelectorAll(
    "#decision-zone .decision-actions button, #debug-actions button",
  );
  for (const button of buttons) {
    if (REVIEW_DECISION_LABELS.has(button.textContent.trim())) {
      button.dataset.reviewId = reviewId;
    }
  }
}

const observer = new MutationObserver(() => decorateReviewControls());
observer.observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener(
  "click",
  (event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest("button[data-review-id]")
        : null;
    if (!button) return;

    bindPendingReviewDecision(button.dataset.reviewId);
    queueMicrotask(() => bindPendingReviewDecision(null));
  },
  true,
);

queueMicrotask(() => decorateReviewControls());
globalThis.addEventListener("beforeunload", () => observer.disconnect(), { once: true });
