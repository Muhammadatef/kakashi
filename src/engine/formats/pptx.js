const fs = require('fs');
const JSZip = require('jszip');
const ooxml = require('./ooxml');

// PowerPoint stores text as `<a:t>` runs inside `<a:p>` paragraphs (DrawingML).
const SPEC = { textTag: 'a:t', paraTag: 'a:p' };

const PPTX_XML_GLOB = [
  /^ppt\/slides\/slide\d+\.xml$/,
  /^ppt\/notesSlides\/notesSlide\d+\.xml$/,
];

function shouldIncludeXml(name) {
  return PPTX_XML_GLOB.some((rx) => rx.test(name));
}

/**
 * Text of one slide or notes part. Runs concatenate with no separator, for the
 * same reason as .docx -- see src/engine/formats/ooxml.js.
 */
function extractTextFromXml(xml) {
  return ooxml.extractText(xml, SPEC);
}

async function readPptx(filePath) {
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

async function writePptx(filePath, outputPath, data, replMap) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  for (const [name, xml] of Object.entries(data.xmlMap)) {
    zip.file(name, ooxml.maskXml(xml, replMap, SPEC));
  }
  const out = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(outputPath, out);
}

module.exports = { readPptx, writePptx, extractTextFromXml };
