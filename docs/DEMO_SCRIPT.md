# Scopebox 3-Minute Demo Script

Target runtime: 2 minutes 25 seconds. Leave margin for pauses and platform transitions.

## 0:00 to 0:15 · The problem

**Visual:** Launch Board with no fields framed. Right rail shows read tools only.

**Voice:**

> Agents are useful when they can act, but today's permission choices are often all or nothing. Scopebox lets a person draw the write boundary directly on the live page.

## 0:15 to 0:32 · Human frames the work

**Visual:** Human toggles Headline and Description. Both cards receive the blue frame. `edit_scoped_fields` appears in the capability surface.

**Voice:**

> I am giving the agent two fields, not the whole board. WebMCP now exposes an edit tool whose schema contains only Headline and Description.

## 0:32 to 0:43 · Prompt

Send:

> Prepare this board for the September 12 launch. Improve the copy, fix anything that blocks the brief, and submit the result for my review. Do not change the audience or price.

## 0:43 to 1:08 · Agent works inside the frame

**Visual:** Agent calls `inspect_workspace`, `inspect_active_scope`, and `edit_scoped_fields`. Headline and Description update. Diff appears. Audience, price, and date remain untouched.

**Voice:**

> The agent can read the whole shared page, but it can write only inside the human frame. The change is visible immediately.

## 1:08 to 1:30 · Agent encounters a real boundary

**Visual:** Agent notices the brief targets September 12 while Launch date says September 18. It calls `request_scope_expansion`. The amber human-decision card appears.

**Voice:**

> The date blocks the task, but the agent does not silently widen its authority. It asks for one additional field and explains why. The request changes no permission.

## 1:30 to 1:47 · Human expands the scope

**Visual:** Human clicks Expand scope. Scope changes from v1 to v2. Launch date receives the frame. The edit tool disappears and reappears with the new schema.

**Voice:**

> I approve the expansion. Scopebox increments the scope version and issues a new capability. Any old call now fails closed as `HOLD / SCOPE_STALE`.

## 1:47 to 2:06 · Agent completes and submits

**Visual:** Agent changes Launch date to September 12 and calls `submit_changes_for_review`. Write tools disappear. Review card appears.

**Voice:**

> The agent completes the bounded work and freezes a review diff. Submission is not acceptance.

## 2:06 to 2:25 · Human closes the loop

**Visual:** Human reviews all three changes and clicks Accept change set. Accepted state and complete activity history remain visible.

**Voice:**

> The human keeps the final decision. Scopebox turns a visible page selection into a live agent capability: the agent can only touch what the human frames.

## Capture checklist

- Start from Reset demo.
- Keep the browser wide enough to show board and capability rail together.
- Open Site tools once before the prompt so judges see real registration.
- Pause briefly when `edit_scoped_fields` appears.
- Pause on the expansion request and v1 to v2 transition.
- Show the final activity history.
- Keep the full video below three minutes.
