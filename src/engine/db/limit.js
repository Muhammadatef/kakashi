/**
 * Row-cap pushdown for the SQL drivers.
 *
 * `--limit` used to be enforced only in `streamMasked`, by counting rows as they
 * came back and breaking out of the loop. That is a cap on how much Kakashi
 * MASKS, not on how much the database SENDS -- and the two SQL drivers that
 * matter most buffer the whole result set before yielding anything
 * (`pg`'s `client.query()` and `snowflake-sdk`'s `execute()` both resolve with a
 * complete row array). Pointing `db-mask` at a production table therefore pulled
 * the entire table into Node's heap before a `--limit 100` had any effect, which
 * is an out-of-memory risk dressed up as a streaming API.
 *
 * Wrapping the caller's statement in a derived table puts the cap where it
 * belongs: the server stops producing rows. The alias is required -- MySQL and
 * Postgres both reject an unaliased derived table -- and the trailing semicolon
 * has to go, or the wrap produces a syntax error.
 *
 * This is deliberately a plain textual wrap rather than a parser. It holds for
 * the `SELECT` and `WITH … SELECT` statements `db-scan` / `db-mask` exist to
 * run, on every SQL engine Kakashi drives (Postgres, MySQL, SQLite, Snowflake,
 * Databricks). It does NOT hold for statements that cannot appear in a
 * subquery, such as `SHOW TABLES`, `EXPLAIN` or a CALL -- those now surface a
 * database syntax error instead of silently reading everything. The row-count
 * break in `streamMasked` stays as a second line of defence for the drivers
 * that genuinely stream (mongodb, sqlite) and for anything a future driver does
 * differently.
 */

const ALIAS = 'kakashi_limited';

/**
 * @param {string} sql - the caller's statement
 * @param {number} [limit] - maximum rows; omitted/invalid leaves `sql` untouched
 * @returns {string}
 */
function sqlWithLimit(sql, limit) {
  if (!Number.isInteger(limit) || limit <= 0) return sql;
  const trimmed = String(sql).trim().replace(/;\s*$/, '');
  if (!trimmed) return sql;
  return `SELECT * FROM (${trimmed}) AS ${ALIAS} LIMIT ${limit}`;
}

module.exports = { sqlWithLimit, ALIAS };
