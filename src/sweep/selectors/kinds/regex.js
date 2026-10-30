/**
 * `regex` selectors -- lexical fallback for repo-specific conventions.
 *
 * query:
 *   pattern: "<JS regex source>"   matched per line
 *   flags:   "i"                    optional; only i, m, s, u are allowed
 *
 * Line-based on purpose: a span is a line range, and per-line matching keeps a
 * pathological pattern's blast radius to one line at a time.
 */

const ALLOWED_FLAGS = /^[imsu]*$/;

function compile(q) {
  return new RegExp(q.pattern, `${(q.flags || '').replace(/[gy]/g, '')}`);
}

module.exports = {
  kind: 'regex',
  defaultLanguages: null,

  validateQuery(q) {
    if (typeof q.pattern !== 'string' || q.pattern === '') return ['pattern is required'];
    if (q.flags !== undefined && (typeof q.flags !== 'string' || !ALLOWED_FLAGS.test(q.flags))) {
      return ['flags may only contain i, m, s, u'];
    }
    try { compile(q); } catch (e) { return [`invalid regex: ${e.message}`]; }
    return [];
  },

  match(selector, file) {
    const rx = compile(selector.query);
    const out = [];
    const lines = file.text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (rx.test(lines[i])) out.push({ startLine: i + 1, endLine: i + 1 });
    }
    return out;
  },
};
