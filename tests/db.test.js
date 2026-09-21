const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  inferDriver,
  streamMasked,
  aggregate,
} = require('../src/engine/db');

const CLI = path.join(__dirname, '..', 'bin', 'kakashi.js');

async function runDbTests() {
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

  await check('inferDriver — URI style', () => {
    assert.strictEqual(inferDriver('postgres://u:p@h/d'), 'postgres');
    assert.strictEqual(inferDriver('mysql://u:p@h/d'), 'mysql');
    assert.strictEqual(inferDriver('mongodb+srv://cluster.example/db'), 'mongodb+srv');
  });

  await check('inferDriver — JDBC style', () => {
    assert.strictEqual(inferDriver('jdbc:postgresql://h/d'), 'postgresql');
    assert.strictEqual(inferDriver('jdbc:databricks://h/path'), 'databricks');
  });

  await check('inferDriver — sqlite file path', () => {
    assert.strictEqual(inferDriver('./local.db'), 'sqlite');
    assert.strictEqual(inferDriver(':memory:'), 'sqlite');
  });

  await check('inferDriver — mock', () => {
    assert.strictEqual(inferDriver('mock:customers'), 'mock');
  });

  await check('inferDriver — rejects unknown', () => {
    assert.throws(() => inferDriver('gibberish'));
  });

  await check('streamMasked — mock:customers → 5 masked rows', async () => {
    const stream = streamMasked('mock:customers', '');
    const { rows, findings, byCategory } = await aggregate(stream);
    assert.strictEqual(rows, 5, `expected 5 rows, got ${rows}`);
    assert(findings.length > 0, 'should surface findings');
    assert(byCategory.id > 0, 'should categorise IDs');
    assert(byCategory.pii > 0, 'should categorise PII');
  });

  await check('streamMasked — mock:empty → 0 rows', async () => {
    const stream = streamMasked('mock:empty', '');
    const { rows } = await aggregate(stream);
    assert.strictEqual(rows, 0);
  });

  await check('streamMasked — mock:leaky finds credentials', async () => {
    const stream = streamMasked('mock:leaky', '');
    const { findings, byCategory } = await aggregate(stream);
    assert(byCategory.cred > 0, `expected cred findings, got ${JSON.stringify(byCategory)}`);
    const kinds = new Set(findings.map((f) => f.id));
    assert(kinds.has('env_secret') || kinds.has('db_conn') || kinds.has('openai_key'),
      `expected credential detection, got: ${[...kinds].join(', ')}`);
  });

  // -------------------------------------------------------------------------
  // Referential integrity across rows.
  //
  // maskRows() masks one row per maskText() call. Without token state shared
  // across the stream, every row restarted numbering at `_1`: mock:customers
  // has five DIFFERENT people and all five masked to [FULL_NAME_1]. Nothing
  // leaked, but the masked rows became useless -- an agent asked "how many
  // distinct customers?" would answer 1. These assert the opposite.
  // -------------------------------------------------------------------------
  await check('streamMasked — distinct people get distinct tokens across rows', async () => {
    const stream = streamMasked('mock:customers', '');
    const names = [];
    for await (const { masked } of stream) names.push(masked.name);
    assert.strictEqual(names.length, 5, `expected 5 rows, got ${names.length}`);
    assert.strictEqual(new Set(names).size, 5,
      `five distinct customers must yield five distinct tokens, got: ${names.join(', ')}`);
  });

  await check('streamMasked — tokens are stable, not merely unique', async () => {
    // Every row of mock:customers carries a distinct email, id and iban too.
    const stream = streamMasked('mock:customers', '');
    const emails = [];
    for await (const { masked } of stream) emails.push(masked.email);
    assert.strictEqual(new Set(emails).size, 5, `emails collapsed: ${emails.join(', ')}`);
    // Numbering must run 1..5 rather than restarting per row.
    assert(emails.some((e) => /_5\]$/.test(e)),
      `expected numbering to reach _5 across the stream, got: ${emails.join(', ')}`);
  });

  await check('CLI db-scan mock:customers exits 1 (findings present)', () => {
    const r = spawnSync(process.execPath, [CLI, 'db-scan', 'mock:customers', '-q', 'ignored'], { encoding: 'utf8' });
    if (r.status !== 1) throw new Error(`expected exit 1, got ${r.status}\n${r.stdout}\n${r.stderr}`);
  });

  await check('CLI db-mask mock:customers writes jsonl file', () => {
    const out = path.join(__dirname, 'fixtures', 'masked_query.jsonl');
    if (fs.existsSync(out)) fs.unlinkSync(out);
    const r = spawnSync(process.execPath, [CLI, 'db-mask', 'mock:customers', '-q', 'ignored', '-o', out], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`db-mask failed: ${r.stderr}`);
    const lines = fs.readFileSync(out, 'utf8').trim().split('\n');
    assert.strictEqual(lines.length, 5, `expected 5 masked rows, got ${lines.length}`);
    for (const line of lines) {
      assert(!line.includes('784-1990-9999999-0'), 'raw Emirates ID must not appear in masked output');
      assert(!line.includes('ahmed@example.ae'), 'raw email must not appear in masked output');
    }
    fs.unlinkSync(out);
  });

  console.log(`db.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runDbTests };

if (require.main === module) {
  runDbTests().then((ok) => process.exit(ok ? 0 : 1));
}
