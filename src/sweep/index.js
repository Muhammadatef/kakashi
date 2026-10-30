/**
 * Kakashi Sweep -- privacy-safe Agentic MapReduce for whole-repository
 * data-flow audits.
 *
 *   GOAL -> OBSERVE -> UNDERSTAND TASK -> PLAN -> POLICY -> ACT (SHARD, BATCH,
 *        GUARD) -> MAP (host agent) -> VERIFY -> REPLAN -> REDUCE -> DECISION
 *
 * Same contract as the Guardian (src/guardian/index.js): every stage that
 * decides anything is deterministic code in this package. The host LLM is a
 * worker that receives bounded batches of guarded code and returns structured
 * judgments; it never chooses what is covered and never sees raw values.
 *
 * Completeness is by construction: SHARD runs every selector over every in-scope
 * file, so the work queue is finite and known before any worker starts, and the
 * run can only be COMPLETE when every signal in it has been accounted for.
 *
 * This module currently implements the deterministic front half (M1): OBSERVE,
 * pack selection, SHARD and BATCH, exposed as `planSweep()` and `--dry-run`.
 */

const path = require('path');
const fs = require('fs');
const { listFiles, readFiles, fingerprintFiles } = require('./fingerprint');
const { loadSelectors } = require('./selectors/loader');
const { shard } = require('./shard');
const { makeBatches, DEFAULTS: BATCH_DEFAULTS } = require('./batch');
const { OptionalRegistry } = require('./optional');
const { loadDbtProject } = require('./dbt');

const DEFAULT_PACK = 'pii_flow_audit';

/**
 * Plan a sweep: everything up to and including BATCH. Pure with respect to the
 * repository contents -- no run directory is written.
 *
 * @param {object} opts
 * @param {string} opts.dir
 * @param {string} [opts.task]
 * @param {string[]} [opts.packs]
 * @param {boolean} [opts.respectGitignore=true]
 * @param {number} [opts.tokenBudget]
 * @param {number} [opts.maxSignals]
 * @param {OptionalRegistry} [opts.optional]
 * @returns {Promise<object>} value-free plan
 */
async function planSweep(opts = {}) {
  const root = path.resolve(opts.dir || '.');
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`Not a directory: ${opts.dir}`);
  const optional = opts.optional || new OptionalRegistry();
  const notes = [];

  // --- OBSERVE -------------------------------------------------------------
  const listing = await listFiles(root, { respectGitignore: opts.respectGitignore !== false, extraIgnore: opts.extraIgnore || [] });
  const files = await readFiles(root, listing.files);
  const fingerprint = fingerprintFiles(root, files);
  const dbt = loadDbtProject(root, listing.files, (rel) => {
    const f = files.find((x) => x.rel === rel);
    return f ? f.text : fs.readFileSync(path.join(root, rel), 'utf8');
  });

  // --- UNDERSTAND TASK (M3 extends this with the intent matcher) -----------
  // No task, or one we do not understand, falls back to the broadest pack.
  const packs = opts.packs && opts.packs.length ? [...opts.packs] : [DEFAULT_PACK];
  if (!opts.task || !String(opts.task).trim()) notes.push('TASK_NOT_STATED');

  // --- PLAN: selectors (built-in floor + repo .kakashi/selectors) -----------
  const loaded = loadSelectors({ packs, repoRoot: root });
  if (loaded.errors.length) {
    const err = new Error(`Selector errors:\n  ${loaded.errors.join('\n  ')}`);
    err.selectorErrors = loaded.errors;
    throw err;
  }

  // --- ACT: SHARD ----------------------------------------------------------
  const ctx = { optional, project: { root, dbt } };
  const { signals, bySelector, errors: shardErrors } = await shard({
    files: files.filter((f) => !f.error),
    selectors: loaded.selectors,
    ctx,
  });

  // --- ACT: BATCH ----------------------------------------------------------
  const fileBytes = Object.fromEntries(files.map((f) => [f.rel, f.bytes]));
  const modelByRel = {};
  for (const [name, m] of Object.entries((dbt && dbt.models) || {})) if (m.rel) modelByRel[m.rel] = `dbt:${name}`;
  const batches = makeBatches(signals, {
    fileBytes,
    groupOf: (rel) => modelByRel[rel] || null,
    tokenBudget: opts.tokenBudget,
    maxSignals: opts.maxSignals,
  });

  const filesWithSignals = [...new Set(signals.map((s) => s.file))].sort();
  return {
    root,
    task: opts.task || null,
    packs,
    notes,
    fingerprint,
    // The exact file list and ignore rules this plan covers. POLICY compares
    // these against the built-in floor (assertCoverageNonWeakening).
    scope: { files: listing.files, ignore: listing.ignore },
    coverage: {
      filesInScope: listing.files.length,
      filesUnreadable: files.filter((f) => f.error).map((f) => f.rel),
      skippedByIgnoreFile: listing.skippedByIgnoreFile,
      filesWithSignals: filesWithSignals.length,
      signals: signals.length,
      bySelector,
      shardErrors,
    },
    selectors: { hash: loaded.hash, count: loaded.selectors.length, origins: loaded.origins, files: loaded.files },
    degradations: optional.list(),
    dbt: dbt ? { manifestUsed: !!dbt.manifestUsed, models: Object.keys(dbt.models || {}).length, errors: dbt.errors || [] } : null,
    batching: {
      tokenBudget: opts.tokenBudget || BATCH_DEFAULTS.tokenBudget,
      maxSignals: opts.maxSignals || BATCH_DEFAULTS.maxSignals,
      count: batches.length,
    },
    signals,
    batches,
    _selectors: loaded.selectors,
  };
}

module.exports = { planSweep, DEFAULT_PACK };
