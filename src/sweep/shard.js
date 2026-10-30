/**
 * SHARD -- run every selector over every in-scope file and emit Signals.
 *
 *   Signal { id, file, span: { startLine, endLine }, selector_id, kind,
 *            sensitivity_class, evidence_kind }
 *
 * Pure and reproducible: the same files and selectors always produce the same
 * signals, in the same order, with the same ids (a hash of file + span +
 * selector). No signal carries matched text -- value findings from the engine
 * are reduced to their line number and pattern id the moment they are computed.
 */

const crypto = require('crypto');
const path = require('path');
const { maskText } = require('../engine/masker');
const { languageOf } = require('./selectors/schema');
const kinds = require('./selectors/kinds');

/** @returns {string} deterministic signal id */
function signalId(file, span, selectorId) {
  return `sig_${crypto.createHash('sha1').update(`${file}|${span.startLine}|${span.endLine}|${selectorId}`).digest('hex').slice(0, 16)}`;
}

/** Engine findings for a text, value-stripped: [{ id, line }]. */
function valueFindingsOf(text) {
  return maskText(text).findings.map((f) => ({ id: f.id, line: f.line }));
}

/** Languages a selector applies to (null = all). */
function languagesFor(selector) {
  if (selector.languages) return selector.languages;
  const kind = kinds[selector.kind];
  return kind ? kind.defaultLanguages : null;
}

/**
 * Prepare every kind used by `selectors` once (async parser init).
 * @param {object[]} selectors
 * @param {object} ctx
 */
async function prepareKinds(selectors, ctx) {
  for (const k of [...new Set(selectors.map((s) => s.kind))].sort()) {
    if (kinds[k] && typeof kinds[k].prepare === 'function') await kinds[k].prepare(ctx);
  }
}

/**
 * Turn one in-memory file into the `file` object kinds receive.
 * @param {string} rel
 * @param {string} text
 */
function toFile(rel, text) {
  return {
    rel,
    ext: path.extname(rel).slice(1).toLowerCase(),
    lang: languageOf(rel),
    text,
    valueFindings: valueFindingsOf(text),
  };
}

/**
 * Run selectors over files.
 * @param {object} opts
 * @param {{ rel: string, text: string }[]} opts.files
 * @param {object[]} opts.selectors
 * @param {object} opts.ctx  { optional, project }
 * @returns {Promise<{ signals: object[], bySelector: Object<string,number>, errors: object[] }>}
 */
async function shard({ files, selectors, ctx }) {
  await prepareKinds(selectors, ctx);
  const signals = [];
  const errors = [];
  const seen = new Set();
  const ordered = [...files].sort((a, b) => a.rel.localeCompare(b.rel));
  for (const { rel, text } of ordered) {
    const file = toFile(rel, text);
    for (const selector of selectors) {
      const langs = languagesFor(selector);
      if (langs && !langs.includes(file.lang)) continue;
      let hits;
      try {
        hits = await kinds[selector.kind].match(selector, file, ctx);
      } catch (err) {
        // A selector that throws has NOT covered this file. Record it; the
        // decision stage turns a coverage error into a named gap, never into
        // silence.
        errors.push({ file: rel, selector_id: selector.id, error: err.message });
        continue;
      }
      for (const h of hits || []) {
        const span = { startLine: h.startLine, endLine: Math.max(h.endLine || h.startLine, h.startLine) };
        const id = signalId(rel, span, selector.id);
        if (seen.has(id)) continue;
        seen.add(id);
        signals.push({
          id,
          file: rel,
          span,
          selector_id: selector.id,
          kind: selector.kind,
          sensitivity_class: selector.sensitivity_class,
          evidence_kind: h.evidence_kind || selector.evidence_kind,
        });
      }
    }
  }
  signals.sort((a, b) => a.file.localeCompare(b.file)
    || a.span.startLine - b.span.startLine
    || a.selector_id.localeCompare(b.selector_id)
    || a.span.endLine - b.span.endLine);
  const bySelector = {};
  for (const s of selectors) bySelector[s.id] = 0;
  for (const s of signals) bySelector[s.selector_id]++;
  return { signals, bySelector, errors };
}

module.exports = { shard, toFile, signalId, valueFindingsOf, languagesFor, prepareKinds };
