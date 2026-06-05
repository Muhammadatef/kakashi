const assert = require('assert');
const { maskText } = require('../src/engine/masker');
const { PATTERNS } = require('../src/engine/patterns');

const cases = [
  { id: 'national_id', input: 'ID: 784-1988-1234567-0', shouldMatch: true },
  { id: 'national_id', input: 'ref: 784-1234', shouldMatch: false },
  { id: 'intl_phone', input: '+971501234567', shouldMatch: true },
  { id: 'intl_phone', input: '971501234567', shouldMatch: true },
  { id: 'intl_phone', input: '0501234567', shouldMatch: true },
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

  console.log(`patterns.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runPatternTests };

if (require.main === module) {
  process.exit(runPatternTests() ? 0 : 1);
}
