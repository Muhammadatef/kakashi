/**
 * tests/guardian-narrative.test.js
 *
 * Locks the human-terminal render for `kakashi guard` against two regressions:
 *
 *  1. Every stage label from the plan in changes_23Sept.md must appear.
 *     THINK / OBSERVE / ASSESS / PLAN / ACT / VERIFY / REACT — in that order.
 *     An agent narrating the loop reads these labels to explain what Guardian
 *     did; dropping one silently breaks the "show your thinking" contract.
 *
 *  2. The narrative must not leak fixture secrets. Guardian's whole point is
 *     that it can defend its decision without ever printing the values it
 *     protected. If any secret from the fixture appears in the rendered
 *     output, the tool has just re-exposed the data it was hired to protect.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');

const ROOT = path.resolve(__dirname, '..');

async function runGuardianNarrativeTests() {
  let passed = 0;
  let failed = 0;

  async function check(name, fn) {
    try {
      await fn();
      passed++;
    } catch (err) {
      console.error(`FAIL ${name}: ${err.message}`);
      failed++;
    }
  }

  const { runGuardian } = require(path.join(ROOT, 'src', 'guardian'));
  const { renderRun, thinkSection, actSection } = require(path.join(ROOT, 'src', 'guardian', 'render'));

  // Route audit + artifact writes into a scratch dir so tests don't pollute the
  // user's ~/.kakashi/ or leave guarded_ files in the fixtures folder.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'kakashi-guardian-narr-'));
  const employees = path.join(ROOT, 'tests', 'fixtures', 'guardian_employees.md');
  const employeesOut = path.join(scratch, 'guarded_employees.md');
  const auditLog = path.join(scratch, 'audit.jsonl');

  // Load the fixture body once so we can search the rendered output for any
  // substring that leaked through.
  const fixtureBody = fs.readFileSync(employees, 'utf8');
  const KNOWN_SECRETS = [
    '784-1988-1234567-0',            // Emirates ID row 1
    '784-1992-7654321-2',            // Emirates ID row 2
    'ahmed.hassan@example.ae',       // email row 1
    'fatima.ali@example.ae',         // email row 2
    'AE070331234567890123456',       // IBAN row 1
    'AE320331234567890123999',       // IBAN row 2
    '+971 50 123 4567',              // phone row 1
    '+971 55 987 6543',              // phone row 2
  ];
  // Sanity-check the fixture actually contains all our probe values so a
  // rename doesn't silently make this test pass by accident.
  for (const s of KNOWN_SECRETS) {
    if (!fixtureBody.includes(s)) {
      throw new Error(`Test fixture regressed — expected substring not found: ${s}`);
    }
  }

  const result = await runGuardian({
    resource: employees,
    agent: 'cursor',
    task: 'calculate average salary by department',
    destination: 'external_model',
    output: employeesOut,
    auditLog,
  });
  const rendered = stripAnsi(renderRun(result, result.state.context));

  await check('renderRun contains every plan-mandated stage label', () => {
    // The seven stage labels from changes_23Sept.md must all appear as
    // section headings. They live on their own line with no prefix, so we
    // match line-anchored to avoid picking up an incidental word.
    const REQUIRED = ['THINK', 'OBSERVE', 'ASSESS', 'PLAN', 'ACT', 'VERIFY', 'REACT'];
    for (const stage of REQUIRED) {
      const heading = new RegExp(`^${stage}\\b`, 'm');
      assert(heading.test(rendered),
        `Rendered guardian output is missing the "${stage}" section header`);
    }
  });

  await check('stage labels appear in the loop order', () => {
    // The order matters. A reader scans top-to-bottom expecting the loop; a
    // reorder (e.g. ACT before PLAN) would be confusing even if all labels
    // technically appear.
    const order = ['THINK', 'OBSERVE', 'ASSESS', 'PLAN', 'ACT', 'VERIFY', 'REACT'];
    const positions = order.map((s) => rendered.search(new RegExp(`^${s}\\b`, 'm')));
    for (let i = 1; i < positions.length; i++) {
      assert(positions[i] > positions[i - 1],
        `Stage "${order[i]}" appears before "${order[i - 1]}" in the render`);
    }
  });

  await check('no fixture secret leaks into the rendered output', () => {
    for (const secret of KNOWN_SECRETS) {
      assert(!rendered.includes(secret),
        `Rendered guardian output leaks secret from fixture: ${secret.slice(0, 8)}...`);
    }
  });

  await check('thinkSection restates agent + destination without values', () => {
    const t = stripAnsi(thinkSection(result, result.state.context));
    assert(/THINK/.test(t), 'THINK header missing');
    assert(t.toLowerCase().includes('cursor'),
      'THINK does not name the requesting agent (cursor)');
    for (const secret of KNOWN_SECRETS) {
      assert(!t.includes(secret), `THINK leaked ${secret.slice(0, 8)}...`);
    }
  });

  await check('actSection reports replacement counts, not values', () => {
    const exec = (result.state.toolResults || [])[0];
    assert(exec, 'No execution result recorded for this run');
    const a = stripAnsi(actSection(exec, 1, 1));
    assert(/ACT\b/.test(a), 'ACT header missing');
    assert(/\d+ replacement/.test(a), 'ACT does not report a replacement count');
    for (const secret of KNOWN_SECRETS) {
      assert(!a.includes(secret), `ACT leaked ${secret.slice(0, 8)}...`);
    }
  });

  await check('a REACT/decision block is emitted with an actionable next step', () => {
    // The final block must (a) exist and (b) tell the caller what to do next:
    // either "use only releasePath" for an ALLOW, "no artifact was written"
    // for a BLOCK, or an approval instruction for REQUIRE_APPROVAL.
    assert(/^REACT\b/m.test(rendered), 'REACT block missing');
    const hasActionable =
      /release|approve|no artifact was written|Safe to release/.test(rendered);
    assert(hasActionable, 'REACT does not tell the caller what to do next');
  });

  // Cleanup — leaving guarded_ artifacts in a shared tests/ folder pollutes
  // subsequent runs and, worse, invalidates the "no secrets on disk" invariant
  // for anyone inspecting the working tree by hand after tests.
  try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* ignore */ }

  console.log(`guardian-narrative.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runGuardianNarrativeTests };

if (require.main === module) {
  runGuardianNarrativeTests().then((ok) => process.exit(ok ? 0 : 1));
}
