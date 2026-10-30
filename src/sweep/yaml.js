/**
 * A strict YAML *subset* parser for Sweep selector files.
 *
 * Why not a YAML library: Kakashi adds no required runtime dependency
 * (tests/guardian.test.js DISTRIBUTION checks), and selector files are small,
 * human-authored and security-relevant. A tiny parser that REJECTS anything it
 * does not fully understand is safer than a permissive one that guesses.
 *
 * Supported:
 *   - block mappings  `key: value`, nested by indentation (spaces only)
 *   - block sequences `- item`, `- key: value` (inline first key of a map item)
 *   - scalars: plain, 'single', "double" (\n \t \" \\ escapes), true/false/null,
 *     integers and decimals
 *   - block literals `|` / `|-` and folded `>` / `>-`
 *   - flow sequences of scalars `[a, "b", 3]`, empty `{}` / `[]`
 *   - `#` comments (outside quotes), `---` document start (single document)
 *
 * Rejected with "file:line: message": tabs in indentation, anchors (&),
 * aliases (*), tags (!), merge keys (<<), multi-documents, flow mappings with
 * content, duplicate keys, and any line the grammar above does not cover.
 */

class YamlError extends Error {
  constructor(message, line, source) {
    super(`${source || '<yaml>'}:${line}: ${message}`);
    this.line = line;
  }
}

/** Strip a trailing comment that is not inside quotes. */
function stripComment(s) {
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === '\\' && quote === '"') { i++; continue; }
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) {
      return s.slice(0, i).replace(/\s+$/, '');
    }
  }
  return s.replace(/\s+$/, '');
}

function parseScalar(raw, lineNo, source) {
  const s = raw.trim();
  if (s === '' || s === '~' || s === 'null') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  if (s === '{}') return {};
  if (s === '[]') return [];
  const first = s[0];
  if (first === '&' || first === '*' || first === '!') {
    throw new YamlError(`anchors, aliases and tags are not supported (${first})`, lineNo, source);
  }
  if (first === '{') throw new YamlError('flow mappings are not supported', lineNo, source);
  if (first === '[') {
    if (!s.endsWith(']')) throw new YamlError('unterminated flow sequence', lineNo, source);
    return splitFlow(s.slice(1, -1), lineNo, source).map((p) => parseScalar(p, lineNo, source));
  }
  if (first === '"') {
    if (!s.endsWith('"') || s.length < 2) throw new YamlError('unterminated double-quoted string', lineNo, source);
    return s.slice(1, -1).replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t', '"': '"', '\\': '\\' }[c] ?? (() => {
      throw new YamlError(`unsupported escape \\${c}`, lineNo, source);
    })()));
  }
  if (first === "'") {
    if (!s.endsWith("'") || s.length < 2) throw new YamlError('unterminated single-quoted string', lineNo, source);
    return s.slice(1, -1).replace(/''/g, "'");
  }
  return s;
}

/** Split the inside of `[...]` on commas that are outside quotes. */
function splitFlow(inner, lineNo, source) {
  const parts = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (quote) {
      cur += c;
      if (c === '\\' && quote === '"') { cur += inner[++i] || ''; continue; }
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c; cur += c;
    } else if (c === '[' || c === '{') {
      throw new YamlError('nested flow collections are not supported', lineNo, source);
    } else if (c === ',') {
      parts.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  if (quote) throw new YamlError('unterminated string in flow sequence', lineNo, source);
  parts.push(cur);
  // Allow one trailing comma: `[a, b,]`.
  if (parts.length > 1 && parts[parts.length - 1].trim() === '') parts.pop();
  if (parts.some((p) => p.trim() === '')) throw new YamlError('empty item in flow sequence', lineNo, source);
  return parts;
}

/** Find `key: rest` split point (first `: ` or trailing `:` outside quotes). */
function splitKey(s) {
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ':' && (i === s.length - 1 || s[i + 1] === ' ')) {
      return [s.slice(0, i), s.slice(i + 1)];
    }
  }
  return null;
}

/**
 * @param {string} text
 * @param {string} [source] file name used in error messages
 * @returns {any}
 */
function parse(text, source) {
  const rawLines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const lines = []; // { indent, content, no, raw }
  let docStarted = false;
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const no = i + 1;
    if (/^\s*$/.test(raw) || /^\s*#/.test(raw)) { lines.push({ blank: true, raw, no }); continue; }
    if (/^\t| \t|^\s*\t/.test(raw.match(/^\s*/)[0])) throw new YamlError('tabs are not allowed in indentation', no, source);
    if (raw === '---') {
      if (docStarted || lines.some((l) => !l.blank)) throw new YamlError('multiple documents are not supported', no, source);
      docStarted = true; lines.push({ blank: true, raw, no }); continue;
    }
    if (raw === '...') throw new YamlError('document end markers are not supported', no, source);
    const indent = raw.match(/^ */)[0].length;
    lines.push({ indent, content: raw.slice(indent), no, raw });
  }

  let pos = 0;
  const skipBlank = () => { while (pos < lines.length && lines[pos].blank) pos++; };

  function parseBlockScalar(style, parentIndent) {
    const chomp = style.endsWith('-') ? 'strip' : 'clip';
    const folded = style.startsWith('>');
    const body = [];
    let blockIndent = null;
    while (pos < lines.length) {
      const l = lines[pos];
      if (l.blank) { body.push(''); pos++; continue; }
      if (l.indent <= parentIndent) break;
      if (blockIndent === null) blockIndent = l.indent;
      if (l.indent < blockIndent) break;
      body.push(l.raw.slice(blockIndent));
      pos++;
    }
    while (body.length && body[body.length - 1] === '') body.pop();
    let out;
    if (folded) {
      out = '';
      for (let i = 0; i < body.length; i++) {
        const ln = body[i];
        if (i === 0) out = ln;
        else if (ln === '' ) out += '\n';
        else out += (out.endsWith('\n') || out === '' ? '' : ' ') + ln;
      }
    } else {
      out = body.join('\n');
    }
    return chomp === 'strip' ? out : (out === '' ? '' : `${out}\n`);
  }

  /** Parse the value that follows `key:` (rest may be empty → nested block). */
  function parseValueAfter(rest, ownerIndent, no) {
    const r = stripComment(rest).trim();
    if (r === '|' || r === '|-' || r === '>' || r === '>-') return parseBlockScalar(r, ownerIndent);
    if (/^[|>]/.test(r)) throw new YamlError(`unsupported block scalar indicator "${r}"`, no, source);
    if (r !== '') return parseScalar(r, no, source);
    skipBlank();
    if (pos >= lines.length) return null;
    const next = lines[pos];
    if (next.indent > ownerIndent) return parseNode(next.indent);
    // A sequence may sit at the same indent as its owning key.
    if (next.indent === ownerIndent && next.content.startsWith('- ') || (next.indent === ownerIndent && next.content === '-')) {
      return parseNode(next.indent);
    }
    return null;
  }

  function parseMapping(indent, seed) {
    const obj = seed || {};
    while (true) {
      skipBlank();
      if (pos >= lines.length) break;
      const l = lines[pos];
      if (l.indent < indent) break;
      if (l.indent > indent) throw new YamlError('unexpected indentation', l.no, source);
      if (l.content.startsWith('- ') || l.content === '-') break;
      const kv = splitKey(stripComment(l.content));
      if (!kv) throw new YamlError(`expected "key: value", got "${l.content}"`, l.no, source);
      const key = parseScalar(kv[0], l.no, source);
      if (typeof key !== 'string' && typeof key !== 'number') throw new YamlError('mapping keys must be scalars', l.no, source);
      if (key === '<<') throw new YamlError('merge keys are not supported', l.no, source);
      if (Object.prototype.hasOwnProperty.call(obj, key)) throw new YamlError(`duplicate key "${key}"`, l.no, source);
      pos++;
      obj[key] = parseValueAfter(kv[1], indent, l.no);
    }
    return obj;
  }

  function parseSequence(indent) {
    const arr = [];
    while (true) {
      skipBlank();
      if (pos >= lines.length) break;
      const l = lines[pos];
      if (l.indent < indent) break;
      if (l.indent > indent) throw new YamlError('unexpected indentation', l.no, source);
      if (!(l.content.startsWith('- ') || l.content === '-')) break;
      const after = l.content === '-' ? '' : l.content.slice(2);
      const itemIndent = indent + 2 + (after.length - after.trimStart().length);
      const body = stripComment(after.trimStart());
      pos++;
      if (body === '') {
        skipBlank();
        arr.push(pos < lines.length && lines[pos].indent > indent ? parseNode(lines[pos].indent) : null);
        continue;
      }
      if (body.startsWith('- ')) throw new YamlError('nested inline sequences are not supported', l.no, source);
      const kv = /^["']/.test(body) && !splitKey(body) ? null : splitKey(body);
      if (kv) {
        // `- key: value` starts a mapping whose keys align at itemIndent.
        const key = parseScalar(kv[0], l.no, source);
        const seed = {};
        seed[key] = parseValueAfter(kv[1], itemIndent, l.no);
        arr.push(parseMapping(itemIndent, seed));
      } else if (body === '|' || body === '|-' || body === '>' || body === '>-') {
        arr.push(parseBlockScalar(body, indent));
      } else {
        arr.push(parseScalar(body, l.no, source));
      }
    }
    return arr;
  }

  function parseNode(indent) {
    skipBlank();
    const l = lines[pos];
    if (l.content.startsWith('- ') || l.content === '-') return parseSequence(indent);
    return parseMapping(indent);
  }

  skipBlank();
  if (pos >= lines.length) return null;
  const root = lines[pos];
  if (root.indent !== 0) throw new YamlError('document must start at column 0', root.no, source);
  let value;
  if (!splitKey(stripComment(root.content)) && !root.content.startsWith('-')) {
    value = parseScalar(stripComment(root.content), root.no, source);
    pos++;
  } else {
    value = parseNode(0);
  }
  skipBlank();
  if (pos < lines.length) throw new YamlError('unexpected content', lines[pos].no, source);
  return value;
}

module.exports = { parse, YamlError };
