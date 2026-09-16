const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { t, resolveLang, getLang } = require('../src/lib/i18n');

const CLI = path.join(__dirname, '..', 'bin', 'kakashi.js');
const UAE_FIXTURE = path.join(__dirname, 'fixtures', 'uae_sample.md');

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function runI18nTests() {
  let passed = 0;
  let failed = 0;

  function check(name, fn) {
    try {
      fn();
      passed++;
    } catch (err) {
      console.error(`FAIL ${name}: ${err.message}`);
      failed++;
    }
  }

  check('resolveLang honours explicit code', () => {
    resolveLang('ar');
    assert.strictEqual(getLang(), 'ar');
    resolveLang('en');
    assert.strictEqual(getLang(), 'en');
  });

  check('resolveLang honours KAKASHI_LANG env', () => {
    const orig = process.env.KAKASHI_LANG;
    process.env.KAKASHI_LANG = 'ar';
    resolveLang(null);
    assert.strictEqual(getLang(), 'ar');
    process.env.KAKASHI_LANG = orig || '';
    if (!orig) delete process.env.KAKASHI_LANG;
    resolveLang('en'); // reset for other tests
  });

  check('resolveLang detects ar_AE.UTF-8 LANG', () => {
    const origK = process.env.KAKASHI_LANG;
    const origL = process.env.LANG;
    delete process.env.KAKASHI_LANG;
    process.env.LANG = 'ar_AE.UTF-8';
    resolveLang(null);
    assert.strictEqual(getLang(), 'ar');
    process.env.LANG = origL || '';
    if (origK) process.env.KAKASHI_LANG = origK;
    resolveLang('en');
  });

  check('t() returns English by default', () => {
    resolveLang('en');
    assert.strictEqual(t('id_docs_short'), 'ID & docs');
  });

  check('t() returns Arabic when lang=ar', () => {
    resolveLang('ar');
    const ar = t('id_docs_short');
    assert(ar.length > 0);
    // must contain Arabic characters (Unicode range)
    assert(/[\u0600-\u06FF]/.test(ar), `expected Arabic chars, got: ${ar}`);
    resolveLang('en');
  });

  check('t() substitutes {placeholders}', () => {
    resolveLang('en');
    const s = t('apply_hint', { cli: 'kakashi' });
    assert(s.includes('kakashi'));
  });

  check('CLI --lang ar prints Arabic scan header', () => {
    const r = runCli(['--lang', 'ar', 'scan', UAE_FIXTURE]);
    // Exit 1 because findings > 0
    if (r.status !== 1) throw new Error(`expected 1, got ${r.status}. stderr=${r.stderr}`);
    if (!/[\u0600-\u06FF]/.test(r.stdout)) {
      throw new Error(`Expected Arabic in output, got:\n${r.stdout}`);
    }
  });

  check('CLI without --lang stays English', () => {
    const r = runCli(['scan', UAE_FIXTURE]);
    if (r.status !== 1) throw new Error(`expected 1, got ${r.status}`);
    if (!r.stdout.includes('findings')) {
      throw new Error(`Expected English 'findings', got:\n${r.stdout}`);
    }
  });

  console.log(`i18n.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runI18nTests };

if (require.main === module) {
  process.exit(runI18nTests() ? 0 : 1);
}
