# Changelog

All notable changes to Kakashi are documented in this file. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Version numbers
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
  award / procurement / audit submissions. Regenerate with
  `npm run docs:pdf`.
- `docs/UAE_AI_AWARD_SUBMISSION.md` — one-page executive summary mapped to
  the five UAE AI Award evaluation criteria.
- `docs/UAE_AWARD_METRICS.md` — 10 quantified impact metrics, each with a
  matching per-metric evidence PDF under `docs/evidence/`.
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
