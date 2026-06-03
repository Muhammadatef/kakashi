---
description: Show cumulative Kakashi masking stats (no secrets in output)
---

Show how much sensitive data Kakashi has masked across this user's machine.

Steps:
1. Run in shell: `kakashi stats` (fall back to `npx -y @muhammadatef/kakashi stats`).
2. Show files masked, total findings, and the breakdown by category
   (ID & Documents / Personal Info / Credentials).

This command is fully agent-safe — its output contains only counts, no
secret values. It does NOT take a file argument; any path passed in is
ignored.
