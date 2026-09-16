/**
 * Directory scanner — walks a tree, scans every supported file, aggregates
 * findings with PDPL enrichment.
 *
 * Notes on parallelism:
 *   We use an async concurrency pool (default 8) rather than worker_threads.
 *   For I/O-bound file reads this gives most of the wall-clock benefit of
 *   true parallelism without the overhead of spinning up worker processes or
 *   sending large buffers over MessageChannel. worker_threads-based
 *   parallelism is tracked as a v1.2 upgrade for CPU-bound XLSX/PDF workloads.
 *
 * .gitignore / .kakashiignore:
 *   Honoured via glob's `ignore` option after being converted to glob patterns.
 *   Nested .gitignore files (deep in the tree) are NOT yet supported — only
 *   the root file. This matches the ~90% common case.
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const { maskText } = require('../engine/masker');
const formats = require('../engine/formats');
const { summarize } = require('./pdpl-mapping');

function readIgnoreFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    // Convert basic gitignore patterns to glob patterns:
    //   "node_modules"  -> "**/node_modules/**"
    //   "*.log"         -> "**/*.log"
    //   "/build"        -> "build/**"
    //   already-globby patterns are passed through.
    .map((l) => {
      if (l.includes('*') || l.includes('/')) {
        return l.startsWith('/') ? l.slice(1) + '/**' : l;
      }
      return `**/${l}/**`;
    });
}

/**
 * Async concurrency pool — process an iterable with at most N in flight.
 * @param {Iterable} items
 * @param {number} concurrency
 * @param {function(any): Promise} worker
 */
async function pool(items, concurrency, worker) {
  const iterator = items[Symbol.iterator]();
  const results = [];
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const next = iterator.next();
      if (next.done) return;
      results.push(await worker(next.value));
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * @param {string} rootPath
 * @param {object} options
 * @param {number} [options.concurrency=8]
 * @param {boolean} [options.respectGitignore=true]
 * @param {string[]} [options.extraIgnore=[]]
 * @param {function(string, number, number): void} [options.onFile] — progress callback
 * @returns {Promise<{ rootPath, scannedAt, durationMs, files, summary }>}
 */
async function scanDirectory(rootPath, options = {}) {
  const {
    concurrency = 8,
    respectGitignore = true,
    extraIgnore = [],
    onFile,
  } = options;

  if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
    throw new Error(`Not a directory: ${rootPath}`);
  }

  const started = Date.now();
  const exts = formats.SUPPORTED_EXTS;
  const pattern = `**/*.{${exts.join(',')}}`;

  const ignore = [
    '**/node_modules/**',
    '**/masked_*',
    '**/.git/**',
    ...extraIgnore,
  ];
  if (respectGitignore) {
    ignore.push(...readIgnoreFile(path.join(rootPath, '.gitignore')));
    ignore.push(...readIgnoreFile(path.join(rootPath, '.kakashiignore')));
  }

  const allFiles = await glob(pattern, { cwd: rootPath, absolute: true, ignore, nodir: true });

  const fileResults = [];
  let processed = 0;

  await pool(allFiles, concurrency, async (filePath) => {
    try {
      const data = await formats.readFile(filePath);
      const { findings } = maskText(data.text);
      fileResults.push({
        path: path.relative(rootPath, filePath),
        findings, // raw findings — enrichment happens once at the end
      });
    } catch (err) {
      fileResults.push({
        path: path.relative(rootPath, filePath),
        findings: [],
        errors: [err.message],
      });
    } finally {
      processed++;
      if (onFile) onFile(filePath, processed, allFiles.length);
    }
  });

  // Enrich once at the end (PDPL articles, severity, checksum badges).
  const allFindings = fileResults.flatMap((f) => f.findings);
  const { findings: enrichedAll, summary } = summarize(allFindings);

  // Redistribute enriched findings back to per-file buckets in original order.
  let cursor = 0;
  const enrichedFiles = fileResults.map((f) => {
    const slice = enrichedAll.slice(cursor, cursor + f.findings.length);
    cursor += f.findings.length;
    return {
      path: f.path,
      findings: slice,
      ...(f.errors ? { errors: f.errors } : {}),
    };
  });

  return {
    rootPath,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    files: enrichedFiles,
    summary,
  };
}

module.exports = { scanDirectory, pool, readIgnoreFile };
