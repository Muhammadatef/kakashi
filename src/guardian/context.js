/**
 * GuardianContext — the request, as the Guardian understands it.
 *
 * WHO is asking (requestingAgent → AgentProfile)
 * WHAT do they want (task)
 * WHICH resource is involved (resource)
 * WHERE could it end up (destination)
 * WHICH policy applies (policy)
 * WHAT are they permitted to do (approvals granted ahead of time)
 */

const profiles = require('./profiles');

/**
 * Where the data could go once released. Ordered least → most exposed; the risk
 * engine and the policy both key off these ids.
 */
const DESTINATIONS = {
  local:           { id: 'local',           label: 'Local disk only',        external: false, exposure: 0 },
  local_model:     { id: 'local_model',     label: 'Local model',            external: false, exposure: 0 },
  known_external:  { id: 'known_external',  label: 'Known external service', external: true,  exposure: 2 },
  external_model:  { id: 'external_model',  label: 'External model API',     external: true,  exposure: 3 },
  unknown:         { id: 'unknown',         label: 'Unknown destination',    external: true,  exposure: 4 },
};

function resolveDestination(id) {
  const key = String(id || '').trim().toLowerCase();
  return DESTINATIONS[key] || { ...DESTINATIONS.unknown, requestedId: key || null };
}

class GuardianContext {
  /**
   * @param {object} opts
   * @param {string} opts.resource — path to the resource under consideration
   * @param {string} [opts.requestingAgent] — agent id; unknown ids get the conservative profile
   * @param {string} [opts.task] — free-text purpose, used for explainability (and, from M4, for semantics)
   * @param {string} [opts.destination] — a DESTINATIONS id
   * @param {string} [opts.policy] — a POLICIES id
   * @param {string[]} [opts.approvals] — classes a human has already signed off on
   */
  constructor(opts = {}) {
    if (!opts.resource) throw new Error('GuardianContext: resource is required');
    this.resource = String(opts.resource);
    this.requestingAgent = profiles.resolve(opts.requestingAgent);
    this.task = opts.task ? String(opts.task) : null;
    this.destination = resolveDestination(opts.destination);
    this.policy = opts.policy ? String(opts.policy) : 'default';
    // Approvals are supplied by the caller (a human). The Guardian never mints
    // its own approval — that would make the human-in-the-loop decorative.
    this.approvals = Array.isArray(opts.approvals) ? [...opts.approvals] : [];
    // `networkAccess` defaults to the agent's own capability but can be pinned
    // by a caller that knows better (e.g. a sandboxed run).
    this.networkAccess = opts.networkAccess != null
      ? Boolean(opts.networkAccess)
      : this.requestingAgent.networkCapable;
  }

  hasApprovalFor(cls) {
    return this.approvals.includes(cls) || this.approvals.includes('*');
  }

  /** Audit-safe projection: identifiers and labels only, never file contents. */
  toJSON() {
    return {
      agent: this.requestingAgent.id,
      agentRecognised: this.requestingAgent.recognised,
      agentTrust: this.requestingAgent.trust,
      task: this.task,
      destination: this.destination.id,
      networkAccess: this.networkAccess,
      policy: this.policy,
      approvals: this.approvals,
    };
  }
}

module.exports = { GuardianContext, DESTINATIONS, resolveDestination };
