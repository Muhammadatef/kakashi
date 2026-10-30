/**
 * VERIFY -- the deterministic gate every worker submission passes through.
 *
 * A worker is an LLM taking orders. Its output is checked, never trusted:
 *
 *   SCHEMA_INVALID     shape, enums, lengths, unknown fields
 *   BATCH_NOT_ISSUED   submitting for a batch that is not out for work
 *   SIGNAL_UNKNOWN     a signal id that is not in this batch
 *   SIGNAL_DUPLICATE   a signal accounted for twice
 *   SIGNAL_MISSING     a signal in the batch not accounted for -- this is what
 *                      makes "the worker felt done" impossible
 *   VALUE_LEAK         the engine detects a sensitive value anywhere in the JSON
 *   EDGE_INVALID       an edge endpoint outside the repo scope or past EOF
 *
 * A rejected submission is not partially accepted. The batch goes back to the
 * queue and REPLAN decides what happens to it.
 */

const { maskText } = require('../engine/masker');
const { validateSubmissionShape } = require('./findings-schema');

/**
 * Engine re-scan of arbitrary JSON. Returns only pattern ids -- the matched
 * value is dropped immediately, so the rejection itself cannot leak it.
 * @param {string} text
 * @returns {string[]} distinct pattern ids detected
 */
function detectValues(text) {
  return [...new Set(maskText(text).findings.map((f) => f.id))].sort();
}

/**
 * @param {object} sub         parsed submission
 * @param {string} raw         the submission exactly as received (re-scanned verbatim)
 * @param {object} batch       Batch from batches.json
 * @param {object} scope       { lineCounts: {rel: n} }  repo files in scope
 * @param {object} [opts]
 * @param {string[]} [opts.ignorePatternIds]  ids the scan may ignore (none by default)
 * @returns {{ accepted: boolean, errors: {code,detail}[] }}
 */
function verifySubmission(sub, raw, batch, scope, opts = {}) {
  const errors = [];

  // Value scan FIRST and over the raw bytes: a leak is a leak even if the rest
  // of the submission is malformed.
  const leaked = detectValues(raw).filter((id) => !(opts.ignorePatternIds || []).includes(id));
  if (leaked.length) errors.push({ code: 'VALUE_LEAK', detail: `submission contains detectable values (${leaked.join(', ')}) — describe data, never quote it` });

  errors.push(...validateSubmissionShape(sub));
  if (!batch) {
    errors.push({ code: 'BATCH_NOT_ISSUED', detail: 'unknown batch id' });
    return { accepted: false, errors };
  }
  if (sub && sub.batch_id !== batch.id) errors.push({ code: 'BATCH_NOT_ISSUED', detail: `batch_id ${sub.batch_id} does not match ${batch.id}` });
  if (batch.status !== 'issued') errors.push({ code: 'BATCH_NOT_ISSUED', detail: `batch ${batch.id} is ${batch.status}, not issued` });

  if (sub && Array.isArray(sub.results)) {
    const expected = new Set(batch.signalIds);
    const seen = new Set();
    for (const r of sub.results) {
      if (!r || typeof r.signal_id !== 'string') continue;
      if (!expected.has(r.signal_id)) errors.push({ code: 'SIGNAL_UNKNOWN', detail: `${r.signal_id} is not in batch ${batch.id}` });
      else if (seen.has(r.signal_id)) errors.push({ code: 'SIGNAL_DUPLICATE', detail: `${r.signal_id} accounted for more than once` });
      seen.add(r.signal_id);

      if (r.disposition === 'FINDING' && r.edge) {
        for (const [end, p] of [['from', r.edge.from], ['to', r.edge.to]]) {
          if (!p || p.external !== undefined || typeof p.file !== 'string') continue;
          const n = scope.lineCounts[p.file];
          if (n === undefined) errors.push({ code: 'EDGE_INVALID', detail: `${r.signal_id}: edge.${end}.file is not a file in scope` });
          else if (Number.isInteger(p.line) && p.line > n) errors.push({ code: 'EDGE_INVALID', detail: `${r.signal_id}: edge.${end}.line is past end of file` });
        }
      }
    }
    const missing = batch.signalIds.filter((id) => !seen.has(id));
    if (missing.length) errors.push({ code: 'SIGNAL_MISSING', detail: `${missing.length} signal(s) not accounted for: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ', …' : ''}` });
  }

  return { accepted: errors.length === 0, errors };
}

/**
 * narrative.json: { chains: {id: text}, remediation: {key: text} }.
 * Same value re-scan; shape is small and strict.
 */
function verifyNarrative(narr, raw) {
  const errors = [];
  const leaked = detectValues(raw);
  if (leaked.length) errors.push({ code: 'VALUE_LEAK', detail: `narrative contains detectable values (${leaked.join(', ')})` });
  if (!narr || typeof narr !== 'object' || Array.isArray(narr)) return { accepted: false, errors: [...errors, { code: 'SCHEMA_INVALID', detail: 'narrative must be an object' }] };
  for (const k of Object.keys(narr)) {
    if (!['chains', 'remediation'].includes(k)) errors.push({ code: 'SCHEMA_INVALID', detail: `unknown field "${k}"` });
    else if (!narr[k] || typeof narr[k] !== 'object' || Object.values(narr[k]).some((v) => typeof v !== 'string' || v.length > 2000)) {
      errors.push({ code: 'SCHEMA_INVALID', detail: `${k} must map ids to strings ≤ 2000 chars` });
    }
  }
  return { accepted: errors.length === 0, errors };
}

module.exports = { verifySubmission, verifyNarrative, detectValues };
