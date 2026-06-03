const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CLI = path.join(__dirname, '..', 'bin', 'kakashi.js');
const FIXTURE = path.join(__dirname, 'fixtures', 'sample.txt');
const MASKED = path.join(__dirname, 'fixtures', 'masked_sample.txt');

function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

function runCliTests() {
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

  check('scan exits 1 when findings', () => {
    const r = runCli(['scan', FIXTURE]);
    if (r.status !== 1) throw new Error(`expected exit 1, got ${r.status}`);
  });

  check('scan clean file exits 0', () => {
    const clean = path.join(__dirname, 'fixtures', 'clean.txt');
    fs.writeFileSync(clean, 'Hello world, no secrets here.\n');
    const r = runCli(['scan', clean]);
    fs.unlinkSync(clean);
    if (r.status !== 0) throw new Error(`expected exit 0, got ${r.status}`);
  });

  check('mask writes masked_ file', () => {
    if (fs.existsSync(MASKED)) fs.unlinkSync(MASKED);
    const r = runCli(['mask', FIXTURE, '-o', MASKED]);
    if (r.status !== 0) throw new Error(`mask failed: ${r.stderr}`);
    if (!fs.existsSync(MASKED)) throw new Error('masked file not created');
    const content = fs.readFileSync(MASKED, 'utf8');
    if (content.includes('784-1988-1234567-0')) throw new Error('PII not masked');
    if (fs.existsSync(MASKED)) fs.unlinkSync(MASKED);
  });

  check('list-patterns runs', () => {
    const r = runCli(['list-patterns']);
    if (r.status !== 0) throw new Error('list-patterns failed');
  });

  console.log(`cli.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runCliTests };

if (require.main === module) {
  process.exit(runCliTests() ? 0 : 1);
}
