/**
 * The findings schema -- what a Map worker must return for its batch.
 *
 * Hand-written validator (no JSON-schema dependency). Strict on purpose: an
 * unknown field is an error, because an extra free-text field is exactly where
 * a worker would paste a value it should not have. Every string is length-
 * capped for the same reason.
 *
 * Shape (see docs/SWEEP.md):
 *   { batch_id, results: [
 *       { signal_id, disposition: 'FINDING', severity, confidence, edge,
 *         sink_type, preconditions[], remediation }
 *     | { signal_id, disposition: 'NOT_AN_ISSUE', reason } ] }
 */

const SEVERITIES = ['P0', 'P1', 'P2'];
const OPERATIONS = ['read', 'transform', 'join', 'export', 'log', 'expose'];
const SINK_TYPES = ['none', 'file', 'object_storage', 'http', 'email', 'log', 'stdout', 'exposure', 'database'];
const EXTERNALS = ['s3', 'gcs', 'azure_blob', 'sftp', 'http', 'email', 'log', 'stdout', 'exposure', 'database', 'file'];
const MAX_STR = 500;
const MAX_PRECONDITIONS = 10;

/** The schema as data, handed to workers by `sweep next`. */
const FINDINGS_SCHEMA = {
  batch_id: 'string (the batch you were given)',
  results: [
    {
      signal_id: 'string (one entry per signal in the batch, exactly once)',
      disposition: 'FINDING',
      severity: SEVERITIES.join('|'),
      confidence: 'number 0..1',
      edge: {
        from: { file: 'repo-relative path', line: 'integer' },
        to: `{ file, line } | { external: ${EXTERNALS.join('|')} }`,
        operation: OPERATIONS.join('|'),
      },
      sink_type: SINK_TYPES.join('|'),
      preconditions: [`string ≤ ${MAX_STR} chars (max ${MAX_PRECONDITIONS})`],
      remediation: `string ≤ ${MAX_STR} chars`,
    },
    { signal_id: 'string', disposition: 'NOT_AN_ISSUE', reason: `string ≤ ${MAX_STR} chars` },
  ],
  rules: [
    'Never include data values, secrets or code literals — describe them (e.g. "customer email column").',
    'Every signal in the batch must appear exactly once.',
    'Edges must reference files in the repository and lines that exist.',
  ],
};

function err(code, detail) { return { code, detail }; }

function isStr(v, { max = MAX_STR, required = true } = {}) {
  if (v === undefined || v === null) return !required;
  return typeof v === 'string' && v.length <= max && (!required || v.trim() !== '');
}

function onlyKeys(obj, keys, where, errors) {
  for (const k of Object.keys(obj)) if (!keys.includes(k)) errors.push(err('SCHEMA_INVALID', `${where}: unknown field "${k}"`));
}

function validateEndpoint(p, where, errors, { allowExternal }) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) { errors.push(err('SCHEMA_INVALID', `${where} must be an object`)); return; }
  if (allowExternal && p.external !== undefined) {
    onlyKeys(p, ['external'], where, errors);
    if (!EXTERNALS.includes(p.external)) errors.push(err('SCHEMA_INVALID', `${where}.external must be one of ${EXTERNALS.join('|')}`));
    return;
  }
  onlyKeys(p, ['file', 'line'], where, errors);
  if (!isStr(p.file)) errors.push(err('SCHEMA_INVALID', `${where}.file is required`));
  if (!Number.isInteger(p.line) || p.line < 1) errors.push(err('SCHEMA_INVALID', `${where}.line must be a positive integer`));
}

/**
 * Structural validation only (no repo or engine access -- see verify.js).
 * @param {object} sub
 * @returns {{code,detail}[]}
 */
function validateSubmissionShape(sub) {
  const errors = [];
  if (!sub || typeof sub !== 'object' || Array.isArray(sub)) return [err('SCHEMA_INVALID', 'submission must be an object')];
  onlyKeys(sub, ['batch_id', 'results'], 'submission', errors);
  if (!isStr(sub.batch_id, { max: 64 })) errors.push(err('SCHEMA_INVALID', 'batch_id is required'));
  if (!Array.isArray(sub.results)) return [...errors, err('SCHEMA_INVALID', 'results must be a list')];
  sub.results.forEach((r, i) => {
    const w = `results[${i}]`;
    if (!r || typeof r !== 'object' || Array.isArray(r)) { errors.push(err('SCHEMA_INVALID', `${w} must be an object`)); return; }
    if (!isStr(r.signal_id, { max: 64 })) errors.push(err('SCHEMA_INVALID', `${w}.signal_id is required`));
    if (r.disposition === 'NOT_AN_ISSUE') {
      onlyKeys(r, ['signal_id', 'disposition', 'reason'], w, errors);
      if (!isStr(r.reason)) errors.push(err('SCHEMA_INVALID', `${w}.reason is required (≤ ${MAX_STR} chars)`));
      return;
    }
    if (r.disposition !== 'FINDING') { errors.push(err('SCHEMA_INVALID', `${w}.disposition must be FINDING or NOT_AN_ISSUE`)); return; }
    onlyKeys(r, ['signal_id', 'disposition', 'severity', 'confidence', 'edge', 'sink_type', 'preconditions', 'remediation'], w, errors);
    if (!SEVERITIES.includes(r.severity)) errors.push(err('SCHEMA_INVALID', `${w}.severity must be ${SEVERITIES.join('|')}`));
    if (typeof r.confidence !== 'number' || !(r.confidence >= 0 && r.confidence <= 1)) errors.push(err('SCHEMA_INVALID', `${w}.confidence must be 0..1`));
    if (!SINK_TYPES.includes(r.sink_type)) errors.push(err('SCHEMA_INVALID', `${w}.sink_type must be one of ${SINK_TYPES.join('|')}`));
    if (!isStr(r.remediation)) errors.push(err('SCHEMA_INVALID', `${w}.remediation is required (≤ ${MAX_STR} chars)`));
    if (!Array.isArray(r.preconditions) || r.preconditions.length > MAX_PRECONDITIONS || !r.preconditions.every((p) => isStr(p))) {
      errors.push(err('SCHEMA_INVALID', `${w}.preconditions must be a list of ≤ ${MAX_PRECONDITIONS} strings`));
    }
    const e = r.edge;
    if (!e || typeof e !== 'object' || Array.isArray(e)) { errors.push(err('SCHEMA_INVALID', `${w}.edge is required`)); return; }
    onlyKeys(e, ['from', 'to', 'operation'], `${w}.edge`, errors);
    if (!OPERATIONS.includes(e.operation)) errors.push(err('SCHEMA_INVALID', `${w}.edge.operation must be ${OPERATIONS.join('|')}`));
    validateEndpoint(e.from, `${w}.edge.from`, errors, { allowExternal: false });
    validateEndpoint(e.to, `${w}.edge.to`, errors, { allowExternal: true });
  });
  return errors;
}

module.exports = {
  validateSubmissionShape, FINDINGS_SCHEMA, SEVERITIES, OPERATIONS, SINK_TYPES, EXTERNALS, MAX_STR,
};
