const { sqlWithLimit } = require('./limit');

/**
 * PostgreSQL driver adapter.
 *
 * Requires the `pg` npm package:
 *   npm install pg
 *
 * Connection string: postgres://user:pass@host:port/db
 */

async function* query(conn, sql, options = {}) {
  let Client;
  try {
    ({ Client } = require('pg'));
  } catch (err) {
    throw new Error("Postgres driver requires the 'pg' package. Install with: npm install pg");
  }

  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    // client.query() resolves with the COMPLETE row set, so the cap has to be
    // in the statement -- capping afterwards would already have bought the
    // whole table into memory.
    const result = await client.query(sqlWithLimit(sql, options.limit));
    for (const row of result.rows) {
      yield row;
    }
  } finally {
    await client.end();
  }
}

module.exports = { query };
