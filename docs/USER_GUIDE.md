# User Guide — Kakashi

## What is Kakashi?

Kakashi finds and masks sensitive information in your files **before** you share them with AI assistants. All processing runs locally on your machine.

## Install

```bash
npm install -g @muhammadatef/kakashi
curl -fsSL https://raw.githubusercontent.com/Muhammadatef/kakashi/main/install.sh | bash
```

## Three commands

```bash
kakashi scan report.xlsx    # Check only
kakashi mask report.xlsx    # Create masked_report.xlsx
kakashi audit report.docx   # Show all replacements
```

## Daily use with AI tools

| Tool | Command |
|------|---------|
| Cursor | `/kakashi-scan file.xlsx` |
| Claude Code | `/kakashi-mask file.docx` |
| Codex | `kakashi scan file.txt` in terminal |

See [DAILY_WORKFLOWS.md](DAILY_WORKFLOWS.md) for scenario-based guides.
