/**
 * Guarded views -- the ONLY file content a Map worker ever reads.
 *
 * Each file a batch references is run through the Guardian with the worker's
 * destination (external_model for a hosted agent, local_model for an offline
 * one). The Guardian decides exactly as it would for `kakashi guard`:
 *
 *   ALLOW / ALLOW_WITH_TRANSFORMATION  → the released artifact becomes the view
 *   REQUIRE_APPROVAL                    → no view; the batch waits for a human
 *   BLOCK                               → no view; the batch is a named gap
 *
 * Sweep never "helps" the Guardian with a weaker mask, and never substitutes
 * the original for a refused file.
 *
 * Views must be line-aligned with the original so signal spans and edge lines
 * mean the same thing in both. A view whose line count differs (a multi-line
 * value collapsed into one token) is rewritten with padding lines immediately
 * after the token; if that still cannot align, the view is refused.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { runGuardian, DECISIONS } = require('../guardian');

function lineCount(text) { return text.split('\n').length; }

/**
 * Re-align a masked text to the original's line count by re-inserting the
 * newlines a multi-line value used to span. Works because the masker only ever
 * replaces values in place: walk both texts line by line and, where the masked
 * text runs short, pad with empty lines at the point of divergence.
 */
function alignLines(original, masked) {
  const o = original.split('\n');
  const m = masked.split('\n');
  if (m.length === o.length) return masked;
  if (m.length > o.length) return null;
  const out = [];
  let j = 0;
  for (let i = 0; i < m.length; i++) {
    out.push(m[i]);
    // Find where the next masked line resumes in the original.
    const next = m[i + 1];
    let k = j + 1;
    if (next !== undefined && o[k] !== next) {
      const found = o.indexOf(next, k);
      if (found > k) {
        for (let p = k; p < found; p++) out.push('');
        k = found;
      }
    }
    j = k;
  }
  return out.length === o.length ? out.join('\n') : null;
}

/**
 * Build guarded views for `rels` into the run store.
 * @param {object} opts
 * @param {import('./run-store').RunStore} opts.store
 * @param {string[]} opts.rels
 * @param {string} opts.agent
 * @param {string} opts.destination
 * @param {string} [opts.policy]
 * @param {string[]} [opts.approvals]
 * @param {string} [opts.task]
 * @returns {Promise<Object<string, { status: 'ok'|'requires_approval'|'blocked'|'error', view?: string, decision?: string, approvalsNeeded?: string[], reasonCode?: string }>>}
 */
async function buildViews({ store, rels, agent, destination, policy = 'default', approvals = [], task }) {
  const out = {};
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'kakashi-sweep-view-'));
  try {
    for (const rel of rels) {
      const viewAbs = store.viewPath(rel);
      const viewRel = path.relative(store.dir, viewAbs).split(path.sep).join('/');
      if (fs.existsSync(viewAbs)) { out[rel] = { status: 'ok', view: viewRel }; continue; }
      const src = path.join(store.root, rel);
      try {
        const tmpOut = path.join(scratch, `${Object.keys(out).length}_${path.basename(rel)}`);
        const res = await runGuardian({
          resource: src,
          agent,
          task: task || 'review code for data-flow audit',
          destination,
          policy,
          approvals,
          output: tmpOut,
          auditLog: false,
        });
        if (res.decision === DECISIONS.REQUIRE_APPROVAL) {
          out[rel] = { status: 'requires_approval', decision: res.decision, reasonCode: res.reasonCode, approvalsNeeded: res.approvalsNeeded };
          continue;
        }
        if (res.decision === DECISIONS.BLOCK || !res.releasePath) {
          out[rel] = { status: 'blocked', decision: res.decision, reasonCode: res.reasonCode };
          continue;
        }
        const original = fs.readFileSync(src, 'utf8');
        const released = fs.readFileSync(res.releasePath, 'utf8');
        const aligned = alignLines(original, released);
        if (aligned === null) {
          out[rel] = { status: 'blocked', decision: res.decision, reasonCode: 'VIEW_NOT_LINE_ALIGNED' };
          continue;
        }
        fs.mkdirSync(path.dirname(viewAbs), { recursive: true });
        fs.writeFileSync(viewAbs, aligned);
        out[rel] = { status: 'ok', view: viewRel, decision: res.decision };
      } catch (err) {
        out[rel] = { status: 'error', reasonCode: 'GUARDIAN_ERROR', error: err.message };
      }
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  return out;
}

module.exports = { buildViews, alignLines, lineCount };
