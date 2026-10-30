/**
 * pii_flow_audit -- Sweep's built-in coverage floor for PII / PDPL data flows.
 *
 * Data only: the selectors in ./selectors are the minimum every Sweep run
 * looks for (hardcoded values, PII columns in SQL, dbt lineage from pii-tagged
 * sources, Python/Airflow sinks). Task-specific selectors add to this floor;
 * they never replace it.
 */

const path = require('path');

module.exports = {
  id: 'pii_flow_audit',
  title: 'PII flow audit',
  titleAr: 'تدقيق تدفق البيانات الشخصية',
  selectorDir: path.join(__dirname, 'selectors'),
  description: 'Finds code that reads, transforms, joins, logs, exports or exposes personal data across dbt, SQL, Airflow and Python, plus hardcoded PII and credentials.',
};
