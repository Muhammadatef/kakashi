/**
 * `kakashi sweep selectors validate` -- prove every selector against its own
 * fixtures and report per-selector recall and precision.
 *
 * Completeness of a sweep rests on selector recall, so a built-in selector that
 * loses a positive fixture is a CI failure, not a warning. Fixtures are run
 * through the exact same `shard()` path a real run uses, so what is validated is
 * what executes.
 *
 *   recall    = positive fixtures matched / positive fixtures
 *   precision = positives matched / (positives matched + negatives matched)
 */

const { shard } = require('../shard');
const { OptionalRegistry } = require('../optional');

const DEFAULT_FIXTURE_PATH = {
  sql_column: 'fixture.sql',
  ast: 'fixture.py',
  regex: 'fixture.txt',
  pattern: 'fixture.txt',
  dbt_graph: 'fixture.sql',
};

/**
 * Materialise a fixture as { files, target, project }.
 * dbt_graph fixture text is JSON: { files: {rel: text}, target: rel }.
 */
function materialise(selector, fixture) {
  const fx = typeof fixture === 'string' ? { text: fixture } : fixture;
  if (selector.kind === 'dbt_graph') {
    const spec = JSON.parse(fx.text);
    const files = Object.keys(spec.files).sort().map((rel) => ({ rel, text: spec.files[rel] }));
    // eslint-disable-next-line global-require
    const { loadDbtProject } = require('../dbt');
    const dbt = loadDbtProject('/fixture', files.map((f) => f.rel), (rel) => spec.files[rel]);
    return { files, target: spec.target, dbt };
  }
  const rel = fx.path || DEFAULT_FIXTURE_PATH[selector.kind] || 'fixture.txt';
  return { files: [{ rel, text: fx.text }], target: rel, dbt: null };
}

async function matches(selector, fixture, optional) {
  const { files, target, dbt } = materialise(selector, fixture);
  const ctx = { optional, project: { root: '/fixture', dbt } };
  const { signals, errors } = await shard({ files, selectors: [selector], ctx });
  if (errors.length) throw new Error(errors.map((e) => e.error).join('; '));
  return signals.some((s) => s.file === target);
}

/**
 * @param {object[]} selectors
 * @param {object} [opts]
 * @param {OptionalRegistry} [opts.optional]
 * @param {Object<string,string>} [opts.origins]  id → origin (builtin:* fails CI on recall loss)
 * @returns {Promise<{ results: object[], ok: boolean, degradations: object[] }>}
 */
async function validateFixtures(selectors, opts = {}) {
  const optional = opts.optional || new OptionalRegistry();
  const origins = opts.origins || {};
  const results = [];
  for (const sel of selectors) {
    const r = { id: sel.id, kind: sel.kind, origin: origins[sel.id] || 'unknown', tp: 0, fn: 0, fp: 0, tn: 0, failures: [] };
    const run = async (fixture, positive, i) => {
      let hit;
      try {
        hit = await matches(sel, fixture, optional);
      } catch (err) {
        r.failures.push(`${positive ? 'positive' : 'negative'}[${i}] error: ${err.message}`);
        if (positive) r.fn++; else r.fp++;
        return;
      }
      if (positive) {
        if (hit) r.tp++; else { r.fn++; r.failures.push(`positive[${i}] not matched`); }
      } else if (hit) { r.fp++; r.failures.push(`negative[${i}] matched`); } else r.tn++;
    };
    for (const [i, f] of sel.fixtures.positive.entries()) await run(f, true, i);
    for (const [i, f] of sel.fixtures.negative.entries()) await run(f, false, i);
    r.recall = r.tp + r.fn === 0 ? 1 : r.tp / (r.tp + r.fn);
    r.precision = r.tp + r.fp === 0 ? 1 : r.tp / (r.tp + r.fp);
    r.pass = r.fn === 0 && r.fp === 0;
    results.push(r);
  }
  // CI contract: every selector must pass its fixtures; a built-in losing a
  // positive is the specific regression this exists to catch.
  const ok = results.every((r) => r.pass);
  return { results, ok, degradations: optional.list() };
}

module.exports = { validateFixtures, materialise, DEFAULT_FIXTURE_PATH };
