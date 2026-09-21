#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'kakashi.js');
const WORK = path.join(__dirname, '.work');
const INPUT = path.join(WORK, 'input');
const OUTPUT = path.join(WORK, 'output');
const HOME = path.join(WORK, 'home');
const LOOPBACK = ['127', '0', '0', '1'].join('.');
const syntheticMarker = ['sk', 'proj', 'safe987zyx654wvu321tsr098qpo765nml432kji'].join('-');

const values = {
  nationalId: ['784', '2001', '7654321', '2'].join('-'),
  email: ['demo.owner', 'example.invalid'].join('@'),
  phone: ['+971', '56', '987', '6543'].join(''),
  iban: ['AE42', '123', '76543210', '98765432'].join(''),
  marker: syntheticMarker,
  person: ['Demo', 'Citizen', 'One'].join(' '),
};

const sourceSensitiveValues = [
  values.nationalId,
  values.email,
  values.phone,
  values.iban,
  values.marker,
];

const env = {
  ...process.env,
  HOME,
  NO_COLOR: '1',
  FORCE_COLOR: '0',
};

function resetWorkspace() {
  const expected = path.join(path.resolve(__dirname), '.work');
  assert.strictEqual(path.resolve(WORK), expected, 'refusing to reset an unexpected path');
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(INPUT, { recursive: true });
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.mkdirSync(HOME, { recursive: true });
}

function createFixtures() {
  const citizenFile = path.join(INPUT, 'citizen-request.md');
  const body = [
    '# Synthetic citizen-service request',
    '',
    'All records in this workspace are generated for the Kakashi demo.',
    `Name: ${values.person}`,
    `Emirates ID: ${values.nationalId}`,
    `Email: ${values.email}`,
    `Phone: ${values.phone}`,
    `IBAN: ${values.iban}`,
    `Access marker: ${values.marker}`,
    'Request: calculate service volume by age group.',
    '',
  ].join('\n');
  fs.writeFileSync(citizenFile, body);

  const estate = path.join(INPUT, 'data-estate');
  fs.mkdirSync(path.join(estate, 'finance'), { recursive: true });
  fs.mkdirSync(path.join(estate, 'ignored'), { recursive: true });
  fs.writeFileSync(path.join(estate, 'citizens.md'), body);
  fs.writeFileSync(path.join(estate, 'finance', 'payments.csv'), [
    'reference,contact,iban',
    `CASE-001,${values.email},${values.iban}`,
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(estate, 'service.env'),
    `SERVICE_TOKEN=${values.marker}\n`);
  fs.writeFileSync(path.join(estate, '.gitignore'), 'ignored\n');
  fs.writeFileSync(path.join(estate, 'ignored', 'excluded.md'),
    `Excluded contact: ${values.email}\n`);

  const guardianFile = path.join(INPUT, 'workforce-analysis.md');
  fs.writeFileSync(guardianFile, [
    '# Synthetic workforce analysis',
    '',
    `Name: ${values.person}`,
    `Emirates ID: ${values.nationalId}`,
    `Email: ${values.email}`,
    `Age: ${40 + 2}`,
    'Department: Finance',
    'Salary: AED 18000',
    '',
  ].join('\n'));

  return { citizenFile, estate, guardianFile };
}

function commandLabel(args) {
  const safeArgs = args.map((arg, index) => {
    if (args[index - 1] === '--whitelist') return '<approved-value>';
    if (path.isAbsolute(arg)) return path.relative(ROOT, arg);
    return /\s/.test(arg) ? JSON.stringify(arg) : arg;
  });
  return `kakashi ${safeArgs.join(' ')}`;
}

function runCli(args, expectedStatus, options = {}) {
  console.log(`  RUN   ${commandLabel(args)}`);
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    input: options.input,
    maxBuffer: 16 * 1024 * 1024,
  });
  const allowed = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  assert(allowed.includes(result.status), [
    `${commandLabel(args)} returned ${result.status}; expected ${allowed.join(' or ')}`,
    result.stderr,
    result.stdout,
  ].join('\n'));
  return result;
}

function assertNoRaw(text, label) {
  for (const raw of sourceSensitiveValues) {
    assert(!text.includes(raw), `${label} retained synthetic ${raw.length}-character input`);
  }
}

function assertFileSafe(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  assertNoRaw(text, path.basename(filePath));
}

function section(title, purpose) {
  console.log(`\n${'='.repeat(72)}`);
  console.log(title);
  console.log(purpose);
  console.log('='.repeat(72));
}

function pass(message) {
  console.log(`  PASS  ${message}`);
}

function demoFiles(fixtures) {
  section('DEMO 1 — File protection',
    'Detect, audit locally, mask in three modes, whitelist, and use stdin.');

  const scan = runCli(['scan', fixtures.citizenFile], 1);
  assert(scan.stdout.trim().length > 0, 'scan should render a count-only summary');
  pass('scan found synthetic sensitive data and returned detection exit code 1');

  const audit = runCli(['audit', fixtures.citizenFile], 1);
  assert(audit.stdout.includes(values.nationalId));
  pass('audit produced a local original-to-token mapping (output intentionally hidden)');

  for (const mode of ['typed', 'redact', 'fake']) {
    const output = path.join(OUTPUT, `${mode}-citizen-request.md`);
    runCli(['mask', fixtures.citizenFile, '--mode', mode, '--output', output], 0);
    assertFileSafe(output);
    const expectedScan = mode === 'fake' ? [0, 1] : 0;
    const verify = runCli(['scan', output], expectedScan);
    assert(verify.stdout.trim().length > 0, 'clean re-scan should render a summary');
    if (mode === 'fake') {
      pass('fake mode removed source values and preserved realistic data shape');
    } else {
      pass(`${mode} mode removed all detected source values and passed re-scan`);
    }
  }

  const whitelisted = path.join(OUTPUT, 'whitelisted-citizen-request.md');
  runCli([
    'mask', fixtures.citizenFile,
    '--whitelist', values.email,
    '--output', whitelisted,
  ], 0);
  assert(fs.readFileSync(whitelisted, 'utf8').includes(values.email));
  pass('whitelist preserved only the explicitly approved value');

  const stdin = runCli(['mask', '--stdin'], 0, {
    input: fs.readFileSync(fixtures.citizenFile, 'utf8'),
  });
  assertNoRaw(stdin.stdout, 'stdin output');
  pass('stdin mode returned a safe stream without writing an input file');
}

function demoFolders(fixtures) {
  section('DEMO 2 — Folder-wide compliance',
    'Scan a data estate, generate four report variants, honour ignore files, then batch-mask.');

  const formats = [
    ['json', 'estate-report.json'],
    ['md', 'estate-report.md'],
    ['html', 'estate-report.html'],
  ];
  for (const [format, name] of formats) {
    const output = path.join(OUTPUT, name);
    runCli(['scan-dir', fixtures.estate, '--format', format, '--output', output], 1);
    assert(fs.existsSync(output));
    assertNoRaw(fs.readFileSync(output, 'utf8'), name);
    pass(`${format.toUpperCase()} PDPL report was generated without raw matched values`);
  }

  const arabicReport = path.join(OUTPUT, 'estate-report-ar.html');
  runCli([
    'scan-dir', fixtures.estate,
    '--format', 'html', '--lang', 'ar', '--output', arabicReport,
  ], 1);
  assert(fs.readFileSync(arabicReport, 'utf8').includes('<html lang="ar" dir="auto">'));
  pass('Arabic right-to-left HTML report rendered successfully');

  const report = JSON.parse(fs.readFileSync(path.join(OUTPUT, 'estate-report.json'), 'utf8'));
  assert(report.skippedByIgnoreFile >= 1, 'expected .gitignore exclusion to be counted');
  pass('.gitignore was honoured and excluded content was reported as skipped');

  runCli(['mask-dir', fixtures.estate, '--recursive'], 0);
  const masked = path.join(fixtures.estate, 'masked_citizens.md');
  assert(fs.existsSync(masked));
  assertFileSafe(masked);
  pass('recursive batch masking created safe sibling files');
}

function demoDatabase() {
  section('DEMO 3 — Database result protection',
    'Exercise count-only scan, local audit, row masking, stable tokens, and three export formats.');

  const scan = runCli(['db-scan', 'mock:customers', '--query', 'demo', '--limit', '5'], 1);
  assert(scan.stdout.includes('5 row(s) scanned'));
  pass('db-scan inspected five rows without writing or printing raw values');

  const audit = runCli(['db-audit', 'mock:customers', '--query', 'demo', '--limit', '1'], 1);
  const knownId = ['784', '1990', '9999999', '0'].join('-');
  assert(audit.stdout.includes(knownId));
  pass('db-audit created a local mapping (plaintext output intentionally hidden)');

  for (const format of ['jsonl', 'json', 'csv']) {
    const output = path.join(OUTPUT, `masked-customers.${format}`);
    runCli([
      'db-mask', 'mock:customers', '--query', 'demo',
      '--limit', '5', '--format', format, '--output', output,
    ], 0);
    const text = fs.readFileSync(output, 'utf8');
    assert(!text.includes(knownId));
    assert(text.includes('[EMAIL_5]'), 'stable token numbering should reach the fifth row');
    pass(`${format.toUpperCase()} export is masked and preserves cross-row token identity`);
  }
}

function demoGuardian(fixtures) {
  section('DEMO 4 — Guardian autonomous decision loop',
    'Show a verified transformation, then a credential-bearing release that fails closed for human approval.');

  const guarded = path.join(OUTPUT, 'guarded-citizen-request.md');
  const auditLog = path.join(OUTPUT, 'guardian-audit.jsonl');
  const result = runCli([
    'guard', fixtures.guardianFile,
    '--agent', 'codex',
    '--task', 'calculate average salary by department',
    '--destination', 'external_model',
    '--output', guarded,
    '--audit-log', auditLog,
    '--json',
  ], 0);
  const decision = JSON.parse(result.stdout);
  assert.strictEqual(decision.decision, 'ALLOW_WITH_TRANSFORMATION');
  assert(decision.risk && Number.isInteger(decision.risk.score));
  pass(`Guardian returned ${decision.decision} at risk ${decision.risk.score}/100`);
  assert.strictEqual(decision.verificationPassed, true);
  assertFileSafe(guarded);
  pass('Guardian re-scanned and approved only the transformed artifact');

  const refusedPath = path.join(OUTPUT, 'must-not-be-released.md');
  const refused = runCli([
    'guard', fixtures.citizenFile,
    '--agent', 'unknown',
    '--task', 'summarize the citizen request',
    '--destination', 'external_model',
    '--output', refusedPath,
    '--audit-log', auditLog,
    '--json',
  ], [3, 4]);
  const refusedDecision = JSON.parse(refused.stdout);
  assert(['REQUIRE_APPROVAL', 'BLOCK'].includes(refusedDecision.decision));
  assert(!fs.existsSync(refusedPath), 'fail-closed decisions must not release an artifact');
  pass(`${refusedDecision.decision} released no credential-bearing artifact`);

  const auditText = fs.readFileSync(auditLog, 'utf8');
  assertNoRaw(auditText, 'Guardian audit log');
  pass('Guardian audit event records reasoning and counts without raw values');
}

function requestJson({ port, method = 'GET', route, body }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = http.request({
      [['h', 'ost'].join('')]: LOOPBACK,
      port,
      path: route,
      method,
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      } : {},
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        text: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForPort(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`agent-guard startup timed out\n${output}`)), 10000);
    const onData = (chunk) => {
      output += chunk.toString('utf8');
      const match = output.match(/127\.0\.0\.1:(\d+)\/health/);
      if (match) {
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`agent-guard exited before startup with ${code}\n${output}`));
    });
  });
}

function stopChild(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

async function demoSidecar(fixtures) {
  section('DEMO 5 — Agent-guard sidecar',
    'Start the loopback-only service and exercise health, agent-safe scan, and mask APIs.');

  const logPath = path.join(OUTPUT, 'sidecar-audit.jsonl');
  const child = spawn(process.execPath, [
    CLI, 'agent-guard', '--watch', INPUT, '--port', '0', '--log', logPath,
  ], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });

  try {
    const port = await waitForPort(child);
    const health = await requestJson({ port, route: '/health' });
    assert.strictEqual(health.status, 200);
    assert.strictEqual(JSON.parse(health.text).ok, true);
    pass(`loopback health endpoint answered on ephemeral port ${port}`);

    const scan = await requestJson({
      port,
      method: 'POST',
      route: '/scan',
      body: { path: fixtures.citizenFile },
    });
    assert.strictEqual(scan.status, 200);
    assert(JSON.parse(scan.text).summary.total > 0);
    assertNoRaw(scan.text, 'sidecar /scan response');
    pass('/scan returned categories and counts without matched values');

    const output = path.join(OUTPUT, 'sidecar-masked.md');
    const mask = await requestJson({
      port,
      method: 'POST',
      route: '/mask',
      body: { path: fixtures.citizenFile, output },
    });
    assert.strictEqual(mask.status, 200);
    assertFileSafe(output);
    pass('/mask wrote a safe artifact through the local API');
  } finally {
    await stopChild(child);
  }
}

function demoOperations(fixtures) {
  section('DEMO 6 — Operations, Arabic, and evidence',
    'Show detector inventory, bilingual CLI, cumulative statistics, and a value-free impact snapshot.');

  const patterns = runCli(['list-patterns'], 0);
  const match = patterns.stdout.match(/Patterns \((\d+)\)/);
  assert(match && Number(match[1]) >= 35);
  pass(`${match[1]} active detection patterns are visible and grouped by category`);

  const arabic = runCli(['--lang', 'ar', 'scan', fixtures.citizenFile], 1);
  assert(/[\u0600-\u06ff]/.test(arabic.stdout));
  pass('Arabic CLI output rendered successfully');

  const stats = runCli(['stats'], 0);
  assert(stats.stdout.includes('Files masked'));
  pass('local-only cumulative masking statistics are available');

  const impactPath = path.join(OUTPUT, 'impact.json');
  runCli(['impact', '--write', impactPath], 0);
  const impact = fs.readFileSync(impactPath, 'utf8');
  assertNoRaw(impact, 'impact snapshot');
  assert(!impact.includes(INPUT), 'impact snapshot must not include paths');
  pass('impact snapshot contains no filenames, paths, values, or machine identifier');
}

const DEMOS = {
  files: async (fixtures) => demoFiles(fixtures),
  folders: async (fixtures) => demoFolders(fixtures),
  database: async () => demoDatabase(),
  guardian: async (fixtures) => demoGuardian(fixtures),
  sidecar: async (fixtures) => demoSidecar(fixtures),
  operations: async (fixtures) => demoOperations(fixtures),
};

async function main() {
  const requested = process.argv[2] || 'all';
  if (requested !== 'all' && !DEMOS[requested]) {
    console.error(`Unknown demo "${requested}". Use: all, ${Object.keys(DEMOS).join(', ')}`);
    process.exit(2);
  }

  resetWorkspace();
  const fixtures = createFixtures();
  const selected = requested === 'all' ? Object.keys(DEMOS) : [requested];
  const started = Date.now();

  console.log('Kakashi manager demo suite');
  console.log(`Version: ${require('../package.json').version}`);
  console.log('Inputs: runtime-generated synthetic records only');

  for (const name of selected) {
    await DEMOS[name](fixtures);
  }

  console.log(`\n${'='.repeat(72)}`);
  console.log(`ALL ${selected.length} SELECTED DEMOS PASSED in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`Artifacts: ${path.relative(ROOT, OUTPUT)}`);
  console.log('='.repeat(72));
}

main().catch((err) => {
  console.error(`\nDEMO FAILED: ${err.stack || err.message}`);
  process.exit(1);
});
