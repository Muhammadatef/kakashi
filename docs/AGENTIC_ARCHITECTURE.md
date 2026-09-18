# Kakashi — Agentic Architecture

> **Status:** Milestone 0 (discovery) + Milestone 1–3 (Guardian MVP, CLI, tests) delivered,
> plus the detection-correctness follow-up described in §22.1 and the `TaskAnalyzer`
> (the first half of Milestone 4) described in §20.6.
> Milestones 5–10, and Milestone 4's field-level semantics, are specified here but
> **not implemented**.
>
> Companion to [ARCHITECTURE.md](ARCHITECTURE.md), which documents Kakashi v1.1 as it
> exists. This document records what was found during repository discovery, what the
> Guardian reuses, and what it adds.

---

## 0. The single most important discovery

**Kakashi is a Node.js / CommonJS project, not a Python project.**

There is no `pyproject.toml`, no `setup.py`, no Python package. The entire system is
`bin/*.js` + `src/**/*.js` on Node ≥ 18, published to npm as `@muhammadatef/kakashi`.

The Guardian is therefore implemented in **CommonJS JavaScript**, matching the existing
module style (`module.exports` / `require`), the existing test harness (hand-rolled
`check()` runners under `tests/`, no Jest/Mocha), and the existing CLI framework
(`commander`). Conceptual class names from the brief (`GuardianState`, `PolicyGuard`,
`RiskAssessment`, …) are preserved; only the language is adapted.

---

## 1. Current Kakashi architecture

Four layers, bottom-up:

| Layer | Modules | Responsibility |
| --- | --- | --- |
| **L1 — Rules** | `CLAUDE.md`, `AGENTS.md`, `src/rules/kakashi-activate.md`, `commands/*.md`, `skills/` | Tell an AI agent *when* to invoke Kakashi. Prose, not code. |
| **L2 — Engine** | `src/engine/patterns.js`, `src/engine/masker.js`, `src/engine/formats/`, `src/engine/db/` | Deterministic detection + transformation. The trusted security core. |
| **L3 — Compliance/UX** | `src/lib/pdpl-mapping.js`, `reporter.js`, `scan-dir.js`, `i18n.js`, `stats.js`, `output.js` | Severity, PDPL articles, reports, EN/AR, cumulative stats. |
| **L4 — Sidecar** | `src/agent/guard.js` | Long-lived loopback HTTP daemon + fs watcher. |

Entry points: `bin/kakashi.js` (CLI), `bin/install.js` (agent integration installer).

## 2. Current execution flow

```
CLI argv → formats.readFile(path) → { text, wb?, cells? }
        → maskText(text, {mode, whitelist, enabled})
        → { masked, findings[] }
        → formats.writeMasked(src, out, data, replMap, masked)
        → exit(findings.length > 0 ? 1 : 0)
```

This is a **straight-line pipeline**. It has no memory, no goal, and no notion of whether
the transformation it just performed was sufficient. Every run is identical given identical
input. That is the gap the Guardian closes.

## 3. Existing security boundary

Documented in `ARCHITECTURE.md §5` and enforced by four defaults, all verified present in
code:

1. `scan` prints **counts only**; previews are `--verbose` opt-in (`src/lib/output.js`, `quiet` branch).
2. `mask` writes to disk; never streams the body to stdout unless `--stdin`.
3. `audit` is deliberately verbose and documented as such.
4. `agent-guard`'s `POST /scan` returns the PDPL summary, **never** raw finding values
   (`src/agent/guard.js`, and asserted by `tests/guard.test.js`).

Plus: loopback-only bind with a `req.socket.remoteAddress` re-check, zero outbound sockets,
zero telemetry, originals never overwritten without `--overwrite`.

## 4. Existing features

File masking (5 format families), directory masking, recursive estate scan with
PDPL-mapped JSON/HTML/Markdown reports, client-side database masking across 7 drivers,
loopback privacy daemon with JSONL audit log, bilingual EN/AR CLI, cumulative stats,
privacy-preserving impact snapshot, agent auto-install for 7 AI coding agents.

## 5. Existing detectors — 35 patterns

`src/engine/patterns.js`, three categories:

- **`id` (9):** `national_id` (Emirates ID), `intl_phone`, `passport`, `visa_id`,
  `trade_lic`, `pobox`, `non_latin_name` (Arabic), `unified_id`, `uae_iban`
- **`pii` (9):** `email`, `phone`, `ip`, `cc`, `ssn`, `dob`, `date`, `age`, `full_name`
- **`cred` (17):** `jwt`, `ssh_key`, `aws_key`, `openai_key`, `anthropic`, `hf_token`,
  `gh_token`, `slack`, `stripe`, `bearer`, `db_conn`, `sql_password`, `databricks_token`,
  `databricks_host`, `s3_uri`, `env_secret`, `hex_secret`

Each pattern carries `id`, `label`, `labelAr`, `cat`, `rx`, optional `validate(match, text, idx)`,
and `fakeValues[]`. Checksum primitives `luhnCheck`, `isValidEmiratesId`, `isValidIban` are
exported and deliberately **not** wired into `validate` (documented rationale: matchers stay
lenient, strict validation happens in the reporter as a `checksumVerified` badge).

## 6. Existing transformations

`maskText(text, { mode })` supports exactly **three** modes:

| Mode | Output | Notes |
| --- | --- | --- |
| `typed` (default) | `[NATIONAL_ID_1]` | Stable, per-value, counted tokens. Inert — no pattern re-matches a token. |
| `redact` | `[REDACTED]` | Total value destruction. |
| `fake` | a value from `pattern.fakeValues` | **Format-preserving and therefore still detectable.** |

`enabled: [patternId, …]` restricts which patterns run; `whitelist` exempts literal values.
Overlapping matches are resolved greedily: sort by start ascending, then longest-first, and
keep the first non-overlapping run.

There is **no** `drop`, `generalize`, `tokenize-with-stable-pseudonym`, or field-level
transform. See §17.

## 7. Existing supported file types

- `formats.SUPPORTED_EXTS` — 17 extensions used for glob-driven bulk operations.
- `formats/text.js CODE_EXTS` — **96** extensions treated as plain text.
- Binary/structured handlers: `xlsx` (cell-addressed, substring substitution per cell),
  `docx`, `pptx` (both via `jszip` XML rewrite), `pdf` (read via `pdf-parse`; **write is
  lossy** — emits a masked `.md` extract, not a PDF).

## 8. Existing AI-agent integrations

`bin/install.js` holds an `AGENTS` registry with `{ id, name, detect(), install() }` for:
`claude`, `cursor`, `codex`, `windsurf`, `cline`, `copilot`, `continue`. Each install writes
a rule file (`~/.claude/CLAUDE.md` marker block, `~/.cursor/rules/kakashi.mdc`,
`~/.codex/AGENTS.md`, …) and copies six slash commands.

**The registry models agent *identity* and *installation*, not agent *trust*.** There is no
trust level, no network-capability flag, no permission set.

## 9. Existing hooks / interception mechanisms

There are **no** hooks in the programmatic sense. What exists:

- **Prose interception** — the marker-block rule instructs the agent to scan before sharing.
  Advisory; an agent can ignore it.
- **Passive `fs.watch`** in `agent/guard.js` — observes *after* a write, cannot prevent one.
- **Loopback HTTP RPC** — `GET /health`, `POST /scan`, `POST /mask`. Synchronous and
  callable *before* an agent attaches a file, so this is the only real interception point,
  and it is **advisory**: the daemon answers, the agent decides.

Conclusion: the guard daemon's HTTP surface is the correct place to mount the Guardian, but
Kakashi cannot today *enforce* a decision — it can only inform one. That limitation is
preserved and stated honestly rather than papered over.

## 10. Existing CLI commands

`scan`, `audit`, `mask`, `mask-dir`, `db-scan`, `db-audit`, `db-mask`, `scan-dir`,
`agent-guard`, `stats`, `impact`, `list-patterns`. Global `--lang en|ar`.
Exit codes: `0` clean, `1` findings, `2` error.

## 11. Existing configuration / policies

**None.** This is the single largest gap. There is no config file, no `.kakashirc`, no
policy schema, no per-agent or per-destination rules. Every knob is a CLI flag, resolved
per-invocation. `~/.kakashi/stats.json` is the only persisted state and it holds counters only.

## 12. Existing audit / logging behaviour

- `agent-guard --log <path>` appends JSONL: `{ t, kind, path, findings, bySeverity }`.
  Counts only — no values. Good.
- `~/.kakashi/stats.json` — cumulative counters.
- `kakashi impact` — deliberately coarse snapshot (month bucket, no paths, no machine id).

No event carries a *decision*, because there are no decisions to record.

## 13. Existing tests

Hand-rolled harness, `node tests/run.js`, 8 suites. **Baseline measured at discovery: 110
assertions, 0 failures** (`patterns` 62, `masker` 7, `cli` 5, `pdpl` 6, `db` 10,
`reporter` 6, `i18n` 8, `guard` 6).

`tests/pdpl.test.js` uses `unmappedPatternIds()` to fail on mapping drift when a pattern is
added — a pattern the Guardian copies for its own class map.

## 14. Existing security guarantees

1. Local-first — zero outbound sockets outside the user's own DB drivers.
2. Originals untouched unless `--overwrite` (which prompts).
3. Counts-only by default; value exposure is explicit and named (`audit`, `--verbose`).
4. Loopback-only daemon with a defence-in-depth remote-address check.
5. No telemetry, no phone-home, no crash reporting.
6. Every detection rule is a readable regex, printable via `list-patterns`.

## 15. Components that become Guardian tools

| Existing component | Guardian role |
| --- | --- |
| `formats.readFile` | Resource reader (observation + execution input) |
| `maskText(text)` | **Sensor** — full-detector sweep producing findings |
| `maskText(text, {enabled, mode})` | **Actuator** — class-scoped transform (`tokenize`/`redact`/`synthesize`) |
| `pdpl.summarize(findings)` | Severity + PDPL enrichment feeding the risk engine |
| `formats.writeMasked` | Artifact writer |
| `formats.readFile` (again, on the artifact) | **Verifier input** — real round-trip re-read |
| `stats.STATS_DIR` | Audit-log home |

## 16. Components that must NOT change

`src/engine/patterns.js`, `src/engine/masker.js`, `src/engine/formats/*`,
`src/engine/db/*`, `src/lib/pdpl-mapping.js`, `src/lib/reporter.js`, `src/lib/scan-dir.js`,
`src/lib/output.js`, `src/lib/i18n.js`, `src/agent/guard.js`.

These are the trusted deterministic core and are covered by the 110 baseline assertions. The
Guardian is **additive only**: a new `src/guardian/` package plus one new CLI subcommand.
Weakening any of the above to make the Guardian look more autonomous is explicitly out of bounds.

## 17. Missing capabilities required for the Guardian

| Missing | Why it blocks autonomy |
| --- | --- |
| Goal | Nothing to satisfy; the pipeline just ends. |
| State | No memory across steps, so no "different next action". |
| Risk assessment | `SEVERITY` is per-finding and context-free. No score, no destination, no agent. |
| Policy engine | No rules exist to be more authoritative than a planner. |
| Agent trust model | `install.js` knows agent *names*, not agent *privileges*. |
| Destination model | Kakashi never asks where data is going. |
| Task / purpose model | Without it, "minimum necessary" is undefinable. |
| **Verification** | `mask` never re-scans its own output. The core agentic feedback signal is absent. |
| Decision outcomes | No ALLOW / TRANSFORM / APPROVE / BLOCK vocabulary. |
| Human-in-the-loop | No approval concept anywhere. |
| Decision audit | Log records events, not decisions. |
| Field-level transforms | `drop`, `generalize`, `pseudonymize` do not exist (see §19). |

## 18. Potential regressions / security risks introduced by the Guardian

| Risk | Mitigation implemented |
| --- | --- |
| Intermediate half-protected artifacts left on disk when the run ends in BLOCK | All iterations write into `fs.mkdtempSync` scratch; the artifact is promoted to the output path **only** on a verified-safe decision, and the scratch dir is removed in `finally`. |
| Guardian audit log leaking values | Audit events are built from class names, pattern ids and counts only; a dedicated test greps the written JSONL for every raw fixture secret. |
| Path traversal / symlink abuse via `--out` | Input is `realpathSync`'d and must be a regular file; output directory is `realpathSync`'d and the output must resolve inside it; output may not equal the input. |
| Compounding mutation across iterations | `formats.readFile` mutates `data.wb` in place for xlsx. The executor **re-reads the source file every iteration** and applies an *absolute* (not incremental) plan. |
| Infinite replan loop | `maxIterations` (default 4), then fail closed to BLOCK. |
| Executor gaining broad powers | The executor takes an authorised plan and calls `maskText` + `formats.writeMasked`. No shell, no network, no eval, no dynamic tool loading. |
| Unknown agent treated permissively | `profiles.resolve()` returns the `unknown` profile — `trust: low`, `networkCapable: true` (conservative on both axes). |
| Guardian appearing to *enforce* when it only *advises* | Stated in §9 and in the CLI output. The Guardian returns a decision; the calling agent still has to honour it. |

---

## 19. Capability matrix

Populated from the repository, not assumed.

| Capability | Existing? | Current module | Guardian role | Action |
| --- | --- | --- | --- | --- |
| Scanning / detection | **EXISTING** | `engine/patterns.js` + `engine/masker.js` | Observation sensor | **reuse** |
| Masking (tokenize) | **EXISTING** | `masker.js` mode `typed` | Tool `tokenize` | **reuse** |
| Redaction | **EXISTING** | `masker.js` mode `redact` | Tool `redact` | **reuse** |
| Synthetic substitution | **EXISTING** | `masker.js` mode `fake` | Tool `synthesize` | **reuse** |
| Class-scoped transform | **EXISTING** | `masker.js` option `enabled` | Per-class actuation | **reuse** |
| Secret detection | **EXISTING** | 17 `cred` patterns | Observation | **reuse** |
| PII detection | **EXISTING** | 9 `pii` patterns | Observation | **reuse** |
| UAE / government IDs | **EXISTING** | 9 `id` patterns + checksums | Observation | **reuse** |
| PDF | **EXISTING (read)** / **PARTIAL (write)** | `formats/pdf.js` | Resource | **reuse**, document lossy write |
| Excel / Word / PowerPoint | **EXISTING** | `formats/{xlsx,docx,pptx}.js` | Resource | **reuse** |
| 96 text/code extensions | **EXISTING** | `formats/text.js` | Resource | **reuse** |
| Database masking | **EXISTING** | `engine/db/` (7 drivers) | Resource | **reuse** — not wired into MVP |
| Severity ranking | **EXISTING** | `lib/pdpl-mapping.js SEVERITY` | Risk input | **reuse** |
| PDPL article mapping | **EXISTING** | `lib/pdpl-mapping.js` | Explainability | **reuse** |
| Compliance reporting | **EXISTING** | `lib/reporter.js` | Reporting | **do not change** |
| Cursor / Claude / Codex + 4 more | **PARTIAL** | `bin/install.js AGENTS` | Agent identity | **extend** → trust profiles |
| Hooks / interception | **PARTIAL** | `agent/guard.js` HTTP + `fs.watch` | Interception point | **evaluate** — advisory only (§9) |
| Audit logging | **PARTIAL** | `agent/guard.js --log` JSONL | Decision audit | **extend** |
| Policies / configuration | **MISSING** | — | PolicyGuard | **implement** |
| Goal | **MISSING** | — | SecurityGoal | **implement** |
| State / iteration | **MISSING** | — | GuardianState | **implement** |
| Risk scoring | **MISSING** | — | RiskEngine | **implement** |
| Planner / replanner | **MISSING** | — | Planner | **implement** |
| **Verification** | **MISSING** | — | Verifier | **implement** |
| Human-in-the-loop | **MISSING** | — | Approval gate | **implement** |
| Destination model | **MISSING** | — | GuardianContext | **implement** |
| Task semantics (class level) | **MISSING** | — | TaskAnalyzer | **implemented — §20.6** |
| Task semantics (field level) | **MISSING** | — | TaskAnalyzer | **defer to M4** |
| `drop` / `generalize` / `pseudonymize` | **MISSING** | — | Field-level tools | **SHOULD NOT IMPLEMENT (MVP)** — see below |
| LLM / semantic reasoning | **MISSING** | — | LocalModelTaskAnalyzer | **defer to M7** |
| Agent-to-agent firewall | **MISSING** | — | Interaction model | **defer to M10** |

### Why `drop` / `generalize` are deliberately absent from the MVP

The brief's worked example (`DROP NAME`, `GENERALIZE DOB → AGE_GROUP`) assumes a
**field/column-addressed** engine. Kakashi's engine is **flat-text, byte-offset addressed**:
`maskText` finds spans in a string. It has no column concept — even the xlsx handler
flattens every cell into one newline-joined blob before detection.

Implementing `DROP column` honestly requires a new schema-aware layer for `xlsx`/`csv`/DB
rows. Building a fake one that pretends to drop a column while actually regex-replacing
values would be exactly the "make Kakashi *look* agentic" failure the brief forbids. So the
MVP exposes only the three transforms that genuinely exist, and the Guardian reasons on the
axis Kakashi actually has: the **sensitivity class**. Field-level transforms are Milestone 4+.

---

## 20. Guardian MVP design (delivered)

### 20.1 New modules

```
src/guardian/classes.js    SENSITIVITY_CLASSES — pattern id → class; drift check
src/guardian/goal.js       SecurityGoal
src/guardian/context.js    GuardianContext (agent, task, resource, destination, policy)
src/guardian/task.js       TaskAnalyzer — stated purpose → per-class requirement
src/guardian/profiles.js   AgentProfile registry (trust, network capability)
src/guardian/state.js      GuardianState + STATUS enum + transition log
src/guardian/observe.js    Observer — wraps readFile + maskText + summarize; metadata only
src/guardian/risk.js       RiskEngine — deterministic score + level + reason codes
src/guardian/actions.js    Action / ProtectionPlan — typed, validated
src/guardian/policy.js     POLICIES data + PolicyGuard.validate()
src/guardian/planner.js    Planner.createPlan() / replan from verification + rejection
src/guardian/executor.js   Executor — boring; authorised plan → maskText → writeMasked
src/guardian/verifier.js   Verifier — re-read artifact from disk, full re-scan
src/guardian/audit.js      Safe audit events (JSONL)
src/guardian/paths.js      Path validation (realpath, regular-file, containment)
src/guardian/index.js      runGuardian() — the loop
tests/guardian.test.js     Unit + integration tests
tests/task.test.js         TaskAnalyzer unit, property and injection tests
```

Reused unchanged: `engine/masker`, `engine/patterns`, `engine/formats/*`,
`lib/pdpl-mapping`, `lib/stats` (for `STATS_DIR`).

### 20.2 The loop

```
GOAL + CONTEXT
   ↓
initialise state ──────────────────────────┐
   ↓                                       │
OBSERVE        formats.readFile + maskText + pdpl.summarize
   ↓                                       │
UNDERSTAND     TaskAnalyzer → intent + per-class requirement
   ↓           (absent/unrecognised purpose ⇒ baseline, and costs risk points)
ASSESS         RiskEngine → score, level, reason codes
   ↓                                       │
   ├── immediate-block? ──────────────► BLOCK
   ↓                                       │
PLAN           Planner: minimum-necessary set of class→tool actions, informed by
   ↓                    the purpose, previous rejections and verifications
VALIDATE       PolicyGuard: authorise / reject / require-human
   ↓                                       │
   ├── requires human? ──────────────► REQUIRE_APPROVAL (unless pre-authorised)
   ├── rejected? ─────────────────────► record rejection ──┘ (replan)
   ↓
EXECUTE        Executor: re-read source, apply passes, write scratch artifact
   ↓
VERIFY         Verifier: re-read the artifact from disk, full re-scan,
   ↓                     compare residue against the policy prohibition set
   ├── satisfied? ────────────────────► promote artifact → ALLOW_WITH_TRANSFORMATION
   └── not satisfied → record residue → ┘ (replan, iteration+1)

iteration > maxIterations ─────────────► BLOCK (fail closed)
```

### 20.3 Two independent, genuine replan triggers

This is what makes the loop agentic rather than a decorated pipeline. Both are driven by
real environmental feedback, not by a script.

**Trigger A — verification failure (environment disagrees with the plan).**
`maskText` mode `fake` substitutes values from `pattern.fakeValues`, which are
*format-preserving and therefore still detectable* — `intl_phone`'s fakes are
`+971501234567` and `0501234567`; `national_id`'s is `784-1990-9999999-0`. A planner
optimising for task utility legitimately prefers `synthesize` (a synthetic phone preserves
column shape and downstream parsing). The verifier then re-reads the written artifact and
the detector fires on the synthetic value. Goal unsatisfied → the planner escalates that
class one rung down the utility ladder (`synthesize → tokenize → redact`) and re-executes.

This is not a contrived failure. It is a correct security property: a downstream DLP scanner
or receiving model cannot distinguish a synthetic Emirates ID from a real one either, and a
synthetic UAE phone number may belong to a real person. Detectability is the right criterion
for a *prohibited* class; format preservation is only acceptable for a *restricted* one.

**Trigger B — policy rejection (authority disagrees with the plan).**
`PolicyGuard` holds `allowedTransforms` per class per destination. If the planner proposes
`synthesize` for `GOVERNMENT_IDENTIFIER` bound for `external_model`, the policy rejects it
outright — the planner does not get to overrule the policy — and the next iteration must
propose a transform from the permitted set.

**Trigger C — residue discovered on re-scan.** `maskText` resolves overlapping matches
greedily. A class-scoped pass (`enabled: [...]`) resolves overlaps differently from the full
sweep, so the artifact can contain a prohibited class the first observation never reported.
The verifier catches it and the planner adds it to the plan.

### 20.4 Deterministic vs semantic split

| Component | Deterministic today | Could become semantic later |
| --- | --- | --- |
| Detection (`patterns.js`) | **Always deterministic.** Non-negotiable. | Never. |
| Checksum validation | **Always deterministic.** | Never. |
| `PolicyGuard` | **Always deterministic.** Higher authority than any reasoner. | Never. |
| Risk scoring | Deterministic weights + reason codes | Never — explainability requires stable arithmetic. |
| Executor | Deterministic | Never. |
| Verifier | Deterministic re-scan | Never. |
| Audit | Deterministic | Never. |
| **Which fields the task actually needs** | Not modelled in MVP | **M4/M7 — `TaskAnalyzer`.** Sees field *names* + class labels + the task string. Never raw values. |
| **Which transform best preserves utility** | Fixed ladder `synthesize → tokenize → redact` | **M4/M7** — a proposal only; `PolicyGuard` still adjudicates. |

Anything a semantic component produces is a **proposal**. It enters the loop upstream of
`PolicyGuard` and can always be rejected by it.

### 20.5 What the Guardian is *not*

- It is not an LLM wrapper. No `openai`, no `anthropic`, no LangChain/LangGraph/CrewAI
  dependency is added. `package.json` dependencies are unchanged, and a test asserts it.
- It does not enforce. It decides; the calling agent must honour the decision (§9).
- It does not replace `kakashi mask`. `mask` remains the one-shot pipeline.
- **It is not a product surface.** The Guardian is an internal implementation detail,
  like the masker or the format handlers. Users install Kakashi the way they always
  have (`npx @muhammadatef/kakashi install-agents`) and get the Guardian as a
  subcommand of the CLI they already have. No daemon, no server, no second package, no
  new concept to configure. `tests/guardian.test.js` locks this: it fails if a runtime
  dependency is added, if the seven-agent installer registry changes, or if the loop
  ever requires a socket.

---

### 20.6 Delivered — the TaskAnalyzer (`guardian/task.js`)

Until this shipped, `--task` was decoration: it was printed and written to the audit
event, and nothing read it. The planner picked the least destructive transform for
every class alike, found out it was wrong only when the verifier failed, and climbed
the ladder one wasted iteration at a time.

The analyzer turns the stated purpose into a requirement per sensitivity class:

| Requirement | Meaning | Tool preference |
| --- | --- | --- |
| `REQUIRED_DISTINCT` | the task counts, joins or groups by this, so two different values must stay different | `tokenize` → `redact` → `synthesize` |
| `REQUIRED_SHAPE` | the task needs the value to still look like the real thing | `synthesize` → `tokenize` → `redact` (the baseline) |
| `NOT_REQUIRED` | the task never reads this class | `redact` → `tokenize` → `synthesize` |

Six intents are recognised — `analytics`, `engineering`, `communication`, `narrative`,
`migration`, `testing` — by keyword match over a fixed English + Arabic vocabulary. No
model, no network, no new dependency, for the same reason the risk engine is a weights
table (§20.4). An unrecognised purpose is *reported as unrecognised* and changes nothing.

**Why this cannot be used as an attack.** The task string is supplied by the very agent
the Guardian is protecting data from — it is the obvious channel for a prompt-injected
agent to argue for its own access. So the analyzer is built so that the argument cannot
be won:

> A task can only ever move a class to an **equal or more destructive** transform than
> the Guardian would have chosen knowing nothing at all.

No intent can request plaintext; the strongest claim a purpose can make is "I need to
tell values apart", which is answered with stable tokens, not with values. Every
preference order is a permutation of the ladder that only moves *more* destructive tools
earlier, so the property holds for any subset of policy-permitted tools, not just the
full set. `task.js` exports `assertNonWeakening()` and the suite runs it as a property
test across every intent × class × permitted-tool subset (504 combinations), plus an
end-to-end test that fires injection-shaped task strings at a real run and asserts the
released artifact is never less protected than the no-task baseline.

Purpose also costs risk points in one direction only: `TASK_NOT_STATED` (+5) and
`TASK_NOT_UNDERSTOOD` (+3). Stating a purpose never buys a discount, because a discount
is exactly what a crafted string would go shopping for. The score is explanatory in any
case — it gates no decision.

**What it changes in practice.** On `tests/fixtures/guardian_employees.md` to an external
model, a blind run needs two iterations (synthesize → fails verification → tokenize); the
same run with `--task "calculate average salary by age group"` reaches the same safe
artifact in one, and a `--task "debug the failing export job"` redacts the people
outright, because debugging has no use for them.

Still not implemented (the rest of Milestone 4): field-level semantics. The analyzer
reasons about classes, not columns — it cannot say "keep `department`, drop `salary`".
That needs the field-addressed engine described in §19.

---

## 21. Delivered — CLI

```
kakashi guard <file> --agent cursor \
                     --task "calculate average salary by age group" \
                     --destination external_model
```

| Flag | Meaning |
| --- | --- |
| `-a, --agent` | `claude`\|`cursor`\|`codex`\|`windsurf`\|`cline`\|`copilot`\|`continue`\|`local_model`; anything else is treated as `unknown` (low trust) |
| `-t, --task` | Recorded and explained. Never parsed, never trusted as an instruction. |
| `-d, --destination` | `local`\|`local_model`\|`known_external`\|`external_model`\|`unknown` |
| `-p, --policy` | Policy id (`default` ships) |
| `-o, --output` | Artifact path (default `guarded_<name>`) |
| `--approve` | Comma-separated classes a human signs off (e.g. `CREDENTIAL`) |
| `--max-iterations` | Replan budget before failing closed (default 4) |
| `--audit-log` / `--no-audit` | JSONL decision log (default `~/.kakashi/guardian-audit.jsonl`) |
| `--json` | Machine-readable decision — the audit event, which is value-free by construction |

Exit codes are decision-shaped so an agent or CI job can branch without parsing stdout:

| Code | Meaning |
| --- | --- |
| 0 | `ALLOW` or `ALLOW_WITH_TRANSFORMATION` — safe to release |
| 2 | Error (failed closed; nothing written) |
| 3 | `REQUIRE_APPROVAL` — a human must sign off; nothing written |
| 4 | `BLOCK` — nothing written |

## 22. Delivered — verified behaviour

Full suite: **151 assertions, 0 failures** (110 pre-existing + 41 new). No existing test
was modified; no module in §16 was changed.

The MVP success criterion, as asserted in `tests/guardian.test.js`:

```
PLAN     #1  CONTACT -> synthesize   (least destructive permitted transform)
EXECUTE  #1  16 replacements
VERIFY   #1  FAIL - CONTACT x7 still detectable in the written artifact
REPLAN       CONTACT survived its transform; escalate
PLAN     #2  CONTACT -> tokenize     <- DIFFERENT ACTION, caused by feedback
VERIFY   #2  PASS - 0 prohibited classes remain
DECISION     ALLOW_WITH_TRANSFORMATION
```

Crucially, `PERSON_NAME` stays on `synthesize` across both iterations: escalation is
targeted at the class that actually failed, and `QUASI_IDENTIFIER` (the DOB column the
"salary by age group" task needs) is preserved throughout. The artifact keeps DOB,
department and salary while Emirates ID, IBAN, email and phone are tokenised.

### 22.1 The verifier earns its keep

Guarding a `.xlsx` to an `unknown` destination produced a genuine three-iteration
escalation ending in `BLOCK`:

```
VERIFY #1  FAIL - PERSON_NAME x2   (after synthesize)
VERIFY #2  FAIL - PERSON_NAME x2   (after tokenize)
VERIFY #3  FAIL - PERSON_NAME x2   (after redact)
DECISION   BLOCK - PROTECTION_EXHAUSTED, no artifact written
```

The cause is a **pre-existing bug in Kakashi**, not in the Guardian.
`engine/formats/xlsx.js` flattens all cells into one newline-joined string for
detection, then writes back by per-cell substring substitution. The `full_name` pattern
separates capitalised words with `\s`, which matches newlines, so in a spreadsheet it
yields matches that span cells (`"Dept\nAhmed Hassan"`). No single cell contains that
string, so the write silently does nothing.

`kakashi mask` has always had this behaviour and reports success anyway — names survive
masking in spreadsheets. The Guardian cannot fix the engine, but because it re-reads its
own output it *notices*, exhausts every permitted transform, and refuses to release the
file. This is the clearest argument for the verify step: it converts a silent failure
into a loud, fail-closed one.

**Fixed in a follow-up change** (kept out of the Guardian MVP because §16 freezes
`patterns.js`, and a detection-behaviour change touching 62 baseline assertions belongs
in its own commit). Every separator that should mean *intra-line whitespace* is now
`[ \t]` rather than `\s`, across eleven patterns; `ssh_key` stays multi-line because a
PEM block genuinely is. That fixes both the spreadsheet write failure above and the
related false positive where `"Notes\n\nNothing"` read as a person's name. A structural
test now walks every pattern and fails if `\s` reappears outside a negated character
class or a zero-width lookaround.

The Guardian's own behaviour here is unchanged, and the escalation above is no longer
reproducible for that fixture — which is the point: the verify step was what turned a
silent masking failure into a visible one in the first place.

## 23. Not implemented

Milestones 5–10 are specified in this document but not built: UAE policy pack,
local semantic model, policy memory, prompt-injection / exfiltration guard,
agent-to-agent firewall. Milestone 4 is half-built: the `TaskAnalyzer` ships
(§20.6), its field-level semantics do not. Also out of scope:
wiring the Guardian into `agent-guard`'s HTTP surface, and Guardian support for the
`db-*` commands (the loop currently operates on files).

Known limitations of what *was* built:

- Reasoning is class-level, not field-level; `drop` and `generalize` do not exist (§19).
  The `TaskAnalyzer` inherits that limit: it decides per class, never per column.
- Intent recognition is keyword matching. A purpose phrased outside the vocabulary is
  reported as unrecognised and falls back to the baseline — safe, but no help.
- `fake` mode cycles a short `fakeValues` list, so two distinct people can synthesise to
  the same name. Fine for a prohibited class (which escalates past `synthesize` anyway),
  lossy for a restricted one.
- PDF artifacts are markdown extracts, inheriting `formats/pdf.js`'s lossy write.
- The Guardian advises; it cannot compel an agent to honour its decision (§9).
