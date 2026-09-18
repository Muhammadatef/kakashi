/**
 * AgentProfile — who is asking.
 *
 * bin/install.js already knows the *identity* of the agents Kakashi integrates
 * with (claude, cursor, codex, windsurf, cline, copilot, continue) but models no
 * privileges. This module adds only the missing axis — trust and network
 * capability — reusing those same ids so the two registries stay aligned.
 *
 * Trust is NOT a statement about the vendor's competence. It is a statement about
 * how much of the user's data the agent can move off the machine without the user
 * seeing it: an agent that ships context to a hosted model is `medium` at best,
 * regardless of who ships it.
 */

const PROFILES = {
  // Hosted-model coding agents: they are configured, identifiable, and they do
  // send context to an external API.
  claude:   { id: 'claude',   name: 'Claude Code',   trust: 'medium', networkCapable: true },
  cursor:   { id: 'cursor',   name: 'Cursor',        trust: 'medium', networkCapable: true },
  codex:    { id: 'codex',    name: 'OpenAI Codex',  trust: 'medium', networkCapable: true },
  windsurf: { id: 'windsurf', name: 'Windsurf',      trust: 'medium', networkCapable: true },
  cline:    { id: 'cline',    name: 'Cline',         trust: 'medium', networkCapable: true },
  copilot:  { id: 'copilot',  name: 'GitHub Copilot',trust: 'medium', networkCapable: true },
  continue: { id: 'continue', name: 'Continue',      trust: 'medium', networkCapable: true },

  // A model running on this machine. Nothing leaves the device, so it earns the
  // only `high` trust level Kakashi grants.
  local_model: { id: 'local_model', name: 'Local model', trust: 'high', networkCapable: false },

  // Conservative default for anything we cannot identify: assume it is both
  // untrusted AND network-capable. Never assume an unknown caller is offline.
  unknown: { id: 'unknown', name: 'Unknown agent', trust: 'low', networkCapable: true },
};

const TRUST_LEVELS = ['low', 'medium', 'high'];

/**
 * @param {string} [agentId]
 * @returns {{id,name,trust,networkCapable,recognised:boolean}}
 */
function resolve(agentId) {
  const key = String(agentId || '').trim().toLowerCase();
  const hit = Object.prototype.hasOwnProperty.call(PROFILES, key) ? PROFILES[key] : null;
  if (!hit) return { ...PROFILES.unknown, requestedId: key || null, recognised: false };
  return { ...hit, recognised: true };
}

module.exports = { PROFILES, TRUST_LEVELS, resolve };
