/**
 * Snowflake driver adapter.
 *
 * Requires the `snowflake-sdk` npm package:
 *   npm install snowflake-sdk
 *
 * Connection string:
 *   snowflake://user:pass@account.region.snowflakecomputing.com/db/schema?warehouse=WH
 */

async function* query(conn, sql) {
  let snowflake;
  try {
    snowflake = require('snowflake-sdk');
  } catch (err) {
    throw new Error("Snowflake driver requires the 'snowflake-sdk' package. Install with: npm install snowflake-sdk");
  }

  const url = new URL(conn);
  const connection = snowflake.createConnection({
    account: url.hostname.split('.')[0],
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.split('/').filter(Boolean)[0],
    schema: url.pathname.split('/').filter(Boolean)[1],
    warehouse: url.searchParams.get('warehouse'),
    region: url.hostname.split('.').slice(1, -2).join('.'),
  });

  await new Promise((resolve, reject) => {
    connection.connect((err) => (err ? reject(err) : resolve()));
  });

  const rows = await new Promise((resolve, reject) => {
    connection.execute({
      sqlText: sql,
      complete: (err, stmt, result) => (err ? reject(err) : resolve(result)),
    });
  });

  try {
    for (const row of rows) {
      yield row;
    }
  } finally {
    connection.destroy(() => {});
  }
}

module.exports = { query };
