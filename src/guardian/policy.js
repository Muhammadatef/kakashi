/**
 * PolicyGuard -- the deterministic authority.
 *
 * This component sits BETWEEN the planner and the executor and has more
 * authority than either. A plan it rejects is never executed, and there is no
 * code path by which a planner (deterministic today, semantic from M4) can
 * override it. That asymmetry is the whole point: reasoning proposes, policy
 * disposes.
 *
 * Kakashi had no configuration or policy layer at all before this
 * (docs/AGENTIC_ARCHITECTURE.md SS11), so this is new -- but it is new *data*
 * plus a pure validation function. No I/O, no network, no dynamic loading.
 *
 * Policy vocabulary, per (policy, destination):
 *
 *   denyOutright[]      Cannot be released to this destination in ANY form, not
 *                       even tokenised. Produces an immediate BLOCK.
 *   prohibited[]        Must not be DETECTABLE in the released artifact. The
 *                       hard constraint the verifier checks.
 *   restricted[]        Should be transformed when the goal asks to minimise
 *                       disclosure, but its presence does not block release.
 *   requiresApproval[]  A human must sign off before release, even transformed.
 *   allowedTransforms   Caps which tools the planner may choose for a class.
 *                       Absent class => every transform tool is permitted.
 */

const { CLASSES } = require('./classes');
const { TOOLS, ProtectionPlan } = require('./actions');

/** Every transform tool -- the default cap when a policy says nothing. */
const ALL_TRANSFORMS = Object.keys(TOOLS).filter((t) => TOOLS[t].maskMode !== null);

/**
 * Transform caps shared by every external destination.
 *
 * The rule behind the table: a class may be `synthesize`d only when a synthetic
 * value is HARMLESS if mistaken for a real one. A fake department name is
 * harmless. A fake Emirates ID is not -- downstream it is indistinguishable from
 * a live one, and `pattern.fakeValues` for `national_id` is a well-formed
 * 784-prefixed number. Same argument for credentials and financial instruments.
 */
const EXTERNAL_TRANSFORM_CAPS = {
  CREDENTIAL:            ['tokenize', 'redact'],
  GOVERNMENT_IDENTIFIER: ['tokenize', 'redact'],
  FINANCIAL:             ['tokenize', 'redact'],
  // Contact handles and names may be synthesised: a synthetic email preserves
  // the column shape a downstream parser needs, and reveals nothing about the
  // real subject.
  CONTACT:               ['synthesize', 'tokenize', 'redact'],
  PERSON_NAME:           ['synthesize', 'tokenize', 'redact'],
};

const POLICIES = {
  default: {
    id: 'default',
    label: 'Default',
    description: 'Balanced policy: credentials and state identifiers never leave the machine in readable form.',
    destinations: {
      local: {
        denyOutright: [],
        prohibited: [],
        restricted: [],
        requiresApproval: [],
        allowedTransforms: {},
      },
      local_model: {
        // A model on this device is inside the trust boundary for personal data,
        // but a live credential is still a live credential: if the model is
        // compromised or its context is persisted, the key is gone.
        denyOutright: [],
        prohibited: ['CREDENTIAL'],
        restricted: [],
        requiresApproval: [],
        allowedTransforms: { CREDENTIAL: ['tokenize', 'redact'] },
      },
      known_external: {
        denyOutright: [],
        prohibited: ['CREDENTIAL', 'GOVERNMENT_IDENTIFIER', 'FINANCIAL'],
        restricted: ['CONTACT', 'PERSON_NAME'],
        requiresApproval: [],
        allowedTransforms: EXTERNAL_TRANSFORM_CAPS,
      },
      external_model: {
        denyOutright: [],
        prohibited: ['CREDENTIAL', 'GOVERNMENT_IDENTIFIER', 'FINANCIAL', 'CONTACT'],
        restricted: ['PERSON_NAME', 'TECHNICAL_IDENTIFIER'],
        // Even tokenised, shipping a file that *contained* production credentials
        // to a hosted model is a decision a human should make knowingly.
        requiresApproval: ['CREDENTIAL'],
        allowedTransforms: EXTERNAL_TRANSFORM_CAPS,
      },
      unknown: {
        // You cannot send a credential somewhere you cannot name. There is no
        // transform that makes an unaccountable destination acceptable, so this
        // is a hard stop rather than something a human may wave through.
        denyOutright: ['CREDENTIAL'],
        prohibited: ['GOVERNMENT_IDENTIFIER', 'FINANCIAL', 'CONTACT', 'PERSON_NAME'],
        restricted: ['QUASI_IDENTIFIER', 'TECHNICAL_IDENTIFIER', 'LOCATION', 'BUSINESS_ATTRIBUTE'],
        requiresApproval: ['GOVERNMENT_IDENTIFIER'],
        allowedTransforms: EXTERNAL_TRANSFORM_CAPS,
      },
    },
  },
};

/**
 * Resolve the rule set for a (policy, destination) pair.
 * Unknown policy ids and unknown destinations both fall back to the most
 * conservative entry rather than to the most permissive one.
 * @param {string} policyId
 * @param {string} destinationId
 */
function rulesFor(policyId, destinationId) {
  const policy = POLICIES[policyId] || POLICIES.default;
  const dest = policy.destinations[destinationId] || policy.destinations.unknown;
  return {
    policyId: policy.id,
    destinationId: policy.destinations[destinationId] ? destinationId : 'unknown',
    denyOutright: dest.denyOutright || [],
    prohibited: dest.prohibited || [],
    restricted: dest.restricted || [],
    requiresApproval: dest.requiresApproval || [],
    allowedTransforms: dest.allowedTransforms || {},
  };
}

/**
 * Which transform tools may be used on a class at this destination.
 * @returns {string[]}
 */
function permittedTransforms(rules, cls) {
  const capped = rules.allowedTransforms[cls];
  return capped ? [...capped] : [...ALL_TRANSFORMS];
}

/**
 * Classes present in the observation that the policy forbids outright.
 * Read by the loop's ASSESS step to short-circuit to BLOCK before any plan is
 * even proposed -- fail closed, and never write a scratch artifact we will
 * refuse to release.
 * @param {import('./observe').Observation} observation
 * @param {object} rules
 * @returns {string[]}
 */
function deniedClasses(observation, rules) {
  return rules.denyOutright.filter((c) => observation.hasClass(c));
}

class AuthorizedPlan {
  constructor({ plan, rules, violations = [], approvalsNeeded = [] }) {
    this.plan = plan;
    this.rules = rules;
    this.violations = violations;
    this.approvalsNeeded = approvalsNeeded;
    this.rejected = violations.length > 0;
    this.requiresHuman = !this.rejected && approvalsNeeded.length > 0;
    this.authorized = !this.rejected && !this.requiresHuman;
  }

  toJSON() {
    return {
      authorized: this.authorized,
      rejected: this.rejected,
      requiresHuman: this.requiresHuman,
      violations: this.violations,
      approvalsNeeded: this.approvalsNeeded,
      plan: this.plan ? this.plan.toJSON() : null,
    };
  }
}

const PolicyGuard = {
  rulesFor,
  permittedTransforms,
  deniedClasses,

  /**
   * Validate a proposed plan against the policy.
   *
   * @param {ProtectionPlan} plan
   * @param {import('./context').GuardianContext} context
   * @param {import('./state').GuardianState} state
   * @returns {AuthorizedPlan}
   */
  validate(plan, context, state) {
    if (!(plan instanceof ProtectionPlan)) {
      throw new Error('PolicyGuard: expected a ProtectionPlan');
    }
    const rules = rulesFor(context.policy, context.destination.id);
    const observation = state.latestObservation;
    const violations = [];

    // 1. A class the destination denies outright can never be authorised, no
    //    matter what transform the planner chose.
    for (const cls of deniedClasses(observation, rules)) {
      violations.push({
        code: 'CLASS_DENIED_AT_DESTINATION',
        targetClass: cls,
        tool: null,
        detail: `${cls} may not be released to ${rules.destinationId} in any form`,
      });
    }

    // 2. Every transform the planner chose must be within the policy's cap.
    //    This is the check that stops a utility-seeking planner (today a
    //    heuristic, tomorrow a model) from proposing format-preserving fakes for
    //    a class where detectability downstream is the danger.
    for (const action of plan.transforms) {
      const permitted = permittedTransforms(rules, action.targetClass);
      if (!permitted.includes(action.tool)) {
        violations.push({
          code: 'TRANSFORM_NOT_PERMITTED',
          targetClass: action.targetClass,
          tool: action.tool,
          permitted,
          detail: `${action.tool} is not permitted for ${action.targetClass} at ${rules.destinationId}`,
        });
      }
    }

    // 3. Every prohibited class actually present must be covered by a transform.
    //    A plan that quietly keeps a prohibited class is rejected here rather
    //    than discovered later by the verifier.
    for (const cls of rules.prohibited) {
      if (!observation.hasClass(cls)) continue;
      const action = plan.actionFor(cls);
      if (!action || !action.isTransform) {
        violations.push({
          code: 'PROHIBITED_CLASS_NOT_TRANSFORMED',
          targetClass: cls,
          tool: action ? action.tool : null,
          detail: `${cls} is prohibited at ${rules.destinationId} and the plan does not transform it`,
        });
      }
    }

    // 4. Human sign-off. Checked only once the plan itself is sound, so an
    //    operator is never asked to approve a plan we were going to reject.
    const approvalsNeeded = violations.length > 0 ? [] : rules.requiresApproval
      .filter((cls) => observation.hasClass(cls))
      .filter((cls) => !context.hasApprovalFor(cls));

    return new AuthorizedPlan({ plan, rules, violations, approvalsNeeded });
  },
};

module.exports = { PolicyGuard, POLICIES, AuthorizedPlan, rulesFor, permittedTransforms, deniedClasses, ALL_TRANSFORMS, CLASSES };
