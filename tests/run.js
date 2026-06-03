const { runPatternTests } = require('./patterns.test');
const { runMaskerTests } = require('./masker.test');
const { runCliTests } = require('./cli.test');

let ok = true;
ok = runPatternTests() && ok;
ok = runMaskerTests() && ok;
ok = runCliTests() && ok;

console.log(ok ? '\nAll tests passed.' : '\nSome tests failed.');
process.exit(ok ? 0 : 1);
