const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const { runGuardian, DECISIONS } = require('../src/guardian');
const { SecurityGoal } = require('../src/guardian/goal');
const { GuardianContext } = require('../src/guardian/context');
const { GuardianState, STATUS } = require('../src/guardian/state');
const { observe } = require('../src/guardian/observe');
const { RiskEngine } = require('../src/guardian/risk');
const { Planner } = require('../src/guardian/planner');
const { PolicyGuard } = require('../src/guardian/policy');
const { Action, ProtectionPlan } = require('../src/guardian/actions');
const classes = require('../src/guardian/classes');
const paths = require('../src/guardian/paths');

const FIX = path.join(__dirname, 'fixtures');
const EMPLOYEES = path.join(FIX, 'guardian_employees.md');
const SERVICE_ENV = path.join(FIX, 'guardian_service.env');

// Raw values that must NEVER appear in an audit log, an observation projection,
// or any other Guardian output. Taken verbatim from the fixtures.
const SECRETS = [
  '784-1988-1234567-0',
  '784-1992-7654321-2',
  'ahmed.hassan@example.ae',
  'fatima.ali@example.ae',
  'AE070331234567890123456',
  '+971 50 123 4567',
  'Pr0d-P4ss-9f2',
  'sk-proj-abc123def456ghi789jkl012mno345pqr678stu',
  'AKIAIOSFODNN7EXAMPLE',
];

function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Build a state that already carries one observation — what PolicyGuard needs. */
async function stateFor(resource, ctxOpts = {}) {
  const goal = new SecurityGoal();
  const context = new GuardianContext({ resource, ...ctxOpts });
  const state = new GuardianState({ goal, context });
  const { observation } = await observe(paths.resolveResource(resource));
  state.addObservation(observation);
  state.addRiskAssessment(RiskEngine.assess({ observation, context }));
  return { goal, context, state, observation };
}

async function runGuardianTests() {
  let passed = 0;
  let failed = 0;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kakashi-guardian-test-'));

  async function check(name, fn) {
    try {
      await fn();
      passed++;
    } catch (err) {
      console.error(`FAIL ${name}: ${err.message}`);
      failed++;
    }
  }

  // =========================================================================
  // CLASSES
  // =========================================================================

  await check('every detection pattern is classified (drift guard)', () => {
    assert.deepStrictEqual(classes.unmappedPatternIds(), [],
      'a pattern was added to engine/patterns.js without a sensitivity class');
  });

  await check('class -> pattern id mapping is total and disjoint', () => {
    const { PATTERNS } = require('../src/engine/patterns');
    const seen = new Set();
    for (const cls of classes.CLASSES) {
      for (const id of classes.patternIdsFor(cls)) {
        assert(!seen.has(id), `pattern ${id} belongs to more than one class`);
        seen.add(id);
      }
    }
    assert.strictEqual(seen.size, PATTERNS.length);
  });

  // =========================================================================
  // STATE
  // =========================================================================

  await check('state records transitions and is non-terminal until a decision', () => {
    const goal = new SecurityGoal();
    const context = new GuardianContext({ resource: EMPLOYEES });
    const state = new GuardianState({ goal, context });
    assert.strictEqual(state.status, STATUS.INITIALIZED);
    assert.strictEqual(state.isTerminal, false);
    state.record(STATUS.OBSERVING);
    state.record(STATUS.ASSESSING);
    assert.strictEqual(state.transitions.length, 3);
    state.record(STATUS.BLOCKED);
    assert.strictEqual(state.isTerminal, true);
  });

  await check('state rejects an unknown status', () => {
    const state = new GuardianState({
      goal: new SecurityGoal(),
      context: new GuardianContext({ resource: EMPLOYEES }),
    });
    assert.throws(() => state.record('NOT_A_STATUS'), /unknown status/);
  });

  await check('state tracks which tools were tried per class', () => {
    const state = new GuardianState({
      goal: new SecurityGoal(),
      context: new GuardianContext({ resource: EMPLOYEES }),
    });
    state.beginIteration();
    state.recordResult({ actions: [{ tool: 'synthesize', targetClass: 'CONTACT' }] });
    state.beginIteration();
    state.recordResult({ actions: [{ tool: 'tokenize', targetClass: 'CONTACT' }] });
    assert.deepStrictEqual(state.toolsTriedFor('CONTACT'), ['synthesize', 'tokenize']);
    assert.deepStrictEqual(state.toolsTriedFor('FINANCIAL'), []);
  });

  await check('maxIterations is validated', () => {
    assert.throws(() => new SecurityGoal({ maxIterations: 0 }), /maxIterations/);
    assert.throws(() => new SecurityGoal({ maxIterations: 99 }), /maxIterations/);
  });

  // =========================================================================
  // OBSERVATION — reuses the existing Kakashi scanner, leaks nothing
  // =========================================================================

  await check('observation is produced by the existing Kakashi detector', async () => {
    const { observation } = await observe(paths.resolveResource(EMPLOYEES));
    const { maskText } = require('../src/engine/masker');
    const raw = maskText(fs.readFileSync(EMPLOYEES, 'utf8'));
    assert.strictEqual(observation.totalFindings, raw.findings.length,
      'Guardian must not re-implement detection — counts must match maskText exactly');
    assert(observation.hasClass('GOVERNMENT_IDENTIFIER'));
    assert(observation.hasClass('FINANCIAL'));
  });

  await check('observation carries checksum verification from pdpl-mapping', async () => {
    const { observation } = await observe(paths.resolveResource(EMPLOYEES));
    assert(observation.classes.GOVERNMENT_IDENTIFIER.checksumVerified > 0,
      'a valid Emirates ID should be badged as checksum-verified');
  });

  await check('observation projection contains no raw values', async () => {
    const { observation } = await observe(paths.resolveResource(EMPLOYEES));
    const json = JSON.stringify(observation.toJSON());
    for (const s of SECRETS) {
      assert(!json.includes(s), `observation leaked a raw value: ${s.slice(0, 12)}...`);
    }
  });

  await check('observation rejects an unsupported format', async () => {
    const bin = path.join(tmp, 'thing.bin');
    fs.writeFileSync(bin, 'x');
    await assert.rejects(() => observe(paths.resolveResource(bin)), /unsupported resource format/);
  });

  // =========================================================================
  // RISK
  // =========================================================================

  await check('risk is LOW and scored 0 when nothing sensitive is present', async () => {
    const clean = path.join(tmp, 'clean.md');
    // NOTE: deliberately all-lowercase prose. The existing `full_name` pattern
    // uses `\s` between capitalised words, so "Notes\n\nNothing" reads as a name --
    // a pre-existing false positive in engine/patterns.js, out of scope here.
    fs.writeFileSync(clean, '# notes\n\nnothing interesting here.\n');
    const { observation } = await observe(paths.resolveResource(clean));
    const ctx = new GuardianContext({ resource: clean, destination: 'external_model', requestingAgent: 'cursor' });
    const risk = RiskEngine.assess({ observation, context: ctx });
    assert.strictEqual(risk.score, 0);
    assert.strictEqual(risk.level, 'LOW');
    assert.deepStrictEqual([...risk.reasonCodes], ['NO_SENSITIVE_DATA']);
  });

  await check('same data scores higher to an external destination than a local one', async () => {
    const { observation } = await observe(paths.resolveResource(EMPLOYEES));
    const local = RiskEngine.assess({
      observation,
      context: new GuardianContext({ resource: EMPLOYEES, destination: 'local', requestingAgent: 'cursor' }),
    });
    const external = RiskEngine.assess({
      observation,
      context: new GuardianContext({ resource: EMPLOYEES, destination: 'external_model', requestingAgent: 'cursor' }),
    });
    assert(external.score > local.score, `${external.score} should exceed ${local.score}`);
    assert(external.reasonCodes.includes('EXTERNAL_DESTINATION'));
  });

  await check('an unknown agent scores higher than a recognised one', async () => {
    const { observation } = await observe(paths.resolveResource(EMPLOYEES));
    const known = RiskEngine.assess({
      observation,
      context: new GuardianContext({ resource: EMPLOYEES, destination: 'known_external', requestingAgent: 'cursor' }),
    });
    const stranger = RiskEngine.assess({
      observation,
      context: new GuardianContext({ resource: EMPLOYEES, destination: 'known_external', requestingAgent: 'who-is-this' }),
    });
    assert(stranger.score > known.score);
    assert(stranger.reasonCodes.includes('UNRECOGNISED_AGENT'));
    assert(stranger.reasonCodes.includes('LOW_TRUST_AGENT'));
  });

  await check('credentials bound for an unknown destination demand an immediate block', async () => {
    const { observation } = await observe(paths.resolveResource(SERVICE_ENV));
    const risk = RiskEngine.assess({
      observation,
      context: new GuardianContext({ resource: SERVICE_ENV, destination: 'unknown', requestingAgent: 'cursor' }),
    });
    assert.strictEqual(risk.requiresImmediateBlock, true);
    assert.deepStrictEqual(risk.deniedClasses, ['CREDENTIAL']);
    assert.strictEqual(risk.level, 'CRITICAL');
  });

  await check('risk levels span the full range', async () => {
    const { observation } = await observe(paths.resolveResource(EMPLOYEES));
    const levels = ['local', 'known_external', 'external_model', 'unknown'].map((d) =>
      RiskEngine.assess({
        observation,
        context: new GuardianContext({ resource: EMPLOYEES, destination: d, requestingAgent: 'cursor' }),
      }).level);
    assert(levels.includes('CRITICAL'), `expected a CRITICAL level among ${levels}`);
    assert(new Set(levels).size > 1, 'destination must actually move the level');
  });

  // =========================================================================
  // PLANNER — minimum necessary data, and escalation from feedback
  // =========================================================================

  await check('planner keeps classes the destination permits (minimum necessary)', async () => {
    const { goal, context, state, observation } = await stateFor(EMPLOYEES, {
      destination: 'external_model', requestingAgent: 'cursor',
    });
    const plan = Planner.createPlan({ goal, observation, assessment: state.latestRisk, context, state });
    const quasi = plan.actionFor('QUASI_IDENTIFIER');
    assert(quasi, 'QUASI_IDENTIFIER must appear in the plan');
    assert.strictEqual(quasi.tool, 'keep',
      'dates/DOB are neither prohibited nor restricted here — dropping them would break the task');
    assert.strictEqual(quasi.reasonCode, 'PERMITTED_FOR_TASK_UTILITY');
  });

  await check('planner prefers the least destructive permitted transform', async () => {
    const { goal, context, state, observation } = await stateFor(EMPLOYEES, {
      destination: 'external_model', requestingAgent: 'cursor',
    });
    const plan = Planner.createPlan({ goal, observation, assessment: state.latestRisk, context, state });
    assert.strictEqual(plan.actionFor('CONTACT').tool, 'synthesize',
      'CONTACT permits synthesize, which preserves the most utility');
    assert.strictEqual(plan.actionFor('GOVERNMENT_IDENTIFIER').tool, 'tokenize',
      'GOVERNMENT_IDENTIFIER does not permit synthesize, so the ladder starts at tokenize');
  });

  await check('planner escalates ONLY the class that failed verification', async () => {
    const { goal, context, state, observation } = await stateFor(EMPLOYEES, {
      destination: 'external_model', requestingAgent: 'cursor',
    });
    state.beginIteration();
    state.recordResult({
      actions: [
        { tool: 'synthesize', targetClass: 'CONTACT' },
        { tool: 'synthesize', targetClass: 'PERSON_NAME' },
      ],
    });
    state.recordVerification({ goalSatisfied: false, residualClasses: ['CONTACT'] });

    const plan = Planner.createPlan({ goal, observation, assessment: state.latestRisk, context, state });
    assert.strictEqual(plan.actionFor('CONTACT').tool, 'tokenize', 'the failing class must escalate');
    assert.strictEqual(plan.actionFor('CONTACT').reasonCode, 'ESCALATED_AFTER_VERIFICATION_FAILURE');
    assert.strictEqual(plan.actionFor('PERSON_NAME').tool, 'synthesize',
      'a class that passed must NOT be escalated — that would destroy utility for no reason');
  });

  await check('planner reports exhaustion rather than repeating itself', async () => {
    const { goal, context, state, observation } = await stateFor(EMPLOYEES, {
      destination: 'external_model', requestingAgent: 'cursor',
    });
    // Burn every permitted transform for GOVERNMENT_IDENTIFIER.
    state.beginIteration();
    state.recordResult({ actions: [{ tool: 'tokenize', targetClass: 'GOVERNMENT_IDENTIFIER' }] });
    state.recordVerification({ goalSatisfied: false, residualClasses: ['GOVERNMENT_IDENTIFIER'] });
    state.beginIteration();
    state.recordResult({ actions: [{ tool: 'redact', targetClass: 'GOVERNMENT_IDENTIFIER' }] });
    state.recordVerification({ goalSatisfied: false, residualClasses: ['GOVERNMENT_IDENTIFIER'] });

    const plan = Planner.createPlan({ goal, observation, assessment: state.latestRisk, context, state });
    assert(plan.meta.exhaustedClasses.includes('GOVERNMENT_IDENTIFIER'));
    assert.strictEqual(plan.actionFor('GOVERNMENT_IDENTIFIER'), null);
  });

  // =========================================================================
  // POLICY GUARD — more authority than whatever proposed the plan
  // =========================================================================

  await check('policy guard authorises a sound plan', async () => {
    const { goal, context, state, observation } = await stateFor(EMPLOYEES, {
      destination: 'external_model', requestingAgent: 'cursor',
    });
    const plan = Planner.createPlan({ goal, observation, assessment: state.latestRisk, context, state });
    const authorized = PolicyGuard.validate(plan, context, state);
    assert.strictEqual(authorized.authorized, true, JSON.stringify(authorized.violations));
    assert.strictEqual(authorized.rejected, false);
  });

  await check('policy guard rejects a transform the destination forbids', async () => {
    // This is the plan a utility-maximising reasoner WOULD propose if nothing
    // stopped it: keep the Emirates ID format intact by faking it. The policy
    // refuses, because downstream a synthetic Emirates ID is indistinguishable
    // from a live one.
    const { context, state } = await stateFor(EMPLOYEES, {
      destination: 'external_model', requestingAgent: 'cursor',
    });
    const rogue = new ProtectionPlan([
      new Action({ tool: 'synthesize', targetClass: 'GOVERNMENT_IDENTIFIER', reasonCode: 'PROHIBITED_AT_DESTINATION' }),
      new Action({ tool: 'tokenize', targetClass: 'FINANCIAL', reasonCode: 'PROHIBITED_AT_DESTINATION' }),
      new Action({ tool: 'tokenize', targetClass: 'CONTACT', reasonCode: 'PROHIBITED_AT_DESTINATION' }),
    ]);
    const authorized = PolicyGuard.validate(rogue, context, state);
    assert.strictEqual(authorized.rejected, true);
    assert.strictEqual(authorized.authorized, false);
    const v = authorized.violations.find((x) => x.code === 'TRANSFORM_NOT_PERMITTED');
    assert(v, 'expected TRANSFORM_NOT_PERMITTED');
    assert.strictEqual(v.targetClass, 'GOVERNMENT_IDENTIFIER');
    assert(!v.permitted.includes('synthesize'));
  });

  await check('policy guard rejects a plan that quietly keeps a prohibited class', async () => {
    const { context, state } = await stateFor(EMPLOYEES, {
      destination: 'external_model', requestingAgent: 'cursor',
    });
    const rogue = new ProtectionPlan([
      new Action({ tool: 'keep', targetClass: 'GOVERNMENT_IDENTIFIER', reasonCode: 'PERMITTED_FOR_TASK_UTILITY' }),
    ]);
    const authorized = PolicyGuard.validate(rogue, context, state);
    assert.strictEqual(authorized.rejected, true);
    assert(authorized.violations.some((v) => v.code === 'PROHIBITED_CLASS_NOT_TRANSFORMED'
      && v.targetClass === 'GOVERNMENT_IDENTIFIER'));
  });

  await check('an authorised plan cannot be constructed from a rejected one', async () => {
    const { context, state } = await stateFor(EMPLOYEES, {
      destination: 'external_model', requestingAgent: 'cursor',
    });
    const rogue = new ProtectionPlan([
      new Action({ tool: 'synthesize', targetClass: 'GOVERNMENT_IDENTIFIER', reasonCode: 'PROHIBITED_AT_DESTINATION' }),
    ]);
    const authorized = PolicyGuard.validate(rogue, context, state);
    const { Executor } = require('../src/guardian/executor');
    await assert.rejects(
      () => Executor.execute({ authorized, sourcePath: EMPLOYEES, artifactPath: path.join(tmp, 'never.md') }),
      /not authorised/,
      'the executor must refuse an unauthorised plan even if called directly',
    );
    assert(!fs.existsSync(path.join(tmp, 'never.md')));
  });

  await check('unknown policy and destination ids fall back to the strictest rules', () => {
    const rules = PolicyGuard.rulesFor('no-such-policy', 'no-such-destination');
    assert.strictEqual(rules.destinationId, 'unknown');
    assert(rules.denyOutright.includes('CREDENTIAL'));
  });

  // =========================================================================
  // PATHS
  // =========================================================================

  await check('resolveResource rejects a directory and a missing file', () => {
    assert.throws(() => paths.resolveResource(tmp), /not a regular file/);
    assert.throws(() => paths.resolveResource(path.join(tmp, 'nope.md')), /not found/);
  });

  await check('resolveResource rejects a NUL byte', () => {
    assert.throws(() => paths.resolveResource(`${EMPLOYEES}${String.fromCharCode(0)}.txt`), /NUL byte/);
  });

  await check('resolveOutput refuses to overwrite the original', () => {
    const real = paths.resolveResource(EMPLOYEES);
    assert.throws(() => paths.resolveOutput(EMPLOYEES, real), /refusing to overwrite the original/);
  });

  await check('resolveOutput refuses a traversal outside its directory', () => {
    const real = paths.resolveResource(EMPLOYEES);
    const out = paths.resolveOutput(path.join(tmp, 'sub', '..', 'ok.md'), real);
    assert.strictEqual(path.dirname(out), fs.realpathSync(tmp), 'traversal must be normalised into the real directory');
    assert.throws(() => paths.resolveOutput(path.join(tmp, 'missing-dir', 'x.md'), real), /does not exist/);
  });

  await check('resolveOutput refuses to write through a symlink', () => {
    const real = paths.resolveResource(EMPLOYEES);
    const target = path.join(tmp, 'sym-target.md');
    const link = path.join(tmp, 'sym-link.md');
    fs.writeFileSync(target, 'x');
    if (fs.existsSync(link)) fs.unlinkSync(link);
    fs.symlinkSync(target, link);
    assert.throws(() => paths.resolveOutput(link, real), /symlink/);
  });

  // =========================================================================
  // INTEGRATION — the MVP success criterion
  // =========================================================================

  await check('INTEGRATION: the Guardian changes its next action because the previous one failed', async () => {
    const out = path.join(tmp, 'guarded_employees.md');
    if (fs.existsSync(out)) fs.unlinkSync(out);
    const before = sha(EMPLOYEES);

    const result = await runGuardian({
      resource: EMPLOYEES,
      agent: 'cursor',
      task: 'calculate average salary by age group',
      destination: 'external_model',
      output: out,
      auditLog: path.join(tmp, 'audit.jsonl'),
    });

    // It took more than one attempt.
    assert.strictEqual(result.iterations, 2, 'expected exactly two iterations');
    assert.strictEqual(result.verifications.length, 2);

    // Attempt 1 genuinely failed, on real evidence from the artifact.
    assert.strictEqual(result.verifications[0].goalSatisfied, false);
    assert.deepStrictEqual(result.verifications[0].residualClasses, ['CONTACT']);
    assert(result.verifications[0].remainingByClass.CONTACT > 0);

    // THE POINT: attempt 2's action for that class is DIFFERENT from attempt 1's.
    const plans = result.state.authorizedPlans;
    assert.strictEqual(plans.length, 2);
    assert.strictEqual(plans[0].actionFor('CONTACT').tool, 'synthesize');
    assert.strictEqual(plans[1].actionFor('CONTACT').tool, 'tokenize');
    assert.notStrictEqual(plans[0].actionFor('CONTACT').tool, plans[1].actionFor('CONTACT').tool);
    assert.strictEqual(plans[1].actionFor('CONTACT').reasonCode, 'ESCALATED_AFTER_VERIFICATION_FAILURE');

    // And the change was caused by feedback, not by a script: the state records
    // the failed attempt that drove it.
    assert.strictEqual(result.state.toolsTriedFor('CONTACT')[0], 'synthesize');

    // Attempt 2 passed, verified against bytes on disk.
    assert.strictEqual(result.verifications[1].goalSatisfied, true);
    assert.strictEqual(result.decision, DECISIONS.ALLOW_WITH_TRANSFORMATION);

    // The artifact is real, and it is actually safe.
    assert(fs.existsSync(out));
    const artifact = fs.readFileSync(out, 'utf8');
    for (const s of SECRETS) assert(!artifact.includes(s), `artifact still contains ${s.slice(0, 12)}...`);

    // Utility survived: the task needs age groups, departments and salaries.
    assert(artifact.includes('Engineering') && artifact.includes('28000'), 'salary/department must survive');
    assert(artifact.includes('14/03/1988'), 'DOB must survive — the task groups by age');

    // The original is untouched.
    assert.strictEqual(sha(EMPLOYEES), before, 'the original resource must never be modified');
  });

  await check('INTEGRATION: a clean resource is released untouched', async () => {
    const clean = path.join(tmp, 'readme.md');
    fs.writeFileSync(clean, '# readme\n\nbuild it with `npm test`.\n');
    const result = await runGuardian({
      resource: clean, agent: 'cursor', destination: 'external_model', auditLog: false,
    });
    assert.strictEqual(result.decision, DECISIONS.ALLOW);
    assert.strictEqual(result.reasonCode, 'NO_SENSITIVE_DATA');
    assert.strictEqual(result.releasePath, fs.realpathSync(clean));
    assert.strictEqual(result.iterations, 1);
  });

  await check('INTEGRATION: fails closed when the iteration budget runs out', async () => {
    const out = path.join(tmp, 'budget.md');
    if (fs.existsSync(out)) fs.unlinkSync(out);
    const result = await runGuardian({
      resource: EMPLOYEES,
      agent: 'cursor',
      destination: 'external_model',
      output: out,
      goal: { maxIterations: 1 },
      auditLog: false,
    });
    assert.strictEqual(result.decision, DECISIONS.BLOCK);
    assert.strictEqual(result.reasonCode, 'MAX_ITERATIONS_EXHAUSTED');
    assert(!fs.existsSync(out), 'a blocked run must leave no releasable artifact on disk');
  });

  await check('INTEGRATION: human approval is required, then honoured', async () => {
    const out = path.join(tmp, 'guarded_service.env');
    if (fs.existsSync(out)) fs.unlinkSync(out);

    const held = await runGuardian({
      resource: SERVICE_ENV, agent: 'cursor', destination: 'external_model', output: out, auditLog: false,
    });
    assert.strictEqual(held.decision, DECISIONS.REQUIRE_APPROVAL);
    assert.deepStrictEqual(held.approvalsNeeded, ['CREDENTIAL']);
    assert(!fs.existsSync(out), 'nothing may be written while waiting for a human');

    const granted = await runGuardian({
      resource: SERVICE_ENV, agent: 'cursor', destination: 'external_model', output: out,
      approvals: ['CREDENTIAL'], auditLog: false,
    });
    assert.strictEqual(granted.decision, DECISIONS.ALLOW_WITH_TRANSFORMATION);
    assert(fs.existsSync(out));
    const artifact = fs.readFileSync(out, 'utf8');
    assert(!artifact.includes('sk-proj-abc123def456ghi789jkl012mno345pqr678stu'));
    assert(!artifact.includes('Pr0d-P4ss-9f2'));
    // Non-sensitive configuration is preserved — the file is still usable.
    assert(artifact.includes('LOG_LEVEL=info'));
  });

  await check('INTEGRATION: an outright-denied class blocks before anything is written', async () => {
    const out = path.join(tmp, 'denied.env');
    if (fs.existsSync(out)) fs.unlinkSync(out);
    const result = await runGuardian({
      resource: SERVICE_ENV, agent: 'cursor', destination: 'unknown', output: out, auditLog: false,
    });
    assert.strictEqual(result.decision, DECISIONS.BLOCK);
    assert.strictEqual(result.reasonCode, 'CLASS_DENIED_AT_DESTINATION');
    assert.strictEqual(result.iterations, 1);
    assert.strictEqual(result.verifications.length, 0, 'we must block before executing, not after');
    assert(!fs.existsSync(out));
  });

  await check('INTEGRATION: an unknown agent gets conservative treatment', async () => {
    const result = await runGuardian({
      resource: EMPLOYEES,
      agent: 'some-agent-we-have-never-heard-of',
      destination: 'known_external',
      output: path.join(tmp, 'stranger.md'),
      auditLog: false,
    });
    assert.strictEqual(result.state.context.requestingAgent.trust, 'low');
    assert.strictEqual(result.state.context.requestingAgent.recognised, false);
    assert(result.risk.reasonCodes.includes('UNRECOGNISED_AGENT'));
  });

  await check('INTEGRATION: a spreadsheet is fully protected, names included', async () => {
    // Regression test for the cross-cell matching bug.
    //
    // engine/formats/xlsx.js flattens every cell into one newline-joined string
    // for detection, then writes back by per-cell substring substitution. While
    // `full_name` separated capitalised words with `\s` (which matches newlines)
    // it produced matches that SPANNED cells -- "Dept\nAhmed Hassan" -- and no
    // single cell contained that string, so the write silently did nothing and
    // names survived masking. Patterns now use `[ \t]` for intra-line
    // whitespace, so every match is cell-local and writable.
    const XLSX = require('xlsx');
    const src = path.join(tmp, 'sheet.xlsx');
    const out = path.join(tmp, 'guarded_sheet.xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Name', 'EmiratesID', 'Dept'],
      ['Ahmed Hassan', '784-1988-1234567-0', 'Engineering'],
      ['Fatima Ali', '784-1992-7654321-2', 'Finance'],
    ]), 'Employees');
    XLSX.writeFile(wb, src);
    if (fs.existsSync(out)) fs.unlinkSync(out);

    // No detection may span a cell boundary.
    const formats = require('../src/engine/formats');
    const { maskText } = require('../src/engine/masker');
    const data = await formats.readFile(src);
    const scan = maskText(data.text);
    const spanning = scan.findings.filter((f) => f.original.includes('\n'));
    assert.deepStrictEqual(spanning, [],
      `findings must not span cells: ${JSON.stringify(spanning.map((f) => f.original))}`);
    assert(scan.findings.some((f) => f.id === 'full_name' && f.original === 'Ahmed Hassan'),
      'the name must be matched as its own cell value');

    // At `unknown`, PERSON_NAME is prohibited rather than merely restricted, so
    // the run only succeeds if the name is genuinely written out of the file.
    const result = await runGuardian({
      resource: src,
      agent: 'cursor',
      destination: 'unknown',
      approvals: ['GOVERNMENT_IDENTIFIER'],
      output: out,
      auditLog: false,
    });
    assert.strictEqual(result.decision, DECISIONS.ALLOW_WITH_TRANSFORMATION);
    assert(fs.existsSync(out));

    const csv = XLSX.utils.sheet_to_csv(XLSX.readFile(out).Sheets.Employees);
    for (const leaked of ['Ahmed Hassan', 'Fatima Ali', '784-1988-1234567-0', '784-1992-7654321-2']) {
      assert(!csv.includes(leaked), `spreadsheet still contains ${leaked}`);
    }
    // Non-sensitive columns survive -- the sheet is still analysable.
    assert(csv.includes('Engineering') && csv.includes('Finance'));
  });

  // =========================================================================
  // AUDIT — the invariant that matters most
  // =========================================================================

  await check('AUDIT: the written log contains no raw sensitive values', async () => {
    const log = path.join(tmp, 'audit-leak-check.jsonl');
    if (fs.existsSync(log)) fs.unlinkSync(log);

    await runGuardian({
      resource: EMPLOYEES, agent: 'cursor', task: 'salary analysis',
      destination: 'external_model', output: path.join(tmp, 'a1.md'), auditLog: log,
    });
    await runGuardian({
      resource: SERVICE_ENV, agent: 'cursor', destination: 'external_model',
      output: path.join(tmp, 'a2.env'), approvals: ['CREDENTIAL'], auditLog: log,
    });

    const contents = fs.readFileSync(log, 'utf8');
    for (const s of SECRETS) {
      assert(!contents.includes(s), `AUDIT LEAK: log contains ${s.slice(0, 14)}...`);
    }
    const events = contents.trim().split('\n').map((l) => JSON.parse(l));
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].schema, 'kakashi.guardian.v1');
    assert.strictEqual(events[0].decision, 'ALLOW_WITH_TRANSFORMATION');
    assert.strictEqual(events[0].verificationPassed, true);
    assert.strictEqual(events[0].iterations, 2);
    assert.strictEqual(events[0].prohibitedValuesReleased, 0);
    assert(events[0].reasonCodes.includes('GOVERNMENT_IDENTIFIER_DETECTED'));
    assert(Array.isArray(events[0].actions) && events[0].actions.length > 0);
  });

  await check('AUDIT: a blocked run is recorded and releases nothing', async () => {
    const log = path.join(tmp, 'audit-block.jsonl');
    const result = await runGuardian({
      resource: SERVICE_ENV, agent: 'unknown', destination: 'unknown',
      output: path.join(tmp, 'blocked.env'), auditLog: log,
    });
    const event = JSON.parse(fs.readFileSync(log, 'utf8').trim().split('\n').pop());
    assert.strictEqual(event.decision, 'BLOCK');
    assert.strictEqual(event.prohibitedValuesReleased, 0);
    assert.strictEqual(event.verificationPassed, false);
    assert.strictEqual(result.releasePath, null);
  });

  // =========================================================================
  // DISTRIBUTION SURFACE — the Guardian must stay an internal detail
  // =========================================================================

  await check('DISTRIBUTION: the Guardian adds no runtime dependency', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const allowed = new Set([
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.optionalDependencies || {}),
      ...require('module').builtinModules,
    ]);
    const dir = path.join(__dirname, '..', 'src', 'guardian');
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(dir, file), 'utf8');
      for (const m of src.matchAll(/require\('([^']+)'\)/g)) {
        const id = m[1];
        if (id.startsWith('.')) continue;
        assert(allowed.has(id),
          `src/guardian/${file} requires "${id}", which is not an existing dependency — `
          + 'the Guardian must not add to the install footprint');
      }
    }
    // No agent framework may sneak in.
    for (const banned of ['langchain', 'langgraph', 'crewai', 'autogen', 'openai', '@anthropic-ai/sdk']) {
      assert(!allowed.has(banned), `${banned} must not be a dependency`);
    }
  });

  await check('DISTRIBUTION: the installer surface is unchanged and ships the Guardian', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert(pkg.files.includes('src'), 'src/ must ship so src/guardian/ reaches users on upgrade');
    assert.strictEqual(pkg.bin.kakashi, 'bin/kakashi.js');
    assert.strictEqual(pkg.scripts['install-agents'], 'node bin/install.js');
    const installer = fs.readFileSync(path.join(__dirname, '..', 'bin', 'install.js'), 'utf8');
    for (const agent of ['claude', 'cursor', 'codex', 'windsurf', 'cline', 'copilot', 'continue']) {
      assert(installer.includes(`id: '${agent}'`), `installer lost the ${agent} integration`);
    }
  });

  await check('DISTRIBUTION: guard runs in-process, with no daemon required', async () => {
    // agent-guard must not be loaded, started, or contacted by a guard run.
    const result = await runGuardian({
      resource: EMPLOYEES, agent: 'cursor', destination: 'local', auditLog: false,
    });
    assert.strictEqual(result.decision, DECISIONS.ALLOW);
    const guardianSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'guardian', 'index.js'), 'utf8');
    assert(!/require\('\.\.\/agent\/guard'\)/.test(guardianSrc),
      'the Guardian loop must not depend on the daemon');
    for (const netMod of ['http', 'https', 'net', 'tls', 'dgram']) {
      assert(!guardianSrc.includes(`require('${netMod}')`),
        `the Guardian loop must open no sockets (found require('${netMod}'))`);
    }
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`guardian.test.js: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

module.exports = { runGuardianTests };

if (require.main === module) {
  runGuardianTests().then((ok) => process.exit(ok ? 0 : 1));
}
