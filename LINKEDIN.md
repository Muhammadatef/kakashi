# LinkedIn Launch Posts — Kakashi

Internal draft. Customize before posting.

> **Hero image:** attach `logo.png` (1024×1024) from the repo root — that's the Kakashi mask icon you'll use across all socials.
> **v1.1 launch:** see the "Post option V1.1 (RECOMMENDED)" section below — it's tuned to announce the new UAE-native features, database masking, agent-guard daemon, and the UAE AI Award submission narrative in one post.

---

## Post option V1.1 (RECOMMENDED — sovereign privacy launch)

> **Best for:** announcing Kakashi v1.1.0, the sovereign-privacy release. Use immediately after the code hits main and the npm publish completes. Post before or right after submitting to the UAE AI Award so the "made in the UAE" narrative is timely.
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
