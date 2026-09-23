---
description: Scan a whole folder / repo and emit a PDPL-mapped compliance report (agent-safe)
---

Scan the directory `$ARGUMENTS` using kakashi.

## Steps

1. If `$ARGUMENTS` is empty, ask which folder to scan (a path, a repo root, a
   shared drive mount). Never invent one.
2. Run in shell — HTML report is the default because it renders directly in
   a browser and prints cleanly to PDF for an auditor:
   ```
   kakashi scan-dir "$ARGUMENTS" -f html -o kakashi-report.html
   ```
   Fall back to `npx -y @muhammadatef/kakashi scan-dir "$ARGUMENTS" -f html -o kakashi-report.html`.
3. Report to the user:
   - Total files scanned, total findings, category counts (ID / PII / credentials).
   - Top 5 PDPL articles cited (from stderr summary), never per-line values.
   - Where the HTML report was written.
4. If the caller wants JSON (SIEM / CI ingestion) instead of HTML, re-run with
   `-f json -o kakashi-report.json`. Markdown is also available (`-f md`) for
   pasting into a PR comment.
5. NEVER add `--include-values` — that exposes plaintext into the report file
   and into the agent's view of it.
6. Bilingual: for an Arabic report add `--lang ar`; the HTML is RTL-safe.

## Agent-safe by default

`scan-dir` output is counts + PDPL article citations only. No matched value
ever leaves the process into stdout, into a report file, or into this
conversation's context. This is what makes it safe to run on real code.

Exit `1` from `scan-dir` means findings were detected — it is a **result**,
not a crash. Exit `0` is a clean tree. Exit `2` is a real error.

## Follow-ups you can offer

- `/kakashi-mask-dir $ARGUMENTS` — batch mask the folder (confirm first on
  anything larger than a few hundred files).
- `/kakashi-guard <file>` — for a per-file, per-destination release decision
  on a specific file the report flagged.
- `kakashi impact --write impact.json` — value-free adoption snapshot.
