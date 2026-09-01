# Scopebox v0.1 Validation Record

Validation dates:

- 2026-08-29 JST — initial static/domain and local browser validation
- 2026-09-02 JST — ChatGPT built-in browser / real Site tools validation

## Static and domain checks

Initial command:

```bash
npm run check
```

Initial result:

```text
JavaScript syntax checks: PASS
Domain tests: 7 passed, 0 failed
```

Initial covered behavior:

1. An empty human frame exposes no write-intent capability.
2. A human frame creates a versioned write scope.
3. Scoped edits apply atomically.
4. One out-of-scope field rejects the entire mixed edit.
5. A capability issued under an old scope fails closed after the human changes scope.
6. The agent can request expansion but cannot grant it.
7. Agent review submission remains separate from human acceptance.

Feature branch `feature/review-stale-guard` adds three review-identity tests covering:

8. Human acceptance bound to the exact active `reviewId`.
9. Missing review identity fails closed with `HOLD / REVIEW_ID_REQUIRED` and no mutation.
10. An older review identity fails closed with `HOLD / REVIEW_STALE` and no mutation.

A branch `npm run check` result of 10 passed / 0 failed was recorded before the live browser timing fix described below. Run `npm run check` once more after the final browser-binding fix before merging PR #3.

## Local browser flow smoke test

The complete UI path was exercised in headless Chromium using the same application modules and the same local tool handlers used by WebMCP.

Observed sequence:

```text
DRAFT / scope v0 / read tools only
-> human frames Headline and Description
DRAFT / scope v1 / scoped edit + expansion request tools
-> agent edits copy atomically
-> agent requests Launch date
DRAFT / scope v1 / human decision pending / permission unchanged
-> human approves
DRAFT / scope v2 / Launch date added
-> agent edits Launch date
-> agent submits review
REVIEW / write tools removed
-> human accepts
ACCEPTED / read tools only / frame preserved in history
```

Final assertions:

```text
phase: ACCEPTED
scopeVersion: 2
scope: description, headline, launch_date
available tools: inspect_workspace, inspect_active_scope
JavaScript console errors: 0
page errors: 0
```

## ChatGPT built-in browser / real WebMCP validation

Environment:

```text
ChatGPT desktop app built-in browser
Site tools: enabled
Origin: http://127.0.0.1:4173/
Scopebox mode: normal route, not the local tool simulator
```

Observed live behavior:

1. `Scope v0` registered only the two read tools:
   - `inspect_workspace`
   - `inspect_active_scope`
2. Human framed **Headline** and **Description**.
3. Scope moved to `v1`, and the live Site tool surface expanded to four tools:
   - `inspect_workspace`
   - `inspect_active_scope`
   - `edit_scoped_fields`
   - `request_scope_expansion`
4. ChatGPT Work successfully invoked the actual Site tools after the prompt explicitly referenced the current built-in-browser page and Site tools / WebMCP.
5. The agent correctly reported that only **Headline** and **Description** were writable and made no edits during the read-only inspection step.
6. The agent then used `edit_scoped_fields` to change only the framed fields. Out-of-scope fields remained unchanged.
7. Once changes existed, `submit_changes_for_review` appeared dynamically, producing a five-tool live surface.
8. The agent detected that the brief required September 12 while **Launch date** was still September 18 and read-only.
9. The agent called `request_scope_expansion` instead of editing the blocked field.
10. Scopebox displayed **Human decision required** with `Keep current scope` and `Expand scope` controls.
11. While the request was pending, the live capability surface contracted and the duplicate expansion-request capability was unavailable.
12. Human approved the request. Scope advanced to `v2`, and **Launch date** became writable.
13. The agent edited **Launch date** to September 12 without changing the still-read-only fields.
14. The agent submitted the current change set for Human review.
15. Scopebox entered `REVIEW`; all write tools disappeared and only the read tools remained registered.
16. The framed fields remained visibly preserved while the exact diff was shown for Human review.
17. Human selected `Accept change set`; Scopebox entered `ACCEPTED` and kept write tools closed.

This validates the core live relationship:

```text
Human visual selection
-> page state
-> live WebMCP capability surface
-> bounded Agent action
-> Agent scope request
-> Human grant
-> reissued capability
-> Agent continuation
-> frozen review
-> Human acceptance
```

## Review identity binding validation

PR #3 adds an exact `reviewId` binding for Human review decisions.

Intended invariant:

```text
scopeVersion = which capability boundary the agent acted under
reviewId     = which frozen change set the Human decided on
```

Automated negative tests cover `REVIEW_ID_REQUIRED` and `REVIEW_STALE` with no state mutation.

The first live Mac built-in-browser Accept test produced a false HOLD on the normal path. Investigation found that the temporary rendered `reviewId` binding was being cleared with `queueMicrotask`, which could clear the identity before the button's own Accept handler consumed it in this browser host.

The browser-binding cleanup was changed to the next task with `setTimeout(..., 0)`, preserving the rendered review identity through the complete click dispatch.

After that fix, the same live built-in-browser Human Accept path succeeded and Scopebox reached `ACCEPTED`.

The `reviewId` does not need to be prominently displayed in the normal Human UI. Its role is to bind the visible frozen change set to the exact Human decision below the surface.

## Remaining validation before merge / deployment

Before merging PR #3:

- Run `npm run check` again after the final browser-binding fix.
- Exercise both normal `Accept change set` and `Return to draft` once on the final branch head.
- Keep the PR Draft until those checks are recorded.

Before public Challenge submission:

- Verify the same Site tools behavior on the protected Vercel Preview / secure deployed origin.
- Verify HTTP/security headers on the deployed origin.
- Confirm no deployment, publication, or broader repository access is granted implicitly.
- Rehearse the final three-minute Human + Scopebox + ChatGPT demo path.
