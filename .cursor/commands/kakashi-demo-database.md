---
description: Demonstrate local database-result masking through Cursor Chat
---

# Demo case 3 — protect database query results

Use only Kakashi's offline demonstration adapter. Do not request a real database
connection string and do not expose audit output.

## Run

Run `node demos/demo.js database` from the repository root and wait for its
final PASS line.

## Explain in chat

Explain:

- `db-scan` returns counts without writing rows or printing matched values.
- `db-mask` transforms rows locally before JSONL, JSON, or CSV is written.
- Stable tokens preserve distinct people and relationships across rows.
- The export flow does not modify the source database.
- Production adapters support PostgreSQL, MySQL, MongoDB, Snowflake,
  Databricks, and SQLite; this demo stays offline for reliability.

Show the safe export path `demos/.work/output/masked-customers.csv`, but do not
read generated row contents into the conversation.

End with: `Next: /kakashi-demo-guardian`
