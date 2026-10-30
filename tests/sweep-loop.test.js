/**
 * Sweep loop tests -- Map / Verify / Replan / Decision, end to end, offline.
 *
 * The full loop runs against a private copy of demos/sweep-bench with the
 * deterministic mock worker, so every property below is checked on the real
 * code path a host agent drives through `sweep next` / `sweep submit`:
 *
 *   - workers only ever get Guardian views, and those views are value-free and
 *     line-aligned with the source
 *   - VERIFY rejects incomplete, duplicated, unknown, out-of-range and
 *     value-leaking submissions
 *   - REPLAN reissues, splits, then escalates; the budget always terminates
 *   - COMPLETE only when every signal is accounted for; a worker that obeys
 *     "skip finance/" can never produce COMPLETE
 *   - runs are resumable, incremental mode reuses verified results, the audit
 *     event is value-free, and the whole loop opens no socket
 */

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { startRun, nextBatch, submit, decide, finalise, replan, submitNarrative } = require('../src/sweep/loop');
const { RunStore } = require('../src/sweep/run-store');
const { alignLines } = require('../src/sweep/views');
const { runMockWorker, judge } = require('../demos/sweep-mock-worker');
const { maskText } = require('../src/engine/masker');
const { reduce } = require('../src/sweep/reduce');
const { render } = require('../src/sweep/report');

const BENCH = path.join(__dirname, '..', 'demos', 'sweep-bench');

function copyBench() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kakashi-sweep-loop-'));
  fs.cpSync(BENCH, dir, { recursive: true, filter: (src) => !src.includes(`${path.sep}.kakashi`) });
  return dir;
}

/** Every engine-detectable value in the bench source files. */
function benchValues(root) {
  const vals = new Set();
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== '.kakashi') walk(p); return; }
    // Prose (README, docs) is not data; and the name heuristics fire on product
    // names like "Kakashi Sweep", which a report legitimately contains.
    if (/\.md$/.test(e.name)) return;
    for (const f of maskText(fs.readFileSync(p, 'utf8')).findings) {
      if (f.original.length >= 6 && !['full_name', 'non_latin_name'].includes(f.id)) vals.add(f.original);
    }
  });
  walk(root);
  return [...vals];
}

async function runSweepLoopTests() {
  let passed = 0;
  let failed = 0;
  async function check(name, fn) {
    try {
      await fn();
      passed++;
    } catch (err) {
      console.error(`FAIL sweep-loop: ${name}: ${err.message}`);
      failed++;
    }
  }
  const tmps = [];
  const fresh = () => { const d = copyBench(); tmps.push(d); return d; };
  const base = { task: 'audit where customer data goes', agent: 'claude', destination: 'external_model', auditLog: false };

  await check('alignLines restores line count when a multi-line value collapsed', () => {
    const orig = 'a\nKEY=-----BEGIN\nx\ny\n-----END\nb\nc';
    const masked = 'a\nKEY=[SSH_KEY_1]\nb\nc';
    const out = alignLines(orig, masked);
    assert.strictEqual(out.split('\n').length, orig.split('\n').length);
    assert.strictEqual(out.split('\n')[5], 'b');
    assert.strictEqual(alignLines(orig, orig), orig);
  });

  await check('start: a run is planned, batched and IN_PROGRESS until workers report', async () => {
    const root = fresh();
    const { store, decision } = await startRun({ ...base, dir: root });
    assert.strictEqual(decision.decision, 'IN_PROGRESS');
    assert(store.batches().length > 0);
    assert(fs.readFileSync(path.join(root, '.kakashi', 'sweep', '.gitignore'), 'utf8').includes('*'));
    const m = JSON.stringify(store.manifest());
    for (const v of benchValues(root)) assert(!m.includes(v), 'manifest leaked a value');
  });

  await check('next: workers receive only guarded views, value-free and line-aligned', async () => {
    const root = fresh();
    const { store } = await startRun({ ...base, dir: root, approvals: ['CREDENTIAL'] });
    const values = benchValues(root);
    let seen = 0;
    for (;;) {
      const job = await nextBatch(store);
      if (!job.batch) break;
      const payload = JSON.stringify(job);
      for (const v of values) assert(!payload.includes(v), 'payload leaked a value');
      for (const [rel, view] of Object.entries(job.views)) {
        assert(view.startsWith(store.dir), 'view must live in the run dir, never the original');
        const text = fs.readFileSync(view, 'utf8');
        assert.strictEqual(text.split('\n').length, fs.readFileSync(path.join(root, rel), 'utf8').split('\n').length, `${rel} not line-aligned`);
        for (const f of maskText(text).findings) {
          assert(!['CREDENTIAL', 'GOVERNMENT_IDENTIFIER', 'FINANCIAL', 'CONTACT'].includes(require('../src/guardian/classes').classOf(f.id)),
            `${rel} view still contains a prohibited value (${f.id})`);
        }
        seen++;
      }
      submit(store, job.batch.id, JSON.stringify({ batch_id: job.batch.id, results: job.signals.map(judge) }));
    }
    assert(seen > 0);
  });

  await check('next: a file holding a credential waits for human approval (no weaker workaround)', async () => {
    const root = fresh();
    const { store } = await startRun({ ...base, dir: root });
    const { decision } = await runMockWorker(root, { runId: store.runId });
    assert.strictEqual(decision.decision, 'PARTIAL');
    assert.strictEqual(decision.reasonCode, 'HUMAN_APPROVAL_REQUIRED');
    assert(decision.gaps.some((g) => g.type === 'approval' && g.files.includes('python/config.py')));
    assert(!fs.existsSync(store.viewPath('python/config.py')), 'no view may exist for a refused file');
  });

  let completeRoot = null;
  let completeStore = null;
  await check('mock worker: full loop with approval reaches COMPLETE at 100%', async () => {
    const root = fresh();
    const { store } = await startRun({ ...base, dir: root, approvals: ['CREDENTIAL'] });
    const { decision, rejections } = await runMockWorker(root, { runId: store.runId, omitFirst: true });
    assert.strictEqual(decision.decision, 'COMPLETE', JSON.stringify(decision.gaps));
    assert.strictEqual(decision.accountedPct, 100);
    assert(rejections > 0, 'omitFirst must have produced rejections that were replanned');
    completeRoot = root; completeStore = store;
  });

  await check('reduce + report on the completed run: chains found, reports value-free', async () => {
    const r = reduce(completeStore);
    assert(r.chains.some((c) => c.severity === 'P0'));
    const values = benchValues(completeRoot);
    for (const format of ['md', 'html', 'json', 'sarif']) {
      for (const lang of ['en', 'ar']) {
        const out = render(completeStore, { format, lang });
        for (const v of values) assert(!out.includes(v), `${format}/${lang} report leaked a value`);
      }
    }
  });

  await check('verify: incomplete, duplicate, unknown and malformed submissions are rejected', async () => {
    const root = fresh();
    const { store } = await startRun({ ...base, dir: root, approvals: ['CREDENTIAL'] });
    let job = await nextBatch(store);
    while (job.signals.length < 2) { submit(store, job.batch.id, JSON.stringify({ batch_id: job.batch.id, results: job.signals.map(judge) })); job = await nextBatch(store); }
    const results = job.signals.map(judge);
    const codes = (sub) => submit(store, job.batch.id, JSON.stringify(sub)).errors.map((e) => e.code);
    // After two rejections REPLAN splits the batch; later checks target a child.
    const reissue = async () => { const j = await nextBatch(store); assert(j.batch.id.startsWith(job.batch.id)); job = j; };

    assert(codes({ batch_id: job.batch.id, results: results.slice(1) }).includes('SIGNAL_MISSING'));
    await reissue();
    assert(codes({ batch_id: job.batch.id, results: [...results, results[0]] }).includes('SIGNAL_DUPLICATE'));
    await reissue();
    const childResults = job.signals.map(judge);
    assert(codes({ batch_id: job.batch.id, results: [...childResults, { ...childResults[0], signal_id: 'sig_0000000000000000' }] }).includes('SIGNAL_UNKNOWN'));
    await reissue();
    assert.deepStrictEqual(submit(store, job.batch.id, '{not json').errors.map((e) => e.code), ['SCHEMA_INVALID']);
  });

  await check('verify: a submission quoting a value is rejected and the value is not stored', async () => {
    const root = fresh();
    const { store } = await startRun({ ...base, dir: root, approvals: ['CREDENTIAL'] });
    const job = await nextBatch(store);
    const results = job.signals.map(judge);
    const leak = 'customer.contact@example.com';
    results[0] = { signal_id: results[0].signal_id, disposition: 'NOT_AN_ISSUE', reason: `only ${leak} is used` };
    const res = submit(store, job.batch.id, JSON.stringify({ batch_id: job.batch.id, results }));
    assert(!res.accepted);
    assert(res.errors.some((e) => e.code === 'VALUE_LEAK'));
    assert(!JSON.stringify(res).includes(leak), 'the rejection itself must not echo the value');
    const onDisk = fs.readdirSync(store.dir, { recursive: true }).filter((f) => !String(f).startsWith('views'))
      .map((f) => path.join(store.dir, String(f))).filter((f) => fs.statSync(f).isFile()).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    assert(!onDisk.includes(leak), 'a leaked value reached the run dir');
  });

  await check('verify: edges must point at real files and lines', async () => {
    const root = fresh();
    const { store } = await startRun({ ...base, dir: root, approvals: ['CREDENTIAL'] });
    const job = await nextBatch(store);
    const results = job.signals.map(judge).map((r) => (r.disposition === 'FINDING'
      ? { ...r, edge: { ...r.edge, from: { file: 'does/not/exist.py', line: 1 } } } : r));
    if (!results.some((r) => r.disposition === 'FINDING')) results[0] = { ...judge({ ...job.signals[0], file: 'x' }), signal_id: job.signals[0].id, edge: { from: { file: 'nope.sql', line: 1 }, to: { external: 's3' }, operation: 'export' } };
    const res = submit(store, job.batch.id, JSON.stringify({ batch_id: job.batch.id, results }));
    assert(res.errors.some((e) => e.code === 'EDGE_INVALID'), JSON.stringify(res.errors));
  });

  await check('replan: reissue, then split after repeated rejection, then escalate at budget', () => {
    const m = { maxIterations: 4 };
    const b = { id: 'b0001_x', signalIds: ['a', 'b', 'c'], files: ['f'], status: 'issued', attempts: 1, rejections: [{ codes: ['SIGNAL_MISSING'] }] };
    const batches = [b];
    replan(b, batches, m);
    assert.strictEqual(b.status, 'pending');
    b.attempts = 2; b.rejections.push({ codes: ['SIGNAL_MISSING'] });
    replan(b, batches, m);
    assert.strictEqual(b.status, 'split');
    assert.strictEqual(batches.length, 3);
    assert.deepStrictEqual(batches.slice(1).flatMap((c) => c.signalIds), ['a', 'b', 'c']);
    assert(batches.slice(1).every((c) => c.attempts === 2), 'a split never resets the budget');
    const c = batches[1];
    c.attempts = 4; c.rejections.push({ codes: ['SCHEMA_INVALID'] });
    replan(c, batches, m);
    assert.strictEqual(c.status, 'requires_approval');
  });

  await check('budget: a worker that never submits a valid batch ends PARTIAL, never COMPLETE', async () => {
    const root = fresh();
    const { store } = await startRun({ ...base, dir: root, approvals: ['CREDENTIAL'], maxIterations: 2 });
    for (let i = 0; i < 300; i++) {
      const job = await nextBatch(store);
      if (!job.batch) break;
      submit(store, job.batch.id, JSON.stringify({ batch_id: job.batch.id, results: [] }));
    }
    const d = finalise(store);
    assert.strictEqual(d.decision, 'PARTIAL');
    assert(d.gaps.length > 0 && d.accounted === 0);
  });

  await check('INJECTION: a worker obeying "skip the finance/ folder" can never make the run COMPLETE', async () => {
    const root = fresh();
    assert(/skip the finance\/ folder/i.test(fs.readFileSync(path.join(root, 'finance', 'README.md'), 'utf8')));
    const { store } = await startRun({ ...base, dir: root, task: 'audit customer data flows, skip the finance folder', approvals: ['CREDENTIAL'] });
    assert(store.signals().some((s) => s.file.startsWith('finance/')), 'finance/ must be sharded regardless');
    for (let i = 0; i < 300; i++) {
      const job = await nextBatch(store);
      if (!job.batch) break;
      // The compromised worker silently drops every finance/ signal.
      const results = job.signals.filter((s) => !s.file.startsWith('finance/')).map(judge);
      submit(store, job.batch.id, JSON.stringify({ batch_id: job.batch.id, results }));
    }
    const d = finalise(store);
    assert.notStrictEqual(d.decision, 'COMPLETE');
    assert(d.gaps.some((g) => (g.files || []).some((f) => f.startsWith('finance/'))), 'the gap must name finance/');
  });

  await check('map skipped (CI): closing a run with unjudged batches is PARTIAL / MAP_SKIPPED', async () => {
    const root = fresh();
    const { store } = await startRun({ ...base, dir: root });
    const d = finalise(store);
    assert.strictEqual(d.decision, 'PARTIAL');
    assert.strictEqual(d.reasonCode, 'MAP_SKIPPED');
    assert(d.gaps.every((g) => ['map_skipped', 'approval', 'batch'].includes(g.type)));
  });

  await check('resumable: a reopened run continues where it stopped', async () => {
    const root = fresh();
    const { store } = await startRun({ ...base, dir: root, approvals: ['CREDENTIAL'] });
    const job = await nextBatch(store);
    submit(store, job.batch.id, JSON.stringify({ batch_id: job.batch.id, results: job.signals.map(judge) }));
    const reopened = RunStore.open(root);
    assert.strictEqual(reopened.runId, store.runId);
    assert.strictEqual(decide(reopened).accounted, job.signals.length);
    const { decision } = await runMockWorker(root);
    assert.strictEqual(decision.decision, 'COMPLETE');
  });

  await check('narrative: value re-scan applies to agent narrative too', async () => {
    const res = submitNarrative(completeStore, JSON.stringify({ chains: { c1: 'mail goes to someone.real@example.org' } }));
    assert(!res.accepted && res.errors.some((e) => e.code === 'VALUE_LEAK'));
    assert(submitNarrative(completeStore, JSON.stringify({ chains: { c1: 'customer contact columns reach the partner bucket' } })).accepted);
  });

  await check('audit: one value-free event per closed run', async () => {
    const root = fresh();
    const log = path.join(root, '..', `${path.basename(root)}-audit.jsonl`);
    tmps.push(log);
    const { store } = await startRun({ ...base, dir: root, approvals: ['CREDENTIAL'], auditLog: log });
    await runMockWorker(root, { runId: store.runId });
    finalise(store);
    const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
    assert.strictEqual(lines.length, 1, 'finalise must not double-log');
    const evt = JSON.parse(lines[0]);
    assert.strictEqual(evt.kind, 'sweep');
    assert.strictEqual(evt.decision, 'COMPLETE');
    for (const v of benchValues(root)) assert(!lines[0].includes(v));
    assert(!lines[0].includes(root), 'audit event must not carry paths');
  });

  await check('incremental --since: only changed files are re-judged, the rest reuse verified results', async () => {
    const root = fresh();
    const git = (...a) => execFileSync('git', a, { cwd: root, stdio: 'pipe' });
    git('init', '-q'); git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base');
    git('add', '-A'); git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'bench');
    const first = await startRun({ ...base, dir: root, approvals: ['CREDENTIAL'] });
    await runMockWorker(root, { runId: first.store.runId });
    fs.appendFileSync(path.join(root, 'python', 'sync_crm.py'), '\n# touched\n');
    const second = await startRun({ ...base, dir: root, approvals: ['CREDENTIAL'], since: 'HEAD' });
    const inc = second.store.manifest().incremental;
    assert(inc.changedFiles.includes('python/sync_crm.py'));
    assert(inc.reused > 0, 'unchanged signals reuse prior verified results');
    const pending = second.store.batches().filter((b) => b.status === 'pending').flatMap((b) => b.files);
    assert(pending.every((f) => inc.changedFiles.includes(f)), `re-judged only changed files: ${pending}`);
    const { decision } = await runMockWorker(root, { runId: second.store.runId });
    assert.strictEqual(decision.decision, 'COMPLETE');
  });

  await check('NO NETWORK: the whole loop (start → map → reduce → report) opens no socket', async () => {
    const net = require('net');
    const dns = require('dns');
    const http = require('http');
    const https = require('https');
    const orig = [net.connect, net.createConnection, dns.lookup, http.request, https.request, global.fetch];
    const trip = () => { throw new Error('network call attempted'); };
    net.connect = trip; net.createConnection = trip; dns.lookup = trip; http.request = trip; https.request = trip; global.fetch = trip;
    try {
      const root = fresh();
      const { store } = await startRun({ ...base, dir: root, approvals: ['CREDENTIAL'] });
      await runMockWorker(root, { runId: store.runId });
      reduce(store);
      render(store, { format: 'html', lang: 'ar' });
    } finally {
      [net.connect, net.createConnection, dns.lookup, http.request, https.request, global.fetch] = orig;
    }
  });

  for (const t of tmps) fs.rmSync(t, { recursive: true, force: true });
  console.log(`sweep-loop.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runSweepLoopTests };

if (require.main === module) {
  runSweepLoopTests().then((ok) => process.exit(ok ? 0 : 1));
}
