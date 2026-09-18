const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const formats = require('../src/engine/formats');
const { getExt, isTextFile, CODE_EXTS } = require('../src/engine/formats/text');
const { scanDirectory } = require('../src/lib/scan-dir');

function mkTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kakashi-formats-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true });

  fs.writeFileSync(path.join(root, 'config', '.env'),
    'DATABASE_URL=postgresql://admin:Pr0d_Pass@10.0.0.1:5432/db\n');
  fs.writeFileSync(path.join(root, 'src', 'app.py'), 'OWNER = "Ahmed Hassan"\n');
  fs.writeFileSync(path.join(root, 'src', 'main.go'),
    'const Key = "sk-proj-abcdefghijklmnopqrstuvwxyz1234"\n');
  fs.writeFileSync(path.join(root, 'src', 'main.tf'),
    'api_token = "ghp_abc123def456ghi789jkl012mno345pq"\n');
  fs.writeFileSync(path.join(root, 'src', 'deploy.sh'), 'export DB_PASSWORD=hunter2prod\n');
  fs.writeFileSync(path.join(root, 'Dockerfile'),
    'FROM alpine\nENV API_TOKEN=ghp_zzz111yyy222xxx333www444vvv\n');
  // Must stay excluded.
  fs.writeFileSync(path.join(root, 'node_modules', 'pkg', 'index.js'),
    'LEAK=sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n');
  return root;
}

async function runFormatsTests() {
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

  // ---------------------------------------------------------------------------
  // Dotfiles.
  //
  // path.extname('.env') === '' -- a leading dot marks a hidden file, not an
  // extension. That made the single most common secret file in existence report
  // as "Unsupported file format" while `demo.env` worked fine.
  // ---------------------------------------------------------------------------
  await check('getExt resolves dotfiles from the basename', () => {
    assert.strictEqual(getExt('.env'), 'env');
    assert.strictEqual(getExt('/a/b/.env'), 'env');
    assert.strictEqual(getExt('.env.local'), 'env');
    assert.strictEqual(getExt('.env.production'), 'env');
    assert.strictEqual(getExt('.gitignore'), 'gitignore');
    // Ordinary files must be unaffected.
    assert.strictEqual(getExt('demo.env'), 'env');
    assert.strictEqual(getExt('config.py'), 'py');
  });

  await check('dotfiles are recognised as maskable text', () => {
    for (const f of ['.env', '.env.local', '.env.production', '.gitignore']) {
      assert(isTextFile(f), `${f} should be maskable text`);
    }
  });

  await check('an unknown dotfile is still unsupported', () => {
    assert.strictEqual(getExt('.mystery'), '');
    assert.strictEqual(isTextFile('.mystery'), false);
  });

  await check('readFile accepts a file literally named .env', async () => {
    const root = mkTree();
    try {
      const data = await formats.readFile(path.join(root, 'config', '.env'));
      assert(data.text.includes('DATABASE_URL'), 'content not read');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // ---------------------------------------------------------------------------
  // Directory coverage must not drift from single-file coverage.
  //
  // SUPPORTED_EXTS was a hand-written list of 17 while the text engine knew 80+.
  // `kakashi scan main.go` reported a leaked key; `scan-dir` never opened the
  // file. A folder-level compliance report could read clean with live
  // credentials in main.tf.
  // ---------------------------------------------------------------------------
  await check('SUPPORTED_EXTS covers every extension the text engine reads', () => {
    const missing = [...CODE_EXTS].filter((e) => !formats.SUPPORTED_EXTS.includes(e));
    assert.strictEqual(missing.length, 0,
      `directory walks would skip these readable types: ${missing.join(', ')}`);
  });

  await check('extGlob does not emit a single-element brace list', () => {
    // `*.{py}` is not a brace expansion -- glob reads it literally and matches
    // nothing, which is why `mask-dir --ext py` always said "No matching files".
    assert.strictEqual(formats.extGlob(['py'], '**/'), '**/*.py');
    assert.strictEqual(formats.extGlob(['py', 'js'], '**/'), '**/*.{py,js}');
  });

  await check('globPatterns only recurses when asked', () => {
    // commander leaves --recursive undefined when the flag is absent, so the
    // default must not be `true` or `mask-dir` silently descends.
    assert(formats.globPatterns(false).every((p) => !p.startsWith('**/')), 'should not recurse');
    assert(formats.globPatterns(true).every((p) => p.startsWith('**/')), 'should recurse');
    assert(formats.globPatterns().every((p) => !p.startsWith('**/')), 'default must not recurse');
  });

  await check('globPatterns can drop the extensionless names', () => {
    assert.strictEqual(formats.globPatterns(true, ['py'], false).length, 1);
  });

  await check('globPatterns also matches extensionless names', () => {
    const pats = formats.globPatterns(true);
    assert(Array.isArray(pats) && pats.length === 2, 'expected an extension and a filename pattern');
    assert(pats.some((p) => p.includes('dockerfile')), 'Dockerfile/Makefile pattern missing');
  });

  // ---------------------------------------------------------------------------
  // End-to-end: the whole point is that a folder scan opens these files.
  // ---------------------------------------------------------------------------
  await check('scanDirectory finds secrets in .env, .go, .tf, .sh and Dockerfile', async () => {
    const root = mkTree();
    try {
      const report = await scanDirectory(root, { respectGitignore: false });
      const seen = report.files.filter((f) => f.findings.length > 0).map((f) => path.basename(f.path));
      for (const want of ['.env', 'main.go', 'main.tf', 'deploy.sh', 'Dockerfile']) {
        assert(seen.includes(want), `${want} was not scanned (saw: ${seen.join(', ') || 'nothing'})`);
      }
      assert(!seen.includes('index.js'), 'node_modules must stay excluded');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // ---------------------------------------------------------------------------
  // Honouring .gitignore is deliberate, but silent omission is not acceptable
  // in a compliance report -- `.env` is gitignored in most repos.
  // ---------------------------------------------------------------------------
  await check('scanDirectory reports how many files .gitignore hid', async () => {
    const root = mkTree();
    try {
      fs.writeFileSync(path.join(root, '.gitignore'), 'src/main.tf\nnode_modules/\n');
      const honoured = await scanDirectory(root, { respectGitignore: true });
      const everything = await scanDirectory(root, { respectGitignore: false });
      assert(honoured.skippedByIgnoreFile > 0,
        'a hidden file must be counted, not silently dropped');
      assert.strictEqual(
        honoured.files.length + honoured.skippedByIgnoreFile,
        everything.files.length,
        'skipped count must reconcile with an unfiltered scan',
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await check('skippedByIgnoreFile is 0 when nothing is hidden', async () => {
    const root = mkTree();
    try {
      const report = await scanDirectory(root, { respectGitignore: true });
      assert.strictEqual(report.skippedByIgnoreFile, 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  console.log(`formats.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runFormatsTests };

if (require.main === module) {
  runFormatsTests().then((ok) => process.exit(ok ? 0 : 1));
}
