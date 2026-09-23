---
description: Demonstrate the loopback agent privacy sidecar through Cursor Chat
---

# Demo case 5 — give Cursor a standing privacy gate

## Run

Run `node demos/demo.js sidecar` from the repository root. Let the harness start
and stop the service; do not start a second background daemon.

## Explain in chat

Explain:

- The service binds only to the local loopback interface.
- `/health` proves the process is live.
- `/scan` returns categories and counts without matched values.
- `/mask` writes a protected artifact for an agent to use.
- The sidecar makes no outbound network calls.
- The ephemeral port avoids conflicts and proves a real service was started.

End with: `Next: /kakashi-demo-operations`
