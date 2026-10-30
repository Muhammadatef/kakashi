/**
 * `ast` selectors -- Python data-flow sinks: logging records, writing frames,
 * shipping data over HTTP / cloud storage / SMTP / Airflow, reading from DBs.
 *
 * query:
 *   matcher: log_call | df_write | http_send | cloud_upload | smtp_send
 *            | airflow_transfer | db_read
 *   callees: ["my_logger.info", ...]   optional extra callee names
 *
 * Why two paths: tree-sitter gives exact call nodes, but it is an optional
 * dependency. The lexical path below is complete on its own -- it masks string
 * and comment interiors (so a sink named inside a string never matches),
 * balances parentheses to find each call's argument span, and reports line
 * spans. When tree-sitter is available, `prepare` loads it once and `match`
 * uses it only to DROP lexical hits that do not start on a real call node;
 * any parser error leaves the lexical result untouched.
 *
 * Notebooks (.ipynb): code cells are extracted and every line is mapped back to
 * the JSON line holding that cell's source string, so spans point into the
 * notebook file the user actually has.
 */

const MATCHERS = ['log_call', 'df_write', 'http_send', 'cloud_upload', 'smtp_send', 'airflow_transfer', 'db_read'];
const EVIDENCE = {
  log_call: 'log', df_write: 'export', http_send: 'export', cloud_upload: 'export',
  smtp_send: 'export', airflow_transfer: 'export', db_read: 'read',
};

const RECORDISH = /df|frame|row|record|customer|user|payload|data/i;
const COUNTISH = /^(n_|num_|count|len$|total_)|(_count|_len|_total|_size)$/i;

const PARSERS = new WeakMap(); // OptionalRegistry → { parser } | null

/**
 * Mask Python string and comment interiors with spaces (quotes and newlines
 * kept), so lexical search sees only code. Offsets are unchanged.
 * @param {string} text
 * @returns {string}
 */
function maskPython(text) {
  const out = text.split('');
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '#') {
      while (i < n && text[i] !== '\n') out[i++] = ' ';
      continue;
    }
    if (c === '"' || c === "'") {
      const triple = text.substr(i, 3) === c.repeat(3);
      const q = triple ? c.repeat(3) : c;
      i += q.length;
      while (i < n) {
        if (text[i] === '\\') { out[i] = ' '; if (i + 1 < n && text[i + 1] !== '\n') out[i + 1] = ' '; i += 2; continue; }
        if (text.substr(i, q.length) === q) { i += q.length; break; }
        if (!triple && text[i] === '\n') break; // unterminated single-line string
        if (text[i] !== '\n') out[i] = ' ';
        i++;
      }
      continue;
    }
    i++;
  }
  return out.join('');
}

/** Index → 1-based line lookup. */
function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (off) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= off) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** Index of the ')' closing the '(' at `open` in masked text, or -1. */
function closeParen(masked, open) {
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    const c = masked[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function escapeRx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Does a log call's argument text carry a record-ish expression? */
function recordishArgs(maskedArgs, rawArgs) {
  for (const tok of maskedArgs.match(/[A-Za-z_]\w*/g) || []) {
    if (/^(f|r|b|rf|fr|u|br|rb)$/i.test(tok)) continue; // string prefixes
    if (COUNTISH.test(tok)) continue;
    if (RECORDISH.test(tok)) return true;
  }
  if (/\.\s*(head|to_dict|to_json|to_string|to_records|sample|tail)\s*\(/.test(maskedArgs)) return true;
  // f-strings: inspect {expressions} inside f'...'
  const fx = /\b[fF][rR]?(['"]{1,3})([\s\S]*?)\1/g;
  let m;
  while ((m = fx.exec(rawArgs))) {
    const braces = m[2].match(/\{([^{}]+)\}/g) || [];
    for (const b of braces) {
      const expr = b.slice(1, -1);
      if (/\.\s*(head|to_dict|to_json|to_string|to_records)\s*\(/.test(expr)) return true;
      for (const tok of expr.match(/[A-Za-z_]\w*/g) || []) {
        if (!COUNTISH.test(tok) && RECORDISH.test(tok)) return true;
      }
    }
  }
  return false;
}

/**
 * Lexical rules per matcher. Each rule: { rx, call?: bool, check?(ctx) }
 * rx runs on masked code (global). `call` → span extends to the closing paren.
 */
function rulesFor(matcher, extra, raw) {
  const r = [];
  const add = (src, opts = {}) => r.push({ rx: new RegExp(src, 'g'), call: true, ...opts });
  switch (matcher) {
    case 'log_call':
      add('\\b(?:logging|logger|log|LOGGER|LOG|_logger|_log|self\\s*\\.\\s*(?:logger|log))\\s*\\.\\s*(?:info|debug|warning|warn|error|exception|critical|fatal)\\s*\\(', { log: true });
      add('(?<![.\\w])print\\s*\\(', { log: true });
      for (const c of extra) add(`(?<![.\\w])${c.split('.').map((p) => escapeRx(p.trim())).join('\\s*\\.\\s*')}\\s*\\(`, { log: true });
      break;
    case 'df_write':
      add('\\.\\s*(?:to_csv|to_parquet|to_excel|to_json|to_sql|to_feather|to_pickle|to_orc)\\s*\\(');
      add('\\.\\s*write(?:Stream)?(?:\\s*\\.[\\s\\S]{0,300}?)?\\s*\\.\\s*(?:save|saveAsTable|insertInto|csv|parquet|json|orc|text|jdbc|start|toTable)\\s*\\(');
      break;
    case 'http_send':
      add('\\b(?:requests|httpx|session|sess|client|http_client)\\s*\\.\\s*(?:post|put|patch)\\s*\\(');
      add('\\brequests\\s*\\.\\s*request\\s*\\(');
      break;
    case 'cloud_upload':
      add('\\.\\s*(?:put_object|upload_file|upload_fileobj|upload_from_filename|upload_from_string|upload_from_file|upload_blob)\\s*\\(');
      r.push({ rx: /\.\s*open\s*\(\s*[fFrR]?(['"])(?:s3|s3a|gs|gcs|abfs|az):\/\/[^'"]*\1\s*,\s*[fFrR]?(['"])[wax]b?\+?\2/g, call: false, onRaw: true });
      break;
    case 'smtp_send':
      add('\\.\\s*(?:sendmail|send_message)\\s*\\(');
      break;
    case 'airflow_transfer':
      add('\\b\\w*To(?:S3|GCS|Gcs|Sftp|SFTP)Operator\\s*\\(');
      add('\\b(?:SFTPOperator|EmailOperator|SimpleHttpOperator|HttpOperator|HttpSensor)\\s*\\(');
      add('(?<![.\\w])send_email\\s*\\(');
      if (/\b(S3Hook|GCSHook|GoogleCloudStorageHook)\b/.test(raw)) add('\\.\\s*(?:load_file|load_string|load_bytes|load_file_obj|upload)\\s*\\(');
      if (/\bSFTPHook\b/.test(raw)) add('\\.\\s*(?:store_file|put)\\s*\\(');
      break;
    case 'db_read':
      add('\\b(?:pd|pandas)\\s*\\.\\s*read_sql(?:_query|_table)?\\s*\\(');
      add('\\bspark\\s*\\.\\s*sql\\s*\\(');
      add('\\bspark\\s*\\.\\s*read\\s*\\.\\s*(?:table|jdbc)\\s*\\(');
      add('\\b\\w*cur\\w*\\s*\\.\\s*execute(?:many)?\\s*\\(');
      break;
    default:
      break;
  }
  if (matcher !== 'log_call') for (const c of extra) add(`(?<![.\\w])${c.split('.').map((p) => escapeRx(p.trim())).join('\\s*\\.\\s*')}\\s*\\(`);
  return r;
}

/**
 * Lexical match over Python source.
 * @returns {{startLine:number,endLine:number}[]}
 */
function lexicalMatch(matcher, extra, text) {
  const masked = maskPython(text);
  const lineOf = lineIndex(text);
  const isCode = (i) => masked[i] === text[i];
  const out = [];
  const seen = new Set();
  for (const rule of rulesFor(matcher, extra, masked)) {
    const hay = rule.onRaw ? text : masked;
    rule.rx.lastIndex = 0;
    let m;
    while ((m = rule.rx.exec(hay))) {
      const start = m.index;
      if (rule.onRaw && !isCode(start)) continue;
      let end = start + m[0].length - 1;
      if (rule.call) {
        const open = end; // regex ends at '('
        const close = closeParen(masked, open);
        if (close > 0) end = close;
        if (rule.log && !recordishArgs(masked.slice(open + 1, close > 0 ? close : open + 1), text.slice(open + 1, close > 0 ? close : open + 1))) continue;
      }
      const span = { startLine: lineOf(start), endLine: lineOf(end) };
      const key = `${span.startLine}:${span.endLine}`;
      if (!seen.has(key)) { seen.add(key); out.push(span); }
    }
  }
  return out.sort((a, b) => a.startLine - b.startLine);
}

/**
 * Extract notebook code cells with a line map back into the .ipynb JSON.
 * @param {string} json raw notebook text
 * @returns {{ code: string, lineMap: number[] }|null} lineMap[i] = JSON line of code line i+1
 */
function notebookCode(json) {
  let nb;
  try { nb = JSON.parse(json); } catch (_) { return null; }
  if (!nb || !Array.isArray(nb.cells)) return null;
  const lineOf = lineIndex(json);
  let cursor = 0;
  const codeLines = [];
  const lineMap = [];
  for (const cell of nb.cells) {
    const keyAt = json.indexOf('"source"', cursor);
    if (keyAt < 0) break;
    cursor = keyAt + 8;
    const src = Array.isArray(cell.source) ? cell.source.map(String) : typeof cell.source === 'string' ? [cell.source] : [];
    const keyLine = lineOf(keyAt);
    const elemLines = [];
    for (const el of src) {
      const enc = JSON.stringify(el);
      const at = json.indexOf(enc, cursor);
      if (at >= 0 && enc.length > 2) { elemLines.push(lineOf(at)); cursor = at + enc.length; } else elemLines.push(keyLine);
    }
    if (cell.cell_type !== 'code') continue;
    // Map each physical code line to the JSON line of the element it starts in.
    const cellText = src.join('');
    const elemStart = [];
    let off = 0;
    for (const el of src) { elemStart.push(off); off += el.length; }
    let pos = 0;
    for (const ln of cellText.split('\n')) {
      let k = 0;
      while (k + 1 < elemStart.length && elemStart[k + 1] <= pos) k++;
      codeLines.push(ln);
      lineMap.push(elemLines[k] || keyLine);
      pos += ln.length + 1;
    }
    codeLines.push(''); // cell separator keeps cells from merging lexically
    lineMap.push(keyLine);
  }
  return { code: codeLines.join('\n'), lineMap };
}

/** Collect the 1-based start rows of every `call` node in a tree-sitter tree. */
function callRows(tree) {
  const rows = new Set();
  const stack = [tree.rootNode];
  while (stack.length) {
    const node = stack.pop();
    if (node.type === 'call') rows.add(node.startPosition.row + 1);
    for (let i = 0; i < node.childCount; i++) stack.push(node.child(i));
  }
  return rows;
}

module.exports = {
  kind: 'ast',
  defaultLanguages: ['python', 'notebook'],
  MATCHERS,

  validateQuery(q) {
    const errors = [];
    if (!MATCHERS.includes(q.matcher)) errors.push(`matcher must be one of ${MATCHERS.join('|')}`);
    if (q.callees !== undefined && (!Array.isArray(q.callees) || q.callees.some((c) => typeof c !== 'string' || !/^[A-Za-z_][\w.]*$/.test(c)))) {
      errors.push('callees must be a list of dotted identifiers');
    }
    return errors;
  },

  /** Load web-tree-sitter + the Python grammar once per registry. Never throws. */
  async prepare(ctx) {
    const reg = ctx && ctx.optional;
    if (!reg || PARSERS.has(reg)) return;
    PARSERS.set(reg, null);
    try {
      const mod = reg.load('web-tree-sitter');
      const wasm = reg.resolve('tree-sitter-python', 'tree-sitter-python.wasm');
      if (!mod || !wasm) { if (mod && !wasm) reg.load('tree-sitter-python'); return; }
      const Parser = mod.Parser || mod.default || mod;
      await Parser.init();
      const Language = mod.Language || Parser.Language;
      const lang = await Language.load(wasm);
      const parser = new Parser();
      parser.setLanguage(lang);
      PARSERS.set(reg, { parser });
    } catch (err) {
      PARSERS.set(reg, null);
      if (typeof reg.fail === 'function') reg.fail('web-tree-sitter', err.message);
    }
  },

  match(selector, file, ctx) {
    const q = selector.query || {};
    const extra = q.callees || [];
    let text = file.text;
    let lineMap = null;
    if (file.lang === 'notebook' || /\.ipynb$/i.test(file.rel || '')) {
      const nb = notebookCode(file.text);
      if (!nb) return [];
      text = nb.code;
      lineMap = nb.lineMap;
    }
    let spans = lexicalMatch(q.matcher, extra, text);
    const p = ctx && ctx.optional && PARSERS.get(ctx.optional);
    if (p && spans.length) {
      try {
        const tree = p.parser.parse(text);
        const he = tree.rootNode.hasError;
        if (!(typeof he === 'function' ? he.call(tree.rootNode) : he)) {
          const rows = callRows(tree);
          const kept = spans.filter((s) => {
            for (let l = s.startLine; l <= s.endLine; l++) if (rows.has(l)) return true;
            return false;
          });
          spans = kept;
        }
        if (tree.delete) tree.delete();
      } catch (_) { /* keep lexical result */ }
    }
    const ev = EVIDENCE[q.matcher];
    const out = [];
    const seen = new Set();
    for (const s of spans) {
      const span = lineMap
        ? { startLine: lineMap[s.startLine - 1] || 1, endLine: lineMap[s.endLine - 1] || lineMap[s.startLine - 1] || 1 }
        : s;
      const key = `${span.startLine}:${span.endLine}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...span, evidence_kind: ev });
    }
    return out;
  },

  // exported for sql_column (Python-embedded SQL) and tests
  maskPython,
  notebookCode,
  lineIndex,
};
