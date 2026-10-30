/**
 * Sweep REDUCE: merge accepted worker submissions into deduped findings.
 *
 * Why: several selectors routinely fire on the same line (a single UNLOAD
 * statement is an export, a financial read and a name read at once). Workers
 * answer per signal, but a reviewer wants one finding per flow, so results are
 * keyed by (file, line, edge.operation, edge.to) and their evidence merged.
 * Severity takes the most severe, confidence the max. Only ids, line numbers,
 * classes and worker prose (already VERIFY-checked to be value-free) flow
 * through here -- never file contents.
 */

const SEV_RANK = { P0: 0, P1: 1, P2: 2 };

function maxSeverity(list) {
  let best = null;
  for (const s of list) if (s in SEV_RANK && (best === null || SEV_RANK[s] < SEV_RANK[best])) best = s;
  return best;
}

function toKey(edge) {
  if (!edge || !edge.to) return 'none';
  if (edge.to.external) return `external:${edge.to.external}`;
  return `${edge.to.file}:${edge.to.line}`;
}

function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

/**
 * @param {object[]} signals
 * @param {{batch_id: string, results: object[]}[]} submissions
 * @returns {{findings: object[], dismissed: object, accounted: Set<string>}}
 */
function mergeFindings(signals, submissions) {
  const sigById = new Map(signals.map((s) => [s.id, s]));
  const byKey = new Map();
  const dismissed = { count: 0, bySelector: {} };
  const accounted = new Set();
  const subs = [...(submissions || [])].sort((a, b) => cmp(String(a.batch_id), String(b.batch_id)));
  for (const sub of subs) {
    for (const r of (sub && sub.results) || []) {
      const sig = sigById.get(r.signal_id);
      if (!sig || accounted.has(r.signal_id)) continue;
      accounted.add(r.signal_id);
      if (r.disposition !== 'FINDING') {
        dismissed.count++;
        dismissed.bySelector[sig.selector_id] = (dismissed.bySelector[sig.selector_id] || 0) + 1;
        continue;
      }
      const line = sig.span ? sig.span.startLine : 1;
      const op = (r.edge && r.edge.operation) || sig.evidence_kind || 'read';
      const key = `${sig.file}:${line}|${op}|${toKey(r.edge)}`;
      let f = byKey.get(key);
      if (!f) {
        f = {
          key, signal_ids: [], file: sig.file, line, selector_ids: [], classes: new Set(),
          severities: [], confidence: 0, edge: r.edge || null, sink_type: r.sink_type || 'none',
          preconditions: new Set(), remediations: new Set(),
        };
        byKey.set(key, f);
      }
      f.signal_ids.push(sig.id);
      if (!f.selector_ids.includes(sig.selector_id)) f.selector_ids.push(sig.selector_id);
      if (sig.sensitivity_class) f.classes.add(sig.sensitivity_class);
      if (r.severity) f.severities.push(r.severity);
      if (typeof r.confidence === 'number') f.confidence = Math.max(f.confidence, r.confidence);
      if (f.sink_type === 'none' && r.sink_type) f.sink_type = r.sink_type;
      for (const p of r.preconditions || []) f.preconditions.add(String(p));
      if (r.remediation) f.remediations.add(String(r.remediation));
    }
  }
  const findings = [...byKey.values()].map((f) => {
    const classes = [...f.classes].sort();
    return {
      key: f.key,
      signal_ids: f.signal_ids.sort(),
      file: f.file,
      line: f.line,
      selector_ids: f.selector_ids.sort(),
      sensitivity_class: classes[0] || null,
      sensitivity_classes: classes,
      severity: maxSeverity(f.severities) || 'P2',
      confidence: f.confidence,
      edge: f.edge,
      sink_type: f.sink_type,
      preconditions: [...f.preconditions].sort(),
      remediation: [...f.remediations].sort().join(' '),
      pdpl: [],
      owners: [],
    };
  }).sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || cmp(a.file, b.file) || a.line - b.line || cmp(a.key, b.key));
  dismissed.bySelector = Object.fromEntries(Object.entries(dismissed.bySelector).sort(([a], [b]) => cmp(a, b)));
  return { findings, dismissed, accounted };
}

module.exports = { mergeFindings, maxSeverity, SEV_RANK, cmp };
