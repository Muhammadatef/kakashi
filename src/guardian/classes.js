/**
 * Sensitivity classes — the Guardian's reasoning vocabulary.
 *
 * Kakashi's engine speaks in *pattern ids* (`national_id`, `openai_key`, ...).
 * That is the right granularity for a detector but the wrong granularity for a
 * security policy: nobody wants to write a rule that enumerates all 15 credential
 * patterns. This module collapses the 35 pattern ids onto 9 stable classes that a
 * policy, a risk engine and a human can all reason about.
 *
 * Deliberately DATA, not logic — same convention as lib/pdpl-mapping.js. It adds
 * no detection capability and changes no existing behaviour; it is a lookup table
 * over `PATTERNS`.
 *
 * Nothing here ever holds a matched value. Classes describe *kinds* of data.
 */

const { PATTERNS } = require('../engine/patterns');

/** Every class the Guardian can reason about. Order is severity-descending-ish. */
const CLASSES = [
  'CREDENTIAL',
  'GOVERNMENT_IDENTIFIER',
  'FINANCIAL',
  'CONTACT',
  'PERSON_NAME',
  'QUASI_IDENTIFIER',
  'TECHNICAL_IDENTIFIER',
  'BUSINESS_ATTRIBUTE',
  'LOCATION',
];

/**
 * pattern id → sensitivity class.
 * Every id in engine/patterns.js MUST appear here; `unmappedPatternIds()` is
 * asserted by the test suite so adding a pattern without classifying it fails CI.
 */
const PATTERN_TO_CLASS = {
  // --- Government / state-issued identifiers -------------------------------
  // These re-identify a data subject on their own and are the hardest class to
  // justify sending anywhere. PDPL Art. 15 cites all of them.
  national_id: 'GOVERNMENT_IDENTIFIER',
  passport:    'GOVERNMENT_IDENTIFIER',
  visa_id:     'GOVERNMENT_IDENTIFIER',
  unified_id:  'GOVERNMENT_IDENTIFIER',
  ssn:         'GOVERNMENT_IDENTIFIER',

  // --- Financial instruments ----------------------------------------------
  uae_iban: 'FINANCIAL',
  cc:       'FINANCIAL',

  // --- Contact handles -----------------------------------------------------
  email:      'CONTACT',
  phone:      'CONTACT',
  intl_phone: 'CONTACT',

  // --- Names ---------------------------------------------------------------
  full_name:      'PERSON_NAME',
  non_latin_name: 'PERSON_NAME',

  // --- Quasi-identifiers ---------------------------------------------------
  // Individually weak, jointly re-identifying. The class that most benefits from
  // generalisation rather than removal (see M4 — not implemented in the MVP).
  dob:  'QUASI_IDENTIFIER',
  date: 'QUASI_IDENTIFIER',
  age:  'QUASI_IDENTIFIER',

  // --- Infrastructure locators --------------------------------------------
  // Not secrets themselves, but they map an organisation's attack surface.
  ip:               'TECHNICAL_IDENTIFIER',
  databricks_host:  'TECHNICAL_IDENTIFIER',
  s3_uri:           'TECHNICAL_IDENTIFIER',

  // --- Business attributes / location -------------------------------------
  trade_lic: 'BUSINESS_ATTRIBUTE',
  pobox:     'LOCATION',

  // --- Credentials ---------------------------------------------------------
  // Live keys. `db_conn` lands here (not TECHNICAL_IDENTIFIER) because the URI
  // embeds user:password.
  jwt:              'CREDENTIAL',
  ssh_key:          'CREDENTIAL',
  aws_key:          'CREDENTIAL',
  openai_key:       'CREDENTIAL',
  anthropic:        'CREDENTIAL',
  hf_token:         'CREDENTIAL',
  gh_token:         'CREDENTIAL',
  slack:            'CREDENTIAL',
  stripe:           'CREDENTIAL',
  bearer:           'CREDENTIAL',
  db_conn:          'CREDENTIAL',
  sql_password:     'CREDENTIAL',
  databricks_token: 'CREDENTIAL',
  env_secret:       'CREDENTIAL',
  hex_secret:       'CREDENTIAL',
};

/**
 * @param {string} patternId
 * @returns {string} sensitivity class; unknown ids fall back to the most
 *   conservative class so a new detector can never be silently under-protected.
 */
function classOf(patternId) {
  return PATTERN_TO_CLASS[patternId] || 'CREDENTIAL';
}

/**
 * Every pattern id belonging to a class — this is what gets handed to
 * `maskText({ enabled })` to actuate a class-scoped transform.
 * @param {string} cls
 * @returns {string[]}
 */
function patternIdsFor(cls) {
  return PATTERNS.map((p) => p.id).filter((id) => classOf(id) === cls);
}

/**
 * Drift guard — mirrors pdpl-mapping.unmappedPatternIds(). Asserted by tests.
 * @returns {string[]}
 */
function unmappedPatternIds() {
  return PATTERNS.map((p) => p.id).filter((id) => !PATTERN_TO_CLASS[id]);
}

module.exports = { CLASSES, PATTERN_TO_CLASS, classOf, patternIdsFor, unmappedPatternIds };
