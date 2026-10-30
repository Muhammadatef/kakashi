/**
 * Selector loader -- built-in packs plus the repo's own `.kakashi/selectors/`.
 *
 * Built-in packs ship in the package and are the COVERAGE FLOOR. Repo selectors
 * are human-authored, version-controlled, and loaded in addition to the floor --
 * a repo file can never remove or override a built-in id (a duplicate id is an
 * error, not a replacement). Load order and output order are both sorted, so the
 * same files always produce the same selector list and the same hash.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const yaml = require('../yaml');
const kinds = require('./kinds');
const { validateSelector } = require('./schema');

const PACKS_DIR = path.join(__dirname, '..', 'packs');
const REPO_SELECTOR_DIR = path.join('.kakashi', 'selectors');

/** @returns {string[]} ids of every built-in pack with a pack.js */
function listPacks() {
  if (!fs.existsSync(PACKS_DIR)) return [];
  return fs.readdirSync(PACKS_DIR)
    .filter((d) => fs.existsSync(path.join(PACKS_DIR, d, 'pack.js')))
    .sort();
}

/** @param {string} id */
function loadPack(id) {
  const file = path.join(PACKS_DIR, id, 'pack.js');
  if (!/^[a-z0-9_]+$/.test(id) || !fs.existsSync(file)) throw new Error(`Unknown sweep pack: ${id}`);
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const pack = require(file);
  // A stub pack (stub: true, e.g. schema_change_impact) may ship no selectors
  // at all; it still loads, contributes nothing, and is reported as a stub.
  const selectorDir = pack.selectorDir === null ? null : (pack.selectorDir || path.join(PACKS_DIR, id, 'selectors'));
  return { ...pack, stub: !!pack.stub, selectorDir };
}

/**
 * Parse one selector file (.yaml/.yml/.json) into a list of raw selectors.
 * @returns {{ selectors: object[], errors: string[] }}
 */
function parseSelectorFile(file, label = file) {
  const text = fs.readFileSync(file, 'utf8');
  let doc;
  try {
    doc = file.endsWith('.json') ? JSON.parse(text) : yaml.parse(text, label);
  } catch (err) {
    return { selectors: [], errors: [err.message.startsWith(label) ? err.message : `${label}: ${err.message}`] };
  }
  const list = Array.isArray(doc) ? doc : (doc && Array.isArray(doc.selectors) ? doc.selectors : null);
  if (!list) return { selectors: [], errors: [`${label}: expected a list of selectors or { selectors: [...] }`] };
  return { selectors: list, errors: [] };
}

function selectorFilesIn(dir) {
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs.readdirSync(dir)
    .filter((f) => /\.(ya?ml|json)$/i.test(f))
    .sort()
    .map((f) => path.join(dir, f));
}

/** Stable JSON: keys sorted, so the hash does not depend on authoring order. */
function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

function hashSelectors(selectors) {
  return crypto.createHash('sha256').update(stableStringify(selectors)).digest('hex').slice(0, 16);
}

/**
 * @param {object} opts
 * @param {string[]} opts.packs         built-in pack ids
 * @param {string} [opts.repoRoot]      load <repoRoot>/.kakashi/selectors/* too
 * @param {string[]} [opts.extraFiles]  additional selector files (e.g. proposals)
 * @returns {{ selectors: object[], origins: Object<string,string>, errors: string[], hash: string, files: string[] }}
 */
function loadSelectors({ packs = [], repoRoot = null, extraFiles = [] } = {}) {
  const sources = [];
  for (const id of packs) {
    for (const f of selectorFilesIn(loadPack(id).selectorDir)) sources.push({ file: f, origin: `builtin:${id}` });
  }
  if (repoRoot) {
    for (const f of selectorFilesIn(path.join(repoRoot, REPO_SELECTOR_DIR))) sources.push({ file: f, origin: 'repo' });
  }
  for (const f of extraFiles) sources.push({ file: f, origin: 'proposed' });

  const selectors = [];
  const origins = {};
  const errors = [];
  const files = [];
  for (const { file, origin } of sources) {
    const label = repoRoot && file.startsWith(repoRoot) ? path.relative(repoRoot, file) : path.relative(path.join(__dirname, '..', '..', '..'), file);
    files.push(label);
    const parsed = parseSelectorFile(file, label);
    errors.push(...parsed.errors);
    for (const sel of parsed.selectors) {
      const errs = validateSelector(sel, kinds);
      if (errs.length) { errors.push(...errs.map((e) => `${label}: ${e}`)); continue; }
      if (origins[sel.id]) { errors.push(`${label}: duplicate selector id "${sel.id}" (already defined by ${origins[sel.id]})`); continue; }
      origins[sel.id] = origin;
      selectors.push(sel);
    }
  }
  selectors.sort((a, b) => a.id.localeCompare(b.id));
  return { selectors, origins, errors, hash: hashSelectors(selectors), files };
}

module.exports = { loadSelectors, listPacks, loadPack, parseSelectorFile, hashSelectors, stableStringify, REPO_SELECTOR_DIR, PACKS_DIR };
