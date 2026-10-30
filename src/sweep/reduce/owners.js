/**
 * CODEOWNERS resolution for Sweep findings.
 *
 * Why: a finding nobody owns does not get fixed. GitHub's rules: the first of
 * CODEOWNERS, .github/CODEOWNERS, docs/CODEOWNERS that exists wins; within it
 * the LAST matching pattern wins. Patterns are gitignore-style globs. Only
 * owner handles (team/user names) are read -- they are not personal data the
 * engine masks beyond what the repo already publishes, and no file contents
 * besides CODEOWNERS are touched.
 */

const fs = require('fs');
const path = require('path');

function globToRegExp(pattern) {
  let p = pattern.trim();
  const anchored = p.startsWith('/') || p.replace(/\/$/, '').includes('/');
  p = p.replace(/^\//, '');
  const dirOnly = p.endsWith('/');
  if (dirOnly) p = p.slice(0, -1);
  let rx = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*' && p[i + 1] === '*') { rx += '.*'; i++; if (p[i + 1] === '/') i++; }
    else if (c === '*') rx += '[^/]*';
    else if (c === '?') rx += '[^/]';
    else rx += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  const prefix = anchored ? '^' : '(^|.*/)';
  return new RegExp(`${prefix}${rx}(/.*)?$`);
}

/** @returns {{pattern: string, rx: RegExp, owners: string[]}[]} */
function loadCodeowners(root) {
  for (const rel of ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS']) {
    let text;
    try { text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch (_) { continue; }
    const rules = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/\s+#.*$/, '').trim();
      if (!line || line.startsWith('#')) continue;
      const [pattern, ...owners] = line.split(/\s+/);
      rules.push({ pattern, rx: globToRegExp(pattern), owners });
    }
    return rules;
  }
  return [];
}

/** Last matching rule wins. */
function ownersFor(rules, rel) {
  let owners = [];
  for (const r of rules) if (r.rx.test(rel)) owners = r.owners;
  return [...owners].sort();
}

module.exports = { loadCodeowners, ownersFor, globToRegExp };
