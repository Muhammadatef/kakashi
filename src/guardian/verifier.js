/**
 * Verifier -- the component that makes the loop a loop.
 *
 * `kakashi mask` has never checked its own work: it writes an output and exits.
 * The Guardian re-reads the artifact FROM DISK -- through the same
 * formats.readFile the rest of Kakashi uses, so a lossy or buggy format writer is
 * caught too -- and runs the full 35-pattern detector over it again. Not the
 * in-memory string the executor produced: the bytes that actually landed.
 *
 * The criterion is DETECTABILITY, not intent. If a prohibited class is still
 * detectable in the artifact, the goal is unsatisfied, regardless of why. This is
 * deliberately strict and it has a real consequence worth stating plainly:
 *
 *   `maskText` mode `fake` substitutes values from `pattern.fakeValues`, which
 *   are format-preserving and therefore still match their own pattern.
 *   `national_id`'s fake is `784-1990-9999999-0`; `intl_phone`'s are real-shaped
 *   UAE numbers. A synthetic Emirates ID will FAIL verification.
 *
 * That is correct, not a bug. A downstream DLP scanner cannot tell a synthetic
 * Emirates ID from a live one either, and a synthetic UAE mobile number may well
 * belong to somebody. Format preservation is acceptable for a class the policy
 * merely restricts; it is not acceptable for one the policy prohibits. The
 * planner learns this from the verifier at runtime and escalates.
 */

const { observe } = require('./observe');
const { rulesFor } = require('./policy');

const Verifier = {
  /**
   * @param {object} args
   * @param {string} args.artifactPath - the file the executor just wrote
   * @param {import('./context').GuardianContext} args.context
   * @param {import('./goal').SecurityGoal} args.goal
   * @returns {Promise<object>} verification result (audit-safe)
   */
  async verify({ artifactPath, context, goal }) {
    const rules = rulesFor(context.policy, context.destination.id);

    // Re-read and re-scan. Full detector, no `enabled` filter -- we are asking
    // "what is in this file?", not "did my transform run?".
    const { observation } = await observe(artifactPath, { kind: 'artifact' });

    const deniedRemaining = rules.denyOutright.filter((c) => observation.hasClass(c));
    const prohibitedRemaining = rules.prohibited.filter((c) => observation.hasClass(c));
    const restrictedRemaining = rules.restricted.filter((c) => observation.hasClass(c));

    // What the planner must act on next. Denied classes are included because a
    // denied class surviving into the artifact is strictly worse than a
    // prohibited one, and both need the same escalation treatment.
    const residualClasses = [...new Set([...deniedRemaining, ...prohibitedRemaining])];

    const goalSatisfied = goal.isSatisfiedBy({ prohibitedRemaining: residualClasses });

    return {
      goalSatisfied,
      artifactFindings: observation.totalFindings,
      deniedRemaining,
      prohibitedRemaining,
      restrictedRemaining,
      residualClasses,
      // Per-class counts for the explanation the human reads. Metadata only --
      // Observation cannot carry a matched value by construction.
      remainingByClass: residualClasses.reduce((acc, c) => {
        acc[c] = observation.classes[c].count;
        return acc;
      }, {}),
      observation: observation.toJSON(),
    };
  },
};

module.exports = { Verifier };
