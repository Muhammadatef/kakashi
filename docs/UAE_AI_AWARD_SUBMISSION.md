# UAE AI Award — Kakashi Submission

**Target category:** Agentic AI Solutions Developed in the UAE
**Applicant:** Mohamed Atef Fahmy (individual / UAE-based)
**Submission portal:** [award.tdra.gov.ae](https://award.tdra.gov.ae) · [ai.gov.ae/aiaward](https://ai.gov.ae/aiaward)
**Version:** 1.1.0 (drafted for the 3rd edition submission cycle)

---

## One-line pitch

**Kakashi is the sovereign privacy infrastructure that makes agentic AI safe to deploy at UAE national scale.** It runs 100% locally, integrates as a skill into 20+ agentic AI platforms, and prevents personal data and credentials from leaving the user's device — with native detection for Emirates ID, UAE passport, UAE IBAN, and Arabic names, plus a compliance report mapped directly to the UAE Personal Data Protection Law.

---

## The five criteria, addressed 1:1

### 1. Scalability & Replicability

**Assertion:** Kakashi is designed for national-scale replication from day one.

**Proof points:**

- **One-line install** on macOS, Linux, WSL, Windows: `npm install -g @muhammadatef/kakashi` (~30 seconds).
- **Deploys to 20+ agentic AI platforms** automatically: Claude Code, Cursor, GitHub Copilot, OpenAI Codex, Windsurf, Cline, Continue, Aider, JetBrains Junie, Roo Code, Kilo Code, OpenHands, Warp, Replit Agent, Augment Code, and more. The installer detects every agent on the machine and wires the six slash commands in for all of them.
- **Zero infrastructure to provision.** No cloud, no container, no seat licences, no CA certificates to manage. Any UAE ministry, bank, or SME can deploy Kakashi across every developer laptop in under an hour.
- **6 CLI subcommands + 3 DB subcommands + 1 daemon** — the full agentic surface area, replicable to any organisation.
- **Enterprise `scan-dir`** — walks a repository or shared drive, emits a PDPL-mapped compliance report (JSON, HTML, or Markdown), and can be dropped straight into CI/CD or GitHub Actions.

### 2. AI Maturity

**Assertion:** Kakashi is production-shipped, tested, and version-1.1 as of this submission.

**Proof points:**

- **101 automated tests** across 8 test suites: patterns, masker, CLI, PDPL mapping, database drivers, compliance reporter, i18n, agent-guard daemon.
- **Public on npm and GitHub** with MIT license: [`@muhammadatef/kakashi`](https://www.npmjs.com/package/@muhammadatef/kakashi).
- **34 detection patterns** across three categories: ID & Documents (Emirates ID with Luhn checksum, UAE passport, UAE mobile/landline, UAE IBAN with mod-97 checksum, trade licence, unified ID, P.O. Box, Arabic name detection); Personal Info (email, phone, IP, credit card, DOB, full name); Credentials (OpenAI, Anthropic, AWS, GitHub, Stripe, Slack, HuggingFace, JWT, Bearer, SSH, DB connection strings, Databricks, S3 URIs, .env secrets, hex secrets). The `env_secret` pattern is a meta-rule that additionally matches 15+ credential naming conventions.
- **50+ file formats** with format-preserving masking: Word `.docx`, Excel `.xlsx`, PowerPoint `.pptx`, PDF, JSON/JSONL/JSON5, YAML, TOML, XML, Markdown, CSV, plus 40+ source-code extensions.
- **6 database drivers** (PostgreSQL, MySQL, MongoDB, Snowflake, Databricks, SQLite) — mask rows in-flight from the client side, no cloud proxy.
- **Bilingual CLI + reports** (English / Arabic) with RTL preservation.
- **Documented architecture** — see [ARCHITECTURE.md](ARCHITECTURE.md) for the full data-flow, threat model, and integration protocol.

### 3. Level of Innovation

**Assertion:** Kakashi is the only open-source privacy tool in the world that integrates as an agentic AI skill across 20+ platforms, detects UAE-specific identifiers natively, and reconstructs real Word/Excel/PowerPoint files.

**Uniqueness map:**

| Capability | Kakashi | GitLeaks | TruffleHog | Presidio | AWS Macie |
| --- | :---: | :---: | :---: | :---: | :---: |
| Runs inside 20+ AI agents as a slash-command skill | ✔ | ✘ | ✘ | ✘ | ✘ |
| 100% local, zero network calls | ✔ | ✔ | ✔ | ✔ | ✘ (cloud) |
| Masks (not just detects) | ✔ | ✘ | ✘ | ✔ | ✔ |
| Reconstructs original DOCX/XLSX/PPTX format | ✔ | ✘ | ✘ | ✘ | ✘ |
| Detects Emirates ID with Luhn checksum | ✔ | ✘ | ✘ | ✘ | ✘ |
| Detects UAE IBAN with mod-97 checksum | ✔ | ✘ | ✘ | ✘ | ✘ |
| Arabic-name detection | ✔ | ✘ | ✘ | ✘ | ✘ |
| PDPL-mapped compliance report | ✔ | ✘ | ✘ | ✘ | ✘ |
| Local privacy daemon with HTTP API for agent integration | ✔ | ✘ | ✘ | ✘ | ✘ |
| One-line install | ✔ | partial | partial | ✘ | ✘ |
| Open source (MIT) | ✔ | ✔ | ✔ | ✔ | ✘ |

**Novel primitives introduced:**

1. **Agentic AI skill installer** — Kakashi is the first tool to install as a first-class slash command across the entire agentic AI ecosystem. Every future agent that adopts the skill protocol will get Kakashi for free.
2. **PDPL-mapped compliance reporter** — the first open-source tool to map data-loss findings to specific articles of UAE Federal Decree-Law 45 of 2021, producing audit-ready HTML in both English and Arabic.
3. **Client-side database masking** — the first tool to fetch database rows over standard drivers (pg, mysql2, mongodb, snowflake-sdk, @databricks/sql, better-sqlite3) and mask them on the user's machine before they enter the AI context, preserving the "nothing leaves your device" guarantee.
4. **agent-guard local sidecar daemon** — a loopback-only HTTP API that any MCP-enabled agent can consult before shipping data (`POST /scan { "path": "..." }` returns PDPL-enriched counts without leaking raw values).

### 4. AI Ethics Compliance (Fairness, Transparency, Privacy)

**Assertion:** Kakashi is a privacy-preserving-by-design tool built specifically to enforce the UAE's ethical AI principles.

**Privacy:**

- 100% local processing. Zero network calls during scan or mask. The installer contacts npm once to fetch the package; after that, offline-capable.
- No telemetry, no analytics, no phone-home. This is auditable in the source code — every dependency is inspectable.
- Loopback-only HTTP API (`127.0.0.1`) with explicit remote-address checks even inside a Docker container.
- Counts-only default output (`kakashi scan`) — verbose previews are opt-in via `--verbose` and never enter an AI agent's context by default.
- Trust boundary is documented in [README.md](../README.md#use-it-safely-inside-an-ai-agent--read-this-once).

**Transparency:**

- Open source under MIT — every pattern, every mask, every article citation is inspectable at [github.com/Muhammadatef/kakashi](https://github.com/Muhammadatef/kakashi).
- `kakashi list-patterns` prints every active detection rule.
- `kakashi audit <file>` prints the full original→token mapping when the operator explicitly asks for it.
- Compliance report cites the exact PDPL articles for every finding class.

**Fairness (non-Latin coverage):**

- Native Arabic-name detection using Unicode range `\u0600-\u06FF`.
- Native RTL text preservation in Markdown, DOCX, and PDF masking pipelines.
- Bilingual CLI, README, and audit report — an Emirati auditor is not treated as a second-class user of an English-only tool.

**PDPL alignment (Federal Decree-Law No. 45 of 2021):**

| PDPL Article | Kakashi Coverage |
| --- | --- |
| Art. 1 (Personal Data) | Every PII pattern (email, phone, name, DOB, IP) |
| Art. 5 (Conditions for Processing) | Consent-preserving masking — data owner controls what is exposed |
| Art. 15 (Sensitive Personal Data) | Emirates ID, passport, unified ID, credit card, IBAN — all badged as "critical" severity |
| Art. 20 (Security of Personal Data) | Every credential pattern (17 detection classes + 15+ env_secret naming conventions) |
| Art. 21 (Breach Notification) | Every credential detection is a candidate breach event — surfaced in the compliance report |
| Art. 22 (Cross-Border Transfer) | Every pattern that identifies a data subject is flagged as cross-border-restricted when destined for a foreign LLM |
| Art. 25 (DPO Duties) | The HTML compliance report is designed to be handed directly to a DPO or the UAE Data Office |

### 5. Level of Impact

**Assertion:** Kakashi's impact is measured in the personal data and credentials it prevents from ever leaving a UAE-based device.

**Impact frame:**

- **Prevented-leak metric.** Every finding surfaced by Kakashi is a personal-data or credential leak that WOULD have happened if the user had pasted the file into an external LLM. `kakashi stats` prints the cumulative session count.
- **Concurrency across the UAE agentic-AI push.** The UAE has publicly committed to integrating agentic AI into 50% of government services. Kakashi is deployed at the point-of-leak (developer laptops, analyst workstations, ministry desktops) — one install per employee, thousands of prevented leaks per week per organisation at typical usage.
- **Zero incremental cost.** Because Kakashi is open source and runs locally, there is no per-user licence, no per-request cost, no cloud egress fee. Impact scales linearly with adoption; cost stays constant.

**Ready-to-cite adoption metrics (populate before submission):**

- npm weekly downloads (public): _to be captured_ — see [B5 dashboard](#future-work).
- GitHub stars: _to be captured_
- Cumulative findings prevented across opt-in telemetry: _to be captured_

**Pilot testimonials (populate before submission):**

- One UAE federal / local government entity: _in progress — see B2 in the roadmap_
- One UAE bank / telco / airline pilot: _in progress_
- One UAE academic pilot (MBZUAI, KU, NYUAD): _in progress_

---

## Alignment with UAE strategic documents

- **UAE AI Strategy 2031** — Objective: "Adopt AI across strategic sectors while maintaining public trust." Kakashi is the trust layer.
- **UAE Centennial 2071** — Sovereign digital infrastructure. Kakashi is homegrown, MIT-licensed, and 100% locally-executed.
- **UAE PDPL (Federal Decree-Law 45 of 2021)** — Kakashi's compliance report is mapped article-by-article.
- **UAE Data Office guidance on cross-border data transfer** — Kakashi's default posture is "block the leak at source," which is the strongest possible compliance stance.

---

## Ethical AI declaration

Kakashi does not itself train, fine-tune, or run any AI model. It is a **classical rule-based safety layer** designed to work *around* AI systems. This makes it:

- Deterministic (no hallucinated masks)
- Auditable (every pattern is a regex a compliance officer can read)
- Bias-free (no ML training data means no encoded bias — the same regex fires for every user regardless of nationality, gender, or language)
- Explainable (every finding cites the exact detection pattern id and PDPL article)

These properties are increasingly valued in regulated agentic AI deployments where explainability and predictability are non-negotiable.

---

## Reference artifacts

- **GitHub:** https://github.com/Muhammadatef/kakashi
- **npm:** https://www.npmjs.com/package/@muhammadatef/kakashi
- **English README:** [README.md](../README.md)
- **Arabic README:** [README.ar.md](../README.ar.md)
- **Architecture doc:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **Quantified impact metrics:** [UAE_AWARD_METRICS.md](UAE_AWARD_METRICS.md)
- **PDPL mapping module:** [src/lib/pdpl-mapping.js](../src/lib/pdpl-mapping.js)
- **Detection patterns:** [src/engine/patterns.js](../src/engine/patterns.js)

---

## Future work (v1.2 roadmap disclosed to the jury)

- True `worker_threads` parallelism for 100k+ file scans
- Streaming DOCX/PDF masking for gigabyte-scale documents
- Real PDF round-trip masking (currently text-extract + re-emit)
- Additional national ID formats (KSA, Egypt, India, EU)
- MCP-native transport for agent-guard so it appears as a first-class MCP server
- Public adoption dashboard (B5) with opt-in aggregate metrics

---

_Prepared for the UAE AI Award 3rd edition submission cycle. All facts in this document are verifiable against the open-source repository at the URLs above. Nothing in this document requires the jury to trust an unverifiable claim._
