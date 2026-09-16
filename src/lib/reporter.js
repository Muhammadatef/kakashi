/**
 * Compliance reporter — renders aggregate scan results in
 *   - JSON  (machine-readable, for CI / SIEM integration)
 *   - HTML  (audit-ready, bilingual EN/AR, printable via `chrome --print-to-pdf`)
 *   - Markdown (human-readable, for CLI stdout or PR comments)
 *
 * Every renderer receives the SAME shape:
 *   {
 *     rootPath:    string,
 *     scannedAt:   ISO datetime string,
 *     durationMs:  number,
 *     files: [
 *       { path, findings: [enrichedFinding], errors?: [msg] }
 *     ],
 *     summary: (from src/lib/pdpl-mapping summarize())
 *   }
 *
 * The reporter is DATA-IN, STRING-OUT — no filesystem writes here. The CLI
 * layer decides whether to `console.log()` or write to disk.
 */

const { ARTICLES } = require('./pdpl-mapping');

// ---------------------------------------------------------------------------
// JSON — trivial. Everything is already serialisable.
// ---------------------------------------------------------------------------
function renderJson(report) {
  return JSON.stringify(report, null, 2);
}

// ---------------------------------------------------------------------------
// Markdown — for CLI or PR comments.
// ---------------------------------------------------------------------------
function renderMarkdown(report) {
  const { summary, files, rootPath, scannedAt, durationMs } = report;
  const lines = [];
  lines.push(`# Kakashi Compliance Report`);
  lines.push('');
  lines.push(`**Root:** \`${rootPath}\``);
  lines.push(`**Scanned:** ${scannedAt}`);
  lines.push(`**Duration:** ${(durationMs / 1000).toFixed(2)}s`);
  lines.push(`**Files:** ${files.length}`);
  lines.push('');
  lines.push(`## Summary`);
  lines.push('');
  lines.push(`- **Total findings:** ${summary.total}`);
  lines.push(`- **By category:** ${summary.byCategory.id} ID & docs · ${summary.byCategory.pii} personal info · ${summary.byCategory.cred} credentials`);
  lines.push(`- **By severity:** ${summary.bySeverity.critical} critical · ${summary.bySeverity.high} high · ${summary.bySeverity.medium} medium · ${summary.bySeverity.low} low`);
  lines.push('');
  lines.push(`## Top PDPL articles cited`);
  lines.push('');
  lines.push('| Article | Title (EN) | Findings |');
  lines.push('| --- | --- | ---: |');
  for (const a of summary.topArticles) {
    lines.push(`| ${a.code} | ${a.title_en} | ${a.count} |`);
  }
  lines.push('');
  lines.push(`## Files with findings`);
  lines.push('');
  for (const f of files) {
    if (!f.findings.length) continue;
    lines.push(`### \`${f.path}\` — ${f.findings.length} finding(s)`);
    lines.push('');
    lines.push('| Line | Type | Severity | PDPL |');
    lines.push('| ---: | --- | --- | --- |');
    for (const fnd of f.findings.slice(0, 30)) {
      lines.push(`| ${fnd.line} | ${fnd.label} | ${fnd.severity} | ${fnd.articles.join(', ')} |`);
    }
    if (f.findings.length > 30) {
      lines.push(`| … | … | … | (${f.findings.length - 30} more) |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// HTML — audit-ready, bilingual, printable.
//
// Design choices:
//   - Zero external CSS/JS. Report is a single file that opens anywhere.
//   - dir="auto" so Arabic content renders RTL and English LTR automatically.
//   - `@media print` styles let the file be converted to PDF via:
//        chrome --headless --print-to-pdf=report.pdf report.html
//     (or Safari, or wkhtmltopdf, or LibreOffice — no bundled PDF renderer
//     because that would add a heavy dependency for a one-line workflow.)
// ---------------------------------------------------------------------------
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function severityBadge(sev) {
  const colors = {
    critical: '#b91c1c',
    high: '#c2410c',
    medium: '#a16207',
    low: '#4d7c0f',
  };
  return `<span class="badge" style="background:${colors[sev] || '#666'}">${sev}</span>`;
}

function renderHtml(report, { lang = 'en' } = {}) {
  const { summary, files, rootPath, scannedAt, durationMs } = report;
  const isAr = lang === 'ar';
  const t = isAr ? {
    title:      'تقرير امتثال Kakashi',
    subtitle:   'قانون حماية البيانات الشخصية الاتحادي رقم 45 لسنة 2021',
    root:       'المسار',
    scanned:    'وقت الفحص',
    duration:   'المدة',
    files:      'الملفات',
    summary:    'الملخص',
    totalFind:  'إجمالي النتائج',
    byCat:      'حسب الفئة',
    bySev:      'حسب الخطورة',
    topArt:     'أعلى المواد المستشهد بها من قانون حماية البيانات',
    findingsIn: 'النتائج في',
    art:        'المادة',
    titleCol:   'العنوان',
    count:      'العدد',
    line:       'السطر',
    type:       'النوع',
    severity:   'الخطورة',
    footer:     'أنتج بواسطة Kakashi — كل المعالجة محلية، بدون اتصالات شبكية.',
  } : {
    title:      'Kakashi Compliance Report',
    subtitle:   'UAE Federal Decree-Law No. 45 of 2021 (Personal Data Protection)',
    root:       'Root',
    scanned:    'Scanned at',
    duration:   'Duration',
    files:      'Files',
    summary:    'Summary',
    totalFind:  'Total findings',
    byCat:      'By category',
    bySev:      'By severity',
    topArt:     'Top PDPL articles cited',
    findingsIn: 'Findings in',
    art:        'Article',
    titleCol:   'Title',
    count:      'Count',
    line:       'Line',
    type:       'Type',
    severity:   'Severity',
    footer:     'Generated by Kakashi — all processing is local, zero network calls.',
  };

  const catRow = `${summary.byCategory.id} ID & docs · ${summary.byCategory.pii} personal info · ${summary.byCategory.cred} credentials`;
  const sevRow =
    `${summary.bySeverity.critical} critical · ${summary.bySeverity.high} high · ` +
    `${summary.bySeverity.medium} medium · ${summary.bySeverity.low} low`;

  const filesHtml = files
    .filter((f) => f.findings.length > 0)
    .map((f) => {
      const rows = f.findings.slice(0, 100).map((fnd) => `
        <tr>
          <td class="num">${fnd.line}</td>
          <td>${escapeHtml(isAr && fnd.labelAr ? fnd.labelAr : fnd.label)}</td>
          <td>${severityBadge(fnd.severity)}</td>
          <td>${fnd.articles.map((a) => `<code>${a}</code>`).join(' ')}</td>
        </tr>`).join('');
      const more = f.findings.length > 100
        ? `<tr><td colspan="4" class="muted">… ${f.findings.length - 100} more</td></tr>` : '';
      return `
      <section class="file">
        <h3><code>${escapeHtml(f.path)}</code> — ${f.findings.length}</h3>
        <table>
          <thead><tr><th>${t.line}</th><th>${t.type}</th><th>${t.severity}</th><th>PDPL</th></tr></thead>
          <tbody>${rows}${more}</tbody>
        </table>
      </section>`;
    }).join('\n');

  return `<!doctype html>
<html lang="${lang}" dir="auto">
<head>
<meta charset="utf-8">
<title>${t.title}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, "Segoe UI", Cairo, "Noto Sans Arabic", sans-serif; max-width: 1100px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
  h1 { margin-bottom: 0.25rem; }
  .subtitle { color: #666; margin-top: 0; }
  .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.3rem 1rem; background: rgba(0,0,0,0.03); padding: 0.75rem 1rem; border-radius: 6px; }
  .meta .k { color: #555; font-size: 0.9rem; }
  h2 { border-bottom: 1px solid #ccc; padding-bottom: 0.3rem; margin-top: 2rem; }
  table { width: 100%; border-collapse: collapse; margin: 0.5rem 0 1.5rem; }
  th, td { text-align: start; padding: 0.4rem 0.6rem; border-bottom: 1px solid #eee; }
  th { background: rgba(0,0,0,0.04); font-weight: 600; }
  td.num { text-align: end; color: #666; font-variant-numeric: tabular-nums; }
  code { background: rgba(0,0,0,0.05); padding: 1px 4px; border-radius: 3px; font-size: 0.9em; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; color: white; font-size: 0.75rem; text-transform: uppercase; }
  .muted { color: #888; font-style: italic; }
  footer { margin-top: 3rem; color: #888; font-size: 0.85rem; text-align: center; }
  section.file { margin-top: 1rem; }
  @media print {
    body { max-width: none; margin: 0; padding: 1cm; font-size: 10pt; }
    section.file { break-inside: avoid; }
  }
</style>
</head>
<body>
  <h1>${t.title}</h1>
  <p class="subtitle">${t.subtitle}</p>
  <div class="meta">
    <div class="k">${t.root}</div><div><code>${escapeHtml(rootPath)}</code></div>
    <div class="k">${t.scanned}</div><div>${scannedAt}</div>
    <div class="k">${t.duration}</div><div>${(durationMs / 1000).toFixed(2)}s</div>
    <div class="k">${t.files}</div><div>${files.length}</div>
  </div>

  <h2>${t.summary}</h2>
  <div class="meta">
    <div class="k">${t.totalFind}</div><div><strong>${summary.total}</strong></div>
    <div class="k">${t.byCat}</div><div>${catRow}</div>
    <div class="k">${t.bySev}</div><div>${sevRow}</div>
  </div>

  <h2>${t.topArt}</h2>
  <table>
    <thead><tr><th>${t.art}</th><th>${t.titleCol}</th><th>${t.count}</th></tr></thead>
    <tbody>
      ${summary.topArticles.map((a) => `
        <tr>
          <td><code>${a.code}</code></td>
          <td>${escapeHtml(isAr && a.title_ar ? a.title_ar : a.title_en)}</td>
          <td class="num">${a.count}</td>
        </tr>`).join('')}
    </tbody>
  </table>

  <h2>${t.findingsIn}</h2>
  ${filesHtml || '<p class="muted">No findings.</p>'}

  <footer>${t.footer}</footer>
</body>
</html>`;
}

module.exports = { renderJson, renderMarkdown, renderHtml };
