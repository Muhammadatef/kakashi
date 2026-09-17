# LinkedIn Launch Posts — Kakashi

Internal draft. Customize before posting.

> **Hero image:** attach `logo.png` (1024×1024) from the repo root — that's the Kakashi mask icon you'll use across all socials.
> **Latest draft:** see "Post option V1.2 (RECOMMENDED — the Guardian release)" immediately below. It announces the Guardian loop, run-aware .docx/.pptx masking, and the now-proven database drivers. It carries a prerequisite: the branch must be merged and published first.
>
> **v1.1 launch:** see the "Post option V1.1" section — it announces the UAE-native features, database masking, agent-guard daemon, and the UAE AI Award narrative.

---

## Post option V1.2 (RECOMMENDED — the Guardian release)

> **Best for:** announcing the Guardian, run-aware document masking, and proven
> database masking.
> **PREREQUISITE — do not post before both of these are true:**
>   1. `feat/guardian-and-engine-correctness` is merged to `main`
>   2. the npm publish of the new version has completed
> As of this draft, neither has happened: `package.json` still reads 1.1.0 and the
> CHANGELOG entry is still under `[Unreleased]`. Posting earlier sends people to an
> `npm install` that gives them the previous release.
> **Hook strategy:** open with the run-splitting problem (concrete, technical,
> genuinely surprising), pivot to the Guardian as the systemic answer, close on
> the sovereignty angle.

---

A Word document can hide an API key from your scanner. Not because it is encrypted — because Word cut it in half.

Open any `.docx` and you will find the text stored as *runs*. Word starts a new run wherever anything changes: a bold character, a spellcheck mark, a language attribute, a revision id. A key like `sk-ant-api03-…` is routinely stored as two runs, split at an arbitrary point.

Most extractors join those runs with a space. The moment they do, `sk-ant-` and `api03-…` stop being a credential and become two harmless-looking words. The scan comes back clean. The key is still there.

**Kakashi now reassembles runs the way the format actually means them** — and, because a value spanning a run boundary never appears contiguously in the file, it replaces by offset rather than by string search. Formatting elsewhere in the paragraph is untouched.

That fix is small. The reason it matters is what sits on top of it.

🛡️ **Kakashi Guardian** — an autonomous protection loop. Not a pipeline. It holds a goal, observes the file, assesses risk from *context* (which agent is asking, where the data is going, which PDPL class is present), plans the **minimum necessary** protection, checks that plan against policy, applies it — then **re-reads its own output from disk and scans it again.** If anything prohibited survived, it escalates to a stronger transform and tries again. Decisions: `ALLOW`, `ALLOW_WITH_TRANSFORMATION`, `REQUIRE_APPROVAL`, `BLOCK`.

No LLM. No agent framework. No new dependency. Deterministic, auditable, and it fails closed — nothing reaches the output path until the verifier has signed it off.

🗄️ **Database masking, now proven.** The six drivers used to be tested against a mock. They now run against real databases in CI, and `--limit` executes **in the database** instead of after the fetch — 3 rows out of a 20-million-row query, in 2 seconds, instead of pulling the table into memory first.

🇦🇪 **Arabic that reads as Arabic.** Two adjacent Arabic words used to be treated as a personal name, which meant ordinary Arabic prose was masked — `تقرير امتثال` is "compliance report", not a person. False positives on our own source dropped 48 → 19, with no real name lost.

🔒 **Compliance reports redact by default.** The JSON report is the one built for CI and SIEM pipelines, so it was the worst possible place to embed the plaintext it had just found. It no longer does.

**321 automated tests. 35 detection patterns. Zero network calls. MIT.**

Sovereignty is not a slogan on a privacy tool. It is a property you have to be able to *check*. That is what the verify step is for.

`npm install -g @muhammadatef/kakashi`

Repo and changelog in the first comment.

#AgenticAI #Privacy #OpenSource #Sovereignty #PDPL #AI #DeveloperTools #MadeInTheUAE #UAEAIAward

---

### First-comment template (paste right after publishing)

```
GitHub:    https://github.com/Muhammadatef/kakashi
npm:       https://www.npmjs.com/package/@muhammadatef/kakashi
CHANGELOG: https://github.com/Muhammadatef/kakashi/blob/main/CHANGELOG.md

The Guardian in one command:
  kakashi guard report.docx --destination external_model

It will tell you what it found, what it plans to do, what it actually did,
and what was still detectable afterwards. If it cannot make the file safe,
it blocks and writes nothing.
```

### Alternative hook lines (A/B test these)

- "A Word document can hide an API key from your scanner. Not because it is encrypted — because Word cut it in half."
- "I stopped trusting my own masking tool. So I made it check its own work."
- "Most privacy tools mask and exit. They never look at what they produced. Kakashi Guardian re-reads its own output and disagrees with itself when it has to."
- "`تقرير امتثال` means 'compliance report'. Our tool used to mask it as a person's name. That is what happens when Arabic is an afterthought."

### Honesty notes before posting

- Do **not** claim other DLP tools miss the run-split case without checking. Several
  handle it. The honest claim is that it is a subtle failure mode and Kakashi now
  handles it correctly — not that it is unique in doing so.
- The run-splitting weakness existed in **v1.1.0, which is live on npm.** If you
  reference the fix publicly, add a security note to the CHANGELOG first so anyone
  on 1.1.0 knows to upgrade. Decide that before posting, not after.
- Every number above is measured, not estimated:
  - **321 tests** = the full suite. 319 run anywhere; 2 need a Postgres and are
    reported as skipped without one, never as passed.
  - **48 → 19** and **211 → 175** = `kakashi scan-dir src`, where every hit is a
    false positive by definition because the source contains no real personal data.
  - **20M rows / 2s** = the Postgres `generate_series` integration test, which is
    the proof that `--limit` executes server side.
  - **35 patterns** = `require('./src/engine/patterns').PATTERNS.length`.

### Assets to attach

| Asset | Purpose |
| --- | --- |
| Terminal recording of `kakashi guard` escalating (verify FAIL → replan → PASS) | The single most convincing asset — it shows the loop changing its mind |
| Screenshot of the OBSERVE/ASSESS/PLAN/VERIFY output with PDPL articles | Shows the audit trail a DPO would want |
| Before/after of a split-run `.docx` (runs visible in the XML) | Makes the hook concrete |

---

## Post option V1.1 (superseded by V1.2 — sovereign privacy launch)

> **Best for:** announcing Kakashi v1.1.0, the sovereign-privacy release. Already shipped — kept for reference and for reusable hook lines. Post before or right after submitting to the UAE AI Award so the "made in the UAE" narrative is timely.
> **Hook strategy:** open with a real-world catch (the leaked API key we found on a live UAE stack yesterday), pivot to what shipped, close with the award angle.

---

Yesterday I ran Kakashi against a real UAE analytics stack — a football-analytics platform running Postgres, pgvector, and Airflow.

It caught a live OpenRouter API key sitting in a committed `.env` file, one `git push` away from public GitHub.

**That's exactly what Kakashi v1.1 shipped for.**

New in v1.1 — the sovereign-privacy release:

🇦🇪 **UAE-native detection.** Emirates ID with Luhn checksum. UAE IBAN with mod-97 checksum. UAE mobile, landline, trade licence, unified ID, visa, Arabic names. No other DLP tool ships with these.

🗄️ **Client-side database masking.** New `kakashi db-scan`, `db-mask`, `db-audit` — with native drivers for Postgres, MySQL, MongoDB, Snowflake, Databricks, and SQLite. Query 1,000 customer rows, get 1,000 masked rows locally. The AI never sees the raw data.

📊 **PDPL-mapped compliance reports.** Every finding now cites the specific article of UAE Federal Decree-Law 45/2021 that governs it. Bilingual English/Arabic HTML output. Hand it straight to a Data Protection Officer.

🤖 **agent-guard daemon.** A local privacy sidecar on `127.0.0.1`. Any agentic AI can `POST /scan` before shipping a file — refuse the send if findings > 0. This is the piece that makes agentic AI safe to deploy at national scale.

🌐 **Bilingual EN + AR.** Full Arabic CLI, README, and compliance report. RTL preservation everywhere.

**Zero network calls. Zero telemetry. 101 automated tests. MIT licence.**

Now submitting Kakashi to the UAE AI Award (3rd edition, "Agentic AI Solutions Developed in the UAE" category). The pitch: as the UAE rolls agentic AI into 50% of government services, Kakashi is the local privacy layer that makes that push safe for citizen data.

Install in 30 seconds:

`npm install -g @muhammadatef/kakashi`

Repo, npm, and full changelog in the first comment.

Open to feedback, PRs, and pilots with any UAE ministry, bank, or hospital that wants a compliance-ready privacy layer for its AI programme.

#UAEAIAward #AgenticAI #Privacy #OpenSource #Sovereignty #PDPL #AI #DeveloperTools #MadeInTheUAE

---

### First-comment template (paste right after publishing)

```
GitHub:    https://github.com/Muhammadatef/kakashi
npm:       https://www.npmjs.com/package/@muhammadatef/kakashi
CHANGELOG: https://github.com/Muhammadatef/kakashi/blob/main/CHANGELOG.md
Arabic README: https://github.com/Muhammadatef/kakashi/blob/main/README.ar.md

Happy to walk any UAE gov/bank/university team through a 30-min pilot.
Ask about: Emirates ID detection, PDPL Art. 22 compliance workflow, or
the agent-guard MCP integration path. AMA below.
```

### Alternative hook lines (A/B test these)

- "Yesterday I ran Kakashi against a real UAE analytics stack. It caught a live OpenRouter API key in one minute."
- "The UAE is putting agentic AI into 50% of government services. Somebody had to build the local privacy layer that makes it safe."
- "Every agentic AI in the UAE is one paste away from a PDPL violation. So I built Kakashi v1.1."
- "Kakashi v1.1 is out. Emirates ID, UAE IBAN, Arabic names, database masking, agent-guard daemon — all local, all MIT, all made in the UAE."

### Assets to attach

| Asset | Purpose |
| --- | --- |
| Cover PNG of `docs/TECHNICAL_IMPLEMENTATION.pdf` (page 1) | Hero card at top of post |
| 60-second demo video (see `docs/DEMO_VIDEO_UAE.md`) | Native LinkedIn upload — do NOT link YouTube |
| Screenshot of `kakashi scan-dir` HTML report | Shows the PDPL compliance evidence |
| Screenshot of `/kakashi-scan` inside Cursor | Shows the agentic AI integration |

---

## Post option V1.1-B — scan-dir + audit (the enterprise governance angle)

> **Best for:** posting after the sovereign-privacy launch, when you want to
> engage the CIO / DPO / procurement audience specifically. Attach a
> screenshot of the `scan-dir` HTML report (bilingual EN/AR) as the hero image.

---

Yesterday I pointed Kakashi v1.1 at a real UAE analytics project. Six files. 2.3 seconds. 150 findings. Every one mapped to a specific article of Federal Decree-Law No. 45 of 2021 (UAE PDPL).

```
Total findings:    150
By category:       35 ID & docs · 74 personal info · 41 credentials
By severity:       70 critical · 43 high · 37 medium

Top PDPL articles cited:
  Art. 1  Definitions of Personal Data          →  109
  Art. 22 Cross-Border Transfer                 →   76
  Art. 5  Conditions for Processing             →   73
  Art. 20 Security of Personal Data             →   70
  Art. 21 Reporting a Personal Data Breach      →   41
```

That's not a spreadsheet a developer built by hand. That's what `kakashi scan-dir` emits by default.

Three new enterprise-governance capabilities in v1.1:

📁 **`kakashi scan-dir <path>`** — recursive privacy scan of any repository, shared drive, or S3-mounted bucket. Respects `.gitignore` and `.kakashiignore`. Concurrent workers scale to 100k-file trees. Four output formats: JSON (for SIEM), HTML (for auditors), Markdown (for GitHub PR comments), text (for CLI).

🇦🇪 **PDPL-native reporting.** Every finding cites the specific UAE PDPL article that governs it. Nine articles catalogued: Art. 1 (Personal Data), 5 (Processing), 6 (Consent), 9 (Data Subject Rights), 15 (Sensitive Data), 20 (Security), 21 (Breach Notification), 22 (Cross-Border Transfer), 25 (DPO Duties). The HTML report renders bilingual English/Arabic with RTL preservation — a Data Protection Officer can read it in either language, hand it to the UAE Data Office as audit evidence, and no human has to re-map anything.

🔍 **`kakashi audit`** — for when a regulator asks "prove it." Prints the full original→token mapping per finding. Deliberately verbose, deliberately documented as such. Trust *and* verify.

**Zero cloud.** All processing is in-process on the user's machine. Zero telemetry. Zero network calls during scan or audit. The report contains no raw secret values — you get counts and severities, and only `audit` (invoked explicitly) shows the plaintext.

`npm install -g @muhammadatef/kakashi` — v1.1.0 is live.

MIT licence. 110 automated tests. npm provenance-signed. Made in the UAE.

If you're a UAE ministry, bank, hospital, insurer, or agency running an AI programme, I would genuinely like to pilot this with your team — DM me. First-time contributors are welcome on the repo too.

#UAEAIAward #AgenticAI #Privacy #PDPL #Compliance #DataProtection #OpenSource #MadeInTheUAE

---

### First-comment template for this variant

```
📁 scan-dir demo run (150 findings in 2.3 s on a real project):
https://github.com/Muhammadatef/kakashi/blob/main/docs/TECHNICAL_IMPLEMENTATION.pdf

📊 Every finding mapped to a PDPL article — DPO / audit-ready output:
https://github.com/Muhammadatef/kakashi/blob/main/src/lib/pdpl-mapping.js

🇦🇪 Arabic README + bilingual reports:
https://github.com/Muhammadatef/kakashi/blob/main/README.ar.md

📄 Full technical brief (16-page A4 PDF):
https://github.com/Muhammadatef/kakashi/blob/main/docs/TECHNICAL_IMPLEMENTATION.pdf

Open to demos / pilots with any UAE-regulated organisation. AMA below.
```

### Screenshot to attach (the hero image)

Run this and screenshot the browser view of the resulting HTML — the
bilingual PDPL-cited report is the single most compelling visual asset
Kakashi produces:

```
kakashi scan-dir ./your-project -f html --lang ar -o /tmp/audit.html
open /tmp/audit.html    # or: xdg-open /tmp/audit.html
```

---

## Post option A — problem-first (original v1.0 launch)

Every time a developer pastes a file into Cursor or Claude, they might be sending API keys, customer emails, and database passwords to an external server — without a single warning.

I built **Kakashi** to fix that.

It's a local-first masker that installs as a skill into 20+ AI coding agents — Claude Code, Cursor, Codex CLI, Windsurf, Cline, and more. Six slash commands (`/kakashi-scan`, `/kakashi-mask`, `/kakashi-audit`, `/kakashi-stats`, `/kakashi-list`, `/kakashi`) appear directly in your agent's chat. Type `/kakashi-mask /path/to/file.env` and it scans, masks, and writes a safe-to-share version locally. **Nothing leaves your machine.**

50+ file formats, including PDF, Word, Excel, PowerPoint, JSON, YAML, TOML, .env, plus 40+ source-code extensions. The masker reconstructs the original format — Word stays Word, Excel stays Excel.

Open source under MIT. One line to install:

```bash
npm install -g @muhammadatef/kakashi
```

GitHub: https://github.com/Muhammadatef/kakashi
npm:    https://www.npmjs.com/package/@muhammadatef/kakashi

Why "Kakashi"? Named after the Copy Ninja from Naruto — always masked, adapts to any environment, copies into every agent it meets. Felt right.

#OpenSource #Privacy #DeveloperTools #AI #Cursor #ClaudeCode #DataMasking #InfoSec

---

## Post option C — problem-as-hook + video (recommended for reach)

> **Best for:** LinkedIn launch with a 30-60 sec native demo video attached.
> **Hook strategy:** open with the visceral leak scenario in the first 2 lines
> (before LinkedIn's "see more" cutoff at ~210 chars on mobile), then pivot to
> the solution. Link goes in the **first comment**, not the post body.

---

You just dropped `customers.csv` into Cursor for a "quick segmentation."
Or you pasted a 40-page contract into Claude to "summarize it real quick."

You didn't read every cell. You didn't scroll every page.

Buried in row 1,847 — or in an appendix on page 23 — were real names, emails, national IDs, an API key someone left in a footnote, a database password in a config table.

They just left your machine. Forever. No undo.

This happens in every team, every day:

→ A PM exports customers.csv → asks Claude to summarize churn → real PII goes external
→ An analyst pastes a SQL result into ChatGPT → live customer records ride along
→ A founder uploads a board deck to an LLM → revenue, contracts, salaries leak
→ An engineer drops a vendor PDF into Cursor → an embedded API key ships with it

GitLeaks won't catch it — it only scans git history.
TruffleHog won't catch it — it runs in CI, after the damage.
Your IDE won't catch it — it has no idea what "sensitive" means.
GDPR & SOC2 won't save you — they punish the leak, they don't prevent it.

So I built **Kakashi**.

It's a local-first masker that installs as a skill inside 20+ AI coding agents — Claude Code, Cursor, Codex, Windsurf, Cline, Copilot, and more. Six slash commands appear right in your agent's chat:

• `/kakashi-scan <file>` — counts what's sensitive (no previews — agent-safe)
• `/kakashi-mask <file>` — writes `masked_<file>` alongside the original
• `/kakashi-audit <file>` — full original → token mapping
• `/kakashi-stats` · `/kakashi-list` · `/kakashi`

50+ file formats: PDF, Word, Excel, PowerPoint, JSON, YAML, .env, and 40+ source-code extensions. Word stays Word. Excel stays Excel. The masker reconstructs the original format.

**Zero network calls. Nothing leaves your machine. Ever.**

One line to install:
`npm install -g @muhammadatef/kakashi`

Open source, MIT. Demo video below — 45 seconds, scan → mask → diff.

**Contributions, new detection patterns, new agent integrations, new file formats — all welcome.** If you've ever felt the "wait, did I just paste that?" panic, you're exactly the person I want PRs from. Issues, ideas, and a star are all appreciated.

Repo link in the first comment.

#OpenSource #Privacy #AI #DeveloperTools #InfoSec

---

### First-comment template (paste right after publishing)

```
GitHub: https://github.com/Muhammadatef/kakashi
npm:    https://www.npmjs.com/package/@muhammadatef/kakashi

Happy to answer questions on the detection patterns, the agent install
mechanism, or why I named it after Kakashi Hatake. AMA below.
```

### Video shot list (30-60 sec, vertical or square)

| Sec | Frame | Caption (burned-in) |
| :-: | --- | --- |
| 0-3 | Split frame: `customers.csv` in Excel (left) + a long PDF scrolling fast (right) | "you didn't read every page. you didn't check every cell." |
| 3-8 | Both files being dragged into ChatGPT / Claude chat windows | "one drop. real names, IDs, API keys — gone." |
| 8-15 | Cut to terminal: `kakashi scan customers.csv` → categorized counts output | "kakashi scans locally first — zero network calls" |
| 15-22 | Same scan, this time on the PDF — counts pop up showing buried credentials found | "even buried in page 23 — kakashi finds it" |
| 22-32 | `kakashi mask` runs → `masked_*` files appear in finder | "writes a safe-to-share version. original untouched." |
| 32-45 | Split-screen diff: original vs masked (names → `[FULL_NAME_1]`, key → `[OPENAI_KEY_1]`) | "real data → typed tokens. consistent across the file." |
| 45-55 | Cursor chat: typing `/kakashi-mask /path/to/file` → result inline | "inside 20+ AI agents — Claude, Cursor, Codex, Copilot…" |
| 55-60 | End card: kakashi logo + `npm i -g @muhammadatef/kakashi` | "30 seconds to install. nothing leaves your machine." |

> Burn captions onto every frame — 75% of LinkedIn views are muted.
> Export 1080×1080 (square) or 1080×1350 (4:5 portrait) — never 16:9.
> Keep file under 200 MB to avoid LinkedIn's silent re-compression.

---

## Post option B — technical + metaphor

**I built Kakashi — a tool that masks secrets and personal data before you share files with AI agents.**

Named after the Copy Ninja from Naruto. He wears a mask his entire life. Nobody sees his face. Kakashi the tool masks your data before it leaves your machine.

Why the name fits:
- **The mask** — hides identity; the tool hides API keys, IDs, and personal records
- **Copy Ninja** — adapts to any environment; installs into Cursor, Claude, Codex, and 20+ agents
- **Quiet, elite** — local-only, zero telemetry, zero network calls during scan/mask

```bash
npm install -g @muhammadatef/kakashi
kakashi scan report.docx
kakashi mask report.docx
```

50+ formats: PDF, Word, Excel, PowerPoint, JSON, YAML, .env, plus 40+ source-code extensions. Works inside any AI coding agent. Open source.

GitHub: https://github.com/Muhammadatef/kakashi
npm:    https://www.npmjs.com/package/@muhammadatef/kakashi

#OpenSource #Privacy #AI #DeveloperTools #NodeJS

---

## Visual assets to attach

| Asset | File | Purpose |
| --- | --- | --- |
| **Primary launch image** | `og-card.png` (1200×630) | LinkedIn / Twitter / Slack — the wordmark + tagline + Kakashi icon. Use as the post hero. |
| Square avatar / icon | `logo.png` (1024×1024) or `logo-256.png` (256×256) | GitHub social preview, profile-pic-style fallback |
| Tiny avatar | `logo-64.png` (64×64) | Favicon, npm sidebar |
| Screenshot 1 | terminal `kakashi scan` output (categorized) | Proves the engine works |
| Screenshot 2 | Cursor chat showing `/kakashi-scan` | Proves the in-agent flow |
| Screenshot 3 | side-by-side diff: `realistic_prompt.md` vs `masked_realistic_prompt.md` | Proves the masking is real |
| Optional asciinema | 30-sec demo of scan → mask → cat | Live demo for the curious |

### GitHub social preview (do this once after `git push`)

Settings → Options → "Social preview" → upload **`og-card.png`**.
This image will then render as the link card whenever someone pastes the GitHub URL into LinkedIn, Twitter, Slack, Discord, etc.

---

## Hashtags

#OpenSource #Privacy #PII #DataMasking #Secrets #Cursor #ClaudeCode #Codex #AI #DeveloperTools #NodeJS #InfoSec #Naruto

---

## Posting checklist

- [ ] GitHub repo is public + has description, topics, and README rendering correctly
- [ ] npm package is live (`npm view @muhammadatef/kakashi`)
- [ ] At least one of the three screenshots in hand
- [ ] `logo.png` ready as the post hero
- [ ] First comment ready with a "ask me anything" or a follow-up CTA (boosts engagement)
- [ ] Tag relevant hashtags but cap at ~5 in the post body, more in the first comment
