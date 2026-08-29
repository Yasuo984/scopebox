# Scopebox v0.1 Validation Record

Validation date: 2026-08-29

## Static and domain checks

Command:

```bash
npm run check
```

Result:

```text
JavaScript syntax checks: PASS
Domain tests: 7 passed, 0 failed
```

Covered behavior:

1. An empty human frame exposes no write-intent capability.
2. A human frame creates a versioned write scope.
3. Scoped edits apply atomically.
4. One out-of-scope field rejects the entire mixed edit.
5. A capability issued under an old scope fails closed after the human changes scope.
6. The agent can request expansion but cannot grant it.
7. Agent review submission remains separate from human acceptance.

## Browser flow smoke test

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

## Deployment verification still required

The remaining release gate is discovery and invocation through ChatGPT's actual built-in browser after deployment to a secure public origin. That check should confirm:

- Site tools discovers the top-level imperative registrations.
- Scope changes cause the visible tool list to update.
- The agent follows the expansion request path without attempting ordinary browser edits outside the frame.
- All five tools return concise, usable results in the live host.
