/**
 * BATCH -- pack signals into bounded work units for Map workers.
 *
 * Bounds: every batch fits `tokenBudget` (estimated from the bytes of the files
 * it references plus a per-signal overhead) and holds at most `maxSignals`.
 * Locality: signals from the same file -- and from the same dbt model -- stay in
 * one batch, because a worker judging a transform needs to see its neighbours.
 * A single group too big for one batch is split by signals and flagged
 * `oversized`, so the bound is never silently broken.
 *
 * Pure: same signals + sizes + options → same batches, same ids.
 */

const crypto = require('crypto');

const DEFAULTS = {
  tokenBudget: 12000,
  maxSignals: 40,
  tokensPerSignal: 60,
  bytesPerToken: 4,
};

/**
 * @param {object[]} signals          sorted output of shard()
 * @param {object} opts
 * @param {Object<string,number>} opts.fileBytes   rel → size in bytes
 * @param {function(string):string|null} [opts.groupOf]  rel → dbt model key (or null)
 * @param {number} [opts.tokenBudget]
 * @param {number} [opts.maxSignals]
 * @returns {object[]} batches { id, signalIds, files, estTokens, oversized }
 */
function makeBatches(signals, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const fileBytes = o.fileBytes || {};
  const groupOf = o.groupOf || (() => null);
  const fileTokens = (rel) => Math.ceil((fileBytes[rel] || 0) / o.bytesPerToken);

  // 1. Group: dbt model key when there is one, else the file itself.
  const groups = new Map();
  for (const s of signals) {
    const key = groupOf(s.file) || `file:${s.file}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const ordered = [...groups.keys()].sort().map((k) => groups.get(k));

  const estimate = (sigs) => {
    const files = [...new Set(sigs.map((s) => s.file))];
    return files.reduce((n, f) => n + fileTokens(f), 0) + sigs.length * o.tokensPerSignal;
  };

  // 2. Split any group that cannot fit on its own.
  const units = [];
  for (const g of ordered) {
    if (estimate(g) <= o.tokenBudget && g.length <= o.maxSignals) {
      units.push({ signals: g, oversized: false });
      continue;
    }
    let chunk = [];
    for (const s of g) {
      if (chunk.length && (estimate([...chunk, s]) > o.tokenBudget || chunk.length >= o.maxSignals)) {
        units.push({ signals: chunk, oversized: true });
        chunk = [];
      }
      chunk.push(s);
    }
    if (chunk.length) units.push({ signals: chunk, oversized: true });
  }

  // 3. First-fit in order (deterministic): append units to the open batch while
  //    the bounds hold.
  const batches = [];
  let cur = null;
  for (const u of units) {
    const fits = cur && !cur.oversized && !u.oversized
      && estimate([...cur.signals, ...u.signals]) <= o.tokenBudget
      && cur.signals.length + u.signals.length <= o.maxSignals;
    if (fits) {
      cur.signals.push(...u.signals);
    } else {
      cur = { signals: [...u.signals], oversized: u.oversized };
      batches.push(cur);
    }
  }

  return batches.map((b, i) => {
    const signalIds = b.signals.map((s) => s.id);
    const h = crypto.createHash('sha1').update(signalIds.join(',')).digest('hex').slice(0, 8);
    return {
      id: `b${String(i + 1).padStart(4, '0')}_${h}`,
      signalIds,
      files: [...new Set(b.signals.map((s) => s.file))].sort(),
      estTokens: estimate(b.signals),
      oversized: b.oversized,
    };
  });
}

module.exports = { makeBatches, DEFAULTS };
