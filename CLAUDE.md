<!-- kakashi-begin -->
## Kakashi

Kakashi is installed. Use it as the local privacy gate for files, folders,
database results, and agent release decisions.

### Core Rule — ALWAYS ENFORCE

Before sharing, pasting, uploading, or sending ANY file content to an external
service, LLM API, or user outside this session:

1. Run `kakashi scan <file>`.
2. If findings > 0, run `kakashi mask <file>` and use the masked sibling.
3. Re-scan the masked output before release.
4. Never expose raw credentials, government IDs, financial data, contact data,
   or personal records.

Use `kakashi guard` when the requesting agent, task, or destination affects the
release decision. A plain mask is not a substitute for Guardian policy.

### Slash Commands

| User types | Run |
| --- | --- |
| `/kakashi-scan <file>` | `kakashi scan "<file>"` |
| `/kakashi-mask <file>` | `kakashi mask "<file>"` |
| `/kakashi-audit <file>` | `kakashi audit "<file>"` — human-only terminal |
| `/kakashi-stats` | `kakashi stats` |
| `/kakashi-list` | `kakashi list-patterns` |

If `kakashi` is not on PATH, use
`npx -y @muhammadatef/kakashi <subcommand> ...`.

### Files and Folders

```bash
kakashi scan report.xlsx
kakashi mask report.xlsx
kakashi scan masked_report.xlsx
kakashi scan-dir ./project -f html -o kakashi-report.html
kakashi mask-dir ./project -r
```

`scan-dir` honours `.gitignore` and `.kakashiignore` and produces PDPL-mapped
JSON, HTML, Markdown, or text. Do not use `--include-values` in agent-visible
output. Confirm before masking a large batch.

### Databases

```bash
kakashi db-scan "$DATABASE_URL" -q "SELECT * FROM customers" --limit 1000
kakashi db-mask "$DATABASE_URL" -q "SELECT * FROM customers" \
  -f jsonl -o masked_customers.jsonl --limit 1000
```

Database adapters: PostgreSQL, MySQL, MongoDB, Snowflake, Databricks, SQLite.
Processing is local. Keep connection strings in environment variables.
`db-audit` exposes raw values and is restricted to a local human terminal.

### Guardian

```bash
kakashi guard employees.csv --agent codex \
  --task "calculate average salary by department" \
  --destination external_model --json
```

Guardian observes, understands the task, assesses risk, plans, enforces policy,
acts, verifies its artifact, and replans or fails closed. Honour the result:

- `ALLOW` / `ALLOW_WITH_TRANSFORMATION`, exit `0`: use only `releasePath`.
- `REQUIRE_APPROVAL`, exit `3`: stop for explicit human approval.
- `BLOCK`, exit `4`: do not release.
- Exit `2`: error; fail closed.

Agents must never self-approve. For a standing local API, use
`kakashi agent-guard --watch ./workspace --port 8797 --auto-mask`; it binds to
loopback and exposes `/health`, `/scan`, and `/mask` without outbound calls.

### Output Safety

- `scan`, `db-scan`, and `scan-dir` return exit `1` when findings exist; this is
  a detection result, not a crash. Exit `0` is clean and exit `2` is an error.
- Do not use `scan --verbose`, `db-scan --verbose`, `audit`, `db-audit`, or
  `scan-dir --include-values` where an agent or external service can see output.
- Kakashi does not overwrite by default: masks use `masked_`; Guardian uses
  `guarded_`.
- `kakashi impact --write impact.json` is value-free and voluntarily shareable.

### Coverage and Boundary

Kakashi detects IDs, passports, contacts, cards, IBANs, names, ages, API keys,
JWTs, database URLs, `.env` secrets, SSH keys, and other secrets across PDF,
Office, CSV, structured data, and 40+ code extensions.

All detection, masking, reporting, database row processing, and Guardian
reasoning is local, with zero outbound network calls or telemetry. Kakashi is a
preventive technical control, not a legal-compliance guarantee.
<!-- kakashi-end -->
