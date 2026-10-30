/**
 * Sweep REPORT: single-file HTML (no external CSS/JS, printable), styled like
 * src/lib/reporter.js. Arabic renders with dir="rtl". The Mermaid source is
 * embedded as a <pre class="mermaid"> block (escaped) so it is readable
 * offline and renders if the viewer has Mermaid; no script is loaded.
 */

const { fmtEdge } = require('./index');
const { mermaid } = require('./markdown');
const { titleFor } = require('../reduce/pdpl');

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const SEV_COLOR = { P0: '#b91c1c', P1: '#c2410c', P2: '#a16207' };
const badge = (s) => `<span class="badge" style="background:${SEV_COLOR[s] || '#666'}">${escapeHtml(s)}</span>`;

function renderHtml(m) {
  const { tr, reduce: r, lang } = m;
  const e = escapeHtml;
  const d = m.manifest.decision;
  const c = r.coverage;
  const parts = [];

  parts.push(`<h2>1. ${e(tr('decision'))}</h2>`);
  if (!d) parts.push(`<p>${e(tr('pending'))}</p>`);
  else {
    parts.push(`<p><strong>${e(d.decision)}</strong>${d.reasonCode ? ` <code>${e(d.reasonCode)}</code>` : ''}</p>`);
    if (d.gaps && d.gaps.length) parts.push(`<p>${e(tr('gaps'))}</p><ul>${d.gaps.map((g) => `<li>${e(g.type)} <code>${e(g.id)}</code>: ${e(g.reason)}</li>`).join('')}</ul>`);
  }

  const degr = (m.manifest.degradations || []).map((x) => (typeof x === 'string' ? x : `${x.module} (${x.install})`)).join(', ') || tr('none');
  parts.push(`<h2>2. ${e(tr('coverage'))}</h2>
<div class="meta">
  <div class="k">${e(tr('files_in_scope'))}</div><div>${c.filesInScope == null ? '-' : c.filesInScope}</div>
  <div class="k">${e(tr('files_with_signals'))}</div><div>${c.filesWithSignals}</div>
  <div class="k">${e(tr('signals'))}</div><div>${c.signals}</div>
  <div class="k">${e(tr('accounted'))}</div><div>${c.accounted}/${c.signals} (${c.accountedPct}%)</div>
  <div class="k">${e(tr('dismissed'))}</div><div>${r.dismissed.count}</div>
  <div class="k">${e(tr('degradations'))}</div><div>${e(degr)}</div>
  <div class="k">${e(tr('incremental'))}</div><div>${m.manifest.incremental ? `${e(tr('yes'))} (${e(m.manifest.incremental.since)})` : e(tr('no'))}</div>
</div>
<p class="muted">${e(tr('scope_statement'))}</p>
<table><thead><tr><th>${e(tr('selector'))}</th><th>${e(tr('signals'))}</th><th>${e(tr('accounted'))}</th></tr></thead><tbody>
${Object.entries(c.bySelector).map(([id, v]) => `<tr><td><code>${e(id)}</code></td><td class="num">${v.signals}</td><td class="num">${v.accounted}</td></tr>`).join('\n')}
</tbody></table>`);

  parts.push(`<h2>3. ${e(tr('findings'))}</h2>`);
  for (const sev of ['P0', 'P1', 'P2']) {
    const fs = r.findings.filter((f) => f.severity === sev);
    parts.push(`<h3>${badge(sev)} ${fs.length}</h3>`);
    if (!fs.length) continue;
    parts.push(`<table><thead><tr><th>${e(tr('location'))}</th><th>${e(tr('edge'))}</th><th>${e(tr('sink'))}</th><th>${e(tr('classes'))}</th><th>${e(tr('owners'))}</th>${m.values ? `<th>${e(tr('value'))}</th>` : ''}</tr></thead><tbody>
${fs.map((f) => `<tr><td><code>${e(f.file)}:${f.line}</code></td><td dir="ltr">${e(fmtEdge(f.edge))}</td><td>${e(f.sink_type)}</td><td>${e(f.sensitivity_classes.join(', '))}</td><td>${e(f.owners.join(' ') || '-')}</td>${m.values ? `<td><code>${e(m.values[f.key] || '')}</code></td>` : ''}</tr>`).join('\n')}
</tbody></table>`);
  }

  parts.push(`<h2>4. ${e(tr('chains'))}</h2>`);
  if (!r.chains.length) parts.push(`<p>${e(tr('none'))}</p>`);
  else {
    parts.push(`<pre class="mermaid" dir="ltr">${e(mermaid(r.chains))}</pre>`);
    parts.push(`<ul>${r.chains.map((ch) => `<li>${badge(ch.severity)} <code>${e(ch.id)}</code> <span dir="ltr">${ch.nodes.map((n) => `<code>${e(n)}</code>`).join(' &rarr; ')}</span> [${e(ch.classes.join(', '))}]${m.narrative.chains[ch.id] ? `<br><span class="muted">${e(m.narrative.chains[ch.id])}</span>` : ''}</li>`).join('\n')}</ul>`);
  }

  parts.push(`<h2>5. ${e(tr('pdpl'))}</h2>`);
  if (!r.pdpl.length) parts.push(`<p>${e(tr('none'))}</p>`);
  else parts.push(`<table><thead><tr><th>${e(tr('article'))}</th><th>${e(tr('article_title'))}</th><th>${e(tr('count'))}</th></tr></thead><tbody>
${r.pdpl.map((a) => `<tr><td><code>${e(a.article)}</code></td><td>${e(titleFor(a.article, lang))}</td><td class="num">${a.count}</td></tr>`).join('\n')}
</tbody></table>`);

  parts.push(`<h2>6. ${e(tr('remediation'))}</h2>`);
  const rem = r.findings.filter((f) => f.remediation || m.narrative.remediation[f.key]);
  parts.push(rem.length ? `<ul>${rem.map((f) => `<li><code>${e(f.file)}:${f.line}</code> ${badge(f.severity)} ${e(m.narrative.remediation[f.key] || f.remediation)}</li>`).join('\n')}</ul>` : `<p>${e(tr('none'))}</p>`);

  parts.push(`<h2>7. ${e(tr('iterations'))}</h2>`);
  parts.push(m.iterations.length ? `<ol>${m.iterations.map((it) => `<li><code dir="ltr">${e(JSON.stringify(it))}</code></li>`).join('\n')}</ol>` : `<p>${e(tr('none'))}</p>`);

  return `<!doctype html>
<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(tr('title'))}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, "Segoe UI", Cairo, "Noto Sans Arabic", sans-serif; max-width: 1100px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
  .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.3rem 1rem; background: rgba(0,0,0,0.03); padding: 0.75rem 1rem; border-radius: 6px; }
  .meta .k { color: #555; font-size: 0.9rem; }
  h2 { border-bottom: 1px solid #ccc; padding-bottom: 0.3rem; margin-top: 2rem; }
  table { width: 100%; border-collapse: collapse; margin: 0.5rem 0 1.5rem; }
  th, td { text-align: start; padding: 0.4rem 0.6rem; border-bottom: 1px solid #eee; vertical-align: top; }
  th { background: rgba(0,0,0,0.04); font-weight: 600; }
  td.num { text-align: end; font-variant-numeric: tabular-nums; }
  code { background: rgba(0,0,0,0.05); padding: 1px 4px; border-radius: 3px; font-size: 0.9em; overflow-wrap: anywhere; }
  pre.mermaid { background: rgba(0,0,0,0.04); padding: 0.75rem; overflow-x: auto; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; color: white; font-size: 0.75rem; }
  .muted { color: #888; font-style: italic; }
  .danger { background: #b91c1c; color: #fff; padding: 0.75rem 1rem; border-radius: 6px; font-weight: 700; }
  footer { margin-top: 3rem; color: #888; font-size: 0.85rem; text-align: center; }
  @media print { body { max-width: none; margin: 0; padding: 1cm; font-size: 10pt; } }
</style>
</head>
<body>
  <h1>${e(tr('title'))}</h1>
  ${m.includeValues ? `<p class="danger">${e(tr('values_banner'))}</p>` : ''}
  <p class="muted">run <code>${e(m.manifest.run_id || '-')}</code> · kakashi ${e(m.manifest.kakashiVersion || '-')}</p>
  ${parts.join('\n')}
  <footer>${e(tr('footer'))}</footer>
</body>
</html>
`;
}

module.exports = { renderHtml, escapeHtml };
