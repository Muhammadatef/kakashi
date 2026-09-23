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

/**
 * THINK -- restate the ask in one line, in the order the reader thinks about
 * it (who is asking, for what, to send where). The rest of the transcript
 * only makes sense once this line is on the page. Emitted right after the
 * header for parity with the loop diagram used in changes_23Sept.md.
 */
function thinkSection(result, context) {
  const lines = [];
  lines.push(chalk.white('THINK'));
  const agent = context.requestingAgent.name;
  const dest = context.destination.label;
  const purpose = context.task
    ? `for "${context.task}"`
    : chalk.yellow('with no stated task — protection will be stricter, never weaker');
  lines.push(chalk.gray(`   ${agent} wants to release `)
    + result.observation.resourceName
    + chalk.gray(' to ') + dest + chalk.gray(' ') + purpose + chalk.gray('.'));
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

/** Human labels for what a purpose needs of a class. */
const NEED_TEXT = {
  REQUIRED_DISTINCT: 'needed, values must stay distinguishable',
  REQUIRED_SHAPE:    'needed, values must keep their shape',
  NOT_REQUIRED:      'not needed by this task',
};

/**
 * UNDERSTAND TASK -- what the Guardian made of the stated purpose, and what that
 * changes. Printed even when nothing was understood, because "I did not
 * understand your task, so I narrowed nothing" is the part a reader must not
 * have to infer from an absent section.
 */
function taskSection(analysis, observation) {
  if (!analysis) return '';
  const lines = [];
  lines.push(chalk.white('UNDERSTAND TASK'));

  if (!analysis.stated) {
    lines.push(chalk.yellow('   No task stated — purpose limitation cannot be applied.'));
    lines.push(chalk.gray('   Pass --task "<what you need the file for>" to narrow the plan.'));
    lines.push('');
    return lines.join('\n');
  }

  if (!analysis.recognised) {
    lines.push(chalk.gray('   Task:    ') + analysis.task);
    lines.push(chalk.yellow('   Purpose not recognised — falling back to conservative defaults.'));
    lines.push('');
    return lines.join('\n');
  }

  lines.push(chalk.gray('   Purpose: ') + analysis.label
    + chalk.gray(` (matched: ${analysis.matchedKeywords.slice(0, 4).join(', ')})`));

  // Only classes actually present in this resource are worth listing. `result`
  // carries the observation's JSON projection, which has `classes` but not the
  // `presentClasses` getter, so derive it from the projection either way.
  const present = observation && observation.classes
    ? Object.keys(observation.classes).filter((c) => observation.classes[c].count > 0)
    : [];
  for (const cls of present) {
    const need = analysis.needFor(cls);
    if (!need) continue;
    const text = NEED_TEXT[need] || need;
    const colour = need === 'NOT_REQUIRED' ? chalk.yellow : chalk.gray;
    lines.push(`     ${cls.padEnd(24)} ${colour(text)}`);
  }
  lines.push(chalk.gray('   A stated task can only make protection stricter, never weaker.'));
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
 * ACT -- what was actually written to disk (or wasn't, when we failed closed).
 * Sourced from the execution result, not re-derived from the plan, so the line
 * reflects what really happened rather than what the planner intended.
 */
function actSection(execResult, iteration, total) {
  const lines = [];
  lines.push(chalk.white(total > 1 ? `ACT — attempt #${iteration}` : 'ACT'));
  if (!execResult) {
    lines.push(chalk.red('   Nothing written -- Guardian failed closed before execution.'));
    lines.push('');
    return lines.join('\n');
  }
  const rc = execResult.replacementCount || 0;
  const byClass = execResult.byClass && Object.keys(execResult.byClass).length
    ? '   (' + Object.entries(execResult.byClass).map(([c, n]) => `${c} x${n}`).join(', ') + ')'
    : '';
  lines.push(chalk.gray(`   Wrote scratch artifact with ${rc} replacement(s).${byClass}`));
  lines.push(chalk.gray('   The artifact is not promoted to the output path until VERIFY passes.'));
  lines.push('');
  return lines.join('\n');
}

/**
 * Interleave each iteration's plan with the act that carried it out and the
 * verification that judged the outcome, so the transcript reads in the exact
 * order the events actually happened. Mirrors the loop diagram in
 * changes_23Sept.md: THINK -> OBSERVE -> ASSESS -> PLAN -> ACT -> VERIFY -> REACT.
 */
function iterationSections(result) {
  const plans = (result.state && result.state.authorizedPlans) || [];
  const execs = (result.state && result.state.toolResults) || [];
  const verifications = result.verifications || [];
  const total = Math.max(plans.length, execs.length, verifications.length);
  const out = [];
  for (let i = 0; i < total; i++) {
    if (plans[i]) out.push(planSection(plans[i].toJSON(), i + 1, total));
    if (execs[i]) out.push(actSection(execs[i], i + 1, total));
    if (verifications[i]) out.push(verifySection(verifications[i], total));
  }
  return out;
}

function decisionSection(result) {
  const style = DECISION_STYLE[result.decision];
  const lines = [];
  // Header reads REACT per the loop diagram in changes_23Sept.md ("what the
  // Guardian did with the verification result"), with the terminal decision
  // label immediately underneath so downstream consumers can still grep on it.
  lines.push(chalk.white('REACT'));
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
  // THINK -> OBSERVE -> ASSESS -> PLAN -> ACT -> VERIFY -> REACT, in that order.
  // The section functions below produce the labels; the caller (this function)
  // is what fixes their order on the page.
  if (result.observation) parts.push(thinkSection(result, context));
  if (result.observation) parts.push(observeSection(result.observation));
  if (context.taskAnalysis) parts.push(taskSection(context.taskAnalysis, result.observation));
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

module.exports = {
  renderRun,
  // Individual sections exported so tests (and any future streaming renderer)
  // can assert on the exact stage labels the plan mandates.
  thinkSection,
  taskSection,
  actSection,
  DECISION_STYLE,
  TOOL_VERB,
  REASON_TEXT,
  NEED_TEXT,
};
