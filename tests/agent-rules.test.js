const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RULE_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  path.join('src', 'rules', 'kakashi-activate.md'),
];

function runAgentRuleTests() {
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

  const requiredCommands = [
    'scan-dir',
    'mask-dir',
    'db-scan',
    'db-mask',
    'db-audit',
    'guard',
    'agent-guard',
  ];

  for (const relativePath of RULE_FILES) {
    check(`${relativePath} teaches every protection surface`, () => {
      const body = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
      for (const command of requiredCommands) {
        assert(body.includes(`\`${command}`) || body.includes(`kakashi ${command}`),
          `${relativePath} is missing ${command}`);
      }
      assert(body.includes('REQUIRE_APPROVAL'), `${relativePath} is missing Guardian decisions`);
      assert(body.includes('exit `3`'), `${relativePath} is missing Guardian exit-code guidance`);
      assert(body.includes('--include-values'), `${relativePath} is missing unsafe-report guidance`);
    });
  }

  console.log(`agent-rules.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runAgentRuleTests };

if (require.main === module) {
  process.exit(runAgentRuleTests() ? 0 : 1);
}
