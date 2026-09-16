const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { scanDirectory } = require('../src/lib/scan-dir');
const reporter = require('../src/lib/reporter');

async function runReporterTests() {
  let passed = 0;
  let failed = 0;

  async function check(name, fn) {
    try {
      await fn();
      passed++;
    } catch (err) {
      console.error(`FAIL ${name}: ${err.message}`);
      failed++;
    }
  }

  // Build a small fake project in tmp so tests are deterministic.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kakashi-scan-dir-'));
  fs.writeFileSync(path.join(root, 'clean.md'), '# No secrets here\n');
  fs.writeFileSync(path.join(root, 'dirty.md'),
    '# Onboarding\nEmirates ID: 784-1990-9999999-0\nemail: ahmed@example.ae\n' +
    'OPENAI_API_KEY = "sk-proj-abc123def456ghi789jkl012mno345pqr678stu"\n');
  fs.mkdirSync(path.join(root, 'ignored_dir'));
  fs.writeFileSync(path.join(root, 'ignored_dir', 'secret.env'), 'DATABASE_URL=postgresql://a:b@c/d\n');
  fs.writeFileSync(path.join(root, '.kakashiignore'), 'ignored_dir\n');

  await check('scanDirectory walks tree + enriches with PDPL', async () => {
    const report = await scanDirectory(root);
    assert(report.files.length >= 2, `expected >=2 files (found ${report.files.length})`);
    // dirty.md must have findings; clean.md must not
    const dirty = report.files.find((f) => f.path.endsWith('dirty.md'));
    const clean = report.files.find((f) => f.path.endsWith('clean.md'));
    assert(dirty && dirty.findings.length >= 3, 'dirty.md must have >=3 findings');
    assert(clean && clean.findings.length === 0, 'clean.md must be empty');
    // findings must be PDPL-enriched
    assert(dirty.findings[0].severity, 'severity missing');
    assert(Array.isArray(dirty.findings[0].articles), 'articles missing');
  });

  await check('.kakashiignore excludes ignored_dir', async () => {
    const report = await scanDirectory(root);
    const scannedPaths = report.files.map((f) => f.path);
    assert(!scannedPaths.some((p) => p.includes('ignored_dir')),
      `ignored_dir must be skipped, but scanned: ${scannedPaths.join(', ')}`);
  });

  await check('reporter renders JSON', async () => {
    const report = await scanDirectory(root);
    const out = reporter.renderJson(report);
    const parsed = JSON.parse(out);
    assert(parsed.summary && parsed.files);
  });

  await check('reporter renders Markdown', async () => {
    const report = await scanDirectory(root);
    const out = reporter.renderMarkdown(report);
    assert(out.includes('Kakashi Compliance Report'));
    assert(out.includes('PDPL'));
  });

  await check('reporter renders HTML (English)', async () => {
    const report = await scanDirectory(root);
    const out = reporter.renderHtml(report, { lang: 'en' });
    assert(out.startsWith('<!doctype html>'));
    assert(out.includes('UAE Federal Decree-Law No. 45 of 2021'));
    assert(!out.includes('784-1990-9999999-0'), 'raw Emirates ID must NOT appear in report');
  });

  await check('reporter renders HTML (Arabic)', async () => {
    const report = await scanDirectory(root);
    const out = reporter.renderHtml(report, { lang: 'ar' });
    assert(out.includes('تقرير امتثال'));
    assert(out.includes('قانون حماية البيانات الشخصية'));
  });

  // Cleanup
  fs.rmSync(root, { recursive: true, force: true });

  console.log(`reporter.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runReporterTests };

if (require.main === module) {
  runReporterTests().then((ok) => process.exit(ok ? 0 : 1));
}
