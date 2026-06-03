#!/usr/bin/env node

const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { glob } = require('glob');
const chalk = require('chalk');
const { maskText } = require('../src/engine/masker');
const { PATTERNS } = require('../src/engine/patterns');
const formats = require('../src/engine/formats');
const { printHeader, printFindings } = require('../src/lib/output');
const { loadStats, recordMask } = require('../src/lib/stats');

const BRAND = 'Kakashi';
const CLI_NAME = 'kakashi';

async function processFile(filePath, options, action) {
  if (!fs.existsSync(filePath)) {
    console.error(chalk.red(`Error: File not found: ${filePath}`));
    process.exit(2);
  }

  const whitelist = options.whitelist
    ? options.whitelist.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const maskOpts = {
    mode: options.mode || 'typed',
    whitelist,
  };

  if (options.stdin) {
    const text = fs.readFileSync(0, 'utf8');
    const { masked, findings } = maskText(text, maskOpts);
    if (action === 'scan' || action === 'audit') {
      printHeader('(stdin)', BRAND);
      // scan defaults to quiet (agent-safe); audit is always verbose by design.
      printFindings(findings, {
        showReplacement: action === 'audit',
        cliName: CLI_NAME,
        quiet: action === 'scan' ? !options.verbose : false,
      });
      process.exit(findings.length > 0 ? 1 : 0);
    }
    process.stdout.write(masked);
    if (findings.length > 0) recordMask(findings);
    process.exit(0);
  }

  let data;
  try {
    data = await formats.readFile(filePath);
  } catch (err) {
    console.error(chalk.red(`Error: ${err.message}`));
    process.exit(2);
  }

  const { masked, findings } = maskText(data.text, maskOpts);

  if (action === 'scan') {
    printHeader(filePath, BRAND);
    // Default: counts only (agent-safe). --verbose enables per-finding previews.
    printFindings(findings, { cliName: CLI_NAME, quiet: !options.verbose });
    process.exit(findings.length > 0 ? 1 : 0);
  }

  if (action === 'audit') {
    printHeader(filePath, BRAND);
    // audit always shows the original->token mapping. That's its job.
    // It deliberately echoes plaintext secrets, so don't run audit when an
    // AI agent will read the output unless you've already accepted that.
    printFindings(findings, { showReplacement: true, cliName: CLI_NAME });
    process.exit(findings.length > 0 ? 1 : 0);
  }

  // mask
  const outputPath = options.output || formats.defaultOutputPath(filePath);

  if (options.overwrite && outputPath === filePath) {
    const confirmed = await confirmOverwrite(filePath);
    if (!confirmed) {
      console.log(chalk.yellow('Aborted.'));
      process.exit(0);
    }
  }

  const replMap = {};
  for (const f of findings) {
    replMap[f.original] = f.replacement;
  }

  try {
    await formats.writeMasked(filePath, outputPath, { ...data, format: formats.getFormat(filePath) }, replMap, masked);
  } catch (err) {
    console.error(chalk.red(`Error writing output: ${err.message}`));
    process.exit(2);
  }

  recordMask(findings);
  console.log(chalk.green(`\n[ok] Masked version saved: ${outputPath}`));
  console.log(chalk.gray(`  ${findings.length} replacement${findings.length === 1 ? '' : 's'} made`));
  const byCat = { id: 0, pii: 0, cred: 0 };
  for (const f of findings) {
    if (byCat[f.cat] == null) byCat[f.cat] = 0;
    byCat[f.cat]++;
  }
  console.log(chalk.gray(`  (${byCat.id} ID & docs, ${byCat.pii} personal info, ${byCat.cred} credentials)\n`));
  process.exit(0);
}

function confirmOverwrite(filePath) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(chalk.yellow(`Overwrite ${filePath}? [y/N] `), (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

program
  .name('kakashi')
  .description('Mask PII and credentials before they leave your machine')
  .version('1.0.0');

program
  .command('scan <file>')
  .description('Scan file and report finding counts (no files written, no secret previews)')
  .option('--stdin', 'Read from stdin')
  .option('-v, --verbose', 'Show per-finding previews (NOT agent-safe — leaks truncated secret values to stdout)')
  .action(async (file, options) => {
    await processFile(file, options, 'scan');
  });

program
  .command('audit <file>')
  .description('Show original->token mapping for every finding (DELIBERATELY VERBOSE — exposes plaintext secrets to stdout)')
  .option('--stdin', 'Read from stdin')
  .action(async (file, options) => {
    await processFile(file, options, 'audit');
  });

program
  .command('mask <file>')
  .description('Mask PII/credentials and write masked version')
  .option('-o, --output <path>', 'Output path')
  .option('-m, --mode <mode>', 'typed|redact|fake', 'typed')
  .option('-w, --whitelist <vals>', 'Comma-separated values to skip')
  .option('--overwrite', 'Overwrite original file')
  .option('--stdin', 'Read from stdin, write to stdout')
  .action(async (file, options) => {
    if (options.overwrite && !options.output) {
      options.output = file;
    }
    await processFile(file, options, 'mask');
  });

program
  .command('mask-dir <directory>')
  .description('Mask all supported files in a directory')
  .option('-r, --recursive', 'Recurse into subdirectories')
  .option('--ext <exts>', 'Comma-separated extensions to include')
  .option('--exclude <patterns>', 'Glob patterns to exclude')
  .option('-m, --mode <mode>', 'typed|redact|fake', 'typed')
  .action(async (directory, options) => {
    if (!fs.existsSync(directory)) {
      console.error(chalk.red(`Error: Directory not found: ${directory}`));
      process.exit(2);
    }
    const exts = options.ext
      ? options.ext.split(',').map((e) => e.trim().replace(/^\./, ''))
      : formats.SUPPORTED_EXTS;
    const pattern = options.recursive
      ? `**/*.{${exts.join(',')}}`
      : `*.{${exts.join(',')}}`;
    const ignore = options.exclude ? options.exclude.split(',').map((s) => s.trim()) : ['**/node_modules/**', '**/masked_*'];
    const files = await glob(pattern, { cwd: directory, absolute: true, ignore, nodir: true });
    if (files.length === 0) {
      console.log(chalk.yellow('No matching files found.'));
      process.exit(0);
    }
    console.log(chalk.cyan(`\n${BRAND} -- batch mask`));
    console.log(chalk.gray(`   ${files.length} file(s) in ${directory}\n`));
    let totalFindings = 0;
    for (const file of files) {
      try {
        const data = await formats.readFile(file);
        const { masked, findings } = maskText(data.text, { mode: options.mode || 'typed' });
        if (findings.length === 0) continue;
        const outputPath = formats.defaultOutputPath(file);
        const replMap = {};
        for (const f of findings) replMap[f.original] = f.replacement;
        await formats.writeMasked(file, outputPath, { ...data, format: formats.getFormat(file) }, replMap, masked);
        recordMask(findings);
        totalFindings += findings.length;
        console.log(chalk.green(`  [ok] ${path.basename(file)} -> ${path.basename(outputPath)} (${findings.length})`));
      } catch (err) {
        console.log(chalk.red(`  [fail] ${path.basename(file)}: ${err.message}`));
      }
    }
    console.log(chalk.white(`\n   Done. ${totalFindings} total replacement(s).\n`));
    process.exit(0);
  });

program
  .command('stats')
  .description('Show cumulative masking stats')
  .action(() => {
    const stats = loadStats();
    console.log(chalk.cyan(`\n${BRAND} -- Stats\n`));
    const byCat = stats.byCategory || {};
    console.log(`   Files masked:    ${stats.filesMasked}`);
    console.log(`   Total findings:  ${stats.totalFindings}`);
    console.log(`   ID & Documents:  ${byCat.id || 0}`);
    console.log(`   Personal Info:   ${byCat.pii || 0}`);
    console.log(`   Credentials:     ${byCat.cred || 0}\n`);
  });

program
  .command('list-patterns')
  .description('List all active detection patterns')
  .action(() => {
    console.log(chalk.cyan(`\n${BRAND} -- Patterns (${PATTERNS.length})\n`));
    const byCat = { id: [], pii: [], cred: [] };
    for (const p of PATTERNS) {
      if (!byCat[p.cat]) byCat[p.cat] = [];
      byCat[p.cat].push(p);
    }
    for (const [cat, label] of [['id', 'ID & Documents'], ['pii', 'Personal Info'], ['cred', 'Credentials']]) {
      console.log(chalk.yellow(`  ${label}:`));
      for (const p of byCat[cat] || []) {
        console.log(`    ${p.id.padEnd(16)} ${p.label}`);
      }
      console.log('');
    }
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.help();
}
