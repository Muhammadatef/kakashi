---
description: Layer 4 Sweep -- deterministic repository data-flow audit ("where does customer data go?"); Kakashi orchestrates, you only judge guarded views
---

Run a Kakashi Sweep over a repository. Sweep is a Guardian-style
deterministic loop: Kakashi fingerprints the repo, picks selectors, shards
signals into batches and writes **Guardian-guarded views** of each file.
You (the host agent) act only as a bounded judge of those views. Kakashi
verifies every submission and decides COMPLETE / PARTIAL / BLOCKED. You
never self-approve and you never open original source files.

## Narrate first

Before each shell command say, in one short sentence each:

- **CHOSE** — `kakashi sweep` (Layer 4 Sweep).
- **WHY** — the user asked where customer data / PII flows in a repo
  ("data-flow audit", "PDPL data lineage", "audit where customer data goes").

## Steps

1. Parse `$ARGUMENTS` for the **repo dir** (default `.`), the **task**
   sentence, the **agent** id (claude / cursor / codex / ...), and the
   **destination**: `external_model` (default) or `local_model` for an
   offline local LLM. A vague task only *adds* packs; the
   `pii_flow_audit` floor is always swept.
2. Plan the run (agent-safe JSON, no values):
   ```
   kakashi sweep "<dir>" --task "<intent>" --agent <agent> \
     --destination external_model --json
   ```
   Add `--since origin/main` for an incremental PR sweep,
   `--max-iterations 4` (default) to bound replanning, `--dry-run` to
   show the plan only. Fallback: `npx -y @muhammadatef/kakashi sweep ...`.
   - Exit `3` REQUIRE_APPROVAL: **stop and ask a human** (e.g. a
     credential class needs `--approve CREDENTIAL`). Never add `--approve`
     yourself.
   - Exit `4` BLOCKED / `2` error: stop, report the reason code.
3. **Map — process the batches.**
   - **If you can spawn subagents** (Claude Code Task, Cursor background
     agents, ...): spawn one subagent per batch, in parallel. Each subagent
     loops:
     1. `kakashi sweep next --dir "<dir>"` → JSON with `batch`, `signals[]`,
        `views{rel: path}`, `findings_schema`, `instructions`, `selectors[]`
        (or `{done:true, decision}` → exit the loop).
     2. Read **ONLY** the guarded view files listed in `views`. Never open
        the original repo file, never `cat` / grep the source tree.
     3. Write a findings JSON matching `findings_schema` exactly — one
        result per signal id, `FINDING` (severity P0/P1/P2, confidence,
        edge, sink_type, preconditions, remediation) or `NOT_AN_ISSUE`
        (reason). No extra fields, strings <= 500 chars, never copy a value.
     4. `kakashi sweep submit <batch_id> <findings.json> --dir "<dir>"` →
        `{accepted, errors[]}`. On rejection (SCHEMA_INVALID,
        SIGNAL_MISSING, VALUE_LEAK, EDGE_INVALID, ...) fix and let Kakashi
        reissue via `next`; do not argue with the verifier.
   - **If you cannot spawn subagents**, run the same loop sequentially,
     one batch at a time, starting each batch with fresh context (drop the
     previous batch's views from your working memory).
4. Reduce and report (value-free):
   ```
   kakashi sweep reduce --dir "<dir>"
   kakashi sweep status --dir "<dir>" --json
   kakashi sweep report --dir "<dir>" -f md -o kakashi-sweep.md
   ```
   Offer `-f html` (add `--lang ar` for Arabic), `-f sarif` (code scanning)
   or `-f json` (CI).
   Optional: write chain explanations / remediation wording as
   `{"chains": {"<chainId>": "..."}, "remediation": {"<findingKey>": "..."}}`
   and attach it with `kakashi sweep narrative <file> --dir "<dir>"`.
   It is re-scanned for values like every submission; describe data, never
   quote it.
5. Report to the user: decision and exit meaning (0 COMPLETE, 1 PARTIAL
   with the gap list, 3 REQUIRE_APPROVAL, 4 BLOCKED), coverage (files in
   scope, signals, accounted %), P0 chains source → sink, top PDPL
   articles, owners from CODEOWNERS, and the recommended next step.

## Never

- Never open original source files — only the guarded views `next` lists.
- Never use `kakashi sweep report --include-values` in an agent-visible
  turn; it reads raw lines and is for a human terminal only.
- Never self-approve, never weaken coverage (a plan that removes files,
  languages, classes, selectors or packs is rejected by POLICY).
- Never paste the values you might infer into findings — VERIFY re-scans
  every submission and rejects with VALUE_LEAK.

See [docs/SWEEP.md](../docs/SWEEP.md) for the full loop, selector
authoring guide and CI recipe.
