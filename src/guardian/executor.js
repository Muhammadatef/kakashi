/**
 * Executor -- intentionally boring.
 *
 * It does not reason, choose, or second-guess. It takes a plan the PolicyGuard
 * has already authorised and turns it into calls against the existing Kakashi
 * engine. Every capability it uses already shipped in v1.1:
 *
 *   formats.readFile    -> read the source in whatever format it is
 *   maskText            -> transform, scoped by `enabled` and `mode`
 *   formats.writeMasked -> write the artifact back in the same format
 *
 * No shell, no network, no eval, no dynamic module loading. The complete set of
 * effects this module can have on the machine is "write one file at a path the
 * caller already validated".
 *
 * Two deliberate design choices:
 *
 * 1. THE SOURCE IS RE-READ EVERY ITERATION. formats/xlsx.js mutates `data.wb` in
 *    place when it writes, so reusing a `data` object across iterations would
 *    compound transforms and make the artifact depend on history. Re-reading
 *    costs a file read and buys idempotence.
 *
 * 2. PLANS ARE ABSOLUTE, NOT INCREMENTAL. Each execution applies the whole plan
 *    to the ORIGINAL text. Iteration 2 does not patch iteration 1's artifact; it
 *    redoes the job with a better plan. That keeps a half-escalated artifact from
 *    ever existing, and it is why the planner carries previously-transformed
 *    classes forward.
 */

const formats = require('../engine/formats');
const { maskText } = require('../engine/masker');
const { TRANSFORM_LADDER } = require('./actions');
const { classOf } = require('./classes');

const Executor = {
  /**
   * @param {object} args
   * @param {import('./policy').AuthorizedPlan} args.authorized
   * @param {string} args.sourcePath - validated by paths.resolveResource
   * @param {string} args.artifactPath - validated by paths.resolveOutput
   * @returns {Promise<object>} tool result (audit-safe: counts and classes only)
   */
  async execute({ authorized, sourcePath, artifactPath }) {
    if (!authorized || !authorized.authorized) {
      // Defence in depth. The loop already checks this; if a future caller
      // forgets, fail closed rather than executing an unauthorised plan.
      throw new Error('Executor: refusing to execute a plan that is not authorised');
    }
    const plan = authorized.plan;
    const data = await formats.readFile(sourcePath);
    const format = formats.getFormat(sourcePath);

    // Group actions by mask mode so each mode costs one pass over the text.
    // Pattern id sets are disjoint across classes, so passes cannot interfere;
    // ladder order is fixed only to keep runs byte-for-byte reproducible.
    const byMode = new Map();
    for (const action of plan.transforms) {
      const mode = action.maskMode;
      if (!byMode.has(mode)) byMode.set(mode, []);
      byMode.get(mode).push(action);
    }
    const modeOrder = TRANSFORM_LADDER
      .map((t) => require('./actions').TOOLS[t].maskMode)
      .filter((m) => byMode.has(m));

    let text = data.text;
    const replMap = {};
    const byClass = {};
    let replacementCount = 0;

    for (const mode of modeOrder) {
      const actions = byMode.get(mode);
      const enabled = actions.flatMap((a) => [...a.patternIds]);
      const result = maskText(text, { mode, enabled });
      text = result.masked;
      for (const f of result.findings) {
        // The replacement map is what the xlsx/docx/pptx writers use to patch
        // cells and XML runs. Chained passes stay correct because a later pass
        // can never match a token an earlier pass inserted.
        replMap[f.original] = f.replacement;
        const cls = classOf(f.id);
        if (!byClass[cls]) byClass[cls] = { transformed: 0, tool: null };
        byClass[cls].transformed += 1;
        byClass[cls].tool = actions.find((a) => a.patternIds.includes(f.id)).tool;
        replacementCount += 1;
      }
    }

    await formats.writeMasked(sourcePath, artifactPath, { ...data, format }, replMap, text);

    return {
      artifactPath,
      replacementCount,
      byClass,
      // Audit-safe: the actions applied, never the values they applied to.
      actions: plan.actions.map((a) => a.toJSON()),
      passes: modeOrder.length,
    };
  },
};

module.exports = { Executor };
