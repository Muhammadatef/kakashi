/**
 * Sweep REPORT: SARIF 2.1.0, so findings land in GitHub code scanning / IDE
 * problem panes. Rules are selector ids; results are deduped findings with
 * P0→error, P1→warning, P2→note. Messages carry only file:line edges and
 * classes, never values (includeValues is ignored here: SARIF is uploaded).
 */

const { fmtEdge } = require('./index');

const LEVEL = { P0: 'error', P1: 'warning', P2: 'note' };

function renderSarif(m) {
  const r = m.reduce;
  const ruleIds = new Set(Object.keys(r.coverage.bySelector || {}));
  for (const f of r.findings) for (const s of f.selector_ids) ruleIds.add(s);
  const rules = [...ruleIds].sort().map((id) => ({
    id,
    name: id,
    shortDescription: { text: `Kakashi Sweep selector ${id}` },
  }));
  const results = r.findings.map((f) => ({
    ruleId: f.selector_ids[0],
    level: LEVEL[f.severity] || 'note',
    message: { text: `${f.severity} ${f.sensitivity_classes.join(',') || 'PII'} flow: ${fmtEdge(f.edge) || `${f.file}:${f.line}`}` },
    locations: [{ physicalLocation: { artifactLocation: { uri: f.file }, region: { startLine: Math.max(1, f.line) } } }],
    partialFingerprints: { kakashiFindingKey: f.key },
    properties: {
      severity: f.severity, confidence: f.confidence, selector_ids: f.selector_ids, sink_type: f.sink_type,
      pdpl: f.pdpl.map((a) => a.article), owners: f.owners,
    },
  }));
  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'Kakashi Sweep', version: m.manifest.kakashiVersion || require('../../../package.json').version, rules } },
      results,
      properties: { run_id: m.manifest.run_id || null, decision: (m.manifest.decision && m.manifest.decision.decision) || 'IN_PROGRESS' },
    }],
  };
  return `${JSON.stringify(sarif, null, 2)}\n`;
}

module.exports = { renderSarif };
