---
description: Full database audit -- DELIBERATELY exposes original -> token mapping. Human-only.
---

Audit query results from a database using kakashi. **This command
intentionally exposes plaintext values from the database into the caller's
context.** It is a human-only tool.

## Steps

1. **Warn first, run second.** Before doing anything, tell the caller:

   > "`db-audit` will print every original value from the query alongside
   > its masked token into this conversation. If you're running me from an
   > AI agent, those rows enter the model context. If that is not what you
   > want, use `/kakashi-db-scan` (counts only) instead."

2. Only if the caller confirms — or explicitly typed `/kakashi-db-audit`
   knowing what it means — run:
   ```
   kakashi db-audit "<conn>" -q "<query>" --limit 100
   ```
   Fall back via `npx -y @muhammadatef/kakashi db-audit ...`.
3. Never run `db-audit` unattended (in a cron, a CI job, or a background
   task). It is designed for a human at a local terminal reviewing what
   Kakashi masked.

## Safer alternatives

- `/kakashi-db-scan` — same query, counts only.
- `/kakashi-db-mask` — same query, safe local copy on disk.
- `/kakashi-guard` — release decision when a specific destination is
  involved.

If the caller is asking "did Kakashi catch X?", `db-scan` + inspecting the
masked output usually answers that without exposing plaintext.
