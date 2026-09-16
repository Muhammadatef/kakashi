/**
 * SQLite driver adapter.
 *
 * Requires the `better-sqlite3` npm package:
 *   npm install better-sqlite3
 *
 * Connection string: a file path like "./local.db" or ":memory:".
 */

async function* query(conn, sql) {
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (err) {
    throw new Error("SQLite driver requires the 'better-sqlite3' package. Install with: npm install better-sqlite3");
  }

  const db = new Database(conn, { readonly: true, fileMustExist: conn !== ':memory:' });
  try {
    const rows = db.prepare(sql).all();
    for (const row of rows) {
      yield row;
    }
  } finally {
    db.close();
  }
}

module.exports = { query };
