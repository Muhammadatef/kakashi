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

  check('masks a .sql file end-to-end', () => {
    const sqlFixture = path.join(__dirname, 'fixtures', 'sample_schema.sql');
    const sqlMasked = path.join(__dirname, 'fixtures', 'masked_sample_schema.sql');
    if (fs.existsSync(sqlMasked)) fs.unlinkSync(sqlMasked);
    const r = runCli(['mask', sqlFixture, '-o', sqlMasked]);
    if (r.status !== 0) throw new Error(`mask failed: ${r.stderr}`);
    const content = fs.readFileSync(sqlMasked, 'utf8');
    // SQL DDL password (space-delimited) must be masked, statement kept readable
    if (content.includes('Sup3rS3cret!')) throw new Error('SQL password not masked');
    if (content.includes('pg-r0le-pass')) throw new Error('PG role password not masked');
    if (!content.includes('IDENTIFIED BY [SQL_PASSWORD')) throw new Error('SQL statement context lost');
    // PII inside INSERT rows and the connection string in the comment too
    if (content.includes('john.smith@example.com')) throw new Error('email in INSERT not masked');
    if (content.includes('hunter2@prod.db.example.com')) throw new Error('conn string not masked');
    fs.unlinkSync(sqlMasked);
  });

  console.log(`cli.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runCliTests };

if (require.main === module) {
  process.exit(runCliTests() ? 0 : 1);
}
