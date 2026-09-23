---
description: Activate Kakashi and let it pick the right tool for what the user asked -- shows the features brief on bare invocation, dispatches by intent
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
  released to a specific agent / destination for a specific task.
  Guardian observes, understands the task, assesses risk, plans, acts,
  verifies, and either ALLOWs the transformed release, requires human
  approval, or blocks. It never self-approves.
- **Standing sidecar** — run a loopback-only HTTP daemon (`agent-guard`)
  that any MCP-enabled agent can consult before shipping data.

Detection coverage: 35+ patterns spanning government IDs, passports,
visas, IBANs, credit cards, emails, phones, IPs, dates, names, ages, plus
every common credential class (OpenAI / Anthropic / AWS / GitHub / Stripe
/ JWT / SSH / DB connection strings / SQL passwords / `.env` secrets /
arbitrary high-entropy hex). 50+ file formats. Six database drivers.

**If `/kakashi` was typed alone with no additional intent**, show the
brief above, give 4-5 example prompts the user can send next, and ask
what they want to do. Do NOT run any Kakashi subcommand yet.

**If `/kakashi` was typed with a sentence of intent, a file path, a
directory, a database URL, or a release question**, jump straight to the
dispatch table below and pick the right subcommand.

`/kakashi` used alone means: **choose the correct Kakashi tool from the
user's intent and run it, narrating each step.** The user must never
need to know that `/kakashi-scan-dir` or `/kakashi-guard` exists. If
they typed a specific `/kakashi-<subcommand>`, use its dedicated command
file instead.

---

## Triggers you must recognise (case-insensitive)

Match any of these — with **or without** a leading `/`, in **any letter
case** — as an invocation of this orchestrator:

- `kakashi`, `Kakashi`, `KAKASHI`, `/kakashi`, `/Kakashi`, `/KAKASHI`
- `use kakashi`, `run kakashi`, `activate kakashi`, `start kakashi`
- `help me with kakashi`, `kakashi help`, `kakashi status`

The Codex CLI user who filed the original bug typed `/Kakashi` (capital
K). Do not require the exact lowercase spelling before recognising the
orchestrator trigger.

---

## Agents that don't have a native slash-command mechanism

Codex CLI, GitHub Copilot, and Continue do **not** parse
`~/.<agent>/commands/*.md` files as user-invokable slash commands. In
those agents, typing `/kakashi` or `/Kakashi` will make the agent
runtime itself reply `Unrecognized command '/kakashi'`. **That is not
the end of the interaction — it is the beginning.** The user's next
plain-language message ("use kakashi to check this file", "kakashi
this folder", "can I send this to Claude?") is the real trigger.
Recognise it using the list above and dispatch normally.

Never tell the user "kakashi is not a valid slash command in this
agent". Always show the brief and offer the dispatch instead.

---

## The dispatch table -- pick one path per turn

Read what the user said. Match it against these rows top-to-bottom; use
the first row that fits.

| The user says or implies... | Run this Kakashi flow | Why |
| --- | --- | --- |
| "may I send / release / share / paste this file to / into an external model / another agent?" or gives an agent + task + destination | **`guard`** → narrate THINK/OBSERVE/ASSESS/PLAN/ACT/VERIFY/REACT; honour exit 0/3/4 | The question is a release decision. Only Guardian authorises releases. |
| "is this file safe?" / "check this file" / "scan this file" + one file path | **`scan`** on that file; if findings > 0, offer `mask` or (if destination is stated) `guard` | Single-file privacy check. |
| "mask / redact / anonymise this file" | **`scan`** → then **`mask`** the file → then re-scan the masked sibling | Two-step so the user sees the finding profile before the write. |
| "check / scan / audit this folder / repo / project / directory / drive" | **`scan-dir`** with `-f html -o kakashi-report.html`; offer JSON with `-f json` for CI | Estate-level compliance report. |
| "compliance report" / "PDPL report" / "estate scan" / "audit this codebase" | **`scan-dir`** with `-f html`; mention PDPL article citations in the summary | Same as above; frame the output as regulatory evidence. |
| "mask everything in this folder" / "batch mask" + a directory | Confirm size first → then **`mask-dir <dir> -r`** | Destructive-adjacent (many new files). Never skip the confirmation. |
| "run a query and mask" / "get rows from Postgres/MySQL/Mongo/Snowflake/Databricks/SQLite" / "check this database query" | **`db-scan`** first (counts) → then **`db-mask`** to write a safe local copy | Rows never enter agent context. Source DB is read-only. |
| "start a watch / sidecar / daemon" / "watch this folder while I work" / "I want an HTTP endpoint any agent can call" | **`agent-guard --watch <dir> --port 8797`** on loopback; describe `/health`, `/scan`, `/mask` | The IDE sidecar mode. Never binds anything but 127.0.0.1. |
| "what does Kakashi detect?" / "which patterns are active?" | **`list-patterns`** | Read-only capability discovery. |
| "how much has Kakashi caught?" / "impact snapshot" / "cumulative stats" | **`impact`** (with `--write` if they want a file) | Value-free adoption metric. |
| "session stats" / "how many files today?" | **`stats`** | Local counters. |
| "walk me through / prove it / show me the mapping" (explicit, single file, human present) | **`audit`** — but WARN first that this echoes plaintext into the agent context | Deliberately verbose. Only when explicitly asked. |
| "walk me through the DB / prove it / show me the row mapping" (explicit) | **`db-audit`** — same warning as `audit` | Human-only. |

If none of the rows fit, ask **one** short question:
> "Are you asking me to check a file, scan a folder, mask a database query,
> or decide whether a specific file may be released to an agent?"

Then re-dispatch from the answer. Do not guess.

---

## Narrate every step

The user must see what you decided and why. Before you run the shell
command, say (one short sentence each):

- **CHOSE** — which Kakashi command you picked from the dispatch table.
- **WHY** — the row in the table that matched what they said.

After the command runs, report:

- What the exit code means (0 clean, 1 findings, 2 error, 3 approval,
  4 block).
- The category / severity / PDPL summary.
- The next step you recommend (if any) — but do not run it without
  asking unless the initial request already implied it (e.g. "scan then
  mask this file" is a single implied chain; "scan this folder" is not).

Never dump raw shell output silently. Never open a source file yourself
to "see what's inside" — that defeats the point.

---

## Chain rules

- **Scan → Mask → Re-scan.** When the user says "mask this file", always
  run `scan` first (so they see what will be replaced), then `mask`,
  then re-scan the `masked_*` sibling to prove the output is clean.
- **Scan → Guard.** When the user asks about sending a file to a
  specific destination (external model, another agent, a human outside
  the session), do not stop at `scan`. Escalate to `guard --json` with
  the stated agent and task; honour the JSON decision.
- **db-scan → db-mask.** For a "safe local copy of these rows", first
  `db-scan` to show counts, then `db-mask` to write the CSV / JSONL. Do
  not run `db-mask` as the first step — the user should see the finding
  profile first.
- **scan-dir → guard (per file).** When a directory scan flags a
  specific file the user then wants to share, escalate that one file to
  Guardian rather than mass-masking the tree.

---

## Agent-safe defaults you must not weaken

- **Path strings, not `@`-mentions.** If the user typed `/kakashi
  @file.env`, say honestly: "I see the file body was already attached
  via `@`-mention; the secrets are already in this conversation's
  context. I'll still mask it so downstream shares are safe, but next
  time please pass the path: `/kakashi /path/to/file.env`." Then run
  the flow.
- **Never `--verbose`, never `audit`, never `db-audit`, never
  `--include-values`** in an agent-visible turn unless the user
  explicitly asked for that verbose output knowing it echoes plaintext
  into the conversation.
- **Never invent an approval.** If Guardian returns `REQUIRE_APPROVAL`
  (exit 3), stop and ask the human. Do not run a "smaller" mask
  instead. Do not offer a workaround.
- **Never bind agent-guard to a public interface.** It refuses non-
  loopback origins with 403; do not try to route around it with a
  tunnel.
- **Confirm before `mask-dir` on a large tree.** Ask for the file count
  first.
- **Never echo a live DB URL** into chat. Prefer `$DATABASE_URL` /
  `%DATABASE_URL%` / `mock:customers` for demos.

---

## Fall-back invocation

If `kakashi` is not on PATH, every command becomes
`npx -y @muhammadatef/kakashi <subcommand> ...`. On Windows, if
`Start-Process kakashi` fails (the npm shim isn't a native exe), use
`kakashi.cmd` or
`node "$(npm root -g)\@muhammadatef\kakashi\bin\kakashi.js" <args>`.

---

## Related dedicated command files

Anything more specific — the user typed the full slash — goes to that
file:

- `/kakashi-scan`, `/kakashi-mask`, `/kakashi-audit` (single file)
- `/kakashi-scan-dir`, `/kakashi-mask-dir` (directory)
- `/kakashi-guard` (release decision)
- `/kakashi-db-scan`, `/kakashi-db-mask`, `/kakashi-db-audit` (database)
- `/kakashi-agent-guard` (loopback sidecar)
- `/kakashi-stats`, `/kakashi-list`, `/kakashi-impact` (evidence)

Acknowledge on activation:
> "Kakashi privacy mode active. Tell me what you want to check, mask,
> report on, or release — I'll pick the right tool and show you every
> step. Try: 'check this file', 'scan this folder', 'mask these DB
> rows', or 'can I send this to Claude to summarise?'"
