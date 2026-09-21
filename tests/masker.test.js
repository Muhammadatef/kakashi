const assert = require('assert');
const { maskText } = require('../src/engine/masker');

function runMaskerTests() {
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

  check('typed mode', () => {
    const { masked, findings } = maskText('Email: test@example.com', { enabled: ['email'] });
    assert(findings.length === 1);
    assert(masked.includes('[EMAIL_1]'));
    assert(!masked.includes('test@example.com'));
  });

  check('redact mode', () => {
    const { masked } = maskText('Email: test@example.com', { enabled: ['email'], mode: 'redact' });
    assert(masked.includes('[REDACTED]'));
  });

  check('fake mode', () => {
    const { masked } = maskText('Email: test@example.com', { enabled: ['email'], mode: 'fake' });
    assert(!masked.includes('test@example.com'));
    assert(masked.includes('@'));
  });

  check('consistency', () => {
    const text = 'a@test.com and a@test.com again';
    const { masked, findings } = maskText(text, { enabled: ['email'] });
    assert(findings.length === 2);
    assert(findings[0].replacement === findings[1].replacement);
  });

  check('whitelist', () => {
    const { findings } = maskText('Email: keep@example.com', {
      enabled: ['email'],
      whitelist: ['keep@example.com'],
    });
    assert(findings.length === 0);
  });

  check('line numbers', () => {
    const text = 'line1\nline2 test@example.com\nline3';
    const { findings } = maskText(text, { enabled: ['email'] });
    assert(findings[0].line === 2);
  });

  check('sql_password masks value but keeps the statement readable', () => {
    const sql = "CREATE USER app IDENTIFIED BY 'S3cret!';";
    const { masked, findings } = maskText(sql, { enabled: ['sql_password'] });
    assert(findings.length === 1, 'expected exactly one finding');
    assert(masked.includes('CREATE USER app IDENTIFIED BY '), 'keyword/context dropped');
    assert(masked.includes('[SQL_PASSWORD_1]'), 'token not inserted');
    assert(!masked.includes('S3cret!'), 'secret leaked');
  });

  // -------------------------------------------------------------------------
  // Shared token state across calls.
  //
  // maskText() defaults valueMap/counters to fresh objects, which is right for
  // a one-shot call but wrong for a caller masking one dataset across MANY
  // calls. db/index.js masks row by row: without shared state every row
  // restarted at `_1`, so five distinct customers all became [FULL_NAME_1] and
  // the masked result could no longer be counted, joined or grouped.
  // -------------------------------------------------------------------------
  check('shared valueMap/counters — distinct values get distinct tokens', () => {
    const valueMap = {};
    const counters = {};
    const out = ['Ahmed Hassan', 'Fatima Zaabi', 'Sara Nuaimi']
      .map((n) => maskText(n, { valueMap, counters, enabled: ['full_name'] }).masked);
    assert.deepStrictEqual(out, ['[FULL_NAME_1]', '[FULL_NAME_2]', '[FULL_NAME_3]']);
  });

  check('shared valueMap/counters — the same value gets the same token', () => {
    const valueMap = {};
    const counters = {};
    const out = ['Ahmed Hassan', 'Fatima Zaabi', 'Ahmed Hassan']
      .map((n) => maskText(n, { valueMap, counters, enabled: ['full_name'] }).masked);
    assert.strictEqual(out[0], out[2], 'same person must map to the same token');
    assert.notStrictEqual(out[0], out[1], 'different people must not collapse');
  });

  check('token state is still isolated per call by default', () => {
    // Backwards compatibility: callers that pass nothing must be unaffected.
    const out = ['Ahmed Hassan', 'Fatima Zaabi']
      .map((n) => maskText(n, { enabled: ['full_name'] }).masked);
    assert.deepStrictEqual(out, ['[FULL_NAME_1]', '[FULL_NAME_1]']);
  });

  // -------------------------------------------------------------------------
  // env_secret replaces the VALUE, not the whole assignment.
  //
  // It used to consume `KEY=value` entirely, so `OPENAI_API_KEY=sk-...` masked
  // to a bare `[ENV_SECRET_1]`: the variable name -- the one piece of context an
  // agent needs to reason about the file -- was destroyed, and because the wide
  // match started earlier than the value, it also shadowed every specific
  // credential pattern. The `[OPENAI_KEY_1]` token the README advertises could
  // not actually be produced.
  // -------------------------------------------------------------------------
  check('env_secret keeps the key name and yields to specific patterns', () => {
    const cases = [
      ['OPENAI_API_KEY=sk-proj-xK9mN2pQrStUvWxYz1234567890abcdef', 'OPENAI_API_KEY=[OPENAI_KEY_1]'],
      ['STRIPE_SECRET=sk_live_51HGk2nKZ6eKyOrNm1234567890', 'STRIPE_SECRET=[STRIPE_1]'],
      ['SUPPORT_EMAIL=support@example.com', 'SUPPORT_EMAIL=[EMAIL_1]'],
      ['API_KEY = "sk-proj-xK9mN2pQrStUvWxYz1234"', 'API_KEY = "[OPENAI_KEY_1]"'],
      ['password: hunter2secret', 'password: [ENV_SECRET_1]'],
    ];
    for (const [input, want] of cases) {
      assert.strictEqual(maskText(input).masked, want, `masking ${JSON.stringify(input)}`);
    }
  });

  check('env_secret still masks a value with no specific pattern', () => {
    const { masked, findings } = maskText('DB_PASSWORD=Pr0d_P@55w0rd!');
    assert(masked.startsWith('DB_PASSWORD='), `key name lost: ${masked}`);
    assert(!masked.includes('Pr0d_P@55w0rd!'), `secret leaked: ${masked}`);
    assert(findings.some((f) => f.id === 'env_secret'), 'expected an env_secret finding');
  });

  // Masking its own output must be a no-op. Narrowing env_secret to the value
  // briefly broke this: `API_KEY=[OPENAI_KEY_1]` still reads as KEY=value, so a
  // second pass "found" a secret -- and the Guardian, which re-scans its own
  // artifact, escalated until it gave up and returned BLOCK.
  check('masking is idempotent', () => {
    const inputs = [
      'API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz1234',
      'API_KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz1234"',
      'DB_PASSWORD=hunter2prod',
      'SUPPORT_EMAIL=support@example.com',
    ];
    for (const mode of ['typed', 'redact']) {
      for (const input of inputs) {
        const once = maskText(input, { mode }).masked;
        const twice = maskText(once, { mode }).masked;
        assert.strictEqual(twice, once, `${mode} not idempotent for ${JSON.stringify(input)}`);
      }
    }
  });

  check('an already-masked value is not reported as a fresh finding', () => {
    for (const t of ['API_KEY=[OPENAI_KEY_1]', 'API_KEY = "[REDACTED]"', 'TOKEN=[ENV_SECRET_12]']) {
      const { findings } = maskText(t, { enabled: ['env_secret'] });
      assert.strictEqual(findings.length, 0, `${t} re-detected as a secret`);
    }
  });

  console.log(`masker.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runMaskerTests };

if (require.main === module) {
  process.exit(runMaskerTests() ? 0 : 1);
}
