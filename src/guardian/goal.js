/**
 * SecurityGoal — the Guardian's persistent objective.
 *
 * The Guardian does not execute a pipeline; it tries to reach a state that
 * satisfies this goal, and it keeps acting until it does, gives up, or escalates.
 * Everything downstream (planner, verifier, termination) reads from here.
 */

const DEFAULT_GOAL = {
  // Hard constraint. If a class the policy prohibits is still detectable in the
  // released artifact, the goal is NOT satisfied — no exceptions, no overrides.
  preventProhibitedExposure: true,
  // Soft objective. Prefer the least destructive transform that still satisfies
  // the hard constraint, so the requesting agent can still do its job.
  preserveTaskUtility: true,
  // Soft objective. Transform classes the policy merely restricts, too.
  minimizeInformationDisclosure: true,
  // Hard constraint. A plan the PolicyGuard rejects is never executed.
  obeySecurityPolicy: true,
  // Termination bound — the Guardian fails closed rather than looping forever.
  maxIterations: 4,
};

class SecurityGoal {
  constructor(overrides = {}) {
    Object.assign(this, DEFAULT_GOAL, overrides);
    const n = this.maxIterations;
    if (!Number.isInteger(n) || n < 1 || n > 16) {
      throw new Error(`SecurityGoal: maxIterations must be an integer in 1..16 (got ${n})`);
    }
    Object.freeze(this);
  }

  /**
   * Is the goal satisfied by a verification result?
   * Only the hard constraints gate release. The soft objectives shape the plan;
   * failing to be maximally elegant must never block a safe release.
   * @param {{ prohibitedRemaining: string[] }} verification
   * @returns {boolean}
   */
  isSatisfiedBy(verification) {
    if (!verification) return false;
    if (!this.preventProhibitedExposure) return true;
    return verification.prohibitedRemaining.length === 0;
  }

  toJSON() {
    return { ...this };
  }
}

module.exports = { SecurityGoal, DEFAULT_GOAL };
