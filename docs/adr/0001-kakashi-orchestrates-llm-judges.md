# ADR 0001 — Kakashi orchestrates, the LLM only judges

- Status: Accepted
- Date: 2026-10-31
- Release: v1.4.0 (Layer 4 · Sweep)

## Context

A repository-wide data-flow audit needs semantic judgement ("is this
`to_csv` an export of customer data or of an aggregate?") that regexes and
parsers cannot give. Agentic security scanners usually hand the whole
loop to an LLM: the model decides what to read, when it is done, and what
the findings are. That is non-deterministic, unauditable, cannot prove
coverage, and sends raw source — including any hardcoded personal data —
to the model.

## Decision

Kakashi owns the loop; the LLM is a bounded worker.

1. **Scope is deterministic.** Files, selectors, packs and batches are
   computed by code from a fingerprint and versioned selectors. A task
   sentence may only add packs. POLICY (`assertCoverageNonWeakening`)
   rejects any plan that narrows coverage.
2. **Workers see only Guardian-guarded views** of selector-matched files.
   Raw values never reach the model, whether `external_model` or
   `local_model`.
3. **Every judgement is verified**: strict schema, exactly-once signal
   accounting, value re-scan, edge validity. Rejected batches are reissued,
   split or escalated within `--max-iterations`.
4. **Only Kakashi decides** COMPLETE / PARTIAL / BLOCKED, with typed gaps,
   and logs the decision value-free. Approvals come from a human.

## Consequences

- Runs are reproducible and auditable (selector hash, run dir,
  iteration log); coverage is a number, not a claim.
- Quality of semantic judgement still depends on the model; Sweep bounds
  and verifies it but cannot make it correct. A mock worker and a bench
  with seeded signals measure this.
- CI without an agent yields PARTIAL (`map_skipped`); gating uses the
  deterministic reduce output.
- Only selector-matched code is analysed; new conventions need new
  selectors (authored and fixture-tested, see docs/SWEEP.md).
