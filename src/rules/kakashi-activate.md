---
description: Kakashi privacy mode - always-on rule that picks the right tool from user intent
---

You have Kakashi available (a local-first privacy layer for files, folders,
databases, and agent release decisions). Whenever the user's request touches
sensitive data, **pick the right Kakashi tool from their intent and narrate
each step**. The user should never need to know which subcommand exists.

## When to act automatically

Trigger Kakashi any time the user says or implies one of:

- "share / paste / send / attach this file to (a model / another agent / a
  human outside this session)" — always a **release decision** → run
  `kakashi guard` with the stated agent + task + destination and narrate
  THINK / OBSERVE / ASSESS / PLAN / ACT / VERIFY / REACT. Honour exit codes
  strictly.
- "check / scan / is this safe" + a single file → `kakashi scan <path>`.
- "mask / redact / anonymise this file" → `kakashi scan <path>` (show the
  finding profile) → `kakashi mask <path>` → re-scan the `masked_*` sibling.
- "check / scan / audit this folder / repo / project / directory / drive" →
  `kakashi scan-dir <path> -f html -o kakashi-report.html`.
- "compliance report / PDPL / estate scan / audit this codebase" → same
  `scan-dir` flow; frame the output as regulatory evidence with the top
  PDPL articles cited.
- "batch mask this folder" → **confirm size first**, then
  `kakashi mask-dir <dir> -r`.
- "run a query and mask" / any Postgres / MySQL / Mongo / Snowflake /
  Databricks / SQLite reference plus a query → `kakashi db-scan` first,
  then `kakashi db-mask` to a local safe copy. Never `db-audit` in agent
  chat.
- "watch this folder / sidecar / daemon / HTTP endpoint for my IDE" →
  `kakashi agent-guard --watch <dir> --port 8797` on loopback only.
- "what does Kakashi detect / which patterns" → `kakashi list-patterns`.
- "how much has Kakashi caught / impact snapshot" → `kakashi impact`.

If the intent is ambiguous, ask **one** short question:
> "Are you asking me to check a file, scan a folder, mask a database query,
> or decide whether a specific file may be released to an agent?"

## The release-decision rule (Guardian is the authority)

When the user's question is "may this specific file be released to a
specific destination for a specific task?", the answer must come from
`kakashi guard --json` — not from a silent `mask`. Guardian returns one of
four decisions and Kakashi never self-approves:

- `ALLOW` / `ALLOW_WITH_TRANSFORMATION` (exit `0`) — use **only**
  `releasePath` from the JSON. Never substitute the original path.
- `REQUIRE_APPROVAL` (exit `3`) — stop and ask the human. Do not run a
  smaller mask as a workaround. Do not invent approval.
- `BLOCK` (exit `4`) — do not release. Do not offer a partial release.
- exit `2` — operational error → fail closed; the safe answer is not to
  release.

Narrate Guardian's stages from the JSON (`decision`, `reasonCode`, `risk`,
`task`, `plan.actions`, `verifications`, `releasePath`, `approvalsNeeded`).
Do NOT open the source file to "explain" the decision; the JSON reason
codes are the explanation.

## Non-negotiable defaults

- **Path strings, never `@`-mentions.** In Cursor, `@`-mention attaches the
  file body to the LLM context *before* Kakashi runs, defeating the
  privacy goal. If the user already used `@<file>`, say so honestly, run
  the mask so downstream shares are safe, and ask for a path string next
  time.
- **Agent-safe by default.** `scan`, `scan-dir`, `db-scan` are counts-only.
  Never pass `--verbose`. Never invoke `audit`, `db-audit`, or
  `scan-dir --include-values` in an agent-visible turn unless the user
  explicitly opted in knowing it prints plaintext into the conversation.
- **Confirm before `mask-dir`** on more than a few hundred files.
- **Never echo a live database URL** into chat. Prefer
  `$DATABASE_URL` / `%DATABASE_URL%` / `mock:customers` for demos.
- **agent-guard binds `127.0.0.1` only.** Do not route around that with a
  tunnel or reverse proxy.

## Slash commands installed in this session

If the user prefers explicit commands, they can type any of these — each
maps to its dedicated command file:

| User types | Runs |
| --- | --- |
| `/kakashi` | Smart orchestrator (this rule, made explicit) |
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
`npx -y @muhammadatef/kakashi <subcommand> ...`.

## Exit codes (quick reference)

- `scan`, `scan-dir`, `db-scan` — `0` clean, `1` findings present, `2` error.
- `mask`, `mask-dir`, `db-mask` — `0` success, `2` error.
- `guard` — `0` ALLOW / ALLOW_WITH_TRANSFORMATION, `3` REQUIRE_APPROVAL,
  `4` BLOCK, `2` error.

Exit `1` from a scan is a **detection result**, not a crash. It is what the
CI matrix wants when a PR introduces a leak.

## Privacy boundary

- All detection, masking, database processing, and Guardian reasoning is
  local. Zero outbound network calls during scan / mask / guard.
- Kakashi never overwrites originals: masks use `masked_`, Guardian uses
  `guarded_`.
- Kakashi is a **preventive control**, not a legal-compliance guarantee.
  For UAE deployments, the PDPL-mapped compliance report (`scan-dir -f html`)
  is intended for a Data Protection Officer's review, not as a substitute
  for one.
