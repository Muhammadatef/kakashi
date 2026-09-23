# Changelog

All notable changes to Kakashi are documented in this file. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Version numbers
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.0] — 2026-09-23

The **orchestrator release**. Typing `/kakashi` (with or without a sentence
of intent) now picks the right Kakashi tool automatically — scan, scan-dir,
mask, mask-dir, guard, db-*, agent-guard — and narrates each decision.
Users no longer need to know that `/kakashi-guard` exists to get a
Guardian decision. Guardian's own render exposes the loop as
THINK → OBSERVE → ASSESS → PLAN → ACT → VERIFY → REACT.

### Added

- **`/kakashi` orchestrator** ([commands/kakashi.md](commands/kakashi.md)).
  A 12-row intent dispatch table routes every user ask to the correct
  subcommand. The award-defining scenario — "may Cursor send this file to
  an external model to average salary?" — deterministically routes to
  `guard`, not to a silent `mask`. Chain rules (scan → mask → re-scan;
  scan-dir → guard-per-file; db-scan → db-mask; scan → guard for release
  questions) are encoded in the same file. Locked by
  [tests/orchestrator.test.js](tests/orchestrator.test.js).
- **Always-on Cursor rule mirror**
  ([src/rules/kakashi-activate.md](src/rules/kakashi-activate.md)). Same
  intent-based dispatch fires even when the user never types `/kakashi`.
- **Eight new slash commands** in `commands/`, bringing the total from 6
  to 14: `kakashi-scan-dir`, `kakashi-mask-dir`, `kakashi-guard`,
  `kakashi-db-scan`, `kakashi-db-mask`, `kakashi-db-audit`,
  `kakashi-agent-guard`, `kakashi-impact`. Every human-only variant
  (`audit`, `db-audit`) opens with a warning that plaintext will enter
  the conversation.
- **Guardian human-terminal render now shows the whole loop**
  ([src/guardian/render.js](src/guardian/render.js)). New `THINK` section
  restates who is asking, for what, to send where. New `ACT` section
  reports what was written to the scratch artifact (with replacement
  counts, never values). Final `REACT` section replaces the plain
  `DECISION` header so a reader sees the loop labels in loop order.
  Locked by
  [tests/guardian-narrative.test.js](tests/guardian-narrative.test.js) —
  fixture secrets are proven absent from the rendered output.
- **`agent-guard` Windows fallback**
  ([src/agent/guard.js](src/agent/guard.js)). `fs.watch` throwing
  `UNKNOWN: unknown error, watch` on Windows mapped drives / network
  shares / WSL mounts no longer kills the daemon. The synchronous throw
  is caught, a `watch_failed` event fires, and the daemon degrades to a
  polling scanner. Setting `KAKASHI_GUARD_NO_WATCH=1` skips the watcher
  entirely (HTTP-only mode). `/health` now exposes
  `"watchMode": "watch" | "poll" | "off"`.
- **`kakashi impact` snapshot now reads the version from `package.json`**
  ([src/lib/stats.js](src/lib/stats.js)). Fixes the "kakashiVersion:
  1.1.0 while CLI is 1.2.0" drift the September 23 report flagged.
  Locked by [tests/impact.test.js](tests/impact.test.js).
- **Four new test suites**, +40 assertions on top of the existing 348:
  `orchestrator`, `guardian-narrative`, `guard-fallback`, `impact`.
  Full suite: **388 passed, 0 failed** in ~12 seconds.

### Changed

- **`bin/install.js` SLASH_CMDS array** grew from 6 to 14 entries.
  Documented as a two-step contract with the `commands/` folder; the
  orchestrator test asserts both lists stay in sync so a future addition
  cannot skip either half. Installer log lines now say
  `${SLASH_CMDS.length} slash commands` instead of a stale `"6"`.

### Community

- Credit **[@lauraabdul](https://github.com/lauraabdul)** for the
  [`sql_password`](https://github.com/Muhammadatef/kakashi/pull/1)
  detection pattern that landed on `main` between 1.2.0 and 1.3.0 —
  covers SQL auth clauses like `IDENTIFIED BY '...'` /
  `WITH PASSWORD '...'` / `ENCRYPTED BY '...'` that `env_secret`'s
  `[:=]` delimiter never sees. The v1.3.0 PDPL mapping now includes it
  under Art. 20 + Art. 21.

### Not changed

- The Guardian loop itself, the pattern engine, the installer's agent
  matrix, and every existing exit code / decision label — all unchanged.
  This is a UX + testability release; no functional behaviour was
  weakened.

---

## [1.2.0] — 2026-09-18

The **Guardian release**. Kakashi stops being a masker you invoke and becomes a
protection loop that holds a goal, understands what the data is wanted for, acts,
checks its own work and changes its mind when it was wrong.

### Added

- **The Guardian understands the task it is given** (`guardian/task.js`). `--task` used
  to be decoration — printed, logged, read by nothing. It is now a stage of the loop
  between OBSERVE and ASSESS: a stated purpose becomes a requirement per data class
  (values must stay *distinguishable*, must keep their *shape*, or are *not needed at
  all*), and the planner starts from the transform that purpose needs instead of
  discovering it by failing verification first. Six intents, English and Arabic, matched
  deterministically against a fixed vocabulary — no model, no network, no new dependency.
  An unrecognised purpose is reported as unrecognised and changes nothing.
  - *On the employees fixture to an external model: a blind run needs two iterations, a
    run that states "calculate average salary by age group" needs one — and
    "debug the failing export job" redacts the people outright, because debugging has no
    use for them.*
  - **The task string comes from the agent Kakashi is protecting data from, so it can
    only ever make protection stricter.** No intent can request plaintext; the strongest
    claim a purpose can make is "I need to tell values apart", which is answered with
    stable tokens. `assertNonWeakening()` is exported and run as a property test over
    every intent × class × permitted-tool subset (504 combinations), alongside an
    end-to-end test that fires injection-shaped task strings at a real run and asserts
    the released artifact is never less protected than the no-task baseline.
  - Not stating a purpose now costs risk points (`TASK_NOT_STATED` +5,
    `TASK_NOT_UNDERSTOOD` +3) — purpose limitation needs a purpose. Stating one never
    buys a discount, which is exactly what a crafted string would go shopping for.
- **Kakashi Guardian** (`kakashi guard <file>`) — an autonomous protection loop over the
  existing engine. Where `mask` applies a fixed pipeline once, `guard` holds a goal,
  observes the resource, assesses contextual risk (agent, destination, data class),
  plans the *minimum necessary* protection, validates that plan against policy, executes
  it, **re-scans its own output**, and replans with a stronger transform if the artifact
  is still unsafe. Decisions: `ALLOW`, `ALLOW_WITH_TRANSFORMATION`, `REQUIRE_APPROVAL`,
  `BLOCK`.
- Agent trust profiles (7 existing integrations + `local_model` + conservative `unknown`
  defaults) and destination-aware policy rules — Kakashi's first configuration layer.
- Nine sensitivity classes mapped from all 35 detection patterns, with a drift guard so
  a new pattern cannot ship unclassified.
- Value-free decision audit events (`~/.kakashi/guardian-audit.jsonl`), asserted by test
  to contain no raw secrets.
- 41 new Guardian tests and 17 TaskAnalyzer tests, plus 128 new detection- and
  coverage-correctness assertions (340 total, all passing), including new
  `tests/formats.test.js` and `tests/task.test.js`.

### Notes

- No new runtime dependencies. No daemon, no server, no separate install step — the
  Guardian ships inside the existing package and is reached through the existing CLI.
  A test locks this: it fails if a dependency is added or the installer registry changes.
- The Guardian itself changed nothing in the v1.1 engine, compliance or sidecar
  layers; all 110 pre-existing assertions still pass unchanged. The pattern fixes
  below are a separate, deliberate change to `engine/patterns.js` — see **Fixed**.

### Fixed

- **`--stdin` could not be used the way it was documented.** `kakashi mask --stdin` is
  described as "read from stdin, write to stdout", but the file argument was declared
  required, so the documented invocation failed with *"missing required argument 'file'"*
  and the only way through was a placeholder path (`/dev/stdin`) that `--stdin` then
  ignored. The argument is optional now, and required only when `--stdin` is absent.
- **Names silently survived masking in spreadsheets.** Eleven patterns separated their
  tokens with `\s`, which matches newlines. `engine/formats/xlsx.js` flattens every cell
  into one newline-joined string for detection and writes back per cell, so a match
  spanning cells (`"Dept\nAhmed Hassan"`) existed in no single cell and the write
  silently did nothing — `kakashi mask` reported success while the names remained.
  Separators are now `[ \t]`, so a match can never cross a line. This also removes the
  matching false positive in prose, where `"Notes\n\nNothing"` read as a person's name
  and masking replaced both non-sensitive words with one token. Affects `full_name`,
  `non_latin_name`, `cc`, `uae_iban`, `intl_phone`, `phone`, `pobox`, `bearer`,
  `dob`, `age` and `env_secret`. `ssh_key` is exempt — a PEM block is genuinely
  multi-line. A structural test now fails if any future pattern reintroduces `\s`.
- **A file literally named `.env` was unreadable.** `path.extname('.env')` returns `''`
  — a leading dot marks a hidden file, not an extension — so `kakashi scan .env` failed
  with *"Unsupported file format: .env"* while `demo.env` worked. The commonest secret
  file in existence, and the one this project's own README leads with, could not be
  scanned or masked. Dotfiles now resolve from the basename, covering `.env`,
  `.env.local`, `.env.production` and `.gitignore`.
- **Directory walks skipped most of the file types the engine supports.**
  `SUPPORTED_EXTS` was a hand-maintained list of 17 while the text engine understood
  101. The two drifted and the consequence was silent: `kakashi scan main.go` reported a
  leaked key, but `mask-dir` and `scan-dir` never opened Go, Terraform, Rust, Java or
  shell files — so a folder-level compliance report could read clean with live
  credentials in `main.tf`. `SUPPORTED_EXTS` is now derived from the engine's own list,
  with a test that fails if they diverge again. Directory walks also now match hidden
  files (`dot`) and extensionless names like `Dockerfile` (case-insensitively).
- **A compliance report could not be told apart from one that never looked.**
  `scan-dir` honours `.gitignore` by default, and `.env` is gitignored in most repos, so
  the report simply omitted it. The default is unchanged — it is deliberate, and
  `--no-gitignore` overrides it — but the report and the terminal summary now state how
  many files the ignore files excluded.
- **`mask-dir --ext <one-extension>` never matched anything.** `*.{py}` is not a brace
  expansion; glob reads it literally. A single extension is now emitted as `*.py`.
- **`mask-dir` descended into subdirectories without `-r`.** commander leaves
  `--recursive` undefined when the flag is absent, which reached a defaulted parameter.
- **Masked database rows lost referential integrity.** `db-mask` masks one row per
  `maskText()` call, and token state was per-call, so numbering restarted at `_1` on
  every row: five distinct customers all became `[FULL_NAME_1]`, and `--mode fake` gave
  every row the same synthetic person. Nothing leaked, but the output was useless for
  the thing masking is *for* — an agent asked "how many distinct customers?" would
  answer 1. `maskText` now accepts `valueMap`/`counters` so a caller can thread one
  token space through a whole result set; same value → same token, different value →
  different token. Callers that pass neither are unaffected.
- **`env_secret` destroyed the variable name and shadowed every specific credential
  pattern.** It matched `KEY=value` and replaced the whole span, so
  `OPENAI_API_KEY=sk-proj-...` masked to a bare `[ENV_SECRET_1]` — losing the one piece
  of context an agent needs to reason about the file. Because that wide match starts at
  the key, earlier than the value, it also won overlap resolution against `openai_key`,
  `stripe` and friends: the `[OPENAI_KEY_1]` token this README advertises could never
  actually be produced. Patterns may now declare `valueGroups`, the capture groups
  holding the secret itself; `env_secret` replaces only the value, quotes and key name
  intact, and a more specific pattern wins the narrowed overlap. The README's `.env`,
  Python and SQL before/after examples now reproduce byte-for-byte.
- **Masking is idempotent again.** Narrowing `env_secret` to the value meant its own
  output (`API_KEY=[OPENAI_KEY_1]`) still read as `KEY=value`, so a second pass "found"
  a secret and the Guardian — which re-scans its own artifact — escalated until it gave
  up and returned `BLOCK`. `env_secret` now refuses values that are already mask tokens.
- **`env_secret` missed the commonest `.env` forms.** The key prefix before the trigger
  word was mandatory, so `PASSWORD=`, `API_KEY=`, `TOKEN=` and `SECRET=` were all
  undetected while `DB_PASSWORD=` matched; the pattern's own `fakeValue`
  (`API_KEY=sk-fake123`) was itself undetectable. The prefix is now optional, with a
  narrow stoplist so `TOKENIZER=bpe` does not fire.
- **Four `--mode fake` substitutions scanned clean.** The `anthropic`, `hf_token`,
  `stripe` and `bearer` fake values were 18 characters where their own pattern
  requires 20+, so masking produced a key-shaped string that no longer detected as one —
  a re-scan (and the Guardian's verifier) would call such a file safe. A test now asserts
  every `fakeValues` entry is still detectable by the full detector. `env_secret` drops
  its `fakeValues` instead of lengthening it: any self-detecting `KEY=value` fake would
  re-trigger its own pattern on every re-scan, so it falls back to the generic
  `fake_env_secret`, which no pattern matches.

---

## [1.1.0] — 2026-09-16

The **sovereign-privacy release**. Ships everything needed to run Kakashi at
UAE national scale: native Emirates identifier detection, PDPL-mapped
compliance reports, client-side database masking, a local privacy daemon for
agentic AI, and full English + Arabic support.

Also merges the community-contributed [`sql_password`](https://github.com/Muhammadatef/kakashi/pull/1)
pattern from @lauraabdul that detects secrets in SQL `IDENTIFIED BY` /
`WITH PASSWORD` / `ENCRYPTED BY` clauses — thank you.

### Added

**Detection**
- 🇦🇪 **Emirates ID pattern** with Luhn checksum validator (`isValidEmiratesId`).
- 🇦🇪 **UAE IBAN pattern** with ISO 13616 mod-97 checksum validator (`isValidIban`).
- 🇦🇪 UAE mobile & landline coverage (`intl_phone` relabelled to "UAE Phone").
- 🇦🇪 Arabic-name detection (Unicode range `\u0600–\u06FF`) — first-class citizen.
- Every pattern gained an Arabic label (`labelAr`) for bilingual output.
- Exported checksum helpers `luhnCheck`, `isValidEmiratesId`, `isValidIban` for
  downstream compliance tooling.

**Database masking (new subsystem)**
- New subcommands: `kakashi db-scan`, `kakashi db-mask`, `kakashi db-audit`.
- Six lazy-loaded native drivers: PostgreSQL (`pg`), MySQL (`mysql2`),
  MongoDB (`mongodb`), Snowflake (`snowflake-sdk`), Databricks
  (`@databricks/sql`), SQLite (`better-sqlite3`).
- Client-side streaming — rows are masked on the user's machine before any
  AI agent sees them. Zero cloud, zero proxy.
- `mock:` driver for tests + demos; ships built-in.
- JSONL, JSON, and CSV output formats.

**Enterprise directory scanner (new subsystem)**
- New subcommand: `kakashi scan-dir <path>`.
- Async concurrency pool (default 8) for I/O-bound scans.
- Respects `.gitignore` and `.kakashiignore`.
- Compliance report renderer at `src/lib/reporter.js` — JSON, HTML, Markdown.
- HTML report is bilingual (`--lang ar`), print-optimised, RTL-aware, and
  citations PDPL articles per finding.

**PDPL compliance layer (new subsystem)**
- `src/lib/pdpl-mapping.js` — every detection pattern mapped to specific
  articles of UAE Federal Decree-Law No. 45 of 2021.
- 9 PDPL articles catalogued (Art. 1, 5, 6, 9, 15, 20, 21, 22, 25).
- Severity heuristic (critical / high / medium / low) driven by article
  citations.
- `enrich(finding)` and `summarize(findings)` public API.

**Bilingual English + Arabic**
- `src/lib/i18n.js` — full EN + AR string tables.
- Language resolution priority: `--lang` flag → `KAKASHI_LANG` → `LANG` env
  starting with `ar` → English fallback.
- Complete Arabic README at `README.ar.md`.
- Bilingual compliance report with `dir="auto"` for automatic RTL.

**agent-guard sidecar daemon (new subsystem)**
- New subcommand: `kakashi agent-guard --watch <dir>`.
- Loopback-only HTTP API (`127.0.0.1`) with three endpoints:
  `GET /health`, `POST /scan`, `POST /mask`.
- Passive `fs.watch` scanner with optional JSONL audit log.
- Explicit `req.socket.remoteAddress` hard-check refuses non-loopback origins
  with `403`.
- Optional `--auto-mask` writes a masked copy on every finding.

**Impact snapshot**
- New subcommand: `kakashi impact [--write path]`.
- Produces a privacy-preserving JSON snapshot (category counts + coarse
  month-bucket, no filenames or paths) that users can voluntarily contribute
  to the public adoption dashboard.

**CI / CD**
- `.github/workflows/ci.yml` — runs `npm test` on every push and pull
  request across Node 18, 20, and 22.
- `.github/workflows/publish.yml` — publishes to npm when a `v*` tag is
  pushed. Requires an `NPM_TOKEN` repository secret.
- `.github/workflows/pages.yml` — deploys the public adoption dashboard to
  GitHub Pages on any change under `docs/dashboard/`.

**Documentation**
- `docs/ARCHITECTURE.md` — comprehensive rewrite with mermaid data-flow
  diagrams, STRIDE threat model, trust-boundary diagram, agent integration
  protocol, and OECD + UAE ethical-AI alignment table.
- `docs/TECHNICAL_IMPLEMENTATION.pdf` — 16-page A4 technical brief for
  procurement / audit review. Regenerate with `npm run docs:pdf`.
- `docs/UAE_PILOT_KIT.md` — 30-minute pitch script, objection-handling
  table, and testimonial template for UAE outreach.
- `docs/DEMO_VIDEO_UAE.md` — bilingual 60-second video production kit.
- `docs/dashboard/index.html` — public GitHub Pages dashboard fetching live
  npm + GitHub stats client-side (no backend).

**Testing**
- Suite grew from **~65 tests → 101 tests across 8 files**:
  `patterns.test.js` (55), `masker.test.js` (6), `cli.test.js` (4),
  `pdpl.test.js` (6), `db.test.js` (10), `reporter.test.js` (6),
  `i18n.test.js` (8), `guard.test.js` (6).
- New `tests/fixtures/uae_sample.md` fixture covering all UAE patterns with
  synthetic identifiers.

### Changed

- `intl_phone` pattern label updated to "UAE Phone" for clarity (id stays
  stable so existing `[INTL_PHONE_n]` tokens remain valid).
- `national_id` pattern label updated to "Emirates ID" (id unchanged).
- CLI version reported by `--version` bumped to `1.1.0`.
- Package description updated to reflect the sovereign-privacy positioning.
- Package keywords broadened: added `uae`, `pdpl`, `emirates-id`, `arabic`,
  `database-masking`, `postgres`, `mongodb`, `sqlite`, `agentic-ai`, `mcp`,
  `compliance`, `dlp`, plus additional agent keywords.
- `README.md` corrected: pattern count is precisely **34** (previously the
  docs cited "35+"). The `env_secret` meta-pattern additionally covers
  15+ credential naming conventions.

### Security

- All new subsystems (`db/`, `scan-dir`, `agent-guard`, `reporter`,
  `pdpl-mapping`, `i18n`) added **zero** outbound network calls. The
  "nothing leaves your machine" guarantee holds across the entire v1.1
  surface.
- `agent-guard` loopback enforcement is belt-and-braces: binds to
  `127.0.0.1` AND rejects any request whose `remoteAddress` doesn't match
  `127.` / `::1` / `::ffff:127.`.

### Removed

- Nothing (fully backward-compatible).

### Contributors

- Mohamed Atef Fahmy — everything

---

## [1.0.0] — 2026-05

The initial public release.

### Added

- Pattern registry and `maskText()` core engine.
- Format-preserving masking for text, Excel, Word, PowerPoint, PDF (extract).
- Six CLI subcommands: `scan`, `mask`, `audit`, `mask-dir`, `stats`,
  `list-patterns`.
- Auto-installer for 20+ agentic AI platforms
  (Claude Code, Cursor, GitHub Copilot, OpenAI Codex, Windsurf, Cline,
  Continue, Aider, JetBrains Junie, Roo Code, Kilo Code, OpenHands, Warp,
  Replit Agent, Augment Code, and more).
- Three masking modes: `typed` (default), `redact`, `fake`.
- Cumulative session stats.
