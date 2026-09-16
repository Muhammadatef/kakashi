/**
 * Databricks SQL Warehouse driver adapter.
 *
 * Requires the `@databricks/sql` npm package:
 *   npm install @databricks/sql
 *
 * Connection string:
 *   databricks://<pat-token>@<host>/<http-path>
 * Example:
 *   databricks://dapi1234@myworkspace.cloud.databricks.com/sql/1.0/warehouses/xxxx
 */

async function* query(conn, sql) {
  let DBSQLClient;
  try {
    ({ DBSQLClient } = require('@databricks/sql'));
  } catch (err) {
    throw new Error("Databricks driver requires the '@databricks/sql' package. Install with: npm install @databricks/sql");
  }

  const url = new URL(conn);
  const client = new DBSQLClient();
  await client.connect({
    token: decodeURIComponent(url.username || url.password || ''),
    host: url.hostname,
    path: url.pathname,
  });

  const session = await client.openSession();
  try {
    const op = await session.executeStatement(sql, { runAsync: true });
    const rows = await op.fetchAll();
    await op.close();
    for (const row of rows) {
      yield row;
    }
  } finally {
    await session.close();
    await client.close();
  }
}

module.exports = { query };
