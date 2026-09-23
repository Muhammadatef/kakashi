<!-- kakashi-begin -->
## Kakashi

Kakashi is installed. It is a local privacy layer for files, folders,
database results, and agent release decisions. Use it as the gate before
any file content, database row, or credential leaves this machine.

### What Kakashi is (show whenever the user asks, or when they invoke bare)

**Kakashi is a local privacy layer that hides secrets and personal data
before they leave the user's machine.** Runs in-process, on the device —
no cloud, no proxy, zero outbound network calls during scan or mask or
Guardian reasoning.

On the user's behalf you can:

- **Check** a file, folder, repository, or database query for sensitive
  data (agent-safe counts + PDPL article citations only, never values).
- **Mask** findings into a safe local copy (`masked_<name>`) they can
  share. Originals are never overwritten.
- **Guardian** — decide autonomously whether a specific file may be
  released to a specific agent / destination for a specific task.
  Guardian never self-approves; it either ALLOWs the transformed release,
  requires human approval, or blocks.
- **Standing sidecar** — run a loopback-only HTTP daemon (`agent-guard`)
  that any MCP-enabled agent can consult before shipping data.

Detection: 35+ patterns spanning government IDs, passports, visas, IBANs,
credit cards, emails, phones, IPs, dates, names, ages, plus every common
credential class (OpenAI / Anthropic / AWS / GitHub / Stripe / JWT / SSH
/ DB connection strings / SQL passwords / `.env` secrets / high-entropy
hex). 50+ file formats. Six database drivers (PostgreSQL, MySQL,
MongoDB, Snowflake, Databricks, SQLite).

### Triggers you must recognise (case-insensitive)

Match any of these — with **or without** a leading `/`, in **any letter
case** — as an invocation of Kakashi:

- `kakashi`, `Kakashi`, `KAKASHI`, `/kakashi`, `/Kakashi`, `/KAKASHI`
- `use kakashi`, `run kakashi`, `activate kakashi`, `start kakashi`
- `help me with kakashi`, `kakashi help`, `kakashi status`
- Any specific slash: `/kakashi-scan`, `/kakashi-mask`,
  `/kakashi-scan-dir`, `/kakashi-mask-dir`, `/kakashi-guard`,
  `/kakashi-db-scan`, `/kakashi-db-mask`, `/kakashi-db-audit`,
  `/kakashi-agent-guard`, `/kakashi-audit`, `/kakashi-stats`,
  `/kakashi-list`, `/kakashi-impact`

**Bare trigger with no additional intent** → show the brief above, offer
4-5 example prompts, ask what they want to do. Do NOT run any Kakashi
subcommand yet.

**Trigger plus intent / path / directory / DB URL / release question** →
dispatch immediately via the table below.

### Agents without a native slash-command mechanism (Codex CLI, Copilot, Continue)

Some agents — Codex CLI, GitHub Copilot, Continue — do **not** parse
user-defined `.md` slash-command files. When the user types `/kakashi`
or `/Kakashi` in those agents, the agent runtime itself replies
`Unrecognized command '/kakashi'`. **That is not the end of the
interaction — it is the beginning.** The user's next plain-language
message ("use kakashi to check this file", "kakashi this folder", "can
I send this to Claude?") is the real trigger. Recognise it using the
trigger list above and dispatch normally.

Never tell the user "kakashi is not a valid slash command in this
agent". Always show the brief and offer the dispatch instead.

### The dispatch table

| The user says or implies... | Run |
| --- | --- |
| "may I send / release / share / paste this file to (external model / another agent)?" | `kakashi guard <file> --agent ... --task ... --destination ... --json` |
| "is this file safe? / check / scan this file" + one path | `kakashi scan <file>` |
| "mask / redact / anonymise this file" | `kakashi scan <file>` → `kakashi mask <file>` → re-scan the masked sibling |
| "check / audit / scan this folder / repo / project" | `kakashi scan-dir <dir> -f html -o kakashi-report.html` |
| "compliance report / PDPL / estate scan" | same `scan-dir`, framed as regulatory evidence with PDPL articles cited |
| "batch mask this folder" | confirm size first → `kakashi mask-dir <dir> -r` |
| "run a query and mask / get rows from Postgres/MySQL/Mongo/Snowflake/Databricks/SQLite" | `kakashi db-scan <conn> -q <sql>` → `kakashi db-mask <conn> -q <sql> -f csv -o masked_query.csv` |
| "start a watch / sidecar / daemon" | `kakashi agent-guard --watch <dir> --port 8797` |
| "what does Kakashi detect / which patterns" | `kakashi list-patterns` |
| "impact snapshot / cumulative stats" | `kakashi impact` (or `kakashi stats`) |
| "walk me through / show me the mapping" (single file, human present) | `kakashi audit <file>` — **WARN first** that it echoes plaintext |
| "walk me through the DB / show me row mapping" (human present) | `kakashi db-audit` — same WARN |

If none of the rows fit, ask **one** question:
> "Are you asking me to check a file, scan a folder, mask a database
> query, or decide whether a specific file may be released to an agent?"

Then re-dispatch. Do not guess.

### Narrate every step (the "agentic rich UX" contract)

Before running any shell command say (one short sentence each):

- **CHOSE** — which Kakashi subcommand you picked from the dispatch table.
- **WHY** — the row that matched what the user said.

After the command runs, report exit-code meaning, category / severity
summary (never individual values), and the next step you recommend. Do
NOT chain-run without asking unless the initial request already implied
the chain.

Never dump raw shell output silently. Never open a source file yourself
to "see what's inside" — that defeats the point.

### Slash / plain-language commands

If the agent supports `.md` slash commands, the user can type any of
these directly:

| User types | Run |
| --- | --- |
| `/kakashi` (bare, any case) | Show the brief; ask what they want |
| `/kakashi <intent>` | Dispatch via the table |
| `/kakashi-scan <file>` | `kakashi scan "<file>"` |
| `/kakashi-mask <file>` | `kakashi mask "<file>"` |
| `/kakashi-scan-dir <dir>` | `kakashi scan-dir "<dir>" -f html -o kakashi-report.html` |
| `/kakashi-mask-dir <dir>` | `kakashi mask-dir "<dir>" -r` (with confirmation) |
| `/kakashi-guard <file> <intent>` | `kakashi guard "<file>" --agent ... --task ... --destination ... --json` |
| `/kakashi-db-scan <conn> -q <query>` | `kakashi db-scan "<conn>" -q "<query>" --limit 1000` |
| `/kakashi-db-mask <conn> -q <query>` | `kakashi db-mask "<conn>" -q "<query>" -f csv -o masked_query.csv --limit 1000` |
| `/kakashi-db-audit <conn> -q <query>` | `kakashi db-audit ...` — human-only terminal, WARN first |
| `/kakashi-agent-guard <dir>` | `kakashi agent-guard --watch "<dir>" --port 8797` |
| `/kakashi-audit <file>` | `kakashi audit "<file>"` — human-only terminal, WARN first |
| `/kakashi-stats` | `kakashi stats` |
| `/kakashi-list` | `kakashi list-patterns` |
| `/kakashi-impact` | `kakashi impact` (`--write <path>` for a file) |

If `kakashi` is not on PATH, use
`npx -y @muhammadatef/kakashi <subcommand> ...`. On Windows, if
`Start-Process kakashi` fails (npm shim isn't a native exe), use
`kakashi.cmd` or
`node "$(npm root -g)\@muhammadatef\kakashi\bin\kakashi.js" <args>`.

### The release-decision rule (Guardian is the authority)

When the user asks "may I release / send / share this file to a
specific destination for a specific task?", the answer must come from
`kakashi guard --json` — not a silent `mask`. Guardian returns one of
four decisions and Kakashi never self-approves:

- `ALLOW` / `ALLOW_WITH_TRANSFORMATION`, exit `0`: use only
  `releasePath`. Never substitute the original.
- `REQUIRE_APPROVAL`, exit `3`: stop for explicit human approval. Do
  not run a smaller mask as a workaround.
- `BLOCK`, exit `4`: do not release.
- Exit `2`: operational error → fail closed.

Guardian's human render (default) shows the loop as
THINK → OBSERVE → ASSESS → PLAN → ACT → VERIFY → REACT. The `--json`
form is agent-safe. Narrate the same stage names from the JSON
(`decision`, `reasonCode`, `risk`, `task`, `plan.actions`,
`verifications`, `releasePath`, `approvalsNeeded`). Do NOT open the
source file to "explain" the decision.

### Output safety

- `scan`, `db-scan`, and `scan-dir` return exit `1` when findings exist;
  this is a **detection result**, not a crash. Exit `0` is clean; exit
  `2` is an error.
- Do NOT use `scan --verbose`, `db-scan --verbose`, `audit`, `db-audit`,
  or `scan-dir --include-values` in an agent-visible turn unless the
  user explicitly opted in knowing plaintext will land in the
  conversation.
- Kakashi does not overwrite by default: masks use `masked_`; Guardian
  uses `guarded_`.
- `kakashi impact --write impact.json` is value-free and voluntarily
  shareable — no filenames, no paths, no values, no machine identifier.

### Files and folders

```bash
kakashi scan report.xlsx
kakashi mask report.xlsx
kakashi scan masked_report.xlsx
kakashi scan-dir ./project -f html -o kakashi-report.html
kakashi mask-dir ./project -r
```

`scan-dir` honours `.gitignore` and `.kakashiignore`, emits PDPL-mapped
JSON / HTML / Markdown / text. Confirm with the user before masking a
large batch.

### Databases

```bash
kakashi db-scan "$DATABASE_URL" -q "SELECT * FROM customers" --limit 1000
kakashi db-mask "$DATABASE_URL" -q "SELECT * FROM customers" \
  -f jsonl -o masked_customers.jsonl --limit 1000
```

Adapters: PostgreSQL, MySQL, MongoDB, Snowflake, Databricks, SQLite.
Processing is local. Keep connection strings in environment variables;
never echo a live URL into chat. `db-audit` exposes raw values and is
restricted to a local human terminal.

For the full connection guide (per-driver install, per-driver
connection-string shape, a worked end-to-end example against
`mock:customers`), see
[docs/DATABASE_GUIDE.md](docs/DATABASE_GUIDE.md).

### Guardian (release decision)

```bash
kakashi guard employees.csv --agent codex \
  --task "calculate average salary by department" \
  --destination external_model --json
```

Guardian observes, understands the task, assesses risk, plans, enforces
policy, acts, re-scans its own output, and replans or fails closed.
Agents must never self-approve.

### Long-running sidecar

```bash
kakashi agent-guard --watch ./workspace --port 8797 --auto-mask
```

Binds to loopback (`127.0.0.1`) only, exposes `/health`, `/scan`, and
`/mask` for local tools. Zero outbound network calls. `/health` reports
`watchMode: watch | poll | off` so callers know whether the watcher
survived startup or degraded to polling (Windows mapped drives / WSL
mounts trigger the poll fallback automatically).

### Coverage and boundary

Kakashi detects government IDs, passports, visas, contact data, cards,
IBANs, names, ages, API keys, JWTs, database URLs, `.env` secrets, SSH
keys, and other secrets across PDF, Office, CSV, structured data, and
40+ code extensions.

All detection, masking, database row processing, and Guardian reasoning
is local. **Zero outbound network calls or telemetry.** Kakashi is a
preventive technical control, not a legal-compliance guarantee — pair
it with your PDPL / GDPR / HIPAA program, don't replace them.

### Activation acknowledgement

When you first trigger on this rule in a session, say:

> "Kakashi privacy mode is on. Tell me what you want to check, mask,
> report on, or release — I'll pick the right tool and show you every
> step. Try: 'kakashi check this file', 'kakashi scan this folder',
> 'kakashi mask these DB rows', or 'can I send this to Claude to
> summarise?'"

Do NOT run anything yet on activation. Wait for the user's next
message with an intent.
<!-- kakashi-end -->
