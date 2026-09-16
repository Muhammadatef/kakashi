/**
 * Typed actions + protection plans.
 *
 * An Action is the ONLY way the Guardian can touch the environment. It is a plain
 * data record — a tool name, a target class, parameters and a reason code — that
 * gets validated at construction, authorised by the PolicyGuard, and only then
 * handed to the executor. There is deliberately no action that runs a shell
 * command, opens a socket, or evaluates code.
 *
 * TOOLS maps 1:1 onto capabilities that already exist in src/engine/masker.js.
 * Nothing here invents a transform Kakashi cannot actually perform:
 *   tokenize   → maskText(mode:'typed')   → [NATIONAL_ID_1]
 *   redact     → maskText(mode:'redact')  → [REDACTED]
 *   synthesize → maskText(mode:'fake')    → a value from pattern.fakeValues
 *   keep       → no transform; recorded so the plan explains what it preserved
 *
 * `drop`, `generalize` and `pseudonymize` are intentionally ABSENT — Kakashi's
 * engine is byte-offset addressed, not field addressed, so they cannot be
 * implemented honestly yet. See docs/AGENTIC_ARCHITECTURE.md §19.
 */

const { CLASSES, patternIdsFor } = require('./classes');

/**
 * Tool registry. `destructiveness` orders the escalation ladder the planner
 * climbs when a gentler transform fails verification: higher = more information
 * destroyed = more likely to satisfy the goal, less likely to preserve utility.
 */
const TOOLS = {
  keep:       { id: 'keep',       maskMode: null,     destructiveness: 0, detectableOutput: true  },
  synthesize: { id: 'synthesize', maskMode: 'fake',   destructiveness: 1, detectableOutput: true  },
  tokenize:   { id: 'tokenize',   maskMode: 'typed',  destructiveness: 2, detectableOutput: false },
  redact:     { id: 'redact',     maskMode: 'redact', destructiveness: 3, detectableOutput: false },
};

/** Transform tools, least destructive first — the planner's preference order. */
const TRANSFORM_LADDER = ['synthesize', 'tokenize', 'redact'];

const REASON_CODES = new Set([
  'PROHIBITED_AT_DESTINATION',
  'RESTRICTED_AT_DESTINATION',
  'NOT_REQUIRED_FOR_TASK',
  'RESIDUE_AFTER_VERIFICATION',
  'ESCALATED_AFTER_VERIFICATION_FAILURE',
  'ESCALATED_AFTER_POLICY_REJECTION',
  'PERMITTED_FOR_TASK_UTILITY',
  'NO_FINDINGS_FOR_CLASS',
]);

class Action {
  /**
   * @param {object} opts
   * @param {string} opts.tool — a key of TOOLS
   * @param {string} opts.targetClass — a sensitivity class
   * @param {string} opts.reasonCode — an explainable, stable code (never free prose)
   * @param {object} [opts.parameters]
   */
  constructor({ tool, targetClass, reasonCode, parameters = {} }) {
    if (!TOOLS[tool]) {
      throw new Error(`Action: unknown tool "${tool}" (allowed: ${Object.keys(TOOLS).join(', ')})`);
    }
    if (!CLASSES.includes(targetClass)) {
      throw new Error(`Action: unknown target class "${targetClass}"`);
    }
    if (!REASON_CODES.has(reasonCode)) {
      throw new Error(`Action: unknown reason code "${reasonCode}"`);
    }
    this.tool = tool;
    this.targetClass = targetClass;
    this.reasonCode = reasonCode;
    this.parameters = { ...parameters };
    // Resolved once, here, so the executor never has to think.
    this.patternIds = patternIdsFor(targetClass);
    Object.freeze(this.patternIds);
  }

  get maskMode() { return TOOLS[this.tool].maskMode; }
  get isTransform() { return TOOLS[this.tool].maskMode !== null; }

  toJSON() {
    return {
      tool: this.tool,
      targetClass: this.targetClass,
      reasonCode: this.reasonCode,
      patternIds: [...this.patternIds],
    };
  }
}

class ProtectionPlan {
  /**
   * @param {Action[]} actions
   * @param {object} [meta]
   */
  constructor(actions = [], meta = {}) {
    for (const a of actions) {
      if (!(a instanceof Action)) throw new Error('ProtectionPlan: every entry must be an Action');
    }
    // One action per class — two transforms on the same class would fight over
    // the same byte ranges and make verification unreadable.
    const seen = new Set();
    for (const a of actions) {
      if (seen.has(a.targetClass)) {
        throw new Error(`ProtectionPlan: duplicate action for class "${a.targetClass}"`);
      }
      seen.add(a.targetClass);
    }
    this.actions = actions;
    this.meta = { ...meta };
  }

  get transforms() { return this.actions.filter((a) => a.isTransform); }
  get isEmpty() { return this.transforms.length === 0; }

  actionFor(cls) { return this.actions.find((a) => a.targetClass === cls) || null; }

  toJSON() {
    return { actions: this.actions.map((a) => a.toJSON()), meta: this.meta };
  }
}

module.exports = { Action, ProtectionPlan, TOOLS, TRANSFORM_LADDER, REASON_CODES };
