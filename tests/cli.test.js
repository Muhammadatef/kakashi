const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.join(__dirname, '..', 'bin', 'kakashi.js');
const FIXTURE = path.join(__dirname, 'fixtures', 'sample.txt');
const MASKED = path.join(__dirname, 'fixtures', 'masked_sample.txt');
const FIXTURE_NATIONAL_ID = ['784', '1988', '1234567', '0'].join('-');
const SQL_EMAIL = ['john.smith', 'example.com'].join('@');
const SQL_DB_ENDPOINT = ['hunter2', 'prod.db.example.com'].join('@');
const STDIN_EMAIL = ['a', 'b.com'].join('@');

function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

function runCliTests() {
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

  check('scan exits 1 when findings', () => {
    const r = runCli(['scan', FIXTURE]);
    if (r.status !== 1) throw new Error(`expected exit 1, got ${r.status}`);
  });

  check('scan clean file exits 0', () => {
    const clean = path.join(__dirname, 'fixtures', 'clean.txt');
    fs.writeFileSync(clean, 'Hello world, no secrets here.\n');
    const r = runCli(['scan', clean]);
    fs.unlinkSync(clean);
    if (r.status !== 0) throw new Error(`expected exit 0, got ${r.status}`);
  });

  check('mask writes masked_ file', () => {
    if (fs.existsSync(MASKED)) fs.unlinkSync(MASKED);
    const r = runCli(['mask', FIXTURE, '-o', MASKED]);
    if (r.status !== 0) throw new Error(`mask failed: ${r.stderr}`);
    if (!fs.existsSync(MASKED)) throw new Error('masked file not created');
    const content = fs.readFileSync(MASKED, 'utf8');
    if (content.includes(FIXTURE_NATIONAL_ID)) throw new Error('PII not masked');
    if (fs.existsSync(MASKED)) fs.unlinkSync(MASKED);
  });

  check('list-patterns runs', () => {
    const r = runCli(['list-patterns']);
    if (r.status !== 0) throw new Error('list-patterns failed');
  });

  check('masks a .sql file end-to-end', () => {
    const sqlFixture = path.join(__dirname, 'fixtures', 'sample_schema.sql');
    const sqlMasked = path.join(__dirname, 'fixtures', 'masked_sample_schema.sql');
    if (fs.existsSync(sqlMasked)) fs.unlinkSync(sqlMasked);
    const r = runCli(['mask', sqlFixture, '-o', sqlMasked]);
    if (r.status !== 0) throw new Error(`mask failed: ${r.stderr}`);
    const content = fs.readFileSync(sqlMasked, 'utf8');
    // SQL DDL password (space-delimited) must be masked, statement kept readable
    if (content.includes('Sup3rS3cret!')) throw new Error('SQL password not masked');
    if (content.includes('pg-r0le-pass')) throw new Error('PG role password not masked');
    if (!content.includes('IDENTIFIED BY [SQL_PASSWORD')) throw new Error('SQL statement context lost');
    // PII inside INSERT rows and the connection string in the comment too
    if (content.includes(SQL_EMAIL)) throw new Error('email in INSERT not masked');
    if (content.includes(SQL_DB_ENDPOINT)) throw new Error('conn string not masked');
    fs.unlinkSync(sqlMasked);
  });

  // ---------------------------------------------------------------------------
  // stdout must not be truncated when it is a pipe.
  //
  // `process.exit()` terminates immediately and discards whatever is still in
  // the stdout buffer. On a pipe that buffer is 64 KiB, so a masked document or
  // a JSON report larger than that was cut off mid-line -- while still exiting
  // 0, so no caller could tell. The extra `| cat` matters: it is what makes the
  // reader slow enough to leave bytes buffered at exit, and without it the bug
  // does not reproduce.
  //
  // These shell out through a real pipeline on purpose. spawnSync's own stdio
  // pipe drains differently and would pass either way.
  // ---------------------------------------------------------------------------
  const pipeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kakashi-pipe-'));

  function shell(cmd) {
    return spawnSync('sh', ['-c', cmd], { encoding: 'utf8' });
  }

  check('mask --stdin is not truncated through a pipe', () => {
    const big = path.join(pipeDir, 'big.md');
    let text = '';
    for (let i = 0; i < 4000; i++) {
      text += `line ${i} user${i}@example.com padding padding padding padding\n`;
    }
    fs.writeFileSync(big, text);

    const expected = Number(shell(
      `node ${CLI} mask --stdin /dev/stdin < ${big} 2>/dev/null | wc -c`,
    ).stdout.trim());
    const through = Number(shell(
      `node ${CLI} mask --stdin /dev/stdin < ${big} 2>/dev/null | cat | wc -c`,
    ).stdout.trim());

    if (expected <= 65536) throw new Error('fixture too small to exercise the pipe buffer');
    if (through !== expected) {
      throw new Error(`masked output truncated through a pipe: ${through} of ${expected} bytes`);
    }
  });

  check('scan-dir --format json is not truncated through a pipe', () => {
    const fixtures = path.join(__dirname, 'fixtures');

    // Two runs of the same scan differ by a few bytes -- `durationMs` and
    // `scannedAt` are wall-clock, and an integer that grows a digit changes the
    // length. Comparing raw byte counts therefore fails at random, so compare
    // the reports themselves with the timing fields normalised away.
    function report(cmd) {
      const raw = shell(cmd).stdout;
      const parsed = JSON.parse(raw);
      parsed.durationMs = 0;
      parsed.scannedAt = '';
      return { bytes: Buffer.byteLength(raw), json: JSON.stringify(parsed) };
    }

    const direct = report(`node ${CLI} scan-dir ${fixtures} -f json 2>/dev/null`);
    const through = report(`node ${CLI} scan-dir ${fixtures} -f json 2>/dev/null | cat`);

    if (direct.bytes <= 65536) throw new Error('fixture report too small to exercise the pipe buffer');
    if (through.json !== direct.json) {
      throw new Error(
        `json report altered through a pipe: ${through.bytes} vs ${direct.bytes} bytes`,
      );
    }
  });

  // ---------------------------------------------------------------------------
  // `--stdin` is documented as "read from stdin, write to stdout", but the file
  // argument was declared required, so the documented invocation
  // (`kakashi mask --stdin < file`) failed with "missing required argument".
  // The only way through was to pass a placeholder path that --stdin then
  // ignored. The argument is now optional, and required only without --stdin.
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // `kakashi --version` was a string literal in bin/kakashi.js, so it kept
  // reporting 1.1.0 after package.json moved to 1.2.0 -- a user checking which
  // version they were running would have been told the wrong one.
  // ---------------------------------------------------------------------------
  check('the reported version matches package.json and the lockfile', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package-lock.json'), 'utf8'));

    const reported = runCli(['--version']).stdout.trim();
    if (reported !== pkg.version) {
      throw new Error(`CLI reports ${reported}, package.json says ${pkg.version}`);
    }
    if (lock.version !== pkg.version || lock.packages[''].version !== pkg.version) {
      throw new Error(`lockfile says ${lock.version}/${lock.packages[''].version}, package.json says ${pkg.version}`);
    }
  });

  check('mask --stdin works with no file argument', () => {
    const r = shell(`printf '${STDIN_EMAIL}\n' | node ${CLI} mask --stdin`);
    if (r.status !== 0) throw new Error(`expected exit 0, got ${r.status}: ${r.stderr}`);
    if (!r.stdout.includes('[EMAIL_1]')) throw new Error(`stdin not masked: ${r.stdout}`);
  });

  check('scan --stdin works with no file argument', () => {
    const r = shell(`printf '${STDIN_EMAIL}\n' | node ${CLI} scan --stdin`);
    if (r.status !== 1) throw new Error(`expected exit 1 (findings), got ${r.status}: ${r.stderr}`);
    if (!r.stdout.includes('(stdin)')) throw new Error('stdin header missing');
  });

  check('mask with neither file nor --stdin fails with a usable message', () => {
    const r = runCli(['mask']);
    if (r.status !== 2) throw new Error(`expected exit 2, got ${r.status}`);
    if (!/--stdin/.test(r.stderr)) throw new Error(`message does not mention --stdin: ${r.stderr}`);
  });

  // ---------------------------------------------------------------------------
  // The JSON report is the one format meant for CI artefacts and SIEM ingestion,
  // which makes it the worst place to ship the plaintext it found. HTML and
  // Markdown never carried values; JSON now matches them unless asked otherwise.
  // ---------------------------------------------------------------------------
  check('scan-dir json redacts matched values by default', () => {
    const out = path.join(pipeDir, 'report.json');
    runCli(['scan-dir', path.join(__dirname, 'fixtures'), '-f', 'json', '-o', out]);
    const report = JSON.parse(fs.readFileSync(out, 'utf8'));

    if (report.valuesRedacted !== true) throw new Error('missing valuesRedacted marker');
    let total = 0;
    for (const file of report.files) {
      for (const finding of file.findings) {
        total++;
        if ('original' in finding) {
          throw new Error(`plaintext left in report: ${finding.id}`);
        }
        // What a reviewer actually needs must survive redaction.
        if (!finding.id || !finding.severity || finding.line == null) {
          throw new Error('redaction stripped locating metadata');
        }
      }
    }
    if (total === 0) throw new Error('no findings to check');

    // Spot-check that a known fixture credential is genuinely absent.
    const raw = fs.readFileSync(out, 'utf8');
    if (raw.includes('Pr0d_P@55w0rd')) throw new Error('credential present in redacted report');
  });

  check('scan-dir json --include-values restores the plaintext', () => {
    const out = path.join(pipeDir, 'report-values.json');
    runCli(['scan-dir', path.join(__dirname, 'fixtures'), '-f', 'json', '--include-values', '-o', out]);
    const report = JSON.parse(fs.readFileSync(out, 'utf8'));
    const some = report.files.flatMap((f) => f.findings);
    if (!some.some((x) => typeof x.original === 'string')) {
      throw new Error('--include-values did not restore values');
    }
  });

  check('scan-dir --lang ar renders an Arabic HTML document', () => {
    const out = path.join(pipeDir, 'report-ar.html');
    const r = runCli([
      'scan-dir', path.join(__dirname, 'fixtures'),
      '--format', 'html', '--lang', 'ar', '--output', out,
    ]);
    if (r.status !== 1) throw new Error(`expected findings exit 1, got ${r.status}`);
    const html = fs.readFileSync(out, 'utf8');
    if (!html.includes('<html lang="ar" dir="auto">')) {
      throw new Error('Arabic report metadata was not applied');
    }
    if (!/[\u0600-\u06ff]/.test(html)) throw new Error('Arabic report has no Arabic text');
  });

  fs.rmSync(pipeDir, { recursive: true, force: true });

  console.log(`cli.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runCliTests };

if (require.main === module) {
  process.exit(runCliTests() ? 0 : 1);
}
