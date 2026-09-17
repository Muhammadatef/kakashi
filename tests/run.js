const { runPatternTests } = require('./patterns.test');
const { runMaskerTests } = require('./masker.test');
const { runCliTests } = require('./cli.test');
const { runPdplTests } = require('./pdpl.test');
const { runDbTests } = require('./db.test');
const { runDbIntegrationTests } = require('./db-integration.test');
const { runFormatsTests } = require('./formats.test');
const { runOoxmlTests } = require('./ooxml.test');
const { runReporterTests } = require('./reporter.test');
const { runI18nTests } = require('./i18n.test');
const { runGuardTests } = require('./guard.test');
const { runGuardianTests } = require('./guardian.test');

(async () => {
  let ok = true;
  ok = runPatternTests() && ok;
  ok = runMaskerTests() && ok;
  ok = runCliTests() && ok;
  ok = runPdplTests() && ok;
  ok = (await runDbTests()) && ok;
  ok = (await runDbIntegrationTests()) && ok;
  ok = (await runFormatsTests()) && ok;
  ok = (await runOoxmlTests()) && ok;
  ok = (await runReporterTests()) && ok;
  ok = runI18nTests() && ok;
  ok = (await runGuardTests()) && ok;
  ok = (await runGuardianTests()) && ok;

  console.log(ok ? '\nAll tests passed.' : '\nSome tests failed.');
  process.exit(ok ? 0 : 1);
})();
