/**
 * Sweep REDUCE entry point: accepted submissions → reduce.json.
 *
 * Why: everything downstream (report, status, decision) should read one
 * deterministic, value-free artefact instead of re-deriving it from raw
 * batches. reduce() is pure with respect to its inputs (store contents + the
 * repo's dbt / CODEOWNERS metadata): same run → byte-identical reduce.json.
 * It only touches the store through manifest/signals/batches/allFindings/
 * writeJSON, so it is independent of RunStore internals.
 */

const { mergeFindings, cmp } = require('./merge');
const { buildGraph } = require('./graph');
const { buildChains } = require('./chains');
const { loadCodeowners, ownersFor } = require('./owners');
const { articlesForClasses, articleSortKey } = require('./pdpl');

function computeReduce({ manifest, signals, findingsSubs }) {
  const root = manifest && manifest.root;
  const { findings, dismissed, accounted } = mergeFindings(signals, findingsSubs);
  const rules = root ? loadCodeowners(root) : [];
  for (const f of findings) {
    f.pdpl = articlesForClasses(f.sensitivity_classes);
    f.owners = ownersFor(rules, f.file);
  }
  const byKey = new Map(findings.map((f) => [f.key, f]));
  const { graph, piiStarts, touched } = buildGraph(root, findings);
  const chains = buildChains(graph, piiStarts, touched, byKey);

  const counts = new Map();
  for (const f of findings) for (const a of f.pdpl) {
    const c = counts.get(a.article) || { article: a.article, title: a.title, count: 0 };
    c.count++;
    counts.set(a.article, c);
  }
  const pdpl = [...counts.values()].sort((a, b) => articleSortKey(a.article) - articleSortKey(b.article) || cmp(a.article, b.article));

  const bySelector = {};
  for (const s of signals) {
    const b = bySelector[s.selector_id] || (bySelector[s.selector_id] = { signals: 0, accounted: 0 });
    b.signals++;
    if (accounted.has(s.id)) b.accounted++;
  }
  const mc = (manifest && manifest.coverage) || {};
  const coverage = {
    filesInScope: mc.filesInScope != null ? mc.filesInScope : null,
    filesWithSignals: new Set(signals.map((s) => s.file)).size,
    signals: signals.length,
    accounted: accounted.size,
    accountedPct: signals.length ? Math.round((accounted.size / signals.length) * 1000) / 10 : 100,
    bySelector: Object.fromEntries(Object.entries(bySelector).sort(([a], [b]) => cmp(a, b))),
  };
  return { findings, dismissed, graph, chains, pdpl, coverage };
}

/**
 * @param {object} store RunStore-like: manifest(), signals(), batches(), allFindings(), writeJSON()
 * @returns {object} reduce output (also written to reduce.json)
 */
function reduce(store) {
  const out = computeReduce({
    manifest: store.manifest() || {},
    signals: store.signals() || [],
    findingsSubs: store.allFindings() || [],
  });
  store.writeJSON('reduce.json', out);
  return out;
}

module.exports = { reduce, computeReduce };
