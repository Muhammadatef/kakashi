/**
 * `sql_column` selectors -- sensitive columns in SQL, by clause.
 *
 * query:
 *   columns:    [email, "phone*", "*_phone", national_id]   case-insensitive,
 *               whole identifier, `*` glob; qualified `c.email` matches; an
 *               alias (`x as email`) does not -- the column token is what counts
 *   contexts:   [select, join, where, copy, unload, insert_select, ctas, select_star]
 *               omit = all
 *   pii_tables: [customers]   select_star only: `select *` from these tables
 *
 * Why a clause-aware lexer instead of grep: "email" in a WHERE filter, a JOIN
 * key, a COPY/UNLOAD export and a CTAS are different data flows with different
 * evidence (read / join / export / transform). The lexer is complete on its
 * own; when node-sql-parser is installed it is used per statement only to DROP
 * lexical hits whose column the parser does not see (aliases, oddities). Any
 * parse error keeps the lexical result -- recall first.
 *
 * dbt Jinja is resolved/blanked by dbt.stripJinja with line count preserved.
 * In Python files, SQL inside string literals passed to execute / read_sql /
 * spark.sql -- or passed as a `sql=` / `query=` keyword argument (Airflow
 * operators) -- is analysed with its lines mapped back to the .py file.
 */

const { stripJinja } = require('../../dbt');
const { notebookCode } = require('./ast');

const CONTEXTS = ['select', 'join', 'where', 'copy', 'unload', 'insert_select', 'ctas', 'select_star'];
const EVIDENCE = {
  select: 'read', where: 'read', join: 'join', copy: 'export', unload: 'export',
  insert_select: 'transform', ctas: 'transform', select_star: 'read',
};
const PARSERS = new WeakMap(); // OptionalRegistry → Parser instance | null

function globRx(list) {
  const parts = (list || []).map((g) => String(g).split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[\\w$]*'));
  return parts.length ? new RegExp(`^(?:${parts.join('|')})$`, 'i') : null;
}

/**
 * Tokenize SQL. Comments are skipped; tokens carry 1-based line numbers.
 * @param {string} sql
 * @param {number} baseLine line number of sql[0]
 */
function tokenize(sql, baseLine = 1) {
  const toks = [];
  let line = baseLine;
  let i = 0;
  const n = sql.length;
  const adv = (to) => { for (; i < to; i++) if (sql[i] === '\n') line++; };
  while (i < n) {
    const c = sql[i];
    if (c === '\n' || /\s/.test(c)) { adv(i + 1); continue; }
    if (c === '-' && sql[i + 1] === '-') { const e = sql.indexOf('\n', i); adv(e < 0 ? n : e); continue; }
    if (c === '#' && (i === 0 || sql[i - 1] === '\n')) { const e = sql.indexOf('\n', i); adv(e < 0 ? n : e); continue; }
    if (c === '/' && sql[i + 1] === '*') { const e = sql.indexOf('*/', i + 2); adv(e < 0 ? n : e + 2); continue; }
    if (c === "'") {
      const start = i;
      const l0 = line;
      let j = i + 1;
      while (j < n) { if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; } if (sql[j] === '\\') { j += 2; continue; } if (sql[j] === "'") break; j++; }
      toks.push({ t: 'str', v: sql.slice(start + 1, j), line: l0, start, end: j + 1 });
      adv(Math.min(n, j + 1));
      continue;
    }
    if (c === '$' && sql[i + 1] === '$') { const e = sql.indexOf('$$', i + 2); adv(e < 0 ? n : e + 2); continue; }
    if (c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c;
      const e = sql.indexOf(close, i + 1);
      if (e > i && !sql.slice(i + 1, e).includes('\n')) {
        toks.push({ t: 'id', q: true, v: sql.slice(i + 1, e), line, start: i, end: e + 1 });
        adv(e + 1);
        continue;
      }
    }
    const id = /^[A-Za-z_][\w$]*/.exec(sql.slice(i, i + 256));
    if (id) { toks.push({ t: 'id', v: id[0], lv: id[0].toLowerCase(), line, start: i, end: i + id[0].length }); adv(i + id[0].length); continue; }
    const num = /^\d+(\.\d+)?/.exec(sql.slice(i, i + 64));
    if (num) { toks.push({ t: 'num', line, start: i, end: i + num[0].length }); adv(i + num[0].length); continue; }
    toks.push({ t: c, line, start: i, end: i + 1 });
    adv(i + 1);
  }
  return toks;
}

const kw = (tok, ...words) => tok && tok.t === 'id' && !tok.q && words.includes(tok.lv);
const NON_ALIAS_PREV = new Set(['select', 'distinct', 'and', 'or', 'not', 'on', 'where', 'by', 'when', 'then', 'else', 'case', 'in', 'is', 'like', 'ilike', 'between', 'having', 'all', 'top', 'over', 'partition', 'using', 'qualify', 'set', 'return', 'exists', 'any', 'some', 'cast', 'end', 'desc', 'asc', 'nulls', 'first', 'last']);

/** Determine statement type from its leading tokens. */
function stmtType(toks) {
  const first = toks.find((t) => t.t === 'id');
  if (!first) return 'other';
  if (kw(first, 'copy')) return 'copy';
  if (kw(first, 'unload')) return 'unload';
  if (kw(first, 'insert', 'merge', 'upsert')) return 'insert_select';
  if (kw(first, 'create', 'replace')) {
    for (let i = 0; i < toks.length - 1; i++) {
      if (kw(toks[i], 'as') && (kw(toks[i + 1], 'select', 'with') || (toks[i + 1].t === '(' && kw(toks[i + 2], 'select', 'with')))) return 'ctas';
    }
    return 'other';
  }
  if (kw(first, 'select', 'with')) {
    // `with ... insert into` / `with ... create` are rare; treat as select.
    return 'select';
  }
  return 'other';
}

/**
 * Lexical analysis of one statement.
 * @returns {{ hits: {line:number, ctx:string, col?:string}[], stmt: {start:number,end:number,type:string} }}
 */
function analyseStatement(toks, colRx, tableRx, forced) {
  const type = forced || stmtType(toks);
  const hits = [];
  const tables = [];
  const stars = [];
  const exporting = type === 'copy' || type === 'unload';
  let state = exporting ? type : 'other';
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const prev = toks[i - 1];
    const next = toks[i + 1];
    if (t.t === 'id' && !t.q) {
      const w = t.lv;
      if (w === 'select') { state = 'select'; continue; }
      if (w === 'from') { state = 'from'; continue; }
      if (w === 'join') { state = 'join_tbl'; continue; }
      if ((w === 'on' || w === 'using') && state === 'join_tbl') { state = 'join'; continue; }
      if (w === 'where' || w === 'having' || w === 'qualify') { state = 'where'; continue; }
      if (w === 'group' || w === 'order' || w === 'limit' || w === 'window' || w === 'union'
        || w === 'values' || w === 'except' || w === 'intersect') { state = 'other'; continue; }
      if (w === 'into' || w === 'table' || w === 'update' || w === 'view') { state = 'into'; continue; }
      if (w === 'to' && exporting) { state = 'other'; continue; }
    }
    if (t.t === '*' && state === 'select' && prev && prev.t !== '(') { stars.push(t.line); continue; }
    if (t.t === 'str' && exporting) {
      // Redshift UNLOAD ('select ...'), Snowflake COPY INTO @stage FROM (...) strings
      const inner = analyseStatement(tokenize(t.v, t.line), colRx, tableRx, type);
      hits.push(...inner.hits);
      continue;
    }
    if (t.t !== 'id') continue;
    if (next && (next.t === '.' || next.t === '(')) continue; // qualifier or function
    if (state === 'from' || state === 'join_tbl' || state === 'into') {
      if (prev && (prev.t === '.' || kw(prev, 'from', 'join', 'into', 'table', 'update', 'view') || prev.t === ',')) {
        let name = t.v;
        for (let k = i - 1; k > 0 && toks[k].t === '.' && toks[k - 1].t === 'id'; k -= 2) name = `${toks[k - 1].v}.${name}`;
        tables.push({ last: t.v, full: name });
      }
      continue;
    }
    if (prev && kw(prev, 'as')) continue; // alias
    if (state === 'select' && prev && (prev.t === ')' || prev.t === 'str' || prev.t === 'num'
      || (prev.t === 'id' && (prev.q || !NON_ALIAS_PREV.has(prev.lv))))) continue; // implicit alias
    if (!colRx || !colRx.test(t.v)) continue;
    let ctx;
    if (exporting) ctx = type;
    else if (state === 'select') ctx = type === 'insert_select' || type === 'ctas' ? type : 'select';
    else if (state === 'where') ctx = 'where';
    else if (state === 'join') ctx = 'join';
    else continue;
    hits.push({ line: t.line, ctx, col: t.v.toLowerCase() });
  }
  if (tableRx && stars.length && tables.some((tb) => tableRx.test(tb.last) || tableRx.test(tb.full))) {
    for (const line of stars) hits.push({ line, ctx: 'select_star' });
  }
  return { hits, type };
}

/** Split tokens into statements on ';'. */
function statements(toks) {
  const out = [];
  let cur = [];
  for (const t of toks) {
    if (t.t === ';') { if (cur.length) out.push(cur); cur = []; } else cur.push(t);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Columns node-sql-parser sees in a statement, or null when it cannot parse. */
function parserColumns(parser, sql) {
  if (!parser) return null;
  try {
    const list = parser.columnList(sql);
    if (!Array.isArray(list)) return null;
    const cols = new Set();
    for (const e of list) {
      const name = String(e).split('::').pop();
      if (name === '(.*)') return null; // wildcard: no filtering possible
      cols.add(name.toLowerCase());
    }
    return cols;
  } catch (_) {
    return null;
  }
}

/**
 * Analyse SQL text (already Jinja-stripped).
 * @returns {{line:number, ctx:string}[]}
 */
function analyseSql(sql, baseLine, q, parser) {
  const colRx = globRx(q.columns);
  const tableRx = globRx(q.pii_tables);
  const out = [];
  for (const st of statements(tokenize(sql, baseLine))) {
    const { hits, type } = analyseStatement(st, colRx, tableRx);
    let keep = hits;
    if (parser && (type === 'select' || type === 'insert_select' || type === 'ctas')) {
      const cols = parserColumns(parser, sql.slice(st[0].start, st[st.length - 1].end));
      if (cols) keep = hits.filter((h) => !h.col || cols.has(h.col));
    }
    out.push(...keep);
  }
  return out;
}

const PY_SQL_CALL = /\b(?:execute|executemany|read_sql|read_sql_query|read_sql_table|sql|text)\s*\(\s*(?:[A-Za-z_]\w*\s*=\s*)?([rRfFuUbB]{0,2})("""|'''|"|')/g;
// Keyword arguments that carry SQL into operators/hooks, e.g. Airflow
// SqlToS3Operator(query="select email ..."), SQLExecuteQueryOperator(sql='...').
const PY_SQL_KWARG = /[(,]\s*(?:sql|query)\s*=\s*([rRfFuUbB]{0,2})("""|'''|"|')/g;

/** SQL string literals passed to DB calls in Python, with their first line. */
function pythonSqlLiterals(text) {
  const out = [];
  const seen = new Set();
  const nlBefore = (idx) => { let c = 1; for (let i = 0; i < idx; i++) if (text[i] === '\n') c++; return c; };
  for (const RX of [PY_SQL_CALL, PY_SQL_KWARG]) {
    RX.lastIndex = 0;
    let m;
    while ((m = RX.exec(text))) {
      const q = m[2];
      const start = m.index + m[0].length;
      let end = start;
      while (end < text.length) {
        if (text[end] === '\\') { end += 2; continue; }
        if (text.substr(end, q.length) === q) break;
        if (q.length === 1 && text[end] === '\n') break;
        end++;
      }
      let body = text.slice(start, end);
      if (/f/i.test(m[1])) body = body.replace(/\{[^{}\n]*\}/g, (x) => ' '.repeat(x.length));
      if (!seen.has(start)) { seen.add(start); out.push({ sql: body, line: nlBefore(start) }); }
      RX.lastIndex = end + q.length;
    }
  }
  return out;
}

module.exports = {
  kind: 'sql_column',
  defaultLanguages: ['sql'],
  CONTEXTS,

  validateQuery(q) {
    const errors = [];
    if (!Array.isArray(q.columns) && !Array.isArray(q.pii_tables)) errors.push('columns (or pii_tables for select_star) is required');
    for (const f of ['columns', 'pii_tables']) {
      if (q[f] !== undefined && (!Array.isArray(q[f]) || q[f].some((c) => typeof c !== 'string' || !/^[\w$.*]+$/.test(c)))) {
        errors.push(`${f} must be a list of identifiers (\`*\` glob allowed)`);
      }
    }
    if (q.contexts !== undefined) {
      if (!Array.isArray(q.contexts)) errors.push('contexts must be a list');
      else for (const c of q.contexts) if (!CONTEXTS.includes(c)) errors.push(`unknown context "${c}" (${CONTEXTS.join('|')})`);
    }
    if (Array.isArray(q.contexts) && q.contexts.includes('select_star') && !Array.isArray(q.pii_tables)) {
      errors.push('select_star needs pii_tables');
    }
    return errors;
  },

  /** Load node-sql-parser once per registry. Never throws. */
  async prepare(ctx) {
    const reg = ctx && ctx.optional;
    if (!reg || PARSERS.has(reg)) return;
    let parser = null;
    try {
      const mod = reg.load('node-sql-parser');
      const P = mod && (mod.Parser || (mod.default && mod.default.Parser));
      if (P) parser = new P();
      else if (mod) reg.fail('node-sql-parser', 'module has no Parser export');
    } catch (err) {
      parser = null;
      if (typeof reg.fail === 'function') reg.fail('node-sql-parser', err.message);
    }
    PARSERS.set(reg, parser);
  },

  match(selector, file, ctx) {
    const q = selector.query || {};
    const allowed = q.contexts ? new Set(q.contexts) : null;
    let parser = null;
    if (ctx && ctx.optional) {
      if (!PARSERS.has(ctx.optional)) {
        // prepare() not awaited by the caller: load synchronously (require is sync).
        try {
          const mod = ctx.optional.load('node-sql-parser');
          const P = mod && (mod.Parser || (mod.default && mod.default.Parser));
          PARSERS.set(ctx.optional, P ? new P() : null);
          if (mod && !P && typeof ctx.optional.fail === 'function') ctx.optional.fail('node-sql-parser', 'module has no Parser export');
        } catch (err) {
          PARSERS.set(ctx.optional, null);
          if (typeof ctx.optional.fail === 'function') ctx.optional.fail('node-sql-parser', err.message);
        }
      }
      parser = PARSERS.get(ctx.optional);
    }

    let hits = [];
    const lang = file.lang;
    if (lang === 'python' || lang === 'notebook' || /\.(py|pyw|ipynb)$/i.test(file.rel || '')) {
      let text = file.text;
      let lineMap = null;
      if (lang === 'notebook' || /\.ipynb$/i.test(file.rel || '')) {
        const nb = notebookCode(file.text);
        if (!nb) return [];
        text = nb.code;
        lineMap = nb.lineMap;
      }
      for (const lit of pythonSqlLiterals(text)) hits.push(...analyseSql(stripJinja(lit.sql), lit.line, q, parser));
      if (lineMap) hits = hits.map((h) => ({ ...h, line: lineMap[h.line - 1] || 1 }));
    } else {
      hits = analyseSql(stripJinja(file.text), 1, q, parser);
    }

    const out = [];
    const seen = new Set();
    for (const h of hits) {
      if (allowed && !allowed.has(h.ctx)) continue;
      if (h.ctx === 'select_star' && !q.pii_tables) continue;
      const ev = EVIDENCE[h.ctx];
      const key = `${h.line}:${ev}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ startLine: h.line, endLine: h.line, evidence_kind: ev });
    }
    return out.sort((a, b) => a.startLine - b.startLine);
  },

  // exported for tests
  tokenize,
  analyseSql,
};
