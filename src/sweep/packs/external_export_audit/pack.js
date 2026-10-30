/**
 * external_export_audit -- task pack for "where does data leave the estate?".
 *
 * Added on top of the pii_flow_audit floor when the task talks about exports,
 * uploads, egress or third parties. It adds selectors for egress endpoints the
 * floor does not name on their own (cloud object URIs being written, webhook /
 * chat endpoints, any column at all in a COPY / UNLOAD). It never replaces the
 * floor: Sweep's intent rule only lets a task ADD packs.
 */

const path = require('path');

module.exports = {
  id: 'external_export_audit',
  title: 'External export audit',
  titleAr: 'تدقيق التصدير الخارجي',
  selectorDir: path.join(__dirname, 'selectors'),
  description: 'Finds code paths that write data to object storage, SFTP, webhooks or bulk COPY/UNLOAD destinations outside the warehouse.',
};
