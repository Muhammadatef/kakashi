/**
 * Optional parser dependencies -- lazily required, never mandatory.
 *
 * Same UX as engine/db/index.js: if a parser is missing we say exactly what to
 * `npm install`, and Sweep keeps going with its regex fallback. Every
 * degradation is recorded so the report can state it; a silent downgrade would
 * make a weaker run look identical to a full one.
 */

const OPTIONAL = {
  'node-sql-parser': { purpose: 'SQL column/clause analysis (sql_column selectors)', install: 'npm install node-sql-parser' },
  'web-tree-sitter': { purpose: 'Python AST analysis (ast selectors)', install: 'npm install web-tree-sitter tree-sitter-python' },
  'tree-sitter-python': { purpose: 'Python grammar for web-tree-sitter (ast selectors)', install: 'npm install web-tree-sitter tree-sitter-python' },
};

class OptionalRegistry {
  constructor({ disabled = [] } = {}) {
    this.disabled = new Set(disabled); // tests force the fallback path with this
    this.cache = new Map();
    this.degradations = new Map(); // module id -> { module, purpose, install }
  }

  /**
   * @param {string} id module id from OPTIONAL
   * @returns {any|null} the module, or null when unavailable (degradation recorded)
   */
  load(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    let mod = null;
    if (!this.disabled.has(id)) {
      try {
        // eslint-disable-next-line global-require, import/no-dynamic-require
        mod = require(id);
      } catch (_) {
        mod = null;
      }
    }
    if (!mod) this.degradations.set(id, { module: id, ...OPTIONAL[id] });
    this.cache.set(id, mod);
    return mod;
  }

  /** Resolve a module's on-disk path (for WASM grammars), or null. */
  resolve(id, subpath = '') {
    if (this.disabled.has(id)) return null;
    try {
      return require.resolve(subpath ? `${id}/${subpath}` : id);
    } catch (_) {
      return null;
    }
  }

  /**
   * Record that a module loaded but could not be initialised (bad WASM,
   * incompatible version). The kind falls back to regex; this makes sure the
   * report says so instead of claiming parser-backed precision.
   */
  fail(id, reason) {
    this.degradations.set(id, { module: id, ...OPTIONAL[id], reason: String(reason || 'initialisation failed').slice(0, 200) });
  }

  /** Value-free list for reports and --json. */
  list() {
    return [...this.degradations.values()].sort((a, b) => a.module.localeCompare(b.module));
  }
}

module.exports = { OptionalRegistry, OPTIONAL };
