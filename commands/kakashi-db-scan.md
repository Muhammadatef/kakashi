---
description: Scan query results from a database for sensitive data (agent-safe, no rows written)
---

Scan the results of a SQL / NoSQL query using kakashi.

## Steps

1. Parse `$ARGUMENTS` for:
   - the **connection string** (or `mock:customers` for the offline demo)
   - the **query** to run (`-q "SELECT ..."`)
   - an optional **row limit** (`--limit N`, default 10000)
2. Never echo a live production connection string into chat. Prefer an
   environment-variable reference: `$DATABASE_URL`, `%DATABASE_URL%`, or a
   demo adapter (`mock:customers -q demo`).
3. Run in shell:
   ```
   kakashi db-scan "<conn>" -q "<query>" --limit 1000
   ```
   Fall back via `npx -y @muhammadatef/kakashi db-scan ...`.
4. Report: total rows scanned, total findings, category counts. Do NOT echo
   any row value. Never pass `--verbose`.
5. If findings > 0 and the caller wants a safe local copy, offer
   `/kakashi-db-mask` with the same query.
6. Supported adapters: PostgreSQL, MySQL, MongoDB, Snowflake, Databricks,
   SQLite, plus `mock:customers` for demos.

## Why this is agent-safe

Rows never enter the agent's LLM context. `db-scan` returns aggregate counts
and PDPL categories — enough for the caller to decide next steps without
seeing a single row. `db-audit` is the verbose sibling and is human-only.

## Follow-up when it's a release question

If the goal is "may I send these rows to an external model for X?", the
right tool is `/kakashi-guard` after first exporting the query to a masked
local file via `/kakashi-db-mask` — Guardian then applies destination-aware
policy on that artifact.
