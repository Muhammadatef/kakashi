const assert = require('assert');
const { maskText } = require('../src/engine/masker');
const {
  ARTICLES,
  PATTERN_TO_ARTICLES,
  enrich,
  summarize,
  unmappedPatternIds,
} = require('../src/lib/pdpl-mapping');

function runPdplTests() {
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

  check('every pattern id has a PDPL mapping', () => {
    const missing = unmappedPatternIds();
    assert.deepStrictEqual(missing, [], `Unmapped pattern ids: ${missing.join(', ')}`);
  });

  check('every article code in mappings exists in ARTICLES', () => {
    const known = new Set(Object.keys(ARTICLES));
    for (const [id, codes] of Object.entries(PATTERN_TO_ARTICLES)) {
      for (const code of codes) {
        assert(known.has(code), `Pattern ${id} references unknown article ${code}`);
      }
    }
  });

  check('enrich adds severity + articles + articleSummaries', () => {
    const { findings } = maskText('Emirates ID: 784-1990-9999999-0', { enabled: ['national_id'] });
    assert(findings.length === 1);
    const en = enrich(findings[0]);
    assert(en.severity === 'critical', `expected critical, got ${en.severity}`);
    assert(en.articles.includes('Art. 15'), 'Emirates ID must cite Art. 15 (sensitive data)');
    assert(en.articles.includes('Art. 22'), 'Emirates ID must cite Art. 22 (cross-border)');
    assert(Array.isArray(en.articleSummaries));
    assert(en.articleSummaries.every((a) => a.title_en && a.title_ar));
  });

  check('checksumVerified badge is applied to Emirates ID', () => {
    // fixture uses synthetic check digits so this returns false — that's the
    // whole point: strict verification lives here, not in the pattern rx.
    const { findings } = maskText('Emirates ID: 784-1990-9999999-0', { enabled: ['national_id'] });
    const en = enrich(findings[0]);
    assert(en.checksumVerified === false, 'synthetic fixture must NOT pass Luhn');
  });

  check('checksumVerified is null for patterns without a checksum', () => {
    const { findings } = maskText('email: alice@example.com', { enabled: ['email'] });
    const en = enrich(findings[0]);
    assert(en.checksumVerified === null);
  });

  check('summarize aggregates severity/category/article buckets', () => {
    // Note: env_secret regex requires a prefix before the sensitive keyword,
    // so we use OPENAI_API_KEY (real-world style) rather than bare API_KEY.
    const { findings } = maskText(
      'ID 784-1990-9999999-0\nemail alice@example.com\nOPENAI_API_KEY = "sk-proj-abc123def456ghi789jkl012mno345pqr678"',
      { enabled: ['national_id', 'email', 'env_secret'] },
    );
    const { summary } = summarize(findings);
    assert(summary.total >= 3, `expected >=3 findings, got ${summary.total}`);
    assert(summary.bySeverity.critical >= 2, 'IDs + credentials → critical');
    assert(summary.byArticle['Art. 20'] >= 1, 'security-of-processing article must count');
    assert(summary.topArticles.length > 0);
    assert(summary.topArticles[0].title_en);
  });

  console.log(`pdpl.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runPdplTests };

if (require.main === module) {
  process.exit(runPdplTests() ? 0 : 1);
}
