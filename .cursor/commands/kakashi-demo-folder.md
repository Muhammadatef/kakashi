---
description: Demonstrate folder scanning, PDPL reports, and batch masking in Cursor Chat
---

# Demo case 2 — scan a government data estate

Do not open or attach generated raw input files.

## Run

Run `node demos/demo.js folders` from the repository root and wait for its final
PASS line.

## Explain in chat

Using only safe command output, explain:

- The recursive scanner honours ignore policy and reports excluded files.
- JSON, Markdown, and HTML reports omit raw matched values by default.
- The report adds PDPL-oriented technical context without claiming legal
  certification.
- English and Arabic HTML reports are produced from the same local evidence.
- Recursive masking writes protected sibling files rather than changing source
  documents in place.

Offer these safe report paths for the presenter to open manually:

- `demos/.work/output/estate-report.html`
- `demos/.work/output/estate-report-ar.html`

End with: `Next: /kakashi-demo-database`
