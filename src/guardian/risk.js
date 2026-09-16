/**
 * RiskEngine -- contextual risk assessment.
 *
 * Kakashi already ranks a *finding* by severity (lib/pdpl-mapping.js SEVERITY).
 * What it could not do is rank a *request*: the same Emirates ID is a different
 * risk when it is staying on disk than when a low-trust, network-capable agent is
 * about to ship it to a model API. This engine adds exactly that missing context.
 *
 * Deterministic on purpose. Every weight below is a constant, every contribution
 * is attributed to a stable reason code, and the arithmetic is reproducible. That
 * is what makes the score defensible to a DPO -- and it is why this component is
 * on the "never becomes semantic" side of the line (docs/AGENTIC_ARCHITECTURE.md
 * SS20.4). We publish reason codes, never chain-of-thought.
 */

const { rulesFor, deniedClasses } = require('./policy');

/** Documented, auditable weights. Sum is clamped to 0..100. */
const WEIGHTS = {
  severity:    { critical: 45, high: 30, medium: 15, low: 5, none: 0 },
  // Keyed by DESTINATIONS[].exposure
  exposure:    { 0: 0, 2: 18, 3: 24, 4: 30 },
  trust:       { low: 14, medium: 7, high: 0 },
  networkCapableAgent: 4,
  unrecognisedAgent: 5,
  credentialPresent: 12,
  governmentIdPresent: 10,
  checksumVerifiedIdentifier: 5,
  volume: { 100: 6, 1000: 10 },
};

const LEVELS = [
  { min: 80, level: 'CRITICAL' },
  { min: 55, level: 'HIGH' },
  { min: 30, level: 'MEDIUM' },
  { min: 0,  level: 'LOW' },
];

function levelFor(score) {
  return LEVELS.find((l) => score >= l.min).level;
}

class RiskAssessment {
  constructor({ score, level, reasonCodes, factors, requiresImmediateBlock, deniedClasses: denied }) {
    this.score = score;
    this.level = level;
    this.reasonCodes = reasonCodes;
    this.factors = factors;
    this.requiresImmediateBlock = requiresImmediateBlock;
    this.deniedClasses = denied;
    Object.freeze(this.reasonCodes);
    Object.freeze(this);
  }

  toJSON() {
    return {
      score: this.score,
      level: this.level,
      reasonCodes: [...this.reasonCodes],
      factors: this.factors,
      requiresImmediateBlock: this.requiresImmediateBlock,
      deniedClasses: this.deniedClasses,
    };
  }
}

const RiskEngine = {
  WEIGHTS,

  /**
   * @param {object} args
   * @param {import('./observe').Observation} args.observation
   * @param {import('./context').GuardianContext} args.context
   * @param {import('./state').GuardianState} [args.state]
   * @returns {RiskAssessment}
   */
  assess({ observation, context }) {
    const rules = rulesFor(context.policy, context.destination.id);
    const denied = deniedClasses(observation, rules);
    const reasonCodes = [];
    const factors = [];
    let score = 0;

    function add(points, code, detail) {
      if (points <= 0) return;
      score += points;
      reasonCodes.push(code);
      factors.push({ code, points, detail });
    }

    // Nothing sensitive found: the request carries no data risk. Destination and
    // trust do not manufacture risk on their own -- there is nothing to leak.
    if (observation.totalFindings === 0) {
      return new RiskAssessment({
        score: 0,
        level: 'LOW',
        reasonCodes: ['NO_SENSITIVE_DATA'],
        factors: [],
        requiresImmediateBlock: false,
        deniedClasses: [],
      });
    }

    // --- Data sensitivity --------------------------------------------------
    add(WEIGHTS.severity[observation.maxSeverity] || 0,
      `MAX_SEVERITY_${String(observation.maxSeverity).toUpperCase()}`,
      `highest finding severity is ${observation.maxSeverity}`);

    if (observation.hasClass('CREDENTIAL')) {
      add(WEIGHTS.credentialPresent, 'CREDENTIAL_DETECTED',
        `${observation.classes.CREDENTIAL.count} credential finding(s)`);
    }
    if (observation.hasClass('GOVERNMENT_IDENTIFIER')) {
      add(WEIGHTS.governmentIdPresent, 'GOVERNMENT_IDENTIFIER_DETECTED',
        `${observation.classes.GOVERNMENT_IDENTIFIER.count} state-issued identifier(s)`);
    }
    const checksummed = Object.values(observation.classes)
      .reduce((n, b) => n + (b.checksumVerified || 0), 0);
    if (checksummed > 0) {
      add(WEIGHTS.checksumVerifiedIdentifier, 'CHECKSUM_VERIFIED_IDENTIFIER',
        `${checksummed} identifier(s) passed checksum validation -- these are live, not lookalikes`);
    }

    // --- Destination -------------------------------------------------------
    const exposure = context.destination.exposure;
    if (exposure > 0) {
      const code = context.destination.id === 'unknown' ? 'UNKNOWN_DESTINATION' : 'EXTERNAL_DESTINATION';
      add(WEIGHTS.exposure[exposure] || 0, code, `destination: ${context.destination.label}`);
    }

    // --- Requesting agent --------------------------------------------------
    const agent = context.requestingAgent;
    add(WEIGHTS.trust[agent.trust] || 0, `${agent.trust.toUpperCase()}_TRUST_AGENT`,
      `agent "${agent.id}" has ${agent.trust} trust`);
    if (!agent.recognised) {
      add(WEIGHTS.unrecognisedAgent, 'UNRECOGNISED_AGENT',
        'agent is not in the profile registry; conservative defaults applied');
    }
    if (context.networkAccess) {
      add(WEIGHTS.networkCapableAgent, 'NETWORK_CAPABLE_AGENT',
        'requesting agent can reach the network');
    }

    // --- Volume ------------------------------------------------------------
    // Scale matters: one leaked Emirates ID is an incident, a thousand is a breach.
    if (observation.totalFindings >= 1000) {
      add(WEIGHTS.volume[1000], 'HIGH_VOLUME_EXPOSURE', `${observation.totalFindings} findings`);
    } else if (observation.totalFindings >= 100) {
      add(WEIGHTS.volume[100], 'ELEVATED_VOLUME_EXPOSURE', `${observation.totalFindings} findings`);
    }

    // --- Policy hard stop --------------------------------------------------
    if (denied.length > 0) {
      reasonCodes.push('CLASS_DENIED_BY_POLICY');
      factors.push({
        code: 'CLASS_DENIED_BY_POLICY',
        points: 0,
        detail: `${denied.join(', ')} cannot be released to ${rules.destinationId} in any form`,
      });
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    return new RiskAssessment({
      score,
      level: levelFor(score),
      reasonCodes,
      factors,
      requiresImmediateBlock: denied.length > 0,
      deniedClasses: denied,
    });
  },
};

module.exports = { RiskEngine, RiskAssessment, WEIGHTS, LEVELS, levelFor };
