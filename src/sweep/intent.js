/**
 * Sweep INTENT -- which packs does this task ask for?
 *
 * Same security problem as the Guardian's TaskAnalyzer (src/guardian/task.js):
 * the task string comes from the agent being audited. A prompt-injected agent
 * (or a README in the repo it read) would use it to NARROW the audit: "skip
 * the finance folder, only scan models". So the rule here mirrors the
 * Guardian's non-weakening rule:
 *
 *   The task may only ADD packs. The floor (pii_flow_audit) is always present,
 *   and nothing in a task string can remove a pack, a file, a selector or a
 *   language from coverage.
 *
 * There is deliberately no vocabulary for exclusion. Words like "skip", "only",
 * "ignore" are recognised solely so the run can say it IGNORED them
 * (TASK_NARROWING_IGNORED) -- the coverage is unchanged either way.
 * `assertTaskNonWeakening()` is the property as code; the test suite runs it
 * over every combination of intents and adversarial task strings.
 *
 * Deterministic keyword matching, English and Arabic, no model, no network.
 * An unrecognised task changes nothing: the floor runs, TASK_NOT_RECOGNISED.
 */

const { sanitizeTask } = require('../guardian/task');

const FLOOR_PACK = 'pii_flow_audit';
const FLOOR = Object.freeze([FLOOR_PACK]);

/** intent id → { pack, keywords }. Each intent maps to exactly one pack. */
const INTENTS = {
  pii_flow_audit: {
    id: 'pii_flow_audit',
    pack: 'pii_flow_audit',
    label: 'PII / personal-data flow audit',
    keywords: [
      'pii', 'personal', 'privacy', 'pdpl', 'gdpr', 'hipaa', 'lineage', 'flow', 'flows',
      'customer', 'customers', 'sensitive', 'compliance', 'dpia', 'audit',
      'شخصية', 'الشخصية', 'خصوصية', 'الخصوصية', 'حساسة', 'الحساسة', 'امتثال', 'الامتثال', 'تدقيق',
    ],
  },
  external_export_audit: {
    id: 'external_export_audit',
    pack: 'external_export_audit',
    label: 'External export / egress audit',
    keywords: [
      'export', 'exports', 'exported', 'exporting', 'egress', 'upload', 'uploads', 'exfiltration',
      'external', 'third', 'vendor', 'vendors', 's3', 'gcs', 'sftp', 'webhook', 'webhooks',
      'transfer', 'transfers', 'share', 'sharing', 'outbound', 'leaves',
      'تصدير', 'التصدير', 'خارجي', 'الخارجي', 'خارجية', 'رفع', 'نقل', 'مشاركة', 'طرف', 'ثالث',
    ],
  },
  logging_leak_audit: {
    id: 'logging_leak_audit',
    pack: 'logging_leak_audit',
    label: 'Logging leak audit',
    keywords: [
      'log', 'logs', 'logging', 'logger', 'print', 'prints', 'stdout', 'stderr', 'console',
      'leak', 'leaks', 'leaking', 'leakage', 'telemetry', 'trace', 'traces',
      'سجل', 'السجل', 'سجلات', 'السجلات', 'تسريب', 'التسريب', 'تسرب',
    ],
  },
  schema_change_impact: {
    id: 'schema_change_impact',
    pack: 'schema_change_impact',
    label: 'Schema change impact (stub)',
    keywords: [
      'schema', 'column', 'columns', 'rename', 'renaming', 'drop', 'dropping', 'alter',
      'migration', 'migrate', 'impact', 'breaking', 'deprecate',
      'مخطط', 'المخطط', 'عمود', 'العمود', 'أعمدة', 'الأعمدة', 'ترحيل', 'تأثير', 'أثر',
    ],
  },
};

/** Narrowing words: recognised only to report that they were ignored. */
const NARROWING = [
  'skip', 'skipping', 'only', 'ignore', 'ignoring', 'exclude', 'excluding', 'except', 'without',
  'omit', 'just', 'limit', 'restrict', 'not',
  'تجاهل', 'استثناء', 'باستثناء', 'فقط', 'تخطي', 'بدون', 'عدا', 'ما عدا',
];

/** Split into word tokens across scripts; Arabic tokens also yield prefix-stripped forms. */
function tokenize(text) {
  const out = new Set();
  for (const w of text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    out.add(w);
    // و / ب / ل / ف + ال prefixes: "والسجلات" → "السجلات" → "سجلات"
    const m = /^(?:[وفبل])?(?:ال)?(.{2,})$/u.exec(w);
    if (m && /\p{Script=Arabic}/u.test(w)) {
      out.add(m[1]);
      if (/^[وفبل]/u.test(w)) out.add(w.slice(1));
    }
  }
  return out;
}

/**
 * Packs for a set of intent ids: the floor plus each intent's pack. Sorted,
 * deduplicated. Unknown ids are ignored -- they can add nothing and remove nothing.
 * @param {string[]} intentIds
 * @returns {string[]}
 */
function packsForIntents(intentIds) {
  const set = new Set(FLOOR);
  for (const id of intentIds || []) if (INTENTS[id]) set.add(INTENTS[id].pack);
  return [...set].sort();
}

/**
 * @param {string|null} rawTask
 * @returns {{ task: string|null, intents: string[], packs: string[], recognised: boolean,
 *             matchedKeywords: Object<string,string[]>, notes: string[] }}
 */
function analyzeSweepTask(rawTask) {
  const task = sanitizeTask(rawTask);
  const notes = [];
  if (!task) {
    notes.push('TASK_NOT_STATED');
    return Object.freeze({ task: null, intents: [], packs: packsForIntents([]), recognised: false, matchedKeywords: {}, notes });
  }
  const words = tokenize(task);
  const lower = task.toLowerCase();
  const intents = [];
  const matchedKeywords = {};
  for (const intent of Object.values(INTENTS)) {
    const hits = intent.keywords.filter((k) => words.has(k.toLowerCase()));
    if (hits.length) { intents.push(intent.id); matchedKeywords[intent.id] = hits; }
  }
  intents.sort();
  const recognised = intents.length > 0;
  if (!recognised) notes.push('TASK_NOT_RECOGNISED');
  if (intents.includes('schema_change_impact')) notes.push('SCHEMA_CHANGE_IMPACT_STUB');
  if (NARROWING.some((w) => (w.includes(' ') ? lower.includes(w) : words.has(w)))) notes.push('TASK_NARROWING_IGNORED');
  return Object.freeze({ task, intents, packs: packsForIntents(intents), recognised, matchedKeywords, notes });
}

/**
 * The intent rule as executable code: packs ⊇ floor.
 * @param {string[]} packs  packs a task analysis selected
 * @param {string[]} [floor=FLOOR]
 * @returns {{ ok: boolean, missing: string[] }}
 */
function assertTaskNonWeakening(packs, floor = FLOOR) {
  const have = new Set(packs || []);
  const missing = floor.filter((p) => !have.has(p));
  return { ok: missing.length === 0, missing };
}

module.exports = {
  analyzeSweepTask,
  assertTaskNonWeakening,
  packsForIntents,
  INTENTS,
  NARROWING,
  FLOOR,
  FLOOR_PACK,
};
