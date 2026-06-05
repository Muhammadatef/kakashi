<div align="center">

<img src="./og-card.png" alt="Kakashi — hide what shouldn't leave your machine" width="100%"/>

</div>

<div align="center">

<img src="./logo-256.png" width="120" height="120" alt="Kakashi"/>

# kakashi

**hide what shouldn't leave your machine**

[![npm](https://img.shields.io/badge/npm-%40muhammadatef%2Fkakashi-CC0000?style=flat&logo=npm&logoColor=white)](https://www.npmjs.com/package/@muhammadatef/kakashi)
[![node](https://img.shields.io/badge/node-%3E%3D18-4CAF50?style=flat)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-MIT-B8C4D4?style=flat)](LICENSE)
[![agents](https://img.shields.io/badge/agents-20%2B-8A2BE2?style=flat)](#works-inside-your-agent)
[![formats](https://img.shields.io/badge/formats-50%2B-CC0000?style=flat)](#50-file-formats)
[![network calls](https://img.shields.io/badge/network_calls-zero-1C2030?style=flat)](#privacy-guarantee)

A local-first masker that lives *inside* Claude Code, Cursor, Codex CLI, and 20+ AI agents.<br/>
Hides API keys, passwords, secrets, and personal data — across **PDF, Word, Excel, JSON, .env**, and 45+ other formats — *before* your agent ever sees them.<br/>
**30 seconds to install. Nothing leaves your machine. Ever.**

[Problem](#the-problem) · [Solution](#the-solution) · [Install](#install) · [How it works](#how-it-works) · [Agents](#works-inside-your-agent) · [Formats](#50-file-formats) · [Patterns](#what-kakashi-catches)

</div>

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

Or this:

```bash
# "ChatGPT, rewrite this SQL query"
# (the query runs against real customer records)
```

Inside those files — without you noticing, without a warning, without any friction — are things that should never leave your machine:

```
postgresql://admin:Pr0d_P@55word!@10.128.3.4:5432/customers
sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ123456789
ghp_abc123def456ghi789jkl012mno345pqr678
admin@example.com
+1-555-0100
4111-1111-1111-1111
```

**They just traveled to a third-party server. In plaintext. With no undo.**


---

## The Solution

Kakashi installs as a **skill** directly inside your AI agent. Not a separate app. Not a browser extension. Not a Docker container. A skill — there when you open Cursor, there in Claude Code, there wherever you work.

```
┌─────────────────────────────────────────────────────┐
│  TRADITIONAL FLOW                                   │
│  You → [paste file] → AI Agent → External LLM       │
│  Secrets ride along to a third-party server.        │
│                                                     │
│  WITH KAKASHI                                       │
│  You → [paste file] → kakashi scans → mask →        │
│         AI Agent → External LLM                     │
│  Only [TOKEN_n] placeholders cross the wire.        │
└─────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────┐
│  SECRETS LEAKED        ████████   0 │
│  PERSONAL DATA LEAKED  ████████   0 │
│  NETWORK CALLS         ████████   0 │
│  FILE FORMATS COVERED  ████████ 50+ │
│  AGENTS COVERED        ████████ 20+ │
└─────────────────────────────────────┘
```

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
curl -fsSL https://raw.githubusercontent.com/Muhammadatef/kakashi/main/install.sh | bash -s -- --only claude
```

---

## Use it safely inside an AI agent — read this once

Kakashi runs locally; the LLM your agent talks to does not. That distinction matters for *how* you invoke the slash commands. Two rules:

> **Rule 1 — pass a path, not an `@`-mention.**<br/>
> Use: `/kakashi-scan /path/to/sample_data.csv`<br/>
> Avoid: `/kakashi-scan @sample_date.csv`<br/>
> In Cursor, Claude Code, and most agents, `@`-mentions automatically attach the **full file body** to the LLM's context *before* Kakashi runs. The secrets travel to the model on that very turn. Path-only invocation keeps the file body off the wire — Kakashi reads it locally and the agent only ever sees the path string and the masked summary.

> **Rule 2 — `/kakashi-scan` is agent-safe by default; `/kakashi-audit` is verbose by design.**<br/>
> `/kakashi-scan` emits only counts (`17 findings (0 id · 2 personal info · 15 credentials)`) — no secret previews enter the agent's context. Use `kakashi scan --verbose` only when invoking from a plain terminal where you want full per-finding previews.<br/>
> `/kakashi-audit` shows the full original→token mapping (it has to — that's its job). Use it only when you've already decided to expose the mapping to the agent (e.g. you're inspecting what got replaced).

### Trust boundary at a glance

| What you do | Does the LLM in this turn see secrets? | Does the **next** LLM you paste to see secrets? |
| --- | :---: | :---: |
| `/kakashi-mask /full/path/to/file.py` (path string, **recommended**) | No — only the path | No |
| `/kakashi-mask @file.py` (`@`-mention) | **Yes** — Cursor attaches the file before Kakashi runs | No, if you share `masked_file.py` |
| `kakashi mask file.py` in a plain terminal (no agent) | Not applicable — no agent involved | No |
| You forget Kakashi entirely and paste raw `.env` to ChatGPT | — | **Yes — the leak Kakashi exists to prevent** |

Kakashi's primary win is the **right-most column**: anything you share *downstream* — a different chat, a different model, a different team-mate — sees only `[OPENAI_KEY_1]`, never `sk-proj-...`. The current-turn protection is a bonus you get only if you respect Rule 1.

---

## How It Works

**1. Scan** — see what's sensitive before it moves. Default output is **counts only**, so no secret values ever leak to stdout (or, if your AI agent is reading the output, into the agent's context window).

```bash
kakashi scan quarterly_report.xlsx
```

```
Kakashi
   Scanning: quarterly_report.xlsx

   6 findings  (0 id & documents · 3 personal info · 3 credentials)
   Run `kakashi mask <file>` to apply (no previews shown -- see `kakashi audit` for full mapping).
```

If you're at a plain terminal and want per-finding previews, opt in with `--verbose`:

```bash
kakashi scan --verbose quarterly_report.xlsx
```

```
Kakashi
   Scanning: quarterly_report.xlsx

   [KEY] Credentials (3 found)
   ─────────────────────────────────────────────────
   Line  8   [AWS_KEY]         AKIAIOSFODNN7EXAMPLE
   Line 22   [DB_CONN]         postgresql://admin:Pr0d...
   Line 41   [OPENAI_KEY]      sk-proj-aBcDeFgHiJk...

   [PII] Personal Info (3 found)
   ─────────────────────────────────────────────────
   Line 14   [EMAIL]           alex.taylor@example.com
   Line 35   [PHONE]           +1-555-0100
   Line 67   [FULL_NAME]       Alex Taylor

   Total: 6 findings  |  Run `kakashi mask <file>` to apply
```

**2. Mask** — replace in place, reconstruct the original format.

```bash
kakashi mask quarterly_report.xlsx
```

```
[ok] Masked version saved: masked_quarterly_report.xlsx
   6 replacements made
   (0 ID & docs, 3 personal info, 3 credentials)
```

**3. Share safely** — *Word stays Word. Excel stays Excel. PDF stays a PDF.*

---

## Works Inside Your Agent

Six slash commands are installed straight into the agent's chat — Claude Code, Cursor, Codex CLI, and Windsurf all get the full set:

```
/kakashi              activate privacy mode for the session
/kakashi-scan <path>  counts only — no secret previews (agent-safe, default)
/kakashi-mask <path>  write masked_<file> alongside the original
/kakashi-audit <path> full original → replacement mapping (DELIBERATELY exposes secrets)
/kakashi-stats        cumulative session stats
/kakashi-list         every active detection pattern
```

Type one of these in the agent chat — the agent runs `kakashi` in the terminal under the hood and shows you the result. You never leave the agent.

> Pass a **path string** (`/kakashi-scan /path/to/file.env`), not an `@`-mention. See [Use it safely inside an AI agent](#use-it-safely-inside-an-ai-agent--read-this-once) for the why.

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

---

## 50+ File Formats

Kakashi reads, masks, and **reconstructs** the original format. The file you get back is a real `.docx` — not a `.txt` dump of a Word file.

### Documents & data

| Format | Read | Mask | Reconstruct | Status |
|--------|:----:|:----:|:-----------:|--------|
| Excel `.xlsx` `.xls` | yes | yes | full `.xlsx` | **stable** — cell-level masking, catches secrets embedded in narrative cells |
| CSV / TSV | yes | yes | same format | **stable** — treated as plain text, format trivially preserved |
| JSON / JSONL / JSON5 | yes | yes | same format | **stable** |
| YAML / TOML | yes | yes | same format | **stable** |
| XML | yes | yes | same format | **stable** |
| Markdown | yes | yes | same format | **stable** |
| Word `.docx` | yes | yes | full `.docx` | **best-effort** — works on simple documents; secrets that span Word run boundaries (text split at format changes) can slip through. Tracked in v1.1. |
| PowerPoint `.pptx` | yes | yes | full `.pptx` | **best-effort** — same split-run caveat as DOCX |
| PDF `.pdf` | yes | yes | masked `.md`* | **text-only** — extracts text and writes a masked `.md` (markdown wrapper) by default, or `.txt` if you pass `-o file.txt`. The output is *not* a real PDF. |

> *Real PDF round-trip (in → out) needs a heavy PDF rewriter (`pdf-lib` content-stream patching). Tracked in v1.1. For sharing context with Claude / ChatGPT, the masked `.md` output is what you'd want anyway.

The `.xlsx` cell-level masker handles three layouts cleanly:

```
Customers sheet               (whole-cell secrets)
Name           | Email                       | Phone
Alex Taylor    | alex.taylor@example.com     | +1-415-555-0188
              becomes
Alex Taylor    | [EMAIL_1]                   | [PHONE_1]

Notes sheet                   (secrets embedded in narrative)
"Customer email: alice@example.com -- follow up by EOW"
              becomes
"Customer email: [EMAIL_1] -- follow up by EOW"
```

### Source code & config — 40+ extensions

```
Python      .py  .pyw  .ipynb
JavaScript  .js  .mjs  .cjs  .jsx  .ts  .tsx
Java        .java  .kt  .scala  .groovy
Go          .go
Ruby        .rb
PHP         .php
Rust        .rs
C / C++     .c  .cpp  .cc  .cxx  .h  .hpp
C#          .cs
Swift       .swift
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

### Credentials

```
OpenAI Key         sk-proj-aBcDeF...      →  [OPENAI_KEY_1]
Anthropic Key      sk-ant-api03-...       →  [ANTHROPIC_1]
AWS Key            AKIAIOSFODNN7EXAMPLE   →  [AWS_KEY_1]
GitHub Token       ghp_aBcDeFgHiJ...      →  [GH_TOKEN_1]
Stripe Key         sk_live_aBcDeF...      →  [STRIPE_1]
Slack Token        xoxb-123456-...        →  [SLACK_1]
HuggingFace        hf_aBcDeFgHiJ...       →  [HF_TOKEN_1]
JWT Token          eyJhbGciOiJIUzI1...    →  [JWT_1]
Bearer Token       Bearer eyJhbGci...     →  [BEARER_1]
DB Connection      postgresql://user:p... →  [DB_CONN_1]
SSH Private Key    -----BEGIN RSA...      →  [SSH_KEY_1]
ENV Secret         API_KEY=abc123...      →  [ENV_SECRET_1]
Hex Secret         a1b2c3d4e5f6... (40+)  →  [HEX_SECRET_1]
```

### Personal info

```
Email              user@example.com       →  [EMAIL_1]
Phone              +1-555-0100            →  [PHONE_1]
IP Address         10.128.3.4             →  [IP_1]
Credit Card        4111 1111 1111 1111    →  [CC_1]
National ID        123-45-6789            →  [SSN_1]
Passport           AB12345678             →  [PASSPORT_1]
Date of Birth      DOB: 15/03/1990        →  [DOB_1]
Age                age: 34                →  [AGE_1]
Full Name          Alex Taylor            →  [FULL_NAME_1]
```

> Run `kakashi list-patterns` to see every active rule, including international ID coverage.

---

## Three Masking Modes

```bash
kakashi mask file.env --mode typed    # [EMAIL_1] [DB_CONN_2]  ← default, keeps doc readable
kakashi mask file.env --mode redact   # [REDACTED]             ← maximum anonymity
kakashi mask file.env --mode fake     # user_a@example.com     ← preserves LLM context
```

**Consistency guarantee:** the same original value gets the same replacement throughout the document. The masked file still makes sense to the AI.

---

## Inside Your Agent — Real Usage

### Claude Code

```
You: hey claude, can you review this report for formatting issues?

Claude: Before I look at it, let me scan it first.
        Running: kakashi scan Q1_report.xlsx

        12 findings  (0 id & documents · 12 personal info · 0 credentials)

        Masking now... Done. Reviewing masked_Q1_report.xlsx instead.
        Here's what I found with the formatting:
```

### Cursor

```
You: /kakashi-scan config/database.yml

kakashi: 3 findings  (0 id & documents · 0 personal info · 3 credentials)
         Run kakashi mask <file> to apply -- no previews shown.

         Want the full original -> token mapping? Type
         /kakashi-audit config/database.yml (note: that exposes
         plaintext secrets to this conversation).
```

### Codex CLI

```bash
$ codex "fix the auth bug in src/middleware/auth.py"
# kakashi auto-scans the file first
# [scan] 1 finding (0 id, 0 personal info, 1 credential) -- masking now
# Codex sees: JWT_SECRET = "[HEX_SECRET_1]"
```

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

### Excel / Word document

```diff
- National ID: 123-45-6789
- Full Name: Alex Taylor
- Email: alex.taylor@example.com
- Phone: +1-555-0100
+ National ID: [SSN_1]
+ Full Name: [FULL_NAME_1]
+ Email: [EMAIL_1]
+ Phone: [PHONE_1]
```

### Python file

```diff
- DB_PASS = "Pr0d_P@55w0rd!"
- API_KEY = "sk-proj-xK9mN2pQrStUvWxYz"
- ADMIN_EMAIL = "admin@example.com"
+ DB_PASS = "[ENV_SECRET_1]"
+ API_KEY = "[OPENAI_KEY_1]"
+ ADMIN_EMAIL = "[EMAIL_1]"
```

---

## Commands

```
kakashi scan   <file>          Scan and report — nothing written
kakashi mask   <file>          Mask and reconstruct original format
kakashi audit  <file>          Full original → replacement map
kakashi mask-dir <dir> -r      Mask all supported files recursively
kakashi stats                  Cumulative session stats
kakashi list-patterns          All active detection patterns

Flags:
  --mode typed|redact|fake     Replacement style (default: typed)
  --whitelist val1,val2        Values to never mask
  --output path/to/masked/     Output path
  --overwrite                  Replace original (asks confirmation)
  --stdin                      Read from stdin, write to stdout
  -v, --verbose                Show per-finding previews on `scan`
                               (NOT agent-safe — default is counts-only)

Alias: k   (e.g. k scan file.txt)
```

---

## How Kakashi compares

There are plenty of secret scanners and PII libraries. None of them sit *inside* your AI agent and mask real-world document formats locally. That gap is what Kakashi fills.

| Tool | Runs inside AI agent | Local-only | Masks (not just detects) | PDF/Word/Excel reconstruct | One-line install |
|------|:---:|:---:|:---:|:---:|:---:|
| **Kakashi** | **Yes (20+ agents)** | **Yes** | **Yes** | **Yes** | **Yes** |
| GitLeaks | No | Yes | No detect-only | No | partial |
| TruffleHog | No | Yes | No detect-only | No | partial |
| detect-secrets (Yelp) | No | Yes | No detect-only | No | partial |
| Microsoft Presidio | No (Python SDK) | Yes | Yes | No text only | No heavy stack |
| AWS Comprehend / Macie | No | No cloud | Yes | No | No |
| Google DLP / Azure PII | No | No cloud | Yes | No | No |
| Skyflow / Tonic Textual | No | No cloud | Yes | partial | No |
| `redact-pii` / `pii-redact` (npm) | No | Yes | partial | No | Yes |
| Generic Cursor/Claude rules | Yes but DIY | Yes | No no engine | No | No |

**Where Kakashi is genuinely the only option:**

- The only open-source tool that ships as a **skill / rule for 20+ AI coding agents** out of the box (Claude Code, Cursor, Codex, Windsurf, Cline, Copilot, Continue, Aider, Roo, Kilo, OpenHands, Warp, Replit, Augment, Junie).
- The only one that **masks `.docx`, `.xlsx`, `.pptx` while reconstructing the original format** — you get a real Word/Excel file back, not a text dump.
- The only one with a **single-binary install** (`npm i -g @muhammadatef/kakashi`) that wires the slash commands into every detected agent.
- 100% local. **Zero network calls** during scan/mask. No telemetry. The installer hits npm once; after that, offline.

GitLeaks/TruffleHog only catch leaks that already made it into git. Presidio is great but you have to build all the agent integration yourself. Cloud DLP services defeat the purpose by sending the data they're meant to protect to a third party. Kakashi is the only one designed for the *moment of leak* — the millisecond between you pasting a file and your agent shipping it to an external LLM.

---

## Privacy Guarantee

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   kakashi never phones home.                                │
│                                                             │
│   All masking runs in-process on your machine.              │
│   No file content, no findings, no metadata                 │
│   is sent anywhere.                                         │
│                                                             │
│   The installer makes network calls exactly once —          │
│   to npm, to fetch the package.                             │
│   After that: zero. Offline capable.                        │
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
**`kakashi mask`** — the mask hides everything.

---

## Uninstall

```bash
# Remove from all agents
npx -y github:Muhammadatef/kakashi -- --uninstall

# Or from one only
npx -y github:Muhammadatef/kakashi -- --uninstall --only cursor
```

Clean. Leaves no trace. Like a ninja.

---

## Contributing

Patterns, formats, agents — all welcome.

```bash
git clone https://github.com/Muhammadatef/kakashi
cd kakashi
npm install
npm test
```

New pattern? Add to `src/engine/patterns.js`.<br/>
New format? Add a handler under `src/engine/formats/`.<br/>
New agent? Add to the `AGENTS` array in `bin/install.js`.

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full guide.

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
