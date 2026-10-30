/**
 * Selector schema -- the contract every selector, built-in or proposed, obeys.
 *
 * A selector is DATA: an id, a kind, a sensitivity class and a kind-specific
 * query, plus fixtures that prove what it must and must not match. Sweep's
 * completeness rests on selector recall, so a selector that cannot show its
 * fixtures is not a selector.
 *
 *   id                 dotted lowercase, globally unique  (pii.sql.contact_columns)
 *   kind               pattern | sql_column | dbt_graph | ast | regex
 *   description        one line, what it finds
 *   rationale          why that matters (PDPL / data-flow reasoning)
 *   sensitivity_class  one of guardian/classes.js CLASSES
 *   evidence_kind      read | transform | join | export | log | expose | value
 *                      (the default for signals it emits; a kind may refine it)
 *   languages          optional: restrict to these file languages (see LANGUAGES)
 *   query              kind-specific object, validated by the kind module
 *   fixtures           { positive: Fixture[], negative: Fixture[] }
 *                      Fixture = string | { path, text } ; at least one positive
 *
 * Nothing here ever holds a matched value.
 */

const path = require('path');
const { CLASSES } = require('../../guardian/classes');

const SELECTOR_KINDS = ['pattern', 'sql_column', 'dbt_graph', 'ast', 'regex'];
const EVIDENCE_KINDS = ['read', 'transform', 'join', 'export', 'log', 'expose', 'value'];
const ID_RX = /^[a-z0-9_]+(\.[a-z0-9_-]+)+$/;

/** file extension → Sweep language. Anything else is 'other'. */
const LANGUAGES = {
  sql: 'sql', hql: 'sql', psql: 'sql', plsql: 'sql',
  py: 'python', pyw: 'python',
  ipynb: 'notebook',
  yml: 'yaml', yaml: 'yaml',
  json: 'json',
  tf: 'iac', tfvars: 'iac', hcl: 'iac',
  env: 'config', ini: 'config', cfg: 'config', conf: 'config', toml: 'config', properties: 'config',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'javascript',
  scala: 'scala', java: 'java', go: 'go',
  sh: 'shell', bash: 'shell',
};

/** @param {string} rel @returns {string} */
function languageOf(rel) {
  const base = path.basename(rel).toLowerCase();
  if (base === '.env' || base.startsWith('.env.')) return 'config';
  const ext = path.extname(base).slice(1);
  return LANGUAGES[ext] || 'other';
}

function isNonEmptyString(v) { return typeof v === 'string' && v.trim() !== ''; }

/**
 * Validate one selector. Kind-specific query validation is delegated to the
 * kind module so the schema stays task-agnostic.
 * @param {object} sel
 * @param {object} kinds  registry from ./kinds (kind → module)
 * @returns {string[]} errors (empty = valid)
 */
function validateSelector(sel, kinds) {
  const errors = [];
  if (!sel || typeof sel !== 'object' || Array.isArray(sel)) return ['selector must be a mapping'];
  const where = sel.id ? `selector ${sel.id}` : 'selector';
  if (!isNonEmptyString(sel.id) || !ID_RX.test(sel.id)) errors.push(`${where}: id must match ${ID_RX}`);
  if (!SELECTOR_KINDS.includes(sel.kind)) errors.push(`${where}: kind must be one of ${SELECTOR_KINDS.join('|')}`);
  for (const f of ['description', 'rationale']) {
    if (!isNonEmptyString(sel[f])) errors.push(`${where}: ${f} is required`);
  }
  if (!CLASSES.includes(sel.sensitivity_class)) {
    errors.push(`${where}: sensitivity_class "${sel.sensitivity_class}" is not a Guardian class (${CLASSES.join(', ')})`);
  }
  if (!EVIDENCE_KINDS.includes(sel.evidence_kind)) {
    errors.push(`${where}: evidence_kind must be one of ${EVIDENCE_KINDS.join('|')}`);
  }
  if (sel.languages !== undefined) {
    const known = new Set([...Object.values(LANGUAGES), 'other']);
    if (!Array.isArray(sel.languages) || sel.languages.some((l) => !known.has(l))) {
      errors.push(`${where}: languages must be a list of ${[...known].join('|')}`);
    }
  }
  if (!sel.query || typeof sel.query !== 'object' || Array.isArray(sel.query)) {
    errors.push(`${where}: query must be a mapping`);
  } else if (kinds && kinds[sel.kind]) {
    for (const e of kinds[sel.kind].validateQuery(sel.query)) errors.push(`${where}: query: ${e}`);
  }
  const fx = sel.fixtures;
  if (!fx || !Array.isArray(fx.positive) || !Array.isArray(fx.negative)) {
    errors.push(`${where}: fixtures.positive and fixtures.negative must be lists`);
  } else {
    if (fx.positive.length === 0) errors.push(`${where}: at least one positive fixture is required`);
    for (const f of [...fx.positive, ...fx.negative]) {
      const ok = isNonEmptyString(f) || (f && isNonEmptyString(f.text) && (f.path === undefined || isNonEmptyString(f.path)));
      if (!ok) errors.push(`${where}: each fixture is a string or { path, text }`);
    }
  }
  const allowed = new Set(['id', 'kind', 'description', 'rationale', 'sensitivity_class', 'evidence_kind', 'languages', 'query', 'fixtures']);
  for (const k of Object.keys(sel)) if (!allowed.has(k)) errors.push(`${where}: unknown field "${k}"`);
  return errors;
}

module.exports = { validateSelector, languageOf, SELECTOR_KINDS, EVIDENCE_KINDS, LANGUAGES, ID_RX };
