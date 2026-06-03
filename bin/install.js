const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MARKER_BEGIN = '<!-- kakashi-begin -->';
const MARKER_END = '<!-- kakashi-end -->';

const homeDir = os.homedir();

function which(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
    encoding: 'utf8',
    shell: true,
  });
  return r.status === 0;
}

function readFile(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}

function appendMarkerBlock(filePath, blockContent) {
  const existing = readFile(filePath) || '';
  if (existing.includes(MARKER_BEGIN)) {
    if (opts.force) {
      const stripped = stripMarkerBlock(existing);
      writeFile(filePath, stripped.trimEnd() + '\n\n' + blockContent + '\n');
    }
    return false;
  }
  const sep = existing.length && !existing.endsWith('\n') ? '\n\n' : existing.length ? '\n' : '';
  writeFile(filePath, existing + sep + blockContent + '\n');
  return true;
}

function stripMarkerBlock(content) {
  const begin = content.indexOf(MARKER_BEGIN);
  const end = content.indexOf(MARKER_END);
  if (begin === -1 || end === -1) return content;
  return content.slice(0, begin) + content.slice(end + MARKER_END.length);
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function loadActivateBlock() {
  return readFile(path.join(ROOT, 'CLAUDE.md')) ||
    readFile(path.join(ROOT, 'src', 'rules', 'kakashi-activate.md'));
}

function loadCursorRule() {
  const body = readFile(path.join(ROOT, 'src', 'rules', 'kakashi-activate.md')) || '';
  return `---
description: Kakashi PII masker
globs: ["**/*"]
alwaysApply: true
---

${body}
`;
}

let opts = {};

const SLASH_CMDS = [
  'kakashi',
  'kakashi-scan',
  'kakashi-mask',
  'kakashi-audit',
  'kakashi-stats',
  'kakashi-list',
];

function copySlashCommands(targetDir) {
  for (const cmd of SLASH_CMDS) {
    const src = path.join(ROOT, 'commands', `${cmd}.md`);
    if (!fs.existsSync(src)) continue;
    copyFile(src, path.join(targetDir, `${cmd}.md`));
  }
}

function installClaude() {
  const configDir = opts.configDir || path.join(homeDir, '.claude');
  const block = loadActivateBlock();
  if (!block) return;
  appendMarkerBlock(path.join(configDir, 'CLAUDE.md'), block);
  copySlashCommands(path.join(configDir, 'commands'));
  writeFile(path.join(configDir, 'kakashi-active'), 'full');
  console.log('  [ok] Claude Code  (rule + 6 slash commands)');
}

function installCursor() {
  const rule = loadCursorRule();
  const globalDir = path.join(homeDir, '.cursor', 'rules');
  writeFile(path.join(globalDir, 'kakashi.mdc'), rule);
  copySlashCommands(path.join(homeDir, '.cursor', 'commands'));
  if (opts.withInit) {
    writeFile(path.join(process.cwd(), '.cursor', 'rules', 'kakashi.mdc'), rule);
    copySlashCommands(path.join(process.cwd(), '.cursor', 'commands'));
  }
  console.log('  [ok] Cursor  (rule + 6 slash commands)');
}

function installCodex() {
  const block = loadActivateBlock();
  if (!block) return;
  const codexGlobal = path.join(homeDir, '.codex', 'AGENTS.md');
  appendMarkerBlock(codexGlobal, block);
  copySlashCommands(path.join(homeDir, '.codex', 'commands'));
  if (opts.withInit) {
    appendMarkerBlock(path.join(process.cwd(), 'AGENTS.md'), block);
    copySlashCommands(path.join(process.cwd(), '.codex', 'commands'));
  }
  console.log('  [ok] Codex CLI  (rule + 6 slash commands)');
}

function installWindsurf() {
  const body = readFile(path.join(ROOT, 'src', 'rules', 'kakashi-activate.md')) || '';
  const rule = `# Kakashi\n\n${body}`;
  const globalDir = path.join(homeDir, '.windsurf', 'rules');
  if (fs.existsSync(path.dirname(globalDir)) || opts.withInit) {
    writeFile(path.join(globalDir, 'kakashi.md'), rule);
    copySlashCommands(path.join(homeDir, '.windsurf', 'commands'));
  }
  if (opts.withInit) {
    writeFile(path.join(process.cwd(), '.windsurf', 'rules', 'kakashi.md'), rule);
    copySlashCommands(path.join(process.cwd(), '.windsurf', 'commands'));
  }
  console.log('  [ok] Windsurf  (rule + 6 slash commands)');
}

function installCline() {
  if (!opts.withInit) return;
  const body = readFile(path.join(ROOT, 'src', 'rules', 'kakashi-activate.md')) || '';
  writeFile(path.join(process.cwd(), '.clinerules', 'kakashi.md'), `# Kakashi\n\n${body}`);
  copySlashCommands(path.join(process.cwd(), '.clinerules', 'commands'));
  console.log('  [ok] Cline (repo rules + slash commands)');
}

function installCopilot() {
  if (!opts.withInit) return;
  const block = loadActivateBlock();
  if (!block) return;
  appendMarkerBlock(path.join(process.cwd(), '.github', 'copilot-instructions.md'), block);
  console.log('  [ok] GitHub Copilot (repo instructions)');
}

function installContinue() {
  const configPath = path.join(homeDir, '.continue', 'config.json');
  if (!fs.existsSync(configPath)) return;
  try {
    const config = JSON.parse(readFile(configPath));
    const body = readFile(path.join(ROOT, 'src', 'rules', 'kakashi-activate.md')) || '';
    const note = `[Kakashi] ${body.slice(0, 500)}...`;
    if (!config.systemMessage || !config.systemMessage.includes('Kakashi')) {
      config.systemMessage = (config.systemMessage || '') + '\n\n' + note;
      if (!opts.dryRun) writeFile(configPath, JSON.stringify(config, null, 2));
    }
    console.log('  [ok] Continue');
  } catch {
    console.log('  [warn] Continue (config parse skipped)');
  }
}

const AGENTS = [
  {
    id: 'claude',
    name: 'Claude Code',
    detect: () => which('claude') || fs.existsSync(path.join(homeDir, '.claude')),
    install: installClaude,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    detect: () => which('cursor') || fs.existsSync(path.join(homeDir, '.cursor')),
    install: installCursor,
  },
  {
    id: 'codex',
    name: 'OpenAI Codex CLI',
    detect: () => which('codex') || fs.existsSync(path.join(homeDir, '.codex')),
    install: installCodex,
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    detect: () => which('windsurf') || fs.existsSync(path.join(homeDir, '.windsurf')),
    install: installWindsurf,
  },
  {
    id: 'cline',
    name: 'Cline',
    detect: () => opts.withInit,
    install: installCline,
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    detect: () => which('gh') || opts.withInit,
    install: installCopilot,
  },
  {
    id: 'continue',
    name: 'Continue',
    detect: () => fs.existsSync(path.join(homeDir, '.continue')),
    install: installContinue,
  },
];

function uninstall() {
  console.log('\nUninstalling Kakashi...\n');
  const configDir = opts.configDir || path.join(homeDir, '.claude');
  const claudeMd = path.join(configDir, 'CLAUDE.md');
  const content = readFile(claudeMd);
  if (content) writeFile(claudeMd, stripMarkerBlock(content).trimEnd() + '\n');

  const cmdDirs = [
    path.join(configDir, 'commands'),
    path.join(homeDir, '.cursor', 'commands'),
    path.join(homeDir, '.codex', 'commands'),
    path.join(homeDir, '.windsurf', 'commands'),
  ];
  for (const dir of cmdDirs) {
    for (const cmd of SLASH_CMDS) {
      try { fs.unlinkSync(path.join(dir, `${cmd}.md`)); } catch { /* */ }
    }
  }
  try { fs.unlinkSync(path.join(configDir, 'kakashi-active')); } catch { /* */ }

  const codex = readFile(path.join(homeDir, '.codex', 'AGENTS.md'));
  if (codex) writeFile(path.join(homeDir, '.codex', 'AGENTS.md'), stripMarkerBlock(codex).trimEnd() + '\n');

  const toDelete = [
    path.join(homeDir, '.cursor', 'rules', 'kakashi.mdc'),
    path.join(homeDir, '.windsurf', 'rules', 'kakashi.md'),
  ];
  for (const p of toDelete) {
    try { fs.unlinkSync(p); } catch { /* */ }
  }
  console.log('Done.\n');
}

function listAgents() {
  console.log('\nKakashi — Agent Matrix\n');
  for (const a of AGENTS) {
    const detected = a.detect();
    console.log(`  ${detected ? '●' : '○'} ${a.id.padEnd(12)} ${a.name}`);
  }
  console.log('');
}

function parseArgs(argv) {
  const result = {
    all: false,
    only: [],
    dryRun: false,
    withInit: false,
    minimal: false,
    uninstall: false,
    list: false,
    force: false,
    nonInteractive: false,
    configDir: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all') result.all = true;
    else if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--with-init') result.withInit = true;
    else if (arg === '--minimal') result.minimal = true;
    else if (arg === '--uninstall') result.uninstall = true;
    else if (arg === '--list') result.list = true;
    else if (arg === '--force') result.force = true;
    else if (arg === '--non-interactive') result.nonInteractive = true;
    else if (arg === '--only') result.only.push(argv[++i]);
    else if (arg === '--config-dir') result.configDir = argv[++i]?.replace(/^~/, homeDir);
  }
  return result;
}

function main() {
  opts = parseArgs(process.argv.slice(2));

  if (opts.list) {
    listAgents();
    return;
  }

  if (opts.uninstall) {
    if (opts.dryRun) {
      console.log('[dry-run] Would uninstall Kakashi');
      return;
    }
    uninstall();
    return;
  }

  const targets = opts.only.length
    ? AGENTS.filter((a) => opts.only.includes(a.id))
    : opts.all
      ? AGENTS
      : AGENTS.filter((a) => a.detect());

  if (targets.length === 0) {
    console.log('\nNo agents detected. Use --all or --only <id>.\n');
    listAgents();
    return;
  }

  console.log('\nKakashi — Installing\n');
  if (opts.dryRun) console.log('[dry-run mode — no files written]\n');

  for (const agent of targets) {
    if (opts.dryRun) {
      console.log(`  [dry-run] Would install: ${agent.name}`);
    } else {
      try {
        agent.install();
      } catch (err) {
        console.log(`  [fail] ${agent.name}: ${err.message}`);
      }
    }
  }

  console.log('\nDone. Run: kakashi scan <file>\n');
}

main();
