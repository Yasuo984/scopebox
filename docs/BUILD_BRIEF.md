# Scopebox v0.1 Build Brief

## 1. Product contract

**Name:** Scopebox  
**Tagline:** The agent can only touch what the human frames.  
**Demo object:** Six-field Launch Board  
**Primary relationship:** A human-selected page scope becomes the agent's current WebMCP write capability.

Scopebox must make the capability boundary visible to both parties. The human sees which fields are framed. The agent discovers a tool schema containing only those fields. If the task requires more, the agent can explain why and request expansion. The human alone decides.

## 2. User story

A human wants agent help preparing a launch board but does not want to hand over the entire board.

The human frames Headline and Description. The agent improves them. The launch brief says September 12, while Launch date says September 18. The agent cannot change that field, so it requests expansion. The human approves. The page issues a new write capability under a new scope version. The agent fixes the date and submits a diff. The human accepts.

## 3. Fixed fields

| ID | Label | Initial value | Maximum |
| --- | --- | --- | ---: |
| `product_name` | Product name | Kumo One | 60 |
| `headline` | Headline | A better bag for every day | 80 |
| `description` | Description | A lightweight everyday bag for work, travel, and everything in between. | 180 |
| `audience` | Audience | Design-conscious city commuters | 100 |
| `launch_date` | Launch date | 2026-09-18 | 10 |
| `price` | Price | ¥24,800 | 30 |

The visible brief targets `2026-09-12` and asks that audience and price remain unchanged.

## 4. State model

```text
phase: DRAFT | REVIEW | ACCEPTED
scope: field_id[]
scopeVersion: integer, starts at 0
pendingExpansion: null | request
fields: current values
baselineFields: initial values
review: null | frozen diff
activity: bounded shared history
```

### Human scope transition

```text
scope changes
-> scopeVersion increments
-> pending expansion is cleared
-> obsolete dynamic tools are unregistered
-> tools valid for the new state are registered
```

### Review transition

```text
DRAFT + changes + no pending request
-> agent submits review
-> REVIEW
-> write tools unavailable
-> human accepts -> ACCEPTED
-> human returns -> DRAFT
```

## 5. WebMCP tool contract

### `inspect_workspace`

Always available. Read-only.

Returns:

- launch brief
- all current field values
- read or write access per field
- scope version
- pending expansion summary
- current diff

### `inspect_active_scope`

Always available. Read-only.

Returns:

- exact scope version
- editable fields
- read-only fields
- whether a human decision is pending

### `edit_scoped_fields`

Available only in Draft with a non-empty scope.

Its JSON Schema is generated from the current scope. The nested `updates` object contains only currently framed properties. The tool closure also captures the issuing scope version.

Code checks, in order:

1. Phase is Draft.
2. supplied scope version equals current scope version.
3. issuing scope version equals current scope version.
4. every field exists.
5. every field is in scope.
6. every value passes field validation.
7. apply all changes atomically.

Any stale or out-of-scope request applies no values.

### `request_scope_expansion`

Available only in Draft when blocked fields remain and no request is pending.

Input:

- current scope version
- one or more blocked field IDs
- concise reason

Effect:

- creates a visible request
- leaves scope and capability unchanged
- waits for a human UI decision

### `submit_changes_for_review`

Available only in Draft when changes exist and no expansion is pending.

Effect:

- freezes the current diff
- changes phase to Review
- does not accept, publish, purchase, deploy, or send anything

## 6. UI contract

### Launch Board

- Every field is visible at all times.
- Each field has a human-controlled Frame toggle.
- Framed cards receive a visible corner-frame treatment.
- Humans can edit fields directly while in Draft.
- Review and Accepted phases lock direct field editing.

### Capability surface

The right rail lists the tools valid for the current state. It also indicates whether WebMCP registration is live or whether the app is displaying the expected surface in preview mode.

### Scope expansion

A request appears inside the shared page with:

- requested fields
- agent reason
- Keep current scope
- Expand scope

No agent-callable grant tool exists.

### Review

The review card shows a before and after diff. Human actions are:

- Return to draft
- Accept change set

## 7. Failure semantics

| Code | Meaning | Required behavior |
| --- | --- | --- |
| `SCOPE_STALE` | Human changed scope after capability issue | Fail closed, apply nothing, tell agent to inspect again. |
| `OUT_OF_SCOPE` | Update includes an unframed field | Fail closed and apply none of the supplied updates. |
| `EXPANSION_PENDING` | Another request waits for the human | Do not create a second request. |
| `HUMAN_DECISION_PENDING` | Review attempted while request is pending | Hold review submission. |
| `BOARD_NOT_DRAFT` | Write attempted during Review or Accepted | Reject without mutation. |

## 8. Non-goals

- real product publishing
- real deployment
- credentials or identity
- server-side persistence
- generic policy language
- nested scopes
- multiple agents
- multiple simultaneous humans
- background execution
- arbitrary field creation

## 9. Completion criteria

Scopebox v0.1 is complete when all statements below are true.

1. The normal page works without WebMCP.
2. The top-level page registers imperative WebMCP tools when supported.
3. The available write tool surface changes with human scope and page phase.
4. The edit schema includes only the current scoped fields.
5. A stale capability returns `HOLD / SCOPE_STALE`.
6. Mixed in-scope and out-of-scope edits are all-or-nothing.
7. The agent cannot approve its own expansion request.
8. Human expansion increments the scope version.
9. Agent review submission does not equal human acceptance.
10. The complete demo can be exercised with the hidden local simulator.
11. `npm run check` passes.
12. The repository contains an open-source license and deployment headers.
