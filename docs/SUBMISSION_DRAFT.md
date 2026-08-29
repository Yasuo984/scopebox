# Devpost Submission Draft

## Project name

Scopebox

## Tagline

The agent can only touch what the human frames.

## One-sentence pitch

Scopebox turns the fields a human selects on a live web page into the agent's exact, versioned WebMCP write capability.

## What it does

Scopebox is a shared Launch Board for a human and an agent. The human frames the fields the agent may edit. The page dynamically exposes a WebMCP edit tool containing only those fields. When the agent discovers that another field is needed, it can create a visible scope-expansion request, but it cannot approve the request itself. Human approval increments the scope version and causes the page to issue a new capability. Old capabilities fail closed. The agent can then submit a visible diff, while final acceptance remains a separate human action.

## The problem

Agent permissions are usually hidden in settings, expressed as broad app-level grants, or enforced only after an attempted action. That makes it difficult for a person to understand the current action boundary while collaborating on a live page.

Scopebox makes the boundary spatial, immediate, and shared. The same frame a person sees becomes the tool surface the agent discovers.

## How WebMCP is used

Scopebox uses the imperative WebMCP API in the top-level page.

- `inspect_workspace` and `inspect_active_scope` remain available for shared context.
- `edit_scoped_fields` is dynamically registered only when a human scope exists.
- Its input schema is generated from the currently framed fields.
- `request_scope_expansion` is available only when blocked fields remain and no request is pending.
- `submit_changes_for_review` appears only after a valid change set exists.
- Obsolete tool registrations are removed through `AbortController`.
- Every dynamic write tool is bound to an exact scope version.

This is not a normal API with a WebMCP wrapper. The changing WebMCP capability surface is the product interaction.

## What is novel

Scopebox treats human selection as capability issuance.

The agent does not receive a static permission plus a written instruction to behave. It receives a tool whose actual schema matches the human's current frame. When the human changes the frame, the old capability becomes stale. When the agent needs more, it returns the boundary to the human as structured work.

## Safety and trust

- Humans alone grant scope expansion.
- Mixed in-scope and out-of-scope updates are rejected atomically.
- Stale calls return `HOLD / SCOPE_STALE`.
- Review submission is separate from human acceptance.
- All changes and decisions remain visible in the shared page history.
- The demo has no backend, credentials, external APIs, or real-world side effects.

## Built with

- WebMCP Imperative API
- semantic HTML
- modern CSS
- dependency-free JavaScript
- Node.js built-in test runner
- localStorage

## Suggested category language

Human-agent collaboration, agent safety, capability design, productivity, open web.
