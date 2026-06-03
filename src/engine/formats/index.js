const path = require('path');
const { isTextFile, readText, writeText } = require('./text');

let xlsxHandler;
let docxHandler;
let pptxHandler;
let pdfHandler;

function loadHandlers() {
  if (!xlsxHandler) xlsxHandler = require('./xlsx');
  if (!docxHandler) docxHandler = require('./docx');
  if (!pptxHandler) pptxHandler = require('./pptx');
  if (!pdfHandler) pdfHandler = require('./pdf');
}

function getFormat(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
  if (ext === 'docx') return 'docx';
  if (ext === 'pptx') return 'pptx';
  if (ext === 'pdf') return 'pdf';
  if (isTextFile(filePath)) return 'text';
  return null;
}

async function readFile(filePath) {
  const format = getFormat(filePath);
  if (!format) {
    throw new Error(`Unsupported file format: ${path.extname(filePath) || path.basename(filePath)}`);
  }
  loadHandlers();
  switch (format) {
    case 'text':
      return { format, ...(await Promise.resolve(readText(filePath))) };
    case 'xlsx':
      return { format, ...(await xlsxHandler.readXlsx(filePath)) };
    case 'docx':
      return { format, ...(await docxHandler.readDocx(filePath)) };
    case 'pptx':
      return { format, ...(await pptxHandler.readPptx(filePath)) };
    case 'pdf':
      return { format, ...(await pdfHandler.readPdf(filePath)) };
    default:
      throw new Error(`Unknown format: ${format}`);
  }
}

async function writeMasked(filePath, outputPath, data, replMap, maskedText) {
  const format = data.format || getFormat(filePath);
  loadHandlers();
  switch (format) {
    case 'text':
      writeText(outputPath, maskedText);
      return outputPath;
    case 'xlsx':
      await xlsxHandler.writeXlsx(filePath, outputPath, data, replMap);
      return outputPath;
    case 'docx':
      await docxHandler.writeDocx(filePath, outputPath, data, replMap);
      return outputPath;
    case 'pptx':
      await pptxHandler.writePptx(filePath, outputPath, data, replMap);
      return outputPath;
    case 'pdf':
      return pdfHandler.writePdf(filePath, outputPath, maskedText);
    default:
      throw new Error(`Unknown format: ${format}`);
  }
}

function defaultOutputPath(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const ext = path.extname(base).slice(1).toLowerCase();
  if (ext === 'pdf') {
    // PDF round-trip would require a heavy PDF rewriter (pdf-lib + content
    // stream patching). For v1.0 the masked output is the extracted text in
    // .md form -- still useful for sharing context with an AI agent, just
    // not a real PDF back. Override with `-o foo.txt` if you want plain text.
    return path.join(dir, base.replace(/\.pdf$/i, '_masked.md'));
  }
  return path.join(dir, `masked_${base}`);
}

const SUPPORTED_EXTS = [
  'txt', 'md', 'py', 'js', 'ts', 'json', 'yaml', 'yml', 'xml', 'csv', 'env', 'sql',
  'xlsx', 'xls', 'docx', 'pptx', 'pdf',
];

module.exports = {
  getFormat,
  readFile,
  writeMasked,
  defaultOutputPath,
  SUPPORTED_EXTS,
  isTextFile,
};
