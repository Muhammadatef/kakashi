# Kakashi Sweep — Layer 4 (v1.4.0)

> "Where does customer data go in this repository?" — answered by a
> deterministic, auditable orchestrator, with an LLM used only as a
> bounded, verified judge of guarded code.

Layers 1–3 of Kakashi protect a **file**, a **database result** and a
**release decision**. Layer 4, Sweep, audits a **whole repository**: SQL,
dbt, Python, notebooks, Airflow DAGs and config. It finds every place
personal data is read, transformed, joined, exported, logged or exposed,
builds a flow graph, and reports PII source → external sink chains with
PDPL article citations and CODEOWNERS.

See also: [ADR 0001 — Kakashi orchestrates, the LLM judges](adr/0001-kakashi-orchestrates-llm-judges.md),
[CI example](examples/sweep-pr.yml), [`/kakashi-sweep`](../commands/kakashi-sweep.md).

---

## 1. The loop

Sweep is a Guardian-style deterministic loop. Every stage except MAP is
plain code; MAP is the only stage where a model participates, and its
output is verified before it counts.

| Stage | What happens | Module |
| --- | --- | --- |
| **OBSERVE** | Fingerprint the repo: files in scope, languages, dbt project, `.gitignore` / `.kakashiignore`, optional parsers available | `src/sweep/fingerprint.js` |
| **UNDERSTAND TASK** | `analyzeSweepTask(task)` (EN + AR keywords) maps the sentence to intents/packs. The task may only **add** packs; `pii_flow_audit` is the floor | `src/sweep/intent.js` |
| **PLAN** | Load selectors (built-in packs + `.kakashi/selectors`), validate schema and fixtures, compute a selector hash | `src/sweep/selectors/` |
| **POLICY** | `assertCoverageNonWeakening(floor, proposed)` rejects any plan that removes a file, language, class, selector or pack, or adds an ignore (`FILE_REMOVED`, `LANGUAGE_REMOVED`, `CLASS_REMOVED`, `SELECTOR_REMOVED`, `PACK_REMOVED`, `IGNORE_ADDED`). A rejected plan never executes | `src/sweep/policy.js` |
| **ACT** | Run selectors → signals (line spans only); shard signals into token-bounded batches; write a **Guardian-guarded view** of every file in a batch (line-for-line aligned, values tokenised) | `shard.js`, `batch.js` |
| **MAP** | The host agent pulls batches with `kakashi sweep next` and submits judgements with `kakashi sweep submit` | CLI |
| **VERIFY** | Schema, exactly-once accounting of signal ids, value re-scan of the submission, edge validity (file in scope, line in range) | `src/sweep/findings-schema.js` |
| **REPLAN** | Rejected batch → reissue; oversized / repeatedly failing → split; credential class → escalate to approval. Bounded by `--max-iterations` (default 4) | CLI loop |
| **REDUCE** | Dedupe findings by (file, line, operation, sink), merge dbt lineage + worker edges into a flow graph, find chains, map PDPL articles, attach CODEOWNERS | `src/sweep/reduce/` |
| **DECISION** | `COMPLETE` / `PARTIAL` (with typed gaps) / `BLOCKED`, appended value-free to `~/.kakashi/guardian-audit.jsonl` | — |

### Exit codes

| Exit | Meaning |
| --- | --- |
| `0` | COMPLETE — every signal accounted for and verified |
| `1` | PARTIAL (or IN_PROGRESS) — see `decision.gaps` (`batch`, `file`, `selector`, `approval`, `map_skipped`) |
| `2` | operational error — fail closed |
| `3` | REQUIRE_APPROVAL — a human must approve (e.g. `--approve CREDENTIAL`); agents never self-approve |
| `4` | BLOCKED |

---

## 2. Trust boundary

| Actor | Sees | Never sees |
| --- | --- | --- |
| Kakashi (local process) | Raw repo files | — (zero network calls) |
| Host model (worker) | Guarded views of selector-matched files, signal ids, selector rationale | Raw values (emails, IDs, keys, IBANs ...) |
| Report / audit log | Counts, spans, edges, PDPL articles | Values (unless a human runs `--include-values` locally) |

- **Kakashi orchestrates, the LLM only judges.** The model cannot choose
  what is in scope, cannot drop a selector, and cannot mark the run
  complete. Its submissions are rejected unless every signal is answered
  exactly once and the JSON is value-free.
- **Workers see only guarded views.** Views are produced by the same
  engine as `kakashi guard`; VERIFY re-scans each submission and rejects
  with `VALUE_LEAK` if any engine pattern matches.
- **`--destination local_model`** marks the worker as an offline local LLM
  (Ollama, llama.cpp ...). Policy is identical; the decision record shows
  the destination.
- **Optional parsers** — `node-sql-parser`, `web-tree-sitter` +
  `tree-sitter-python` — are loaded lazily if installed. When absent,
  every kind falls back to regex, and the fallback is reported in
  `degradations[]` and in the Coverage section of the report. No new
  required dependency.
- **Only selector-matched files are analysed.** The report says so
  explicitly; Sweep is a preventive control, not a proof of absence.

---

## 3. CLI

```bash
kakashi sweep <dir> --task "<intent>" --agent <id> \
  --destination external_model|local_model [--policy id] [--since <ref>] \
  [--max-iterations n] [--dry-run] [--lang en|ar] [--json] [--approve CREDENTIAL]
kakashi sweep next   [--run <id>] [--dir <repo>]
kakashi sweep submit <batch_id> <findings.json> [--run id] [--dir repo]
kakashi sweep status [--run id] [--json]
kakashi sweep reduce [--run id]
kakashi sweep report [--run id] -f md|html|json|sarif -o path [--lang ar] [--include-values]
kakashi sweep selectors validate [--pack ids] [--repo dir]
kakashi sweep selectors propose <file.yaml> [--dir repo]
```

`sweep next` returns
`{run_id, batch, signals[], views:{rel:path}, findings_schema, instructions, selectors:[{id,description,rationale}]}`
or `{done:true, decision}`. `sweep submit` returns `{accepted, errors[]}`.

`--include-values` on `sweep report` is the **only** path that reads raw
lines; it prints a loud banner and is NOT agent-safe.

Mock worker (deterministic fake findings, full loop, no LLM):

```bash
node demos/sweep-mock-worker.js demos/sweep-bench
```

---

## 4. Packs

| Pack | Purpose |
| --- | --- |
| `pii_flow_audit` | **Floor — always on.** PII columns in SQL, dbt PII lineage and exposures, Python logging / writes / HTTP / cloud uploads / SMTP, Airflow transfers, hardcoded values |
| `external_export_audit` | Adds `export.*` selectors: egress to buckets, SFTP, HTTP, email |
| `logging_leak_audit` | Adds `logging.*` selectors: records and dataframes in logs / stdout |
| `schema_change_impact` | Stub (no selectors yet); reported as `SCHEMA_CHANGE_IMPACT_STUB` |

---

## 5. Selector authoring guide

Repository selectors live in `.kakashi/selectors/*.yaml` (or `.json`).
The file is a list of selectors, or `{selectors: [...]}`. YAML is a
**strict subset**: block maps/lists, quoted and block scalars, flow
lists — no anchors, aliases, tags or flow maps.

### Schema

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Unique, dotted (`acme.sql.loyalty_ids`). Must not collide with built-ins |
| `kind` | yes | `pattern` \| `sql_column` \| `dbt_graph` \| `ast` \| `regex` |
| `description` | yes | One line; shown to workers |
| `rationale` | yes | Why this is a privacy-relevant point; shown to workers |
| `sensitivity_class` | yes | `CREDENTIAL` `GOVERNMENT_IDENTIFIER` `FINANCIAL` `CONTACT` `PERSON_NAME` `QUASI_IDENTIFIER` `TECHNICAL_IDENTIFIER` `BUSINESS_ATTRIBUTE` `LOCATION` |
| `evidence_kind` | yes | `read` `transform` `join` `export` `log` `expose` `value` |
| `languages` | no | Restrict to languages (`sql`, `python`, `notebook`, `yaml`, ...); kind default otherwise |
| `query` | yes | Kind-specific (below) |
| `fixtures` | yes | `positive` (each must match ≥ 1) and `negative` (each must match 0). A bare string uses the kind's default path; `{path, text}` sets the language |

Validate before committing: `kakashi sweep selectors validate --repo .`.
An agent may propose new selectors with `kakashi sweep selectors propose
file.yaml`; Kakashi accepts only schema-valid, fixture-passing, additive
selectors and copies them to `.kakashi/selectors/proposed-<hash>.yaml`.

### `pattern` — hardcoded values via the engine

```yaml
- id: pii.values.contact
  kind: pattern
  description: Hardcoded email address or phone number in code or config
  rationale: A literal contact handle in a repo is personal data at rest outside any governed store.
  sensitivity_class: CONTACT
  evidence_kind: value
  query:
    pattern_ids: [email, phone, intl_phone]   # or classes: [CREDENTIAL]
  fixtures:
    positive: ['ALERT_TO = "test.user@example.com"']
    negative: ['ALERT_TO = os.environ["ALERT_TO"]']
```

### `sql_column` — PII columns in SQL (and SQL strings in Python)

```yaml
- id: pii.sql.contact_columns
  kind: sql_column
  description: SQL reads, joins or exports email / phone / address columns
  rationale: Contact handles are direct identifiers.
  sensitivity_class: CONTACT
  evidence_kind: read
  languages: [sql, python]
  query:
    columns: [email, "*_email", phone, "phone_*", "*_phone", address]
    contexts: [select, join, where, copy, unload, insert_select, ctas, select_star]
    pii_tables: [customers]          # only for select_star
  fixtures:
    positive:
      - path: models/stg_customers.sql
        text: |
          select customer_id, email from {{ source('crm', 'customers') }}
    negative:
      - "select count(*) as n_customers from customers"
```

dbt Jinja is resolved with line counts preserved. Per-hit evidence:
select/where → read, join → join, copy/unload → export,
insert_select/ctas → transform.

### `dbt_graph` — lineage from PII sources

```yaml
- id: pii.dbt.pii_exposure
  kind: dbt_graph
  description: dbt exposures that depend on PII models
  rationale: An exposure is where PII leaves the warehouse.
  sensitivity_class: CONTACT
  evidence_kind: expose
  query:
    source_tags: [pii]
    meta_keys: [pii, contains_pii]
    emit: [exposure]                 # and/or model
  fixtures:
    positive:
      - path: dbt_fixture.json       # mini project: {"files": {...}, "target": "<rel>"}
        text: '{"files": {"dbt_project.yml": "name: demo\n", "models/schema.yml": "..."}, "target": "models/schema.yml"}'
```

Uses `target/manifest.json` when present, otherwise static `ref()` /
`source()` / schema `.yml` parsing.

### `ast` — Python and notebook call sites

```yaml
- id: pii.py.log_records
  kind: ast
  description: Logging or printing dataframes / customer records
  rationale: Logs are copied to aggregators with broad access.
  sensitivity_class: CONTACT
  evidence_kind: log
  languages: [python, notebook]
  query:
    matcher: log_call     # log_call df_write http_send cloud_upload smtp_send airflow_transfer db_read
    callees: [audit_logger.info]   # optional extras
  fixtures:
    positive:
      - |
        logger.info(customers_df.head())
    negative:
      - |
        logger.info("job finished")
```

### `regex` — lexical fallback for house conventions

```yaml
- id: acme.regex.to_csv_s3
  kind: regex
  description: Dataframe writes straight to an s3:// path
  rationale: A direct bucket write is an export of whatever the frame holds.
  sensitivity_class: CONTACT
  evidence_kind: export
  languages: [python, notebook]
  query:
    pattern: '\.to_(csv|parquet)\(\s*f?["'']s3://'
    flags: i                          # only i m s u
  fixtures:
    positive:
      - {path: job.py, text: 'df.to_csv("s3://example-bucket/out.csv")'}
    negative:
      - {path: job.py, text: 'df.to_csv("/tmp/out.csv")'}
```

---

## 6. Findings schema (worker submission)

```json
{
  "batch_id": "b0001_xxxx",
  "results": [
    { "signal_id": "sig_…", "disposition": "FINDING",
      "severity": "P0|P1|P2", "confidence": 0.0-1.0,
      "edge": { "from": {"file": "models/stg.sql", "line": 4},
                "to":   {"file": "models/mart.sql", "line": 2} | {"external": "s3|gcs|sftp|http|email|log|stdout|exposure|database|file"},
                "operation": "read|transform|join|export|log|expose" },
      "sink_type": "none|file|object_storage|http|email|log|stdout|exposure|database",
      "preconditions": ["…"], "remediation": "…" },
    { "signal_id": "sig_…", "disposition": "NOT_AN_ISSUE", "reason": "…" }
  ]
}
```

Strings ≤ 500 chars, no extra fields. VERIFY rejects with
`SCHEMA_INVALID`, `SIGNAL_UNKNOWN`, `SIGNAL_DUPLICATE`, `SIGNAL_MISSING`,
`VALUE_LEAK`, `EDGE_INVALID`, `BATCH_NOT_ISSUED`.

---

## 7. Run directory

```
<repo>/.kakashi/sweep/
  .gitignore                 "*"
  LATEST                     current run id
  <run_id>/
    manifest.json            run_id, version, task, agent, destination, packs, selectorsHash,
                             iteration, fingerprint, coverage, degradations, incremental, decision
    selectors.lock.json      exact selectors used
    signals.json             [{id, file, span, selector_id, kind, sensitivity_class, evidence_kind}]
    batches.json             status, attempts, rejections, views, approvalClasses
    views/<rel>              guarded view per file (line-aligned)
    findings/<batch_id>.json accepted submissions
    narrative.json           optional value-free narrative (`kakashi sweep narrative <file>`;
                             {chains: {chainId: text}, remediation: {findingKey: text}},
                             re-scanned for values like every submission)
    reduce.json              findings, dismissed, graph, chains, pdpl, coverage
    iterations.jsonl         one value-free event per stage/iteration
```

---

## 8. Incremental mode

`--since <git-ref>` still shards the whole repository (coverage is never
narrowed), but only re-issues work for files changed since the ref — committed,
uncommitted and untracked — plus their dbt neighbours (parents and children of
a changed model; every model when a `models/**.yml` schema file changes).
Signals in unchanged files reuse the verified result from the most recent
previous run with the same selector hash; with no such run, everything is
re-judged. `manifest.incremental` records
`{since, changedFiles[], reused}` and the report flags the run as
incremental.

---

## 9. CI

A CI job has no host agent, so MAP cannot run: the decision is `PARTIAL`
with gap `map_skipped` (exit 1). The job therefore treats exit 1 as
expected and gates on the reduced report instead.

REDUCE still finds every deterministic path from a PII-tagged source to an
external sink or exposure (dbt lineage plus selector signals). A chain that
no worker has judged carries `judged: false` and is reported as **P0** —
fail closed: not looking can never make a chain look harmless. The example
workflow sweeps the base branch and the PR head and fails only on P0 chain
ids that are new in the head (ids are a stable hash of the node path). See
[examples/sweep-pr.yml](examples/sweep-pr.yml).
Upload `-f sarif` output to GitHub code scanning for inline annotations.
