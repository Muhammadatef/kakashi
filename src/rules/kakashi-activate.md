# Kakashi

Kakashi is installed. You have a `kakashi` CLI tool available on PATH (or
runnable via `npx -y @muhammadatef/kakashi`). It is a local-first privacy
layer for files, folders, databases, and agent data-release decisions.

## Core Rule — ALWAYS ENFORCE

Before sharing, pasting, uploading, or sending ANY file content to an external
service, LLM API, or user outside this session:

1. Run `kakashi scan <file>` to check for sensitive data.
2. If findings > 0, run `kakashi mask <file>` and use the masked sibling.
3. Re-scan the masked output before release.
4. NEVER paste raw contents of files that may contain credentials, national
   IDs, passports, emails, phone numbers, financial data, or personal records.

For a contextual release decision—where the requesting agent, stated task, or
destination changes what is safe—use `kakashi guard`, not a plain one-pass mask.

## Slash Commands

Treat the following as first-class slash commands. Run the matching shell
command immediately and show only agent-safe output.

| User types | You run in shell |
| --- | --- |
| `/kakashi-scan <file>` | `kakashi scan "<file>"` |
| `/kakashi-mask <file>` | `kakashi mask "<file>"` |
| `/kakashi-audit <file>` | `kakashi audit "<file>"` — local human terminal only |
| `/kakashi-stats` | `kakashi stats` |
| `/kakashi-list` | `kakashi list-patterns` |

If `kakashi` is not on PATH, fall back to
`npx -y @muhammadatef/kakashi <subcommand> ...`.

## Protection Workflows

### One file

```bash
kakashi scan report.xlsx
kakashi mask report.xlsx                 # writes masked_report.xlsx
kakashi scan masked_report.xlsx          # verify before release
```

Mask modes are `typed` (stable labels), `redact` (irreversible removal), and
`fake` (realistic substitutes). Prefer `typed` for agent analysis because it
preserves relationships without preserving original values.

### A folder or repository

```bash
kakashi scan-dir ./project -f html -o kakashi-report.html
kakashi mask-dir ./project -r
```

`scan-dir` honours `.gitignore` and `.kakashiignore`, emits PDPL-mapped JSON,
HTML, Markdown, or text reports, and is safe by default because matched values
are excluded. Never add `--include-values` when an agent can read the report.
Confirm with the user before `mask-dir` on a large batch.

### Database query results

```bash
kakashi db-scan "$DATABASE_URL" -q "SELECT * FROM customers" --limit 1000
kakashi db-mask "$DATABASE_URL" -q "SELECT * FROM customers" \
  -f jsonl -o masked_customers.jsonl --limit 1000
```

Supported adapters are PostgreSQL, MySQL, MongoDB, Snowflake, Databricks, and
SQLite. Rows are masked locally before the safe copy is written. Keep database
credentials in environment variables; never echo a connection string into
chat. `db-audit` deliberately prints original values and is restricted to a
local human terminal.

### Guardian — autonomous release decision

```bash
kakashi guard employees.csv \
  --agent codex \
  --task "calculate average salary by department" \
  --destination external_model \
  --json
```

Guardian observes the resource, interprets the task, assesses risk, plans the
minimum necessary transformation, validates policy, acts, re-scans its output,
and replans or fails closed. Honour its decision:

- `ALLOW` / `ALLOW_WITH_TRANSFORMATION` (exit `0`): use only `releasePath`.
- `REQUIRE_APPROVAL` (exit `3`): stop and request explicit human approval.
- `BLOCK` (exit `4`): do not release the resource.
- Exit `2`: operational error; fail closed.

Never substitute the original path when Guardian returns a transformed
`releasePath`. Approvals must come from a human; an agent must not self-approve.

### Long-running agent integration

```bash
kakashi agent-guard --watch ./workspace --port 8797 --auto-mask
```

The sidecar binds to loopback only and exposes `/health`, `/scan`, and `/mask`
for local tools. It makes no outbound network calls. Use it when an IDE, MCP
tool, or automation needs a standing privacy gate rather than a one-off check.

## Output Safety and Exit Codes

- `scan`, `db-scan`, and `scan-dir` return exit `1` when findings exist. This is
  a detection result, not a crash. Exit `0` means clean; exit `2` means error.
- `scan` and `db-scan` are count-only by default. Do not use `--verbose` in an
  agent-visible terminal.
- `audit`, `db-audit`, and `scan-dir --include-values` intentionally reveal raw
  matches. Use them only in a local human-only review.
- Kakashi never overwrites a file by default. Masked files use a `masked_`
  prefix; Guardian artifacts use a `guarded_` prefix.
- `kakashi impact --write impact.json` creates a value-free impact snapshot;
  `kakashi list-patterns` shows the active detector catalog.

## Sensitive Data Categories

ID & Documents: national IDs, passports, visas, trade licenses, P.O. boxes

Personal Info: emails, phones, IPs, dates of birth, cards, names, ages, IBANs

Secrets & authentication: API keys, JWTs, database connection strings, `.env` data, SSH
keys, bearer tokens, and high-entropy secrets

## File Formats Supported

Documents: `.pdf` `.docx` `.pptx` `.xlsx` `.xls` `.csv`

Data: `.json` `.jsonl` `.json5` `.yaml` `.yml` `.toml` `.xml` `.md`

Code: 40+ extensions including `.py` `.ts` `.js` `.go` `.java` `.rs` `.c`
`.sql` `.env` `.tf` `.sh` `.html` and `.vue`

## Privacy Boundary

- Detection, masking, reporting, database row processing, and Guardian
  reasoning run locally.
- Kakashi makes zero outbound network calls and does not submit telemetry.
- Treat the tool as a preventive control, not a legal-compliance guarantee.
