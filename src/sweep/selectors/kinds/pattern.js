/**
 * `pattern` selectors -- hardcoded sensitive VALUES in code and config, found by
 * the existing engine (engine/patterns.js via masker.maskText). This is how
 * Kakashi's value findings feed into Sweep as signals.
 *
 * query:
 *   pattern_ids: [email, national_id, ...]   any of these engine pattern ids
 *   classes:     [CREDENTIAL, ...]           or any pattern of these classes
 * (at least one of the two). The matched value is never retained -- only lines.
 */

const { PATTERNS } = require('../../../engine/patterns');
const { classOf, CLASSES } = require('../../../guardian/classes');

const PATTERN_IDS = new Set(PATTERNS.map((p) => p.id));

module.exports = {
  kind: 'pattern',
  defaultLanguages: null, // every language

  validateQuery(q) {
    const errors = [];
    const ids = q.pattern_ids || [];
    const classes = q.classes || [];
    if (!Array.isArray(ids) || !Array.isArray(classes)) return ['pattern_ids and classes must be lists'];
    if (ids.length === 0 && classes.length === 0) errors.push('pattern_ids or classes is required');
    for (const id of ids) if (!PATTERN_IDS.has(id)) errors.push(`unknown pattern id "${id}"`);
    for (const c of classes) if (!CLASSES.includes(c)) errors.push(`unknown class "${c}"`);
    return errors;
  },

  /**
   * @param {object} selector
   * @param {{ rel: string, text: string, valueFindings?: object[] }} file
   *   valueFindings: engine findings precomputed once per file by shard.js
   * @returns {{ startLine: number, endLine: number }[]}
   */
  match(selector, file) {
    const ids = new Set(selector.query.pattern_ids || []);
    const classes = new Set(selector.query.classes || []);
    const out = [];
    for (const f of file.valueFindings || []) {
      if (ids.has(f.id) || classes.has(classOf(f.id))) out.push({ startLine: f.line, endLine: f.line });
    }
    return out;
  },
};
