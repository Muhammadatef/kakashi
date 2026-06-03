# Install Kakashi

One install. Works for every AI coding agent on your machine.

## One-liner

**macOS / Linux / WSL / Git Bash**

```bash
curl -fsSL https://raw.githubusercontent.com/Muhammadatef/kakashi/main/install.sh | bash
```

**Windows (PowerShell 5.1+)**

```powershell
irm https://raw.githubusercontent.com/Muhammadatef/kakashi/main/install.ps1 | iex
```

**npm**

```bash
npm install -g @muhammadatef/kakashi
kakashi --help
node "$(npm root -g)/@muhammadatef/kakashi/bin/install.js" --all
```

From a cloned repo:

```bash
git clone https://github.com/Muhammadatef/kakashi.git
cd kakashi
npm install
npm link
node bin/install.js --all --with-init
```

## Per-agent install

| Agent | Command | Auto-activates? |
|---|---|:-:|
| **Claude Code** | `node bin/install.js --only claude` | Yes |
| **Cursor** | `node bin/install.js --only cursor` | Yes |
| **Codex CLI** | `node bin/install.js --only codex` | Yes |
| **Windsurf** | `node bin/install.js --only windsurf --with-init` | With `--with-init` |
| **Cline** | `node bin/install.js --only cline --with-init` | With `--with-init` |
| **GitHub Copilot** | `node bin/install.js --only copilot --with-init` | With `--with-init` |
| **Continue** | `node bin/install.js --only continue` | Partial |

Install all detected:

```bash
node bin/install.js --all
```

## Flags

| Flag | What |
|---|---|
| `--all` | Install for all detected agents |
| `--only <id>` | One agent (repeatable) |
| `--dry-run` | Preview only |
| `--with-init` | Drop repo-level rules in `$PWD` |
| `--uninstall` | Remove Kakashi config |
| `--list` | Agent detection matrix |
| `--force` | Re-install even if present |

## Verify

```bash
node bin/install.js --list
kakashi scan tests/fixtures/sample.txt
```

## Uninstall

```bash
node bin/install.js --uninstall
npm uninstall -g @muhammadatef/kakashi
```

## Privacy

No telemetry. Installer writes local config files only.
