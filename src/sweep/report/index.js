/**
 * Sweep REPORT entry point: render(store, {format, lang, includeValues}).
 *
 * Why: one value-free view model (decision, coverage, findings, chains, PDPL,
 * remediation, iterations) feeds four renderers so md / html / json / sarif
 * can never disagree. reduce.json is used when present, otherwise computed.
 *
 * includeValues is the ONLY path in Sweep that reads raw repo lines; it is
 * opt-in, never agent-safe, and every renderer prints a loud banner for it.
 */

const fs = require('fs');
const path = require('path');
const { STRINGS } = require('../../lib/i18n');
const { reduce } = require('../reduce');

function translator(lang) {
  const table = STRINGS[lang] || STRINGS.en;
  return (key) => table[`sweep_report_${key}`] || STRINGS.en[`sweep_report_${key}`] || key;
}

function readIterations(store) {
  try {
    if (typeof store.iterations === 'function') return store.iterations() || [];
    if (store.dir) {
      const p = path.join(store.dir, 'iterations.jsonl');
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
      }
    }
  } catch (_) { /* best effort */ }
  return [];
}

/** Raw line excerpts; only called when includeValues is true. */
function readValues(root, findings) {
  const out = {};
  const cache = new Map();
  for (const f of findings) {
    const abs = path.resolve(root, f.file);
    if (!abs.startsWith(path.resolve(root) + path.sep)) continue;
    if (!cache.has(abs)) { let t = null; try { t = fs.readFileSync(abs, 'utf8').split('\n'); } catch (_) { t = null; } cache.set(abs, t); }
    const lines = cache.get(abs);
    if (lines && lines[f.line - 1] != null) out[f.key] = lines[f.line - 1].slice(0, 300);
  }
  return out;
}

function buildModel(store, opts = {}) {
  const lang = opts.lang === 'ar' ? 'ar' : 'en';
  const manifest = store.manifest() || {};
  const red = store.readJSON('reduce.json') || reduce(store);
  const narrative = store.readJSON('narrative.json') || { chains: {}, remediation: {} };
  return {
    lang,
    tr: translator(lang),
    manifest,
    reduce: red,
    narrative: { chains: narrative.chains || {}, remediation: narrative.remediation || {} },
    iterations: readIterations(store),
    includeValues: !!opts.includeValues,
    values: opts.includeValues && manifest.root ? readValues(manifest.root, red.findings) : null,
  };
}

function fmtLoc(l) {
  if (!l) return '?';
  if (l.external) return `[${l.external}]`;
  return `${l.file}:${l.line}`;
}
function fmtEdge(e) {
  if (!e) return '';
  return `${fmtLoc(e.from)} -> ${fmtLoc(e.to)} (${e.operation || '?'})`;
}

/**
 * @param {object} store
 * @param {{format?: 'md'|'html'|'json'|'sarif', lang?: 'en'|'ar', includeValues?: boolean}} [opts]
 * @returns {string}
 */
function render(store, opts = {}) {
  const model = buildModel(store, opts);
  const fmt = opts.format || 'md';
  if (fmt === 'md' || fmt === 'markdown') return require('./markdown').renderMarkdown(model);
  if (fmt === 'html') return require('./html').renderHtml(model);
  if (fmt === 'json') return require('./json').renderJson(model);
  if (fmt === 'sarif') return require('./sarif').renderSarif(model);
  throw new Error(`Unknown report format: ${fmt}`);
}

module.exports = { render, buildModel, fmtEdge, fmtLoc };
