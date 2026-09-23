---
description: Print a privacy-preserving impact snapshot -- no filenames, no paths, no values
---

Emit Kakashi's cumulative impact snapshot for `$ARGUMENTS`.

## Steps

1. If `$ARGUMENTS` looks like a path, treat it as the output file:
   ```
   kakashi impact --write "$ARGUMENTS"
   ```
   Otherwise, print to stdout:
   ```
   kakashi impact
   ```
   Fall back via `npx -y @muhammadatef/kakashi impact ...`.
2. Report the JSON to the caller. It contains only:
   - cumulative counts (files masked, total findings, per-category totals)
   - a coarse month bucket (YYYY-MM) so a stream of contributions cannot
     be correlated by exact minute
   - Kakashi version (read from `package.json`, not hardcoded) and Node
     platform (linux / darwin / win32)
3. Emphasise: the snapshot has **no** filenames, paths, directory names,
   pattern-instance counts, machine ids, or user ids. It is deliberately
   shareable — a user can attach it to a public GitHub issue for the
   community adoption dashboard without leaking anything about their data.

## When to use it

- Award / procurement narrative: "our team ran Kakashi against N files and
  prevented X findings this month" — provable from the snapshot without
  exposing what those findings were.
- Community dashboard: users may voluntarily attach `impact.json` to a
  GitHub issue.
- Internal reporting to a DPO: cumulative "protection surface" metric.

## Why it is safe by construction

`impact` does not scan any file. It reads `~/.kakashi/stats.json` — a
counters file Kakashi wrote itself, never the source data. So there is no
new secret to leak: the snapshot is a projection of counters that were
already sanitised at write time.
