const fs = require('fs');
const path = require('path');

const CODE_EXTS = new Set([
  'txt', 'md', 'rst', 'log', 'py', 'pyw', 'ipynb',
  'js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx',
  'java', 'kt', 'scala', 'groovy',
  'go', 'rb', 'php', 'swift', 'rs', 'cpp', 'cc', 'cxx', 'c', 'h', 'hpp',
  'cs', 'dart', 'lua', 'r', 'jl', 'nim', 'zig', 'ex', 'exs', 'erl', 'elm',
  'clj', 'hs', 'ml', 'f90', 'pl',
  'sh', 'bash', 'zsh', 'fish', 'bat', 'ps1', 'cmd',
  'sql', 'plsql', 'hql', 'psql',
  'env', 'yaml', 'yml', 'toml', 'json', 'json5', 'jsonl', 'xml',
  'ini', 'cfg', 'conf', 'config', 'properties', 'dotenv',
  'tf', 'tfvars', 'hcl', 'proto', 'graphql', 'gql',
  'css', 'scss', 'sass', 'less', 'html', 'htm',
  'vue', 'svelte', 'astro',
  'csv', 'tsv',
  'dockerfile', 'makefile', 'vagrantfile', 'procfile',
  'gitignore', 'gitconfig', 'editorconfig',
  'lock', 'gradle', 'maven',
]);

const SPECIAL_FILENAMES = new Set([
  'dockerfile', 'makefile', 'vagrantfile', 'procfile',
  'gitignore', 'gitconfig', 'editorconfig',
]);

/**
 * Resolve the "extension" used to decide whether a file is maskable text.
 *
 * path.extname() is useless for dotfiles: it returns '' for `.env` and
 * `.gitignore` (a leading dot marks a hidden file, not an extension) and
 * '.local' for `.env.local`. That silently made the single most common secret
 * file in existence -- `.env` -- report as "Unsupported file format", while
 * `demo.env` worked fine. Dotfiles are resolved from the basename instead.
 */
function getExt(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (SPECIAL_FILENAMES.has(base)) return base;

  if (base.startsWith('.')) {
    const stripped = base.slice(1);               // '.env' -> 'env'
    if (SPECIAL_FILENAMES.has(stripped)) return stripped;   // '.gitignore'
    if (CODE_EXTS.has(stripped)) return stripped;           // '.env'
    const head = stripped.split('.')[0];          // '.env.production' -> 'env'
    if (CODE_EXTS.has(head)) return head;
    return '';
  }

  return path.extname(filePath).slice(1).toLowerCase();
}

function isTextFile(filePath) {
  return CODE_EXTS.has(getExt(filePath));
}

function readText(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return { text };
}

function writeText(filePath, maskedText) {
  fs.writeFileSync(filePath, maskedText, 'utf8');
}

module.exports = {
  CODE_EXTS,
  SPECIAL_FILENAMES,
  getExt,
  isTextFile,
  readText,
  writeText,
};
