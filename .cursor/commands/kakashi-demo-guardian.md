---
description: Demonstrate Guardian transformation and fail-closed approval in Cursor Chat
---

# Demo case 4 — Guardian decides what Cursor may receive

Never open or attach the generated source resources. Do not invent or simulate a
human approval.

## Run

Run `node demos/demo.js guardian` from the repository root and wait for its
final PASS line.

## Explain in chat

Explain Guardian's loop in this order:

1. Observe the resource.
2. Understand the declared task.
3. Assess contextual risk.
4. Plan the minimum necessary transformation.
5. Apply deterministic policy.
6. Act, re-scan the written artifact, and replan or fail closed.

Then contrast the two demonstrated outcomes:

- The analytics request returns `ALLOW_WITH_TRANSFORMATION`; Cursor may use only
  the verified `releasePath`.
- The authentication-secret request returns `REQUIRE_APPROVAL` or `BLOCK`; no
  artifact is released and Cursor must stop.

State the risk score and decisions from terminal output. Do not read the source
or audit values.

End with: `Next: /kakashi-demo-sidecar`
