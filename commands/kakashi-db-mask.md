---
description: Run a query, mask rows locally, write a safe copy (CSV / JSON / JSONL) -- source DB untouched
---

Mask rows from a database query using kakashi.

## Steps

1. Parse `$ARGUMENTS` for:
   - **connection string** (or `mock:customers`)
   - **query** (`-q "SELECT ..."`)
   - **output path** (`-o path/to/masked.csv`) — default `masked_query.jsonl`
   - **format** (`-f jsonl | json | csv`) — default `jsonl`
   - optional `--limit N`
2. Never echo a live production connection string. Prefer
   `$DATABASE_URL` or `mock:customers -q demo` for demos.
3. Run in shell:
   ```
   kakashi db-mask "<conn>" -q "<query>" -f csv -o masked_customers.csv --limit 1000
   ```
   Fall back via `npx -y @muhammadatef/kakashi db-mask ...`.
4. Report:
   - Rows fetched, replacements made, category counts.
   - Output path (never open the file to display its contents in chat).
5. Recommend the caller share the masked CSV, not the source DB rows.
6. The source database is never written to. `db-mask` is read-only on the
   database side — the only artifact is the local masked copy.

## Why not just export and mask separately

`db-mask` streams rows through the masker as they arrive from the database.
Nothing hits disk unmasked, nothing enters the agent context. That is
stronger than "export raw CSV → then mask" because the intermediate CSV
never exists.

## Companion commands

- `/kakashi-db-scan` — counts-only preview of the same query.
- `/kakashi-guard` — for a destination-aware release decision on the masked
  file (`kakashi guard masked_customers.csv --destination external_model ...`).
