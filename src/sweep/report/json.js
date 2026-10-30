/**
 * Sweep REPORT: JSON. Machine-readable mirror of the seven report sections,
 * stable key order, value-free unless includeValues was requested (then the
 * top-level agentSafe flag is false).
 */

function renderJson(m) {
  const r = m.reduce;
  const out = {
    report: 'kakashi-sweep',
    agentSafe: !m.includeValues,
    run_id: m.manifest.run_id || null,
    kakashiVersion: m.manifest.kakashiVersion || null,
    decision: m.manifest.decision || { decision: 'IN_PROGRESS' },
    coverage: {
      ...r.coverage,
      scopeStatement: m.tr('scope_statement'),
      degradations: m.manifest.degradations || [],
      incremental: m.manifest.incremental || null,
      dismissed: r.dismissed,
    },
    findings: r.findings.map((f) => ({
      ...f,
      narrative: m.narrative.remediation[f.key] || null,
      ...(m.values ? { value: m.values[f.key] || null } : {}),
    })),
    chains: r.chains.map((c) => ({ ...c, narrative: m.narrative.chains[c.id] || null })),
    graph: r.graph,
    pdpl: r.pdpl,
    iterations: m.iterations,
  };
  return `${JSON.stringify(out, null, 2)}\n`;
}

module.exports = { renderJson };
