# Kakashi UAE Pilot Kit

Everything needed to secure the first UAE reference customer (workstream B2 of the roadmap).

> Securing an actual UAE deployment is a business-development task, not a code task — but everything a UAE Data Protection Officer or CIO needs to say **yes** in a 30-minute meeting is included in this kit.

---

## Target list — descending order of reference-story impact

| # | Target | Why they matter | Pitch angle |
| :-: | --- | --- | --- |
| 1 | **A UAE federal ministry** (Ministry of AI / Ministry of Interior / MOHRE) | A ministry testimonial makes Kakashi a "used by UAE government" story — the highest-impact reference available. | Kakashi enables safe agentic AI in 50%-of-services goal. |
| 2 | **UAE Data Office** (data.gov.ae) | The regulator itself using Kakashi is the ultimate stamp. | Kakashi is a compliance instrument, not just a security tool. |
| 3 | **A UAE bank** (Emirates NBD, ADCB, FAB, Mashreq) | Banks are the most PII-heavy verticals; a bank testimonial closes the "enterprise-ready" objection. | Preventing PDPL Art. 22 (cross-border) violations. |
| 4 | **A UAE telco** (e&, du) | Telcos handle millions of Emirates IDs; testimonial signals scale. | Emirates-ID mass masking. |
| 5 | **A UAE airline** (Emirates, Etihad) | Global brand + PII-heavy + Arabic-first. | Sovereign data + Arabic-name detection. |
| 6 | **A UAE university** (MBZUAI, KU, NYUAD, AUS) | Academic pilot is easiest to secure and adds "research-grade" signal. | Free / permissive licensing for research groups. |
| 7 | **A UAE SME / startup accelerator** (Hub71, in5, Area 2071) | Fast to close; multi-tenant pilot; MVP proof-of-concept. | AI adoption without compliance overhead. |

---

## The 30-minute pitch (script)

**Opening (2 min):**
> "The UAE has committed to putting agentic AI into 50% of government services. Every one of those deployments has the same risk: an employee pastes a file into an AI agent, and personal data leaves UAE soil in one click. Kakashi is the free, open-source, locally-executed tool that stops that leak — and produces a compliance report mapped directly to PDPL Federal Decree-Law 45 of 2021."

**Live demo (10 min):**

1. `npm install -g @muhammadatef/kakashi` on their laptop.
2. Run `kakashi scan tests/fixtures/uae_sample.md` — show the categorized counts.
3. Run `kakashi mask tests/fixtures/uae_sample.md` — open `masked_uae_sample.md` and show Emirates ID replaced.
4. Run `kakashi scan-dir /some/project -f html -o /tmp/audit.html --lang ar` — open the HTML report in the browser, show the PDPL article citations and Arabic UI.
5. `kakashi agent-guard --watch /some/project` — show the loopback HTTP API responding to `curl` — this is the "agentic sidecar" story.

**Objection handling (10 min):**

| Objection | Response |
| --- | --- |
| "Does data leave our machines?" | No. Zero network calls during scan/mask. The installer contacts npm once, then offline-capable. |
| "How do we know?" | Open source under MIT. Every line auditable. `npm ls` shows only the dependencies you can see. |
| "What about Word/Excel formatting?" | Kakashi reconstructs the original format. Word stays Word. Excel stays Excel. |
| "We already use GitLeaks / TruffleHog." | Those scan git history — after leaks happen. Kakashi stops leaks at the moment of paste. |
| "Does it cover our national identifiers?" | Native detection for Emirates ID (with Luhn checksum), UAE passport, UAE IBAN (with mod-97 checksum), UAE mobile/landline, trade licence, Arabic names. |
| "What integrations do you have?" | 20+ agentic AI platforms including Cursor, Claude Code, Copilot, Codex, Windsurf. Any MCP-enabled agent can also query the agent-guard HTTP API. |
| "How do we run this at scale?" | `kakashi scan-dir` with `--parallel N` handles 100k+ file trees. A machine-readable JSON report drops into any SIEM. |
| "Support?" | Direct maintainer support during pilot. Post-pilot: GitHub issues + a signed SLA if you want it. |

**Ask (5 min):**

> "One week of pilot. We install on 5 laptops in your team. You run whatever workflow you want. At the end I ask you two questions: **(a) what did Kakashi catch that would have leaked?** and **(b) is Kakashi something you would recommend to another UAE organisation?** Your answers become one line in a public testimonial and a case study on kakashi.dev."

**Close (3 min):**

> "A 2-line testimonial from you would materially strengthen the case for this tool. You get: (a) a free enterprise privacy tool for your team, (b) named recognition in the project and follow-up press, and (c) preferential feature-request treatment for v1.2. May I send the pilot pack today?"

---

## Pilot pack (send after every meeting)

Attach these files by name:

- [README.md](../README.md) — English overview
- [README.ar.md](../README.ar.md) — Arabic overview
- [ARCHITECTURE.md](ARCHITECTURE.md) — threat model + data-flow diagrams
- One-page PDF export of the compliance report from `kakashi scan-dir` (use `chrome --headless --print-to-pdf`)

Include in the email body:

> "Attached: full technical brief. Install with `npm install -g @muhammadatef/kakashi`. First `kakashi scan` takes 30 seconds. Happy to run a live pilot walkthrough — reply with two 30-minute slots."

---

## Testimonial capture — 2-line template

After the pilot, ask for:

> "In up to 2 sentences: what did Kakashi catch on your team's real data, and would you recommend it to another UAE organisation?"

**Example format for the submission:**

> "During a 5-day pilot, Kakashi flagged 4,213 Emirates IDs, 812 API keys, and 47 database passwords across our repository — all of which our developers had been about to share with external AI agents. We now require Kakashi as a pre-check for any file leaving a developer laptop."
> — **[Name], [Title], [UAE Entity]**

**Fallback if a full testimonial isn't approved:** anonymous metric.

> "During a 5-day pilot at a UAE federal ministry, Kakashi surfaced 4,213 Emirates IDs and 812 credentials that would otherwise have entered external agentic-AI contexts."

Anonymised metrics still carry weight publicly and preserve confidentiality for the pilot partner.

---

## Legal & procurement paperwork

- **MIT license** — no procurement approval needed for the software itself.
- **DPA (Data Processing Agreement):** not required — Kakashi does not process data on any third-party infrastructure. Explicit statement of this available on request.
- **Security review:** entire source code is public. A ministry infosec team can complete a review in a single afternoon.
- **Insurance / indemnity:** requestable through a maintainer support agreement for enterprise pilots.

---

## Post-pilot deliverables

Kakashi delivers to the pilot partner:

1. Named acknowledgement in the [README.md](../README.md) "Used by" section (opt-in).
2. Direct maintainer channel (email + weekly call) for the duration of the pilot.
3. Any UAE-specific feature request the pilot needs, prioritised into v1.2.
4. Bilingual case-study PDF written jointly with the partner's comms team.

---

_This kit is intentionally scoped so any UAE organisation reading it can say "yes" to a pilot in one 30-minute meeting. Update the target list as pilots are confirmed._
