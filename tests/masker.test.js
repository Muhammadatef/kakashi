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

  console.log(`masker.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runMaskerTests };

if (require.main === module) {
  process.exit(runMaskerTests() ? 0 : 1);
}
