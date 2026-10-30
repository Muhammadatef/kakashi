/**
 * dbt project loader for Sweep -- lineage without running dbt.
 *
 * Why: PII rarely stays in the source table. dbt models copy it into staging
 * and marts, and exposures ship it to dashboards. `dbt_graph` selectors need
 * that lineage, and `sql_column` needs model SQL with Jinja resolved. Running
 * dbt (or a Jinja engine) is out of the question for an offline privacy tool,
 * so we:
 *
 *   1. prefer target/manifest.json when the user already compiled the project
 *      (exact lineage, written by dbt itself), else
 *   2. build a static graph: model-paths from dbt_project.yml, `ref()` /
 *      `source()` calls in .sql, sources / models / exposures from schema .yml.
 *
 * `stripJinja` resolves ref/source to plain names and blanks every other Jinja
 * construct while PRESERVING line count and per-line positions, so spans that
 * SQL analysis reports on the stripped text are correct for the original file.
 *
 * Nothing here retains file contents beyond names, tags and line numbers.
 */

const path = require('path');
const { parse: parseYaml } = require('./yaml');

const REF_RX = /\bref\s*\(\s*(?:['"][^'"]*['"]\s*,\s*)?['"]([^'"]+)['"]\s*(?:,[^)]*)?\)/g;
const SOURCE_RX = /\bsource\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g;

/** Replace text with spaces, keeping newlines (line count + columns stable). */
function blank(s) { return s.replace(/[^\n]/g, ' '); }

/**
 * Resolve `{{ ref('x') }}` → x, `{{ source('s','t') }}` → s.t; blank every
 * other `{{ }}`, `{% %}` and `{# #}`. Line count is preserved exactly.
 * @param {string} text
 * @returns {string}
 */
function stripJinja(text) {
  return String(text).replace(/\{#[\s\S]*?#\}|\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}/g, (m) => {
    if (m.startsWith('{{')) {
      const inner = m.slice(2, -2).trim();
      let r = /^ref\s*\(\s*(?:['"][^'"]*['"]\s*,\s*)?['"]([^'"]+)['"]\s*(?:,[^)]*)?\)$/.exec(inner);
      let name = r ? r[1] : null;
      if (!name) {
        r = /^source\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)$/.exec(inner);
        if (r) name = `${r[1]}.${r[2]}`;
      }
      if (name) {
        const nl = (m.match(/\n/g) || []).length;
        // Pad to the original length: later text on the line keeps its column.
        return name + ' '.repeat(Math.max(0, m.length - name.length - nl)) + '\n'.repeat(nl);
      }
    }
    return blank(m);
  });
}

/** ref()/source() calls in raw model SQL. */
function scanRefs(text) {
  const refs = new Set();
  const sources = new Set();
  let m;
  REF_RX.lastIndex = 0;
  while ((m = REF_RX.exec(text))) refs.add(m[1]);
  SOURCE_RX.lastIndex = 0;
  while ((m = SOURCE_RX.exec(text))) sources.add(`${m[1]}.${m[2]}`);
  return { refs: [...refs], sources: [...sources] };
}

/** 1-based line of the first `name: <value>` at/after line `from` (1-based), or 0. */
function findNameLine(text, value, from = 1) {
  const lines = String(text).split('\n');
  const esc = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(`^\\s*(?:-\\s*)?name\\s*:\\s*['"]?${esc}['"]?\\s*(?:#.*)?$`);
  for (let i = Math.max(0, from - 1); i < lines.length; i++) if (rx.test(lines[i])) return i + 1;
  return 0;
}

function asList(v) { return Array.isArray(v) ? v : []; }
function tagsOf(o) {
  if (!o || typeof o !== 'object') return [];
  const t = o.tags || (o.config && o.config.tags);
  return Array.isArray(t) ? t.map(String) : typeof t === 'string' ? [t] : [];
}
function metaOf(o) {
  if (!o || typeof o !== 'object') return {};
  const m = o.meta || (o.config && o.config.meta);
  return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
}

/** Collect tags + truthy meta keys from a node and its columns (value-free). */
function marks(node) {
  const tags = new Set(tagsOf(node));
  const meta = new Set(Object.keys(metaOf(node)).filter((k) => metaOf(node)[k]));
  const cols = node && node.columns;
  const colList = Array.isArray(cols) ? cols : cols && typeof cols === 'object' ? Object.values(cols) : [];
  for (const c of colList) {
    for (const t of tagsOf(c)) tags.add(t);
    const cm = metaOf(c);
    for (const k of Object.keys(cm)) if (cm[k]) meta.add(k);
  }
  return { tags: [...tags], meta: [...meta] };
}

/** Parse an exposure depends_on entry: "ref('x')" | "source('a','b')" | node id. */
function parseDep(d) {
  const s = String(d);
  let m = /ref\s*\(\s*(?:['"][^'"]*['"]\s*,\s*)?['"]([^'"]+)['"]/.exec(s);
  if (m) return { model: m[1] };
  m = /source\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/.exec(s);
  if (m) return { source: `${m[1]}.${m[2]}` };
  const parts = s.split('.');
  if (parts[0] === 'model' && parts.length >= 3) return { model: parts[parts.length - 1] };
  if (parts[0] === 'source' && parts.length >= 4) return { source: `${parts[parts.length - 2]}.${parts[parts.length - 1]}` };
  return {};
}

function emptyProject(projectDir) {
  return { projectDir, manifestUsed: false, models: {}, sources: {}, exposures: {}, piiModels: new Set(), errors: [] };
}

function fromManifest(dbt, manifest, projectDir, readText) {
  const textCache = new Map();
  const textOf = (rel) => {
    if (!textCache.has(rel)) { let t = null; try { t = readText(rel); } catch (_) { t = null; } textCache.set(rel, t); }
    return textCache.get(rel);
  };
  const relOf = (p) => (p ? path.posix.join(projectDir || '', String(p).replace(/^[^:]+:\/\//, '').replace(/\\/g, '/')) : null);
  for (const n of Object.values(manifest.nodes || {})) {
    if (!n || n.resource_type !== 'model') continue;
    const deps = asList(n.depends_on && n.depends_on.nodes).map(parseDep);
    const mk = marks(n);
    dbt.models[n.name] = {
      rel: relOf(n.original_file_path || n.path),
      refs: deps.filter((d) => d.model).map((d) => d.model),
      sources: deps.filter((d) => d.source).map((d) => d.source),
      tags: mk.tags, meta: mk.meta,
    };
  }
  for (const s of Object.values(manifest.sources || {})) {
    if (!s) continue;
    const key = `${s.source_name}.${s.name}`;
    const rel = relOf(s.original_file_path || s.patch_path);
    const text = rel ? textOf(rel) : null;
    const srcLine = text ? findNameLine(text, s.source_name) : 0;
    const line = text ? (findNameLine(text, s.name, srcLine + 1) || srcLine || 1) : 1;
    const mk = marks(s);
    const tags = new Set([...mk.tags, ...tagsOf({ tags: s.tags })]);
    const meta = new Set([...mk.meta, ...Object.keys(s.source_meta || {}).filter((k) => s.source_meta[k])]);
    dbt.sources[key] = { rel, line, tags: [...tags], meta: [...meta] };
  }
  for (const e of Object.values(manifest.exposures || {})) {
    if (!e) continue;
    const rel = relOf(e.original_file_path);
    const text = rel ? textOf(rel) : null;
    dbt.exposures[e.name] = {
      rel,
      line: (text && findNameLine(text, e.name)) || 1,
      depends_on: asList(e.depends_on && e.depends_on.nodes).map(parseDep),
    };
  }
}

function fromStatic(dbt, projectDir, relFiles, readText, modelPaths) {
  const inProject = (rel) => !projectDir || rel === projectDir || rel.startsWith(`${projectDir}/`);
  const local = (rel) => (projectDir ? rel.slice(projectDir.length + 1) : rel);
  const inModels = (rel) => modelPaths.some((mp) => mp === '' || local(rel) === mp || local(rel).startsWith(`${mp.replace(/\/$/, '')}/`));
  for (const rel of relFiles) {
    if (!inProject(rel)) continue;
    if (/\.sql$/i.test(rel) && inModels(rel)) {
      let text;
      try { text = readText(rel); } catch (_) { text = null; }
      if (text == null) continue;
      const { refs, sources } = scanRefs(text);
      dbt.models[path.posix.basename(rel).replace(/\.sql$/i, '')] = { rel, refs, sources, tags: [], meta: [] };
    }
  }
  for (const rel of relFiles) {
    if (!inProject(rel) || !/\.ya?ml$/i.test(rel) || /(^|\/)dbt_project\.ya?ml$/i.test(rel)) continue;
    let text;
    try { text = readText(rel); } catch (_) { text = null; }
    if (text == null || !/^\s*(sources|models|exposures)\s*:/m.test(text)) continue;
    let doc;
    try { doc = parseYaml(text, rel); } catch (e) { dbt.errors.push({ file: rel, error: e.message }); continue; }
    if (!doc || typeof doc !== 'object') continue;
    for (const src of asList(doc.sources)) {
      if (!src || !src.name) continue;
      const srcLine = findNameLine(text, src.name) || 1;
      const srcMarks = marks({ tags: tagsOf(src), meta: metaOf(src) });
      for (const t of asList(src.tables)) {
        if (!t || !t.name) continue;
        const mk = marks(t);
        dbt.sources[`${src.name}.${t.name}`] = {
          rel,
          line: findNameLine(text, t.name, srcLine + 1) || srcLine,
          tags: [...new Set([...srcMarks.tags, ...mk.tags])],
          meta: [...new Set([...srcMarks.meta, ...mk.meta])],
        };
      }
    }
    for (const m of asList(doc.models)) {
      if (!m || !m.name) continue;
      const mk = marks(m);
      const entry = dbt.models[m.name] || (dbt.models[m.name] = { rel: null, refs: [], sources: [], tags: [], meta: [] });
      entry.tags = [...new Set([...entry.tags, ...mk.tags])];
      entry.meta = [...new Set([...entry.meta, ...mk.meta])];
    }
    for (const e of asList(doc.exposures)) {
      if (!e || !e.name) continue;
      dbt.exposures[e.name] = { rel, line: findNameLine(text, e.name) || 1, depends_on: asList(e.depends_on).map(parseDep) };
    }
  }
}

/**
 * Load a dbt project's lineage.
 * @param {string} rootAbs repository root (absolute; informational)
 * @param {string[]} relFiles repo-relative POSIX paths
 * @param {(rel: string) => string|null} readText
 * @returns {object|null} dbt project (see contract), or null when no dbt project is present
 */
function loadDbtProject(rootAbs, relFiles, readText) {
  const files = relFiles.map((r) => String(r).replace(/\\/g, '/'));
  const projFile = files.filter((r) => /(^|\/)dbt_project\.ya?ml$/i.test(r))
    .sort((a, b) => a.split('/').length - b.split('/').length)[0];
  const looksDbt = projFile || files.some((r) => /(^|\/)target\/manifest\.json$/.test(r));
  if (!looksDbt) {
    // Fixture-sized projects may omit dbt_project.yml; accept if any .sql uses ref/source.
    const any = files.some((r) => {
      if (!/\.sql$/i.test(r)) return false;
      try { const t = readText(r); return t != null && /\{\{\s*(ref|source)\s*\(/.test(t); } catch (_) { return false; }
    });
    if (!any) return null;
  }
  const projectDir = projFile ? path.posix.dirname(projFile).replace(/^\.$/, '') : '';
  const dbt = emptyProject(projectDir);

  let modelPaths = ['models'];
  if (projFile) {
    try {
      const doc = parseYaml(readText(projFile) || '', projFile);
      const mp = doc && (doc['model-paths'] || doc.source_paths || doc['source-paths']);
      if (Array.isArray(mp) && mp.length) modelPaths = mp.map(String);
    } catch (e) { dbt.errors.push({ file: projFile, error: e.message }); }
  } else {
    modelPaths = ['']; // no project file: every .sql is a model
  }

  const manRel = path.posix.join(projectDir, 'target/manifest.json');
  if (files.includes(manRel)) {
    try {
      const manifest = JSON.parse(readText(manRel));
      fromManifest(dbt, manifest, projectDir, readText);
      dbt.manifestUsed = true;
      return dbt;
    } catch (e) {
      dbt.errors.push({ file: manRel, error: `manifest unreadable: ${e.message}` });
    }
  }
  fromStatic(dbt, projectDir, files, readText, modelPaths);
  return dbt;
}

/**
 * Per-query PII lineage: which sources are PII and which models are
 * (transitively) downstream of them.
 * @param {object} dbt
 * @param {{source_tags?: string[], meta_keys?: string[]}} q
 * @returns {{ piiSources: Set<string>, piiModels: Set<string> }}
 */
function computePii(dbt, q) {
  const tags = new Set((q.source_tags || []).map((t) => String(t).toLowerCase()));
  const metaKeys = new Set((q.meta_keys || []).map((t) => String(t).toLowerCase()));
  const marked = (o) => (o.tags || []).some((t) => tags.has(String(t).toLowerCase()))
    || (o.meta || []).some((k) => metaKeys.has(String(k).toLowerCase()));
  const piiSources = new Set(Object.keys(dbt.sources).filter((k) => marked(dbt.sources[k])));
  const roots = new Set(Object.keys(dbt.models).filter((k) => marked(dbt.models[k])));
  const piiModels = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, m] of Object.entries(dbt.models)) {
      if (piiModels.has(name)) continue;
      if (m.sources.some((s) => piiSources.has(s)) || m.refs.some((r) => piiModels.has(r) || roots.has(r))) {
        piiModels.add(name);
        changed = true;
      }
    }
  }
  return { piiSources, piiModels, roots };
}

module.exports = { loadDbtProject, stripJinja, scanRefs, computePii, findNameLine };
