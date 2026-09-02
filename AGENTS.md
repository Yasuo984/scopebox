# Scopebox repository instructions

## Product sentence

The agent can only touch what the human frames.

## Fixed demo

Use the six-field Launch Board and this path:

1. Human frames Headline and Description.
2. Agent inspects.
3. Agent edits those two fields.
4. Agent requests Launch date because the brief targets September 12 while the board shows September 18.
5. Human approves.
6. Agent edits Launch date.
7. Agent submits changes for human review.
8. Human accepts.

## Non-negotiable behavior

- Scope changes only through a human UI action.
- `request_scope_expansion` creates a request only. It never grants access.
- Every dynamic write capability is bound to an exact `scopeVersion`.
- A stale capability returns `HOLD / SCOPE_STALE` and applies no changes.
- An update containing any out-of-scope field applies nothing.
- Review submission does not equal human acceptance.
- Every Human review decision is bound to the exact rendered `reviewId`.
- A missing review identity returns `HOLD / REVIEW_ID_REQUIRED`; a mismatched identity returns `HOLD / REVIEW_STALE`; neither changes state.
- Launch Board content values are canonical display outputs, not directly editable form controls.
- Agent content changes may enter state only through the currently registered `edit_scoped_fields` capability.
- A browser-only DOM mutation must never become visible canonical state, diff, or review content.
- Tool results must be concise and verification-friendly.
- The normal human interface must remain usable without WebMCP for framing, decisions, and review.

## Technical boundaries

- Keep the app static, framework-free, and dependency-free unless a concrete compatibility problem requires otherwise.
- Register WebMCP tools with JavaScript in the top-level page.
- Dynamically register tools only when they are useful in the current page state.
- Unregister obsolete tools through `AbortController`.
- Validate all binary authorization rules in code, not only in JSON Schema.
- Preserve `readOnlyHint` and `untrustedContentHint` annotations.
- Keep tool names under 30 characters and outputs compact.
- The local simulator must invoke the same state handlers as WebMCP; it must not re-enable direct field editing.

## Do not add in v0.1

- authentication
- multiple users or organizations
- a backend or database
- generic workflow construction
- external service integration
- autonomous scope expansion
- publishing or deployment effects
- a chat interface inside the app

## Required checks

Run before declaring a change complete:

```bash
npm run check
```

For UI changes, exercise the complete path at `/?debug=1` and verify the normal route remains free of simulator controls.
