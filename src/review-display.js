const REVIEW_PREFIX = "review_";
const ACTIVITY_LIMIT = 10;

export function formatReviewReference(reviewId) {
  if (typeof reviewId !== "string") return null;

  const exact = reviewId.trim();
  if (!exact) return null;

  const withoutPrefix = exact.startsWith(REVIEW_PREFIX)
    ? exact.slice(REVIEW_PREFIX.length)
    : exact;
  const compact = withoutPrefix.replace(/[-_]/g, "").toUpperCase();
  if (!compact) return null;

  const short =
    compact.length <= 10
      ? compact
      : `${compact.slice(0, 4)}…${compact.slice(-4)}`;
  return `REVIEW ${short}`;
}

function createReviewReference(reviewId, variant) {
  const label = formatReviewReference(reviewId);
  if (!label) return null;

  const reference = document.createElement("span");
  reference.className = `review-reference ${variant}`;
  reference.dataset.reviewId = reviewId;
  reference.textContent = label;
  reference.title = reviewId;
  reference.setAttribute("aria-label", `Review identity ${reviewId}`);
  return reference;
}

function syncReference(container, reviewId, variant, beforeNode = null) {
  const selector = `.review-reference.${variant}`;
  const existing = container.querySelector(selector);

  if (typeof reviewId !== "string" || !reviewId) {
    existing?.remove();
    return;
  }

  if (existing?.dataset.reviewId === reviewId) return;

  const reference = createReviewReference(reviewId, variant);
  if (!reference) {
    existing?.remove();
    return;
  }

  if (existing) {
    existing.replaceWith(reference);
  } else if (beforeNode) {
    container.insertBefore(reference, beforeNode);
  } else {
    container.append(reference);
  }
}

function decorateDecisionCard(state) {
  const card = document.querySelector("#decision-zone .decision-card");
  const copy = card?.querySelector(".decision-header > div:first-child");
  const kicker = copy?.querySelector(".decision-kicker");
  if (!copy || !kicker) return;

  const reviewId =
    ["REVIEW", "ACCEPTED"].includes(state.phase) &&
    typeof state.review?.id === "string"
      ? state.review.id
      : null;

  const existing = copy.querySelector(
    ".review-reference.decision-review-reference",
  );
  if (!reviewId) {
    existing?.remove();
    return;
  }

  if (existing?.dataset.reviewId === reviewId) return;

  const reference = createReviewReference(
    reviewId,
    "decision-review-reference",
  );
  if (!reference) return;

  if (existing) {
    existing.replaceWith(reference);
  } else {
    kicker.insertAdjacentElement("afterend", reference);
  }
}

function decorateActivity(state) {
  const recent = Array.isArray(state.activity)
    ? [...state.activity].reverse().slice(0, ACTIVITY_LIMIT)
    : [];
  const items = document.querySelectorAll("#activity-list .activity-item");

  for (const [index, item] of [...items].entries()) {
    const copy = item.querySelector(".activity-copy");
    if (!copy) continue;

    const reviewId = recent[index]?.details?.reviewId;
    const time = copy.querySelector("time");
    syncReference(
      copy,
      typeof reviewId === "string" ? reviewId : null,
      "activity-review-reference",
      time,
    );
  }
}

function decorateReviewReferences() {
  const state = globalThis.scopebox?.getState?.();
  if (!state) return;

  decorateDecisionCard(state);
  decorateActivity(state);
}

function startReviewReferenceDisplay() {
  const roots = [
    document.querySelector("#decision-zone"),
    document.querySelector("#activity-list"),
  ].filter(Boolean);
  if (roots.length === 0) return;

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      decorateReviewReferences();
    });
  };

  const observer = new MutationObserver(schedule);
  for (const root of roots) {
    observer.observe(root, { childList: true, subtree: true });
  }

  schedule();
  globalThis.setTimeout(schedule, 0);
  globalThis.addEventListener(
    "beforeunload",
    () => observer.disconnect(),
    { once: true },
  );
}

if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
  startReviewReferenceDisplay();
}
