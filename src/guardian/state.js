/**
 * GuardianState — the Guardian's memory for one run.
 *
 * This is the module that makes the system agentic rather than pipelined. The
 * planner does not just read the current observation; it reads what it already
 * tried, what the policy already rejected, and what verification already found
 * still sitting in the artifact. That history is what lets iteration N+1 choose a
 * genuinely different action from iteration N.
 *
 * SECURITY: state may hold raw text transiently (the executor needs the source
 * text to transform it), but `toJSON()` — the only thing that ever reaches an
 * audit log, a CLI renderer or a caller — emits classes, ids and counts only.
 */

const STATUS = {
  INITIALIZED:          'INITIALIZED',
  OBSERVING:            'OBSERVING',
  UNDERSTANDING_TASK:   'UNDERSTANDING_TASK',
  ASSESSING:            'ASSESSING',
  PLANNING:             'PLANNING',
  VALIDATING_PLAN:      'VALIDATING_PLAN',
  EXECUTING:            'EXECUTING',
  VERIFYING:            'VERIFYING',
  REPLANNING:           'REPLANNING',
  WAITING_FOR_APPROVAL: 'WAITING_FOR_APPROVAL',
  SAFE:                 'SAFE',
  BLOCKED:              'BLOCKED',
  FAILED:               'FAILED',
};

/** Statuses from which the loop must not continue. */
const TERMINAL = new Set([STATUS.SAFE, STATUS.BLOCKED, STATUS.FAILED, STATUS.WAITING_FOR_APPROVAL]);

class GuardianState {
  /**
   * @param {object} opts
   * @param {import('./goal').SecurityGoal} opts.goal
   * @param {import('./context').GuardianContext} opts.context
   */
  constructor({ goal, context }) {
    if (!goal) throw new Error('GuardianState: goal is required');
    if (!context) throw new Error('GuardianState: context is required');
    this.goal = goal;
    this.context = context;
    this.iteration = 0;
    this.status = STATUS.INITIALIZED;

    this.observations = [];
    this.riskAssessments = [];
    this.proposedPlans = [];
    this.authorizedPlans = [];
    this.rejections = [];
    this.executedActions = [];
    this.toolResults = [];
    this.verifications = [];
    this.approvalsRequested = [];
    this.transitions = [];

    this.startedAt = Date.now();
    this.record(STATUS.INITIALIZED, 'guardian_run_started');
  }

  get isTerminal() {
    return TERMINAL.has(this.status);
  }

  /** Move to a new status and append to the transition log. */
  record(status, note) {
    if (!STATUS[status]) throw new Error(`GuardianState: unknown status "${status}"`);
    this.status = status;
    this.transitions.push({ iteration: this.iteration, status, note: note || null, at: Date.now() });
    return this;
  }

  beginIteration() {
    this.iteration += 1;
    return this.iteration;
  }

  addObservation(o)      { this.observations.push(o); return o; }
  addRiskAssessment(r)   { this.riskAssessments.push(r); return r; }
  addProposedPlan(p)     { this.proposedPlans.push(p); return p; }
  addAuthorizedPlan(p)   { this.authorizedPlans.push(p); return p; }
  addApprovalRequest(a)  { this.approvalsRequested.push(a); return a; }

  /**
   * A plan (or part of one) the PolicyGuard refused. The planner reads this on
   * the next pass so it does not propose the same forbidden transform twice.
   */
  recordRejection(rejection) {
    this.rejections.push({ iteration: this.iteration, ...rejection });
    return rejection;
  }

  recordResult(result) {
    this.toolResults.push(result);
    for (const a of result.actions || []) {
      this.executedActions.push({ iteration: this.iteration, ...a });
    }
    return result;
  }

  recordVerification(v) {
    this.verifications.push({ iteration: this.iteration, ...v });
    return v;
  }

  get latestObservation()    { return this.observations[this.observations.length - 1] || null; }
  get latestVerification()   { return this.verifications[this.verifications.length - 1] || null; }
  get latestRisk()           { return this.riskAssessments[this.riskAssessments.length - 1] || null; }

  /**
   * Which transform has this class already been through, across every executed
   * plan? The planner's escalation ladder is driven entirely off this.
   * @param {string} cls
   * @returns {string[]} tool names already tried, in order
   */
  toolsTriedFor(cls) {
    return this.executedActions.filter((a) => a.targetClass === cls).map((a) => a.tool);
  }

  /** Transforms the PolicyGuard has already refused for a class this run. */
  rejectedToolsFor(cls) {
    const out = [];
    for (const r of this.rejections) {
      for (const v of r.violations || []) {
        if (v.targetClass === cls && v.tool) out.push(v.tool);
      }
    }
    return out;
  }

  /** Audit-safe projection. No raw values, no file bodies, no paths beyond basename. */
  toJSON() {
    return {
      status: this.status,
      iterations: this.iteration,
      goal: this.goal.toJSON(),
      context: this.context.toJSON(),
      observations: this.observations.map((o) => o.toJSON()),
      riskAssessments: this.riskAssessments.map((r) => r.toJSON()),
      proposedPlans: this.proposedPlans.map((p) => p.toJSON()),
      authorizedPlans: this.authorizedPlans.map((p) => p.toJSON()),
      rejections: this.rejections,
      verifications: this.verifications,
      approvalsRequested: this.approvalsRequested,
      transitions: this.transitions,
      durationMs: Date.now() - this.startedAt,
    };
  }
}

module.exports = { GuardianState, STATUS, TERMINAL };
