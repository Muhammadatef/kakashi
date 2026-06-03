const fs = require('fs');
const JSZip = require('jszip');
const path = require('path');

const DOCX_XML_GLOB = [
  /^word\/document\.xml$/,
  /^word\/header\d+\.xml$/,
  /^word\/footer\d+\.xml$/,
  /^word\/comments\.xml$/,
];

function shouldIncludeXml(name) {
  return DOCX_XML_GLOB.some((rx) => rx.test(name));
}

function extractTextFromXml(xml) {
  const parts = [];
  const rx = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let m;
  while ((m = rx.exec(xml)) !== null) {
    if (m[1]) parts.push(m[1]);
  }
  return parts.join(' ');
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
    let updated = xml;
    for (const [original, replacement] of Object.entries(replMap)) {
      if (updated.includes(original)) {
        updated = updated.split(original).join(replacement);
      }
    }
    zip.file(name, updated);
  }
  const out = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(outputPath, out);
}

module.exports = { readDocx, writeDocx, extractTextFromXml };
