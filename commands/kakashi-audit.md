---
description: Full audit -- DELIBERATELY exposes original -> token mapping (only run when asked)
---

Audit the file $ARGUMENTS using kakashi.

## Steps

1. Warn the user FIRST: "Running audit will print every original secret value
   alongside its masked token to this conversation. The agent (me) will see
   those secrets. Confirm you want to proceed."
2. Only if confirmed (or the user explicitly asked for audit), run in shell:
   `kakashi audit "$ARGUMENTS"` (fall back to `npx -y @muhammadatef/kakashi audit "$ARGUMENTS"`).
3. Show the full original -> replacement mapping, grouped by category.
4. Summarize total findings by category (ID & Documents / Personal Info / Credentials).
5. Offer to apply masking via `/kakashi-mask $ARGUMENTS` if findings > 0.

## Privacy contract

`kakashi audit` is **intentionally verbose** -- it shows every original value
mapped to its replacement token. That mapping necessarily contains the
plaintext secrets, so any agent reading audit output WILL see those secrets
in this conversation's context.

Use `/kakashi-audit` only when the user has explicitly asked to inspect what
got replaced. For an agent-safe summary that hides previews, use
`/kakashi-scan` (which defaults to counts-only output -- the safer choice).

If the user passed an `@`-mention, the file body is already in context
anyway, so audit output adds no marginal exposure.
