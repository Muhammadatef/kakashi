# Implementation prompt — Kakashi production readiness (23 Sept 2026)

Use this file as the work order for the next implementation session. Goal: anyone who installs Kakashi from npm, or types `/kakashi` in Cursor / Claude / Codex, gets a complete, OS-safe privacy gate that **thinks, acts, and reacts** — especially for Guardian — and that **picks the right tool without the user memorizing slash commands**.

Repo: `@muhammadatef/kakashi` (this checkout). Current package version on npm is **1.2.0**. Work in this session is **unreleased**.

Companion file: `commands_to_run_to_test.md`.

---

## Product outcome (non-negotiable)

1. **Any OS.** `irm | iex` (Windows), `curl | bash` (macOS/Linux/WSL), and `npm install -g @muhammadatef/kakashi` must all finish **both** steps: CLI on PATH **and** agent slash commands + rules.
2. **`/kakashi` is the orchestrator.** If the user types only `/kakashi` (optionally with a path, a folder, a DB hint, or a sentence of intent), Kakashi must choose `scan`, `scan-dir`, `mask`, `mask-dir`, `guard`, `db-scan`, `db-mask`, `agent-guard`, `stats`, `list-patterns`, or `impact` as needed. The user must not need to know `/kakashi-guard` exists.
3. **Guardian is visible as a loop.** When the release question is “may this agent receive this data for this task?”, show Observe → Understand task → Assess risk → Plan → Act → Verify → Replan/fail-closed. Then honour `ALLOW` / `ALLOW_WITH_TRANSFORMATION` / `REQUIRE_APPROVAL` / `BLOCK`. Never self-approve.
4. **Agent-safe by default.** Counts, classes, decisions, `releasePath`. No `--verbose`, no `audit` / `db-audit`, no `--include-values` in agent-visible output unless the human explicitly asked.
5. **Real value.** After one install, a government or enterprise user can: stop a leaky file, scan an estate, mask DB rows, and get a Guardian decision they can defend — on Windows, macOS, and Linux.

---

## What this session already changed (do not redo; verify and ship)

These edits exist in the working tree. They are **not on npm** until you publish. They are **not on GitHub `main`** until you push. Until then, other users still hit the old bugs.

### Installer (all Windows one-liner users were broken)

- `install.ps1` no longer treats npm stderr (`npm fund`) as failure and no longer uses `$MyInvocation.MyCommand.Path` as the only way to find `bin/install.js` (that path is **null** under `irm | iex`).
- After `npm install -g`, both `install.ps1` and `install.sh` resolve `install.js` from `npm root -g`.
- New CLI: `kakashi setup [--all|--only|--force|--list|--uninstall]`.
- New `bin/postinstall.js`: runs agent install **only** when `npm_config_global === 'true'`.
- Tests in `tests/installer.test.js` lock this contract.

### Slash commands (1.2 surfaces were missing from the `/` picker)

Was only: scan, mask, audit, stats, list.

Now in `commands/` and `bin/install.js` `SLASH_CMDS` (14 total):

| Command | Purpose |
| --- | --- |
| `/kakashi` | Session privacy mode (still too weak — see work below) |
| `/kakashi-scan` | One file, counts |
| `/kakashi-mask` | `masked_` sibling |
| `/kakashi-scan-dir` | Folder / PDPL report |
| `/kakashi-mask-dir` | Batch mask |
| `/kakashi-guard` | Guardian decision |
| `/kakashi-db-scan` / `/kakashi-db-mask` | Query results |
| `/kakashi-db-audit` / `/kakashi-audit` | Human-only, secrets |
| `/kakashi-agent-guard` | Loopback sidecar |
| `/kakashi-impact` / `/kakashi-stats` / `/kakashi-list` | Evidence |

Rules tables updated in `src/rules/kakashi-activate.md`, `AGENTS.md`, `CLAUDE.md`. Local Cursor hooks were written with `node bin/install.js --only cursor --force --with-init`.

---

## Blockers (still open)

### Ship / distribution

- [ ] **Publish a new npm version** after the remaining UX work. Until then: `kakashi setup` does not exist on the 1.2.0 binary users already have; `postinstall` does not run; one-liner still fetches **old** `install.ps1` from GitHub `main`.
- [ ] **Push `install.ps1` / `install.sh` to `main` first** if you want the one-liner fixed before the npm bump (raw GitHub script + existing 1.2.0 `install.js` is enough for agent hooks).
- [ ] **Document the two-step truth** until publish: CLI ≠ Cursor commands. Repair today: `node bin/install.js --all --force`.
- [ ] Users must **start a new Agent chat** after command files change, or the `/` picker stays stale.

### `/kakashi` orchestrator (highest product gap)

`commands/kakashi.md` only says “scan then mask” and lists other slashes. That is not production behaviour.

Required behaviour when the user runs **`/kakashi` only** (or `/kakashi` + a sentence / path):

1. **Observe the ask** (do not `@`-attach secrets). Classify: one file, folder, database, standing sidecar, or “may I release this to an agent/model?”
2. **Pick tools.** Examples:
   - File share / “is this safe?” → `scan`; if findings → explain, offer or run `mask` or `guard` by destination.
   - Folder / “estate” / “repo” / “compliance report” → `scan-dir` (HTML/JSON, never `--include-values`).
   - “Mask everything in …” → confirm if large, then `mask-dir -r`.
   - “Can Cursor/Codex send this to the model?” / any release decision → **`guard --json`**, not a silent mask.
   - Connection string + query / `mock:customers` → `db-scan` then `db-mask`.
   - “Keep watching” / IDE sidecar → `agent-guard` on loopback only.
   - “What do you detect?” / “impact” → `list-patterns` / `impact` / `stats`.
3. **Chain.** Scan counts → if the destination is an external model, escalate to Guardian. If Guardian returns `releasePath`, use **only** that path. If `REQUIRE_APPROVAL` or `BLOCK`, stop and ask a human.
4. **Narrate the loop** (next section) so the user sees thinking, acting, reacting — not a silent shell dump.
5. **Never** require the user to type `/kakashi-scan-dir` or `/kakashi-guard` for those paths to happen.

Rewrite `commands/kakashi.md` as this orchestrator. Mirror the same policy in `src/rules/kakashi-activate.md` (always-on Cursor rule) so it applies even when they did not type `/kakashi`.

### Guardian “think / act / react” UX

CLI `kakashi guard` already runs observe → task → assess → plan → act → verify → replan. Human terminal output (`src/guardian/render.js`) already has OBSERVE / ASSESS / PLAN / VERIFY sections. Agent path uses `--json` (correct: no secrets).

**Gap:** in Agent chat the user sees a JSON blob or a one-line decision. That does not feel like a guardrail engine.

Implement a **value-free live narrative** for `/kakashi-guard` and for `/kakashi` when it escalates to Guardian:

```text
THINK    What is being asked, by which agent, for which destination?
OBSERVE  Finding counts + classes only (no values). Task intent if --task was set.
ASSESS   Risk score / level / reason codes.
PLAN     Tools per class (tokenize / redact / keep) and why.
ACT      Write guarded_* (or write nothing if fail-closed).
VERIFY   Re-scan passed? residual classes?
REACT    Decision + what the agent is allowed to do next.
```

Rules:

- Stream this from the JSON decision (`decision`, `reasonCode`, `risk`, `task`, `event.actions`, `verificationPassed`, `releasePath`, `approvalsNeeded`). Do **not** open the source file or run `audit` to “explain”.
- If `--task` is missing, ask one short question, then run. An unstated purpose must make protection **stricter**, never weaker (already engine policy).
- Honour exits: `0` use `releasePath` only; `3` stop for human; `4` do not release; `2` fail closed.
- Optional CLI flag e.g. `--trace` that prints the same stages to a human terminal without secrets (keep default `--json` for agents).

### OS / runtime blockers seen on Windows (23 Sept)

- [ ] **`pdf-parse` missing or empty under `node_modules`** — `npm test` collapsed (CLI, formats, OOXML, Guardian, i18n). Reinstall deps until `require('pdf-parse')` works; add a CI check that optional/required format deps resolve.
- [ ] **`agent-guard` + `fs.watch` on some Windows/G: paths** throws `UNKNOWN: unknown error, watch`. Bind still printed `127.0.0.1:<port>/health` then died. Need a fallback (polling, or degrade to no-watch HTTP API) so the sidecar is production-usable on Windows.
- [ ] PowerShell treats Kakashi stderr as `NativeCommandError` (`scan-dir` progress). Prefer progress on stderr but document `$ErrorActionPreference`, or detect TTY and stay quiet for agents.
- [ ] Global `kakashi impact` snapshot reported `kakashiVersion: 1.1.0` while CLI was 1.2.0 — version must come from `package.json`.
- [ ] `Start-Process kakashi` on Windows fails (npm shim is not a native exe). Docs and sidecar helpers must use `kakashi.cmd` or `node "$(npm root -g)\@muhammadatef\kakashi\bin\kakashi.js"`.

### Safety / UX polish

- [ ] `@file` in Cursor attaches the body **before** Kakashi runs. Orchestrator and every command file must keep the existing warning and prefer path strings.
- [ ] Confirm before `mask-dir` on a large tree.
- [ ] Never echo live DB URLs. Demo adapter remains `mock:customers --query demo`.
- [ ] New-chat hint after `kakashi setup` so slash commands appear.
- [ ] Arabic CLI (`--lang ar`) and Arabic HTML `scan-dir` must stay in the happy path on Windows, not only bash.

### Tests you must add or restore

- [ ] Green `npm test` on Windows after `pdf-parse` is a real package.
- [ ] Installer tests already exist — keep them.
- [ ] Slash-command coverage test (folder + Guardian + DB) already exists — keep it.
- [ ] New: orchestrator fixture — given “can Cursor send employees.md to an external model to average salary?”, the documented agent steps must call `guard`, not only `mask`.
- [ ] New: Guardian narrative contains stage labels and **no** fixture secrets.
- [ ] New: Windows one-liner smoke (or a scripted `iex` of `install.ps1` with a mock npm) so Path-null cannot regress.
- [ ] Sidecar test on Windows without relying on `fs.watch` if watch is unavailable.

---

## Implementation order

1. Fix local `npm install` so `pdf-parse` loads; `npm test` green on this Windows checkout.
2. Rewrite `commands/kakashi.md` + `kakashi-activate.md` as the orchestrator + Guardian narrative (this is the user-visible value).
3. Harden `agent-guard` watch on Windows; fix impact `kakashiVersion`.
4. Push installer scripts to `main`; publish npm; run `commands_to_run_to_test.md` on Windows **and** one Unix environment.
5. Only then call the product production-ready.

---

## Acceptance checklist

- [ ] Fresh Windows VM: `irm https://raw.githubusercontent.com/Muhammadatef/kakashi/main/install.ps1 | iex` prints install complete, `kakashi --version` works, `~\.cursor\commands\kakashi-guard.md` exists.
- [ ] Fresh Unix: curl one-liner does the same for `~/.cursor/commands`.
- [ ] `npm install -g @muhammadatef/kakashi@latest` writes slash commands via postinstall; `kakashi setup --list` shows Cursor ●.
- [ ] New Cursor Agent chat: `/` shows scan-dir, guard, db-*, agent-guard, impact.
- [ ] `/kakashi` + “check this folder” runs `scan-dir` without the user naming that command.
- [ ] `/kakashi` + “can the model use this file to average salary by department?” runs Guardian, prints THINK/OBSERVE/ASSESS/PLAN/ACT/VERIFY/REACT, and only offers `releasePath` on transform.
- [ ] Credential file + “summarize for an external model” → `REQUIRE_APPROVAL` or `BLOCK`, no artifact, agent stops.
- [ ] Demos: `.\demos\run-all.ps1` and `./demos/run-all.sh` both end with `ALL 6 SELECTED DEMOS PASSED`.
- [ ] No secrets in agent transcripts from default commands.

---

## Out of scope

- Do not weaken Guardian so an agent can self-approve.
- Do not add network calls or telemetry.
- Do not replace `install.js` agent matrix; extend it.
- Do not dump `audit` into Agent chat as “better UX”.
