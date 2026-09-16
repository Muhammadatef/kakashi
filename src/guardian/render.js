/**
 * CLI rendering for the Guardian.
 *
 * Every number printed here comes from an actual run -- observation counts from
 * the detector, risk from the arithmetic in risk.js, verification results from
 * re-scanning the artifact on disk. Nothing is illustrative and nothing is
 * pre-computed for display.
 *
 * Explainability rule: we print reason codes, policy rules, risk factors,
 * actions and verification outcomes. We never print a matched value, and there
 * is no internal narrative to expose -- the "reasoning" is the weights table in
 * risk.js and the ladder in planner.js, both of which are readable source.
 */

const chalk = require('chalk');

const DECISION_STYLE = {
  ALLOW:                     { color: chalk.green,  label: 'ALLOW' },
  ALLOW_WITH_TRANSFORMATION: { color: chalk.green,  label: 'ALLOW WITH TRANSFORMATION' },
  REQUIRE_APPROVAL:          { color: chalk.yellow, label: 'REQUIRE HUMAN APPROVAL' },
  BLOCK:                     { color: chalk.red,    label: 'BLOCK' },
};

const TOOL_VERB = {
  keep:       'preserved',
  synthesize: 'replaced with synthetic values',
  tokenize:   'replaced with stable tokens',
  redact:     'removed',
};

const REASON_TEXT = {
  PROHIBITED_AT_DESTINATION:            'prohibited at this destination',
  RESTRICTED_AT_DESTINATION:            'restricted at this destination',
  RESIDUE_AFTER_VERIFICATION:           'found in the artifact after the previous attempt',
  ESCALATED_AFTER_VERIFICATION_FAILURE: 'escalated — previous transform was still detectable',
  ESCALATED_AFTER_POLICY_REJECTION:     'escalated — previous transform was refused by policy',
  PERMITTED_FOR_TASK_UTILITY:           'permitted here, kept so the task remains possible',
  NOT_REQUIRED_FOR_TASK:                'not required for the requested task',
  NO_FINDINGS_FOR_CLASS:                'no findings for this class',
};

const DECISION_EXPLANATION = {
  NO_SENSITIVE_DATA:            'No sensitive data was detected in this resource.',
  NO_PROTECTION_REQUIRED:       'Nothing detected here is prohibited or restricted at this destination.',
  GOAL_SATISFIED:               'The protected artifact contains no prohibited data class.',
  HUMAN_APPROVAL_REQUIRED:      'Policy requires a person to approve this release.',
  CLASS_DENIED_AT_DESTINATION:  'Policy forbids this data class reaching this destination in any form.',
  PROTECTION_EXHAUSTED:         'Every permitted transform was tried and the artifact is still unsafe.',
  MAX_ITERATIONS_EXHAUSTED:     'A safe state was not reached within the iteration budget.',
  LOOP_TERMINATED_WITHOUT_DECISION: 'The loop ended without a decision; failing closed.',
  INTERNAL_ERROR:               'An internal error occurred; failing closed.',
};

function header(result, context) {
  const lines = [];
  lines.push('');
  lines.push(chalk.cyan('Kakashi — Guardian'));
  lines.push('');
  lines.push(chalk.gray('   Goal:        ') + 'Protect sensitive information while preserving task utility');
  lines.push(chalk.gray('   Agent:       ') + context.requestingAgent.name
    + (context.requestingAgent.recognised ? '' : chalk.yellow(' (unrecognised — conservative defaults)')));
  lines.push(chalk.gray('   Resource:    ') + result.observation.resourceName);
  if (context.task) lines.push(chalk.gray('   Task:        ') + context.task);
  lines.push(chalk.gray('   Destination: ') + context.destination.label);
  lines.push(chalk.gray('   Policy:      ') + context.policy);
  lines.push('');
  return lines.join('\n');
}

function observeSection(observation) {
  const lines = [];
  lines.push(chalk.white('OBSERVE'));
  if (observation.totalFindings === 0) {
    lines.push(chalk.gray('   No sensitive data detected.'));
    lines.push('');
    return lines.join('\n');
  }
  lines.push(chalk.gray(`   ${observation.totalFindings} finding(s) across ${Object.keys(observation.classes).length} data class(es)`));
  for (const [cls, b] of Object.entries(observation.classes)) {
    const badge = b.checksumVerified > 0 ? chalk.red(`  [${b.checksumVerified} checksum-verified]`) : '';
    lines.push(`     ${cls.padEnd(24)} ${String(b.count).padStart(4)}  ${chalk.gray(b.maxSeverity)}${badge}`);
  }
  if (observation.pdplArticles.length) {
    lines.push(chalk.gray(`   PDPL: ${observation.pdplArticles.join(', ')}`));
  }
  lines.push('');
  return lines.join('\n');
}

function assessSection(risk) {
  const lines = [];
  lines.push(chalk.white('ASSESS'));
  const tone = risk.level === 'CRITICAL' || risk.level === 'HIGH' ? chalk.red : chalk.yellow;
  lines.push(`   Risk: ${tone(`${risk.score}/100 — ${risk.level}`)}`);
  for (const f of risk.factors) {
    lines.push(chalk.gray(`     +${String(f.points).padStart(2)}  ${f.code} — ${f.detail}`));
  }
  if (risk.deniedClasses.length) {
    lines.push(chalk.red(`     !!  policy denies: ${risk.deniedClasses.join(', ')}`));
  }
  lines.push('');
  return lines.join('\n');
}

function planSection(plan, attempt, total) {
  const lines = [];
  lines.push(chalk.white(total > 1 ? `PLAN — attempt #${attempt}` : 'PLAN'));
  for (const a of plan.actions) {
    const verb = TOOL_VERB[a.tool] || a.tool;
    const why = REASON_TEXT[a.reasonCode] || a.reasonCode;
    const tone = a.tool === 'keep' ? chalk.gray : chalk.white;
    lines.push(`   ${tone(a.targetClass.padEnd(24))} → ${verb}`);
    lines.push(chalk.gray(`   ${' '.repeat(24)}   ${why}`));
  }
  lines.push('');
  return lines.join('\n');
}

function verifySection(v, total) {
  const lines = [];
  lines.push(chalk.white(total > 1 ? `VERIFY — attempt #${v.iteration}` : 'VERIFY'));
  if (v.goalSatisfied) {
    lines.push(chalk.green('   PASS — 0 prohibited class(es) remain in the artifact'));
    lines.push('');
    return lines.join('\n');
  }
  const detail = Object.entries(v.remainingByClass).map(([c, n]) => `${c} x${n}`).join(', ');
  lines.push(chalk.yellow(`   FAIL — still detectable after transformation: ${detail}`));
  lines.push('');
  lines.push(chalk.white('REPLAN'));
  lines.push(chalk.gray(`   ${detail.split(',')[0].trim()} survived its transform; escalating to a stronger one.`));
  lines.push('');
  return lines.join('\n');
}

/**
 * Interleave each iteration's plan with the verification that judged it, so the
 * transcript reads in the order the events actually happened rather than showing
 * a final plan above the failure that produced it.
 */
function iterationSections(result) {
  const plans = (result.state && result.state.authorizedPlans) || [];
  const verifications = result.verifications || [];
  const total = Math.max(plans.length, verifications.length);
  const out = [];
  for (let i = 0; i < total; i++) {
    if (plans[i]) out.push(planSection(plans[i].toJSON(), i + 1, total));
    if (verifications[i]) out.push(verifySection(verifications[i], total));
  }
  return out;
}

function decisionSection(result) {
  const style = DECISION_STYLE[result.decision];
  const lines = [];
  lines.push(chalk.white('DECISION'));
  lines.push('   ' + style.color.bold(style.label));
  const why = DECISION_EXPLANATION[result.reasonCode] || result.reasonCode;
  lines.push(chalk.gray(`   ${why}`));
  lines.push('');

  if (result.decision === 'REQUIRE_APPROVAL') {
    lines.push(chalk.yellow(`   Awaiting approval for: ${result.approvalsNeeded.join(', ')}`));
    lines.push(chalk.gray(`   Re-run with --approve ${result.approvalsNeeded.join(',')} to grant it.`));
    lines.push(chalk.gray('   No artifact was written.'));
    lines.push('');
  } else if (result.decision === 'BLOCK') {
    lines.push(chalk.red('   No artifact was written. Nothing was released.'));
    lines.push('');
  } else if (result.releasePath) {
    const last = result.verifications[result.verifications.length - 1];
    lines.push(chalk.gray('   Safe to release: ') + result.releasePath);
    lines.push(chalk.gray(`   Iterations: ${result.iterations}  ·  Verification attempts: ${result.verifications.length}`));
    lines.push(chalk.gray(`   Prohibited values released: ${last ? last.residualClasses.length : 0}`));
    if (result.decision === 'ALLOW') {
      lines.push(chalk.gray('   Original released unchanged — no transformation was necessary.'));
    }
    lines.push('');
  }

  lines.push(chalk.gray(`   Audit event: ${result.auditEvent.eventId}`));
  if (result.auditLog && result.auditLog.written) {
    lines.push(chalk.gray(`   Audit log:   ${result.auditLog.path}`));
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Full human-readable report for a completed run.
 * @param {object} result - from runGuardian()
 * @param {import('./context').GuardianContext} context
 * @returns {string}
 */
function renderRun(result, context) {
  const parts = [header(result, context)];
  if (result.observation) parts.push(observeSection(result.observation));
  if (result.risk) parts.push(assessSection(result.risk));
  const iterations = iterationSections(result);
  if (iterations.length) {
    parts.push(...iterations);
  } else if (result.plan) {
    // A plan that was proposed but never authorised (policy rejection, or a
    // block before execution) still deserves to be shown.
    parts.push(planSection(result.plan, 1, 1));
  }
  parts.push(decisionSection(result));
  return parts.join('\n');
}

module.exports = { renderRun, DECISION_STYLE, TOOL_VERB, REASON_TEXT };
