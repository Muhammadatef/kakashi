/**
 * The Sweep loop -- start, next, submit, replan, decide.
 *
 * The loop is driven from outside (the host agent calls `sweep next` and
 * `sweep submit`), but every decision is made here, in deterministic code:
 *
 *   start   OBSERVE + UNDERSTAND TASK + PLAN + POLICY + SHARD + BATCH → run dir
 *   next    issue the next pending batch, building Guardian views first; a
 *           file the Guardian will not release parks the batch (approval/gap)
 *   submit  VERIFY → accept, or REPLAN: reissue, split, or escalate
 *   decide  COMPLETE only when every signal is accounted for; otherwise a
 *           PARTIAL that names its gaps. BLOCKED when policy refused the plan.
 *
 * Budget: a batch is attempted at most `maxIterations` times. After that it is
 * escalated to REQUIRE_APPROVAL and named as a gap -- the loop always ends.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { planSweep, DEFAULT_PACK } = require('./index');
const { RunStore } = require('./run-store');
const { buildViews } = require('./views');
const { verifySubmission, verifyNarrative } = require('./verify');
const { FINDINGS_SCHEMA } = require('./findings-schema');
const { makeBatches } = require('./batch');
const { analyzeSweepTask } = require('./intent');
const { coveragePlanFrom, validateSweepPlan } = require('./policy');
const { loadDbtProject } = require('./dbt');
const audit = require('../guardian/audit');

const DECISIONS = { COMPLETE: 'COMPLETE', PARTIAL: 'PARTIAL', BLOCKED: 'BLOCKED', IN_PROGRESS: 'IN_PROGRESS' };
const EXIT = { COMPLETE: 0, PARTIAL: 1, IN_PROGRESS: 1, BLOCKED: 4, REQUIRE_APPROVAL: 3 };
const ESCALATE_AFTER = 2; // consecutive rejections before a batch is split
const VERSION = require('../../package.json').version;

/** Repo-relative files changed since `ref` (committed + working tree + untracked). */
function changedSince(root, ref) {
  const run = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').map((s) => s.trim()).filter(Boolean);
  const prefix = run(['rev-parse', '--show-prefix'])[0] || '';
  const files = new Set([
    ...run(['diff', '--name-only', `${ref}...HEAD`]),
    ...run(['diff', '--name-only', 'HEAD']),
    ...run(['ls-files', '--others', '--exclude-standard', '--full-name']),
  ]);
  return [...files].filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length)).sort();
}

/** Add dbt-graph neighbours (parents and children of changed models). */
function withDbtNeighbours(root, plan, changed) {
  const dbt = loadDbtProject(root, plan.scope.files, (rel) => fs.readFileSync(path.join(root, rel), 'utf8'));
  if (!dbt || !dbt.models) return changed;
  const out = new Set(changed);
  const relOf = {};
  for (const [name, m] of Object.entries(dbt.models)) relOf[name] = m.rel;
  for (const [name, m] of Object.entries(dbt.models)) {
    const refs = m.refs || [];
    if (out.has(m.rel)) for (const r of refs) if (relOf[r]) out.add(relOf[r]);
    if (refs.some((r) => changed.includes(relOf[r]))) out.add(m.rel);
  }
  // A changed schema file can retag sources: every model is then a neighbour.
  if (changed.some((f) => /\.ya?ml$/.test(f) && /models\//.test(f))) for (const r of Object.values(relOf)) if (r) out.add(r);
  return [...out].sort();
}

function writeAudit(store, decision, auditLog) {
  if (auditLog === false) return { written: false, path: null };
  const m = store.manifest();
  const byStatus = {};
  for (const b of store.batches()) byStatus[b.status] = (byStatus[b.status] || 0) + 1;
  const event = {
    kind: 'sweep',
    timestamp: new Date().toISOString(),
    run_id: store.runId,
    agent: m.agent,
    destination: m.destination,
    policy: m.policy,
    packs: m.packs,
    selectorsHash: m.selectorsHash,
    decision: decision.decision,
    reasonCode: decision.reasonCode,
    signals: decision.signals,
    accounted: decision.accounted,
    gaps: decision.gaps.length,
    batches: byStatus,
    iteration: decision.iteration,
    incremental: !!m.incremental,
  };
  return audit.write(event, auditLog || m.auditLog || undefined);
}

/**
 * Start a run. Returns { store, plan, decision }.
 * @param {object} opts  dir, task, agent, destination, policy, packs, maxIterations,
 *                       approvals, since, tokenBudget, respectGitignore, auditLog, optional
 */
async function startRun(opts) {
  const root = path.resolve(opts.dir);
  const analysis = analyzeSweepTask(opts.task);
  const packs = [...new Set([...analysis.packs, ...(opts.packs || [])])].sort();
  const plan = await planSweep({ ...opts, dir: root, packs });
  const floor = await planSweep({ dir: root, packs: [DEFAULT_PACK], optional: opts.optional });
  const authorized = validateSweepPlan(coveragePlanFrom(floor), coveragePlanFrom(plan));

  const store = RunStore.create(root, `${plan.selectors.hash}|${opts.task || ''}`);
  const notes = [...new Set([...analysis.notes, ...plan.notes])].sort();
  let signals = plan.signals;
  let reused = [];
  let incremental = null;

  if (opts.since) {
    let prior = null;
    try {
      const priors = fs.readdirSync(path.dirname(store.dir)).filter((d) => d.startsWith('sw_') && d !== store.runId).sort();
      for (const d of priors.reverse()) {
        const s = RunStore.open(root, d);
        if (s.manifest().selectorsHash === plan.selectors.hash) { prior = s; break; }
      }
    } catch (_) { prior = null; }
    const changed = withDbtNeighbours(root, plan, changedSince(root, opts.since));
    const changedSet = new Set(changed);
    const priorResults = new Map();
    if (prior) for (const sub of prior.allFindings()) for (const r of sub.results) priorResults.set(r.signal_id, r);
    // Reuse a prior verified result only for an unchanged file's identical signal.
    reused = signals.filter((s) => !changedSet.has(s.file) && priorResults.has(s.id));
    const reusedIds = new Set(reused.map((s) => s.id));
    incremental = { since: opts.since, changedFiles: changed, reused: reused.length, priorRun: prior ? prior.runId : null };
    signals = signals.filter((s) => !reusedIds.has(s.id));
    if (reused.length) {
      store.writeJSON(path.join('findings', 'b_reused.json'), {
        batch_id: 'b_reused',
        results: reused.map((s) => priorResults.get(s.id)),
      });
    }
  }

  const fileBytes = {};
  for (const rel of plan.scope.files) {
    try { fileBytes[rel] = fs.statSync(path.join(root, rel)).size; } catch (_) { fileBytes[rel] = 0; }
  }
  const modelBatchesFrom = new Map(plan.batches.flatMap((b) => b.files.map((f) => [f, b.id])));
  const batches = (opts.since ? makeBatches(signals, {
    fileBytes, tokenBudget: opts.tokenBudget, groupOf: (rel) => modelBatchesFrom.get(rel) || null,
  }) : plan.batches).map((b) => ({ ...b, status: 'pending', attempts: 0, rejections: [], views: {}, approvalClasses: [] }));
  if (reused.length) {
    batches.push({
      id: 'b_reused', signalIds: reused.map((s) => s.id), files: [...new Set(reused.map((s) => s.file))].sort(),
      estTokens: 0, oversized: false, status: 'accepted', attempts: 0, rejections: [], views: {}, approvalClasses: [], reused: true,
    });
  }

  const { _selectors, signals: _s, batches: _b, scope, ...pub } = plan;
  store.writeJSON('manifest.json', {
    run_id: store.runId,
    kakashiVersion: VERSION,
    createdAt: new Date().toISOString(),
    root,
    task: plan.task,
    intents: analysis.intents,
    agent: opts.agent || 'unknown',
    destination: opts.destination || 'external_model',
    policy: opts.policy || 'default',
    approvals: opts.approvals || [],
    packs,
    selectorsHash: plan.selectors.hash,
    maxIterations: opts.maxIterations || 4,
    iteration: 1,
    notes,
    fingerprint: pub.fingerprint,
    coverage: pub.coverage,
    selectors: pub.selectors,
    degradations: pub.degradations,
    filesInScope: scope.files,
    incremental,
    policyCheck: { authorized: authorized.authorized, violations: authorized.violations },
    auditLog: opts.auditLog === false ? false : (opts.auditLog || null),
    decision: null,
  });
  store.writeJSON('selectors.lock.json', _selectors);
  store.writeJSON('signals.json', plan.signals);
  store.saveBatches(authorized.authorized ? batches : []);
  store.appendIteration({
    iteration: 1, stage: 'start', signals: plan.signals.length, batches: batches.length,
    authorized: authorized.authorized, violations: authorized.violations.length, reused: reused.length,
  });

  if (!authorized.authorized) {
    // A rejected plan is never executed: no batches exist to hand out.
    const decision = finalise(store, { reasonCode: 'POLICY_REJECTED_PLAN', blocked: true });
    return { store, plan, decision };
  }
  return { store, plan, decision: decide(store) };
}

/** Repo line counts for edge validation. */
function scopeOf(store) {
  const m = store.manifest();
  const lineCounts = {};
  for (const rel of m.filesInScope) {
    try { lineCounts[rel] = fs.readFileSync(path.join(m.root, rel), 'utf8').split('\n').length; } catch (_) { /* unreadable: not a valid edge target */ }
  }
  return { lineCounts };
}

/**
 * Issue the next batch for a worker.
 * @returns {Promise<object>} worker payload, or { done: true, decision }
 */
async function nextBatch(store, { reissueStale = false } = {}) {
  const m = store.manifest();
  if (m.decision && m.decision.decision === DECISIONS.BLOCKED) return { done: true, decision: m.decision };
  const signals = new Map(store.signals().map((s) => [s.id, s]));
  const selectors = new Map((store.readJSON('selectors.lock.json') || []).map((s) => [s.id, s]));

  for (;;) {
    const batches = store.batches();
    const b = batches.find((x) => x.status === 'pending')
      || (reissueStale ? batches.find((x) => x.status === 'issued') : null);
    if (!b) return { done: !batches.some((x) => x.status === 'issued'), decision: decide(store) };

    const views = await buildViews({
      store, rels: b.files, agent: m.agent, destination: m.destination, policy: m.policy, approvals: m.approvals, task: m.task,
    });
    const refused = Object.entries(views).filter(([, v]) => v.status !== 'ok');
    if (refused.length) {
      const needApproval = refused.filter(([, v]) => v.status === 'requires_approval');
      b.status = needApproval.length === refused.length ? 'requires_approval' : 'blocked';
      b.approvalClasses = [...new Set(needApproval.flatMap(([, v]) => v.approvalsNeeded || []))].sort();
      b.refusedFiles = refused.map(([rel, v]) => ({ file: rel, reasonCode: v.reasonCode || v.decision }));
      store.saveBatches(batches);
      store.appendIteration({ iteration: m.iteration, stage: 'guard', batch: b.id, status: b.status, refused: refused.length });
      continue;
    }

    b.status = 'issued';
    b.attempts += 1;
    b.views = Object.fromEntries(Object.entries(views).map(([rel, v]) => [rel, v.view]));
    store.saveBatches(batches);
    store.appendIteration({ iteration: m.iteration, stage: 'issue', batch: b.id, attempt: b.attempts, signals: b.signalIds.length });
    const pack = m.packs.includes(DEFAULT_PACK) ? DEFAULT_PACK : m.packs[0];
    const instr = path.join(__dirname, 'packs', pack, 'worker-instructions.md');
    return {
      done: false,
      run_id: store.runId,
      batch: { id: b.id, attempt: b.attempts, files: b.files, oversized: b.oversized },
      signals: b.signalIds.map((id) => signals.get(id)),
      views: Object.fromEntries(Object.entries(b.views).map(([rel, v]) => [rel, path.join(store.dir, v)])),
      selectors: [...new Set(b.signalIds.map((id) => signals.get(id).selector_id))].sort()
        .map((id) => ({ id, description: selectors.get(id).description, rationale: selectors.get(id).rationale })),
      previous_rejections: b.rejections,
      findings_schema: FINDINGS_SCHEMA,
      instructions: fs.existsSync(instr) ? fs.readFileSync(instr, 'utf8') : null,
      submit: `kakashi sweep submit ${b.id} <findings.json> --run ${store.runId}`,
    };
  }
}

/**
 * VERIFY a submission and REPLAN on rejection.
 * @param {RunStore} store
 * @param {string} batchId
 * @param {string} raw submission text
 * @returns {{ accepted: boolean, errors: object[], batch: object, decision: object }}
 */
function submit(store, batchId, raw) {
  const m = store.manifest();
  const batches = store.batches();
  const b = batches.find((x) => x.id === batchId);
  let sub = null;
  let parseError = null;
  try { sub = JSON.parse(raw); } catch (e) { parseError = e.message; }
  const result = parseError
    ? { accepted: false, errors: [{ code: 'SCHEMA_INVALID', detail: `not valid JSON: ${parseError}` }] }
    : verifySubmission(sub, raw, b, scopeOf(store));
  // A leak in the input must not reach the run dir or the log: only codes are kept.
  if (!b) return { ...result, batch: null, decision: decide(store) };

  if (result.accepted) {
    store.writeJSON(path.join('findings', `${b.id}.json`), sub);
    b.status = 'accepted';
  } else {
    b.rejections.push({ iteration: m.iteration, codes: [...new Set(result.errors.map((e) => e.code))].sort() });
    replan(b, batches, m);
  }
  store.saveBatches(batches);
  store.appendIteration({
    iteration: m.iteration, stage: 'verify', batch: b.id, accepted: result.accepted,
    codes: [...new Set(result.errors.map((e) => e.code))].sort(), status: b.status,
  });
  return { ...result, batch: { id: b.id, status: b.status, attempts: b.attempts }, decision: decide(store) };
}

/**
 * REPLAN one rejected batch in place:
 *   - budget exhausted          → requires_approval (escalated, named gap)
 *   - repeated rejection, >1 signal → split into two halves (fresh attempts)
 *   - otherwise                 → back to pending
 */
function replan(b, batches, m) {
  const budget = m.maxIterations || 4;
  if (b.attempts >= budget) {
    b.status = 'requires_approval';
    b.escalated = 'MAX_ITERATIONS_EXHAUSTED';
    return;
  }
  if (b.rejections.length >= ESCALATE_AFTER && b.signalIds.length > 1) {
    const mid = Math.ceil(b.signalIds.length / 2);
    const signalsById = new Map();
    for (const id of b.signalIds) signalsById.set(id, true);
    const halves = [b.signalIds.slice(0, mid), b.signalIds.slice(mid)];
    b.status = 'split';
    const idx = batches.indexOf(b);
    const children = halves.map((ids, i) => ({
      id: `${b.id}_${i + 1}`.slice(0, 60),
      signalIds: ids,
      files: b.files,
      estTokens: b.estTokens,
      oversized: b.oversized,
      status: 'pending',
      // Children inherit the parent's attempts so a split never resets the budget.
      attempts: b.attempts,
      rejections: [],
      views: {},
      approvalClasses: [],
      parent: b.id,
    }));
    batches.splice(idx + 1, 0, ...children);
    return;
  }
  b.status = 'pending';
}

/**
 * Compute the decision from the run state. Value-free.
 * @returns {object} Decision
 */
function decide(store) {
  const m = store.manifest();
  const batches = store.batches().filter((b) => b.status !== 'split');
  const total = store.signals().length;
  const accountedIds = new Set();
  for (const b of batches) if (b.status === 'accepted') for (const id of b.signalIds) accountedIds.add(id);
  const gaps = [];
  for (const b of batches) {
    if (b.status === 'accepted') continue;
    if (b.status === 'requires_approval') {
      gaps.push({ type: 'approval', id: b.id, reason: b.escalated || `human approval needed for ${b.approvalClasses.join(', ') || 'release'}`, files: b.refusedFiles ? b.refusedFiles.map((f) => f.file) : b.files });
    } else if (b.status === 'blocked') {
      gaps.push({ type: 'batch', id: b.id, reason: 'Guardian refused a file', files: (b.refusedFiles || []).map((f) => f.file) });
    } else if (b.mapSkipped) {
      gaps.push({ type: 'map_skipped', id: b.id, reason: 'no worker judged this batch', files: b.files });
    } else {
      gaps.push({ type: 'batch', id: b.id, reason: `batch is ${b.status}`, files: b.files });
    }
  }
  const cov = m.coverage || {};
  for (const e of cov.shardErrors || []) gaps.push({ type: 'selector', id: e.selector_id, reason: 'selector failed on a file', files: [e.file] });
  for (const f of cov.filesUnreadable || []) gaps.push({ type: 'file', id: f, reason: 'file could not be read' });

  const pending = batches.some((b) => b.status === 'pending' || b.status === 'issued') && !batches.some((b) => b.mapSkipped);
  let decision;
  let reasonCode;
  if (m.policyCheck && !m.policyCheck.authorized) {
    decision = DECISIONS.BLOCKED; reasonCode = 'POLICY_REJECTED_PLAN';
  } else if (gaps.length === 0 && accountedIds.size === total) {
    decision = DECISIONS.COMPLETE; reasonCode = total === 0 ? 'NO_SIGNALS' : 'ALL_SIGNALS_ACCOUNTED';
  } else if (pending) {
    decision = DECISIONS.IN_PROGRESS; reasonCode = 'MAP_IN_PROGRESS';
  } else {
    decision = DECISIONS.PARTIAL;
    reasonCode = gaps.length && gaps.every((g) => g.type === 'approval') ? 'HUMAN_APPROVAL_REQUIRED'
      : gaps.some((g) => g.type === 'map_skipped') ? 'MAP_SKIPPED' : 'COVERAGE_GAPS';
  }
  return {
    decision, reasonCode, gaps, signals: total, accounted: accountedIds.size,
    accountedPct: total ? Math.round((accountedIds.size / total) * 1000) / 10 : 100,
    iteration: Math.max(1, ...batches.map((b) => b.attempts || 0)),
  };
}

/**
 * Close the run: anything still pending/issued becomes a named map_skipped gap,
 * the decision is written to the manifest, and the audit event is appended once.
 */
function finalise(store, { reasonCode, blocked = false } = {}) {
  const batches = store.batches();
  let changed = false;
  for (const b of batches) {
    if (b.status === 'pending' || b.status === 'issued') { b.mapSkipped = true; changed = true; }
  }
  if (changed) store.saveBatches(batches);
  const d = decide(store);
  if (blocked) { d.decision = DECISIONS.BLOCKED; d.reasonCode = reasonCode || d.reasonCode; }
  const m = store.manifest();
  const already = m.decision && m.decision.final;
  store.updateManifest({ decision: { ...d, final: true } });
  if (!already) {
    store.appendIteration({ iteration: d.iteration, stage: 'decision', decision: d.decision, reasonCode: d.reasonCode, gaps: d.gaps.length });
    writeAudit(store, d, m.auditLog === false ? false : m.auditLog);
  }
  return d;
}

/** Narrative from the host agent: verified value-free, then stored. */
function submitNarrative(store, raw) {
  let narr = null;
  try { narr = JSON.parse(raw); } catch (e) { return { accepted: false, errors: [{ code: 'SCHEMA_INVALID', detail: e.message }] }; }
  const res = verifyNarrative(narr, raw);
  if (res.accepted) store.writeJSON('narrative.json', narr);
  return res;
}

function exitCodeFor(decision) {
  if (decision.decision === DECISIONS.PARTIAL && decision.reasonCode === 'HUMAN_APPROVAL_REQUIRED') return EXIT.REQUIRE_APPROVAL;
  return EXIT[decision.decision] === undefined ? 2 : EXIT[decision.decision];
}

module.exports = {
  startRun, nextBatch, submit, decide, finalise, submitNarrative, exitCodeFor, replan, changedSince, DECISIONS, EXIT,
};
