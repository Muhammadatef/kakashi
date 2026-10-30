/**
 * Sweep REPORT: Markdown (+ Mermaid). Also exports the shared Mermaid
 * builder and section data helpers used by the HTML renderer.
 *
 * Mermaid node ids are synthetic (n0, n1, ...); labels are graph node ids
 * (file paths / model names / sink kinds) with quote, angle-bracket and
 * backtick characters escaped so a crafted path cannot break the diagram.
 */

const { fmtEdge } = require('./index');
const { titleFor } = require('../reduce/pdpl');

function mermaidLabel(s) {
  return String(s).replace(/[^\w ./:\-@+]/g, (c) => `#${c.charCodeAt(0)};`);
}

function mermaid(chains) {
  const ids = new Map();
  const idOf = (n) => { if (!ids.has(n)) ids.set(n, `n${ids.size}`); return ids.get(n); };
  const lines = ['flowchart LR'];
  const edges = new Set();
  for (const c of chains) for (let i = 0; i + 1 < c.nodes.length; i++) edges.add(`${c.nodes[i]}\u0000${c.nodes[i + 1]}`);
  for (const c of chains) for (const n of c.nodes) idOf(n);
  for (const [n, id] of ids) {
    const lbl = `"${mermaidLabel(n)}"`;
    lines.push(n.startsWith('sink:') || n.startsWith('exposure:') ? `  ${id}[[${lbl}]]` : n.startsWith('source:') ? `  ${id}[(${lbl})]` : `  ${id}[${lbl}]`);
  }
  for (const e of [...edges].sort()) { const [a, b] = e.split('\u0000'); lines.push(`  ${idOf(a)} --> ${idOf(b)}`); }
  return lines.join('\n');
}

function decisionOf(m) { return m.manifest.decision || null; }

function mdCell(s) { return String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' '); }

function renderMarkdown(m) {
  const { tr, reduce: r } = m;
  const out = [];
  out.push(`# ${tr('title')}`, '');
  if (m.includeValues) out.push(`> **${tr('values_banner')}**`, '');
  out.push(`run: \`${m.manifest.run_id || '-'}\` | kakashi ${m.manifest.kakashiVersion || '-'}`, '');

  // 1 Decision
  const d = decisionOf(m);
  out.push(`## 1. ${tr('decision')}`, '');
  if (!d) out.push(tr('pending'));
  else {
    out.push(`**${d.decision}**${d.reasonCode ? ` (${d.reasonCode})` : ''}`, '');
    if (d.gaps && d.gaps.length) {
      out.push(`${tr('gaps')}:`, '');
      for (const g of d.gaps) out.push(`- ${g.type} \`${mdCell(g.id)}\`: ${mdCell(g.reason)}`);
    }
  }
  out.push('');

  // 2 Coverage
  const c = r.coverage;
  out.push(`## 2. ${tr('coverage')}`, '');
  out.push(`- ${tr('files_in_scope')}: ${c.filesInScope == null ? '-' : c.filesInScope}`);
  out.push(`- ${tr('files_with_signals')}: ${c.filesWithSignals}`);
  out.push(`- ${tr('signals')}: ${c.signals}`);
  out.push(`- ${tr('accounted')}: ${c.accounted}/${c.signals} (${c.accountedPct}%)`);
  out.push(`- ${tr('dismissed')}: ${r.dismissed.count}`);
  out.push(`- ${tr('degradations')}: ${(m.manifest.degradations || []).map((x) => (typeof x === 'string' ? x : `${x.module} (${x.install})`)).join(', ') || tr('none')}`);
  out.push(`- ${tr('incremental')}: ${m.manifest.incremental ? `${tr('yes')} (since ${m.manifest.incremental.since})` : tr('no')}`);
  out.push('', `_${tr('scope_statement')}_`, '');
  out.push(`| ${tr('selector')} | ${tr('signals')} | ${tr('accounted')} |`, '|---|---:|---:|');
  for (const [id, v] of Object.entries(c.bySelector)) out.push(`| \`${id}\` | ${v.signals} | ${v.accounted} |`);
  out.push('');

  // 3 Findings
  out.push(`## 3. ${tr('findings')}`, '');
  for (const sev of ['P0', 'P1', 'P2']) {
    const fs = r.findings.filter((f) => f.severity === sev);
    out.push(`### ${sev} (${fs.length})`, '');
    if (!fs.length) { out.push(tr('none'), ''); continue; }
    out.push(`| ${tr('location')} | ${tr('edge')} | ${tr('sink')} | ${tr('classes')} | ${tr('owners')} |`, '|---|---|---|---|---|');
    for (const f of fs) out.push(`| \`${mdCell(f.file)}:${f.line}\` | ${mdCell(fmtEdge(f.edge))} | ${f.sink_type} | ${f.sensitivity_classes.join(', ')} | ${mdCell(f.owners.join(' ')) || '-'} |`);
    out.push('');
    if (m.values) {
      for (const f of fs) if (m.values[f.key] != null) out.push(`- ${tr('value')} \`${mdCell(f.file)}:${f.line}\`: \`${mdCell(m.values[f.key]).replace(/`/g, "'")}\``);
      out.push('');
    }
  }

  // 4 Chains
  out.push(`## 4. ${tr('chains')}`, '');
  if (!r.chains.length) out.push(tr('none'), '');
  else {
    out.push('```mermaid', mermaid(r.chains), '```', '');
    for (const ch of r.chains) {
      out.push(`- **${ch.severity}** \`${ch.id}\`: ${ch.nodes.map((n) => `\`${mdCell(n)}\``).join(' -> ')} [${ch.classes.join(', ')}]`);
      if (m.narrative.chains[ch.id]) out.push(`  - ${mdCell(m.narrative.chains[ch.id])}`);
    }
    out.push('');
  }

  // 5 PDPL
  out.push(`## 5. ${tr('pdpl')}`, '');
  if (!r.pdpl.length) out.push(tr('none'), '');
  else {
    out.push(`| ${tr('article')} | ${tr('article_title')} | ${tr('count')} |`, '|---|---|---:|');
    for (const a of r.pdpl) out.push(`| ${a.article} | ${mdCell(titleFor(a.article, m.lang))} | ${a.count} |`);
    out.push('');
  }

  // 6 Remediation
  out.push(`## 6. ${tr('remediation')}`, '');
  const rem = r.findings.filter((f) => f.remediation || m.narrative.remediation[f.key]);
  if (!rem.length) out.push(tr('none'));
  for (const f of rem) out.push(`- \`${mdCell(f.file)}:${f.line}\` (${f.severity}): ${mdCell(m.narrative.remediation[f.key] || f.remediation)}`);
  out.push('');

  // 7 Iterations
  out.push(`## 7. ${tr('iterations')}`, '');
  if (!m.iterations.length) out.push(tr('none'));
  for (const e of m.iterations) {
    const { iteration, stage, ...rest } = e;
    out.push(`- #${iteration == null ? '-' : iteration} ${stage || ''} ${Object.entries(rest).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ')}`.trimEnd());
  }
  out.push('', `---`, `_${tr('footer')}_`, '');
  return out.join('\n');
}

module.exports = { renderMarkdown, mermaid, mermaidLabel };
