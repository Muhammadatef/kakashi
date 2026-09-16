/**
 * Planner -- decides WHAT protection to apply, given everything that has already
 * happened this run.
 *
 * Two ideas drive it:
 *
 * 1. MINIMUM NECESSARY DATA. The planner does not mask everything it can see. It
 *    transforms what the policy prohibits at this destination, plus what the
 *    policy restricts when the goal asks to minimise disclosure -- and it emits an
 *    explicit `keep` action for every other class present, so the plan states what
 *    it preserved and why. "Mask every PII field" destroys the task; this does not.
 *
 * 2. ESCALATION FROM FEEDBACK. The tool chosen for a class is a function of what
 *    has already been TRIED for that class (state.toolsTriedFor) and what the
 *    PolicyGuard has already REFUSED for it (state.rejectedToolsFor). That is the
 *    mechanism by which iteration N+1 differs from iteration N. Without state
 *    this module would return the same plan forever.
 *
 * The utility heuristic lives here for the MVP. Milestone 4 extracts it into a
 * `TaskAnalyzer` interface (deterministic first, optional local model later) that
 * proposes which classes the task actually needs. Whatever produces the proposal,
 * it stays upstream of the PolicyGuard and can always be overruled by it.
 */

const { Action, ProtectionPlan, TRANSFORM_LADDER, TOOLS } = require('./actions');
const { rulesFor, permittedTransforms } = require('./policy');

/**
 * Choose the transform for one class.
 *
 * Preference order is the ladder least-destructive-first when the goal asks to
 * preserve task utility, because a synthetic email keeps a column parseable where
 * `[REDACTED]` does not. Anything already tried or already refused is removed
 * from the candidate set -- that subtraction is the escalation.
 *
 * Escalation is TARGETED. A class that was transformed and then survived
 * verification cleanly keeps the tool that worked; only a class the verifier
 * actually found in the artifact climbs the ladder. Escalating everything on any
 * failure would destroy utility for classes that were never the problem.
 *
 * @returns {{ tool: string|null, exhausted: boolean, stable: boolean, permitted: string[], tried: string[], refused: string[] }}
 */
function chooseTool({ cls, goal, context, state, residue = [] }) {
  const rules = rulesFor(context.policy, context.destination.id);
  const permitted = permittedTransforms(rules, cls);
  const tried = state.toolsTriedFor(cls);
  const refused = state.rejectedToolsFor(cls);
  const lastTool = tried.length > 0 ? tried[tried.length - 1] : null;

  // This class did its job last time: carry the same tool forward unchanged.
  if (lastTool && !residue.includes(cls) && permitted.includes(lastTool) && !refused.includes(lastTool)) {
    return { tool: lastTool, exhausted: false, stable: true, permitted, tried, refused };
  }

  const ladder = goal.preserveTaskUtility
    ? TRANSFORM_LADDER
    : [...TRANSFORM_LADDER].reverse();

  const candidates = ladder.filter((t) => permitted.includes(t)
    && !tried.includes(t)
    && !refused.includes(t));

  if (candidates.length > 0) {
    return { tool: candidates[0], exhausted: false, stable: false, permitted, tried, refused };
  }

  // Every permitted transform for this class has been tried or refused. The
  // planner cannot do better; it says so rather than silently repeating itself,
  // and the loop terminates instead of burning iterations.
  return { tool: null, exhausted: true, stable: false, permitted, tried, refused };
}

/**
 * Why this class is being transformed. Ordered most-specific first so the
 * explanation the human reads names the actual trigger, not a generic one.
 */
function reasonFor({ cls, tried, refused, stable, residue, prohibited }) {
  if (!stable && tried.length > 0) return 'ESCALATED_AFTER_VERIFICATION_FAILURE';
  if (!stable && refused.length > 0) return 'ESCALATED_AFTER_POLICY_REJECTION';
  if (!stable && residue.includes(cls)) return 'RESIDUE_AFTER_VERIFICATION';
  if (prohibited.includes(cls)) return 'PROHIBITED_AT_DESTINATION';
  return 'RESTRICTED_AT_DESTINATION';
}

const Planner = {
  chooseTool,

  /**
   * @param {object} args
   * @param {import('./goal').SecurityGoal} args.goal
   * @param {import('./observe').Observation} args.observation
   * @param {import('./risk').RiskAssessment} args.assessment
   * @param {import('./context').GuardianContext} args.context
   * @param {import('./state').GuardianState} args.state
   * @returns {ProtectionPlan}
   */
  createPlan({ goal, observation, assessment, context, state }) {
    const rules = rulesFor(context.policy, context.destination.id);
    const present = observation.presentClasses;

    // What the last attempt left behind. On iteration 1 this is empty; from
    // iteration 2 it is the environment telling the planner it was wrong.
    const lastVerification = state.latestVerification;
    const residue = lastVerification ? lastVerification.residualClasses : [];

    // --- Which classes need acting on -------------------------------------
    const targets = new Set();
    for (const cls of rules.prohibited) if (observation.hasClass(cls)) targets.add(cls);
    if (goal.minimizeInformationDisclosure) {
      for (const cls of rules.restricted) if (observation.hasClass(cls)) targets.add(cls);
    }
    // Residue always gets acted on, even if the policy only "restricts" it --
    // the verifier saw it survive, so leaving it alone would repeat the failure.
    for (const cls of residue) targets.add(cls);
    // A class the previous plan already transformed stays in the plan; dropping
    // it would undo that protection, since each plan is applied to the ORIGINAL
    // resource rather than to the previous artifact.
    for (const a of state.executedActions) if (a.tool !== 'keep') targets.add(a.targetClass);

    const actions = [];
    const exhaustedClasses = [];

    for (const cls of targets) {
      const { tool, exhausted, stable, tried, refused } = chooseTool({ cls, goal, context, state, residue });
      if (exhausted) {
        exhaustedClasses.push(cls);
        continue;
      }
      actions.push(new Action({
        tool,
        targetClass: cls,
        reasonCode: reasonFor({ cls, tried, refused, stable, residue, prohibited: rules.prohibited }),
        parameters: { previousTools: tried },
      }));
    }

    // --- Minimum necessary: say what is being KEPT, and why ----------------
    // These are classes the resource contains that the policy permits at this
    // destination. Recording them as explicit `keep` actions is what makes the
    // plan auditable as a minimisation decision rather than an omission.
    for (const cls of present) {
      if (targets.has(cls)) continue;
      actions.push(new Action({
        tool: 'keep',
        targetClass: cls,
        reasonCode: 'PERMITTED_FOR_TASK_UTILITY',
      }));
    }

    // Stable order: transforms first (most destructive last), then keeps. Makes
    // the CLI output and the audit event diff-able between iterations.
    actions.sort((a, b) => {
      const d = TOOLS[a.tool].destructiveness - TOOLS[b.tool].destructiveness;
      if (a.isTransform !== b.isTransform) return a.isTransform ? -1 : 1;
      if (d !== 0) return d;
      return a.targetClass.localeCompare(b.targetClass);
    });

    return new ProtectionPlan(actions, {
      iteration: state.iteration,
      destination: rules.destinationId,
      policy: rules.policyId,
      riskLevel: assessment.level,
      drivenByResidue: residue.length > 0,
      exhaustedClasses,
    });
  },
};

module.exports = { Planner, chooseTool, reasonFor };
