/**
 * Database masking — router + driver dispatcher.
 *
 * Kakashi's DB masking is 100% client-side. We connect to the database from
 * the user's machine, stream query results locally, run each row through
 * the same maskText() pipeline used for files, and write a masked-copy CSV
 * or JSON on disk. No hosted service, no proxy, no cloud. This preserves
 * Kakashi's "nothing leaves your machine" guarantee even when the source
 * data lives in a remote database.
 *
 * Driver loading strategy:
 *   Each per-driver adapter (`./postgres`, `./mysql`, ...) uses a LAZY
 *   `require()` of its underlying npm client (e.g. `pg`, `mysql2`). If the
 *   client isn't installed on the user's machine, we throw a friendly error
 *   telling them exactly what to `npm install`. This keeps Kakashi's base
 *   dependency footprint small — you only pay for what you use.
 */

const { maskText } = require('../masker');

const DRIVERS = {
  postgres:   () => require('./postgres'),
  postgresql: () => require('./postgres'),
  mysql:      () => require('./mysql'),
  mysql2:     () => require('./mysql'),
  mongodb:    () => require('./mongodb'),
  'mongodb+srv': () => require('./mongodb'),
  snowflake:  () => require('./snowflake'),
  databricks: () => require('./databricks'),
  sqlite:     () => require('./sqlite'),
  sqlite3:    () => require('./sqlite'),
  // In-memory mock adapter — used by tests to exercise the full pipeline
  // without any real database installed.
  mock:       () => require('./mock'),
};

/**
 * Infer the driver id from a connection string.
 * Accepts URI-style ("postgres://..."), JDBC-style ("jdbc:mysql://..."),
 * and file paths (assumed to be sqlite).
 * @param {string} conn
 * @returns {string} — driver id from DRIVERS
 */
function inferDriver(conn) {
  if (!conn || typeof conn !== 'string') {
    throw new Error('Connection string is required');
  }
  const trimmed = conn.trim();

  // JDBC style
  const jdbc = trimmed.match(/^jdbc:([a-z0-9]+):/i);
  if (jdbc) return jdbc[1].toLowerCase();

  // URI style
  const uri = trimmed.match(/^([a-z0-9+]+):\/\//i);
  if (uri) return uri[1].toLowerCase();

  // File path -> sqlite
  if (/\.(db|sqlite|sqlite3)$/i.test(trimmed) || trimmed === ':memory:') {
    return 'sqlite';
  }

  // Explicit mock (for tests)
  if (trimmed.startsWith('mock:')) return 'mock';

  throw new Error(`Could not infer driver from connection string: "${trimmed.slice(0, 40)}..."`);
}

/**
 * Load a driver by id.
 * @param {string} id
 */
function loadDriver(id) {
  const factory = DRIVERS[id];
  if (!factory) {
    throw new Error(`Unsupported database driver: "${id}". Supported: ${Object.keys(DRIVERS).sort().join(', ')}`);
  }
  try {
    return factory();
  } catch (err) {
    // Re-throw with a clearer message when the underlying client is missing.
    if (err && err.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        `Driver "${id}" needs its client library installed. See src/engine/db/${id}.js for the exact npm command.\n` +
        `Original error: ${err.message}`,
      );
    }
    throw err;
  }
}

/**
 * Run a query, mask every row locally, and yield masked rows one at a time.
 * @param {string} conn — connection string
 * @param {string} query — SQL / mongo query
 * @param {object} options
 * @param {object} options.maskOpts — passed to maskText
 * @param {string} [options.driver] — explicit driver override
 * @param {number} [options.limit] — safety cap on row count (default 10000)
 * @returns {AsyncGenerator<{ row: object, masked: object, findings: object[] }>}
 */
async function* streamMasked(conn, query, options = {}) {
  const driverId = options.driver || inferDriver(conn);
  const driver = loadDriver(driverId);
  const { maskOpts = {}, limit = 10000 } = options;

  // Token state is shared across EVERY row of this result set. maskText()
  // defaults these to fresh objects per call, which for a row-by-row stream
  // would restart numbering at `_1` on each row -- so five distinct customers
  // all masked to [FULL_NAME_1] and `--mode fake` gave every row the same
  // synthetic person. Threading one map through the whole stream keeps tokens
  // stable (same value -> same token) and distinct (different value ->
  // different token), which is what makes masked rows still analysable.
  const valueMap = {};
  const counters = {};

  let count = 0;
  for await (const row of driver.query(conn, query, options)) {
    if (count >= limit) break;
    count++;
    // Serialise the row so text-based patterns can match values regardless
    // of the DB's typed representation (e.g. UUID, Date, numeric).
    const serialised = JSON.stringify(row, null, 2);
    const { masked, findings } = maskText(serialised, { ...maskOpts, valueMap, counters });
    let maskedRow;
    try {
      maskedRow = JSON.parse(masked);
    } catch {
      // Masking may replace a value inside a JSON-string context in a way
      // that keeps it valid JSON, but a token like [SSN_1] can technically
      // include characters that break JSON. Fall back to string mode so we
      // still write SOMETHING masked to disk rather than silently losing data.
      maskedRow = { __masked_raw__: masked };
    }
    yield { row, masked: maskedRow, findings };
  }
}

/**
 * Aggregate stream results into a summary — used by db-scan.
 * @param {AsyncGenerator} stream — from streamMasked
 * @returns {Promise<{ rows: number, findings: object[], byCategory: object }>}
 */
async function aggregate(stream) {
  const findings = [];
  let rows = 0;
  for await (const item of stream) {
    rows++;
    findings.push(...item.findings);
  }
  const byCategory = { id: 0, pii: 0, cred: 0 };
  for (const f of findings) {
    if (byCategory[f.cat] != null) byCategory[f.cat]++;
  }
  return { rows, findings, byCategory };
}

module.exports = {
  inferDriver,
  loadDriver,
  streamMasked,
  aggregate,
  DRIVERS,
};
