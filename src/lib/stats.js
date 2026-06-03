const fs = require('fs');
const path = require('path');
const os = require('os');

const STATS_DIR = path.join(os.homedir(), '.kakashi');
const STATS_FILE = path.join(STATS_DIR, 'stats.json');

function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
    }
  } catch {
    /* ignore */
  }
  return { filesMasked: 0, totalFindings: 0, byCategory: { id: 0, pii: 0, cred: 0 } };
}

function saveStats(stats) {
  fs.mkdirSync(STATS_DIR, { recursive: true });
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf8');
}

function recordMask(findings) {
  const stats = loadStats();
  stats.filesMasked += 1;
  stats.totalFindings += findings.length;
  if (!stats.byCategory) stats.byCategory = { id: 0, pii: 0, cred: 0 };
  // Migrate legacy 'uae' bucket if present in older stats files
  if (stats.byCategory.uae != null) {
    stats.byCategory.id = (stats.byCategory.id || 0) + stats.byCategory.uae;
    delete stats.byCategory.uae;
  }
  for (const f of findings) {
    if (stats.byCategory[f.cat] == null) stats.byCategory[f.cat] = 0;
    stats.byCategory[f.cat] += 1;
  }
  saveStats(stats);
  return stats;
}

module.exports = { STATS_DIR, STATS_FILE, loadStats, saveStats, recordMask };
