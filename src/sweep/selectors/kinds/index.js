/**
 * Selector kind registry.
 *
 * Kind module contract (every file in this folder):
 *
 *   kind               string, equals the registry key
 *   defaultLanguages   string[] | null   languages the kind applies to when the
 *                      selector does not say (null = every language)
 *   validateQuery(q)   → string[] errors
 *   prepare?(ctx)      async, optional: load optional parsers once per run
 *   match(selector, file, ctx)
 *                      → Array<{ startLine, endLine, evidence_kind? }>
 *                        (sync or Promise). 1-based inclusive line spans.
 *
 *   file = { rel, ext, lang, text, valueFindings }
 *   ctx  = { optional: OptionalRegistry, project: { root, dbt } }
 *          project.dbt = null | { manifest, modelsByPath, ... } (fingerprint.js)
 *
 * A match NEVER carries matched text. Kinds report where, not what.
 */

module.exports = {
  pattern: require('./pattern'),
  regex: require('./regex'),
  sql_column: require('./sql_column'),
  dbt_graph: require('./dbt_graph'),
  ast: require('./ast'),
};
