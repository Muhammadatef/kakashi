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
const { runTaskTests } = require('./task.test');
const { runAgentRuleTests } = require('./agent-rules.test');
const { runCursorDemoTests } = require('./cursor-demo.test');
const { runOrchestratorTests } = require('./orchestrator.test');
const { runGuardianNarrativeTests } = require('./guardian-narrative.test');
const { runGuardFallbackTests } = require('./guard-fallback.test');
const { runImpactTests } = require('./impact.test');

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
  ok = (await runTaskTests()) && ok;
  ok = runAgentRuleTests() && ok;
  ok = runCursorDemoTests() && ok;
  // v1.2+ additions from changes_23Sept.md:
  ok = runOrchestratorTests() && ok;
  ok = (await runGuardianNarrativeTests()) && ok;
  ok = (await runGuardFallbackTests()) && ok;
  ok = runImpactTests() && ok;

  console.log(ok ? '\nAll tests passed.' : '\nSome tests failed.');
  process.exit(ok ? 0 : 1);
})();
