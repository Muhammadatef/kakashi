const assert = require('assert');
const { maskText } = require('../src/engine/masker');
const {
  PATTERNS,
  luhnCheck,
  isValidEmiratesId,
  isValidIban,
} = require('../src/engine/patterns');

const cases = [
  { id: 'national_id', input: 'ID: 784-1988-1234567-0', shouldMatch: true },
  { id: 'national_id', input: 'ref: 784-1234', shouldMatch: false },
  { id: 'intl_phone', input: '+971501234567', shouldMatch: true },
  { id: 'intl_phone', input: '971501234567', shouldMatch: true },
  { id: 'intl_phone', input: '0501234567', shouldMatch: true },
  { id: 'intl_phone', input: '+971 4 555 1234', shouldMatch: true }, // UAE landline
  { id: 'uae_iban', input: 'IBAN AE070331234567890123456', shouldMatch: true },
  { id: 'uae_iban', input: 'IBAN AE07 0331 2345 6789 0123 456', shouldMatch: true },
  { id: 'uae_iban', input: 'IBAN GB29NWBK60161331926819', shouldMatch: false }, // UK IBAN, not UAE
  { id: 'non_latin_name', input: 'العميل محمد أحمد المنصوري', shouldMatch: true },
  { id: 'email', input: 'user@example.com', shouldMatch: true },
  { id: 'email', input: 'not an email', shouldMatch: false },
  { id: 'db_conn', input: 'postgresql://admin:pass123@prod.db.example.com/stats', shouldMatch: true },
  { id: 'db_conn', input: 'jdbc:databricks://acme.cloud.databricks.com:443/default;PWD=x', shouldMatch: true },
  { id: 'openai_key', input: 'sk-abc123defabc123defabc123defabc123def', shouldMatch: true },
  { id: 'openai_key', input: 'sk-proj-9pQrStUvWxYz1234567890abcdefABCDEF', shouldMatch: true },
  { id: 'openai_key', input: 'sk-svcacct-aBcDeFgHiJkLmNoPqRsTuVwXyZ12345', shouldMatch: true },
  { id: 'openai_key', input: 'sk-ant-api03-zYxWvUtSrQpOnMlKjIhGfEdCbA9876543210', shouldMatch: false },
  { id: 'phone', input: '+1-415-555-0188', shouldMatch: true },
  { id: 'phone', input: '+44-20-7946-0521', shouldMatch: true },
  { id: 'phone', input: '(415) 555-0188', shouldMatch: true },
  { id: 'phone', input: '415-555-0188', shouldMatch: true },
  // Embedded 8-digit substrings inside tokens MUST NOT match
  { id: 'phone', input: 'dapi1234567890abcdef1234567890abcdef12345678', shouldMatch: false },
  { id: 'phone', input: 'cluster-id 0125-123456-abcd1234', shouldMatch: false },
  { id: 'phone', input: 'acme-prod-9842.cloud.databricks.com', shouldMatch: false },
  { id: 'cc', input: '4111-1111-1111-1111', shouldMatch: true },
  { id: 'cc', input: '3782-822463-10005', shouldMatch: true }, // Amex 4-6-5
  { id: 'databricks_token', input: 'dapi1234567890abcdef1234567890abcdef12345678', shouldMatch: true },
  { id: 'databricks_token', input: 'random word', shouldMatch: false },
  { id: 'databricks_host', input: 'https://acme-prod-9842.cloud.databricks.com', shouldMatch: true },
  { id: 'databricks_host', input: 'https://example.azuredatabricks.net/api', shouldMatch: true },
  { id: 'databricks_host', input: 'https://example.com', shouldMatch: false },
  { id: 's3_uri', input: 's3://acme-attribution-prod-eu-west-1/h1-2026', shouldMatch: true },
  { id: 's3_uri', input: 'no s3 here', shouldMatch: false },
  // env_secret should now catch Python-style quoted assignments
  { id: 'env_secret', input: 'OPENAI_API_KEY=sk-proj-abc123', shouldMatch: true },
  { id: 'env_secret', input: 'OPENAI_API_KEY = "sk-proj-abc123"', shouldMatch: true },
  { id: 'env_secret', input: 'AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"', shouldMatch: true },
  { id: 'env_secret', input: "DATABRICKS_TOKEN = 'dapi1234567890abcdef1234567890abcdef12345678'", shouldMatch: true },
  { id: 'env_secret', input: 'COMPASS_AI_API_KEY = "cmp_live_abc123def456ghi789"', shouldMatch: true },
  { id: 'env_secret', input: 'DATABRICKS_HOST = "https://example.cloud.databricks.com"', shouldMatch: true },
  { id: 'env_secret', input: 'S3_EXPORT_BUCKET = "s3://example-bucket/path"', shouldMatch: true },
  // Common false positives that MUST NOT trigger env_secret
  { id: 'env_secret', input: 'PASSED = true', shouldMatch: false },
  { id: 'env_secret', input: 'AUTHOR_NAME = "Alice"', shouldMatch: false },
  // SQL DDL auth clauses (space-delimited — env_secret can't see these)
  { id: 'sql_password', input: "CREATE USER app IDENTIFIED BY 'S3cret!';", shouldMatch: true },
  { id: 'sql_password', input: "CREATE ROLE app WITH PASSWORD 'S3cret!';", shouldMatch: true },
  { id: 'sql_password', input: "CREATE USER app IDENTIFIED WITH mysql_native_password BY 'S3cret!';", shouldMatch: true },
  { id: 'sql_password', input: "ALTER USER app IDENTIFIED BY PASSWORD '*A1B2C3';", shouldMatch: true },
  { id: 'sql_password', input: 'ALTER USER app IDENTIFIED BY "double quoted";', shouldMatch: true },
  // The `=` form belongs to env_secret, NOT sql_password (no overlap)
  { id: 'sql_password', input: "ALTER LOGIN app WITH PASSWORD = 'S3cret!';", shouldMatch: false },
  { id: 'sql_password', input: 'SELECT name FROM users;', shouldMatch: false },
];

function runPatternTests() {
  let passed = 0;
  let failed = 0;

  for (const tc of cases) {
    const pattern = PATTERNS.find((p) => p.id === tc.id);
    assert(pattern, `Pattern not found: ${tc.id}`);
    const { findings } = maskText(tc.input, { enabled: [tc.id] });
    const matched = findings.length > 0;
    if (matched === tc.shouldMatch) {
      passed++;
    } else {
      console.error(`FAIL pattern ${tc.id}: input="${tc.input}" expected match=${tc.shouldMatch} got=${matched}`);
      failed++;
    }
  }

  // Overlap test
  const overlap = maskText('john.5551234567@example.com', { enabled: ['email', 'phone'] });
  if (overlap.findings.length >= 1) {
    passed++;
  } else {
    console.error('FAIL overlap test');
    failed++;
  }

  // ---- Checksum helper tests (used by A5 PDPL reporter) -------------------
  const checksumCases = [
    // luhnCheck
    { fn: 'luhnCheck', input: '4532015112830366', expected: true },   // valid Visa
    { fn: 'luhnCheck', input: '4532015112830367', expected: false },  // off by one
    { fn: 'luhnCheck', input: 'abc', expected: false },
    // Emirates ID (Luhn on the 15 digits, prefix 784).
    // Luhn(784-2017-9999999-X): sum(undoubled) = X+45; sum(doubled) = 49;
    // total = X + 94 → check digit = 6 for validity.
    { fn: 'isValidEmiratesId', input: '784-2017-9999999-6', expected: true },
    { fn: 'isValidEmiratesId', input: '784-2017-9999999-3', expected: false },
    { fn: 'isValidEmiratesId', input: 'not-an-id', expected: false },
    { fn: 'isValidEmiratesId', input: '123-2017-9999999-6', expected: false }, // wrong prefix
    // IBAN mod-97 (real spec test vectors)
    { fn: 'isValidIban', input: 'GB82WEST12345698765432', expected: true },
    { fn: 'isValidIban', input: 'DE89370400440532013000', expected: true },
    { fn: 'isValidIban', input: 'GB82WEST12345698765433', expected: false },
    { fn: 'isValidIban', input: 'not-an-iban', expected: false },
  ];
  const helpers = { luhnCheck, isValidEmiratesId, isValidIban };
  for (const c of checksumCases) {
    const result = helpers[c.fn](c.input);
    if (result === c.expected) {
      passed++;
    } else {
      console.error(`FAIL checksum ${c.fn}("${c.input}") expected ${c.expected} got ${result}`);
      failed++;
    }
  }

  // -------------------------------------------------------------------------
  // Line-boundary discipline.
  //
  // Patterns whose separator is intra-line whitespace must use `[ \t]`, never
  // `\s`. `\s` matches newlines, which caused two real bugs:
  //
  //   1. In spreadsheets, engine/formats/xlsx.js flattens every cell into one
  //      newline-joined string for detection and writes back per cell. A match
  //      spanning cells ("Dept\nAhmed Hassan") exists in no single cell, so the
  //      write silently did nothing and names survived masking entirely.
  //   2. In prose, "Notes\n\nNothing" matched `full_name` and masking replaced
  //      BOTH words with one token, destroying non-sensitive text.
  //
  // `ssh_key` is exempt: a PEM block is genuinely multi-line. Lookarounds are
  // exempt too -- they are zero-width, so `\s` inside one can never make the
  // MATCH itself span a line.
  // -------------------------------------------------------------------------
  const MULTILINE_BY_DESIGN = new Set(['ssh_key']);
  for (const p of PATTERNS) {
    if (MULTILINE_BY_DESIGN.has(p.id)) continue;
    // Strip character classes that legitimately contain \s as a NEGATED
    // terminator (e.g. [^\s"'<>]) and the env_secret leading lookbehind, which
    // must allow a newline before a KEY.
    const body = p.rx.source
      .replace(/\[\^[^\]]*\]/g, '')            // negated classes: [^\s"'<>]
      .replace(/\(\?<[=!][\s\S]*?\)(?=[^)]*$|[([])/g, '') // lookbehind
      .replace(/\(\?<[=!](?:[^()]|\([^()]*\))*\)/g, '');  // nested lookbehind
    if (/\\s/.test(body)) {
      console.error(`FAIL ${p.id} uses \\s outside a negated class — it will match across lines`);
      failed++;
    } else {
      passed++;
    }
  }

  const lineBoundaryCases = [
    // [name, text, patternId, shouldMatch]
    ['full_name does not span a line break', 'Notes\n\nNothing interesting', 'full_name', false],
    ['full_name still matches on one line', 'Contact Ahmed Hassan today', 'full_name', true],
    ['full_name does not span spreadsheet cells', 'Dept\nAhmed Hassan', 'full_name', true],
    ['arabic name does not span a line break', 'محمد\nأحمد', 'non_latin_name', false],
    ['arabic name still matches on one line', 'محمد أحمد', 'non_latin_name', true],
    ['credit card does not span cells', '4111\n1111\n1111\n1111', 'cc', false],
    ['credit card still matches spaced on one line', '4111 1111 1111 1111', 'cc', true],
    ['iban does not span cells', 'AE07\n0331\n2345\n6789\n0123456', 'uae_iban', false],
    ['iban still matches spaced on one line', 'AE07 0331 2345 6789 0123 456', 'uae_iban', true],
    ['uae phone does not span cells', '+971\n50 123 4567', 'intl_phone', false],
    ['uae phone still matches on one line', '+971 50 123 4567', 'intl_phone', true],
    ['po box does not span a line break', 'P.O.\nBox 12345', 'pobox', false],
    ['po box still matches on one line', 'P.O. Box 12345', 'pobox', true],
    ['bearer token does not span a line break', 'Bearer\nabc123def456ghi789jkl012', 'bearer', false],
    ['bearer token still matches on one line', 'Bearer abc123def456ghi789jkl012', 'bearer', true],
    ['env secret does not span a line break', 'API_KEY:\nsk-fake1234567890', 'env_secret', false],
    ['env secret matches a bare key', 'API_KEY=sk-fake1234567890', 'env_secret', true],
    ['env secret matches a prefixed key', 'DB_PASSWORD=hunter2', 'env_secret', true],
    ['env secret matches a key after a newline', 'x=1\nAPI_KEY=sk-fake1234567890', 'env_secret', true],
  ];
  for (const [name, text, id, shouldMatch] of lineBoundaryCases) {
    const { findings } = maskText(text, { enabled: [id] });
    const got = findings.length > 0;
    const spansLine = findings.some((f) => /[\r\n]/.test(f.original));
    if (got === shouldMatch && !spansLine) {
      passed++;
    } else {
      console.error(`FAIL ${name}: expected match=${shouldMatch}, got match=${got}`
        + (spansLine ? ' (match spans a line break)' : ''));
      failed++;
    }
  }

  // -------------------------------------------------------------------------
  // env_secret used to require at least one character before the trigger word,
  // so the commonest forms in a real .env file were silently missed: `PASSWORD=`,
  // `API_KEY=`, `TOKEN=`, `SECRET=` all failed while `DB_PASSWORD=` matched.
  // The pattern's own fakeValue was itself undetectable.
  // -------------------------------------------------------------------------
  const envSecretCases = [
    ['API_KEY=sk-fake1234567890', true],
    ['PASSWORD=hunter2', true],
    ['TOKEN=abc123xyz789', true],
    ['SECRET=s3cr3tvalue', true],
    ['ACCESS_KEY=AKIA123456', true],
    ['PRIVATE_KEY=abcdef', true],
    ['CREDENTIAL=zzz', true],
    ['DSN=postgres-dsn-value', true],
    ['password: hunter2', true],
    ['api_key = "abcdef"', true],
    ['MY_API_KEY=sk-fake1234567890', true],
    ['DB_PASSWORD=hunter2', true],
    // must NOT fire
    ['LOG_LEVEL=info', false],
    ['REGION=me-central-1', false],
    ['PASSWORDLESS_MODE', false],
    ['# PASSWORD is required', false],
    ['TOKENIZER=bpe', false],
    ['HF_TOKENIZER=gpt2', false],
  ];
  for (const [text, shouldMatch] of envSecretCases) {
    const { findings } = maskText(text, { enabled: ['env_secret'] });
    if ((findings.length > 0) === shouldMatch) {
      passed++;
    } else {
      console.error(`FAIL env_secret ${JSON.stringify(text)}: expected match=${shouldMatch}, got ${findings.length}`);
      failed++;
    }
  }

  // `--mode fake` substitutes values from `fakeValues`. Those substitutions must
  // remain DETECTABLE by the full detector, because that is exactly what a
  // re-scan (and the Guardian's verifier) relies on: a fake that no pattern
  // recognises makes a still-sensitive-looking file report as clean.
  //
  // Four fakes used to be 18 characters where their own pattern demanded 20+,
  // so `--mode fake` on an Anthropic/HuggingFace/Stripe/Bearer credential
  // produced a key-shaped string that scanned clean.
  const FAKE_EXEMPT = {
    // A PEM body is deliberately inert -- the whole point is that it is no longer a key.
    ssh_key: 'redaction is intentional',
    // The match includes the surrounding SQL clause; the fake is only the quoted
    // value, which is correct for substitution but not self-detecting.
    sql_password: 'fake is the value only; the pattern needs its SQL context',
  };
  for (const p of PATTERNS) {
    if (!p.fakeValues || FAKE_EXEMPT[p.id]) { passed++; continue; }
    const undetectable = p.fakeValues.filter((v) => maskText(v).findings.length === 0);
    if (undetectable.length === 0) {
      passed++;
    } else {
      console.error(`FAIL ${p.id}: fakeValues undetectable by the full detector: ${JSON.stringify(undetectable)}`);
      failed++;
    }
  }

  // Masking must never destroy surrounding non-sensitive words.
  {
    const { masked } = maskText('Notes\n\nNothing interesting here.');
    if (masked.includes('Notes') && masked.includes('Nothing')) {
      passed++;
    } else {
      console.error(`FAIL masking destroyed non-sensitive prose: ${JSON.stringify(masked)}`);
      failed++;
    }
  }

  console.log(`patterns.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runPatternTests };

if (require.main === module) {
  process.exit(runPatternTests() ? 0 : 1);
}
