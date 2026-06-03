const { PATTERNS } = require('./patterns');

function lineAtOffset(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

function getReplacement(match, mode, valueMap, counters) {
  const key = match.id;
  if (valueMap[key] && valueMap[key][match.original]) {
    return valueMap[key][match.original];
  }

  let replacement;
  if (mode === 'redact') {
    replacement = '[REDACTED]';
  } else if (mode === 'fake') {
    const fakes = match.fakeValues || [`fake_${key}`];
    counters[key] = (counters[key] || 0) + 1;
    replacement = fakes[(counters[key] - 1) % fakes.length];
  } else {
    counters[key] = (counters[key] || 0) + 1;
    replacement = `[${key.toUpperCase()}_${counters[key]}]`;
  }

  if (!valueMap[key]) valueMap[key] = {};
  valueMap[key][match.original] = replacement;
  return replacement;
}

/**
 * @param {string} text
 * @param {object} options
 * @returns {{ masked: string, findings: object[] }}
 */
function maskText(text, options = {}) {
  const {
    enabled = null,
    mode = 'typed',
    whitelist = [],
    extraPatterns = [],
    patterns: patternOverride = null,
  } = options;

  const whitelistSet = new Set(whitelist.map(String));
  const activePatterns = patternOverride || [
    ...PATTERNS,
    ...extraPatterns,
  ].filter((p) => !enabled || enabled.includes(p.id));

  const matches = [];

  for (const pattern of activePatterns) {
    const rx = new RegExp(pattern.rx.source, pattern.rx.flags);
    let m;
    while ((m = rx.exec(text)) !== null) {
      const original = m[0];
      if (whitelistSet.has(original)) continue;
      if (pattern.validate && !pattern.validate(original, text, m.index)) continue;
      matches.push({
        id: pattern.id,
        label: pattern.label,
        labelAr: pattern.labelAr,
        cat: pattern.cat,
        original,
        start: m.index,
        end: m.index + original.length,
        fakeValues: pattern.fakeValues,
      });
    }
  }

  matches.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - b.start - (a.end - a.start);
  });

  const resolved = [];
  let lastEnd = -1;
  for (const match of matches) {
    if (match.start >= lastEnd) {
      resolved.push(match);
      lastEnd = match.end;
    }
  }

  const valueMap = {};
  const counters = {};
  const findings = resolved.map((match) => {
    const replacement = getReplacement(match, mode, valueMap, counters);
    return {
      id: match.id,
      label: match.label,
      labelAr: match.labelAr,
      cat: match.cat,
      original: match.original,
      replacement,
      line: lineAtOffset(text, match.start),
      offset: match.start,
    };
  });

  let masked = text;
  const sorted = [...findings].sort((a, b) => b.offset - a.offset);
  for (const f of sorted) {
    masked = masked.slice(0, f.offset) + f.replacement + masked.slice(f.offset + f.original.length);
  }

  return { masked, findings };
}

module.exports = { maskText, lineAtOffset };
