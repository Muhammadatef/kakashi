---
description: Mask sensitive data in a file using Kakashi (writes masked_<file>, agent-safe)
---

Mask the file $ARGUMENTS using kakashi.

## Steps

1. Run in shell: `kakashi scan "$ARGUMENTS"` (fall back to `npx -y @muhammadatef/kakashi scan "$ARGUMENTS"`).
2. Show the user the count summary kakashi printed.
3. If findings > 0, run: `kakashi mask "$ARGUMENTS"`.
4. Confirm: "Masked version saved as masked_<file> -- N replacements (X ID & docs, Y personal info, Z credentials)."
5. Recommend the user share `masked_<file>` instead of the original.
6. Offer to run `/kakashi-audit $ARGUMENTS` to inspect the full mapping if
   they want to verify what was replaced (note: audit will expose plaintext
   secrets to this conversation).

## Agent-safe by default

Both `kakashi scan` and `kakashi mask` default to counts-only output --
no secret previews enter the agent's LLM context. The `--verbose` flag
would re-enable previews; do NOT pass it unless the user explicitly asks.

## When the user passed an `@`-mention

If the user invoked `/kakashi-mask @file.py` (with `@`-mention) instead of a
path string, the file body is already in this conversation's LLM context --
the secrets just travelled to whatever model is handling this chat. Mention
this honestly:

> "FYI -- the file body was attached via `@`-mention, so it's already in
> this conversation's context. Masking it now still lets you share the
> masked version safely with *other* services. Next time, pass a path
> string (`/kakashi-mask /path/to/file.py`) so kakashi runs before the
> file ever reaches the LLM."

Then run the scan + mask anyway. Privacy is salvageable for downstream
shares; not for this turn.
