const NAME_STOPLIST = new Set([
  'the', 'of', 'in', 'for', 'a', 'an', 'and', 'or', 'to', 'from', 'with',
  'by', 'at', 'on', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
  'ought', 'used', 'not', 'no', 'nor', 'but', 'if', 'then', 'else',
  'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
  'more', 'most', 'other', 'some', 'such', 'than', 'too', 'very', 'just',
  'don', 'now', 'only', 'own', 'same', 'so', 'also', 'as', 'it', 'its',
  'this', 'that', 'these', 'those', 'he', 'she', 'they', 'we', 'you',
  'his', 'her', 'their', 'our', 'your', 'my', 'me', 'him', 'them', 'us',
  'who', 'whom', 'which', 'what', 'whose', 'new', 'old', 'first', 'last',
  'next', 'previous', 'total', 'sum', 'count', 'value', 'data', 'report',
  'table', 'column', 'row', 'field', 'name', 'type', 'date', 'time',
  'year', 'month', 'day', 'number', 'id', 'code', 'status', 'state',
]);

// ---------------------------------------------------------------------------
// Checksum helpers
//
// These are exported as reusable primitives. They are NOT wired into the
// pattern `validate` hooks by default because:
//   (a) the existing test fixtures use synthetic IDs whose check digits are
//       not real (e.g. 784-1988-1234567-0), and enabling strict validation
//       would break those tests without adding real safety;
//   (b) the compliance/reporter layer (A5, A2) uses these helpers to add a
//       "checksum-verified" badge to each finding — that is the correct
//       place for strict validation, not the pattern matcher which needs to
//       stay lenient enough to flag suspect-looking IDs even when the check
//       digit is wrong (attackers frequently transpose digits).
// ---------------------------------------------------------------------------

/**
 * Luhn (ISO/IEC 7812-1) checksum for a digits-only string.
 * @param {string} digits
 * @returns {boolean}
 */
function luhnCheck(digits) {
  if (typeof digits !== 'string' || digits.length === 0) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    const n = parseInt(digits[i], 10);
    if (Number.isNaN(n)) return false;
    let contrib = n;
    if (alt) {
      contrib = n * 2;
      if (contrib > 9) contrib -= 9;
    }
    sum += contrib;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/**
 * Emirates ID checksum verification.
 * Emirates ID is 15 digits (784-YYYY-NNNNNNN-C) with a Luhn check digit.
 * @param {string} id — may contain dashes or spaces
 * @returns {boolean}
 */
function isValidEmiratesId(id) {
  const digits = String(id || '').replace(/\D/g, '');
  if (digits.length !== 15) return false;
  if (!/^784/.test(digits)) return false;
  return luhnCheck(digits);
}

/**
 * IBAN mod-97 checksum (ISO 13616).
 * @param {string} iban — spaces/case tolerated
 * @returns {boolean}
 */
function isValidIban(iban) {
  const clean = String(iban || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(clean)) return false;
  // Rearrange: move first four chars to the end.
  const rearranged = clean.slice(4) + clean.slice(0, 4);
  // Convert letters to digits (A=10..Z=35).
  const numeric = rearranged.replace(/[A-Z]/g, (c) => (c.charCodeAt(0) - 55).toString());
  // Mod 97 via 7-digit chunks (keeps us out of BigInt land).
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    remainder = parseInt(String(remainder) + numeric.slice(i, i + 7), 10) % 97;
  }
  return remainder === 1;
}

// ---------------------------------------------------------------------------
// Patterns
//
// Every pattern has:
//   id        — stable key; used in token replacement `[<ID>_<n>]`
//   label     — English display name (used in reports, verbose output)
//   labelAr   — Arabic display name (used when LANG=ar* or --lang ar)
//   cat       — 'id' | 'pii' | 'cred'
//   rx        — regex to match
//   validate  — optional predicate; return false to reject a match
//   fakeValues — used by --mode fake
// ---------------------------------------------------------------------------

const BASE_PATTERNS = [
  // ---- ID & Documents ------------------------------------------------------
  {
    id: 'national_id',
    label: 'Emirates ID',
    labelAr: 'الهوية الإماراتية',
    cat: 'id',
    // Emirates ID format: 784-YYYY-NNNNNNN-D.
    // For compliance-strict deployments the reporter (A2/A5) can additionally
    // apply `isValidEmiratesId(match)` to badge findings as checksum-verified.
    rx: /\b784-\d{4}-\d{7}-\d\b/g,
    fakeValues: ['784-1990-9999999-0', '784-1985-1234567-1'],
  },
  {
    id: 'intl_phone',
    label: 'UAE Phone',
    labelAr: 'هاتف إماراتي',
    cat: 'id',
    // Matches UAE mobile (+971 5x…) and UAE landline (+971 2/3/4/6/7/9) in
    // international, national-with-country-code (00971), or local (0X) forms.
    rx: /(?:\+971|00971|971)[ \t.-]?(?:5[0-9]|2|3|4|6|7|9)[ \t.-]?\d{3}[ \t.-]?\d{4}\b|\b0(?:5[0-9]|2|3|4|6|7|9)[ \t.-]?\d{3}[ \t.-]?\d{4}\b/g,
    fakeValues: ['+971501234567', '0501234567'],
  },
  {
    id: 'passport',
    label: 'Passport',
    labelAr: 'جواز سفر',
    cat: 'id',
    // ICAO-style passport numbers: 2 letters + 6-9 digits, or P<letter> + 7-8 digits.
    // Covers UAE, most EU, US, and Commonwealth passport formats.
    rx: /\b(?:[A-Z]{2}\d{6,9}|P[A-Z]\d{7,8})\b/g,
    fakeValues: ['MO1234567', 'AB12345678'],
  },
  {
    id: 'visa_id',
    label: 'Visa Number',
    labelAr: 'رقم التأشيرة',
    cat: 'id',
    // UAE residence visa: NNN/YYYY/NNNNNNN.
    rx: /\b\d{3}\/\d{4}\/\d{7}\b/g,
    fakeValues: ['201/2024/1234567'],
  },
  {
    id: 'trade_lic',
    label: 'Trade License',
    labelAr: 'رخصة تجارية',
    cat: 'id',
    // Dubai DED / commercial CN / TL-prefixed trade license numbers.
    rx: /\b(?:DED|CN|TL)-[A-Z0-9]{4,10}\b/gi,
    fakeValues: ['DED-123456', 'CN-789012'],
  },
  {
    id: 'pobox',
    label: 'P.O. Box',
    labelAr: 'صندوق بريد',
    cat: 'id',
    rx: /\bP\.?[ \t]*O\.?[ \t]*Box[ \t]+\d{1,6}\b/gi,
    fakeValues: ['P.O. Box 12345'],
  },
  {
    id: 'non_latin_name',
    label: 'Arabic Name',
    labelAr: 'اسم عربي',
    cat: 'id',
    // Two or more whitespace-separated Arabic-script tokens.
    // v1.2: extend to Cyrillic, Hebrew, CJK, Devanagari.
    rx: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+(?:[ \t]+[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+)+/g,
    fakeValues: ['محمد أحمد', 'فاطمة علي'],
  },
  {
    id: 'unified_id',
    label: 'Unified ID',
    labelAr: 'الرقم الموحد',
    cat: 'id',
    // 15-digit unified identifier (e.g. UAE UID starts with "10").
    rx: /\b10\d{13}\b/g,
    fakeValues: ['101234567890123'],
  },
  {
    id: 'uae_iban',
    label: 'UAE IBAN',
    labelAr: 'ايبان إماراتي',
    cat: 'id',
    // UAE IBAN: AE + 2 check digits + 3-digit bank + 16-digit account = 23 chars.
    // Format tolerates optional spaces every 4 chars (bank-statement style).
    rx: /\bAE\d{2}(?:[ \t]?\d{4}){4}[ \t]?\d{3}\b|\bAE\d{21}\b/g,
    fakeValues: ['AE070331234567890123456'],
    // Strict-mode reporters may additionally call isValidIban(match).
  },
  // ---- Personal Info -------------------------------------------------------
  {
    id: 'email',
    label: 'Email',
    labelAr: 'بريد إلكتروني',
    cat: 'pii',
    rx: /\b[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}\b/g,
    fakeValues: ['user_a@example.com', 'user_b@example.org'],
  },
  {
    id: 'phone',
    label: 'Phone',
    labelAr: 'هاتف',
    cat: 'pii',
    // Require explicit separators so we don't grab 8-digit substrings out of
    // tokens / cluster IDs / hostnames. Three accepted shapes:
    //   intl:   +1-415-555-0188   +44 20 7946 0521   +91-22-2493-1234
    //   parens: (415) 555-0188
    //   us:     415-555-0188      415.555.0188       415 555 0188
    rx: /(?:\+\d{1,3}[ \t.-]\d{1,4}[ \t.-]\d{2,4}[ \t.-]\d{3,4}|\(\d{2,4}\)[ \t]*\d{3}[ \t.-]\d{4}|\b\d{3}[ \t.-]\d{3}[ \t.-]\d{4})\b/g,
    validate: (match, text, idx) => {
      const digits = match.replace(/\D/g, '');
      if (digits.length < 9 || digits.length > 15) return false;
      if (/^971/.test(digits)) return false; // covered by intl_phone (UAE)
      // Reject when embedded in a longer alphanumeric/digit-hyphen sequence
      // (e.g. inside "acme-prod-9842" or "0125-123456-abcd1234")
      const before = text.slice(Math.max(0, idx - 1), idx);
      const after = text.slice(idx + match.length, idx + match.length + 1);
      if (/[A-Za-z0-9]/.test(before) || /[A-Za-z0-9]/.test(after)) return false;
      return true;
    },
    fakeValues: ['+1-555-555-0100', '+44 20 7946 0958'],
  },
  {
    id: 'ip',
    label: 'IP Address',
    labelAr: 'عنوان IP',
    cat: 'pii',
    rx: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g,
    fakeValues: ['192.168.1.1', '10.0.0.1'],
  },
  {
    id: 'cc',
    label: 'Credit Card',
    labelAr: 'بطاقة ائتمان',
    cat: 'pii',
    // Visa/MC/Discover (4-4-4-4) | Amex (4-6-5) | continuous 13-19 digits
    rx: /\b(?:\d{4}[ \t-]?){3}\d{4}\b|\b\d{4}[ \t-]\d{6}[ \t-]\d{5}\b|\b\d{13,19}\b/g,
    validate: (match) => {
      const digits = match.replace(/\D/g, '');
      return digits.length >= 13 && digits.length <= 19;
    },
    fakeValues: ['4111-1111-1111-1111'],
  },
  {
    id: 'ssn',
    label: 'SSN / National ID',
    labelAr: 'رقم الضمان الاجتماعي',
    cat: 'pii',
    rx: /\b\d{3}-\d{2}-\d{4}\b/g,
    fakeValues: ['123-45-6789'],
  },
  {
    id: 'dob',
    label: 'Date of Birth',
    labelAr: 'تاريخ الميلاد',
    cat: 'pii',
    rx: /(?:date[ \t]*of[ \t]*birth|dob|birth[ \t]*date|born[ \t]*on)[: \t]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/gi,
    fakeValues: ['01/01/1990'],
  },
  {
    id: 'date',
    label: 'Date',
    labelAr: 'تاريخ',
    cat: 'pii',
    rx: /\b(?:0?[1-9]|[12]\d|3[01])[\/\-](?:0?[1-9]|1[0-2])[\/\-](?:19|20)\d{2}\b|\b(?:0?[1-9]|1[0-2])[\/\-](?:0?[1-9]|[12]\d|3[01])[\/\-](?:19|20)\d{2}\b/g,
    fakeValues: ['15/03/2024'],
  },
  {
    id: 'age',
    label: 'Age',
    labelAr: 'العمر',
    cat: 'pii',
    rx: /\b(?:age|aged)[: \t]+\d{1,3}\b/gi,
    fakeValues: ['age: 34'],
  },
  {
    id: 'full_name',
    label: 'Full Name',
    labelAr: 'الاسم الكامل',
    cat: 'pii',
    rx: /\b[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+)+\b/g,
    validate: (match) => {
      const words = match.split(/\s+/);
      return words.every((w) => !NAME_STOPLIST.has(w.toLowerCase()));
    },
    fakeValues: ['John Smith', 'Jane Doe'],
  },
  // ---- Credentials ---------------------------------------------------------
  {
    id: 'jwt',
    label: 'JWT Token',
    labelAr: 'رمز JWT',
    cat: 'cred',
    rx: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    fakeValues: ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'],
  },
  {
    id: 'ssh_key',
    label: 'SSH Private Key',
    labelAr: 'مفتاح SSH خاص',
    cat: 'cred',
    rx: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    fakeValues: ['-----BEGIN PRIVATE KEY-----\n[REDACTED]\n-----END PRIVATE KEY-----'],
  },
  {
    id: 'aws_key',
    label: 'AWS Key',
    labelAr: 'مفتاح AWS',
    cat: 'cred',
    rx: /\b(?:AKIA|ASIA|AROA)[A-Z0-9]{12,16}\b/g,
    fakeValues: ['AKIAIOSFODNN7EXAMPLE'],
  },
  {
    id: 'openai_key',
    label: 'OpenAI Key',
    labelAr: 'مفتاح OpenAI',
    cat: 'cred',
    // Covers legacy sk-... and current sk-proj-* / sk-svcacct-* / sk-admin-*
    rx: /\bsk-(?:proj-|svcacct-|admin-|None-)?[A-Za-z0-9_-]{20,}\b/g,
    // Don't double-match Anthropic keys (they start with sk-ant-)
    validate: (match) => !/^sk-ant-/.test(match),
    fakeValues: ['sk-proj-abc123def456ghi789jkl012mno345pqr678'],
  },
  {
    id: 'anthropic',
    label: 'Anthropic Key',
    labelAr: 'مفتاح Anthropic',
    cat: 'cred',
    rx: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
    fakeValues: ['sk-ant-api03-abc123def456ghi789jkl012mno'],
  },
  {
    id: 'hf_token',
    label: 'HuggingFace Token',
    labelAr: 'رمز HuggingFace',
    cat: 'cred',
    rx: /\bhf_[A-Za-z0-9]{20,}\b/g,
    fakeValues: ['hf_abc123def456ghi789jkl012mno345'],
  },
  {
    id: 'gh_token',
    label: 'GitHub Token',
    labelAr: 'رمز GitHub',
    cat: 'cred',
    rx: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
    fakeValues: ['ghp_abc123def456ghi789jkl012'],
  },
  {
    id: 'slack',
    label: 'Slack Token',
    labelAr: 'رمز Slack',
    cat: 'cred',
    rx: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    fakeValues: ['xoxb-1234567890-1234567890123-abc123def456'],
  },
  {
    id: 'stripe',
    label: 'Stripe Key',
    labelAr: 'مفتاح Stripe',
    cat: 'cred',
    rx: /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{20,}\b/g,
    fakeValues: ['sk_test_EXAMPLEplaceholderNOTAREALKEY'],
  },
  {
    id: 'bearer',
    label: 'Bearer Token',
    labelAr: 'رمز Bearer',
    cat: 'cred',
    rx: /\bBearer[ \t]+[A-Za-z0-9._\-+/=]{20,}\b/gi,
    fakeValues: ['Bearer abc123def456ghi789jkl012mno345'],
  },
  {
    id: 'db_conn',
    label: 'Database Connection',
    labelAr: 'اتصال قاعدة بيانات',
    cat: 'cred',
    // Standard:  postgresql://user:pass@host/db
    // JDBC:      jdbc:databricks://host:443/path  (sub-protocol after jdbc:)
    rx: /\b(?:postgresql|postgres|mysql|mongodb(?:\+srv)?|redis|mssql|sqlite|oracle):\/\/[^\s"'<>]+|\bjdbc:[a-z]+:\/\/[^\s"'<>]+|\bjdbc:\/\/[^\s"'<>]+/gi,
    fakeValues: ['postgresql://user:pass@localhost:5432/db'],
  },
  {
    id: 'sql_password',
    label: 'SQL Password',
    cat: 'cred',
    // SQL DDL auth clauses that delimit the secret with a SPACE (not `=`), so
    // the `env_secret` pattern (which requires `[:=]`) never sees them:
    //   CREATE USER app IDENTIFIED BY 'S3cret!';                  -- Oracle / MySQL
    //   CREATE ROLE app WITH PASSWORD 'S3cret!';                  -- PostgreSQL
    //   CREATE USER app IDENTIFIED WITH mysql_native_password BY 'S3cret!';  -- MySQL 8
    //   ALTER USER app IDENTIFIED BY PASSWORD '*HASH...';         -- MySQL legacy hash
    //   ... ENCRYPTED BY 'keymaterial'                            -- Oracle TDE
    // We anchor on the keyword via lookbehind and mask ONLY the quoted value,
    // leaving the surrounding statement readable. The `=` forms
    // (e.g. SQL Server `WITH PASSWORD = '...'`, ADO `Password=...;`) are
    // intentionally left to `env_secret` so the two patterns never overlap.
    rx: /(?<=\b(?:IDENTIFIED(?:\s+WITH\s+[\w.]+)?\s+BY|PASSWORD|ENCRYPTED\s+BY)\s+(?:PASSWORD\s+)?)(?:'[^'\n]*'|"[^"\n]*"|`[^`\n]*`)/gi,
    fakeValues: ["'P@ssw0rd!'"],
  },
  {
    id: 'databricks_token',
    label: 'Databricks Token',
    labelAr: 'رمز Databricks',
    cat: 'cred',
    rx: /\bdapi[a-fA-F0-9]{32,}(?:-\d+)?\b/g,
    fakeValues: ['dapi1234567890abcdef1234567890abcdef'],
  },
  {
    id: 'databricks_host',
    label: 'Databricks Host',
    labelAr: 'مضيف Databricks',
    cat: 'cred',
    rx: /\bhttps?:\/\/[A-Za-z0-9-]+\.(?:cloud\.databricks\.com|azuredatabricks\.net|gcp\.databricks\.com)[^\s"'<>]*/gi,
    fakeValues: ['https://example.cloud.databricks.com'],
  },
  {
    id: 's3_uri',
    label: 'S3 URI',
    labelAr: 'رابط S3',
    cat: 'cred',
    rx: /\bs3:\/\/[A-Za-z0-9._\-]+(?:\/[^\s"'<>]*)?/g,
    fakeValues: ['s3://example-bucket/path'],
  },
  {
    id: 'env_secret',
    label: 'Env Secret',
    labelAr: 'سر بيئي',
    cat: 'cred',
    // Match KEY=VALUE assignments where KEY contains any sensitive substring,
    // covering shell .env (`KEY=value`) and source-code styles
    // (`KEY = "value"`, `KEY: 'value'`). Lookbehind avoids consuming the
    // leading newline that previously collapsed adjacent lines.
    // The prefix before the keyword is OPTIONAL. It used to be mandatory
    // (`[A-Za-z_][\w.-]*` with no `?`), which meant the most common forms in a
    // real .env file were silently missed — `PASSWORD=`, `API_KEY=`, `TOKEN=`,
    // `SECRET=` all failed while `DB_PASSWORD=` matched. The pattern's own
    // fakeValue (`API_KEY=sk-fake123`) was itself undetectable.
    rx: /(?<=^|[\s,;({\[])((?:[A-Za-z_][\w.-]*)?(?:PASSWORD|PASSWD|PWD|SECRET|TOKEN|API[_-]?KEY|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|SECRET[_-]?KEY|CREDENTIAL|HOST|BUCKET|SIGNATURE|HMAC|DSN|WEBHOOK)[\w.-]*)[ \t]*[:=][ \t]*(?:"([^"\n]+)"|'([^'\n]+)'|([^\s\n#,;)\]}]+))/gim,
    // Keys that contain a trigger word but never hold a secret. Kept short and
    // specific on purpose: for a DLP tool, over-masking a benign value is a
    // nuisance while missing a real `TOKEN=` is a breach, so the default leans
    // toward detection and this list stays an explicit, auditable exception.
    validate: (match) => {
      const key = match.split(/[:=]/)[0].trim();
      if (/^(?:[\w.-]*_)?TOKENIZ(?:E|ER|ERS|ATION)$/i.test(key)) return false;
      // Never re-detect a token this masker already emitted. Now that only the
      // VALUE is replaced, `API_KEY=[OPENAI_KEY_1]` still looks like KEY=value
      // -- so without this, masking stopped being idempotent and the Guardian's
      // verifier could never converge (it re-scans its own output and would
      // escalate forever, ending in BLOCK).
      const value = match.slice(match.search(/[:=]/) + 1).trim().replace(/^["']|["']$/g, '');
      return !/^\[[A-Z0-9_]*\]?$/.test(value);
    },
    // Replace the VALUE only (group 2 double-quoted, 3 single-quoted, 4 bare),
    // never the whole `KEY=value`. Masking the key name too turned
    // `OPENAI_API_KEY=sk-...` into a bare `[ENV_SECRET_1]`, which destroys the
    // one piece of context an agent needs to reason about the file -- and it
    // shadowed the specific credential patterns, so the `[OPENAI_KEY_1]` token
    // this project's own README advertises could never actually appear.
    // Narrowing the span also lets a more specific pattern win the overlap.
    valueGroups: [2, 3, 4],
  },
  {
    id: 'hex_secret',
    label: 'Hex Secret',
    labelAr: 'سر Hex',
    cat: 'cred',
    rx: /\b[a-fA-F0-9]{40,}\b/g,
    validate: (match) => /[a-fA-F]/.test(match),
    fakeValues: ['a1b2c3d4e5f6789012345678901234567890abcd'],
  },
];

const PATTERNS = [...BASE_PATTERNS];

const ID_PATTERNS = PATTERNS.filter((p) => p.cat === 'id');
const PII_PATTERNS = PATTERNS.filter((p) => p.cat === 'pii');
const CRED_PATTERNS = PATTERNS.filter((p) => p.cat === 'cred');

module.exports = {
  PATTERNS,
  BASE_PATTERNS,
  ID_PATTERNS,
  PII_PATTERNS,
  CRED_PATTERNS,
  NAME_STOPLIST,
  // Checksum helpers — used by the reporter (A2) and PDPL mapping (A5) to
  // badge findings as "checksum-verified" without breaking pattern lenience.
  luhnCheck,
  isValidEmiratesId,
  isValidIban,
};
