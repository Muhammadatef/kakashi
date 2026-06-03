---
description: Scan a file for sensitive data without modifying it (agent-safe by default)
---

Scan the file $ARGUMENTS using kakashi.

## Steps

1. Run in shell: `kakashi scan "$ARGUMENTS"` (fall back to `npx -y @muhammadatef/kakashi scan "$ARGUMENTS"` if `kakashi` is not on PATH).
2. Show the user only the counts kakashi printed. Do NOT inspect the file
   contents yourself or echo any preview substrings.
3. If findings > 0, recommend: `/kakashi-mask $ARGUMENTS` to apply masking.
4. Do NOT modify the file unless the user explicitly asks to mask.

## Agent-safe by default

`kakashi scan` defaults to counts-only output — it never echoes secret
previews to stdout. That keeps secret substrings out of the agent's LLM
context. The `--verbose` flag would re-enable previews; do NOT pass it
unless the user explicitly asks to see them.

If the user passed an `@`-mention (e.g. `/kakashi-scan @file.py`), the file
body is already in this conversation's context and the privacy goal is
already partially compromised. Tell the user this, then proceed with the scan
so they can mask before any *downstream* LLM share. Next time, recommend they
pass a **path string** instead: `/kakashi-scan /path/to/file.py`.

Use `/kakashi-audit <path>` if the user explicitly wants the full original ->
token mapping (audit deliberately exposes secrets — only run when asked).
