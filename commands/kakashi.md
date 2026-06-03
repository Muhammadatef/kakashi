---
description: Activate Kakashi privacy mode -- scan and mask before sharing files
---

You are now in Kakashi privacy mode for this session.

From this point on, before sharing, pasting, uploading, or sending ANY file
content to an external service, LLM API, or user outside this session:

1. Run `kakashi scan <path>` first.
2. If findings > 0, run `kakashi mask <path>` and use `masked_<file>` instead.
3. Never paste raw file contents that contain credentials, IDs, passports,
   emails, phone numbers, or personal records.

If `kakashi` is not on PATH, use `npx -y @muhammadatef/kakashi` instead.

## Important -- agent-safe invocation

When the user invokes a Kakashi slash command, **prefer a path string over an
`@`-mention**. In Cursor, an `@`-mention attaches the file body to the LLM
context *before* Kakashi runs, which defeats the privacy goal.

If the user has already used `@<file>` in their message, you MUST:
1. Note this back to the user: "I see the file body was already attached via
   `@`-mention; the secrets are already in this conversation's context."
2. Still run `kakashi mask` so they can share the masked version downstream.
3. Recommend they invoke Kakashi via path string next time, e.g.:
   `/kakashi-mask /path/to/file.env`

## Slash commands available in this session

- `/kakashi-scan <path>`   -- counts only, no secret previews (agent-safe by default)
- `/kakashi-mask <path>`   -- write masked_<file> alongside the original
- `/kakashi-audit <path>`  -- full original -> replacement mapping (DELIBERATELY exposes secrets)
- `/kakashi-stats`         -- cumulative session stats
- `/kakashi-list`          -- show every active detection pattern

Acknowledge: "Kakashi privacy mode active. I'll scan files before sharing."
