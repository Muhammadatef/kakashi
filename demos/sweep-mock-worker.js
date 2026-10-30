#!/usr/bin/env node
/**
 * Deterministic mock Map worker for Kakashi Sweep.
 *
 * Exercises the full loop -- start → next → submit → verify → replan → reduce
 * → report -- with NO language model. Judgments are a fixed function of each
 * signal (evidence kind, selector, file), so the same repo always yields the
 * same findings. Used by the test suite and by `demos/sweep-bench`.
 *
 *   node demos/sweep-mock-worker.js [repo] [--run <id>] [--omit-first]
 *
 * --omit-first drops one signal from each batch's first submission, to show
 * VERIFY rejecting an incomplete batch and REPLAN reissuing it.
 */

const fs = require('fs');
const path = require('path');
const { RunStore } = require('../src/sweep/run-store');
const { nextBatch, submit, finalise } = require('../src/sweep/loop');

/** Files a careful worker would clear (hashed IDs, aggregates, count-only code). */
const DECOY_HINT = /(hash|revenue|count_rows|rollup|summary)/i;

function externalFor(sig) {
  const s = sig.selector_id;
  if (/smtp|email/.test(s)) return 'email';
  if (/http|webhook/.test(s)) return 'http';
  if (/log/.test(s)) return 'log';
  if (/exposure/.test(s)) return 'exposure';
  return 's3';
}

/** One deterministic judgment per signal. Never includes a value. */
function judge(sig) {
  if (DECOY_HINT.test(sig.file)) {
    return { signal_id: sig.id, disposition: 'NOT_AN_ISSUE', reason: 'aggregated or hashed data only; no personal field leaves this step' };
  }
  const from = { file: sig.file, line: sig.span.startLine };
  const op = sig.evidence_kind === 'value' ? 'read' : sig.evidence_kind;
  const external = ['export', 'log', 'expose'].includes(op);
  const severity = op === 'export' || op === 'expose' ? 'P0' : op === 'log' ? 'P1' : 'P2';
  const sinkType = { export: 'object_storage', log: 'log', expose: 'exposure' }[op] || 'none';
  const ext = externalFor(sig);
  return {
    signal_id: sig.id,
    disposition: 'FINDING',
    severity,
    confidence: 0.8,
    edge: { from, to: external ? { external: op === 'expose' ? 'exposure' : ext } : from, operation: op },
    sink_type: ext === 'email' && external ? 'email' : ext === 'http' && external ? 'http' : sinkType,
    preconditions: ['the job runs on production data'],
    remediation: external
      ? 'mask or tokenise personal columns before they leave the warehouse, or drop them from the output'
      : 'limit this step to the personal columns the downstream use actually needs',
  };
}

/**
 * @param {string} root
 * @param {object} [opts]
 * @param {string} [opts.runId]
 * @param {boolean} [opts.omitFirst]
 * @param {number} [opts.maxRounds=200]
 * @returns {Promise<{ store, decision, submissions: number, rejections: number }>}
 */
async function runMockWorker(root, opts = {}) {
  const store = RunStore.open(path.resolve(root), opts.runId);
  let submissions = 0;
  let rejections = 0;
  const firstSeen = new Set();
  for (let round = 0; round < (opts.maxRounds || 200); round++) {
    const job = await nextBatch(store);
    if (job.done || !job.batch) break;
    let results = job.signals.map(judge);
    if (opts.omitFirst && !firstSeen.has(job.batch.id) && results.length > 1) results = results.slice(1);
    firstSeen.add(job.batch.id);
    const res = submit(store, job.batch.id, JSON.stringify({ batch_id: job.batch.id, results }));
    submissions++;
    if (!res.accepted) rejections++;
  }
  const decision = finalise(store);
  return { store, decision, submissions, rejections };
}

module.exports = { runMockWorker, judge };

if (require.main === module) {
  const args = process.argv.slice(2);
  const root = args.find((a) => !a.startsWith('--')) || path.join(__dirname, 'sweep-bench');
  const runIdx = args.indexOf('--run');
  runMockWorker(root, { runId: runIdx > -1 ? args[runIdx + 1] : undefined, omitFirst: args.includes('--omit-first') })
    .then(({ store, decision, submissions, rejections }) => {
      process.stdout.write(`${JSON.stringify({ run_id: store.runId, submissions, rejections, decision }, null, 2)}\n`);
      if (!fs.existsSync(store.dir)) process.exitCode = 2;
    })
    .catch((err) => { console.error(err.message); process.exitCode = 2; });
}
