const { sqlWithLimit } = require('./limit');

/**
 * MySQL / MariaDB driver adapter.
 *
 * Requires the `mysql2` npm package:
 *   npm install mysql2
 *
 * Connection string: mysql://user:pass@host:port/db
 */

async function* query(conn, sql, options = {}) {
  let mysql;
  try {
    mysql = require('mysql2/promise');
  } catch (err) {
    throw new Error("MySQL driver requires the 'mysql2' package. Install with: npm install mysql2");
  }

  const connection = await mysql.createConnection(conn);
  try {
    const [rows] = await connection.execute(sqlWithLimit(sql, options.limit));
    for (const row of rows) {
      yield row;
    }
  } finally {
    await connection.end();
  }
}

module.exports = { query };
