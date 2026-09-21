# Kakashi Manager Demo Kit

This folder is a repeatable, offline walkthrough of Kakashi 1.2.0. It creates
synthetic sensitive records at runtime, exercises every CLI protection surface,
and fails immediately if an expected safety property is not true.

## Run the complete demo

From the repository root:

```bash
npm install
npm test
./demos/run-all.sh
```

PowerShell command:

```powershell
npm install
npm test
.\demos\run-all.ps1
```

Expected final line:

```text
ALL 6 SELECTED DEMOS PASSED
```

Generated inputs and outputs live under `demos/.work/` and are ignored by Git.
Run the suite again at any time; it safely rebuilds only that workspace.

## Run each manager case separately

These are independent. Run one, explain it, and stop before the next:

```bash
./demos/01-file-protection.sh
./demos/02-folder-compliance.sh
./demos/03-database-protection.sh
./demos/04-guardian-decision.sh
./demos/05-agent-sidecar.sh
./demos/06-operations-and-arabic.sh
```

Each script prints the safe Kakashi commands it exercises and the assertion
that passed. See `PRESENTER_RUNBOOK.md` for exactly what to say and which output
artifact to open after each case.

## Recommended 12-minute live flow

1. **Problem (1 minute):** an agent can unknowingly send IDs, contact details,
   financial data, or credentials to an external model.
2. **Files (2 minutes):** run `./demos/01-file-protection.sh`. Explain that `scan`
   is count-only, `audit` is deliberately human-only, and every masked output is
   re-scanned.
3. **Government data estate (2 minutes):** run
   `./demos/02-folder-compliance.sh`. Open
   `demos/.work/output/estate-report.html` to show the PDPL mapping, then open
   `estate-report-ar.html` to show the Arabic view.
4. **Databases (2 minutes):** run `./demos/03-database-protection.sh`. Point out that
   rows are masked client-side and distinct people retain distinct stable tokens.
5. **Guardian (3 minutes):** run `./demos/04-guardian-decision.sh`. Explain the loop:
   observe → understand task → assess → plan → policy → act → verify → replan.
   The agent receives only the approved `releasePath`, never an implied approval.
6. **Sidecar and evidence (2 minutes):** run `./demos/05-agent-sidecar.sh`, then
   `./demos/06-operations-and-arabic.sh`. This proves the loopback API, Arabic CLI,
   detector catalog, local stats, and value-free impact snapshot.

## What each demo proves

| Demo | Product surfaces | Safety assertions |
| --- | --- | --- |
| `files` | `scan`, `audit`, `mask`, stdin, typed/redact/fake, whitelist | Raw values disappear; typed/redact re-scan clean; fake data keeps realistic shape |
| `folders` | `scan-dir`, `mask-dir`, JSON/MD/HTML, Arabic HTML, ignore files | Reports omit values; ignored files are counted; safe siblings are written |
| `database` | `db-scan`, `db-audit`, `db-mask`, limits, JSONL/JSON/CSV | Query output is local; raw values disappear; tokens stay stable across rows |
| `guardian` | Context, task analysis, risk, policy, actions, verification, audit | Decision is explicit; release is verified or fails closed; log is value-free |
| `sidecar` | `agent-guard`, `/health`, `/scan`, `/mask` | Loopback API returns safe summaries and writes a protected artifact |
| `operations` | `list-patterns`, Arabic CLI, `stats`, `impact` | Inventory works; Arabic renders; exported metrics contain no source data |

## Presenter safety notes

- The raw records are synthetic and exist only in ignored `.work` files.
- Do not use `--verbose`, `audit`, `db-audit`, or `--include-values` while
  screen-sharing a real customer dataset. This harness captures audit output
  without printing it.
- A `scan`, `db-scan`, or `scan-dir` exit code of `1` means “findings present.”
  It is an expected detection outcome, not an application failure.
- Kakashi is a preventive technical control. It supports data-minimisation,
  local processing, traceability, and PDPL-oriented reporting; it does not by
  itself certify legal compliance or replace governance and access controls.

## Backup plan for tomorrow

Run `./demos/run-all.sh` once before the meeting. The generated HTML, Markdown,
JSON, JSONL, and CSV outputs remain in `demos/.work/output/` for a no-terminal
walkthrough if live command execution is unavailable.
