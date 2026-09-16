/**
 * PostgreSQL driver adapter.
 *
 * Requires the `pg` npm package:
 *   npm install pg
 *
 * Connection string: postgres://user:pass@host:port/db
 */

async function* query(conn, sql) {
  let Client;
  try {
    ({ Client } = require('pg'));
  } catch (err) {
    throw new Error("Postgres driver requires the 'pg' package. Install with: npm install pg");
  }

  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    const result = await client.query(sql);
    for (const row of result.rows) {
      yield row;
    }
  } finally {
    await client.end();
  }
}

module.exports = { query };
