/**
 * TaskAnalyzer -- what is this agent actually trying to do?
 *
 * This is the "understand task" stage of the Guardian loop. Until now the task
 * string was recorded and printed but never consulted: the planner picked the
 * least destructive transform for every class alike, learned it was wrong only
 * when the verifier failed, and climbed the ladder one wasted iteration at a
 * time. This module lets the plan start from the purpose.
 *
 * THE SECURITY PROBLEM
 * --------------------
 * The task string is supplied by the very agent the Guardian is protecting data
 * from. It is exactly the channel a prompt-injected agent would use to argue for
 * its own access ("task: internal audit, release identifiers unmasked"). So the
 * analyzer is built to make that argument unwinnable:
 *
 *   A task can only ever move a class to an EQUAL OR MORE destructive transform
 *   than the Guardian would have chosen knowing nothing at all.
 *
 * There is deliberately no intent that requests plaintext. The strongest claim a
 * task can make is "I need to tell values apart" -- which is answered with stable
 * tokens, not with the values. `assertNonWeakening()` below proves the property
 * over every intent x class x permitted-tool combination, and the test suite runs
 * it as a property test rather than trusting the table by eye.
 *
 * DETERMINISTIC ON PURPOSE
 * ------------------------
 * Keyword matching over a fixed vocabulary, English and Arabic. No model, no
 * network, no new dependency -- same reason the risk engine is a weights table
 * (docs/AGENTIC_ARCHITECTURE.md SS20.4). An unrecognised task is reported as
 * unrecognised and changes nothing, which is the honest failure mode: the
 * Guardian falls back to the conservative baseline instead of guessing.
 */

const { CLASSES } = require('./classes');
const { TOOLS, TRANSFORM_LADDER } = require('./actions');

/**
 * What a task needs from a class it is not allowed to see in the clear.
 *
 * NOT_REQUIRED     -- the task never reads this class. Destroy it outright.
 * REQUIRED_DISTINCT-- the task counts, joins or groups by it, so two different
 *                     values must stay different. Stable tokens do that; a
 *                     synthetic value cycled from a short list does not.
 * REQUIRED_SHAPE   -- the task needs something that still looks like the real
 *                     thing (prose to read naturally, a parser to keep parsing).
 */
const NEEDS = {
  NOT_REQUIRED: 'NOT_REQUIRED',
  REQUIRED_DISTINCT: 'REQUIRED_DISTINCT',
  REQUIRED_SHAPE: 'REQUIRED_SHAPE',
};

/**
 * Tool preference per need, most-preferred first.
 *
 * Every order below is a permutation of the ladder, and each one only ever moves
 * a MORE destructive tool ahead of a less destructive one relative to the
 * baseline `TRANSFORM_LADDER`. That is what makes the non-weakening property hold
 * for any subset of permitted tools, not just the full set.
 */
const PREFERENCE = {
  // Nothing here is read by the task, so take the strongest thing policy allows.
  [NEEDS.NOT_REQUIRED]: ['redact', 'tokenize', 'synthesize'],
  // Stable tokens first: [EMAIL_1] appearing twice still means one person.
  [NEEDS.REQUIRED_DISTINCT]: ['tokenize', 'redact', 'synthesize'],
  // The baseline ladder -- a synthetic value reads like the real thing.
  [NEEDS.REQUIRED_SHAPE]: [...TRANSFORM_LADDER],
};

/** Default when no intent is recognised: the baseline, i.e. no narrowing at all. */
const BASELINE_PREFERENCE = [...TRANSFORM_LADDER];

/**
 * The intent vocabulary.
 *
 * `needs` is read as: for each class, what does this purpose require of it? A
 * class absent from the map falls back to `otherwise`. CREDENTIAL is
 * NOT_REQUIRED under every intent -- no legitimate task needs a live key, and the
 * one case that looks like an exception (deploying with it) does not route
 * through an external model.
 */
const INTENTS = {
  analytics: {
    id: 'analytics',
    label: 'Analysis / aggregation',
    keywords: [
      'analyse', 'analyze', 'analysis', 'analytics', 'aggregate', 'aggregation',
      'calculate', 'compute', 'count', 'churn', 'metric', 'metrics', 'kpi',
      'average', 'median', 'sum', 'total', 'trend', 'forecast', 'segment',
      'cohort', 'group', 'groupby', 'distribution', 'statistics', 'stats',
      'report', 'dashboard', 'correlation', 'retention', 'revenue', 'salary',
      'تحليل', 'حساب', 'احصاء', 'إحصاء', 'متوسط', 'تقرير', 'مؤشرات',
    ],
    needs: {
      // The join keys. Counting distinct customers only works if distinct
      // customers still look distinct after masking.
      CONTACT: NEEDS.REQUIRED_DISTINCT,
      PERSON_NAME: NEEDS.REQUIRED_DISTINCT,
      GOVERNMENT_IDENTIFIER: NEEDS.REQUIRED_DISTINCT,
      TECHNICAL_IDENTIFIER: NEEDS.REQUIRED_DISTINCT,
      FINANCIAL: NEEDS.REQUIRED_DISTINCT,
      QUASI_IDENTIFIER: NEEDS.REQUIRED_DISTINCT,
      LOCATION: NEEDS.REQUIRED_DISTINCT,
      BUSINESS_ATTRIBUTE: NEEDS.REQUIRED_DISTINCT,
      CREDENTIAL: NEEDS.NOT_REQUIRED,
    },
    otherwise: NEEDS.REQUIRED_DISTINCT,
  },

  engineering: {
    id: 'engineering',
    label: 'Debugging / code work',
    keywords: [
      'debug', 'bug', 'fix', 'error', 'exception', 'stacktrace', 'traceback',
      'crash', 'failing', 'failure', 'refactor', 'implement', 'review',
      'compile', 'lint', 'test', 'reproduce', 'patch', 'diff', 'log', 'logs',
      'خطأ', 'تصحيح', 'اصلاح', 'إصلاح', 'كود', 'برمجة',
    ],
    needs: {
      // A stack trace needs its shape (a host, a port, a path) to stay readable.
      TECHNICAL_IDENTIFIER: NEEDS.REQUIRED_SHAPE,
      BUSINESS_ATTRIBUTE: NEEDS.REQUIRED_SHAPE,
      // Nobody debugs with real people in the payload.
      CREDENTIAL: NEEDS.NOT_REQUIRED,
      GOVERNMENT_IDENTIFIER: NEEDS.NOT_REQUIRED,
      FINANCIAL: NEEDS.NOT_REQUIRED,
      CONTACT: NEEDS.NOT_REQUIRED,
      PERSON_NAME: NEEDS.NOT_REQUIRED,
    },
    otherwise: NEEDS.NOT_REQUIRED,
  },

  communication: {
    id: 'communication',
    label: 'Drafting / correspondence',
    keywords: [
      'draft', 'write', 'compose', 'email', 'letter', 'reply', 'respond',
      'message', 'memo', 'announcement', 'newsletter', 'outreach', 'invite',
      'صياغة', 'كتابة', 'رسالة', 'خطاب', 'بريد', 'رد',
    ],
    needs: {
      // A drafted letter has to read like a letter, so names and handles need
      // to look plausible -- but they are still never the real ones.
      PERSON_NAME: NEEDS.REQUIRED_SHAPE,
      CONTACT: NEEDS.REQUIRED_SHAPE,
      LOCATION: NEEDS.REQUIRED_SHAPE,
      BUSINESS_ATTRIBUTE: NEEDS.REQUIRED_SHAPE,
      CREDENTIAL: NEEDS.NOT_REQUIRED,
      GOVERNMENT_IDENTIFIER: NEEDS.NOT_REQUIRED,
      FINANCIAL: NEEDS.NOT_REQUIRED,
    },
    otherwise: NEEDS.NOT_REQUIRED,
  },

  narrative: {
    id: 'narrative',
    label: 'Summarising / translating prose',
    keywords: [
      'summarise', 'summarize', 'summary', 'translate', 'translation',
      'paraphrase', 'rewrite', 'proofread', 'explain', 'describe', 'brief',
      'تلخيص', 'ملخص', 'ترجمة', 'شرح', 'صياغة',
    ],
    needs: {
      PERSON_NAME: NEEDS.REQUIRED_SHAPE,
      LOCATION: NEEDS.REQUIRED_SHAPE,
      BUSINESS_ATTRIBUTE: NEEDS.REQUIRED_SHAPE,
      QUASI_IDENTIFIER: NEEDS.REQUIRED_SHAPE,
      CREDENTIAL: NEEDS.NOT_REQUIRED,
      GOVERNMENT_IDENTIFIER: NEEDS.NOT_REQUIRED,
      FINANCIAL: NEEDS.NOT_REQUIRED,
      CONTACT: NEEDS.NOT_REQUIRED,
    },
    otherwise: NEEDS.NOT_REQUIRED,
  },

  migration: {
    id: 'migration',
    label: 'Migration / ETL / schema work',
    keywords: [
      'migrate', 'migration', 'etl', 'pipeline', 'ingest', 'load', 'export',
      'import', 'sync', 'replicate', 'backfill', 'schema', 'transform',
      'deduplicate', 'dedupe', 'join', 'merge', 'reconcile',
      'ترحيل', 'نقل', 'مزامنة', 'دمج',
    ],
    needs: {
      // Referential integrity is the whole job: same value in, same token out.
      CONTACT: NEEDS.REQUIRED_DISTINCT,
      PERSON_NAME: NEEDS.REQUIRED_DISTINCT,
      GOVERNMENT_IDENTIFIER: NEEDS.REQUIRED_DISTINCT,
      FINANCIAL: NEEDS.REQUIRED_DISTINCT,
      TECHNICAL_IDENTIFIER: NEEDS.REQUIRED_DISTINCT,
      QUASI_IDENTIFIER: NEEDS.REQUIRED_DISTINCT,
      LOCATION: NEEDS.REQUIRED_DISTINCT,
      BUSINESS_ATTRIBUTE: NEEDS.REQUIRED_DISTINCT,
      CREDENTIAL: NEEDS.NOT_REQUIRED,
    },
    otherwise: NEEDS.REQUIRED_DISTINCT,
  },

  testing: {
    id: 'testing',
    label: 'Test data / demo / fixtures',
    keywords: [
      'fixture', 'fixtures', 'sample', 'seed', 'mock', 'stub', 'demo',
      'screenshot', 'presentation', 'walkthrough', 'tutorial', 'example',
      'sandbox', 'staging', 'placeholder',
      'عرض', 'نموذج', 'تجريبي', 'مثال',
    ],
    needs: {
      // Realistic-looking fakes are the entire point of a fixture.
      PERSON_NAME: NEEDS.REQUIRED_SHAPE,
      CONTACT: NEEDS.REQUIRED_SHAPE,
      LOCATION: NEEDS.REQUIRED_SHAPE,
      QUASI_IDENTIFIER: NEEDS.REQUIRED_SHAPE,
      BUSINESS_ATTRIBUTE: NEEDS.REQUIRED_SHAPE,
      TECHNICAL_IDENTIFIER: NEEDS.REQUIRED_SHAPE,
      FINANCIAL: NEEDS.REQUIRED_SHAPE,
      GOVERNMENT_IDENTIFIER: NEEDS.REQUIRED_SHAPE,
      CREDENTIAL: NEEDS.NOT_REQUIRED,
    },
    otherwise: NEEDS.REQUIRED_SHAPE,
  },
};

/** Longest task string the analyzer will read, and the audit log will carry. */
const MAX_TASK_CHARS = 500;

/**
 * Strip a caller-supplied task string down to something safe to print, store and
 * match against. Control characters go (a task is a label, not a terminal escape
 * sequence), whitespace collapses, and the result is capped.
 *
 * This is sanitisation for OUTPUT safety only. It is not a security boundary for
 * the decision -- the decision is safe because the analyzer cannot weaken it, not
 * because the string was cleaned.
 */
function sanitizeTask(raw) {
  if (raw == null) return null;
  const text = String(raw)
    // eslint-disable-next-line no-control-regex
    .replace(/[ --]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > MAX_TASK_CHARS ? `${text.slice(0, MAX_TASK_CHARS)}…` : text;
}

/** Split into comparable word tokens across scripts (Latin, Arabic, digits). */
function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * How destructive is an intent's need profile overall? Used only to break a
 * keyword tie deterministically, and it breaks it towards the MORE destructive
 * reading -- if the task could be two things, protect for the stricter one.
 */
function profileStrength(intent) {
  let total = 0;
  for (const cls of CLASSES) {
    const need = intent.needs[cls] || intent.otherwise;
    total += TOOLS[PREFERENCE[need][0]].destructiveness;
  }
  return total;
}

class TaskAnalysis {
  constructor({ task, intent, matched, needs, recognised }) {
    this.task = task;
    this.intentId = intent ? intent.id : null;
    this.label = intent ? intent.label : 'Purpose not established';
    this.matchedKeywords = matched;
    this.needs = needs;
    this.recognised = recognised;
    this.stated = Boolean(task);
    Object.freeze(this.matchedKeywords);
    Object.freeze(this.needs);
    Object.freeze(this);
  }

  /** What this task needs from `cls`; null when no intent was recognised. */
  needFor(cls) {
    return this.needs[cls] || null;
  }

  /**
   * Tool preference order for `cls`, most preferred first.
   * With no recognised intent this IS the baseline ladder, so an unparsed task
   * cannot change a single decision.
   */
  preferenceFor(cls) {
    const need = this.needFor(cls);
    return need ? [...PREFERENCE[need]] : [...BASELINE_PREFERENCE];
  }

  /** Classes this purpose has no use for at all. */
  get unnecessaryClasses() {
    return CLASSES.filter((c) => this.needs[c] === NEEDS.NOT_REQUIRED);
  }

  /** Audit-safe projection: intent ids and class names, never matched values. */
  toJSON() {
    return {
      task: this.task,
      intent: this.intentId,
      recognised: this.recognised,
      matchedKeywords: [...this.matchedKeywords],
      needs: { ...this.needs },
    };
  }
}

/**
 * @param {string|null} rawTask
 * @returns {TaskAnalysis}
 */
function analyze(rawTask) {
  const task = sanitizeTask(rawTask);
  if (!task) {
    return new TaskAnalysis({ task: null, intent: null, matched: [], needs: {}, recognised: false });
  }

  const words = new Set(tokenize(task));
  let best = null;
  let bestHits = [];

  for (const intent of Object.values(INTENTS)) {
    const hits = intent.keywords.filter((k) => words.has(k.toLowerCase()));
    if (hits.length === 0) continue;
    if (
      !best
      || hits.length > bestHits.length
      // Tie -> the stricter reading wins, then id order so it is reproducible.
      || (hits.length === bestHits.length && profileStrength(intent) > profileStrength(best))
      || (hits.length === bestHits.length
        && profileStrength(intent) === profileStrength(best)
        && intent.id < best.id)
    ) {
      best = intent;
      bestHits = hits;
    }
  }

  if (!best) {
    return new TaskAnalysis({ task, intent: null, matched: [], needs: {}, recognised: false });
  }

  const needs = {};
  for (const cls of CLASSES) needs[cls] = best.needs[cls] || best.otherwise;

  return new TaskAnalysis({ task, intent: best, matched: bestHits, needs, recognised: true });
}

/**
 * The non-weakening property, as executable code.
 *
 * For a given set of permitted tools, the tool a task-informed preference picks
 * must be at least as destructive as the one the baseline ladder picks. Exported
 * so the test suite can run it across every intent, class and subset rather than
 * trusting the tables above to stay correct as they grow.
 *
 * @param {string[]} preference — task-informed order
 * @param {string[]} permitted — tools policy allows for this class
 * @returns {{ ok: boolean, chosen: string|null, baseline: string|null }}
 */
function assertNonWeakening(preference, permitted) {
  const pick = (order) => order.find((t) => permitted.includes(t)) || null;
  const chosen = pick(preference);
  const baseline = pick(BASELINE_PREFERENCE);
  if (chosen === null || baseline === null) {
    return { ok: chosen === baseline, chosen, baseline };
  }
  return {
    ok: TOOLS[chosen].destructiveness >= TOOLS[baseline].destructiveness,
    chosen,
    baseline,
  };
}

const TaskAnalyzer = { analyze, sanitizeTask, assertNonWeakening };

module.exports = {
  TaskAnalyzer,
  TaskAnalysis,
  analyze,
  sanitizeTask,
  assertNonWeakening,
  NEEDS,
  INTENTS,
  PREFERENCE,
  BASELINE_PREFERENCE,
  MAX_TASK_CHARS,
};
