/**
 * Sweep POLICY -- coverage may grow, never shrink.
 *
 * Sweep's completeness claim ("every signal in scope was accounted for") is
 * only meaningful if scope itself cannot be argued down. The planner, the task
 * string, a repo README or a future semantic planner may all PROPOSE a plan;
 * this module compares it to the floor plan (built-in pii_flow_audit pack over
 * the full file listing) and rejects anything that removes coverage:
 *
 *   FILE_REMOVED      a file in the floor is not in the proposed scope
 *   LANGUAGE_REMOVED  a language in the floor is not covered
 *   CLASS_REMOVED     a sensitivity class the floor's selectors cover is gone
 *   SELECTOR_REMOVED  a floor selector id is gone
 *   PACK_REMOVED      a floor pack is gone
 *   IGNORE_ADDED      an ignore rule the floor did not have
 *
 * Same asymmetry as src/guardian/policy.js: reasoning proposes, policy
 * disposes. A rejected plan is never executed. Pure data + pure functions.
 */

const { languageOf } = require('./selectors/schema');

const AXES = [
  ['files', 'FILE_REMOVED'],
  ['languages', 'LANGUAGE_REMOVED'],
  ['classes', 'CLASS_REMOVED'],
  ['selectorIds', 'SELECTOR_REMOVED'],
  ['packs', 'PACK_REMOVED'],
];

const sortedSet = (xs) => [...new Set((xs || []).filter((x) => typeof x === 'string'))].sort();

/**
 * Normalise to CoveragePlan { files, languages, classes, selectorIds, packs, ignores } (sorted sets).
 * @param {object} p
 */
function normalise(p) {
  const o = p || {};
  return {
    files: sortedSet(o.files),
    languages: sortedSet(o.languages),
    classes: sortedSet(o.classes),
    selectorIds: sortedSet(o.selectorIds),
    packs: sortedSet(o.packs),
    ignores: sortedSet(o.ignores),
  };
}

/**
 * Build a CoveragePlan from planSweep() output.
 * Uses plan.scope.files / plan.scope.ignore, plan.packs, plan._selectors.
 * @param {object} plan
 * @returns {object} CoveragePlan (frozen)
 */
function coveragePlanFrom(plan) {
  const scope = (plan && plan.scope) || {};
  const files = scope.files || [];
  const selectors = (plan && plan._selectors) || [];
  return Object.freeze(normalise({
    files,
    languages: files.map(languageOf),
    classes: selectors.map((s) => s.sensitivity_class),
    selectorIds: selectors.map((s) => s.id),
    packs: (plan && plan.packs) || [],
    ignores: scope.ignore || [],
  }));
}

/**
 * @param {object} floor     CoveragePlan
 * @param {object} proposed  CoveragePlan
 * @returns {{ ok: boolean, violations: {code: string, item: string}[] }}
 */
function assertCoverageNonWeakening(floor, proposed) {
  const f = normalise(floor);
  const p = normalise(proposed);
  const violations = [];
  for (const [axis, code] of AXES) {
    const have = new Set(p[axis]);
    for (const item of f[axis]) if (!have.has(item)) violations.push({ code, item });
  }
  const floorIgnores = new Set(f.ignores);
  for (const item of p.ignores) if (!floorIgnores.has(item)) violations.push({ code: 'IGNORE_ADDED', item });
  return { ok: violations.length === 0, violations };
}

/**
 * The gate. A rejected plan is returned with plan: null so no caller can run it.
 * @returns {{ authorized: boolean, rejected: boolean, violations: object[], plan: object|null }}
 */
function validateSweepPlan(floor, proposed) {
  const { ok, violations } = assertCoverageNonWeakening(floor, proposed);
  return Object.freeze({
    authorized: ok,
    rejected: !ok,
    violations,
    plan: ok ? Object.freeze(normalise(proposed)) : null,
  });
}

module.exports = { coveragePlanFrom, assertCoverageNonWeakening, validateSweepPlan, normaliseCoveragePlan: normalise, VIOLATION_CODES: [...AXES.map((a) => a[1]), 'IGNORE_ADDED'] };
