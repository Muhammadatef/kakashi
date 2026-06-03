---
description: List every active detection pattern Kakashi recognizes (no secrets in output)
---

Show every detection pattern Kakashi can match.

Steps:
1. Run in shell: `kakashi list-patterns` (fall back to `npx -y @muhammadatef/kakashi list-patterns`).
2. Show the patterns grouped by category
   (ID & Documents / Personal Info / Credentials).

This command is fully agent-safe — it lists pattern names and labels, no
real or fake secret values. It does NOT take a file argument; any path
passed in is ignored.
