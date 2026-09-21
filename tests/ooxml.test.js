const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const JSZip = require('jszip');

const formats = require('../src/engine/formats');
const { maskText } = require('../src/engine/masker');
const ooxml = require('../src/engine/formats/ooxml');

const CLI = path.join(__dirname, '..', 'bin', 'kakashi.js');

// ---------------------------------------------------------------------------
// Builders.
//
// These write real OOXML packages rather than fixtures, because the whole point
// of these tests is the RUN STRUCTURE inside the XML -- a checked-in .docx hides
// exactly the detail under test, and nobody reviewing a PR can see it.
// ---------------------------------------------------------------------------

/** @param {string[][]} paragraphs - each paragraph is a list of run texts */
async function makeDocx(dir, name, paragraphs) {
  const body = paragraphs
    .map((runs) => `<w:p>${runs.map((t) => `<w:r><w:t>${t}</w:t></w:r>`).join('')}</w:p>`)
    .join('');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.folder('_rels').file('.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
  zip.folder('word').file('document.xml',
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const p = path.join(dir, name);
  fs.writeFileSync(p, buf);
  return p;
}

async function makePptx(dir, name, paragraphs) {
  const body = paragraphs
    .map((runs) => `<a:p>${runs.map((t) => `<a:r><a:t>${t}</a:t></a:r>`).join('')}</a:p>`)
    .join('');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.folder('ppt').folder('slides').file('slide1.xml',
    `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${body}</p:sld>`);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const p = path.join(dir, name);
  fs.writeFileSync(p, buf);
  return p;
}

async function partOf(file, name) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  return zip.file(name).async('string');
}

/** Mask a file the same way the CLI does, and return the output path. */
async function maskFile(src, out) {
  const data = await formats.readFile(src);
  const { masked, findings } = maskText(data.text);
  const replMap = {};
  for (const f of findings) replMap[f.original] = f.replacement;
  await formats.writeMasked(src, out, { ...data, format: formats.getFormat(src) }, replMap, masked);
  return { out, findings };
}

async function runOoxmlTests() {
  let passed = 0;
  let failed = 0;

  async function check(name, fn) {
    try {
      await fn();
      passed++;
    } catch (err) {
      console.error(`FAIL ${name}: ${err.message}`);
      failed++;
    }
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kakashi-ooxml-'));

  // -------------------------------------------------------------------------
  // Reading across run boundaries.
  //
  // Word splits a run wherever anything changes -- a spellcheck mark, a language
  // attribute, a revision id, one bold character -- so a credential is routinely
  // stored as several runs. The reader used to join runs with a SPACE, which
  // inserted a separator that was never in the document: `sk-ant-` + `api03-...`
  // became `sk-ant- api03-...`, matching no pattern at all. The scanner reported
  // the file clean while a live key sat in it, and `guard` then certified that
  // artifact as GOAL_SATISFIED.
  // -------------------------------------------------------------------------
  await check('docx: a credential split across runs is detected', async () => {
    const f = await makeDocx(dir, 'split-cred.docx', [
      ['Key sk-ant-', 'api03-abcdefghij1234567890abcdefghij'],
    ]);
    const { text } = await formats.readFile(f);
    assert.strictEqual(text, 'Key sk-ant-api03-abcdefghij1234567890abcdefghij');
    const ids = maskText(text).findings.map((x) => x.id);
    assert.ok(ids.includes('anthropic'), `expected anthropic key, got ${JSON.stringify(ids)}`);
  });

  await check('docx: an email split across runs is detected whole', async () => {
    const f = await makeDocx(dir, 'split-email.docx', [['Email sara.', 'hassan@acme.ae']]);
    const { text } = await formats.readFile(f);
    const found = maskText(text).findings.find((x) => x.id === 'email');
    // Not `hassan@acme.ae`: the local part lived in the previous run.
    assert.strictEqual(found.original, 'sara.hassan@acme.ae');
  });

  await check('docx: paragraphs do not fuse into false positives', async () => {
    // Two separate paragraphs must not concatenate into one address.
    const f = await makeDocx(dir, 'paras.docx', [['contact sara'], ['@acme.ae today']]);
    const { text } = await formats.readFile(f);
    assert.ok(text.includes('\n'), 'paragraphs should be newline separated');
    const ids = maskText(text).findings.map((x) => x.id);
    assert.ok(!ids.includes('email'), `should not invent an email, got ${JSON.stringify(ids)}`);
  });

  // -------------------------------------------------------------------------
  // Writing across run boundaries.
  //
  // A value spanning a run boundary has XML tags in the middle of it, so it
  // never appears contiguously in the markup and literal substring replacement
  // over the raw XML cannot touch it. Replacement is offset-based over the
  // reassembled paragraph and redistributed back across the runs it covered.
  // -------------------------------------------------------------------------
  await check('docx: a split credential is actually removed from the artifact', async () => {
    const f = await makeDocx(dir, 'w-split.docx', [
      ['Key sk-ant-', 'api03-abcdefghij1234567890abcdefghij'],
    ]);
    const { findings } = await maskFile(f, path.join(dir, 'w-split-out.docx'));
    const xml = await partOf(path.join(dir, 'w-split-out.docx'), 'word/document.xml');
    assert.ok(findings.some((x) => x.id === 'anthropic'), 'key should have been found');
    assert.ok(!xml.includes('sk-ant-'), 'key prefix still present in artifact');
    assert.ok(!xml.includes('api03-abcdefghij'), 'key body still present in artifact');
    assert.ok(xml.includes('[ANTHROPIC_1]'), 'token not written');
  });

  await check('docx: a single-run value still masks (no regression)', async () => {
    const f = await makeDocx(dir, 'w-simple.docx', [['Email bob@corp.ae here']]);
    await maskFile(f, path.join(dir, 'w-simple-out.docx'));
    const xml = await partOf(path.join(dir, 'w-simple-out.docx'), 'word/document.xml');
    assert.ok(!xml.includes('bob@corp.ae'));
    assert.ok(xml.includes('[EMAIL_1]'));
  });

  await check('docx: runs the mask did not touch keep their bytes', async () => {
    const f = await makeDocx(dir, 'w-keep.docx', [
      ['Quarterly notes ', 'bob@corp.ae', ' reviewed by finance'],
    ]);
    await maskFile(f, path.join(dir, 'w-keep-out.docx'));
    const xml = await partOf(path.join(dir, 'w-keep-out.docx'), 'word/document.xml');
    // Both untouched runs survive as their own runs -- formatting is per-run, so
    // collapsing the paragraph into one run would silently restyle the document.
    assert.ok(xml.includes('>Quarterly notes <'), 'leading run lost');
    assert.ok(xml.includes('> reviewed by finance<'), 'trailing run lost');
    assert.ok(xml.includes('[EMAIL_1]'));
  });

  await check('docx: a run left with edge whitespace gets xml:space="preserve"', async () => {
    // Without it Word trims the space and joins "key" to the token.
    const f = await makeDocx(dir, 'w-space.docx', [['a', ' and key sk-ant-', 'api03-abcdefghij1234567890abcdefghij']]);
    await maskFile(f, path.join(dir, 'w-space-out.docx'));
    const xml = await partOf(path.join(dir, 'w-space-out.docx'), 'word/document.xml');
    const run = xml.match(/<w:t[^>]*>[^<]*\[ANTHROPIC_1\][^<]*<\/w:t>/)[0];
    assert.ok(/xml:space="preserve"/.test(run), `missing xml:space on: ${run}`);
  });

  // -------------------------------------------------------------------------
  // Entities. The reader returns decoded text, so a value containing `&` is
  // matched as `&`; the writer re-encodes so the package stays well-formed.
  // -------------------------------------------------------------------------
  await check('docx: entities decode on read and re-encode on write', async () => {
    const f = await makeDocx(dir, 'w-ent.docx', [['Team A &amp; B, mail bob@corp.ae']]);
    const { text } = await formats.readFile(f);
    assert.ok(text.includes('A & B'), 'entity not decoded on read');
    await maskFile(f, path.join(dir, 'w-ent-out.docx'));
    const xml = await partOf(path.join(dir, 'w-ent-out.docx'), 'word/document.xml');
    assert.ok(xml.includes('&amp;'), 'bare & written into XML');
    assert.ok(!/[^&]amp;/.test(xml.replace(/&amp;/g, '')), 'double-encoded entity');
  });

  // -------------------------------------------------------------------------
  // pptx shares the implementation; it must share the fix.
  // -------------------------------------------------------------------------
  await check('pptx: a credential split across runs is detected and removed', async () => {
    const f = await makePptx(dir, 'deck.pptx', [['Key AKIA', 'IOSFODNN7EXAMPLE'], ['Contact bob@corp.ae']]);
    const { text } = await formats.readFile(f);
    assert.ok(text.includes('AKIAIOSFODNN7EXAMPLE'), 'runs not joined');
    await maskFile(f, path.join(dir, 'deck-out.pptx'));
    const xml = await partOf(path.join(dir, 'deck-out.pptx'), 'ppt/slides/slide1.xml');
    assert.ok(!xml.includes('AKIAIOSFODNN7EXAMPLE'), 'AWS key survived');
    assert.ok(xml.includes('[AWS_KEY_1]') && xml.includes('[EMAIL_1]'));
  });

  // -------------------------------------------------------------------------
  // The Guardian reads through the same format layer, so its verdict is only as
  // good as the reader. This is the end-to-end assertion that matters: a split
  // credential must not come back ALLOW_WITH_TRANSFORMATION over a live key.
  // -------------------------------------------------------------------------
  await check('guard: does not release a docx that still holds a split credential', async () => {
    const f = await makeDocx(dir, 'g-split.docx', [
      ['Key sk-ant-', 'api03-abcdefghij1234567890abcdefghij'],
    ]);
    const out = path.join(dir, 'guarded-split.docx');
    const r = spawnSync(process.execPath, [
      CLI, 'guard', f, '-d', 'external_model', '--approve', 'CREDENTIAL',
      '-o', out, '--no-audit', '--json',
    ], { encoding: 'utf8' });
    const decision = JSON.parse(r.stdout);
    if (decision.decision === 'ALLOW_WITH_TRANSFORMATION') {
      const xml = await partOf(out, 'word/document.xml');
      assert.ok(!xml.includes('sk-ant-'), 'guard released an artifact containing a live key');
    }
  });

  // -------------------------------------------------------------------------
  // Unit-level: the span resolver underneath, longest-key-first and
  // non-overlapping.
  // -------------------------------------------------------------------------
  await check('ooxml.findSpans prefers the longest key and never overlaps', () => {
    const map = { 'a@b.com': '[E1]', 'b.com': '[H1]' };
    const spans = ooxml.findSpans('mail a@b.com now', Object.keys(map).sort((x, y) => y.length - x.length), map);
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].replacement, '[E1]');
  });

  fs.rmSync(dir, { recursive: true, force: true });

  console.log(`ooxml.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runOoxmlTests };

if (require.main === module) {
  runOoxmlTests().then((ok) => process.exit(ok ? 0 : 1));
}
