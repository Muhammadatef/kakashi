const fs = require('fs');
const JSZip = require('jszip');
const ooxml = require('./ooxml');

// Word stores paragraph text as `<w:t>` runs inside `<w:p>` paragraphs.
const SPEC = { textTag: 'w:t', paraTag: 'w:p' };

const DOCX_XML_GLOB = [
  /^word\/document\.xml$/,
  /^word\/header\d+\.xml$/,
  /^word\/footer\d+\.xml$/,
  /^word\/comments\.xml$/,
];

function shouldIncludeXml(name) {
  return DOCX_XML_GLOB.some((rx) => rx.test(name));
}

/**
 * Text of one `word/*.xml` part.
 *
 * Runs are concatenated WITHOUT a separator -- see src/engine/formats/ooxml.js
 * for why that is not a detail. Word splits a run wherever formatting changes,
 * so a single credential is regularly stored as two or three runs, and any
 * separator inserted here breaks the pattern that should have matched it.
 */
function extractTextFromXml(xml) {
  return ooxml.extractText(xml, SPEC);
}

async function readDocx(filePath) {
  const buf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);
  const xmlMap = {};
  const textParts = [];

  for (const [name, file] of Object.entries(zip.files)) {
    if (!shouldIncludeXml(name) || file.dir) continue;
    const xml = await file.async('string');
    xmlMap[name] = xml;
    textParts.push(extractTextFromXml(xml));
  }

  return { text: textParts.join('\n'), zip, xmlMap };
}

async function writeDocx(filePath, outputPath, data, replMap) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  for (const [name, xml] of Object.entries(data.xmlMap)) {
    // Offset-based, run-aware replacement: a value spanning a run boundary has
    // XML tags in the middle of it and can never be patched by substring
    // replacement over the raw markup.
    zip.file(name, ooxml.maskXml(xml, replMap, SPEC));
  }
  const out = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(outputPath, out);
}

module.exports = { readDocx, writeDocx, extractTextFromXml };
