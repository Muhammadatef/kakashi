const chalk = require('chalk');
const { t } = require('./i18n');

const CAT_LABELS = {
  id: { tag: 'ID', title: 'ID & Documents' },
  pii: { tag: 'PII', title: 'Personal Info' },
  cred: { tag: 'KEY', title: 'Credentials' },
};

function catShort(cat) {
  // Translated short-form labels used in the counts-only line.
  if (cat === 'id') return t('id_docs_short');
  if (cat === 'pii') return t('personal_info_short');
  if (cat === 'cred') return t('credentials_short');
  return cat;
}

function printHeader(filePath, brand = 'Kakashi') {
  console.log('');
  console.log(chalk.cyan(`${brand}`));
  console.log(chalk.gray(`   ${t('scanning')}: ${filePath}`));
  console.log('');
}

function printFindings(findings, { showReplacement = false, cliName = 'kakashi', quiet = false } = {}) {
  const byCat = { id: [], pii: [], cred: [] };
  for (const f of findings) {
    if (byCat[f.cat]) byCat[f.cat].push(f);
  }

  if (quiet) {
    // Counts only — never echo previews of secret values back to stdout.
    // Used when an AI agent is invoking kakashi: the agent reads stdout, so
    // any value preview here would re-enter the agent's LLM context.
    const total = findings.length;
    const counts = ['id', 'pii', 'cred']
      .map((cat) => `${byCat[cat].length} ${catShort(cat)}`)
      .join(' · ');
    const word = total === 1 ? t('finding_singular') : t('findings');
    console.log(chalk.white(`   ${total} ${word}  (${counts})`));
    if (total > 0) {
      console.log(chalk.gray('   ' + t('apply_hint', { cli: cliName })));
    }
    console.log('');
    return;
  }

  for (const cat of ['id', 'pii', 'cred']) {
    const items = byCat[cat];
    const { tag, title } = CAT_LABELS[cat];
    console.log(chalk.yellow(`   [${tag}] ${title} (${items.length} found)`));
    console.log(chalk.gray('   ' + '─'.repeat(49)));
    for (const f of items) {
      const idTag = `[${f.id.toUpperCase()}]`.padEnd(16);
      const preview = f.original.length > 30 ? f.original.slice(0, 27) + '...' : f.original;
      if (showReplacement) {
        console.log(`   Line ${String(f.line).padStart(3)}  ${idTag}  ${preview}  →  ${f.replacement}`);
      } else {
        console.log(`   Line ${String(f.line).padStart(3)}  ${idTag}  ${preview}`);
      }
    }
    console.log('');
  }

  console.log(chalk.white(`   Total: ${findings.length} finding${findings.length === 1 ? '' : 's'}`) +
    (findings.length > 0 ? chalk.gray(`  |  Run \`${cliName} mask <file>\` to apply`) : ''));
  console.log('');
}

module.exports = { printHeader, printFindings, CAT_LABELS };
