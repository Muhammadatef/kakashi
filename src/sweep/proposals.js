/**
 * `kakashi sweep selectors propose <file>` -- additive-only selector proposals.
 *
 * A worker (or a human) that notices a pattern the floor misses may propose
 * selectors. A proposal can only ever ADD coverage, so it is checked before it
 * is written anywhere:
 *
 *   - the file parses and is a list (or { selectors: [...] }) and nothing else:
 *     no top-level keys that could express removal (ignores, disable, ...)
 *   - each selector is schema-valid (class ∈ CLASSES, known kind, fixtures)
 *   - its id collides with no built-in selector (any pack), no existing repo
 *     selector, and no other selector in the same proposal
 *   - its own fixtures pass through the real shard() path
 *
 * Accepted selectors are copied to <repo>/.kakashi/selectors/proposed-<hash>.json,
 * a new file -- existing selector files are never modified.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('./yaml');
const kinds = require('./selectors/kinds');
const { validateSelector } = require('./selectors/schema');
const { loadSelectors, listPacks, hashSelectors, REPO_SELECTOR_DIR } = require('./selectors/loader');
const { validateFixtures } = require('./selectors/validate');

/**
 * @param {string} selectorsFile path to a .yaml/.yml/.json proposal
 * @param {object} [opts]
 * @param {string[]} [opts.packs]     packs whose ids are reserved (default: every built-in pack)
 * @param {string} [opts.repoRoot]    repo whose .kakashi/selectors receives accepted selectors
 * @param {boolean} [opts.write=true]
 * @param {object} [opts.optional]    OptionalRegistry for fixture runs
 * @returns {Promise<{ accepted: string[], rejected: {id: string, reason: string}[], file: string|null }>}
 */
async function validateProposal(selectorsFile, opts = {}) {
  const rejected = [];
  const label = path.basename(selectorsFile);
  let doc;
  try {
    const text = fs.readFileSync(selectorsFile, 'utf8');
    doc = /\.json$/i.test(selectorsFile) ? JSON.parse(text) : yaml.parse(text, label);
  } catch (err) {
    return { accepted: [], rejected: [{ id: '*', reason: `parse error: ${err.message}` }], file: null };
  }
  let list = null;
  if (Array.isArray(doc)) list = doc;
  else if (doc && typeof doc === 'object' && Array.isArray(doc.selectors)) {
    const extra = Object.keys(doc).filter((k) => k !== 'selectors');
    if (extra.length) {
      return { accepted: [], rejected: [{ id: '*', reason: `only "selectors" is allowed at top level; proposals are additive (found: ${extra.join(', ')})` }], file: null };
    }
    list = doc.selectors;
  }
  if (!list) return { accepted: [], rejected: [{ id: '*', reason: 'expected a list of selectors or { selectors: [...] }' }], file: null };

  const packs = opts.packs && opts.packs.length ? opts.packs : listPacks();
  const builtin = loadSelectors({ packs });
  const taken = new Map(Object.entries(builtin.origins));
  if (opts.repoRoot) {
    const repo = loadSelectors({ repoRoot: opts.repoRoot });
    for (const [id, o] of Object.entries(repo.origins)) if (!taken.has(id)) taken.set(id, o);
  }

  const candidates = [];
  const seen = new Set();
  list.forEach((sel, i) => {
    const id = sel && typeof sel.id === 'string' ? sel.id : `#${i}`;
    const errs = validateSelector(sel, kinds);
    if (errs.length) { rejected.push({ id, reason: errs.join('; ') }); return; }
    if (taken.has(id)) { rejected.push({ id, reason: `id collides with existing selector (${taken.get(id)})` }); return; }
    if (seen.has(id)) { rejected.push({ id, reason: 'duplicate id within proposal' }); return; }
    seen.add(id);
    candidates.push(sel);
  });

  const accepted = [];
  if (candidates.length) {
    const fx = await validateFixtures(candidates, { optional: opts.optional });
    for (const r of fx.results) {
      if (r.pass) accepted.push(candidates.find((c) => c.id === r.id));
      else rejected.push({ id: r.id, reason: `fixtures failed: ${r.failures.join('; ')}` });
    }
  }

  let file = null;
  if (accepted.length && opts.repoRoot && opts.write !== false) {
    const dir = path.join(opts.repoRoot, REPO_SELECTOR_DIR);
    fs.mkdirSync(dir, { recursive: true });
    file = path.join(dir, `proposed-${hashSelectors(accepted)}.json`);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(accepted, null, 2)}\n`);
    fs.renameSync(tmp, file);
  }
  return { accepted: accepted.map((s) => s.id).sort(), rejected, file };
}

module.exports = { validateProposal };
