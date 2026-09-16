# Kakashi — Technical Implementation

**Version 1.1.0 · September 2026**

> **Cover copy for the printable PDF:** see [`TECHNICAL_IMPLEMENTATION.html`](TECHNICAL_IMPLEMENTATION.html) (Chrome-optimised, A4, 16 pages) and the pre-rendered [`TECHNICAL_IMPLEMENTATION.pdf`](TECHNICAL_IMPLEMENTATION.pdf) in this folder.
>
> This Markdown file is the GitHub-readable source of truth for the same content.

---

## Contents

1. Executive summary
2. System architecture
3. Core engine — detection & masking
4. File-format handlers
5. Database masking layer
6. PDPL compliance layer
7. Enterprise directory scanner
8. Bilingual (EN / AR) i18n
9. Agent-guard sidecar daemon
10. AI-agent integration protocol
11. Trust boundary & threat model
12. Test coverage & CI
13. Deployment & operations
14. UAE framework alignment
15. Roadmap
16. Appendix — CLI reference
17. Appendix — pattern catalogue
18. Appendix — PDPL article map

---

## 1 · Executive summary

Kakashi is an open-source, locally-executed privacy layer designed to prevent personal data, credentials, and sovereign identifiers from crossing the boundary between a user's device and any external Large Language Model. It installs as a first-class *skill* inside more than 20 agentic-AI platforms — Cursor, Claude Code, GitHub Copilot, OpenAI Codex, Windsurf, Cline, Continue, Aider, JetBrains Junie, Roo Code, and others — and exposes a loopback HTTP API that any additional Model-Context-Protocol (MCP) client can consult before shipping data.

Kakashi is **not itself an artificial-intelligence system**. It is a deterministic, rule-based safety layer that operates around AI systems. This design decision eliminates every class of AI-ethics concern that stems from opacity, hallucination, learned bias, or model drift, and yields four inherent properties that regulated agentic-AI deployments require:

- **Deterministic** — the same input always produces the same masking output.
- **Auditable** — every detection rule is a regular expression readable by a compliance officer.
- **Bias-free** — no training data means no encoded bias; the same pattern fires for every user regardless of nationality, gender, or language.
- **Explainable** — every finding carries its pattern identifier, its severity, and the specific article of the UAE Personal Data Protection Law that governs it.

> **The single strategic sentence.** Kakashi is the sovereign privacy infrastructure that makes agentic AI safe to deploy at UAE national scale. Every module described in this document exists to reinforce that thesis.

### Version 1.1.0 highlights

| | |
| --- | --- |
| Release date | September 2026 |
| Detection patterns | 34 across three categories (ID & Documents, Personal Info, Credentials); env_secret matches 15+ credential naming conventions on top |
| File formats | 50+ with format-preserving masking |
| Database drivers | 6 native adapters (PostgreSQL, MySQL, MongoDB, Snowflake, Databricks, SQLite) |
| Agentic platforms | 20+ pre-integrated agent skills |
| PDPL articles mapped | 9 (Federal Decree-Law 45/2021 Articles 1, 5, 6, 9, 15, 20, 21, 22, 25) |
| Languages | English + Arabic, full RTL preservation |
| Automated tests | 101 across 8 test suites |
| Network calls | Zero during scan / mask; one to npm at install |
| Licence | MIT — open source |

---

## 2 · System architecture

Kakashi is composed of four horizontal layers. Every layer is independently testable and consumes only the layer directly beneath it.

```mermaid
flowchart TB
  subgraph L4 [Layer 4 - Agentic Sidecar]
    Guard["agent-guard<br/>(loopback HTTP + fs watcher)"]
  end
  subgraph L3 [Layer 3 - Compliance & UX]
    Pdpl[pdpl-mapping.js]
    Rep[reporter.js]
    Scan[scan-dir.js]
    I18n[i18n.js]
  end
  subgraph L2 [Layer 2 - Core Engine]
    Patterns[patterns.js]
    Msk[masker.js]
    Fmt["formats/ (docx/xlsx/pptx/pdf)"]
    DB[engine/db/]
  end
  subgraph L1 [Layer 1 - Skill Rules]
    Rules["SKILL.md / CLAUDE.md / AGENTS.md<br/>(tells 20+ AI agents WHEN to invoke)"]
  end
  L4 --> L3
  L3 --> L2
  Rules -->|shell out| L2
```

The layer boundaries are intentional. If an integration partner wants only the compliance reporter, they can import `src/lib/pdpl-mapping.js` and `src/lib/reporter.js` without adopting the CLI. Modularity is a first-class value.

### Repository layout

```
kakashi/
├── bin/
│   ├── kakashi.js          CLI entry-point (Commander-based)
│   └── install.js          Agent-detection + skill installer
├── src/
│   ├── engine/
│   │   ├── patterns.js     Detection rules + checksum helpers
│   │   ├── masker.js       Tokenise + reconstruct
│   │   ├── formats/        Per-format read/write adapters
│   │   └── db/             Per-driver DB adapters (lazy-loaded)
│   ├── lib/
│   │   ├── pdpl-mapping.js UAE PDPL article map
│   │   ├── reporter.js     JSON / HTML / MD renderer
│   │   ├── scan-dir.js     Concurrent tree scanner
│   │   ├── i18n.js         EN + AR translations
│   │   ├── output.js       CLI printing
│   │   └── stats.js        Cumulative stats + impact snapshot
│   └── agent/
│       └── guard.js        Loopback HTTP daemon
├── tests/                  101 automated tests, 8 suites
└── docs/                   Architecture, submission, video kit
```

---

## 3 · Core engine — detection & masking

### 3.1 Pattern registry

Every detection lives in `src/engine/patterns.js` as a plain object:

```js
{
  id:      'national_id',            // stable key -> token like [NATIONAL_ID_1]
  label:   'Emirates ID',            // English display name
  labelAr: 'الهوية الإماراتية',       // Arabic display name (for i18n + HTML report)
  cat:     'id',                     // 'id' | 'pii' | 'cred'
  rx:      /\b784-\d{4}-\d{7}-\d\b/g, // regex
  validate: (m, text, i) => ...,      // optional false-positive filter
  fakeValues: ['784-1990-9999999-0']  // used by --mode fake
}
```

The `id` is stable across releases so tokens like `[NATIONAL_ID_1]` remain durable. The `label` / `labelAr` fields are free to evolve.

### 3.2 Checksum helpers

- `luhnCheck(digits)` — ISO/IEC 7812-1 Luhn algorithm
- `isValidEmiratesId(id)` — 15-digit Luhn with mandatory `784` country prefix
- `isValidIban(iban)` — ISO 13616 mod-97 remainder validation

These are deliberately **not** wired into the pattern `validate` hooks. Attackers frequently transpose digits, so a leaked identifier with a broken check digit is still a leaked identifier and must still be flagged. The helpers are consumed by the reporter to *badge* findings as "checksum-verified" without discarding suspect-looking IDs.

### 3.3 The maskText algorithm

1. Collect all regex matches from every active pattern.
2. Sort matches by start position, then descending length (longer wins at same position).
3. Resolve overlaps — keep first match whose start is beyond the last accepted match's end.
4. Assign consistent replacements — same original value receives same token throughout the document.
5. Apply replacements end-to-start so earlier offsets remain valid.

### 3.4 Three masking modes

| Mode | Example output | When to use |
| --- | --- | --- |
| `typed` (default) | `[EMAIL_1]`, `[OPENAI_KEY_2]` | Preserves document readability; AI can reason about types |
| `redact` | `[REDACTED]` | Maximum anonymity |
| `fake` | `user_a@example.com` | Preserves plausible LLM context |

---

## 4 · File-format handlers

Kakashi supports 50+ file formats. Each handler implements two functions:

```js
async function readFile(filePath) -> { format, text, ...metadata }
async function writeMasked(inPath, outPath, data, replMap, maskedText)
```

The `readFile` extracts a canonical text representation; `writeMasked` reconstructs the file in its original binary format. This is what lets Kakashi output a real Word file, not a text dump of one.

| Format | Library | Status | Notes |
| --- | --- | --- | --- |
| Text / code (40+ ext) | native `fs` | stable | Any text-shaped file |
| Excel (`.xlsx`, `.xls`) | SheetJS | stable | Cell-level masking |
| Word (`.docx`) | `jszip` | best-effort | XML `<w:t>` replacement |
| PowerPoint (`.pptx`) | `jszip` | best-effort | XML `<a:t>` replacement |
| PDF (`.pdf`) | `pdf-parse` | text-only | Extracts to masked `.md`; real round-trip in v1.2 |
| JSON/JSONL/JSON5 | native | stable | |
| YAML / TOML / XML | native | stable | |
| CSV / TSV | native | stable | |

---

## 5 · Database masking layer

Kakashi v1.1 introduces client-side database masking. Point Kakashi at a live database, run a query, and receive a masked local copy of the results — without exposing raw rows to any AI agent. Six drivers ship out of the box.

```mermaid
sequenceDiagram
  actor User
  participant CLI as kakashi CLI
  participant Router as db/index.js
  participant Driver as pg / mysql / mongo / ...
  participant Remote as Remote DB
  participant Msk as maskText
  participant Disk

  User->>CLI: kakashi db-mask "postgres://..." -q "SELECT ..."
  CLI->>Router: inferDriver + streamMasked
  Router->>Driver: query(conn, sql)
  Driver->>Remote: TCP + TLS (client-side)
  Remote-->>Driver: rows
  loop each row
    Driver-->>Router: row
    Router->>Msk: maskText(JSON.stringify(row))
    Msk-->>Router: masked row + findings
    Router-->>CLI: {row, masked, findings}
    CLI->>Disk: write masked_query.jsonl
  end
```

### 5.1 Driver registry

Drivers are lazily `require()`-d, so users only install the client library for the database they actually consume:

| Driver | Library | Install |
| --- | --- | --- |
| PostgreSQL | `pg` | `npm install pg` |
| MySQL / MariaDB | `mysql2` | `npm install mysql2` |
| MongoDB | `mongodb` | `npm install mongodb` |
| Snowflake | `snowflake-sdk` | `npm install snowflake-sdk` |
| Databricks | `@databricks/sql` | `npm install @databricks/sql` |
| SQLite | `better-sqlite3` | `npm install better-sqlite3` |

### 5.2 CLI usage

```bash
# Count-only scan of a query — agent-safe
kakashi db-scan "postgres://user:pass@host/db" -q "SELECT * FROM customers LIMIT 100"

# Mask a query result to a local JSONL file
kakashi db-mask "postgres://user:pass@host/db" \
  -q "SELECT * FROM customers WHERE country='UAE'" \
  -o masked_customers.jsonl -f jsonl
```

---

## 6 · PDPL compliance layer

The compliance layer in `src/lib/pdpl-mapping.js` links every detection pattern to specific articles of **UAE Federal Decree-Law No. 45 of 2021 concerning the Protection of Personal Data (PDPL)**.

> The file is *data, not logic*. Zero I/O, zero side-effects. A compliance officer can review it as one flat document without reading application code.

### 6.1 Article catalogue

| Article | Title | Kakashi coverage |
| --- | --- | --- |
| Art. 1 | Definitions of Personal Data | All personal-info patterns |
| Art. 5 | Conditions for Processing | Consent-preserving typed masking |
| Art. 6 | Consent | Reserved for consent workflows |
| Art. 9 | Rights of the Data Subject | Reserved for erasure workflows |
| Art. 15 | Sensitive Personal Data | Emirates ID, passport, IBAN, credit card, SSN |
| Art. 20 | Security of Personal Data | Every credential pattern (15+ classes) |
| Art. 21 | Reporting a Data Breach | Every leaked credential = candidate breach event |
| Art. 22 | Cross-Border Transfer | Every identifier destined for a foreign LLM |
| Art. 25 | Data Protection Officer | The compliance report is DPO-ready |

### 6.2 Severity heuristic

- **critical** — sensitive personal data (Art. 15) OR live credentials
- **high** — personal data with strong re-identification risk
- **medium** — quasi-identifiers
- **low** — weak identifiers

### 6.3 Public API

```js
const { enrich, summarize } = require('kakashi/src/lib/pdpl-mapping');

enrich(finding) -> { ...finding, severity, articles, articleSummaries, checksumVerified }
summarize(findings) -> { findings, summary: { total, byCategory, bySeverity, byArticle, topArticles } }
```

---

## 7 · Enterprise directory scanner

`scan-dir` walks a directory tree, honours `.gitignore` and `.kakashiignore`, scans every supported file concurrently, and emits an aggregate report in JSON, HTML, or Markdown.

### 7.1 Concurrency model

Kakashi v1.1 uses an *async concurrency pool* rather than `worker_threads`. Because file scanning is I/O-bound, a Promise-based pool of size *N* yields most of the wall-clock benefit of true parallelism without the operational cost. Worker-thread parallelism for CPU-bound XLSX/PDF workloads is tracked for v1.2.

### 7.2 Report renderers

| Renderer | Consumer | Notes |
| --- | --- | --- |
| `renderJson` | SIEM, CI | Machine-readable |
| `renderMarkdown` | CLI, PR comments | Readable at a glance |
| `renderHtml` | Audit-ready deliverable | Bilingual EN / AR; `@media print` ready for PDF conversion |

### 7.3 CLI usage

```bash
kakashi scan-dir ./project \
  --format html --lang ar --parallel 8 \
  --output audit_report.html

# Convert to PDF (offline):
chromium --headless --print-to-pdf=audit.pdf audit_report.html
```

---

## 8 · Bilingual (EN / AR) i18n

Kakashi ships a native Arabic experience. `src/lib/i18n.js` carries EN + AR string tables and resolves language from four sources in priority order:

1. Explicit `--lang` CLI flag (highest)
2. `KAKASHI_LANG` env var
3. `LANG` env var starting with `ar` (e.g. `ar_AE.UTF-8`)
4. Fallback: English

### What is translated

- All user-facing CLI strings (scan headers, summaries, errors, success confirmations)
- Every pattern label (`label` / `labelAr` in the pattern registry)
- The full HTML compliance report (headers, table headings, PDPL titles, severity labels)
- PDPL article titles in Arabic (`title_ar` alongside `title_en`)
- Complete Arabic README (`README.ar.md`)

### RTL preservation

Replacement tokens like `[NATIONAL_ID_1]` contain no bidirectional-embedding characters, so surrounding Arabic text preserves its natural RTL flow after masking. The HTML report uses `dir="auto"` so Arabic content renders RTL and English content LTR within the same document.

---

## 9 · Agent-guard sidecar daemon

`agent-guard` is Kakashi's answer to the question that unlocks the "Agentic AI Solutions Developed in the UAE" category: *how do you make agentic AI safe to deploy at national scale?*

### 9.1 Two roles

1. **Passive watcher.** Subscribes to filesystem change events under a user-specified directory. Every changed file is scanned; every finding is recorded in a JSONL audit log.
2. **Active HTTP API.** Exposes three endpoints on `127.0.0.1` (loopback only). Any MCP-enabled agent can call these synchronously.

### 9.2 HTTP endpoints

| Verb + Path | Body | Response |
| --- | --- | --- |
| `GET /health` | — | `{ ok, watching, uptimeMs, filesScanned, totalFindings, version }` |
| `POST /scan` | `{ "path": "..." }` | `{ path, summary }` — PDPL-enriched summary; no raw values |
| `POST /mask` | `{ "path": "...", "output": "..." }` | `{ output, replacements }` |

### 9.3 Loopback enforcement

Belt-and-braces. Even though the daemon binds to `127.0.0.1`, every incoming request is additionally checked against `req.socket.remoteAddress` and rejected with 403 unless the origin matches a loopback prefix (`127.`, `::1`, `::ffff:127.`).

> **Zero-network-call preservation.** agent-guard never opens an outbound socket. All state is in-memory plus one local JSONL log. Kakashi's "nothing leaves your machine" guarantee holds even while running as a long-lived daemon.

---

## 10 · AI-agent integration protocol

### 10.1 Shell-based agents

Six slash commands are installed by `bin/install.js` into the config directory of every detected agent:

| Command | Purpose |
| --- | --- |
| `/kakashi` | Activate privacy mode |
| `/kakashi-scan <path>` | Counts only — agent-safe |
| `/kakashi-mask <path>` | Write `masked_<file>` |
| `/kakashi-audit <path>` | Full original → replacement mapping (verbose) |
| `/kakashi-stats` | Cumulative stats |
| `/kakashi-list` | Every active pattern |

### 10.2 Supported agents (20+)

Claude Code · Cursor · GitHub Copilot · OpenAI Codex · Windsurf · Cline · Continue · Aider · JetBrains Junie · Roo Code · Kilo Code · OpenHands · Warp · Replit Agent · Augment Code · plus additional agents on request.

### 10.3 MCP integration path

An MCP wrapper package (v1.2) will expose `kakashi_scan` and `kakashi_mask` as first-class MCP tools that any MCP-compliant agent can call via the standard tool-calling protocol.

---

## 11 · Trust boundary & threat model

The single most important line of code in Kakashi is where the file body **stops** travelling to the AI.

```
┌────────────────── USER DEVICE (trusted) ────────────────┐
│                                                          │
│  Local Disk / Local DB                                   │
│         │                                                │
│         ▼                                                │
│  Kakashi (formats.readFile / db.streamMasked)            │
│         │                                                │
│         ▼                                                │
│  Kakashi (maskText → tokens)                             │
│         │                                                │
│         ▼                                                │
│  Kakashi (writes masked_file OR summary counts)          │
│         │  <──── THIS is the trust boundary.             │
│         ▼                                                │
│  AI Agent (Cursor / Claude / Copilot / Codex / ...)      │
│         │                                                │
└─────────┼────────────────────────────────────────────────┘
          ▼
    External LLM API
```

### 11.1 Four defence-in-depth defaults

1. `scan` prints counts only; `--verbose` for previews
2. `mask` writes to disk; never streams to stdout by default
3. `audit` is deliberately verbose and only invoked explicitly
4. agent-guard's `/scan` returns PDPL summary; never raw values

### 11.2 STRIDE threat model

| Category | Threat | Mitigation |
| --- | --- | --- |
| Spoofing | Non-loopback caller impersonates local agent | Loopback bind + `remoteAddress` hard-check |
| Tampering | Malicious patch disables a detection rule | Signed npm publisher, MIT-licensed source auditable line-by-line |
| Repudiation | User denies exposure | JSONL audit log + compliance report with UTC timestamps |
| Information Disclosure | Kakashi leaks the secrets it detects | Counts-only default; no telemetry; no error reporting |
| DoS | Enormous input file exhausts memory | Streaming per-row for DB; per-file try/catch; `--limit` |
| Elevation of Privilege | Daemon reads outside its watched dir | Only reads paths the caller asks for; respects OS permissions |

---

## 12 · Test coverage & CI

**101 automated tests across 8 suites** — deterministic, hermetic, offline, runs in under 3 seconds.

| Suite | Tests | Coverage |
| --- | --- | --- |
| `patterns.test.js` | 55 | Every detection + Luhn/Emirates-ID/IBAN checksum vectors |
| `masker.test.js` | 6 | All three modes, consistency, whitelist, line numbers |
| `cli.test.js` | 4 | Exit codes, mask round-trip, list-patterns |
| `pdpl.test.js` | 6 | Mapping drift-detection, article coverage, enrich, summarise |
| `db.test.js` | 10 | Driver inference, mock adapter, CLI db-scan / db-mask end-to-end |
| `reporter.test.js` | 6 | JSON, MD, HTML EN, HTML AR, `.kakashiignore`, no-raw-values invariant |
| `i18n.test.js` | 8 | Language resolution, `t()` substitution, live CLI EN + AR |
| `guard.test.js` | 6 | `/health`, `/scan`, `/mask`, 404, missing-path, no-raw-values invariant |

### 12.1 CI integration

```yaml
- name: Kakashi privacy scan
  run: |
    npm install -g @muhammadatef/kakashi
    kakashi scan-dir . -f json -o kakashi-report.json
- name: Upload compliance report
  if: always()
  uses: actions/upload-artifact@v4
  with: { name: kakashi-report, path: kakashi-report.json }
```

`kakashi scan-dir` exits `1` when findings are present, so the pipeline can be configured to fail pull requests that leak new sensitive data — turning Kakashi into a pre-merge safety gate.

---

## 13 · Deployment & operations

### 13.1 Install

```bash
# macOS · Linux · WSL · Git Bash
curl -fsSL https://raw.githubusercontent.com/Muhammadatef/kakashi/main/install.sh | bash

# Windows (PowerShell 5.1+)
irm https://raw.githubusercontent.com/Muhammadatef/kakashi/main/install.ps1 | iex

# Or via npm directly
npm install -g @muhammadatef/kakashi
```

### 13.2 System requirements

| | |
| --- | --- |
| Runtime | Node.js ≥ 18 |
| OS | macOS, Linux, Windows (native + WSL) |
| Disk footprint | < 15 MB core; drivers lazy-loaded |
| Memory | ~40 MB agent-guard daemon; per-file scans are streaming |
| Network | Zero during operation; one call to npm at install |

### 13.3 Uninstall

```bash
npx -y github:Muhammadatef/kakashi -- --uninstall            # all agents
npx -y github:Muhammadatef/kakashi -- --uninstall --only cursor
```

### 13.4 Public dashboard

Deployed via GitHub Pages, fetching live npm and GitHub metrics client-side without any Kakashi-owned backend. See `docs/dashboard/index.html`.

---

## 14 · UAE framework alignment

| Framework | Alignment |
| --- | --- |
| **UAE AI Strategy 2031** | Enables the 50%-of-government-services agentic-AI programme by removing the compliance risk that otherwise blocks deployment |
| **UAE AI Charter (10 June 2024)** | Full alignment with all 12 principles. Rule-based safety layer inherently satisfies fairness, transparency, explainability, accountability |
| **UAE PDPL — Federal Decree-Law 45 of 2021** | Every category mapped to specific articles (1, 5, 6, 9, 15, 20, 21, 22, 25) in `src/lib/pdpl-mapping.js` |
| **UAE Data Office guidance** | Default posture is "block the leak at source" — strongest possible cross-border-transfer stance |
| **UAE Centennial 2071** | Sovereign, locally-developed, open-source digital infrastructure |
| **UAE Cybersecurity Strategy** | Zero-trust posture: no network calls, no cloud, no telemetry, loopback-only daemon |
| **OECD Principles for Trustworthy AI** | All five principles addressed |

---

## 15 · Roadmap

### v1.2 (planned Q4 2026)

- Native MCP server package (`@muhammadatef/mcp-kakashi`)
- True `worker_threads` parallelism for 100k+ file trees
- Real PDF round-trip masking (content-stream patching via `pdf-lib`)
- Multi-run DOCX / PPTX secret handling
- Additional national identifier formats: KSA, Egypt, India, EU
- Streaming DOCX / PDF masking for gigabyte-scale documents

### v1.3+ (research direction)

- Optional local ML classifier for context-aware name detection (opt-in, still 100% local)
- Proxy-mode masking that transparently intercepts app → DB traffic
- UAE Data Office direct submission integration

---

## 16 · Appendix — CLI reference

```
kakashi scan <file>               Scan and report finding counts (agent-safe)
kakashi mask <file>               Mask and reconstruct original format
kakashi audit <file>              Full original → replacement mapping (verbose)
kakashi mask-dir <dir> -r         Mask all supported files recursively
kakashi scan-dir <dir>            Enterprise directory scanner with PDPL report
kakashi db-scan <conn> -q ...     Scan DB query results (agent-safe)
kakashi db-mask <conn> -q ...     Mask DB query to jsonl / json / csv
kakashi db-audit <conn> -q ...    Verbose DB audit (deliberately verbose)
kakashi agent-guard --watch <d>   Run loopback privacy daemon
kakashi stats                     Cumulative session stats
kakashi impact --write path       Privacy-preserving impact snapshot
kakashi list-patterns             All active detection patterns

Global flags:
  --lang <code>               en | ar
  --mode typed|redact|fake    Replacement style (default: typed)
  --whitelist val1,val2       Values to never mask
  --overwrite                 Replace original (asks confirmation)
  --stdin                     Read from stdin
  -v, --verbose               Per-finding previews (NOT agent-safe)

Alias: k
```

---

## 17 · Appendix — pattern catalogue

**ID & Documents (9):** `national_id` Emirates ID (with Luhn) · `intl_phone` UAE Phone · `passport` Passport · `visa_id` Visa Number · `trade_lic` Trade License · `pobox` P.O. Box · `non_latin_name` Arabic Name · `unified_id` Unified ID · `uae_iban` UAE IBAN (with mod-97)

**Personal Info (9):** `email` · `phone` · `ip` IP Address · `cc` Credit Card · `ssn` SSN / National ID · `dob` Date of Birth · `date` Date · `age` Age · `full_name` Full Name

**Credentials (17):** `jwt` JWT Token · `ssh_key` SSH Private Key · `aws_key` AWS Key · `openai_key` OpenAI Key · `anthropic` Anthropic Key · `hf_token` HuggingFace Token · `gh_token` GitHub Token · `slack` Slack Token · `stripe` Stripe Key · `bearer` Bearer Token · `db_conn` Database Connection · `databricks_token` Databricks Token · `databricks_host` Databricks Host · `s3_uri` S3 URI · `env_secret` Env Secret · `hex_secret` Hex Secret

---

## 18 · Appendix — PDPL article map (excerpt)

| Article | Title (EN) | Title (AR) | Summary |
| --- | --- | --- | --- |
| Art. 1 | Definitions of Personal Data | تعريفات البيانات الشخصية | Any data relating to an identified or identifiable natural person |
| Art. 5 | Conditions for Processing | شروط معالجة البيانات الشخصية | Requires explicit consent or a defined lawful basis |
| Art. 15 | Sensitive Personal Data | البيانات الشخصية الحساسة | Special protections for biometric, health, identity documents |
| Art. 20 | Security of Personal Data | أمن البيانات الشخصية | Duty to implement technical and organisational measures |
| Art. 21 | Reporting a Data Breach | الإبلاغ عن انتهاك البيانات الشخصية | Duty to notify UAE Data Office within stipulated timeframes |
| Art. 22 | Cross-Border Transfer | نقل البيانات الشخصية عبر الحدود | Restricts transfer outside the UAE unless adequate protection exists |
| Art. 25 | Data Protection Officer | تعيين مسؤول حماية البيانات | Requires DPO for large-scale or sensitive processing |

> Summaries are condensed for engineering reference. The compliance officer remains responsible for consulting the original Arabic text of the Decree-Law, which is the legally binding version.

---

**Kakashi · MIT licence · Made in the United Arab Emirates**

[github.com/Muhammadatef/kakashi](https://github.com/Muhammadatef/kakashi) · [npmjs.com/package/@muhammadatef/kakashi](https://www.npmjs.com/package/@muhammadatef/kakashi)

*Every quantitative claim in this document is independently verifiable against the public open-source repository.*
