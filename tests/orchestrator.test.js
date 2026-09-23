/**
 * tests/orchestrator.test.js
 *
 * The `/kakashi` slash command (and its always-on Cursor rule sibling) is a
 * documentation contract: given a user intent, it MUST tell the agent to call
 * a specific Kakashi subcommand. If those files drift and the orchestrator
 * loses one of the dispatch rows, agents will start doing the wrong thing
 * silently -- which is exactly the class of regression the plan in
 * changes_23Sept.md was written to prevent.
 *
 * These tests inspect the shipped text and assert that:
 *
 *   1. Every subcommand the CLI exposes has a corresponding dispatch row in
 *      commands/kakashi.md AND in src/rules/kakashi-activate.md.
 *   2. The specific award-defining scenario -- "may this file be released to
 *      an external model for task X?" -- routes to `guard`, NOT to a silent
 *      mask. This is the row the plan explicitly named.
 *   3. The rule file mirrors the command file: an agent following the always-
 *      on rule reaches the same tool as one that received an explicit /kakashi.
 *   4. Every command file listed in bin/install.js SLASH_CMDS exists on disk.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ORCH_CMD = path.join(ROOT, 'commands', 'kakashi.md');
const ORCH_RULE = path.join(ROOT, 'src', 'rules', 'kakashi-activate.md');

function runOrchestratorTests() {
  let passed = 0;
  let failed = 0;

  function check(name, fn) {
    try {
      fn();
      passed++;
    } catch (err) {
      console.error(`FAIL ${name}: ${err.message}`);
      failed++;
    }
  }

  const orchCmd = fs.readFileSync(ORCH_CMD, 'utf8');
  const orchRule = fs.readFileSync(ORCH_RULE, 'utf8');

  // The set of subcommands the orchestrator MUST know about. Adding a new
  // CLI subcommand without teaching the orchestrator is a regression.
  const REQUIRED_TOOLS = [
    'scan',       // one file, counts
    'mask',       // one file, masked_ sibling
    'scan-dir',   // folder / PDPL report
    'mask-dir',   // batch mask
    'guard',      // release decision (Guardian)
    'db-scan',    // DB query counts
    'db-mask',    // DB query safe local copy
    'agent-guard',// loopback sidecar
    'stats',      // cumulative counters
    'list-patterns', // capability discovery
    'impact',     // value-free adoption snapshot
  ];

  for (const tool of REQUIRED_TOOLS) {
    check(`orchestrator command knows about \`${tool}\``, () => {
      // Match either bare word (used in tables) or as `kakashi <tool>` (used
      // in prose). Either surface counts as teaching the tool.
      const bare = new RegExp(`\\b${tool.replace('-', '\\-')}\\b`);
      assert(bare.test(orchCmd),
        `commands/kakashi.md never mentions "${tool}"`);
    });
    check(`orchestrator rule knows about \`${tool}\``, () => {
      const bare = new RegExp(`\\b${tool.replace('-', '\\-')}\\b`);
      assert(bare.test(orchRule),
        `src/rules/kakashi-activate.md never mentions "${tool}"`);
    });
  }

  // ---- The award-defining scenario ------------------------------------------
  // "May Cursor send employees.md to an external model to average salary?"
  // MUST land at `guard`, not at a silent `mask`. The plan is explicit about
  // this: an agent that reads only `mask` here is dangerous.
  check('release-decision intent routes to `guard`, not a silent `mask`', () => {
    // The dispatch table row must (a) be about a release / send / share
    // question AND (b) name `guard` on the same row.
    const lines = orchCmd.split('\n');
    const releaseRow = lines.find((line) => {
      const l = line.toLowerCase();
      return (
        (l.includes('release') || l.includes('send') || l.includes('share') || l.includes('paste'))
        && (l.includes('external') || l.includes('agent') || l.includes('destination'))
      );
    });
    assert(releaseRow, 'No orchestrator row about releasing to an external model.');
    assert(/\bguard\b/.test(releaseRow),
      `The release-decision row does not name guard: ${releaseRow.slice(0, 160)}`);
  });

  check('rule file also directs release questions to guard', () => {
    // The always-on rule mirrors the orchestrator: an agent that never types
    // /kakashi must still call guard when the destination is stated.
    assert(/kakashi guard/.test(orchRule),
      'src/rules/kakashi-activate.md never invokes `kakashi guard`');
    assert(orchRule.includes('release decision') || orchRule.includes('release-decision'),
      'Rule file does not explain the release-decision path.');
  });

  // ---- No self-approval invariant -------------------------------------------
  check('orchestrator refuses to self-approve on REQUIRE_APPROVAL', () => {
    for (const [label, body] of [['command', orchCmd], ['rule', orchRule]]) {
      // Prose must mention REQUIRE_APPROVAL and STOP / ASK / HUMAN somewhere
      // near it. That combination is what proves the file teaches the "no
      // self-approval" invariant rather than merely naming the label.
      assert(body.includes('REQUIRE_APPROVAL'),
        `${label} file never mentions REQUIRE_APPROVAL`);
      const nearby = body.split('REQUIRE_APPROVAL').slice(1).some((chunk) => {
        const window = chunk.slice(0, 400).toLowerCase();
        return window.includes('stop') || window.includes('human') || window.includes('ask');
      });
      assert(nearby,
        `${label} file mentions REQUIRE_APPROVAL but never tells the agent to stop or ask a human.`);
    }
  });

  // ---- Agent-safe defaults --------------------------------------------------
  check('orchestrator forbids --verbose / audit / --include-values in agent turn', () => {
    for (const [label, body] of [['command', orchCmd], ['rule', orchRule]]) {
      assert(body.includes('--verbose') || body.includes('audit'),
        `${label} file must mention --verbose / audit constraints`);
      assert(body.includes('--include-values'),
        `${label} file must warn against --include-values in agent-visible output`);
    }
  });

  // ---- Path-string rule -----------------------------------------------------
  check('orchestrator prefers path strings over @-mentions', () => {
    for (const [label, body] of [['command', orchCmd], ['rule', orchRule]]) {
      // At least one of "path string" or the concrete /kakashi-scan example
      // must appear so the reader learns the safer invocation.
      assert(/@-mention|path string|path strings|`\/kakashi/.test(body),
        `${label} file must teach the path-string invocation.`);
    }
  });

  // ---- Contract with the installer registry --------------------------------
  // Parse SLASH_CMDS from bin/install.js. Naive splitting on `,` breaks when
  // an inline comment contains commas (e.g. `// one file, counts`). Extract
  // quoted string literals with a regex instead — that is both simpler AND
  // more robust to future formatting changes in install.js.
  function parseSlashCmdIds() {
    const install = fs.readFileSync(path.join(ROOT, 'bin', 'install.js'), 'utf8');
    const match = install.match(/const SLASH_CMDS = \[([\s\S]*?)\];/);
    assert(match, 'SLASH_CMDS array not found in bin/install.js');
    // Strip line comments so we don't accidentally match a quoted example
    // inside a `// example: 'kakashi-foo'` comment.
    const bodyNoComments = match[1].replace(/\/\/[^\n]*/g, '');
    // Now capture every single-quoted identifier that looks like a slash-cmd id.
    const ids = Array.from(bodyNoComments.matchAll(/'([^']+)'/g)).map((m) => m[1]);
    assert(ids.length > 0, 'SLASH_CMDS parsed to an empty list');
    return ids;
  }

  check('every SLASH_CMDS entry has a shipping commands/<name>.md file', () => {
    const ids = parseSlashCmdIds();
    for (const id of ids) {
      const p = path.join(ROOT, 'commands', `${id}.md`);
      assert(fs.existsSync(p),
        `SLASH_CMDS includes "${id}" but commands/${id}.md is missing`);
    }
  });

  check('SLASH_CMDS covers every REQUIRED_TOOLS entry (so all show in the / picker)', () => {
    const ids = parseSlashCmdIds();
    // Every required tool must be reachable via a slash. It is either exposed
    // as its own slash file (`kakashi-scan-dir`) or via the orchestrator
    // (`kakashi` alone routes to it), and the `list-patterns` CLI id is
    // historically exposed as the shorter `/kakashi-list`.
    for (const tool of REQUIRED_TOOLS) {
      const specific = `kakashi-${tool}`;
      const legacyAlias = tool === 'list-patterns' ? 'kakashi-list' : specific;
      assert(ids.includes(specific) || ids.includes(legacyAlias),
        `No slash command wired for "${tool}" (looked for ${specific} / ${legacyAlias})`);
    }
  });

  console.log(`orchestrator.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runOrchestratorTests };

if (require.main === module) {
  process.exit(runOrchestratorTests() ? 0 : 1);
}
