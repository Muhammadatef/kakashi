/**
 * tests/impact.test.js
 *
 * Locks the impact snapshot against the regression the plan flagged: the
 * global CLI reported kakashiVersion "1.1.0" while package.json was on 1.2.0
 * because the version had been hardcoded in src/lib/stats.js.
 *
 * The invariant this test enforces is simple: impactSnapshot().kakashiVersion
 * MUST equal package.json.version. That is defended by a single line change
 * (require the package.json), but the invariant needs a test so a future
 * refactor cannot silently re-introduce the bug.
 */

const assert = require('assert');
const path = require('path');

function runImpactTests() {
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

  const ROOT = path.resolve(__dirname, '..');
  const pkg = require(path.join(ROOT, 'package.json'));
  const { impactSnapshot } = require(path.join(ROOT, 'src', 'lib', 'stats.js'));

  check('impactSnapshot version matches package.json', () => {
    const snap = impactSnapshot();
    assert.strictEqual(snap.kakashiVersion, pkg.version,
      `impact version drift: pkg=${pkg.version} snap=${snap.kakashiVersion}. `
      + 'src/lib/stats.js is likely hardcoding the version again.');
  });

  check('impactSnapshot schema is stable and privacy-preserving', () => {
    const snap = impactSnapshot();
    // These fields MUST be present -- consumers (dashboards, community
    // metrics) rely on them.
    for (const key of ['schema', 'generatedAt', 'bucket', 'filesMasked',
                       'totalFindings', 'byCategory', 'kakashiVersion', 'platform']) {
      assert(key in snap, `impact snapshot missing field: ${key}`);
    }
    // These fields MUST NOT be present -- adding them would be a privacy
    // regression (per the promises in src/lib/stats.js impactSnapshot doc).
    for (const forbidden of ['filenames', 'paths', 'userId', 'machineId',
                             'hostname', 'ip', 'homedir']) {
      assert(!(forbidden in snap), `impact snapshot leaks forbidden field: ${forbidden}`);
    }
    // Bucket is YYYY-MM (coarse). YYYY-MM-DD would defeat the purpose.
    assert(/^\d{4}-\d{2}$/.test(snap.bucket),
      `bucket must be YYYY-MM (was: ${snap.bucket}). YYYY-MM-DD is a privacy regression.`);
  });

  console.log(`impact.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runImpactTests };

if (require.main === module) {
  process.exit(runImpactTests() ? 0 : 1);
}
