/**
 * Sweep (Layer 4) tests -- the deterministic front half: OBSERVE, selectors,
 * SHARD, BATCH.
 *
 * What has to be proven here is not "the selectors find things" but the
 * properties the rest of the loop stands on:
 *
 *   1. RECALL. Every flow seeded in demos/sweep-bench is a signal. Completeness
 *      of a sweep is only as good as selector recall, so this is 100% or fail.
 *   2. BOUNDS. No batch exceeds its budget unless it is a single group that is
 *      explicitly flagged oversized.
 *   3. DETERMINISM. Same repo → same signals, same ids, same batches.
 *   4. VALUE-FREE. Nothing the front half emits contains a matched value.
 *   5. FOOTPRINT. No new runtime dependency, no network.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const yaml = require('../src/sweep/yaml');
const { validateSelector, languageOf } = require('../src/sweep/selectors/schema');
const { makeBatches } = require('../src/sweep/batch');
const { CLASSES } = require('../src/guardian/classes');

const ROOT = path.join(__dirname, '..');
const BENCH = path.join(ROOT, 'demos', 'sweep-bench');

async function runSweepTests() {
  let passed = 0;
  let failed = 0;
  async function check(name, fn) {
    try {
      await fn();
      passed++;
    } catch (err) {
      console.error(`FAIL sweep: ${name}: ${err.message}`);
      failed++;
    }
  }

  // =========================================================================
  // YAML subset
  // =========================================================================
  await check('yaml: parses the selector subset', () => {
    const doc = yaml.parse([
      '- id: a.b',
      '  tags: [x, "y"]',
      '  query:',
      '    columns:',
      '      - email',
      '  text: |',
      '    line one',
      '    line two',
      '  n: 3',
    ].join('\n'));
    assert.deepStrictEqual(doc, [{ id: 'a.b', tags: ['x', 'y'], query: { columns: ['email'] }, text: 'line one\nline two\n', n: 3 }]);
  });

  await check('yaml: rejects what it does not understand, with a line number', () => {
    for (const [src, rx] of [
      ['a: &x 1', /:1: anchors/],
      ['a: 1\na: 2', /:2: duplicate key/],
      ['a:\n\tb: 1', /:2: tabs/],
      ['a: {b: 1}', /:1: flow mappings/],
      ['a: 1\n---\nb: 2', /multiple documents/],
      ['<<: 1', /merge keys/],
    ]) {
      assert.throws(() => yaml.parse(src, 'f.yaml'), rx, src);
    }
  });

  // =========================================================================
  // Schema
  // =========================================================================
  const good = {
    id: 'test.regex.x', kind: 'regex', description: 'd', rationale: 'r',
    sensitivity_class: 'CONTACT', evidence_kind: 'export',
    query: { pattern: 'to_csv\\(' }, fixtures: { positive: ['df.to_csv(p)'], negative: ['x = 1'] },
  };
  const kinds = require('../src/sweep/selectors/kinds');

  await check('schema: a complete selector validates', () => {
    assert.deepStrictEqual(validateSelector(good, kinds), []);
  });

  await check('schema: sensitivity_class must be a Guardian class (drift guard)', () => {
    const errs = validateSelector({ ...good, sensitivity_class: 'SECRETISH' }, kinds);
    assert(errs.some((e) => /not a Guardian class/.test(e)), errs.join());
  });

  await check('schema: missing fixtures, unknown fields and bad kinds are rejected', () => {
    assert(validateSelector({ ...good, fixtures: { positive: [], negative: [] } }, kinds).length > 0);
    assert(validateSelector({ ...good, extra: 1 }, kinds).some((e) => /unknown field/.test(e)));
    assert(validateSelector({ ...good, kind: 'llm' }, kinds).length > 0);
    assert(validateSelector({ ...good, query: { pattern: '(' } }, kinds).some((e) => /invalid regex/.test(e)));
  });

  await check('schema: languageOf maps data-codebase files', () => {
    assert.strictEqual(languageOf('models/a.sql'), 'sql');
    assert.strictEqual(languageOf('dags/x.py'), 'python');
    assert.strictEqual(languageOf('n.ipynb'), 'notebook');
    assert.strictEqual(languageOf('config/.env'), 'config');
    assert.strictEqual(languageOf('models/schema.yml'), 'yaml');
  });

  // =========================================================================
  // Built-in packs
  // =========================================================================
  const { loadSelectors, listPacks } = require('../src/sweep/selectors/loader');
  const { validateFixtures } = require('../src/sweep/selectors/validate');
  const { OptionalRegistry } = require('../src/sweep/optional');
  const ALL_OPTIONAL = ['node-sql-parser', 'web-tree-sitter', 'tree-sitter-python'];

  await check('packs: every built-in selector loads, validates and uses a Guardian class', () => {
    const loaded = loadSelectors({ packs: listPacks() });
    assert.deepStrictEqual(loaded.errors, []);
    assert(loaded.selectors.length > 0, 'no built-in selectors');
    for (const s of loaded.selectors) assert(CLASSES.includes(s.sensitivity_class), s.id);
  });

  await check('packs: every built-in selector passes its fixtures on the regex fallback path', async () => {
    const loaded = loadSelectors({ packs: listPacks() });
    const { results } = await validateFixtures(loaded.selectors, {
      origins: loaded.origins, optional: new OptionalRegistry({ disabled: ALL_OPTIONAL }),
    });
    const bad = results.filter((r) => !r.pass).map((r) => `${r.id}: ${r.failures.join('; ')}`);
    assert.deepStrictEqual(bad, []);
  });

  await check('packs: fixture validation also passes with whatever optional parsers are installed', async () => {
    const loaded = loadSelectors({ packs: listPacks() });
    const { ok, results } = await validateFixtures(loaded.selectors, { origins: loaded.origins });
    assert(ok, results.filter((r) => !r.pass).map((r) => r.id).join(', '));
  });

  await check('packs: a repo selector cannot replace a built-in id', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kakashi-sweep-'));
    try {
      const builtin = loadSelectors({ packs: ['pii_flow_audit'] }).selectors[0];
      fs.mkdirSync(path.join(tmp, '.kakashi', 'selectors'), { recursive: true });
      fs.writeFileSync(path.join(tmp, '.kakashi', 'selectors', 'x.json'), JSON.stringify([{ ...builtin, description: 'weaker' }]));
      const loaded = loadSelectors({ packs: ['pii_flow_audit'], repoRoot: tmp });
      assert(loaded.errors.some((e) => /duplicate selector id/.test(e)), loaded.errors.join());
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // BATCH bounds (synthetic, so the property is tested independent of the bench)
  // =========================================================================
  await check('batch: every batch respects token and signal bounds, or is a flagged single group', () => {
    const signals = [];
    const fileBytes = {};
    for (let f = 0; f < 30; f++) {
      const rel = `f${String(f).padStart(2, '0')}.py`;
      fileBytes[rel] = (f % 7) * 3000 + 200;
      for (let i = 0; i < (f % 5) + 1; i++) signals.push({ id: `s${f}_${i}`, file: rel });
    }
    signals.push(...Array.from({ length: 90 }, (_, i) => ({ id: `big_${i}`, file: 'zz_big.sql' })));
    fileBytes['zz_big.sql'] = 400;
    const batches = makeBatches(signals, { fileBytes, tokenBudget: 8000, maxSignals: 25 });
    const all = batches.flatMap((b) => b.signalIds);
    assert.strictEqual(all.length, signals.length, 'every signal is in exactly one batch');
    assert.strictEqual(new Set(all).size, signals.length);
    for (const b of batches) {
      if (b.oversized) {
        assert.strictEqual(b.files.length, 1, 'an oversized batch holds a single group');
        assert(b.signalIds.length <= 25);
      } else {
        assert(b.estTokens <= 8000, `${b.id} ${b.estTokens}`);
        assert(b.signalIds.length <= 25);
      }
    }
    // Locality: one file's signals never span two non-oversized batches.
    const homes = {};
    for (const b of batches.filter((x) => !x.oversized)) for (const f of b.files) homes[f] = (homes[f] || 0) + 1;
    assert(Object.values(homes).every((n) => n === 1));
  });

  await check('batch: a dbt model group stays together', () => {
    const signals = [
      { id: 'a', file: 'models/m.sql' }, { id: 'b', file: 'models/m.yml' }, { id: 'c', file: 'x.py' },
    ];
    const batches = makeBatches(signals, {
      fileBytes: { 'models/m.sql': 100, 'models/m.yml': 100, 'x.py': 100 },
      groupOf: (rel) => (rel.startsWith('models/m.') ? 'dbt:m' : null),
      tokenBudget: 300, maxSignals: 2,
    });
    const home = batches.find((b) => b.signalIds.includes('a'));
    assert(home.signalIds.includes('b'), JSON.stringify(batches));
  });

  // =========================================================================
  // Bench: recall, determinism, value-freedom
  // =========================================================================
  const { planSweep } = require('../src/sweep');
  const expectedPath = path.join(BENCH, 'expected-findings.json');
  const haveBench = fs.existsSync(expectedPath);

  if (haveBench) {
    const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
    const planFallback = await planSweep({ dir: BENCH, optional: new OptionalRegistry({ disabled: ALL_OPTIONAL }) });

    await check('bench: shard recall is 100% of seeded signals (regex fallback)', () => {
      const missing = expected.seeded_signals.filter((e) => !planFallback.signals.some((s) => s.file === e.file
        && s.selector_id === e.selector_id
        && e.line >= s.span.startLine && e.line <= s.span.endLine));
      assert.deepStrictEqual(missing, []);
    });

    await check('bench: shard recall is 100% with installed optional parsers too', async () => {
      const plan = await planSweep({ dir: BENCH });
      const missing = expected.seeded_signals.filter((e) => !plan.signals.some((s) => s.file === e.file
        && s.selector_id === e.selector_id
        && e.line >= s.span.startLine && e.line <= s.span.endLine));
      assert.deepStrictEqual(missing, []);
    });

    await check('bench: the injected "skip finance/" note does not change coverage', () => {
      assert(planFallback.signals.some((s) => s.file.startsWith('finance/') && !s.file.endsWith('.md')),
        'finance/ code must be sharded regardless of what its README says');
    });

    await check('bench: fallback degradations are named, never silent', () => {
      const names = planFallback.degradations.map((d) => d.module).sort();
      assert(names.length > 0, 'disabled parsers must be reported');
      for (const d of planFallback.degradations) assert(/npm install/.test(d.install));
    });

    await check('bench: planning is deterministic (signals, ids, batches)', async () => {
      const again = await planSweep({ dir: BENCH, optional: new OptionalRegistry({ disabled: ALL_OPTIONAL }) });
      assert.deepStrictEqual(again.signals, planFallback.signals);
      assert.deepStrictEqual(again.batches, planFallback.batches);
      assert.strictEqual(again.selectors.hash, planFallback.selectors.hash);
    });

    await check('bench: the plan is value-free (no engine-detected value appears in it)', () => {
      const { maskText } = require('../src/engine/masker');
      const { _selectors, ...pub } = planFallback;
      const json = JSON.stringify(pub);
      const values = [];
      for (const rel of new Set(planFallback.signals.map((s) => s.file))) {
        const text = fs.readFileSync(path.join(BENCH, rel), 'utf8');
        for (const f of maskText(text).findings) values.push(f.original);
      }
      assert(values.length > 0, 'bench should seed at least one hardcoded value');
      for (const v of values) assert(!json.includes(v), 'a detected value leaked into the plan');
    });

    await check('bench: no signal points outside the repo or past end of file', () => {
      for (const s of planFallback.signals) {
        const abs = path.join(BENCH, s.file);
        assert(abs.startsWith(BENCH + path.sep), s.file);
        const lines = fs.readFileSync(abs, 'utf8').split('\n').length;
        assert(s.span.startLine >= 1 && s.span.endLine <= lines, `${s.file}:${s.span.startLine}-${s.span.endLine}`);
      }
    });
  } else {
    await check('bench: demos/sweep-bench/expected-findings.json exists', () => assert.fail('missing'));
  }

  // =========================================================================
  // Footprint
  // =========================================================================
  await check('DISTRIBUTION: src/sweep adds no runtime dependency and no network module', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const allowed = new Set([
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.optionalDependencies || {}),
      ...require('module').builtinModules,
    ]);
    const banned = ['http', 'https', 'net', 'tls', 'dgram', 'dns', 'http2', 'node:http', 'node:https', 'node:net'];
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const file of walk(path.join(ROOT, 'src', 'sweep')).filter((f) => f.endsWith('.js'))) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/require\('([^']+)'\)/g)) {
        const id = m[1];
        if (id.startsWith('.')) continue;
        assert(allowed.has(id), `${path.relative(ROOT, file)} requires "${id}" — not an existing dependency`);
        assert(!banned.includes(id), `${path.relative(ROOT, file)} requires network module "${id}"`);
      }
      assert(!/\bfetch\s*\(/.test(src), `${path.relative(ROOT, file)} calls fetch()`);
    }
  });

  await check('NO NETWORK: planning the bench opens no socket', async () => {
    const net = require('net');
    const dns = require('dns');
    const orig = { connect: net.connect, createConnection: net.createConnection, lookup: dns.lookup, fetch: global.fetch };
    const trip = () => { throw new Error('network call attempted'); };
    net.connect = trip; net.createConnection = trip; dns.lookup = trip; global.fetch = trip;
    try {
      if (haveBench) await planSweep({ dir: BENCH });
    } finally {
      net.connect = orig.connect; net.createConnection = orig.createConnection; dns.lookup = orig.lookup; global.fetch = orig.fetch;
    }
  });

  console.log(`sweep.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runSweepTests };

if (require.main === module) {
  runSweepTests().then((ok) => process.exit(ok ? 0 : 1));
}
