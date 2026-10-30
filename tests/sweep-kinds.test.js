/**
 * Sweep selector kinds: sql_column, dbt_graph, ast.
 *
 * Every test runs with the optional parsers DISABLED (and they are not
 * installed in CI anyway), because the regex/lexical fallback is the path that
 * has to be complete on its own. Checks cover each context / matcher with a
 * positive and a negative case, Jinja stripping that keeps line numbers,
 * notebook line mapping, and dbt lineage from both schema.yml and a manifest.
 */

const assert = require('assert');

const sqlColumn = require('../src/sweep/selectors/kinds/sql_column');
const dbtGraph = require('../src/sweep/selectors/kinds/dbt_graph');
const ast = require('../src/sweep/selectors/kinds/ast');
const { stripJinja, loadDbtProject } = require('../src/sweep/dbt');
const { OptionalRegistry } = require('../src/sweep/optional');
const { languageOf } = require('../src/sweep/selectors/schema');

function runSweepKindsTests() {
  let passed = 0;
  let failed = 0;
  function check(name, fn) {
    try {
      fn();
      passed++;
    } catch (err) {
      console.error(`FAIL ${name}: ${err.message}`);
      failed++;
    }
  }

  const optional = new OptionalRegistry({ disabled: ['node-sql-parser', 'web-tree-sitter', 'tree-sitter-python'] });
  const ctx = { optional, project: { root: '', dbt: null } };
  const file = (rel, text) => ({ rel, ext: rel.split('.').pop(), lang: languageOf(rel), text, valueFindings: [] });
  const sel = (kind, query) => ({ id: `t.${kind}`, kind, query });
  const run = (mod, query, rel, text) => mod.match(sel(mod.kind, query), file(rel, text), ctx);
  const lines = (spans) => spans.map((s) => s.startLine);
  const evs = (spans) => spans.map((s) => s.evidence_kind);

  // ------------------------------------------------------------------ sql_column
  const COLS = ['email', 'phone*', '*_phone', 'national_id'];
  const sq = (contexts, extra = {}) => ({ columns: COLS, contexts, ...extra });

  check('sql_column validateQuery', () => {
    assert.deepStrictEqual(sqlColumn.validateQuery({ columns: ['email'] }), []);
    assert.ok(sqlColumn.validateQuery({}).length);
    assert.ok(sqlColumn.validateQuery({ columns: ['email'], contexts: ['nope'] }).length);
    assert.ok(sqlColumn.validateQuery({ columns: ['email'], contexts: ['select_star'] }).length);
  });

  check('sql_column select: plain, qualified, glob; alias does not count', () => {
    const t = 'select\n  c.email,\n  mobile_phone,\n  name as email\nfrom customers c';
    const r = run(sqlColumn, sq(['select']), 'q.sql', t);
    assert.deepStrictEqual(lines(r), [2, 3]);
    assert.deepStrictEqual(evs(r), ['read', 'read']);
    assert.deepStrictEqual(run(sqlColumn, sq(['select']), 'q.sql', 'select id, x email from t'), []);
    assert.deepStrictEqual(run(sqlColumn, sq(['select']), 'q.sql', 'select count(*) from orders'), []);
    assert.deepStrictEqual(run(sqlColumn, sq(['select']), 'q.sql', "select 'email' as label -- email\nfrom t"), []);
  });

  check('sql_column where / join contexts and evidence', () => {
    const t = 'select o.id\nfrom orders o\njoin customers c on c.email = o.email\nwhere c.phone is not null';
    assert.deepStrictEqual(lines(run(sqlColumn, sq(['join']), 'q.sql', t)), [3]);
    assert.deepStrictEqual(evs(run(sqlColumn, sq(['join']), 'q.sql', t)), ['join']);
    assert.deepStrictEqual(lines(run(sqlColumn, sq(['where']), 'q.sql', t)), [4]);
    assert.deepStrictEqual(run(sqlColumn, sq(['select']), 'q.sql', t), []);
    assert.deepStrictEqual(run(sqlColumn, sq(['join', 'where']), 'q.sql', 'select id from t where status = 1'), []);
  });

  check('sql_column copy / unload (incl. SQL inside UNLOAD string)', () => {
    const copy = "copy (select email from customers) to '/tmp/x.csv' with csv;";
    assert.deepStrictEqual(evs(run(sqlColumn, sq(['copy']), 'q.sql', copy)), ['export']);
    assert.deepStrictEqual(run(sqlColumn, sq(['select']), 'q.sql', copy), []);
    const unload = "unload ('select id,\n  email from customers')\nto 's3://bucket/x' iam_role 'r';";
    const r = run(sqlColumn, sq(['unload']), 'q.sql', unload);
    assert.deepStrictEqual(lines(r), [2]);
    assert.deepStrictEqual(evs(r), ['export']);
    assert.deepStrictEqual(run(sqlColumn, sq(['unload']), 'q.sql', "unload ('select id from orders') to 's3://b'"), []);
  });

  check('sql_column insert_select / ctas → transform', () => {
    const ins = 'insert into mart.contacts (email)\nselect email from customers;';
    const r = run(sqlColumn, sq(['insert_select']), 'q.sql', ins);
    assert.deepStrictEqual(lines(r), [2]);
    assert.deepStrictEqual(evs(r), ['transform']);
    const ctas = 'create table x as\nselect phone_number from customers';
    assert.deepStrictEqual(lines(run(sqlColumn, sq(['ctas']), 'q.sql', ctas)), [2]);
    assert.deepStrictEqual(run(sqlColumn, sq(['ctas']), 'q.sql', 'create table x as select id from customers'), []);
    assert.deepStrictEqual(run(sqlColumn, sq(['insert_select']), 'q.sql', ctas), []);
  });

  check('sql_column select_star only on pii_tables', () => {
    const q = sq(['select_star'], { pii_tables: ['customers', 'raw_*'] });
    assert.deepStrictEqual(lines(run(sqlColumn, q, 'q.sql', 'select *\nfrom analytics.customers')), [1]);
    assert.deepStrictEqual(lines(run(sqlColumn, q, 'q.sql', 'select c.* from raw_users c')), [1]);
    assert.deepStrictEqual(run(sqlColumn, q, 'q.sql', 'select * from orders'), []);
    assert.deepStrictEqual(run(sqlColumn, q, 'q.sql', 'select count(*) from customers'), []);
  });

  check('stripJinja resolves ref/source and preserves line count', () => {
    const src = "{{ config(\n  materialized='table'\n) }}\n{% set x = 1 %}\nselect email\nfrom {{ ref('stg_customers') }}\njoin {{ source('raw', 'users') }} u on 1=1\n{# a\ncomment #}";
    const out = stripJinja(src);
    assert.strictEqual(out.split('\n').length, src.split('\n').length);
    assert.ok(/from stg_customers\s*$/m.test(out));
    assert.ok(/join raw\.users\s+u on/.test(out));
    assert.ok(!/config|materialized|set x|comment/.test(out));
    const r = run(sqlColumn, sq(['select']), 'models/m.sql', src);
    assert.deepStrictEqual(lines(r), [5]);
  });

  check('sql_column in Python strings and notebooks; bare python is ignored', () => {
    const py = 'import pandas as pd\n\ndf = pd.read_sql("""\n  select email\n  from customers\n""", conn)\nemail = 1\n';
    assert.deepStrictEqual(lines(run(sqlColumn, sq(), 'etl.py', py)), [4]);
    assert.deepStrictEqual(run(sqlColumn, sq(), 'etl.py', 'cur.execute("select id from orders")\nemail = 2\n'), []);
    const nb = JSON.stringify({ cells: [
      { cell_type: 'markdown', source: ['# select email from x'] },
      { cell_type: 'code', source: ['x = 1\n', "spark.sql('select phone from customers')"] },
    ] }, null, 1);
    const r = run(sqlColumn, sq(), 'n.ipynb', nb);
    assert.strictEqual(r.length, 1);
    assert.ok(nb.split('\n')[r[0].startLine - 1].includes('spark.sql'));
  });

  check('sql_column fallback recorded as degradation, never throws', () => {
    const reg = new OptionalRegistry({ disabled: ['node-sql-parser'] });
    const r = sqlColumn.match(sel('sql_column', sq()), file('a.sql', 'select email from t'), { optional: reg, project: {} });
    assert.strictEqual(r.length, 1);
    assert.ok(reg.list().some((d) => d.module === 'node-sql-parser'));
  });

  // ------------------------------------------------------------------ dbt_graph
  const SCHEMA = [
    'version: 2',
    'sources:',
    '  - name: raw',
    '    tables:',
    '      - name: orders',
    '      - name: customers',
    '        tags: [pii]',
    '        columns:',
    '          - name: email',
  ].join('\n');
  const EXPOSURES = [
    'version: 2',
    'exposures:',
    '  - name: churn_dashboard',
    '    type: dashboard',
    '    depends_on:',
    "      - ref('mart_customers')",
    '  - name: orders_dashboard',
    '    type: dashboard',
    '    depends_on:',
    "      - ref('stg_orders')",
  ].join('\n');
  const PROJECT = {
    'dbt_project.yml': "name: shop\nmodel-paths: ['models']\n",
    'models/sources.yml': SCHEMA,
    'models/staging/stg_customers.sql': "-- staging\nselect id, email\nfrom {{ source('raw', 'customers') }}\n",
    'models/staging/stg_orders.sql': "select * from {{ source('raw', 'orders') }}\n",
    'models/marts/mart_customers.sql': "{{ config(materialized='table') }}\nselect *\nfrom {{ ref('stg_customers') }}\n",
    'models/exposures.yml': EXPOSURES,
  };
  const fixture = (target, files = PROJECT) => dbtGraph.loadFixture(JSON.stringify({ files, target }), optional);
  const dq = { source_tags: ['pii'], meta_keys: ['pii', 'contains_pii'] };
  const dmatch = (target, q = dq, files = PROJECT) => {
    const { file: f, ctx: c } = fixture(target, files);
    return dbtGraph.match(sel('dbt_graph', q), f, c);
  };

  check('dbt_graph validateQuery', () => {
    assert.deepStrictEqual(dbtGraph.validateQuery(dq), []);
    assert.ok(dbtGraph.validateQuery({}).length);
    assert.ok(dbtGraph.validateQuery({ source_tags: ['pii'], emit: ['table'] }).length);
  });

  check('dbt static graph: source → staging → mart → exposure', () => {
    const src = dmatch('models/sources.yml');
    assert.deepStrictEqual(src, [{ startLine: 6, endLine: 6, evidence_kind: 'read' }]);
    assert.deepStrictEqual(dmatch('models/staging/stg_customers.sql'), [{ startLine: 3, endLine: 3, evidence_kind: 'transform' }]);
    assert.deepStrictEqual(dmatch('models/marts/mart_customers.sql'), [{ startLine: 3, endLine: 3, evidence_kind: 'transform' }]);
    assert.deepStrictEqual(dmatch('models/exposures.yml'), [{ startLine: 3, endLine: 3, evidence_kind: 'expose' }]);
    assert.deepStrictEqual(dmatch('models/staging/stg_orders.sql'), []);
  });

  check('dbt_graph emit filter, meta_keys, untagged project', () => {
    assert.deepStrictEqual(dmatch('models/exposures.yml', { ...dq, emit: ['model'] }), []);
    assert.deepStrictEqual(dmatch('models/marts/mart_customers.sql', { ...dq, emit: ['exposure'] }), []);
    const metaSchema = SCHEMA.replace('        tags: [pii]\n', '').replace('          - name: email', '          - name: email\n            meta:\n              contains_pii: true');
    const files = { ...PROJECT, 'models/sources.yml': metaSchema };
    assert.strictEqual(dmatch('models/marts/mart_customers.sql', dq, files).length, 1);
    const clean = { ...PROJECT, 'models/sources.yml': SCHEMA.replace('        tags: [pii]\n', '') };
    assert.deepStrictEqual(dmatch('models/marts/mart_customers.sql', dq, clean), []);
    assert.deepStrictEqual(dmatch('models/exposures.yml', dq, clean), []);
  });

  check('dbt broken yml is recorded in errors, not thrown', () => {
    const files = { ...PROJECT, 'models/bad.yml': 'models:\n  - name: x\n    meta: &a {}\n' };
    const { ctx: c } = fixture('models/bad.yml', files);
    assert.strictEqual(c.project.dbt.errors.length, 1);
    assert.strictEqual(c.project.dbt.manifestUsed, false);
  });

  check('dbt manifest.json path', () => {
    const manifest = {
      nodes: {
        'model.shop.stg_customers': { resource_type: 'model', name: 'stg_customers', original_file_path: 'models/stg_customers.sql', depends_on: { nodes: ['source.shop.raw.customers'] } },
        'model.shop.mart': { resource_type: 'model', name: 'mart', original_file_path: 'models/mart.sql', depends_on: { nodes: ['model.shop.stg_customers'] } },
        'model.shop.other': { resource_type: 'model', name: 'other', original_file_path: 'models/other.sql', depends_on: { nodes: [] } },
      },
      sources: {
        'source.shop.raw.customers': { source_name: 'raw', name: 'customers', original_file_path: 'models/src.yml', tags: [], columns: { email: { name: 'email', tags: [], meta: { pii: true } } } },
      },
      exposures: {
        'exposure.shop.dash': { name: 'dash', original_file_path: 'models/exp.yml', depends_on: { nodes: ['model.shop.mart'] } },
      },
    };
    const files = {
      'dbt_project.yml': 'name: shop\n',
      'target/manifest.json': JSON.stringify(manifest),
      'models/src.yml': 'sources:\n  - name: raw\n    tables:\n      - name: customers\n',
      'models/stg_customers.sql': 'select 1', // no ref(): lineage comes from the manifest only
      'models/mart.sql': "\nselect * from {{ ref('stg_customers') }}",
      'models/other.sql': 'select 1',
      'models/exp.yml': 'exposures:\n  - name: dash\n',
    };
    assert.strictEqual(fixture('models/mart.sql', files).ctx.project.dbt.manifestUsed, true);
    assert.deepStrictEqual(dmatch('models/stg_customers.sql', dq, files), [{ startLine: 1, endLine: 1, evidence_kind: 'transform' }]);
    assert.deepStrictEqual(dmatch('models/mart.sql', dq, files), [{ startLine: 2, endLine: 2, evidence_kind: 'transform' }]);
    assert.deepStrictEqual(dmatch('models/exp.yml', dq, files), [{ startLine: 2, endLine: 2, evidence_kind: 'expose' }]);
    assert.deepStrictEqual(dmatch('models/src.yml', dq, files), [{ startLine: 4, endLine: 4, evidence_kind: 'read' }]);
    assert.deepStrictEqual(dmatch('models/other.sql', dq, files), []);
  });

  check('loadDbtProject returns null outside dbt; dbt_graph no-ops without ctx.project.dbt', () => {
    assert.strictEqual(loadDbtProject('', ['a.sql'], () => 'select 1'), null);
    assert.deepStrictEqual(dbtGraph.match(sel('dbt_graph', dq), file('a.sql', 'select 1'), ctx), []);
  });

  // ------------------------------------------------------------------ ast
  const A = (matcher, text, rel = 'job.py', callees) => run(ast, { matcher, ...(callees ? { callees } : {}) }, rel, text);

  check('ast validateQuery', () => {
    assert.deepStrictEqual(ast.validateQuery({ matcher: 'log_call' }), []);
    assert.ok(ast.validateQuery({ matcher: 'nope' }).length);
    assert.ok(ast.validateQuery({ matcher: 'log_call', callees: ['a b'] }).length);
  });

  check('ast log_call: records match, plain strings and counts do not', () => {
    const pos = 'import logging\nlogger.info("rows: %s", df.head())\nprint(customer)\nlogging.debug(f"user={user_record}")\nlog.error(\n  "x",\n  payload)\n';
    const r = A('log_call', pos);
    assert.deepStrictEqual(r.map((s) => [s.startLine, s.endLine]), [[2, 2], [3, 3], [4, 4], [5, 7]]);
    assert.deepStrictEqual([...new Set(evs(r))], ['log']);
    const neg = 'logger.info("loaded customer data ok")\nprint("df written")\nlogger.info("%d rows", n_rows)\n# logger.info(df)\nx = "print(df)"\n';
    assert.deepStrictEqual(A('log_call', neg), []);
    assert.deepStrictEqual(lines(A('log_call', 'audit.emit(df)\n', 'job.py', ['audit.emit'])), [1]);
  });

  check('ast df_write', () => {
    assert.deepStrictEqual(lines(A('df_write', 'df.to_csv("out.csv")\ndf.write.mode("overwrite")\\\n  .parquet("s3://x")\nsdf.write.saveAsTable("t")\n')), [1, 2, 4]);
    assert.deepStrictEqual(A('df_write', 'df = pd.read_csv("in.csv")\nwriter = 1\n'), []);
  });

  check('ast http_send', () => {
    assert.deepStrictEqual(lines(A('http_send', 'requests.post(url, json=rows)\nhttpx.put(u)\nrequests.request("POST", u)\n')), [1, 2, 3]);
    assert.deepStrictEqual(A('http_send', 'requests.get(url)\n'), []);
  });

  check('ast cloud_upload', () => {
    assert.deepStrictEqual(lines(A('cloud_upload', 's3.put_object(Bucket=b, Body=data)\nblob.upload_from_filename(p)\nwith fs.open("s3://b/k.csv", "w") as f:\n  pass\n')), [1, 2, 3]);
    assert.deepStrictEqual(A('cloud_upload', 'with fs.open("s3://b/k.csv", "r") as f:\n  pass\ns3.get_object(Bucket=b)\n'), []);
  });

  check('ast smtp_send', () => {
    assert.deepStrictEqual(lines(A('smtp_send', 's = smtplib.SMTP(h)\ns.sendmail(a, b, msg)\ns.send_message(m)\n')), [2, 3]);
    assert.deepStrictEqual(A('smtp_send', 's = smtplib.SMTP(h)\ns.quit()\n'), []);
  });

  check('ast airflow_transfer', () => {
    const pos = 't = PostgresToGCSOperator(\n  task_id="x")\nh = S3Hook()\nh.load_file(f, key)\nsend_email(to, s, body)\n';
    assert.deepStrictEqual(lines(A('airflow_transfer', pos)), [1, 4, 5]);
    assert.deepStrictEqual(A('airflow_transfer', 't = PythonOperator(task_id="x")\nloader.load_file(f)\n'), []);
  });

  check('ast db_read', () => {
    assert.deepStrictEqual(lines(A('db_read', 'df = pd.read_sql(q, c)\nspark.sql("select 1")\nspark.read.table("t")\ncursor.execute(q)\n')), [1, 2, 3, 4]);
    assert.deepStrictEqual(evs(A('db_read', 'cur.execute(q)\n')), ['read']);
    assert.deepStrictEqual(A('db_read', 'df = pd.read_csv(p)\n'), []);
  });

  check('ast notebook line mapping', () => {
    const nb = JSON.stringify({ cells: [
      { cell_type: 'markdown', source: ['print(df)\n'] },
      { cell_type: 'code', source: ['import pandas as pd\n', 'x = 1\n', 'df.to_parquet("o")'] },
      { cell_type: 'code', source: ['requests.post(u, json=df.to_dict())'] },
    ] }, null, 1);
    const jl = nb.split('\n');
    const w = A('df_write', nb, 'n.ipynb');
    assert.strictEqual(w.length, 1);
    assert.ok(jl[w[0].startLine - 1].includes('to_parquet'));
    const h = A('http_send', nb, 'n.ipynb');
    assert.strictEqual(h.length, 1);
    assert.ok(jl[h[0].startLine - 1].includes('requests.post'));
    assert.deepStrictEqual(A('log_call', nb, 'n.ipynb'), []); // markdown cell ignored
    assert.deepStrictEqual(A('log_call', '{not json', 'n.ipynb'), []);
  });

  check('ast prepare with all parsers disabled degrades cleanly', () => {
    const reg = new OptionalRegistry({ disabled: ['node-sql-parser', 'web-tree-sitter', 'tree-sitter-python'] });
    let threw = false;
    ast.prepare({ optional: reg }).catch(() => { threw = true; });
    assert.strictEqual(threw, false);
    assert.strictEqual(ast.match(sel('ast', { matcher: 'df_write' }), file('a.py', 'df.to_csv(p)\n'), { optional: reg }).length, 1);
  });

  check('no match ever carries text', () => {
    const all = [
      ...run(sqlColumn, sq(), 'q.sql', 'select email from customers'),
      ...A('log_call', 'print(df)\n'),
      ...dmatch('models/marts/mart_customers.sql'),
    ];
    for (const s of all) assert.deepStrictEqual(Object.keys(s).sort(), ['endLine', 'evidence_kind', 'startLine']);
  });

  console.log(`sweep-kinds.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runSweepKindsTests };

if (require.main === module) {
  process.exit(runSweepKindsTests() ? 0 : 1);
}
