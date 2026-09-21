/**
 * Observation -- the Guardian's senses.
 *
 * This module adds NO detection capability. It runs the existing Kakashi
 * detector (`maskText` over all 35 patterns) and the existing compliance
 * enrichment (`pdpl.summarize`) and then projects the result onto the Guardian's
 * reasoning vocabulary: classes, counts, severities, PDPL articles.
 *
 * The projection is the point. Downstream components -- risk, planner, policy,
 * audit, and any future semantic reasoner -- receive ONLY metadata. The raw
 * findings never leave this module; `Observation` has no field that can hold a
 * matched value, so there is no way for a later component to leak one by accident.
 */

const nodePath = require('path');
const formats = require('../engine/formats');
const { maskText } = require('../engine/masker');
const { summarize } = require('../lib/pdpl-mapping');
const { classOf } = require('./classes');

const SEVERITY_RANK = { low: 1, medium: 2, high: 3, critical: 4 };

class Observation {
  constructor(fields) {
    Object.assign(this, fields);
    Object.freeze(this.classes);
    Object.freeze(this);
  }

  /** Classes present with at least one finding. */
  get presentClasses() {
    return Object.keys(this.classes).filter((c) => this.classes[c].count > 0);
  }

  hasClass(cls) {
    return Boolean(this.classes[cls] && this.classes[cls].count > 0);
  }

  toJSON() {
    return {
      kind: this.kind,
      resourceType: this.resourceType,
      resourceName: this.resourceName,
      totalFindings: this.totalFindings,
      maxSeverity: this.maxSeverity,
      classes: this.classes,
      byCategory: this.byCategory,
      bySeverity: this.bySeverity,
      pdplArticles: this.pdplArticles,
    };
  }
}

/**
 * Build the class-level projection from enriched findings.
 * @param {object[]} enriched - findings from pdpl.summarize()
 */
function projectClasses(enriched) {
  const classes = {};
  for (const f of enriched) {
    const cls = classOf(f.id);
    if (!classes[cls]) {
      classes[cls] = { count: 0, patternIds: [], maxSeverity: 'low', checksumVerified: 0 };
    }
    const bucket = classes[cls];
    bucket.count += 1;
    if (!bucket.patternIds.includes(f.id)) bucket.patternIds.push(f.id);
    if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[bucket.maxSeverity]) {
      bucket.maxSeverity = f.severity;
    }
    // A checksum-verified Emirates ID / IBAN is materially different from a
    // lookalike; the risk engine weights it and the human sees it.
    if (f.checksumVerified === true) bucket.checksumVerified += 1;
  }
  for (const b of Object.values(classes)) Object.freeze(b.patternIds);
  return classes;
}

/**
 * Observe a resource on disk.
 * @param {string} resolvedPath - already validated by paths.resolveResource
 * @param {object} [opts]
 * @param {string} [opts.kind] - 'resource' | 'artifact' (labels the observation)
 * @returns {Promise<{ observation: Observation, text: string, data: object }>}
 *   `text`/`data` stay inside the caller (executor/verifier) and are never
 *   attached to the Observation itself.
 */
async function observe(resolvedPath, opts = {}) {
  const format = formats.getFormat(resolvedPath);
  if (!format) {
    throw new Error(`Guardian: unsupported resource format: ${nodePath.basename(resolvedPath)}`);
  }
  const data = await formats.readFile(resolvedPath);
  const { findings } = maskText(data.text);
  const { findings: enriched, summary } = summarize(findings);

  const classes = projectClasses(enriched);
  let maxSeverity = 'low';
  for (const b of Object.values(classes)) {
    if (SEVERITY_RANK[b.maxSeverity] > SEVERITY_RANK[maxSeverity]) maxSeverity = b.maxSeverity;
  }

  const observation = new Observation({
    kind: opts.kind || 'resource',
    resourceType: format,
    resourceName: nodePath.basename(resolvedPath),
    totalFindings: summary.total,
    maxSeverity: summary.total > 0 ? maxSeverity : 'none',
    classes,
    byCategory: summary.byCategory,
    bySeverity: summary.bySeverity,
    // Kept for explainability: the report the DPO already knows how to read.
    pdplArticles: Object.keys(summary.byArticle).sort(),
  });

  return { observation, text: data.text, data };
}

module.exports = { observe, Observation, projectClasses, SEVERITY_RANK };
