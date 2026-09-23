/**
 * tests/guard-fallback.test.js
 *
 * The agent-guard daemon relies on `fs.watch`, which on Windows throws
 * `UNKNOWN: unknown error, watch` on mapped drives (G:), sandboxed paths,
 * or WSL mounts. Before this fix the whole daemon died on that throw and
 * the caller got a printed bind line followed by silence — the /health
 * endpoint never worked, which made the tool look completely broken.
 *
 * This suite proves two things without needing Windows to reproduce:
 *
 *   1. When fs.watch throws synchronously, agent-guard emits a
 *      `watch_failed` event AND still brings /health up (fallback = polling).
 *
 *   2. Setting KAKASHI_GUARD_NO_WATCH=1 skips the watcher entirely and the
 *      daemon still serves /health. This is the "just give me the HTTP API"
 *      escape hatch users need on locked-down file systems.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

function get(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: urlPath }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    }).on('error', reject);
  });
}

// Assign a random-ish loopback port so parallel test runs don't collide.
function pickPort() {
  return 40000 + Math.floor(Math.random() * 20000);
}

async function runGuardFallbackTests() {
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

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kakashi-guard-fallback-'));

  // ---- 1. Simulate the Windows UNKNOWN failure ------------------------------
  // Monkey-patch fs.watch just for the load of ./src/agent/guard.js. We can't
  // simply pass an option to guard.start() because the caller doesn't get to
  // pick the failure — the OS does. Simulating at the fs level is the closest
  // we can get to a real Windows failure from a Linux CI runner.
  await check('fs.watch throw -> daemon still serves /health in poll mode', async () => {
    const port = pickPort();
    const guardModulePath = require.resolve(path.resolve(__dirname, '..', 'src', 'agent', 'guard.js'));
    // Reload from a fresh module cache so our monkey-patch takes effect on
    // the fs.watch reference the guard module captured at require time.
    delete require.cache[guardModulePath];
    const originalWatch = fs.watch;
    fs.watch = () => {
      const err = new Error('UNKNOWN: unknown error, watch');
      err.code = 'UNKNOWN';
      throw err;
    };
    let handle;
    try {
      const guardMod = require(guardModulePath);
      const events = [];
      handle = await guardMod.start({
        watch: tmpDir,
        port,
        onEvent: (e) => events.push(e),
      });
      // The daemon MUST have recorded a watch_failed event (proof it noticed).
      assert(events.some((e) => e.kind === 'watch_failed'),
        `no watch_failed event emitted; got: ${events.map((e) => e.kind).join(', ')}`);
      // AND /health must respond.
      const r = await get(port, '/health');
      assert.strictEqual(r.status, 200);
      const body = JSON.parse(r.body);
      assert.strictEqual(body.ok, true);
      assert.strictEqual(body.watching, tmpDir);
      // watchMode should be "poll" (we degraded), not "watch".
      assert.strictEqual(body.watchMode, 'poll',
        `expected watchMode=poll after fs.watch failure, got ${body.watchMode}`);
    } finally {
      fs.watch = originalWatch;
      if (handle) await handle.stop();
      delete require.cache[guardModulePath]; // restore the pristine module for later tests
    }
  });

  // ---- 2. KAKASHI_GUARD_NO_WATCH=1 escape hatch -----------------------------
  await check('KAKASHI_GUARD_NO_WATCH=1 -> daemon serves /health with watchMode=off', async () => {
    const port = pickPort();
    const previous = process.env.KAKASHI_GUARD_NO_WATCH;
    process.env.KAKASHI_GUARD_NO_WATCH = '1';
    const guardModulePath = require.resolve(path.resolve(__dirname, '..', 'src', 'agent', 'guard.js'));
    delete require.cache[guardModulePath];
    let handle;
    try {
      const guardMod = require(guardModulePath);
      const events = [];
      handle = await guardMod.start({
        watch: tmpDir,
        port,
        onEvent: (e) => events.push(e),
      });
      assert(events.some((e) => e.kind === 'watch_disabled'),
        'daemon did not emit watch_disabled even though KAKASHI_GUARD_NO_WATCH=1');
      const r = await get(port, '/health');
      assert.strictEqual(r.status, 200);
      const body = JSON.parse(r.body);
      assert.strictEqual(body.watchMode, 'off',
        `expected watchMode=off with the env var, got ${body.watchMode}`);
    } finally {
      if (previous == null) delete process.env.KAKASHI_GUARD_NO_WATCH;
      else process.env.KAKASHI_GUARD_NO_WATCH = previous;
      if (handle) await handle.stop();
      delete require.cache[guardModulePath];
    }
  });

  // ---- 3. Version comes from package.json, not a hardcode -------------------
  await check('/health version matches package.json version', async () => {
    const pkg = require(path.resolve(__dirname, '..', 'package.json'));
    const port = pickPort();
    const guardModulePath = require.resolve(path.resolve(__dirname, '..', 'src', 'agent', 'guard.js'));
    delete require.cache[guardModulePath];
    let handle;
    try {
      const guardMod = require(guardModulePath);
      handle = await guardMod.start({ watch: tmpDir, port });
      const r = await get(port, '/health');
      const body = JSON.parse(r.body);
      assert.strictEqual(body.version, pkg.version,
        `agent-guard version drift: pkg=${pkg.version} health=${body.version}`);
    } finally {
      if (handle) await handle.stop();
      delete require.cache[guardModulePath];
    }
  });

  // Cleanup.
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }

  console.log(`guard-fallback.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runGuardFallbackTests };

if (require.main === module) {
  runGuardFallbackTests().then((ok) => process.exit(ok ? 0 : 1));
}
