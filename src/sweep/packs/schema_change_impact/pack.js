/**
 * schema_change_impact -- STUB pack.
 *
 * Recognised as an intent ("what breaks / leaks if we rename or drop this
 * column?") so the task is not reported as unrecognised, but it ships no
 * selectors yet. Selecting it adds nothing and removes nothing: the run still
 * covers the pii_flow_audit floor, and the intent analyzer adds the
 * SCHEMA_CHANGE_IMPACT_STUB note so reports say so instead of implying a
 * schema-impact analysis happened.
 */

module.exports = {
  id: 'schema_change_impact',
  title: 'Schema change impact (stub)',
  titleAr: 'أثر تغيير المخطط (تجريبي)',
  stub: true,
  selectorDir: null,
  description: 'Placeholder: schema-change impact analysis is not implemented yet; the PII floor still runs.',
};
