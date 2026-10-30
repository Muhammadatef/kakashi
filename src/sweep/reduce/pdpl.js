/**
 * Sensitivity class → UAE PDPL articles.
 *
 * Why: Sweep reasons in Guardian classes (CONTACT, FINANCIAL, ...), while the
 * PDPL catalogue is keyed by detection-pattern id. Rather than keep a second
 * mapping that can drift, a class is expanded to its representative pattern
 * ids (guardian/classes.patternIdsFor) and the existing pattern→article table
 * is reused. Pure data lookup; no I/O.
 */

const { patternIdsFor } = require('../../guardian/classes');
const { ARTICLES, PATTERN_TO_ARTICLES } = require('../../lib/pdpl-mapping');

function articleSortKey(a) { const n = parseInt(String(a).replace(/\D+/g, ''), 10); return Number.isFinite(n) ? n : 9999; }

/** @param {string[]} classes @returns {{article: string, title: string}[]} */
function articlesForClasses(classes) {
  const set = new Set();
  for (const c of classes || []) for (const id of patternIdsFor(c)) for (const a of PATTERN_TO_ARTICLES[id] || []) set.add(a);
  return [...set].sort((a, b) => articleSortKey(a) - articleSortKey(b) || (a < b ? -1 : 1))
    .map((a) => ({ article: a, title: (ARTICLES[a] && ARTICLES[a].title_en) || a }));
}

function titleFor(article, lang) {
  const a = ARTICLES[article];
  if (!a) return article;
  return lang === 'ar' && a.title_ar ? a.title_ar : a.title_en;
}

module.exports = { articlesForClasses, titleFor, articleSortKey };
