/**
 * Sweep REDUCE + REPORT tests.
 *
 * Builds an in-memory fake RunStore from the real demos/sweep-bench plan
 * (planSweep signals + batches) and synthetic worker results that encode the
 * bench's expected flows, then proves:
 *   1. every expected chain (P0 ones with severity) is found source → sink;
 *   2. dedupe merges co-located signals; NOT_AN_ISSUE is counted as dismissed;
 *   3. PDPL articles are attached; output is deterministic;
 *   4. md / html / json / sarif all render, with Mermaid / RTL / SARIF shape;
 *   5. no report contains an engine-detected value from the bench files
 *      (unless includeValues, which must carry the NOT-agent-safe banner).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BENCH = path.join(ROOT, 'demos', 'sweep-bench');

function fakeStore(manifest, signals, batches, subs) {
  const files = {};
  return {
    files,
    manifest: () => manifest,
    signals: () => signals,
    batches: () => batches,
    allFindings: () => subs,
    readJSON: (n) => (n in files ? JSON.parse(files[n]) : null),
    writeJSON: (n, o) => { files[n] = JSON.stringify(o); },
    iterations: () => [{ iteration: 1, stage: 'map', batches: batches.length }, { iteration: 1, stage: 'reduce', findings: 0 }],
  };
}

async function buildBenchStore() {
  const { planSweep } = require('../src/sweep');
  const { loadDbtProject } = require('../src/sweep/dbt');
  const { listDbtFiles } = require('../src/sweep/reduce/graph');
  const plan = await planSweep({ dir: BENCH });
  const dbt = loadDbtProject(BENCH, listDbtFiles(BENCH), (r) => fs.readFileSync(path.join(BENCH, r), 'utf8'));
  const payoutsLine = dbt.sources['finance.payouts'].line;
  const exposureLine = dbt.exposures.crm_partner_export.line;

  const S = (o) => ({ disposition: 'FINDING', confidence: 0.9, preconditions: [], remediation: 'Restrict the flow to masked or aggregated columns.', ...o });
  const E = (file, line, to, operation) => ({ from: { file, line }, to, operation });
  // file:line -> synthetic result template (applies to every signal on that line)
  const spec = {
    'models/marts/customer_contact_export.sql:7': S({ severity: 'P0', sink_type: 'exposure', edge: E('models/marts/customer_contact_export.sql', 7, { file: 'models/schema.yml', line: exposureLine }, 'expose') }),
    'models/marts/customer_contact_export.sql:5': S({ severity: 'P0', sink_type: 'object_storage', edge: E('models/marts/customer_contact_export.sql', 5, { file: 'dags/export_customers_to_s3.py', line: 13 }, 'read') }),
    'dags/export_customers_to_s3.py:13': S({ severity: 'P0', sink_type: 'object_storage', edge: E('dags/export_customers_to_s3.py', 13, { external: 's3' }, 'export') }),
    'dags/weekly_customer_report.py:14': S({ severity: 'P1', sink_type: 'email', edge: E('dags/weekly_customer_report.py', 14, { external: 'email' }, 'export') }),
    'python/export_customers.py:14': S({ severity: 'P0', sink_type: 'object_storage', edge: E('python/export_customers.py', 14, { external: 's3' }, 'export') }),
    'python/debug_customers.py:11': S({ severity: 'P1', sink_type: 'log', edge: E('python/debug_customers.py', 11, { external: 'log' }, 'log') }),
    'python/sync_crm.py:9': S({ severity: 'P0', sink_type: 'http', edge: E('python/sync_crm.py', 9, { external: 'http' }, 'export') }),
    'python/spark_profile.py:10': S({ severity: 'P1', sink_type: 'object_storage', edge: E('python/spark_profile.py', 10, { external: 's3' }, 'export') }),
    'finance/sql/payout_export.sql:2': S({ severity: 'P0', sink_type: 'object_storage', edge: E('models/schema.yml', payoutsLine, { file: 'finance/sql/payout_export.sql', line: 2 }, 'read') }),
    'finance/sql/payout_export.sql:3': S({ severity: 'P0', sink_type: 'object_storage', edge: E('finance/sql/payout_export.sql', 3, { external: 's3' }, 'export') }),
    'finance/reconcile.py:17': S({ severity: 'P1', sink_type: 'email', edge: E('finance/reconcile.py', 17, { external: 'email' }, 'export') }),
    'python/config.py:4': S({ severity: 'P2', sink_type: 'file', edge: E('python/config.py', 4, { external: 'file' }, 'expose') }),
  };
  const used = new Set();
  const subs = plan.batches.map((b) => ({
    batch_id: b.id,
    results: b.signalIds.map((id) => {
      const sig = plan.signals.find((s) => s.id === id);
      const k = `${sig.file}:${sig.span.startLine}`;
      if (spec[k]) { used.add(k); return { signal_id: id, ...JSON.parse(JSON.stringify(spec[k])) }; }
      return { signal_id: id, disposition: 'NOT_AN_ISSUE', reason: 'not a flow' };
    }),
  }));
  const manifest = {
    run_id: 'test_run', kakashiVersion: '0.0.0-test', root: BENCH, coverage: plan.coverage,
    degradations: plan.degradations, incremental: null,
    decision: { decision: 'COMPLETE', reasonCode: 'ALL_ACCOUNTED', gaps: [], accounted: plan.signals.length, signals: plan.signals.length, iteration: 1 },
  };
  return { store: fakeStore(manifest, plan.signals, plan.batches, subs), plan, spec, used, dbt };
}

async function runSweepReduceTests() {
  let passed = 0;
  let failed = 0;
  async function check(name, fn) {
    try { await fn(); passed++; } catch (err) { console.error(`FAIL sweep-reduce: ${name}: ${err.message}`); failed++; }
  }

  const { reduce } = require('../src/sweep/reduce');
  const { render } = require('../src/sweep/report');
  const { globToRegExp, ownersFor } = require('../src/sweep/reduce/owners');
  const { mermaidLabel } = require('../src/sweep/report/markdown');

  if (!fs.existsSync(path.join(BENCH, 'expected-findings.json'))) {
    console.log('sweep-reduce.test.js: bench missing, skipped');
    return true;
  }
  const expected = JSON.parse(fs.readFileSync(path.join(BENCH, 'expected-findings.json'), 'utf8'));
  const { store, plan, spec, used } = await buildBenchStore();
  const red = reduce(store);

  await check('every synthetic spec line had a real bench signal', () => {
    for (const k of Object.keys(spec)) assert(used.has(k), `no signal at ${k}`);
  });

  await check('reduce writes reduce.json and is deterministic', async () => {
    assert(store.readJSON('reduce.json'));
    const again = reduce((await buildBenchStore()).store);
    assert.strictEqual(JSON.stringify(again), JSON.stringify(red));
  });

  const nodeFile = (id) => (red.graph.nodes.find((n) => n.id === id) || {}).file;
  await check('every expected chain is detected source → sink with matching P0 severity', () => {
    for (const exp of expected.chains) {
      const want = [...new Set(exp.path)];
      const hit = red.chains.find((c) => {
        const files = new Set(c.nodes.map(nodeFile).filter(Boolean));
        return want.every((f) => files.has(f)) && (c.sink.startsWith('sink:') || c.sink.startsWith('exposure:'));
      });
      assert(hit, `chain ${exp.id} not found`);
      if (exp.severity === 'P0') assert.strictEqual(hit.severity, 'P0', `${exp.id} severity ${hit.severity}`);
    }
  });

  await check('dbt chain runs from the pii source to the exposure via dbt lineage', () => {
    const c = red.chains.find((x) => x.source === 'source:crm.customers' && x.sink === 'exposure:crm_partner_export');
    assert(c, 'missing');
    assert.deepStrictEqual(c.nodes, ['source:crm.customers', 'dbt:stg_customers', 'dbt:dim_customers', 'dbt:customer_contact_export', 'exposure:crm_partner_export']);
    assert(red.graph.edges.some((e) => e.origin === 'dbt') && red.graph.edges.some((e) => e.origin === 'worker'));
  });

  await check('dedupe: co-located signals with the same edge merge into one finding', () => {
    const sigs = plan.signals.filter((s) => s.file === 'finance/sql/payout_export.sql' && s.span.startLine === 2);
    assert(sigs.length >= 2);
    const fs2 = red.findings.filter((f) => f.file === 'finance/sql/payout_export.sql' && f.line === 2);
    assert.strictEqual(fs2.length, 1);
    assert.strictEqual(fs2[0].signal_ids.length, sigs.length);
    assert(fs2[0].selector_ids.length >= 2);
    assert.strictEqual(new Set(red.findings.map((f) => f.key)).size, red.findings.length);
  });

  await check('dismissed + coverage accounting', () => {
    assert.strictEqual(red.coverage.accounted, plan.signals.length);
    assert.strictEqual(red.coverage.accountedPct, 100);
    const findingSignals = red.findings.reduce((n, f) => n + f.signal_ids.length, 0);
    assert.strictEqual(red.dismissed.count + findingSignals, plan.signals.length);
  });

  await check('PDPL articles attached to findings, chains and summary', () => {
    assert(red.findings.every((f) => f.pdpl.length > 0));
    assert(red.chains.every((c) => c.pdpl.length > 0));
    assert(red.pdpl.length > 0 && red.pdpl.every((a) => a.article && a.title && a.count > 0));
  });

  await check('CODEOWNERS: last match wins, globs', () => {
    const rules = [['*', ['@all']], ['/models/', ['@data']], ['*.py', ['@py']], ['finance/**', ['@fin']]]
      .map(([p, o]) => ({ pattern: p, rx: globToRegExp(p), owners: o }));
    assert.deepStrictEqual(ownersFor(rules, 'models/a.sql'), ['@data']);
    assert.deepStrictEqual(ownersFor(rules, 'python/x.py'), ['@py']);
    assert.deepStrictEqual(ownersFor(rules, 'finance/x.py'), ['@fin']);
    assert.deepStrictEqual(ownersFor(rules, 'README.md'), ['@all']);
  });

  const outs = {};
  await check('all four renderers produce output (en + ar)', () => {
    for (const format of ['md', 'html', 'json', 'sarif']) {
      outs[format] = render(store, { format });
      outs[`${format}_ar`] = render(store, { format, lang: 'ar' });
      assert(outs[format].length > 200, format);
    }
  });

  await check('markdown: 7 sections + mermaid flowchart', () => {
    for (let i = 1; i <= 7; i++) assert(outs.md.includes(`## ${i}. `), `section ${i}`);
    assert(outs.md.includes('```mermaid\nflowchart LR'));
  });

  await check('html: rtl for Arabic, ltr for English, mermaid escaped', () => {
    assert(/<html lang="ar" dir="rtl">/.test(outs.html_ar));
    assert(/<html lang="en" dir="ltr">/.test(outs.html));
    assert(outs.html.includes('class="mermaid"'));
    assert(!outs.html.includes('<script'));
    assert.strictEqual(mermaidLabel('a"b<c>`'), 'a#34;b#60;c#62;#96;');
  });

  await check('sarif: 2.1.0 shape with rules and results', () => {
    const s = JSON.parse(outs.sarif);
    assert.strictEqual(s.version, '2.1.0');
    const run = s.runs[0];
    assert.strictEqual(run.tool.driver.name, 'Kakashi Sweep');
    assert(run.tool.driver.rules.length > 0 && run.results.length === red.findings.length);
    const ruleIds = new Set(run.tool.driver.rules.map((r) => r.id));
    for (const r of run.results) {
      assert(ruleIds.has(r.ruleId));
      assert(['error', 'warning', 'note'].includes(r.level));
      assert(r.locations[0].physicalLocation.region.startLine >= 1);
    }
    assert(run.results.some((r) => r.level === 'error'));
  });

  await check('json: agentSafe and parseable', () => {
    const j = JSON.parse(outs.json);
    assert.strictEqual(j.agentSafe, true);
    assert(j.chains.length && j.findings.length);
  });

  const { maskText } = require('../src/engine/masker');
  const values = [];
  for (const rel of new Set(plan.signals.map((s) => s.file))) {
    for (const f of maskText(fs.readFileSync(path.join(BENCH, rel), 'utf8')).findings) values.push(f.original);
  }
  await check('reports and reduce.json contain no engine-detected bench value', () => {
    assert(values.length > 0);
    const all = [JSON.stringify(red), ...Object.values(outs)];
    for (const v of values) for (const o of all) assert(!o.includes(v), 'a detected value leaked into a report');
  });

  await check('includeValues: banner + not agent-safe', () => {
    const md = render(store, { format: 'md', includeValues: true });
    assert(md.includes('NOT agent-safe'));
    assert(values.some((v) => md.includes(v)), 'values excerpt expected');
    assert.strictEqual(JSON.parse(render(store, { format: 'json', includeValues: true })).agentSafe, false);
  });

  console.log(`sweep-reduce.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runSweepReduceTests };

if (require.main === module) {
  runSweepReduceTests().then((ok) => process.exit(ok ? 0 : 1));
}
