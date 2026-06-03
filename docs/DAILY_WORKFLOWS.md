# Daily Workflows — Kakashi with AI Tools

## Cursor

```bash
node bin/install.js --only cursor --with-init
```

- `/kakashi-scan analysis.sql` before pasting SQL into chat
- `/kakashi-mask quarterly_report.xlsx` before sharing spreadsheets
- Never paste raw `.env` — run `kakashi scan .env` first

## Claude Code

```bash
node bin/install.js --only claude
```

- `/kakashi-scan policy_draft.docx` → review findings → `/kakashi-mask`
- Claude auto-scans when you ask to share a file (via CLAUDE.md rule)

## Codex CLI

```bash
node bin/install.js --only codex --with-init
```

```bash
kakashi scan report.pdf
kakashi mask report.pdf
codex "Summarize report_masked.txt"
```

## CI check

```bash
kakashi scan ./config/production.env
# exit 1 = secrets found, block deploy
```

## Batch mask

```bash
kakashi mask-dir ./deliverables -r --ext xlsx,docx,csv
```

## Quick reference

| Task | Command |
|------|---------|
| Check | `kakashi scan <file>` or `/kakashi-scan <file>` |
| Mask | `kakashi mask <file>` or `/kakashi-mask <file>` |
| Audit | `kakashi audit <file>` or `/kakashi-audit <file>` |
| Batch | `kakashi mask-dir ./folder -r` |

## Masking modes

```bash
kakashi mask file.txt --mode typed    # [EMAIL_1] (default)
kakashi mask file.txt --mode redact   # [REDACTED]
kakashi mask file.txt --mode fake     # Realistic fake data
```
