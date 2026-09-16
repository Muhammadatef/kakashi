/**
 * PDPL mapping — UAE Federal Decree-Law No. 45 of 2021 concerning the
 * Protection of Personal Data.
 *
 * Maps every Kakashi detection-pattern id to the specific article(s) of the
 * UAE PDPL that regulate that data class. Used by the compliance reporter
 * (A2/scan-dir) to render an audit-ready HTML/PDF/JSON report that a Data
 * Protection Officer can hand directly to the UAE Data Office as evidence
 * of Article-25 (Data Protection Officer duties) and Article-9 (data-
 * subject rights) technical safeguards.
 *
 * Article references are based on the official published English translation
 * of Federal Decree-Law 45/2021. The compliance officer is still responsible
 * for consulting the Arabic text (which is the legally binding version) and
 * the executive regulations for the final compliance sign-off.
 *
 * Design note: this file is DATA, not logic. No I/O, no side effects.
 * Consumed by src/lib/reporter.js (A2) and any downstream integration.
 */

const { PATTERNS, isValidEmiratesId, isValidIban } = require('../engine/patterns');

// ---------------------------------------------------------------------------
// Article catalog — condensed summaries, not legal text.
// ---------------------------------------------------------------------------

const ARTICLES = {
  'Art. 1': {
    title_en: 'Definitions of Personal Data',
    title_ar: 'تعريفات البيانات الشخصية',
    summary_en: 'Defines personal data as any data relating to an identified or identifiable natural person.',
  },
  'Art. 5': {
    title_en: 'Conditions for Processing Personal Data',
    title_ar: 'شروط معالجة البيانات الشخصية',
    summary_en: 'Requires explicit consent or a defined lawful basis before processing personal data.',
  },
  'Art. 6': {
    title_en: 'Consent for Processing Personal Data',
    title_ar: 'الموافقة على معالجة البيانات الشخصية',
    summary_en: 'Consent must be specific, informed, and revocable at any time.',
  },
  'Art. 9': {
    title_en: 'Rights of the Data Subject',
    title_ar: 'حقوق صاحب البيانات',
    summary_en: 'Right of access, correction, deletion, restriction, and transfer of personal data.',
  },
  'Art. 15': {
    title_en: 'Sensitive Personal Data',
    title_ar: 'البيانات الشخصية الحساسة',
    summary_en: 'Special protections for sensitive data including biometric, health, and identity documents.',
  },
  'Art. 20': {
    title_en: 'Security of Personal Data',
    title_ar: 'أمن البيانات الشخصية',
    summary_en: 'Controllers and processors must implement appropriate technical and organisational measures to secure personal data.',
  },
  'Art. 21': {
    title_en: 'Reporting a Personal Data Breach',
    title_ar: 'الإبلاغ عن انتهاك البيانات الشخصية',
    summary_en: 'Duty to notify the UAE Data Office and affected subjects within stipulated timeframes.',
  },
  'Art. 22': {
    title_en: 'Cross-Border Transfer of Personal Data',
    title_ar: 'نقل البيانات الشخصية عبر الحدود',
    summary_en: 'Restricts transfer of personal data outside the UAE unless the destination has adequate protection or explicit safeguards are in place.',
  },
  'Art. 25': {
    title_en: 'Appointment of a Data Protection Officer',
    title_ar: 'تعيين مسؤول حماية البيانات',
    summary_en: 'Requires designation of a DPO for controllers/processors handling sensitive or large-scale personal data.',
  },
};

// ---------------------------------------------------------------------------
// Pattern-id → article mapping.
//
// Every pattern id shipped in src/engine/patterns.js gets one or more entries.
// Categories that expose Emirates IDs, passports, or biometrics always cite
// Art. 15 (Sensitive Personal Data) because those identifiers can be used to
// re-identify a data subject on their own.
// ---------------------------------------------------------------------------

const PATTERN_TO_ARTICLES = {
  // ---- ID & Documents ------------------------------------------------------
  national_id:    ['Art. 1', 'Art. 15', 'Art. 20', 'Art. 22'],
  intl_phone:     ['Art. 1', 'Art. 5', 'Art. 22'],
  passport:       ['Art. 1', 'Art. 15', 'Art. 20', 'Art. 22'],
  visa_id:        ['Art. 1', 'Art. 15', 'Art. 22'],
  trade_lic:      ['Art. 1', 'Art. 20'],
  pobox:          ['Art. 1'],
  non_latin_name: ['Art. 1', 'Art. 5'],
  unified_id:     ['Art. 1', 'Art. 15', 'Art. 22'],
  uae_iban:       ['Art. 1', 'Art. 15', 'Art. 20', 'Art. 22'],
  // ---- Personal Info -------------------------------------------------------
  email:          ['Art. 1', 'Art. 5', 'Art. 22'],
  phone:          ['Art. 1', 'Art. 5', 'Art. 22'],
  ip:             ['Art. 1', 'Art. 5'],
  cc:             ['Art. 1', 'Art. 15', 'Art. 20'],
  ssn:            ['Art. 1', 'Art. 15', 'Art. 20', 'Art. 22'],
  dob:            ['Art. 1', 'Art. 5'],
  date:           ['Art. 1'],
  age:            ['Art. 1', 'Art. 5'],
  full_name:      ['Art. 1', 'Art. 5'],
  // ---- Credentials ---------------------------------------------------------
  // Credentials aren't PII per se — they are the KEYS that unlock PII. Cite
  // Art. 20 (security-of-processing duty) and Art. 21 (breach notification)
  // because a leaked credential is itself a reportable security incident.
  jwt:              ['Art. 20', 'Art. 21'],
  ssh_key:          ['Art. 20', 'Art. 21'],
  aws_key:          ['Art. 20', 'Art. 21'],
  openai_key:       ['Art. 20', 'Art. 21'],
  anthropic:        ['Art. 20', 'Art. 21'],
  hf_token:         ['Art. 20', 'Art. 21'],
  gh_token:         ['Art. 20', 'Art. 21'],
  slack:            ['Art. 20', 'Art. 21'],
  stripe:           ['Art. 20', 'Art. 21'],
  bearer:           ['Art. 20', 'Art. 21'],
  db_conn:          ['Art. 20', 'Art. 21', 'Art. 22'],
  databricks_token: ['Art. 20', 'Art. 21'],
  databricks_host:  ['Art. 20'],
  s3_uri:           ['Art. 20', 'Art. 22'],
  env_secret:       ['Art. 20', 'Art. 21'],
  hex_secret:       ['Art. 20', 'Art. 21'],
};

// ---------------------------------------------------------------------------
// Severity heuristic — used to prioritise findings in the compliance report.
//   critical — sensitive personal data (Art. 15) OR live credentials
//   high     — personal data with strong re-identification risk
//   medium   — general personal data
//   low      — quasi-identifiers (age, date, name alone)
// ---------------------------------------------------------------------------

const SEVERITY = {
  national_id:      'critical',
  passport:         'critical',
  visa_id:          'critical',
  unified_id:       'critical',
  uae_iban:         'critical',
  ssn:              'critical',
  cc:               'critical',
  jwt:              'critical',
  ssh_key:          'critical',
  aws_key:          'critical',
  openai_key:       'critical',
  anthropic:        'critical',
  hf_token:         'critical',
  gh_token:         'critical',
  slack:            'critical',
  stripe:           'critical',
  bearer:           'critical',
  db_conn:          'critical',
  databricks_token: 'critical',
  env_secret:       'critical',
  hex_secret:       'high',
  databricks_host:  'high',
  s3_uri:           'high',
  intl_phone:       'high',
  phone:            'high',
  email:            'high',
  ip:               'medium',
  non_latin_name:   'medium',
  full_name:        'medium',
  trade_lic:        'medium',
  pobox:            'medium',
  dob:              'medium',
  age:              'low',
  date:             'low',
};

/**
 * Enrich a finding with PDPL context. Non-mutating — returns a new object.
 * @param {object} finding — as produced by maskText()
 * @returns {object} finding + { severity, articles, articleSummaries, checksumVerified }
 */
function enrich(finding) {
  const articles = PATTERN_TO_ARTICLES[finding.id] || [];
  const articleSummaries = articles.map((code) => ({
    code,
    ...ARTICLES[code],
  }));
  const severity = SEVERITY[finding.id] || 'medium';

  // Additional integrity check for high-value UAE identifiers.
  let checksumVerified = null; // null = not applicable
  if (finding.id === 'national_id') {
    checksumVerified = isValidEmiratesId(finding.original);
  } else if (finding.id === 'uae_iban') {
    checksumVerified = isValidIban(finding.original);
  }

  return {
    ...finding,
    severity,
    articles,
    articleSummaries,
    checksumVerified,
  };
}

/**
 * Enrich a list of findings and produce an aggregate summary suitable for
 * rendering a compliance report (A2).
 * @param {object[]} findings
 * @returns {{ findings: object[], summary: object }}
 */
function summarize(findings) {
  const enriched = findings.map(enrich);

  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  const articleCounts = {};
  const categoryCounts = { id: 0, pii: 0, cred: 0 };

  for (const f of enriched) {
    severityCounts[f.severity] = (severityCounts[f.severity] || 0) + 1;
    if (categoryCounts[f.cat] != null) categoryCounts[f.cat]++;
    for (const code of f.articles) {
      articleCounts[code] = (articleCounts[code] || 0) + 1;
    }
  }

  return {
    findings: enriched,
    summary: {
      total: enriched.length,
      byCategory: categoryCounts,
      bySeverity: severityCounts,
      byArticle: articleCounts,
      articles: ARTICLES,
      // Convenience: the top-N most-cited PDPL articles.
      topArticles: Object.entries(articleCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([code, count]) => ({ code, count, ...ARTICLES[code] })),
    },
  };
}

/**
 * Sanity check helper — returns any pattern ids that don't have a mapping.
 * The test suite uses this to catch drift as new patterns are added.
 * @returns {string[]}
 */
function unmappedPatternIds() {
  return PATTERNS
    .map((p) => p.id)
    .filter((id) => !PATTERN_TO_ARTICLES[id]);
}

module.exports = {
  ARTICLES,
  PATTERN_TO_ARTICLES,
  SEVERITY,
  enrich,
  summarize,
  unmappedPatternIds,
};
