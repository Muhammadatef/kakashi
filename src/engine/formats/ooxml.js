/**
 * Shared OOXML run handling for .docx and .pptx.
 *
 * Both formats store a paragraph's text as a SEQUENCE OF RUNS -- `<w:t>` inside
 * `<w:p>` for Word, `<a:t>` inside `<a:p>` for PowerPoint -- and both split those
 * runs for reasons that have nothing to do with where a value starts or ends:
 * a spellcheck mark, a language attribute, a revision id, one bolded character.
 * A single email address routinely lands in the file as two or three runs.
 *
 * That makes the naive approach wrong in two ways at once, and this module
 * exists to fix both:
 *
 *   1. READING. Joining runs with a space (what this code used to do) inserts
 *      a separator that was never in the document. `sk-ant-` + `api03-...`
 *      became `sk-ant- api03-...`, which matches no credential pattern at all,
 *      so the scanner reported the file clean while a live key sat in it. Runs
 *      within one paragraph are now joined with NOTHING, which is what the
 *      format actually means -- real spaces are their own characters inside
 *      `<w:t xml:space="preserve"> </w:t>`. Paragraphs are still joined with a
 *      newline so unrelated blocks cannot fuse into a false positive.
 *
 *   2. WRITING. Literal substring replacement over the raw XML can only ever
 *      patch a value that sits inside ONE run, because a value spanning a run
 *      boundary has XML tags in the middle of it and never appears contiguously.
 *      Replacement here is OFFSET-BASED over the reassembled paragraph text, and
 *      the result is redistributed across the runs it covered: the run where the
 *      match begins receives the whole token, and the runs holding the rest of
 *      the match give up their share. Untouched runs keep their bytes exactly,
 *      so formatting elsewhere in the paragraph survives.
 *
 * Entities are decoded on read and re-encoded on write, so a value containing
 * `&` is matched as `&` rather than as `&amp;`.
 */

const ENTITIES = [
  [/&amp;/g, '&'],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&apos;/g, "'"],
];

/** Decode the five predefined XML entities. `&amp;` must be decoded last. */
function decodeXml(s) {
  let out = s;
  for (let i = ENTITIES.length - 1; i >= 0; i--) out = out.replace(ENTITIES[i][0], ENTITIES[i][1]);
  return out.replace(/&amp;/g, '&');
}

/** Encode text for an XML text node. `&` must be encoded first. */
function encodeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Locate every text run in one XML part, tagged with the paragraph it belongs to.
 *
 * @param {string} xml
 * @param {{ textTag: string, paraTag: string }} spec - e.g. { textTag: 'w:t', paraTag: 'w:p' }
 * @returns {Array<{ tagStart, openEnd, innerStart, innerEnd, text, para }>}
 */
function findRuns(xml, spec) {
  // Paragraph starts, so each run can be attributed to the block it sits in.
  // `<w:p>` and `<w:p …>` both count; `<w:pPr>` and friends must not, hence the
  // explicit `[ />]` terminator.
  const paraStarts = [];
  const paraRx = new RegExp(`<${spec.paraTag}[ />]`, 'g');
  let pm;
  while ((pm = paraRx.exec(xml)) !== null) paraStarts.push(pm.index);

  const runs = [];
  // Skip self-closing `<w:t/>`: it holds no text and has no inner range.
  const rx = new RegExp(`<${spec.textTag}([^>]*)>([^<]*)</${spec.textTag}>`, 'g');
  let m;
  while ((m = rx.exec(xml)) !== null) {
    const tagStart = m.index;
    const openEnd = m.index + 1 + spec.textTag.length + m[1].length + 1;
    const innerStart = openEnd;
    const innerEnd = innerStart + m[2].length;
    // The last paragraph opening at or before this run. -1 groups any stray run
    // that sits outside a paragraph into its own bucket.
    let para = -1;
    for (let i = paraStarts.length - 1; i >= 0; i--) {
      if (paraStarts[i] < tagStart) { para = i; break; }
    }
    runs.push({
      tagStart,
      openEnd,
      innerStart,
      innerEnd,
      attrs: m[1],
      text: decodeXml(m[2]),
      para,
    });
  }
  return runs;
}

/** Group runs into paragraphs, preserving document order. */
function groupByParagraph(runs) {
  const groups = [];
  let current = null;
  for (const run of runs) {
    if (!current || current.para !== run.para) {
      current = { para: run.para, runs: [] };
      groups.push(current);
    }
    current.runs.push(run);
  }
  return groups;
}

/**
 * Reassemble the readable text of one XML part.
 * Runs inside a paragraph concatenate with no separator; paragraphs are newline
 * separated.
 */
function extractText(xml, spec) {
  return groupByParagraph(findRuns(xml, spec))
    .map((g) => g.runs.map((r) => r.text).join(''))
    .filter((t) => t.length > 0)
    .join('\n');
}

/**
 * Find where each replacement applies within a paragraph's text.
 *
 * Longest key first, so a short secret that happens to be a substring of a
 * longer one cannot claim the span before the longer match is considered. An
 * occurrence overlapping a span already claimed is skipped.
 *
 * @returns {Array<{ start, end, replacement }>} sorted by start, non-overlapping
 */
function findSpans(text, orderedKeys, replMap) {
  const spans = [];
  for (const key of orderedKeys) {
    if (!key) continue;
    let from = 0;
    for (;;) {
      const at = text.indexOf(key, from);
      if (at === -1) break;
      const end = at + key.length;
      const clashes = spans.some((s) => at < s.end && end > s.start);
      if (!clashes) spans.push({ start: at, end, replacement: replMap[key] });
      from = at + key.length;
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

/**
 * Apply replacement spans to one paragraph and hand each run its new text.
 *
 * A span that covers several runs is not duplicated into each of them: the run
 * where the span STARTS receives the replacement token, and the runs covering
 * the remainder contribute nothing for that stretch. That is what lets a value
 * split across three runs collapse into one token without disturbing the text
 * around it.
 *
 * @returns {Map<run, string>} only for runs whose text changed
 */
function rewriteParagraph(runs, spans) {
  const edits = new Map();
  let cursor = 0; // offset of the current run's start within the paragraph text
  for (const run of runs) {
    const a = cursor;
    const b = cursor + run.text.length;
    cursor = b;

    const overlapping = spans.filter((s) => s.start < b && s.end > a);
    if (overlapping.length === 0) continue;

    let out = '';
    let pos = a;
    for (const s of overlapping) {
      const from = Math.max(s.start, a);
      const to = Math.min(s.end, b);
      if (from > pos) out += run.text.slice(pos - a, from - a);
      // Only the run containing the span's first character emits the token.
      if (s.start >= a) out += s.replacement;
      pos = to;
    }
    if (pos < b) out += run.text.slice(pos - a);

    if (out !== run.text) edits.set(run, out);
  }
  return edits;
}

/**
 * Mask one XML part: reassemble each paragraph, apply the replacement map across
 * run boundaries, and splice the results back into the XML.
 *
 * @param {string} xml
 * @param {object} replMap - original value -> replacement token
 * @param {{ textTag: string, paraTag: string }} spec
 * @returns {string} updated XML
 */
function maskXml(xml, replMap, spec) {
  const orderedKeys = Object.keys(replMap).sort((a, b) => b.length - a.length);
  if (orderedKeys.length === 0) return xml;

  const groups = groupByParagraph(findRuns(xml, spec));
  const allEdits = [];

  for (const group of groups) {
    const paraText = group.runs.map((r) => r.text).join('');
    if (!paraText) continue;
    const spans = findSpans(paraText, orderedKeys, replMap);
    if (spans.length === 0) continue;
    for (const [run, text] of rewriteParagraph(group.runs, spans)) {
      allEdits.push({ run, text });
    }
  }

  // Splice right-to-left so earlier offsets stay valid as we mutate the string.
  allEdits.sort((x, y) => y.run.innerStart - x.run.innerStart);

  let out = xml;
  for (const { run, text } of allEdits) {
    let openTag = xml.slice(run.tagStart, run.openEnd);
    // A run that now begins or ends with whitespace needs xml:space="preserve",
    // or Word and PowerPoint will silently trim it and join two words together.
    if (/^\s|\s$/.test(text) && !/xml:space=/.test(openTag)) {
      openTag = `${openTag.slice(0, -1)} xml:space="preserve">`;
    }
    out = out.slice(0, run.tagStart) + openTag + encodeXml(text) + out.slice(run.innerEnd);
  }
  return out;
}

module.exports = {
  findRuns,
  groupByParagraph,
  extractText,
  findSpans,
  rewriteParagraph,
  maskXml,
  decodeXml,
  encodeXml,
};
