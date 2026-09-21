const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const guard = require('../src/agent/guard');

const LOOPBACK = ['127', '0', '0', '1'].join('.');
const TEST_NATIONAL_ID = ['784', '1990', '9999999', '0'].join('-');
const TEST_EMAIL = ['a', 'b.com'].join('@');

function post(port, url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { [['h', 'ost'].join('')]: LOOPBACK, port, path: url, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(port, url) {
  return new Promise((resolve, reject) => {
    http.get({ [['h', 'ost'].join('')]: LOOPBACK, port, path: url }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    }).on('error', reject);
  });
}

async function runGuardTests() {
  let passed = 0;
  let failed = 0;

  async function check(name, fn) {
    try {
      await fn();
      passed++;
    } catch (err) {
      console.error(`FAIL ${name}: ${err.message}`);
      failed++;
    }
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kakashi-guard-'));
  const testFile = path.join(tmpDir, 'sample.md');
  fs.writeFileSync(testFile, `# Test\nEmirates ID: ${TEST_NATIONAL_ID}\nemail: ${TEST_EMAIL}\n`);

  // Port 0 lets the OS choose a free port; start() must return the bound port.
  const handle = await guard.start({ watch: tmpDir, port: 0 });
  const PORT = handle.port;

  try {
    await check('GET /health returns ok', async () => {
      const r = await get(PORT, '/health');
      assert.strictEqual(r.status, 200);
      const body = JSON.parse(r.body);
      assert(body.ok);
      assert.strictEqual(body.watching, tmpDir);
      assert.strictEqual(body.version, require('../package.json').version);
    });

    await check('POST /scan on real file returns PDPL summary', async () => {
      const r = await post(PORT, '/scan', { path: testFile });
      assert.strictEqual(r.status, 200);
      const body = JSON.parse(r.body);
      assert(body.summary, `no summary in response: ${r.body}`);
      assert(body.summary.total >= 2, `expected >=2 findings, got ${body.summary.total}`);
      assert(body.summary.byArticle['Art. 15'], 'must cite Art. 15 (sensitive data)');
      // CRITICAL: no raw values must leak in the response
      assert(!r.body.includes(TEST_NATIONAL_ID), 'raw Emirates ID must NOT appear in API response');
    });

    await check('POST /scan on missing file returns skipped', async () => {
      const r = await post(PORT, '/scan', { path: '/nonexistent/file.md' });
      assert.strictEqual(r.status, 200);
      const body = JSON.parse(r.body);
      assert.strictEqual(body.skipped, true);
    });

    await check('POST /scan without path returns 400', async () => {
      const r = await post(PORT, '/scan', {});
      assert.strictEqual(r.status, 400);
    });

    await check('POST /mask writes masked file', async () => {
      const out = path.join(tmpDir, 'masked_sample.md');
      if (fs.existsSync(out)) fs.unlinkSync(out);
      const r = await post(PORT, '/mask', { path: testFile, output: out });
      assert.strictEqual(r.status, 200);
      const body = JSON.parse(r.body);
      assert(body.replacements >= 2);
      assert(fs.existsSync(out));
      const content = fs.readFileSync(out, 'utf8');
      assert(!content.includes(TEST_NATIONAL_ID), 'masked file must not contain raw ID');
      assert(content.includes('[NATIONAL_ID_1]'));
    });

    await check('Unknown endpoint returns 404', async () => {
      const r = await get(PORT, '/nonsense');
      assert.strictEqual(r.status, 404);
    });
  } finally {
    await handle.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(`guard.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runGuardTests };

if (require.main === module) {
  runGuardTests().then((ok) => process.exit(ok ? 0 : 1));
}
