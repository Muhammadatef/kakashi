/**
 * Sweep REDUCE: the data-flow graph.
 *
 * Why: a single finding says "this line reads email" or "this line uploads to
 * S3". The risk is the PATH between them. Two edge origins are merged:
 *
 *   - dbt: lineage from loadDbtProject (source → model → model → exposure),
 *     which is static fact, no worker judgement needed;
 *   - worker: each FINDING's edge (from file:line → to file:line | external).
 *
 * A repo location is resolved to the most specific node: a dbt model's file
 * becomes dbt:<model>, a source/exposure declaration line becomes
 * source:<src.table> / exposure:<name>, anything else file:<rel>. External
 * destinations become sink:<kind>. Node labels are ids only (paths, model
 * names) -- no file contents enter the graph.
 */

const fs = require('fs');
const path = require('path');
const { loadDbtProject, computePii } = require('../dbt');
const { cmp } = require('./merge');

const SKIP_DIRS = new Set(['.git', 'node_modules', '.kakashi', '.venv', 'venv', '__pycache__']);

/** dbt-relevant files only (sql / yml / manifest), sorted. */
function listDbtFiles(root) {
  const out = [];
  const walk = (dir, rel) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (/\.(sql|ya?ml)$/i.test(e.name) || /(^|\/)target\/manifest\.json$/.test(r)) out.push(r);
    }
  };
  walk(root, '');
  return out.sort();
}

function loadDbt(root) {
  if (!root) return null;
  try {
    return loadDbtProject(root, listDbtFiles(root), (rel) => fs.readFileSync(path.join(root, rel), 'utf8'));
  } catch (_) {
    return null;
  }
}

function makeResolver(dbt) {
  const modelByRel = new Map();
  const declByRelLine = new Map();
  if (dbt) {
    for (const [name, m] of Object.entries(dbt.models)) if (m.rel) modelByRel.set(m.rel, name);
    for (const [k, s] of Object.entries(dbt.sources)) if (s.rel) declByRelLine.set(`${s.rel}:${s.line}`, `source:${k}`);
    for (const [k, e] of Object.entries(dbt.exposures)) if (e.rel) declByRelLine.set(`${e.rel}:${e.line}`, `exposure:${k}`);
  }
  return (loc) => {
    if (!loc) return null;
    if (loc.external) return `sink:${loc.external}`;
    if (!loc.file) return null;
    if (modelByRel.has(loc.file)) return `dbt:${modelByRel.get(loc.file)}`;
    const decl = declByRelLine.get(`${loc.file}:${loc.line}`);
    return decl || `file:${loc.file}`;
  };
}

function nodeKind(id) {
  const p = id.split(':')[0];
  return { source: 'source', dbt: 'model', file: 'code', exposure: 'exposure', sink: 'sink' }[p] || 'code';
}

/**
 * @param {string} root repo root (manifest.root)
 * @param {object[]} findings merged findings
 * @returns {{graph: object, resolve: Function, piiStarts: Set<string>, dbt: object|null, fileOf: Function}}
 */
function buildGraph(root, findings) {
  const dbt = loadDbt(root);
  const resolve = makeResolver(dbt);
  const nodes = new Map();
  const edges = new Map();
  const fileOf = (id) => {
    const [p, ...rest] = id.split(':');
    const name = rest.join(':');
    if (!dbt) return p === 'file' ? name : null;
    if (p === 'file') return name;
    if (p === 'dbt') return (dbt.models[name] && dbt.models[name].rel) || null;
    if (p === 'source') return (dbt.sources[name] && dbt.sources[name].rel) || null;
    if (p === 'exposure') return (dbt.exposures[name] && dbt.exposures[name].rel) || null;
    return null;
  };
  const addNode = (id) => { if (id && !nodes.has(id)) nodes.set(id, { id, file: fileOf(id), kind: nodeKind(id) }); };
  const addEdge = (from, to, operation, origin) => {
    if (!from || !to || from === to) return;
    addNode(from); addNode(to);
    const k = `${from}\u0000${to}\u0000${operation}\u0000${origin}`;
    if (!edges.has(k)) edges.set(k, { from, to, operation, origin });
  };

  let piiSources = new Set();
  if (dbt) {
    ({ piiSources } = computePii(dbt, { source_tags: ['pii'], meta_keys: ['pii', 'contains_pii'] }));
    for (const [name, m] of Object.entries(dbt.models)) {
      for (const s of m.sources) addEdge(`source:${s}`, `dbt:${name}`, 'read', 'dbt');
      for (const r of m.refs) addEdge(`dbt:${r}`, `dbt:${name}`, 'transform', 'dbt');
    }
    for (const [name, e] of Object.entries(dbt.exposures)) {
      for (const d of e.depends_on) {
        if (d.model) addEdge(`dbt:${d.model}`, `exposure:${name}`, 'expose', 'dbt');
        else if (d.source) addEdge(`source:${d.source}`, `exposure:${name}`, 'expose', 'dbt');
      }
    }
  }

  // A finding's own location and its edge endpoints; the finding "touches" both.
  const touched = new Map(); // node id → [finding keys]
  const touch = (id, f) => { if (!id) return; if (!touched.has(id)) touched.set(id, []); touched.get(id).push(f.key); };
  for (const f of findings) {
    const at = resolve({ file: f.file, line: f.line });
    addNode(at);
    touch(at, f);
    if (f.edge && f.edge.from && f.edge.to) {
      const from = resolve(f.edge.from);
      const to = resolve(f.edge.to);
      addEdge(from, to, f.edge.operation || 'read', 'worker');
      touch(from, f); touch(to, f);
      if (at !== from) addEdge(at, from, 'read', 'worker');
    }
  }

  const piiStarts = new Set([...piiSources].map((s) => `source:${s}`).filter((id) => nodes.has(id)));
  for (const f of findings) {
    if (!f.sensitivity_classes.length || f.sensitivity_classes.every((c) => c === 'BUSINESS_ATTRIBUTE')) continue;
    const at = resolve({ file: f.file, line: f.line });
    const from = f.edge && f.edge.from ? resolve(f.edge.from) : null;
    // Prefer the upstream end of the flow as the start.
    if (from && from.startsWith('sink:') === false) piiStarts.add(from); else piiStarts.add(at);
  }

  const graph = {
    nodes: [...nodes.values()].sort((a, b) => cmp(a.id, b.id)),
    edges: [...edges.values()].sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to) || cmp(a.operation, b.operation) || cmp(a.origin, b.origin)),
  };
  return { graph, resolve, piiStarts, touched, dbt, fileOf };
}

module.exports = { buildGraph, listDbtFiles, nodeKind };
