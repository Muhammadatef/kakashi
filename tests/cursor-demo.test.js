const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const COMMAND_DIR = path.join(ROOT, '.cursor', 'commands');

const COMMANDS = {
  'kakashi-demo-start.md': 'node tests/cursor-demo.test.js',
  'kakashi-demo-file.md': 'node demos/demo.js files',
  'kakashi-demo-folder.md': 'node demos/demo.js folders',
  'kakashi-demo-database.md': 'node demos/demo.js database',
  'kakashi-demo-guardian.md': 'node demos/demo.js guardian',
  'kakashi-demo-sidecar.md': 'node demos/demo.js sidecar',
  'kakashi-demo-operations.md': 'node demos/demo.js operations',
  'kakashi-demo-all.md': 'node demos/demo.js all',
};

function runCursorDemoTests() {
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

  check('all Cursor chat demo commands exist and run the intended stage', () => {
    for (const [name, invocation] of Object.entries(COMMANDS)) {
      const commandPath = path.join(COMMAND_DIR, name);
      assert(fs.existsSync(commandPath), `missing ${name}`);
      const body = fs.readFileSync(commandPath, 'utf8');
      assert(body.includes(invocation), `${name} does not invoke ${invocation}`);
      assert(body.includes('description:'), `${name} is missing menu metadata`);
    }
  });

  check('chat commands preserve the no-raw-input boundary', () => {
    for (const name of Object.keys(COMMANDS)) {
      const body = fs.readFileSync(path.join(COMMAND_DIR, name), 'utf8');
      assert(!body.includes('scan --verbose'), `${name} suggests unsafe verbose scanning`);
      assert(!body.includes('scan-dir --include-values'), `${name} suggests raw report values`);
    }
    const combined = Object.keys(COMMANDS)
      .map((name) => fs.readFileSync(path.join(COMMAND_DIR, name), 'utf8'))
      .join('\n');
    assert(combined.includes('Do not open'));
    assert(combined.includes('Do not invent'));
  });

  check('the always-on Cursor rule covers every protection surface', () => {
    const rulePath = path.join(ROOT, '.cursor', 'rules', 'kakashi-demo.mdc');
    const body = fs.readFileSync(rulePath, 'utf8');
    assert(body.includes('alwaysApply: true'));
    for (const term of ['scan-dir', 'db-scan', 'guard', 'REQUIRE_APPROVAL', 'BLOCK']) {
      assert(body.includes(term), `Cursor rule is missing ${term}`);
    }
  });

  console.log(`cursor-demo.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runCursorDemoTests };

if (require.main === module) {
  process.exit(runCursorDemoTests() ? 0 : 1);
}
