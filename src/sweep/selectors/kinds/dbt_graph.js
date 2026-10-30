/**
 * `dbt_graph` selectors -- PII lineage through a dbt project.
 *
 * query:
 *   source_tags: [pii]               source / table / column tags marking PII
 *   meta_keys:   [pii, contains_pii] column / table meta keys with a truthy value
 *   emit:        [source, model, exposure]  which signals to emit (default all three);
 *                `source` = the PII source declaration line. Emitted only when
 *                asked for, so several dbt_graph selectors over the same project
 *                do not each re-emit the same declaration line.
 *
 * Why: a column scan finds `email` in stg_customers.sql, but the risk that
 * matters is that a PII-tagged source flows, through refs, into a mart and then
 * an exposure (dashboard / reverse-ETL) that leaves the warehouse. This kind
 * walks that graph -- built once per run by dbt.loadDbtProject into
 * ctx.project.dbt -- and emits:
 *
 *   - the PII source declaration line (emit source) evidence read
 *   - each model transitively downstream of it    evidence transform
 *     (span = first line with ref()/source(), else 1)
 *   - each exposure depending on a PII model       evidence expose
 *     (span = the exposure's `name:` line)
 *
 * Fixtures for this kind are mini projects: JSON {"files": {rel: text}, "target": rel}.
 * `loadFixture` builds the file + ctx for them so fixture runners need no dbt
 * knowledge.
 */

const { loadDbtProject, computePii } = require('../../dbt');
const { languageOf } = require('../schema');

const EMITS = ['source', 'model', 'exposure'];
const CACHE = new WeakMap(); // dbt project → Map(queryKey → pii lineage)

function lineage(dbt, q) {
  let per = CACHE.get(dbt);
  if (!per) { per = new Map(); CACHE.set(dbt, per); }
  const key = JSON.stringify([q.source_tags || [], q.meta_keys || []]);
  if (!per.has(key)) per.set(key, computePii(dbt, q));
  return per.get(key);
}

function listOfStrings(v) { return Array.isArray(v) && v.every((x) => typeof x === 'string' && x !== ''); }

module.exports = {
  kind: 'dbt_graph',
  defaultLanguages: ['sql', 'yaml'],
  EMITS,

  validateQuery(q) {
    const errors = [];
    const hasTags = q.source_tags !== undefined;
    const hasMeta = q.meta_keys !== undefined;
    if (!hasTags && !hasMeta) errors.push('source_tags or meta_keys is required');
    if (hasTags && !listOfStrings(q.source_tags)) errors.push('source_tags must be a list of strings');
    if (hasMeta && !listOfStrings(q.meta_keys)) errors.push('meta_keys must be a list of strings');
    if (q.emit !== undefined && (!Array.isArray(q.emit) || q.emit.some((e) => !EMITS.includes(e)))) {
      errors.push(`emit must be a list of ${EMITS.join('|')}`);
    }
    return errors;
  },

  match(selector, file, ctx) {
    const dbt = ctx && ctx.project && ctx.project.dbt;
    if (!dbt || !dbt.models) return [];
    const q = selector.query || {};
    const emit = new Set(q.emit || EMITS);
    const { piiSources, piiModels, roots } = lineage(dbt, q);
    const out = [];
    const rel = file.rel;

    if (emit.has('source')) {
      for (const key of piiSources) {
        const s = dbt.sources[key];
        if (s.rel === rel) out.push({ startLine: s.line || 1, endLine: s.line || 1, evidence_kind: 'read' });
      }
    }

    if (emit.has('model')) {
      for (const [name, m] of Object.entries(dbt.models)) {
        if (m.rel !== rel || !piiModels.has(name)) continue;
        const lines = String(file.text).split('\n');
        let line = 1;
        for (let i = 0; i < lines.length; i++) {
          if (/\b(ref|source)\s*\(/.test(lines[i])) { line = i + 1; break; }
        }
        out.push({ startLine: line, endLine: line, evidence_kind: 'transform' });
      }
    }

    if (emit.has('exposure')) {
      for (const e of Object.values(dbt.exposures)) {
        if (e.rel !== rel) continue;
        const hit = e.depends_on.some((d) => (d.model && (piiModels.has(d.model) || roots.has(d.model)))
          || (d.source && piiSources.has(d.source)));
        if (hit) out.push({ startLine: e.line, endLine: e.line, evidence_kind: 'expose' });
      }
    }
    const seen = new Set();
    return out.filter((s) => {
      const k = `${s.startLine}:${s.evidence_kind}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).sort((a, b) => a.startLine - b.startLine);
  },

  /**
   * Build {file, ctx} for a dbt_graph fixture text.
   * @param {string} text JSON {"files": {rel: text}, "target": rel}
   * @param {object} [optional] OptionalRegistry to place on ctx
   * @returns {{ file: object, ctx: object }}
   */
  loadFixture(text, optional = null) {
    const spec = JSON.parse(text);
    if (!spec || typeof spec.files !== 'object' || typeof spec.target !== 'string' || !(spec.target in spec.files)) {
      throw new Error('dbt_graph fixture must be JSON {"files": {...}, "target": "<one of files>"}');
    }
    const rels = Object.keys(spec.files);
    const dbt = loadDbtProject('', rels, (r) => (r in spec.files ? spec.files[r] : null));
    const target = spec.target;
    return {
      file: { rel: target, ext: (target.split('.').pop() || '').toLowerCase(), lang: languageOf(target), text: spec.files[target], valueFindings: [] },
      ctx: { optional, project: { root: '', dbt } },
    };
  },
};
