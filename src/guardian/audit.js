/**
 * Guardian audit events.
 *
 * Kakashi's existing JSONL log (agent/guard.js --log) records that a scan
 * happened. It cannot record a DECISION, because before the Guardian there were
 * none. This module adds decision-level events in the same append-only JSONL
 * shape, written under the same ~/.kakashi directory the stats file already uses.
 *
 * SAFETY INVARIANT: an audit event is assembled exclusively from class names,
 * pattern ids, tool names, reason codes and integer counts. Every object it
 * serialises comes from a `toJSON()` that is itself value-free -- Observation
 * cannot hold a matched value, Action cannot hold one, and the state projection
 * is built from those two. There is no code path from a finding's `original` or
 * `replacement` field into an audit event. tests/guardian.test.js asserts this by
 * grepping the written log for every secret in the fixture.
 *
 * Writing is best-effort and never fails a run: an unwritable log must not stop
 * the Guardian from blocking a dangerous release.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { STATS_DIR } = require('../lib/stats');

const DEFAULT_LOG = path.join(STATS_DIR, 'guardian-audit.jsonl');

/**
 * Build the audit event for a completed Guardian run.
 * @param {object} args
 * @param {import('./state').GuardianState} args.state
 * @param {object} args.decision
 * @returns {object}
 */
function buildEvent({ state, decision }) {
  const first = state.observations[0] || null;
  const risk = state.latestRisk;
  const verification = state.latestVerification;
  const lastPlan = state.authorizedPlans[state.authorizedPlans.length - 1] || null;

  return {
    schema: 'kakashi.guardian.v1',
    eventId: crypto.randomUUID(),
    at: new Date().toISOString(),

    // Who and where -- ids only, never the resource's absolute path.
    agent: state.context.requestingAgent.id,
    agentRecognised: state.context.requestingAgent.recognised,
    agentTrust: state.context.requestingAgent.trust,
    destination: state.context.destination.id,
    policy: state.context.policy,
    // Free text the CALLER supplied, sanitised and capped. It is never trusted
    // as an instruction; the only thing read out of it is the intent below, and
    // that can only make the protection stricter (guardian/task.js).
    task: state.context.task,
    taskIntent: state.context.taskAnalysis.intentId,
    taskRecognised: state.context.taskAnalysis.recognised,
    taskMatchedKeywords: [...state.context.taskAnalysis.matchedKeywords],
    taskUnnecessaryClasses: state.context.taskAnalysis.unnecessaryClasses,

    // What was found -- classes and counts.
    resourceType: first ? first.resourceType : null,
    resourceName: first ? first.resourceName : null,
    findingClasses: first ? first.presentClasses : [],
    findingCount: first ? first.totalFindings : 0,
    maxSeverity: first ? first.maxSeverity : null,
    pdplArticles: first ? first.pdplArticles : [],

    // How it was judged.
    riskScore: risk ? risk.score : null,
    riskLevel: risk ? risk.level : null,
    reasonCodes: risk ? [...risk.reasonCodes] : [],

    // What was decided and done.
    decision: decision.decision,
    decisionReason: decision.reasonCode,
    actions: lastPlan ? lastPlan.actions.map((a) => ({ tool: a.tool, targetClass: a.targetClass, reasonCode: a.reasonCode })) : [],
    policyRejections: state.rejections.map((r) => ({
      iteration: r.iteration,
      codes: (r.violations || []).map((v) => v.code),
      classes: (r.violations || []).map((v) => v.targetClass),
    })),
    approvalsRequested: state.approvalsRequested,

    // Whether it worked.
    iterations: state.iteration,
    verificationAttempts: state.verifications.length,
    verificationPassed: verification ? verification.goalSatisfied : false,
    residualClasses: verification ? verification.residualClasses : [],
    prohibitedValuesReleased: decision.decision === 'BLOCK' || decision.decision === 'REQUIRE_APPROVAL'
      ? 0
      : (verification ? verification.residualClasses.length : 0),
    durationMs: Date.now() - state.startedAt,
  };
}

/**
 * Append an event to the JSONL log. Best-effort by design.
 * @param {object} event
 * @param {string} [logPath]
 * @returns {{ written: boolean, path: string, error?: string }}
 */
function write(event, logPath) {
  const target = logPath || DEFAULT_LOG;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(target, JSON.stringify(event) + '\n', 'utf8');
    return { written: true, path: target };
  } catch (err) {
    return { written: false, path: target, error: err.message };
  }
}

module.exports = { buildEvent, write, DEFAULT_LOG };
