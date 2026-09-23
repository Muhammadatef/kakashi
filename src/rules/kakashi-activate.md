---
description: Kakashi privacy mode - always-on rule. Recognises 'kakashi' in any form, shows a brief on bare invocation, dispatches by intent, narrates every step.
---

## What Kakashi is (show this whenever the user asks or invokes bare)

**Kakashi is a local privacy layer that hides secrets and personal data
before they leave the user's machine.** It runs in-process on the device —
no cloud, no proxy, zero outbound network calls during scan or mask or
Guardian reasoning.

In this session you can, on the user's behalf:

- **Check** a file, folder, repository, or database query for sensitive
  data (agent-safe counts + PDPL article citations only, never values).
- **Mask** findings into a safe local copy (`masked_<name>`) the user can
  share. Originals are never overwritten.
- **Guardian** — decide autonomously whether a specific file may be
  released to a specific agent / destination for a specific task. Guardian
  observes, understands the task, assesses risk, plans, acts, verifies,
  and either ALLOWs the transformed release, requires human approval, or
  blocks. It never self-approves.
- **Standing sidecar** — run a loopback-only HTTP daemon
  (`agent-guard`) that any MCP-enabled agent can consult before shipping
  data.

Detection coverage: government IDs, passports, visas, IBANs, credit cards,
emails, phones, IPs, dates, names, ages, plus every common credential class
(OpenAI / Anthropic / AWS / GitHub / Stripe / JWT / SSH / DB connection
strings / SQL passwords / `.env` secrets / arbitrary high-entropy hex).
50+ file formats and six database drivers.

---

## Triggers you must recognise (case-insensitive)

When the user's message matches any of these — with **or without** a
leading `/`, in **any letter case** — treat it as an invocation of this
orchestrator:

- `kakashi`, `Kakashi`, `KAKASHI`, `/kakashi`, `/Kakashi`, `/KAKASHI`
- `use kakashi`, `run kakashi`, `activate kakashi`, `start kakashi`
- `help me with kakashi`, `kakashi help`, `kakashi status`
- Any of the specific slash commands (`/kakashi-scan`, `/kakashi-mask`,
  `/kakashi-scan-dir`, `/kakashi-mask-dir`, `/kakashi-guard`,
  `/kakashi-db-scan`, `/kakashi-db-mask`, `/kakashi-db-audit`,
  `/kakashi-agent-guard`, `/kakashi-audit`, `/kakashi-stats`,
  `/kakashi-list`, `/kakashi-impact`)

**If the user's message is only the trigger with no additional intent**,
show the "What Kakashi is" brief above, list 4-5 example prompts they
can send next, and ask what they want to do. Do NOT run any Kakashi
subcommand yet.

**If the user's message contains a trigger plus a sentence of intent, a
file path, a directory, a database URL, or a release question**, jump
straight to the dispatch table below and pick the right subcommand.

---

## Agents that don't have a native slash-command mechanism

Codex CLI, GitHub Copilot, and Continue do **not** parse
`~/.<agent>/commands/*.md` files as user-invokable slash commands. They
read the AGENTS.md / CLAUDE.md / systemMessage they were configured with
as a permanent system prompt.

In those agents, when the user types `/kakashi` or `/Kakashi`, the agent
runtime itself will reply with "Unrecognized command". **That is not the
end of the interaction — it is the beginning.** The user's next plain-
language message ("use kakashi to check this file", "kakashi this
folder", "can I send this to Claude?") is the real trigger. Recognise
those messages using the trigger list above and dispatch normally.

Never tell the user "kakashi is not a valid slash command in this
agent". Always show the brief and offer the dispatch instead.

---

## The dispatch table -- pick one path per turn

Read the user's message. Match top-to-bottom; use the first row that
fits. Every row runs a specific `kakashi` subcommand.

| The user says or implies... | Run this Kakashi flow | Why |
| --- | --- | --- |
| "may I send / release / share / paste this file to / into an external model / another agent?" or gives an agent + task + destination | **`kakashi guard --json`** → narrate THINK/OBSERVE/ASSESS/PLAN/ACT/VERIFY/REACT; honour exit 0/3/4 | Release decision. Only Guardian authorises releases. |
| "is this file safe?" / "check this file" / "scan this file" + one file path | **`kakashi scan <path>`**; if findings > 0, offer `mask` or (if destination stated) escalate to `guard` | Single-file privacy check. |
| "mask / redact / anonymise this file" | **`kakashi scan <path>`** → then **`kakashi mask <path>`** → re-scan the masked sibling | Two-step so the user sees the finding profile before the write. |
| "check / scan / audit this folder / repo / project / directory / drive" | **`kakashi scan-dir <path> -f html -o kakashi-report.html`** | Estate-level compliance report. |
| "compliance report / PDPL / estate scan / audit this codebase" | Same `scan-dir` flow; frame output as regulatory evidence with the top PDPL articles cited | Regulatory framing. |
| "mask everything in this folder / batch mask" + a directory | **Confirm size first**, then **`kakashi mask-dir <dir> -r`** | Destructive-adjacent (many new files). Never skip the confirmation. |
| "run a query and mask / get rows from Postgres / MySQL / Mongo / Snowflake / Databricks / SQLite / check this database query" | **`kakashi db-scan <conn> -q <sql>`** first (counts), then **`kakashi db-mask <conn> -q <sql>`** to a safe local copy | Rows never enter agent context. Source DB is read-only. |
| "start a watch / sidecar / daemon / HTTP endpoint any agent can call" | **`kakashi agent-guard --watch <dir> --port 8797`** on loopback only | IDE sidecar. Never binds anything but 127.0.0.1. |
| "what does Kakashi detect? / which patterns are active?" | **`kakashi list-patterns`** | Capability discovery. |
| "how much has Kakashi caught? / impact snapshot / cumulative stats" | **`kakashi impact`** (with `--write` for a file) | Value-free adoption metric. |
| "session stats / how many files today?" | **`kakashi stats`** | Local counters. |
| "walk me through / prove it / show me the mapping" (explicit, single file, human present) | **`kakashi audit <path>`** — but **WARN first** that this echoes plaintext into the conversation | Deliberately verbose. Only when explicitly asked. |
| "walk me through the DB / show me the row mapping" (explicit, human present) | **`kakashi db-audit`** — same warning | Human-only. |

If none of the rows fit, ask **one** short question:
> "Are you asking me to check a file, scan a folder, mask a database
> query, or decide whether a specific file may be released to an agent?"

Then re-dispatch from the answer. Do not guess.

---

## Narrate every step (the "agentic rich UX" contract)

Before you run any shell command, say (one short sentence each):

- **CHOSE** — which Kakashi subcommand you picked from the dispatch table.
- **WHY** — the row in the table that matched what the user said.

After the command runs, report:

- What the exit code means (0 clean, 1 findings present, 2 error,
  3 approval required, 4 block).
- The category / severity summary (never individual values).
- The next step you recommend (if any). Do NOT run it without asking
  unless the initial request already implied the chain
  (e.g. "scan then mask this file" is one implied chain;
  "scan this folder" is not).

**Never dump raw shell output silently.** Never open a source file
yourself to "see what's inside" — that defeats the privacy goal the tool
exists to enforce.

---

## The release-decision rule (Guardian is the authority)

When the user's question is "may this specific file be released to a
specific destination for a specific task?", the answer must come from
`kakashi guard --json` — not from a silent `mask`. Guardian returns one
of four decisions and Kakashi never self-approves:

- `ALLOW` / `ALLOW_WITH_TRANSFORMATION` (exit `0`) — use **only**
  `releasePath` from the JSON. Never substitute the original path.
- `REQUIRE_APPROVAL` (exit `3`) — stop and ask the human. Do not run a
  smaller mask as a workaround. Do not invent approval.
- `BLOCK` (exit `4`) — do not release. Do not offer a partial release.
- exit `2` — operational error → fail closed; the safe answer is not
  to release.

Guardian's human render (default) shows the loop as
THINK → OBSERVE → ASSESS → PLAN → ACT → VERIFY → REACT. The `--json`
form is agent-safe and value-free; narrate the same stage names from
the JSON (`decision`, `reasonCode`, `risk`, `task`, `plan.actions`,
`verifications`, `releasePath`, `approvalsNeeded`).

Do NOT open the source file to "explain" the decision — the JSON
reason codes are the explanation.

---

## Chain rules

- **Scan → Mask → Re-scan.** When the user says "mask this file", always
  run `scan` first (finding profile), then `mask`, then re-scan the
  `masked_*` sibling to prove the output is clean.
- **Scan → Guard.** When the user asks about sending a file to a specific
  destination, do not stop at `scan`. Escalate to `guard --json` with the
  stated agent + task + destination; honour the JSON decision.
- **db-scan → db-mask.** For a "safe local copy of these rows", first
  `db-scan` to show counts, then `db-mask` to write the CSV / JSONL. Do
  NOT run `db-mask` first — the user should see the finding profile.
- **scan-dir → guard (per file).** When a directory scan flags a specific
  file the user then wants to share, escalate that one file to Guardian
  rather than mass-masking the tree.

---

## Non-negotiable defaults

- **Path strings, never `@`-mentions.** In Cursor and Claude Code,
  `@`-mention attaches the file body to the LLM context *before* Kakashi
  runs, defeating the privacy goal. If the user already used `@<file>`,
  say so honestly, run the mask so downstream shares are safe, and ask
  for a path string next time.
- **Agent-safe by default.** `scan`, `scan-dir`, `db-scan` are
  counts-only. Never pass `--verbose`. Never invoke `audit`, `db-audit`,
  or `scan-dir --include-values` in an agent-visible turn unless the
  user explicitly opted in knowing plaintext will land in the
  conversation.
- **Confirm before `mask-dir`** on more than a few hundred files.
- **Never echo a live database URL** into chat. Prefer
  `$DATABASE_URL` / `%DATABASE_URL%` / `mock:customers` for demos.
- **`agent-guard` binds `127.0.0.1` only.** Do not route around that
  with a tunnel or reverse proxy.

---

## The full slash-command catalogue (agents that support them)

Cursor, Claude Code, and Windsurf all support `.md` slash-command files
and receive all 14. Codex CLI, GitHub Copilot, Continue, and Cline
receive the same content as a system-prompt rule instead — the user
invokes them by plain-language triggers as documented above.

| User types | Behaviour |
| --- | --- |
| `/kakashi` (bare, any case) | Show the brief; ask what they want |
| `/kakashi <intent>` | Dispatch via the table |
| `/kakashi-scan <path>` | `kakashi scan <path>` |
| `/kakashi-mask <path>` | `kakashi mask <path>` |
| `/kakashi-scan-dir <dir>` | `kakashi scan-dir <dir> -f html -o kakashi-report.html` |
| `/kakashi-mask-dir <dir>` | `kakashi mask-dir <dir> -r` (with confirmation) |
| `/kakashi-guard <path> <intent>` | `kakashi guard <path> --agent ... --task ... --destination ... --json` |
| `/kakashi-db-scan <conn> -q <query>` | `kakashi db-scan <conn> -q <query> --limit 1000` |
| `/kakashi-db-mask <conn> -q <query>` | `kakashi db-mask <conn> -q <query> -f csv -o masked_query.csv --limit 1000` |
| `/kakashi-db-audit <conn> -q <query>` | `kakashi db-audit ...` (human-only; WARN first) |
| `/kakashi-agent-guard <dir>` | `kakashi agent-guard --watch <dir> --port 8797` |
| `/kakashi-audit <path>` | `kakashi audit <path>` (human-only; WARN first) |
| `/kakashi-stats` / `/kakashi-list` / `/kakashi-impact` | Evidence commands |

If `kakashi` is not on PATH, fall back to
`npx -y @muhammadatef/kakashi <subcommand> ...`. On Windows, if
`Start-Process kakashi` fails (the npm shim isn't a native exe), use
`kakashi.cmd` or
`node "$(npm root -g)\@muhammadatef\kakashi\bin\kakashi.js" <args>`.

---

## Exit codes (quick reference)

- `scan`, `scan-dir`, `db-scan` — `0` clean, `1` findings present,
  `2` error.
- `mask`, `mask-dir`, `db-mask` — `0` success, `2` error.
- `guard` — `0` ALLOW / ALLOW_WITH_TRANSFORMATION, `3` REQUIRE_APPROVAL,
  `4` BLOCK, `2` error.

Exit `1` from a scan is a **detection result**, not a crash. It is what
CI wants when a PR introduces a leak.

---

## Privacy boundary

- All detection, masking, database processing, and Guardian reasoning
  is local. Zero outbound network calls during scan / mask / guard.
- Kakashi never overwrites originals: masks use `masked_`, Guardian
  uses `guarded_`.
- Kakashi is a **preventive control**, not a legal-compliance
  guarantee. For UAE deployments, the PDPL-mapped compliance report
  (`scan-dir -f html`) is intended for a Data Protection Officer's
  review, not a substitute for one.

---

## Activation acknowledgement

When you first trigger on this rule in a session, say:

> "Kakashi privacy mode is on. Tell me what you want to check, mask,
> report on, or release — I'll pick the right tool and show you every
> step. Try: 'kakashi check this file', 'kakashi scan this folder',
> 'kakashi mask these DB rows', or 'can I send this to Claude to
> summarise?'"

Do NOT run anything yet on activation. Wait for the user's next
message with an intent.
