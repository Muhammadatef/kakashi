---
description: Guardian release decision -- observe / assess / plan / act / verify / react (agent-safe, no self-approval)
---

Ask Kakashi Guardian whether a resource may be released to an agent /
destination for a stated task. Guardian is not a plain mask — it is the
release-authority component and it never self-approves.

## Steps

1. Parse `$ARGUMENTS` for:
   - **the resource path** (required — always a path string, never `@`-mention)
   - the requesting **agent** (cursor / claude / codex / copilot / unknown)
   - the **task** the agent says it is trying to do (a sentence)
   - the **destination** (external_model, internal_tool, human, ...)

   If any of those are missing (especially **task** and **destination**),
   ask one short question to elicit them. An unstated task must make
   Guardian's protection *stricter*, never weaker.
2. Run Guardian in `--json` mode so no plaintext lands in this chat:
   ```
   kakashi guard "<resource>" \
     --agent <agent> \
     --task "<what the agent will do with it>" \
     --destination <destination> \
     --json
   ```
   Fall back via `npx -y @muhammadatef/kakashi guard ...`.
3. Read the JSON. Do NOT open the source file. Do NOT run `audit` to "explain"
   the decision — the JSON already contains every reason code, action, and
   verification result the caller needs to see.
4. Narrate the loop in this fixed order (values-free):

   ```
   THINK    what is being asked, by which agent, for which destination
   OBSERVE  finding counts + classes only (never values), task if stated
   ASSESS   risk score, level, reason codes
   PLAN     per class: tokenize / redact / keep — and why
   ACT      guarded_* written (or nothing if fail-closed)
   VERIFY   re-scan pass? residual classes?
   REACT    decision + what the agent may do next
   ```

   Everything you need is in the JSON: `decision`, `reasonCode`, `risk`,
   `task`, `plan.actions`, `verifications[]`, `releasePath`, `approvalsNeeded`.
5. Honour exit code strictly:
   - `0`  ALLOW or ALLOW_WITH_TRANSFORMATION → use **only** `releasePath`.
     Never substitute the original path.
   - `3`  REQUIRE_APPROVAL → stop and ask a human. Do NOT proceed.
   - `4`  BLOCK → do not release; do not offer a "smaller" release.
   - `2`  error → fail closed; the safe answer is not to release.
6. If the caller wants a human-terminal transcript instead of JSON, offer
   `kakashi guard <file> --trace` (agent-unsafe — for local review only).

## Why Guardian and not just mask

`mask` writes a safe copy. Guardian decides *whether* release is safe given
the specific agent, task, and destination — and produces an audit event a
compliance officer can defend later. When the question is "may I release
this?", the answer must come from `guard`, not from a silent mask.

## Never do

- Never self-approve on `REQUIRE_APPROVAL`. Approval is a human action.
- Never fall back to `mask` when Guardian blocks.
- Never open the source file in the agent to "explain the decision" — the
  JSON reason codes are the explanation. Opening the file re-exposes the
  data Guardian just refused to release.
