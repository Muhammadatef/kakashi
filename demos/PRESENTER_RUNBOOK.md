# Kakashi Live Presenter Runbook

Run each case from the repository root. Every script is independent and resets
only `demos/.work/`, so you can present them in any order.

## Case 1 — Stop a sensitive file before it reaches an AI model

```bash
./demos/01-file-protection.sh
```

Say: “Kakashi first gives the agent a count-only risk signal. The local audit is
available to a human, while typed, redacted, and realistic-fake outputs serve
different downstream needs. The safe modes are re-scanned before release.”

Show: the `RUN` lines, each `PASS`, and
`demos/.work/output/typed-citizen-request.md`.

## Case 2 — Discover sensitive data across a government data estate

```bash
./demos/02-folder-compliance.sh
```

Say: “One command walks the permitted tree, respects ignore policy, and creates
PDPL-oriented reports without embedding the values it found. The Arabic report
uses the same local scan results.”

Show: `demos/.work/output/estate-report.html` and
`demos/.work/output/estate-report-ar.html` in a browser.

## Case 3 — Let an agent analyse database results without receiving raw rows

```bash
./demos/03-database-protection.sh
```

Say: “The query runs through a database adapter, but masking happens locally.
Stable tokens preserve joins and distinct counts across rows; exports are safe
copies rather than changes to the source database.”

Show: `demos/.work/output/masked-customers.csv`.

The demo uses Kakashi’s offline `mock:customers` adapter. Production adapters
support PostgreSQL, MySQL, MongoDB, Snowflake, Databricks, and SQLite.

## Case 4 — Ask Guardian whether an agent should receive a resource

```bash
./demos/04-guardian-decision.sh
```

Say: “Guardian does more than mask. It considers who is asking, the declared
purpose, and the destination. The first request is transformed and verified;
the second contains a credential and fails closed for human approval.”

Show: the decision and risk score, then
`demos/.work/output/guardian-audit.jsonl`. The audit event contains reasoning,
classes, and counts—but not the sensitive values.

## Case 5 — Give every local agent a standing privacy sidecar

```bash
./demos/05-agent-sidecar.sh
```

Say: “An IDE, MCP tool, or automation can call a loopback-only API before it
sends data. The API returns safe summaries and can write a masked artifact. It
does not expose a public interface or make outbound calls.”

Show: the ephemeral loopback port and the successful `/health`, `/scan`, and
`/mask` checks.

## Case 6 — Operational evidence and Arabic experience

```bash
./demos/06-operations-and-arabic.sh
```

Say: “Teams can inspect the active detector catalog, use Arabic CLI output,
track local aggregate impact, and export a value-free evidence snapshot. No
filenames, paths, source values, or device identity enter that snapshot.”

Show: `demos/.work/output/impact.json`.

## Before the meeting

Use the combined verifier once:

```bash
npm test
./demos/run-all.sh
```

If both finish successfully, use the six standalone scripts during the actual
presentation. Keep the generated report files as a backup in case screen time
or terminal access is limited.
