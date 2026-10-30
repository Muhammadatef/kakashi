/**
 * logging_leak_audit -- task pack for "do we leak data into logs?".
 *
 * Added on top of the pii_flow_audit floor when the task talks about logs,
 * printing or leaks. The floor already flags logging of whole records; this
 * pack adds field-level logging of personal and secret attributes, in Python
 * and JavaScript, which is how most log leaks actually look in review.
 */

const path = require('path');

module.exports = {
  id: 'logging_leak_audit',
  title: 'Logging leak audit',
  titleAr: 'تدقيق تسريب السجلات',
  selectorDir: path.join(__dirname, 'selectors'),
  description: 'Finds log / print / console calls that interpolate personal attributes or secrets.',
};
