---
description: Batch-mask every supported file in a folder, writing masked_ siblings
---

Mask every supported file under `$ARGUMENTS` using kakashi.

## Steps

1. **Confirm scope first.** Ask the user to confirm the directory and roughly
   how many files it contains. If it looks like more than ~500 files or covers
   a whole project root, require an explicit "yes, mask the whole tree" before
   running. `mask-dir` is destructive-adjacent: it writes many new files.
2. Prefer running a `/kakashi-scan-dir $ARGUMENTS` first so the caller knows
   what will be masked and where.
3. Run in shell:
   ```
   kakashi mask-dir "$ARGUMENTS" -r
   ```
   Fall back to `npx -y @muhammadatef/kakashi mask-dir "$ARGUMENTS" -r`.
4. Report to the user, per file: source path → masked_ sibling, plus
   replacement count. Do NOT echo replaced values.
5. Never pass `--overwrite`. Kakashi's contract is that originals are
   preserved; masked artifacts live alongside as `masked_<name>`.

## Safety

- Ignores anything already prefixed `masked_` so re-running is idempotent.
- Honours `.gitignore` / `.kakashiignore` — never masks `node_modules/`,
  `.git/`, build artifacts, or anything the user has excluded.
- On a big tree, output is one line per file — that alone can be long. Offer
  to redirect to a log file if the caller wants a smaller chat window.

## When NOT to use mask-dir

If the caller wants **one specific decision** (may this specific file be sent
to a specific model?), that is a Guardian question — use `/kakashi-guard`,
not `mask-dir`. Mask-dir writes safe copies but does not decide whether
release is authorised.
