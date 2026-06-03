const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

async function readPdf(filePath) {
  const buf = fs.readFileSync(filePath);
  const result = await pdfParse(buf);
  return { text: result.text || '' };
}

function writePdf(filePath, outputPath, maskedText) {
  const base = path.basename(filePath);
  const outExt = path.extname(outputPath).slice(1).toLowerCase();
  // For .md output (the default for PDF inputs), wrap the extracted text with
  // a small markdown header so the file renders cleanly when pasted into an
  // AI agent or a docs viewer. For .txt or anything else, fall back to a plain
  // ASCII header.
  let header;
  if (outExt === 'md') {
    header =
      `# Masked extract from \`${base}\`\n\n` +
      `> Original PDF was scanned and masked locally with Kakashi.\n` +
      `> Sensitive values have been replaced with stable tokens (\`[EMAIL_1]\`, \`[OPENAI_KEY_2]\`, ...).\n\n` +
      `---\n\n`;
  } else {
    header = `[Kakashi: extracted and masked from ${base}]\n\n`;
  }
  fs.writeFileSync(outputPath, header + maskedText, 'utf8');
  return outputPath;
}

module.exports = { readPdf, writePdf };
