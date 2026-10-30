/**
 * OBSERVE -- fingerprint a repository for Sweep.
 *
 * Walks the tree with exactly the scan-dir rules (supported extensions, dotfiles
 * included, node_modules/.git/masked_* excluded, root .gitignore/.kakashiignore
 * honoured and the exclusion COUNTED), plus Sweep's own run directory. Then
 * records what kind of data codebase this is: dbt projects, Airflow DAG folders,
 * languages, SQL dialect hints, notebooks, IaC.
 *
 * The fingerprint is value-free and deterministic: sorted lists, counts, paths.
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const formats = require('../engine/formats');
const { readIgnoreFile, pool } = require('../lib/scan-dir');
const { languageOf } = require('./selectors/schema');

const SWEEP_IGNORE = ['**/.kakashi/sweep/**'];

/** Dialect hints: a keyword that only (or mostly) one dialect uses. */
const DIALECT_HINTS = [
  ['snowflake', /\b(?:QUALIFY|VARIANT|FLATTEN\s*\(|COPY\s+INTO\s+@)/i],
  ['redshift', /\bUNLOAD\s*\(/i],
  ['bigquery', /`[\w-]+\.[\w-]+\.[\w-]+`|\bSAFE_CAST\s*\(/i],
  ['databricks', /\bUSING\s+DELTA\b|\bOPTIMIZE\s+\w+\s+ZORDER\b/i],
  ['postgres', /::\s*(?:text|int|jsonb?|timestamp)\b|\bILIKE\b/i],
  ['tsql', /\bTOP\s*\(\s*\d+\s*\)|\bNVARCHAR\b/i],
];

/**
 * List in-scope files.
 * @param {string} root absolute path
 * @param {object} [opts]
 * @param {boolean} [opts.respectGitignore=true]
 * @param {string[]} [opts.extraIgnore=[]]
 * @returns {Promise<{ files: string[], skippedByIgnoreFile: number, ignore: string[] }>} rel paths, sorted
 */
async function listFiles(root, { respectGitignore = true, extraIgnore = [] } = {}) {
  const pattern = formats.globPatterns(true);
  const baseIgnore = ['**/node_modules/**', '**/masked_*', '**/guarded_*', '**/.git/**', ...SWEEP_IGNORE, ...extraIgnore];
  const ignoreFileRules = respectGitignore
    ? [...readIgnoreFile(path.join(root, '.gitignore')), ...readIgnoreFile(path.join(root, '.kakashiignore'))]
    : [];
  const globOpts = { cwd: root, nodir: true, dot: true, nocase: true, posix: true };
  const files = (await glob(pattern, { ...globOpts, ignore: [...baseIgnore, ...ignoreFileRules] }))
    .map((f) => f.split(path.sep).join('/'))
    .sort();
  let skippedByIgnoreFile = 0;
  if (ignoreFileRules.length) {
    skippedByIgnoreFile = (await glob(pattern, { ...globOpts, ignore: baseIgnore })).length - files.length;
  }
  return { files, skippedByIgnoreFile, ignore: [...baseIgnore, ...ignoreFileRules] };
}

/**
 * Read every listed file as text (formats.readFile handles Office/PDF too).
 * Unreadable files are returned with an error, never dropped silently.
 * @returns {Promise<{ rel, text, bytes, error? }[]>} sorted by rel
 */
async function readFiles(root, rels, concurrency = 8) {
  const out = await pool(rels, concurrency, async (rel) => {
    const abs = path.join(root, rel);
    try {
      const { text } = await formats.readFile(abs);
      return { rel, text, bytes: fs.statSync(abs).size };
    } catch (err) {
      return { rel, text: '', bytes: 0, error: err.message };
    }
  });
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

/**
 * @param {string} root absolute
 * @param {{ rel, text }[]} files
 * @returns {object} value-free fingerprint
 */
function fingerprintFiles(root, files) {
  const languages = {};
  const dbtProjects = [];
  const manifests = [];
  const airflowDirs = new Set();
  const dialects = {};
  let notebooks = 0;
  let iac = 0;
  for (const { rel, text } of files) {
    const lang = languageOf(rel);
    languages[lang] = (languages[lang] || 0) + 1;
    const base = path.posix.basename(rel);
    if (base === 'dbt_project.yml' || base === 'dbt_project.yaml') dbtProjects.push(path.posix.dirname(rel));
    if (base === 'manifest.json' && /(^|\/)target\/manifest\.json$/.test(rel)) manifests.push(rel);
    if (lang === 'python' && /\bfrom\s+airflow\b|\bimport\s+airflow\b/.test(text)) {
      airflowDirs.add(path.posix.dirname(rel));
    }
    if (lang === 'notebook') notebooks++;
    if (lang === 'iac') iac++;
    if (lang === 'sql') {
      for (const [d, rx] of DIALECT_HINTS) if (rx.test(text)) dialects[d] = (dialects[d] || 0) + 1;
    }
  }
  const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  return {
    fileCount: files.length,
    languages: sortObj(languages),
    dbt: { projects: dbtProjects.sort(), manifests: manifests.sort() },
    airflow: { dagDirs: [...airflowDirs].sort() },
    sqlDialects: sortObj(dialects),
    notebooks,
    iac,
  };
}

module.exports = { listFiles, readFiles, fingerprintFiles, SWEEP_IGNORE, DIALECT_HINTS };
