const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

async function readXlsx(filePath) {
  const wb = XLSX.readFile(filePath);
  const cells = {};
  const textParts = [];

  for (const sheetName of wb.SheetNames) {
    cells[sheetName] = {};
    const sheet = wb.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[addr];
        if (!cell) continue;
        const val = cell.v != null ? String(cell.v) : '';
        if (val) {
          cells[sheetName][addr] = val;
          textParts.push(val);
        }
      }
    }
  }

  return { text: textParts.join('\n'), wb, cells };
}

async function writeXlsx(filePath, outputPath, data, replMap) {
  const wb = data.wb;
  // Sort replacement keys longest-first so we don't replace a substring of
  // another secret before the longer match has a chance to fire (e.g. an
  // email "alice@db.example.com" must replace before the phone-shaped "...com"
  // sub-fragment if any).
  const orderedKeys = Object.keys(replMap).sort((a, b) => b.length - a.length);

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const sheetCells = data.cells[sheetName] || {};
    for (const [addr, original] of Object.entries(sheetCells)) {
      // Per-cell substring substitution: catches secrets embedded in
      // narrative text (e.g. "Customer email: alice@example.com -- follow up"),
      // not just cells whose entire value equals a captured secret.
      let masked = original;
      for (const key of orderedKeys) {
        if (key && masked.includes(key)) {
          masked = masked.split(key).join(replMap[key]);
        }
      }
      if (sheet[addr] && masked !== original) {
        sheet[addr].v = masked;
        sheet[addr].w = masked;
        // Force string type so a number-typed cell (e.g. a phone stored as a
        // numeric value) doesn't render as NaN once a token is written into it.
        sheet[addr].t = 's';
      }
    }
  }
  XLSX.writeFile(wb, outputPath);
}

module.exports = { readXlsx, writeXlsx };
