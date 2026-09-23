# Connect your database or data warehouse to Kakashi

> One-page reference for running Kakashi against Postgres, MySQL, MongoDB,
> Snowflake, Databricks, or SQLite. Everything below is agent-safe by
> default — nothing about your rows leaves your machine.

---

## Mental model — what Kakashi does with a database

```
your laptop                         your database
+-----------+       TCP + TLS      +---------------+
|  kakashi  | -------------------> |  Postgres /   |
|  db-scan  | <------ rows ------- |  Mongo / ...  |
|  db-mask  |                      +---------------+
|           |
|  maskText | (in-process, streaming)
|     |     |
|     v     |
|  masked   |
|  local    |
|   copy    |
+-----------+
```

- Kakashi opens the connection **from your machine**, using standard native
  drivers (`pg`, `mysql2`, `mongodb`, `snowflake-sdk`, `@databricks/sql`,
  `better-sqlite3`). No hosted service, no proxy, no Kakashi-owned server
  is ever in the loop.
- Rows stream one-at-a-time through `maskText()` in the same process.
- The only artifact is a **local file** (`masked_query.csv`, `.jsonl`, or
  `.json`) you own outright.
- The **source database is read-only** — Kakashi never issues a write.

---

## Decision tree — which subcommand?

```mermaid
flowchart TD
  start(["What do you want to do with the query results?"])
  countsOnly[["Just tell me if there's sensitive data"]] --> dbScan[["kakashi db-scan"]]
  safeCopy[["Give me a safe copy I can share"]] --> dbMask[["kakashi db-mask"]]
  provingWork[["Show me every value that was replaced (human at a terminal)"]] --> dbAudit[["kakashi db-audit"]]
  releaseQ[["May I send this to an AI agent / external model?"]] --> guardStep[["kakashi db-mask, then kakashi guard on the masked file"]]

  start --> countsOnly
  start --> safeCopy
  start --> provingWork
  start --> releaseQ
```

- **`db-scan`** — counts + PDPL categories only. Agent-safe. Zero rows land on
  disk or in your chat.
- **`db-mask`** — same query, but streams every row through the masker and
  writes a safe local copy (`.jsonl` / `.json` / `.csv`).
- **`db-audit`** — verbose. Prints every original value alongside its
  replacement token. **Human-only.** Never run in agent chat.
- **`kakashi guard <masked_file> --agent ... --task ... --destination ...`** —
  the release-decision authority. Use `db-mask` first, then `guard` on the
  masked artifact when the question is "may I send this to a model?"

---

## Environment setup — never inline the connection string

Put the credential in an environment variable and let the shell expand it.
An inline connection string in your terminal history — or worse, in an
agent chat log — is itself a leak.

```bash
# macOS / Linux / WSL
export DATABASE_URL="postgres://analyst:s3cret@warehouse.example.com:5432/prod"

# Windows PowerShell
$env:DATABASE_URL = "postgres://analyst:s3cret@warehouse.example.com:5432/prod"
```

Then reference it:

```bash
kakashi db-scan "$DATABASE_URL" -q "SELECT * FROM customers LIMIT 100"
```

**Practising without a real database?** Kakashi ships an offline demo
adapter so you can try the whole flow with zero setup:

```bash
kakashi db-scan  mock:customers -q demo --limit 5
kakashi db-mask  mock:customers -q demo -f csv -o masked_customers.csv --limit 5
```

---

## The six supported drivers

Every driver is **lazy-loaded** — Kakashi's own install stays small and you
only add the client library for the database you actually use. If a driver
package is missing, Kakashi throws a friendly `MODULE_NOT_FOUND` with the
exact `npm install` command to fix it.

### PostgreSQL (also works with pgvector, TimescaleDB, CockroachDB, Aurora)

```bash
npm install pg
```

Connection string:
```
postgres://user:password@host:5432/database
postgresql://user:password@host:5432/database?sslmode=require
```

Example:
```bash
kakashi db-scan "$DATABASE_URL" \
  -q "SELECT id, name, email, phone FROM customers WHERE country='AE'" \
  --limit 500

kakashi db-mask "$DATABASE_URL" \
  -q "SELECT id, name, email, phone FROM customers WHERE country='AE'" \
  -f csv -o masked_customers.csv --limit 500
```

### MySQL / MariaDB

```bash
npm install mysql2
```

Connection string:
```
mysql://user:password@host:3306/database
```

Example:
```bash
kakashi db-mask "mysql://analyst:$MYSQL_PASSWORD@10.0.0.5:3306/hr" \
  -q "SELECT emp_id, full_name, national_id, iban FROM employees" \
  -f jsonl -o masked_employees.jsonl --limit 1000
```

### MongoDB

```bash
npm install mongodb
```

Connection string:
```
mongodb://user:password@host:27017/database
mongodb+srv://user:password@cluster.example.mongodb.net/database
```

**Query is a JSON find-spec, not SQL:**
```bash
kakashi db-scan "$MONGO_URL" \
  -q '{"collection":"customers","filter":{"country":"AE"},"limit":100}'
```

The spec supports `collection`, `filter`, `projection`, and `limit`. Anything
you can express as a `find()` on a collection works here.

### Snowflake

```bash
npm install snowflake-sdk
```

Connection string:
```
snowflake://user:password@account.region.snowflakecomputing.com/database/schema?warehouse=WH_NAME
```

Example:
```bash
kakashi db-scan \
  "snowflake://analyst:$SNOWFLAKE_PASSWORD@acme.eu-central-1.snowflakecomputing.com/PROD/PUBLIC?warehouse=ANALYSIS_WH" \
  -q "SELECT * FROM CUSTOMERS_UAE LIMIT 100"
```

**Snowflake bills per-second on warehouse compute.** Always pass `--limit`
during exploration — a bare `SELECT *` on a large table can burn credits
fast.

### Databricks SQL Warehouse

```bash
npm install @databricks/sql
```

Connection string:
```
databricks://<personal-access-token>@<workspace>.cloud.databricks.com/<http-path>
```

The **HTTP path** is the specific SQL warehouse endpoint. Find it in your
Databricks UI: *SQL Warehouses → your warehouse → Connection details →
HTTP Path* (looks like `/sql/1.0/warehouses/abcdef1234567890`).

Example:
```bash
kakashi db-mask \
  "databricks://$DATABRICKS_TOKEN@acme.cloud.databricks.com/sql/1.0/warehouses/abc123" \
  -q "SELECT customer_id, name, email FROM main.gold.customers LIMIT 1000" \
  -f jsonl -o masked_databricks.jsonl
```

### SQLite (local file or in-memory)

```bash
npm install better-sqlite3
```

Connection "string" is a file path — or `:memory:` for a scratch DB:

```bash
kakashi db-scan  ./local.db  -q "SELECT * FROM users LIMIT 50"
kakashi db-mask  ./local.db  -q "SELECT * FROM users" -f csv -o masked_users.csv
```

---

## Worked example — end-to-end, no real database required

The `mock:customers` adapter ships built-in so you can rehearse the exact
flow you'd run against a live warehouse:

```bash
# 1) Preview: how many findings live in these query results?
kakashi db-scan mock:customers -q demo --limit 5
#    -> 5 rows, ~25 findings across id / pii categories, exit 1

# 2) Write a safe local copy (masked JSONL by default; CSV is one flag away)
kakashi db-mask mock:customers -q demo -f csv \
  -o /tmp/masked_customers.csv --limit 5
#    -> masked file, exit 0

# 3) Re-scan the masked artifact to prove it's clean before sharing
kakashi scan /tmp/masked_customers.csv
#    -> exit 0, no findings

# 4) OPTIONAL: if you want to send those masked rows to an external model,
#    let Guardian make the release decision. It reads the masked file, the
#    stated task, and the destination, then decides ALLOW /
#    ALLOW_WITH_TRANSFORMATION / REQUIRE_APPROVAL / BLOCK.
kakashi guard /tmp/masked_customers.csv \
  --agent cursor \
  --task "calculate churn rate by nationality" \
  --destination external_model \
  --json
#    -> use only the releasePath from the JSON; never the original.
```

Exit codes at a glance — a `1` from a scan is a **detection result**, not a
crash; that is what a CI job wants when a PR introduces a new leak:

| Command | Clean | Findings | Human gate | Block | Error |
| --- | :---: | :---: | :---: | :---: | :---: |
| `db-scan`  | 0 | **1** | — | — | 2 |
| `db-mask`  | **0** | — | — | — | 2 |
| `guard` ALLOW / ALLOW_WITH_TRANSFORMATION | **0** | — | — | — | 2 |
| `guard` REQUIRE_APPROVAL | — | — | **3** | — | 2 |
| `guard` BLOCK | — | — | — | **4** | 2 |

---

## Safety checklist — read before pointing Kakashi at production

1. **Credentials in env vars, never inline.** Never paste a live connection
   string into an agent chat, a screenshot, or a demo recording. Use
   `$DATABASE_URL` / `%DATABASE_URL%`.
2. **Always pass `--limit`** on warehouses that bill per-second on compute
   (Snowflake, Databricks, BigQuery-via-CSV). A bare `SELECT *` can burn
   real money.
3. **Never `db-audit` in agent chat.** It prints every original value into
   your chat, which enters whatever LLM is on the other side. Use `db-scan`
   for a summary or `db-mask` for a safe artifact.
4. **Never `--include-values` on scan-dir reports of DB exports** —
   masked CSVs are safe to share; a values-included report is not.
5. **Masked output lives beside the source** as `masked_<name>`. The source
   database is never written to; the local masked file is what you share.
6. **For a release question, use Guardian.** `db-mask` produces a safe copy;
   `kakashi guard <masked_file> ...` is what decides whether it may be sent
   to a specific destination for a specific task, and never self-approves.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Driver "postgres" needs its client library installed. Install with: npm install pg` | Do exactly what it says. Kakashi's DB drivers are lazy-loaded so you only install what you use. |
| `ECONNREFUSED` / `ETIMEDOUT` | Database not reachable from your machine. Check VPN, firewall, `psql`-equivalent connectivity first — this is a network issue, not a Kakashi one. |
| `28P01: password authentication failed` (Postgres) / `1045: Access denied` (MySQL) | Credentials wrong. Re-check the env var expansion (`echo $DATABASE_URL` in a private terminal) and that special characters are URL-encoded. |
| Query hangs / OOM on Snowflake or Databricks | You forgot `--limit`. Kill the query at the warehouse and re-run with `--limit 1000` (or lower) while you calibrate the extraction size. |
| `mongodb+srv` DNS resolution fails | Check your DNS resolver supports `SRV` records — some corporate DNS blocks them. Try the non-SRV form of the URI. |
| SQLite: `SQLITE_CANTOPEN` | The file path is wrong or the process lacks read permission. Confirm with `ls -la <path>` and `sqlite3 <path> ".tables"`. |

---

## Where to go next

- **[commands/kakashi-db-scan.md](../commands/kakashi-db-scan.md)** — full
  agent-chat contract for the scan command.
- **[commands/kakashi-db-mask.md](../commands/kakashi-db-mask.md)** — same
  for mask.
- **[commands/kakashi-guard.md](../commands/kakashi-guard.md)** — the
  release-decision authority. Use this after `db-mask` when the destination
  is an external model.
- **[src/engine/db/](../src/engine/db/)** — the six driver adapters. Each
  is ~30 lines and readable in one sitting; nothing about your DB traffic
  is hidden behind an abstraction you can't inspect.

---

*Made in the UAE. MIT licensed. Zero telemetry, zero network calls during
scan / mask / guard. Kakashi is a preventive privacy control, not a
legal-compliance guarantee — pair it with your PDPL / GDPR / HIPAA program,
don't replace them.*
