/**
 * Sweep REDUCE: chains = PII source → … → external sink / exposure.
 *
 * Why: the report's headline is "which personal data leaves, and how".
 * For every start node (a PII-tagged dbt source, or a node a PII-class finding
 * reads from) a BFS with sorted neighbours yields the shortest deterministic
 * path to each reachable sink:* / exposure:* node. A chain whose node list is
 * a strict suffix of another chain to the same sink is dropped (it is the same
 * flow seen from further downstream). Severity is the most severe finding
 * touching any node on the path; classes / PDPL are the union of those
 * findings'.
 */

const crypto = require('crypto');
const { maxSeverity, cmp, SEV_RANK } = require('./merge');
const { articlesForClasses } = require('./pdpl');

function isSink(id) { return id.startsWith('sink:') || id.startsWith('exposure:'); }

function buildChains(graph, piiStarts, touched, findingsByKey) {
  const adj = new Map();
  for (const e of graph.edges) {
    if (!adj.has(e.from)) adj.set(e.from, new Set());
    adj.get(e.from).add(e.to);
  }
  const raw = [];
  for (const start of [...piiStarts].sort()) {
    const prev = new Map([[start, null]]);
    const queue = [start];
    while (queue.length) {
      const n = queue.shift();
      for (const m of [...(adj.get(n) || [])].sort()) {
        if (prev.has(m)) continue;
        prev.set(m, n);
        queue.push(m);
      }
    }
    for (const n of [...prev.keys()].sort()) {
      if (n === start || !isSink(n)) continue;
      const nodes = [];
      for (let c = n; c !== null; c = prev.get(c)) nodes.unshift(c);
      raw.push(nodes);
    }
  }
  const joined = raw.map((n) => n.join('\u0000'));
  const kept = raw.filter((nodes, i) => !raw.some((other, j) => j !== i && other.length > nodes.length
    && joined[j].endsWith(`\u0000${joined[i]}`)));
  const seen = new Set();
  const chains = [];
  for (const nodes of kept) {
    const sig = nodes.join('\u0000');
    if (seen.has(sig)) continue;
    seen.add(sig);
    const keys = new Set();
    for (const n of nodes) for (const k of touched.get(n) || []) keys.add(k);
    const fs = [...keys].map((k) => findingsByKey.get(k)).filter(Boolean);
    const classes = [...new Set(fs.flatMap((f) => f.sensitivity_classes))].sort();
    chains.push({
      id: `chain_${crypto.createHash('sha256').update(sig).digest('hex').slice(0, 10)}`,
      nodes,
      source: nodes[0],
      sink: nodes[nodes.length - 1],
      // An UNJUDGED chain (no worker finding on it -- e.g. CI, where Map is
      // skipped) is a deterministic path from a PII-tagged source to an
      // external sink or exposure. Fail closed: treat it as P0 until a worker
      // judges it, so a PR gate on P0 chains cannot be passed by not looking.
      severity: maxSeverity(fs.map((f) => f.severity)) || 'P0',
      judged: fs.length > 0,
      classes,
      pdpl: articlesForClasses(classes),
      finding_keys: [...keys].sort(),
    });
  }
  return chains.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || cmp(a.source, b.source) || cmp(a.sink, b.sink) || cmp(a.id, b.id));
}

module.exports = { buildChains, isSink };
