/**
 * RunStore -- the on-disk state of one sweep run.
 *
 * Every stage of the loop is resumable because every stage's output lives here,
 * not in memory: a worker can crash, the terminal can close, CI can split shard
 * and map across machines, and `kakashi sweep next` picks up exactly where the
 * run left off.
 *
 *   <repo>/.kakashi/sweep/
 *     .gitignore            "*"  -- run state never lands in git by accident
 *     LATEST                id of the most recent run
 *     <run_id>/
 *       manifest.json  selectors.lock.json  signals.json  batches.json
 *       views/<rel>    findings/<batch>.json  narrative.json  reduce.json
 *       iterations.jsonl
 *
 * Writes are atomic (write temp + rename) so a crash never leaves a half-written
 * batches.json that a resumed run would trust. Nothing here holds a raw value:
 * guarded views are the only file content, and they are Guardian output.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SWEEP_DIR = path.join('.kakashi', 'sweep');
const RUN_ID_RX = /^sw_[0-9a-z_]+$/;

function sweepDir(root) {
  return path.join(root, SWEEP_DIR);
}

function ensureSweepDir(root) {
  const dir = sweepDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const gi = path.join(dir, '.gitignore');
  if (!fs.existsSync(gi)) fs.writeFileSync(gi, '*\n');
  return dir;
}

function atomicWrite(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

class RunStore {
  constructor(root, runId) {
    if (!RUN_ID_RX.test(runId)) throw new Error(`Invalid sweep run id: ${runId}`);
    this.root = root;
    this.runId = runId;
    this.dir = path.join(sweepDir(root), runId);
  }

  /** Create a new run directory and point LATEST at it. */
  static create(root, seed = '') {
    ensureSweepDir(root);
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const h = crypto.createHash('sha1').update(`${seed}|${stamp}|${process.pid}|${Math.random()}`).digest('hex').slice(0, 8);
    const store = new RunStore(root, `sw_${stamp}_${h}`);
    fs.mkdirSync(store.dir, { recursive: true });
    fs.writeFileSync(path.join(sweepDir(root), 'LATEST'), `${store.runId}\n`);
    return store;
  }

  /** Open an existing run (default: LATEST). */
  static open(root, runId) {
    let id = runId;
    if (!id) {
      const latest = path.join(sweepDir(root), 'LATEST');
      if (!fs.existsSync(latest)) throw new Error(`No sweep run found under ${sweepDir(root)} — start one with \`kakashi sweep <dir>\``);
      id = fs.readFileSync(latest, 'utf8').trim();
    }
    const store = new RunStore(root, id);
    if (!fs.existsSync(path.join(store.dir, 'manifest.json'))) throw new Error(`Sweep run not found: ${id}`);
    return store;
  }

  file(name) {
    const p = path.join(this.dir, name);
    if (!p.startsWith(this.dir + path.sep)) throw new Error(`Path escapes run directory: ${name}`);
    return p;
  }

  readJSON(name) {
    const p = this.file(name);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  }

  writeJSON(name, obj) {
    atomicWrite(this.file(name), `${JSON.stringify(obj, null, 2)}\n`);
  }

  manifest() { return this.readJSON('manifest.json'); }

  updateManifest(patch) {
    const m = { ...this.manifest(), ...patch };
    this.writeJSON('manifest.json', m);
    return m;
  }

  signals() { return this.readJSON('signals.json') || []; }

  batches() { return this.readJSON('batches.json') || []; }

  saveBatches(batches) { this.writeJSON('batches.json', batches); }

  findingsFor(batchId) { return this.readJSON(path.join('findings', `${batchId}.json`)); }

  /** Accepted submissions, in batch order: [{ batch_id, results }]. */
  allFindings() {
    return this.batches()
      .filter((b) => b.status === 'accepted')
      .map((b) => this.findingsFor(b.id))
      .filter(Boolean);
  }

  appendIteration(evt) {
    fs.appendFileSync(this.file('iterations.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...evt })}\n`);
  }

  iterations() {
    const p = this.file('iterations.jsonl');
    if (!fs.existsSync(p)) return [];
    return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  }

  /** Absolute path of a guarded view for repo-relative `rel`. */
  viewPath(rel) { return this.file(path.join('views', rel)); }
}

module.exports = { RunStore, sweepDir, ensureSweepDir, SWEEP_DIR, atomicWrite };
