---
description: Demonstrate file scanning and masking entirely through Cursor Chat
---

# Demo case 1 — protect a file before an AI receives it

Do not open, attach, quote, or summarize anything under `demos/.work/input/`.

## Run

Run `node demos/demo.js files` from the repository root. Wait for completion.
Exit code `1` printed by an internal scan is an expected detection result; the
demo command itself must finish successfully and print its final PASS line.

## Explain in chat

Using only the safe terminal output, explain:

- `scan` gives counts without exposing matched values.
- `audit` is human-only and its output was intentionally hidden from chat.
- Typed tokens preserve relationships, redact removes values, and fake mode
  replaces source values while keeping realistic data shape.
- The typed and redacted artifacts were re-scanned before release.
- A whitelist preserves only an explicitly approved value.

Show the protected artifact path, but do not read its contents into chat.

End with: `Next: /kakashi-demo-folder`
