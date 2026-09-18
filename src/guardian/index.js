/**
 * Kakashi Guardian -- the agent loop.
 *
 *   GOAL -> OBSERVE -> ASSESS -> PLAN -> VALIDATE -> ACT -> OBSERVE RESULT
 *        -> VERIFY -> satisfied? -> RELEASE | UPDATE STATE + REPLAN | HUMAN | BLOCK
 *
 * Everything security-critical below is ordinary deterministic code, and every
 * transformation is performed by the Kakashi engine that already shipped in
 * v1.1. No LLM, no agent framework, no new runtime dependency -- what makes this
 * agentic is that the Guardian holds a goal and state, reads the environment
 * after it acts, and lets that reading change what it does next.
 *
 * Termination is guaranteed: every path out of the loop is terminal, the
 * iteration counter is checked against goal.maxIterations at the top, and the
 * planner reports when a class has no untried options left.
 *
 * Fail-closed guarantees:
 *   - Intermediate artifacts are written to a private scratch directory. The
 *     output path is only written on a verified-safe decision, so a BLOCK or a
 *     REQUIRE_APPROVAL leaves nothing releasable on disk.
 *   - The original resource is never modified. There is no override flag.
 *   - Any unexpected error terminates the run as FAILED with no artifact.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { SecurityGoal } = require('./goal');
const { GuardianContext } = require('./context');
const { GuardianState, STATUS } = require('./state');
const { observe } = require('./observe');
const { RiskEngine } = require('./risk');
const { Planner } = require('./planner');
const { PolicyGuard, rulesFor } = require('./policy');
const { Executor } = require('./executor');
const { Verifier } = require('./verifier');
const audit = require('./audit');
const paths = require('./paths');

const DECISIONS = {
  ALLOW: 'ALLOW',
  ALLOW_WITH_TRANSFORMATION: 'ALLOW_WITH_TRANSFORMATION',
  REQUIRE_APPROVAL: 'REQUIRE_APPROVAL',
  BLOCK: 'BLOCK',
};

/**
 * Run the Guardian over one resource.
 *
 * @param {object} opts
 * @param {string} opts.resource - path to the resource the agent wants
 * @param {string} [opts.agent] - requesting agent id
 * @param {string} [opts.task] - what the agent says it is trying to do
 * @param {string} [opts.destination] - where the data could end up
 * @param {string} [opts.policy] - policy id
 * @param {string[]} [opts.approvals] - classes a human has already signed off
 * @param {string} [opts.output] - artifact path (default: guarded_<name>)
 * @param {object} [opts.goal] - SecurityGoal overrides (e.g. maxIterations)
 * @param {string|false} [opts.auditLog] - JSONL path, or false to skip writing
 * @param {function(object):void} [opts.onEvent] - progress callback for the CLI
 * @returns {Promise<object>} decision
 */
async function runGuardian(opts = {}) {
  const goal = new SecurityGoal(opts.goal || {});
  const context = new GuardianContext({
    resource: opts.resource,
    requestingAgent: opts.agent,
    task: opts.task,
    destination: opts.destination,
    policy: opts.policy,
    approvals: opts.approvals,
    networkAccess: opts.networkAccess,
  });
  const state = new GuardianState({ goal, context });
  const emit = typeof opts.onEvent === 'function' ? opts.onEvent : () => {};

  // Validate both paths before doing anything else, so a traversal attempt or a
  // device-file target fails before we have read a single byte.
  const sourcePath = paths.resolveResource(opts.resource);
  const artifactPath = paths.resolveOutput(
    opts.output || paths.defaultArtifactPath(sourcePath),
    sourcePath,
  );

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'kakashi-guardian-'));

  /** Finish the run: set terminal status, build + write the audit event. */
  function finish({ decision, reasonCode, releasePath = null, extra = {} }) {
    const status = decision === DECISIONS.BLOCK ? STATUS.BLOCKED
      : decision === DECISIONS.REQUIRE_APPROVAL ? STATUS.WAITING_FOR_APPROVAL
        : STATUS.SAFE;
    state.record(status, reasonCode);
    const event = audit.buildEvent({ state, decision: { decision, reasonCode } });
    const written = opts.auditLog === false ? { written: false, path: null } : audit.write(event, opts.auditLog);
    const result = {
      decision,
      reasonCode,
      releasePath,
      artifactPath: releasePath,
      risk: state.latestRisk ? state.latestRisk.toJSON() : null,
      observation: state.observations[0] ? state.observations[0].toJSON() : null,
      plan: state.authorizedPlans.length
        ? state.authorizedPlans[state.authorizedPlans.length - 1].toJSON()
        : (state.proposedPlans.length ? state.proposedPlans[state.proposedPlans.length - 1].toJSON() : null),
      verifications: state.verifications,
      iterations: state.iteration,
      approvalsNeeded: extra.approvalsNeeded || [],
      auditEvent: event,
      auditLog: written,
      state,
    };
    emit({ kind: 'decision', decision, reasonCode });
    return result;
  }

  try {
    while (!state.isTerminal) {
      // --- Termination bound ------------------------------------------------
      if (state.iteration >= goal.maxIterations) {
        emit({ kind: 'exhausted', iterations: state.iteration });
        return finish({
          decision: DECISIONS.BLOCK,
          reasonCode: 'MAX_ITERATIONS_EXHAUSTED',
        });
      }
      const iteration = state.beginIteration();

      // --- OBSERVE ----------------------------------------------------------
      // Re-read the source every iteration rather than caching it. The source is
      // the environment, and the environment can change under us between
      // iterations; a changed finding profile should be seen, not assumed away.
      state.record(STATUS.OBSERVING, 'observe_resource');
      const { observation } = await observe(sourcePath, { kind: 'resource' });
      state.addObservation(observation);
      emit({ kind: 'observe', iteration, observation: observation.toJSON() });

      // --- UNDERSTAND TASK --------------------------------------------------
      // Analysed once when the context was built; recorded here so the run log
      // shows the stage, and emitted so a streaming caller sees it in order.
      state.record(STATUS.UNDERSTANDING_TASK, 'analyze_task');
      emit({ kind: 'task', iteration, analysis: context.taskAnalysis.toJSON() });

      // --- ASSESS -----------------------------------------------------------
      state.record(STATUS.ASSESSING, 'assess_risk');
      const assessment = RiskEngine.assess({ observation, context });
      state.addRiskAssessment(assessment);
      emit({ kind: 'assess', iteration, assessment: assessment.toJSON() });

      if (assessment.requiresImmediateBlock) {
        // A class the destination denies outright. No plan can fix this, so we
        // stop before writing anything at all.
        return finish({
          decision: DECISIONS.BLOCK,
          reasonCode: 'CLASS_DENIED_AT_DESTINATION',
        });
      }

      // Nothing the policy objects to: release the original untouched. The
      // Guardian's job is to allow legitimate work, not to transform for its
      // own sake.
      const rules = rulesFor(context.policy, context.destination.id);
      const needsProtection = rules.prohibited.some((c) => observation.hasClass(c))
        || (goal.minimizeInformationDisclosure && rules.restricted.some((c) => observation.hasClass(c)));
      if (!needsProtection) {
        return finish({
          decision: DECISIONS.ALLOW,
          reasonCode: observation.totalFindings === 0 ? 'NO_SENSITIVE_DATA' : 'NO_PROTECTION_REQUIRED',
          releasePath: sourcePath,
        });
      }

      // --- PLAN -------------------------------------------------------------
      state.record(STATUS.PLANNING, 'create_plan');
      const plan = Planner.createPlan({ goal, observation, assessment, context, state });
      state.addProposedPlan(plan);
      emit({ kind: 'plan', iteration, plan: plan.toJSON() });

      if (plan.meta.exhaustedClasses.length > 0) {
        // Every permitted transform has already been tried for these classes and
        // the artifact is still unsafe. Fail closed rather than loop.
        return finish({
          decision: DECISIONS.BLOCK,
          reasonCode: 'PROTECTION_EXHAUSTED',
          extra: { exhaustedClasses: plan.meta.exhaustedClasses },
        });
      }

      // --- VALIDATE PLAN ----------------------------------------------------
      state.record(STATUS.VALIDATING_PLAN, 'policy_guard');
      const authorized = PolicyGuard.validate(plan, context, state);
      emit({ kind: 'validate', iteration, authorized: authorized.toJSON() });

      if (authorized.rejected) {
        // The policy refused this plan. Record which tools it refused for which
        // classes so the planner excludes them next time, then replan.
        state.recordRejection({ violations: authorized.violations });
        state.record(STATUS.REPLANNING, 'policy_rejected_plan');
        continue;
      }

      if (authorized.requiresHuman) {
        state.addApprovalRequest({
          iteration,
          classes: authorized.approvalsNeeded,
          destination: rules.destinationId,
          policy: rules.policyId,
        });
        return finish({
          decision: DECISIONS.REQUIRE_APPROVAL,
          reasonCode: 'HUMAN_APPROVAL_REQUIRED',
          extra: { approvalsNeeded: authorized.approvalsNeeded },
        });
      }

      state.addAuthorizedPlan(plan);

      // --- ACT --------------------------------------------------------------
      // Into scratch, never straight to the output path. Nothing becomes
      // releasable until the verifier has signed it off.
      state.record(STATUS.EXECUTING, 'execute_plan');
      const scratchArtifact = path.join(scratch, `iter${iteration}_${path.basename(artifactPath)}`);
      const result = await Executor.execute({ authorized, sourcePath, artifactPath: scratchArtifact });
      state.recordResult(result);
      emit({ kind: 'execute', iteration, replacements: result.replacementCount, byClass: result.byClass });

      // --- VERIFY -----------------------------------------------------------
      state.record(STATUS.VERIFYING, 'verify_artifact');
      const verification = await Verifier.verify({ artifactPath: scratchArtifact, context, goal });
      state.recordVerification(verification);
      emit({ kind: 'verify', iteration, verification });

      if (verification.goalSatisfied) {
        // Promote the scratch artifact to the real output path. copyFile rather
        // than rename: scratch is in the OS temp dir and may be on another
        // filesystem.
        fs.copyFileSync(scratchArtifact, artifactPath);
        return finish({
          decision: DECISIONS.ALLOW_WITH_TRANSFORMATION,
          reasonCode: 'GOAL_SATISFIED',
          releasePath: artifactPath,
        });
      }

      // --- REPLAN -----------------------------------------------------------
      // The environment disagreed with the plan. The residue recorded in state
      // is what makes the next plan different from this one.
      state.record(STATUS.REPLANNING, 'verification_failed');
      emit({ kind: 'replan', iteration, residualClasses: verification.residualClasses });
    }

    // Unreachable in practice: every path above returns. Fail closed anyway.
    return finish({ decision: DECISIONS.BLOCK, reasonCode: 'LOOP_TERMINATED_WITHOUT_DECISION' });
  } catch (err) {
    state.record(STATUS.FAILED, 'internal_error');
    const event = audit.buildEvent({ state, decision: { decision: DECISIONS.BLOCK, reasonCode: 'INTERNAL_ERROR' } });
    if (opts.auditLog !== false) audit.write(event, opts.auditLog);
    // Security-critical failure fails closed: no artifact, no release.
    const wrapped = new Error(`Guardian run failed: ${err.message}`);
    wrapped.cause = err;
    wrapped.state = state;
    throw wrapped;
  } finally {
    // Never leave partially-protected intermediates behind.
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

module.exports = {
  runGuardian,
  DECISIONS,
  // Re-exported so callers (CLI, tests, future MCP/HTTP surfaces) have one entry
  // point rather than reaching into individual modules.
  SecurityGoal,
  GuardianContext,
  GuardianState,
  STATUS,
  RiskEngine,
  Planner,
  PolicyGuard,
  Executor,
  Verifier,
  audit,
  paths,
};
