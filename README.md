<div align="center">

<img src="./og-card.png" alt="Kakashi — hide what shouldn't leave your machine" width="100%"/>

</div>

<div align="center">

<img src="./logo-256.png" width="120" height="120" alt="Kakashi"/>

# kakashi

**hide what shouldn't leave your machine**

[![npm](https://img.shields.io/badge/npm-%40muhammadatef%2Fkakashi-CC0000?style=flat&logo=npm&logoColor=white)](https://www.npmjs.com/package/@muhammadatef/kakashi)
[![version](https://img.shields.io/badge/version-1.2.0-1C2030?style=flat)](CHANGELOG.md)
[![node](https://img.shields.io/badge/node-%3E%3D18-4CAF50?style=flat)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-MIT-B8C4D4?style=flat)](LICENSE)
[![agents](https://img.shields.io/badge/agents-20%2B-8A2BE2?style=flat)](#works-inside-your-agent)
[![formats](https://img.shields.io/badge/formats-50%2B-CC0000?style=flat)](#50-file-formats)
[![tests](https://img.shields.io/badge/tests-340_passing-4CAF50?style=flat)](tests/)
[![network calls](https://img.shields.io/badge/network_calls-zero-1C2030?style=flat)](#privacy-guarantee)

**A local-first privacy engine for agentic AI.**

It finds secrets and personal data in your files, folders and databases — and it can decide, on its own, how much of that data an agent is allowed to have for the job it says it's doing.

Nothing is uploaded. No daemon. No cloud. **Zero network calls.**

[What it is](#what-kakashi-is) · [Install](#install) · [Upgrade](#upgrade-to-the-latest-version) · [Guardian](#the-guardian--autonomous-guardrails) · [Folders](#scan-a-whole-folder) · [Databases](#scan-and-mask-a-database) · [Agents](#works-inside-your-agent) · [Commands](#commands)

</div>

---

## What Kakashi is

Kakashi started as a masker you invoke. As of **v1.2 it is three layers**, and you can use any one of them on its own.

| Layer | What it does | Commands |
| --- | --- | --- |
| **1 · The engine** | 35 detection patterns (credentials, government IDs, financial, contact, names) across 50+ file formats. Finds a secret, replaces it, and rebuilds the file in its original format — a real `.docx` back, not a text dump. | `scan` `mask` `audit` |
| **2 · The reach** | The same engine pointed at things bigger than one file: a whole repository or shared drive, and live databases queried and masked **client-side**. | `scan-dir` `mask-dir` `db-scan` `db-mask` `db-audit` |
| **3 · The Guardian** | Guardrails. You hand it a file, the agent asking for it, and what that agent says it needs it for. It observes, assesses risk, plans the *minimum necessary* protection, acts, **re-checks its own output**, and replans if the result is still unsafe. It returns a decision, not just a file. | `guard` `agent-guard` |

```
        ┌──────────── layer 3 · GUARDIAN ────────────┐
        │  goal → observe → understand task →        │
        │  assess → plan → policy → act → verify →   │
        │  replan   ⇒  ALLOW / TRANSFORM /           │
        │              REQUIRE_APPROVAL / BLOCK      │
        └────────────────────┬───────────────────────┘
                             │ uses
        ┌──────────── layer 2 · REACH ───────────────┐
        │  folders (PDPL compliance report)          │
        │  databases (Postgres · MySQL · MongoDB ·   │
        │  Snowflake · Databricks · SQLite)          │
        └────────────────────┬───────────────────────┘
                             │ uses
        ┌──────────── layer 1 · ENGINE ──────────────┐
        │  35 patterns · 50+ formats · 3 mask modes  │
        └────────────────────────────────────────────┘

                 all of it, on your machine, offline
```

**In one sentence:** Kakashi is what stands between the file on your disk and the model on someone else's server.

---

## The Problem

Every day, in every dev team, someone does this:

```bash
# "Let me just ask Claude why this query is failing..."
cat quarterly_report.xlsx | claude
```

Or this:

```python
# "Cursor, fix the auth bug in this file"
# (the file contains the production DB password)
open("config/settings.py")
```

Inside those files — without you noticing, without a warning, without any friction — are things that should never leave your machine:

```
postgresql://admin:Pr0d_P@55word!@10.128.3.4:5432/customers
sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ123456789
ghp_abc123def456ghi789jkl012mno345pqr678
admin@example.com
+1-415-555-0188
4111-1111-1111-1111
```

**They just traveled to a third-party server. In plaintext. With no undo.**

And the newer problem: **your agent now moves data without asking you first.** It reads files, queries databases and calls tools on its own. "Remember to mask it" is not a control when nobody is at the keyboard. That is the gap layer 3 exists to close.

---

## Install

One line. Detects every agent on your machine. Installs for all of them.

```bash
# macOS · Linux · WSL · Git Bash
curl -fsSL https://raw.githubusercontent.com/Muhammadatef/kakashi/main/install.sh | bash
```

```powershell
# Windows (PowerShell 5.1+)
irm https://raw.githubusercontent.com/Muhammadatef/kakashi/main/install.ps1 | iex
```

Or via npm:

```bash
npm install -g @muhammadatef/kakashi
# or, straight from GitHub
npx -y github:Muhammadatef/kakashi
```

**~30 seconds. Needs Node ≥ 18. Safe to re-run.**

Want to see what it will do first?

```bash
curl -fsSL https://raw.githubusercontent.com/Muhammadatef/kakashi/main/install.sh | bash -s -- --dry-run
```

Install for one agent only:

```bash
curl -fsSL https://raw.githubusercontent.com/Muhammadatef/kakashi/main/install.sh | bash -s -- --only cursor
```

---

## Upgrade to the latest version

Check what you have:

```bash
kakashi --version
```

If it is below **1.2.0**, you do not have the Guardian, the folder scanner or the database commands. Upgrade:

```bash
npm install -g @muhammadatef/kakashi@latest
```

Then **re-run the installer** so your agents learn the new commands — the slash commands and agent rules are written at install time, so an upgraded binary alone is not enough:

```bash
# re-running the one-liner does both steps and is safe to repeat
curl -fsSL https://raw.githubusercontent.com/Muhammadatef/kakashi/main/install.sh | bash

# or, if you installed via npm and only want to refresh the agent rules
node "$(npm root -g)/@muhammadatef/kakashi/bin/install.js" --all --force
```

Verify:

```bash
kakashi --version        # 1.2.0
kakashi guard --help     # exists ⇒ the Guardian is installed
node "$(npm root -g)/@muhammadatef/kakashi/bin/install.js" --list
```

**Upgrading is non-destructive.** Kakashi writes its agent rules between `<!-- kakashi-begin -->` / `<!-- kakashi-end -->` markers and replaces only that block, so your own `CLAUDE.md`, `AGENTS.md` and Cursor rules are left alone. No config migration is needed from 1.0 or 1.1 — every old command still works exactly as before.

Upgrading from a clone instead:

```bash
git pull && npm install && npm link && node bin/install.js --all --force
```

---

## Quick start — the four things it can protect

```bash
# 1. a file
kakashi scan  config/settings.py          # counts only — agent-safe
kakashi mask  config/settings.py          # → masked_settings.py

# 2. a folder
kakashi scan-dir ./repo -f html -o report.html

# 3. a database
kakashi db-scan "postgres://user@host/db" -q "SELECT * FROM customers"
kakashi db-mask "postgres://user@host/db" -q "SELECT * FROM customers"

# 4. hand the decision to the Guardian
kakashi guard employees.md \
  --agent claude \
  --task "calculate average salary by age group" \
  --destination external_model
```

---

## The Guardian — autonomous guardrails

`kakashi mask` applies a fixed pipeline once and hands you a file. **`kakashi guard` holds a goal and makes a decision.**

It is the difference between a tool your agent can forget to call correctly, and a control that evaluates the request it was actually given.

```
GOAL              protect sensitive information while preserving task utility
  │
  ├─ OBSERVE          what is actually in this resource? → 9 sensitivity classes
  ├─ UNDERSTAND TASK  what did the agent say it needs it for? → per-class requirement
  ├─ ASSESS           how risky is this release? → 0-100, with every factor named
  ├─ PLAN             the *minimum necessary* transform per class
  ├─ POLICY           deterministic veto — a rejected plan is never executed
  ├─ EXECUTE          write the protected artifact
  ├─ VERIFY           re-scan its own output — did the transform actually work?
  └─ REPLAN           still unsafe? strengthen and loop (budget: 4 iterations)
       │
       ▼
  DECISION    ALLOW · ALLOW_WITH_TRANSFORMATION · REQUIRE_APPROVAL · BLOCK
```

### A real run

```bash
kakashi guard employees.md \
  --agent claude \
  --task "calculate average salary by age group" \
  --destination external_model
```

```
Kakashi — Guardian

   Goal:        Protect sensitive information while preserving task utility
   Agent:       Claude Code
   Resource:    employees.md
   Task:        calculate average salary by age group
   Destination: External model API
   Policy:      default

OBSERVE
   21 finding(s) across 6 data class(es)
     PERSON_NAME                 3  medium
     GOVERNMENT_IDENTIFIER       3  critical  [2 checksum-verified]
     QUASI_IDENTIFIER            4  low
     CONTACT                     7  high
     FINANCIAL                   3  critical  [1 checksum-verified]
     LOCATION                    1  medium
   PDPL: Art. 1, Art. 15, Art. 20, Art. 22, Art. 5

UNDERSTAND TASK
   Purpose: Analysis / aggregation (matched: calculate, average, group, salary)
     PERSON_NAME              needed, values must stay distinguishable
     GOVERNMENT_IDENTIFIER    needed, values must stay distinguishable
     QUASI_IDENTIFIER         needed, values must stay distinguishable
     CONTACT                  needed, values must stay distinguishable
     FINANCIAL                needed, values must stay distinguishable
     LOCATION                 needed, values must stay distinguishable
   A stated task can only make protection stricter, never weaker.

ASSESS
   Risk: 95/100 — CRITICAL
     +45  MAX_SEVERITY_CRITICAL — highest finding severity is critical
     +10  GOVERNMENT_IDENTIFIER_DETECTED — 3 state-issued identifier(s)
     + 5  CHECKSUM_VERIFIED_IDENTIFIER — 3 identifier(s) passed checksum validation -- these are live, not lookalikes
     +24  EXTERNAL_DESTINATION — destination: External model API
     + 7  MEDIUM_TRUST_AGENT — agent "claude" has medium trust
     + 4  NETWORK_CAPABLE_AGENT — requesting agent can reach the network

PLAN
   CONTACT                  → replaced with stable tokens
                              prohibited at this destination
   FINANCIAL                → replaced with stable tokens
                              prohibited at this destination
   GOVERNMENT_IDENTIFIER    → replaced with stable tokens
                              prohibited at this destination
   PERSON_NAME              → replaced with stable tokens
                              restricted at this destination
   LOCATION                 → preserved
                              permitted here, kept so the task remains possible
   QUASI_IDENTIFIER         → preserved
                              permitted here, kept so the task remains possible

VERIFY
   PASS — 0 prohibited class(es) remain in the artifact

DECISION
   ALLOW WITH TRANSFORMATION
   The protected artifact contains no prohibited data class.
```

Note the last two lines of the plan. Age bands and location **survive**, because the stated task needs them to be possible at all. Salary is tokenised *consistently*, so "group by" still groups. The agent gets a file it can do the job with, and not one value more.

### The task is a constraint, never a discount

The task string comes from the agent Kakashi is protecting data *from*. So it is treated as hostile input:

- **No intent can request plaintext.** The strongest claim a purpose can make is *"I need to tell values apart"*, which is answered with stable tokens — never with the real value.
- **Stating a purpose never buys a discount.** Not stating one *costs* risk points (`TASK_NOT_STATED` +5) — purpose limitation needs a purpose.
- **An unrecognised purpose changes nothing.** It is reported as unrecognised and the run proceeds as if blind.
- This is enforced, not asserted: `assertNonWeakening()` is run as a property test over **every intent × class × permitted-tool subset (504 combinations)**, plus an end-to-end test that fires injection-shaped task strings at a real run and asserts the released artifact is never less protected than the no-task baseline.

Six intents are matched deterministically against a fixed vocabulary, in **English and Arabic**. No model, no network, no new dependency.

Watch the same file change shape when the purpose changes:

```bash
kakashi guard employees.md --task "calculate average salary by age group"
#   → names tokenised, salary tokenised consistently, age bands kept — one iteration

kakashi guard employees.md --task "debug the failing export job"
#   → the people are redacted outright. Debugging has no use for them.

kakashi guard employees.md
#   → no purpose stated: +5 risk, nothing can be ruled unnecessary, two iterations
```

### When it refuses

```bash
kakashi guard service.env --agent unknown --destination external_model
```

```
OBSERVE
   4 finding(s) across 2 data class(es)
     CREDENTIAL                  3  critical
     CONTACT                     1  high

UNDERSTAND TASK
   No task stated — purpose limitation cannot be applied.
   Pass --task "<what you need the file for>" to narrow the plan.

ASSESS
   Risk: 100/100 — CRITICAL
     +45  MAX_SEVERITY_CRITICAL      +12  CREDENTIAL_DETECTED
     +24  EXTERNAL_DESTINATION       +14  LOW_TRUST_AGENT
     + 4  NETWORK_CAPABLE_AGENT      + 5  TASK_NOT_STATED

DECISION
   REQUIRE HUMAN APPROVAL
   Policy requires a person to approve this release.

   Awaiting approval for: CREDENTIAL
   Re-run with --approve CREDENTIAL to grant it.
   No artifact was written.
```

**It fails closed.** No artifact, no partial write, and the reason is named.

### What it reasons about

| Input | Values |
| --- | --- |
| **Sensitivity classes** (9) | `CREDENTIAL` · `GOVERNMENT_IDENTIFIER` · `FINANCIAL` · `CONTACT` · `PERSON_NAME` · `QUASI_IDENTIFIER` · `TECHNICAL_IDENTIFIER` · `BUSINESS_ATTRIBUTE` · `LOCATION` — all 35 patterns are mapped, and a drift guard fails CI if a new pattern ships unclassified |
| **Agent trust** (`--agent`) | `claude` `cursor` `codex` `windsurf` `cline` `copilot` `continue` `local_model`, and a deliberately conservative `unknown` default |
| **Destination** (`--destination`) | `local` · `local_model` · `known_external` · `external_model` · `unknown` |
| **Policy** (`--policy`) | Per (policy, destination): `denyOutright` (immediate BLOCK) · `prohibited` (must not be detectable in the output) · `restricted` · `requiresApproval` · `allowedTransforms` (caps which tools the planner may pick) |
| **Decisions** | `ALLOW` · `ALLOW_WITH_TRANSFORMATION` · `REQUIRE_APPROVAL` · `BLOCK` |

The policy layer sits **between** the planner and the executor and outranks both. A plan it rejects is never executed, and there is no code path by which the planner can override it. Reasoning proposes; policy disposes.

### For agents to call, not just humans

```bash
kakashi guard data.csv --agent cursor --task "..." --json
```

`--json` emits the machine-readable decision — **classes and counts only, never values** — so an agent can branch on `decision` and `risk.level` without a single secret entering its context window.

Every decision is also appended to a **value-free audit log** at `~/.kakashi/guardian-audit.jsonl` (a test asserts it contains no raw secrets). Disable with `--no-audit`, or redirect with `--audit-log <path>`.

```
Options
  -a, --agent <id>          requesting agent (default: unknown)
  -t, --task <text>         what the agent needs it for — can only make protection stricter
  -d, --destination <id>    default: external_model
  -p, --policy <id>         default: default
  -o, --output <path>       artifact path (default: guarded_<file>)
      --approve <classes>   classes a human signs off for release, e.g. CREDENTIAL
      --max-iterations <n>  replan budget before failing closed (default: 4)
      --audit-log <path>    append the decision event here
      --no-audit            write no audit event
      --json                machine-readable decision (agent-safe: classes and counts only)
```

There is also `kakashi agent-guard` — the same engine as a **local privacy daemon** any agent can consult before shipping data.

> No new runtime dependencies. No daemon required, no server, no separate install step — the Guardian ships inside the package and is reached through the same CLI. A test locks this: it fails if a dependency is added.

---

## Scan a whole folder

Point it at a repository, a shared drive, or a delivery folder. It honours `.gitignore` and `.kakashiignore`, scans in parallel, and emits a **PDPL-mapped compliance report**.

```bash
kakashi scan-dir ./repo
kakashi scan-dir ./repo -f html -o compliance.html --lang ar
kakashi scan-dir ./repo -f json -o findings.json
```

```
Kakashi — scan-dir
   Root: ./repo
   Concurrency: 8

   Scanned 8/8 file(s)…

   8 file(s) · 173 finding(s)
   (43 ID & docs · 86 personal info · 44 credentials)
   Severity: 75 critical · 55 high · 39 medium · 4 low
   Duration: 0.24s

## Top PDPL articles cited

| Article | Title (EN)                            | Findings |
| ------- | ------------------------------------- | -------: |
| Art. 1  | Definitions of Personal Data          |      129 |
| Art. 22 | Cross-Border Transfer of Personal Data|       93 |
| Art. 5  | Conditions for Processing Personal Data|      82 |
| Art. 20 | Security of Personal Data             |       79 |
| Art. 21 | Reporting a Personal Data Breach      |       40 |
```

| Flag | What |
| --- | --- |
| `-f, --format` | `json` · `html` · `md` · `text` (default `text`) |
| `-o, --output` | write the report to a path instead of stdout |
| `--parallel <n>` | concurrent file scans (default 8) |
| `--no-gitignore` | do **not** honour `.gitignore` / `.kakashiignore` |
| `--exclude` | extra comma-separated glob patterns |
| `--lang` | report language `en` \| `ar` (HTML) |
| `--include-values` | JSON only — embeds matched plaintext. **Not agent-safe.** |

To mask rather than report:

```bash
kakashi mask-dir ./deliverables -r --ext xlsx,docx,csv
kakashi mask-dir ./repo -r --exclude "node_modules/**,dist/**" --mode redact
```

---

## Scan and mask a database

Kakashi connects **from your machine**, streams rows locally, runs each one through the same engine that masks files, and writes a safe copy to disk. There is no proxy, no hosted service, no cloud step. The guarantee is unchanged even though the data lives on a remote server.

```bash
# counts only — agent-safe, writes nothing
kakashi db-scan "postgres://user@host:5432/db" -q "SELECT * FROM customers"

# query, mask locally, write a safe copy
kakashi db-mask "postgres://user@host:5432/db" -q "SELECT * FROM customers" \
  -f csv -o safe_customers.csv

# full original → token map (DELIBERATELY verbose — exposes plaintext)
kakashi db-audit "mysql://user@host/db" -q "SELECT * FROM users LIMIT 50"
```

```
Kakashi
   Scanning: db:sqlite — SELECT * FROM customers

   2 row(s) scanned
   8 findings  (0 ID & docs · 8 personal info · 0 credentials)
```

```jsonl
{"id":1,"full_name":"[FULL_NAME_1]","email":"[EMAIL_1]","phone":"[PHONE_1]","card":"[CC_1]"}
{"id":2,"full_name":"[FULL_NAME_2]","email":"[EMAIL_2]","phone":"[PHONE_2]","card":"[CC_2]"}
```

| Engine | Connection string |
| --- | --- |
| **PostgreSQL** | `postgres://` · `postgresql://` · `jdbc:postgresql:` |
| **MySQL / MariaDB** | `mysql://` · `jdbc:mysql:` |
| **MongoDB** | `mongodb://` · `mongodb+srv://` |
| **Snowflake** | `snowflake://` |
| **Databricks** | `databricks://` |
| **SQLite** | `sqlite://` or any `.db` / `.sqlite` / `.sqlite3` path |

Database drivers are **optional dependencies**, lazily required — you only install the one you use, and Kakashi tells you exactly what to `npm install` if it is missing.

`--limit` caps rows fetched (default 10000) and is **pushed down into the query**, so the cap is enforced at the server, not after the rows have already crossed the wire.

| Flag | Applies to | What |
| --- | --- | --- |
| `-q, --query` | all | SQL / JSON query to run |
| `--limit <n>` | all | row cap, applied server-side (default 10000) |
| `-o, --output` | `db-mask` | output path (default `masked_query.<fmt>`) |
| `-f, --format` | `db-mask` | `jsonl` \| `json` \| `csv` |
| `-m, --mode` | `db-mask` | `typed` \| `redact` \| `fake` |
| `-w, --whitelist` | `db-mask` | comma-separated values to skip |
| `-v, --verbose` | `db-scan` | per-finding previews. **Not agent-safe.** |

---

## Use it safely inside an AI agent — read this once

Kakashi runs locally; the LLM your agent talks to does not. That distinction matters for *how* you invoke the slash commands. Two rules:

> **Rule 1 — pass a path, not an `@`-mention.**<br/>
> Use: `/kakashi-scan /path/to/file.env`<br/>
> Avoid: `/kakashi-scan @file.env`<br/>
> In Cursor, Claude Code, and most agents, `@`-mentions automatically attach the **full file body** to the LLM's context *before* Kakashi runs. The secrets travel to the model on that very turn. Path-only invocation keeps the file body off the wire — Kakashi reads it locally and the agent only ever sees the path string and the masked summary.

> **Rule 2 — `scan` is agent-safe by default; `audit` is verbose by design.**<br/>
> `/kakashi-scan` emits only counts (`17 findings (0 id · 2 personal info · 15 credentials)`) — no secret previews enter the agent's context. Use `--verbose` only from a plain terminal.<br/>
> `/kakashi-audit` shows the full original→token mapping (it has to — that's its job). Use it only when you've already decided to expose the mapping to the agent.

The same split runs through every layer: `scan`, `db-scan` and `guard --json` are safe to let an agent read. `audit`, `db-audit` and `scan-dir --include-values` are the deliberate exceptions, and each one says so in its own help text.

### Trust boundary at a glance

| What you do | Does the LLM in this turn see secrets? | Does the **next** LLM you paste to see secrets? |
| --- | :---: | :---: |
| `/kakashi-mask /full/path/to/file.py` (path string, **recommended**) | No — only the path | No |
| `/kakashi-mask @file.py` (`@`-mention) | **Yes** — the agent attaches the file before Kakashi runs | No, if you share `masked_file.py` |
| `kakashi guard file.py --json` | No — classes and counts only | No |
| `kakashi mask file.py` in a plain terminal (no agent) | Not applicable — no agent involved | No |
| You forget Kakashi entirely and paste raw `.env` to ChatGPT | — | **Yes — the leak Kakashi exists to prevent** |

Kakashi's primary win is the **right-most column**: anything you share *downstream* — a different chat, a different model, a different team-mate — sees only `[OPENAI_KEY_1]`, never `sk-proj-...`.

---

## Works Inside Your Agent

Six slash commands are installed straight into the agent's chat:

```
/kakashi              activate privacy mode for the session
/kakashi-scan <path>  counts only — no secret previews (agent-safe, default)
/kakashi-mask <path>  write masked_<file> alongside the original
/kakashi-audit <path> full original → replacement mapping (DELIBERATELY exposes secrets)
/kakashi-stats        cumulative session stats
/kakashi-list         every active detection pattern
```

Type one of these in the agent chat — the agent runs `kakashi` in the terminal under the hood and shows you the result. You never leave the agent.

| Agent | Auto-activates | Slash commands | Install |
|-------|:--------------:|:--------------:|---------|
| **Claude Code** | **always** | full set (6) | `--only claude` |
| **Cursor** | **always** | full set (6) | `--only cursor` |
| **OpenAI Codex** | **always** | full set (6) | `--only codex` |
| **Windsurf** | **always** | full set (6) | `--only windsurf` |
| **Cline** | **always** | full set (6) | `--only cline` |
| **GitHub Copilot** | **always** | via `.github/copilot-instructions.md` | `--only copilot` |
| **Continue** | _per session_ | `/kakashi` | `--only continue` |
| **Aider** | _per session_ | `/kakashi` | `--only aider` |
| **Roo Code** | _per session_ | `/kakashi` | `--only roo` |
| **Kilo Code** | _per session_ | `/kakashi` | `--only kilo` |
| **OpenHands** | _per session_ | `/kakashi` | `--only openhands` |
| **Warp** | _per session_ | `/kakashi` | `--only warp` |
| **Replit Agent** | _per session_ | `/kakashi` | `--only replit` |
| **Augment Code** | _per session_ | `/kakashi` | `--only augment` |
| **JetBrains Junie** | _per session_ | `/kakashi` | `--only junie` |

> **always** = always on, activates from first message<br/>
> _per session_ = type `/kakashi` once per session to activate

The CLI itself is **bilingual — English and Arabic** (`--lang ar`, or set `KAKASHI_LANG`), as are the compliance reports.

---

## 50+ File Formats

Kakashi reads, masks, and **reconstructs** the original format. The file you get back is a real `.docx` — not a `.txt` dump of a Word file.

| Format | Read | Mask | Reconstruct | Status |
|--------|:----:|:----:|:-----------:|--------|
| Excel `.xlsx` `.xls` | yes | yes | full `.xlsx` | **stable** — cell-level masking, catches secrets embedded in narrative cells |
| CSV / TSV | yes | yes | same format | **stable** |
| JSON / JSONL / JSON5 | yes | yes | same format | **stable** |
| YAML / TOML | yes | yes | same format | **stable** |
| XML | yes | yes | same format | **stable** |
| Markdown | yes | yes | same format | **stable** |
| Word `.docx` | yes | yes | full `.docx` | **stable** — including secrets split across Word run boundaries |
| PowerPoint `.pptx` | yes | yes | full `.pptx` | **stable** — same run-boundary handling as DOCX |
| PDF `.pdf` | yes | yes | masked `.md`* | **text-only** — extracts text and writes a masked `.md`, or `.txt` with `-o file.txt`. The output is *not* a real PDF. |

> *A real PDF round-trip needs a heavy PDF rewriter (`pdf-lib` content-stream patching). For sharing context with Claude / ChatGPT, the masked `.md` output is what you'd want anyway.

### Source code & config — 40+ extensions

```
Python      .py  .pyw  .ipynb
JavaScript  .js  .mjs  .cjs  .jsx  .ts  .tsx
Java        .java  .kt  .scala  .groovy
Go          .go          Ruby  .rb        PHP   .php       Rust  .rs
C / C++     .c  .cpp  .cc  .cxx  .h  .hpp
C#          .cs          Swift .swift
Shell       .sh  .bash  .zsh  .fish  .bat  .ps1
SQL         .sql  .plsql  .hql  .psql
Config      .env  .yaml  .yml  .toml  .json  .json5  .jsonl  .xml
            .ini  .cfg  .conf  .config  .properties
IaC         .tf  .tfvars  .hcl  .dockerfile  .makefile
API         .proto  .graphql  .gql
Web         .html  .css  .scss  .vue  .svelte  .astro
Docs        .md  .rst  .txt  .log
```

---

## What Kakashi Catches

35 active patterns. `kakashi list-patterns` prints every one.

### Credentials

```
OpenAI Key         sk-proj-aBcDeF...      →  [OPENAI_KEY_1]
Anthropic Key      sk-ant-api03-...       →  [ANTHROPIC_1]
AWS Key            AKIAIOSFODNN7EXAMPLE   →  [AWS_KEY_1]
GitHub Token       ghp_aBcDeFgHiJ...      →  [GH_TOKEN_1]
Stripe Key         sk_live_aBcDeF...      →  [STRIPE_1]
Slack Token        xoxb-123456-...        →  [SLACK_1]
HuggingFace        hf_aBcDeFgHiJ...       →  [HF_TOKEN_1]
Databricks Token   dapi1234567890ab...    →  [DATABRICKS_TOKEN_1]
Databricks Host    dbc-a1b2c3d4-e5f6...   →  [DATABRICKS_HOST_1]
S3 URI             s3://prod-bucket/...   →  [S3_URI_1]
JWT Token          eyJhbGciOiJIUzI1...    →  [JWT_1]
Bearer Token       Bearer eyJhbGci...     →  [BEARER_1]
DB Connection      postgresql://user:p... →  [DB_CONN_1]
SQL Password       IDENTIFIED BY 'S3cr... →  IDENTIFIED BY [SQL_PASSWORD_1]
SSH Private Key    -----BEGIN RSA...      →  [SSH_KEY_1]
ENV Secret         API_KEY=abc123...      →  [ENV_SECRET_1]
Hex Secret         a1b2c3d4e5f6... (40+)  →  [HEX_SECRET_1]
```

### Identity & personal info

```
Emirates ID        784-1990-1234567-1     →  [NATIONAL_ID_1]      ← checksum-verified
Passport           AB1234567              →  [PASSPORT_1]
Visa Number        123/2020/1234567       →  [VISA_ID_1]
Unified ID         1234567890             →  [UNIFIED_ID_1]
UAE IBAN           AE070331234567890123   →  [UAE_IBAN_1]         ← mod-97 verified
Trade License      CN-1234567             →  [TRADE_LIC_1]
P.O. Box           P.O. Box 12345         →  [POBOX_1]
Email              user@example.com       →  [EMAIL_1]
UAE Phone          +971-50-123-4567       →  [INTL_PHONE_1]
Phone              +1-415-555-0188        →  [PHONE_1]
IP Address         10.128.3.4             →  [IP_1]
Credit Card        4111 1111 1111 1111    →  [CC_1]               ← Luhn-verified
SSN / National ID  123-45-6789            →  [SSN_1]
Date of Birth      DOB: 15/03/1990        →  [DOB_1]
Age                age: 34                →  [AGE_1]
Full Name          Alex Taylor            →  [FULL_NAME_1]
Arabic Name        محمد عاطف فهمي           →  [NON_LATIN_NAME_1]
```

Checksum-verified classes are a distinct risk signal to the Guardian: an identifier that *passes* its checksum is live, not a lookalike, and scores higher.

---

## Three Masking Modes

```bash
kakashi mask file.env --mode typed    # [EMAIL_1] [DB_CONN_2]  ← default, keeps doc readable
kakashi mask file.env --mode redact   # [REDACTED]             ← maximum anonymity
kakashi mask file.env --mode fake     # user_a@example.com     ← preserves LLM context
```

**Consistency guarantee:** the same original value gets the same replacement throughout the document — which is exactly what lets a masked dataset still be grouped, joined and counted. The masked file still makes sense to the AI.

> Note: `--mode fake` is deliberately **not** available to the Guardian for credentials, government identifiers or financial data at external destinations. A synthetic department name is harmless; a well-formed synthetic Emirates ID is indistinguishable downstream from a live one.

---

## Before / After

### `.env` file

```diff
- DATABASE_URL=postgresql://admin:Pr0d_P@55w0rd!@db.example.com:5432/customers
- OPENAI_API_KEY=sk-proj-xK9mN2pQrStUvWxYz1234567890abcdef
- STRIPE_SECRET=sk_live_51HGk2nKZ6eKyOrNm1234567890
- SUPPORT_EMAIL=support@example.com
+ DATABASE_URL=[DB_CONN_1]
+ OPENAI_API_KEY=[OPENAI_KEY_1]
+ STRIPE_SECRET=[STRIPE_1]
+ SUPPORT_EMAIL=[EMAIL_1]
```

### SQL file

SQL auth clauses delimit the secret with a space (`IDENTIFIED BY '...'`, `WITH PASSWORD '...'`), so Kakashi masks just the value and leaves the statement readable — perfect for asking an agent to optimize a query or review a schema without leaking credentials or customer records.

```diff
- CREATE USER reporting IDENTIFIED BY 'Sup3rS3cret!';
- INSERT INTO customers (id, full_name, email) VALUES
-   (1, 'John Smith', 'john.smith@example.com');
+ CREATE USER reporting IDENTIFIED BY [SQL_PASSWORD_1];
+ INSERT INTO customers (id, full_name, email) VALUES
+   (1, '[FULL_NAME_1]', '[EMAIL_1]');
```

> Need a **runnable** file with synthetic data (e.g. to seed a dev database)? Use `--mode fake` — it substitutes realistic stand-ins like `IDENTIFIED BY 'P@ssw0rd!'`, keeping the SQL valid.

---

## Commands

```
Files
  kakashi scan     <file>       Scan and report counts — nothing written (agent-safe)
  kakashi mask     <file>       Mask and reconstruct the original format
  kakashi audit    <file>       Full original → replacement map (VERBOSE: exposes secrets)
  kakashi mask-dir <dir> -r     Mask every supported file in a directory

Folders & databases
  kakashi scan-dir <dir>        Recursive scan → PDPL-mapped report (json|html|md|text)
  kakashi db-scan  <conn> -q    Scan query results — counts only (agent-safe)
  kakashi db-mask  <conn> -q    Query, mask rows locally, write a safe copy
  kakashi db-audit <conn> -q    Full original → token map (VERBOSE: exposes secrets)

Agentic
  kakashi guard    <file>       Autonomously protect a file for a given agent, task and
                                destination. observe → understand task → assess → plan →
                                policy → act → verify → replan. Returns a decision:
                                ALLOW / ALLOW_WITH_TRANSFORMATION / REQUIRE_APPROVAL / BLOCK
  kakashi agent-guard           Run as a local privacy daemon any agent can consult

Info
  kakashi stats                 Cumulative masking stats
  kakashi impact                Privacy-preserving impact snapshot (never auto-submitted)
  kakashi list-patterns         All 35 active detection patterns

Global flags
  --mode typed|redact|fake      Replacement style (default: typed)
  --whitelist val1,val2         Values to never mask
  --output path                 Output path
  --overwrite                   Replace the original (asks for confirmation)
  --stdin                       Read from stdin, write to stdout
  --lang en|ar                  CLI language (default: $LANG / $KAKASHI_LANG)
  -v, --verbose                 Per-finding previews on scan (NOT agent-safe)
  -V, --version                 Print the version

Alias: k   (e.g. k scan file.txt)
```

Run `kakashi <command> --help` for the per-command flags.

---

## How Kakashi compares

There are plenty of secret scanners and PII libraries. None of them sit *inside* your AI agent, mask real-world document formats locally, **and decide for themselves what an agent may have.** That gap is what Kakashi fills.

| Tool | Runs inside AI agent | Local-only | Masks (not just detects) | PDF/Word/Excel reconstruct | Autonomous decision | One-line install |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| **Kakashi** | **Yes (20+ agents)** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** |
| GitLeaks | No | Yes | No — detect only | No | No | partial |
| TruffleHog | No | Yes | No — detect only | No | No | partial |
| detect-secrets (Yelp) | No | Yes | No — detect only | No | No | partial |
| Microsoft Presidio | No — Python SDK | Yes | Yes | No — text only | No | No — heavy stack |
| AWS Comprehend / Macie | No | No — cloud | Yes | No | No | No |
| Google DLP / Azure PII | No | No — cloud | Yes | No | No | No |
| Skyflow / Tonic Textual | No | No — cloud | Yes | partial | No | No |
| `redact-pii` (npm) | No | Yes | partial | No | No | Yes |
| Generic Cursor/Claude rules | Yes, but DIY | Yes | No — no engine | No | No | No |

**Where Kakashi is genuinely the only option:**

- The only open-source tool that ships as a **skill / rule for 20+ AI coding agents** out of the box.
- The only one that **masks `.docx`, `.xlsx`, `.pptx` while reconstructing the original format** — you get a real Word/Excel file back.
- The only one that applies the same engine to **files, folders and live databases**, all client-side.
- The only one that makes an **autonomous, auditable release decision** about the data an agent asked for — and verifies its own output before releasing it.
- 100% local. **Zero network calls** during scan/mask/guard. No telemetry.

GitLeaks and TruffleHog only catch leaks that already made it into git. Presidio is great, but you build all the agent integration yourself. Cloud DLP services defeat the purpose by sending the data they're meant to protect to a third party. Kakashi is designed for the *moment of leak* — the millisecond between an agent reading a file and shipping it to an external model.

---

## Privacy Guarantee

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   kakashi never phones home.                                │
│                                                             │
│   All scanning, masking and guarding runs in-process        │
│   on your machine. No file content, no findings,            │
│   no metadata is sent anywhere.                             │
│                                                             │
│   Database rows are streamed to your machine and masked     │
│   locally — no proxy, no hosted service.                    │
│                                                             │
│   The audit log is value-free, and a test enforces it.      │
│                                                             │
│   The installer makes network calls exactly once —          │
│   to npm, to fetch the package. After that: zero.           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Why "Kakashi"?

> *Kakashi Hatake. The Copy Ninja. Always masked. Copies every technique he encounters. Adapts to any environment.*

The tool **masks what should stay hidden** — like the character never shows his face.<br/>
It **copies itself** into every agent it finds — like the ninja copies every jutsu he sees.<br/>
It **adapts** to any format, any OS, any tool — because that's what copy ninjas do.

**`kakashi scan`** — the Sharingan sees everything.<br/>
**`kakashi mask`** — the mask hides everything.<br/>
**`kakashi guard`** — and the ninja decides what you're ready to be told.

---

## Uninstall

```bash
# Remove from all agents
npx -y github:Muhammadatef/kakashi -- --uninstall

# Or from one only
npx -y github:Muhammadatef/kakashi -- --uninstall --only cursor

# And the package itself
npm uninstall -g @muhammadatef/kakashi
```

Clean. Leaves no trace. Like a ninja.

---

## Contributing

Patterns, formats, agents — all welcome.

```bash
git clone https://github.com/Muhammadatef/kakashi
cd kakashi
npm install
npm test        # 340 tests, offline, a few seconds
```

New pattern? Add to `src/engine/patterns.js` — **and classify it** in `src/guardian/classes.js`, or the drift guard fails the build.<br/>
New format? Add a handler under `src/engine/formats/`.<br/>
New agent? Add to the `AGENTS` array in `bin/install.js`.<br/>
New policy or trust profile? `src/guardian/policy.js` and `src/guardian/profiles.js`.

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/AGENTIC_ARCHITECTURE.md](docs/AGENTIC_ARCHITECTURE.md) for the full guide. Release notes live in [CHANGELOG.md](CHANGELOG.md).

---

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">

**kakashi** · MIT · built by [Mohamed Atef Fahmy](https://github.com/Muhammadatef) · [LinkedIn](https://www.linkedin.com/in/mohamed-atef-fahmy-75475a125/)

*"In this world, whenever there is light, there are also shadows."*<br/>
*— Hatake Kakashi*

<br/>

If kakashi saved your credentials today — a star costs nothing.

</div>
