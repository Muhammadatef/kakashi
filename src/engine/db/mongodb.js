/**
 * MongoDB driver adapter.
 *
 * Requires the `mongodb` npm package:
 *   npm install mongodb
 *
 * Connection string: mongodb://user:pass@host:port/db  OR  mongodb+srv://...
 *
 * The "query" argument here is a JSON string describing a find operation:
 *   {"collection":"customers","filter":{"country":"UAE"},"limit":100}
 * This keeps the CLI shape consistent across SQL and NoSQL drivers.
 */

async function* query(conn, jsonQuery, options = {}) {
  let MongoClient;
  try {
    ({ MongoClient } = require('mongodb'));
  } catch (err) {
    throw new Error("MongoDB driver requires the 'mongodb' package. Install with: npm install mongodb");
  }

  let spec;
  try {
    spec = JSON.parse(jsonQuery);
  } catch (err) {
    throw new Error(`MongoDB query must be JSON: {"collection":"...","filter":{...},"limit":N}. Got: ${err.message}`);
  }
  if (!spec.collection) {
    throw new Error("MongoDB query JSON must include 'collection'");
  }

  const client = new MongoClient(conn);
  await client.connect();
  try {
    const db = client.db(); // uses db from connection string
    const cursor = db.collection(spec.collection).find(spec.filter || {});
    // The query's own `limit` and the CLI's `--limit` are both caps, so the
    // smaller wins. Previously `--limit` was ignored here entirely and enforced
    // only by counting rows client-side.
    const caps = [spec.limit, options.limit].filter((n) => Number.isInteger(n) && n > 0);
    if (caps.length) cursor.limit(Math.min(...caps));
    if (spec.projection) cursor.project(spec.projection);
    for await (const doc of cursor) {
      yield doc;
    }
  } finally {
    await client.close();
  }
}

module.exports = { query };
