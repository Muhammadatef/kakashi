# Commands to run to test Kakashi

Repo root: `G:\SCAD\Kakashi\kakashi-main\kakashi-main` (or your clone).  
Windows = PowerShell. Unix equivalents are noted.  
Do **not** run `audit`, `db-audit`, `scan --verbose`, or `scan-dir --include-values` in an Agent chat or while screen-sharing real data.

If `kakashi` is not on PATH, use:

```powershell
node .\bin\kakashi.js <args>
```

```bash
node ./bin/kakashi.js <args>
```

---

## 0. One-time setup

```powershell
cd G:\SCAD\Kakashi\kakashi-main\kakashi-main
node -v          # >= 18
npm install
npm test         # must go green; if you see Cannot find module 'pdf-parse', reinstall that dep
```

Repair a broken `pdf-parse` folder:

```powershell
Remove-Item -Recurse -Force .\node_modules\pdf-parse -ErrorAction SilentlyContinue
npm install pdf-parse@1.1.1
node -e "require('pdf-parse'); console.log('pdf-parse ok')"
```

Install / refresh Cursor + other agent hooks from this checkout:

```powershell
node .\bin\install.js --all --with-init --force
node .\bin\install.js --list
```

After hooks change: **start a new Agent chat**, then type `/` to see slash commands.

---

## 1. Installer and PATH (the 23 Sept Windows bug)

What failed for users:

```powershell
irm https://raw.githubusercontent.com/Muhammadatef/kakashi/main/install.ps1 | iex
```

That one-liner is safe to re-run only **after** the fixed `install.ps1` is on GitHub `main`. Until then, use the local scripts:

```powershell
npm install -g @muhammadatef/kakashi
node .\bin\install.js --all --force
kakashi --version
kakashi --help
kakashi setup --list
kakashi setup --all --force
```

Unix:

```bash
npm install -g @muhammadatef/kakashi
node bin/install.js --all --force
kakashi setup --list
```

Expect: version `1.2.0` or newer; `--list` shows `● cursor`; files exist at:

- `~\.cursor\rules\kakashi.mdc`
- `~\.cursor\commands\kakashi-guard.md`
- `~\.cursor\commands\kakashi-scan-dir.md`
- (14 `kakashi*.md` command files)

---

## 2. Manager demos (six product cases)

Windows:

```powershell
.\demos\run-all.ps1
```

One case at a time (presenting):

```powershell
node .\demos\demo.js files
node .\demos\demo.js folders
node .\demos\demo.js database
node .\demos\demo.js guardian
node .\demos\demo.js sidecar
node .\demos\demo.js operations
```

Unix / Git Bash:

```bash
./demos/run-all.sh
./demos/01-file-protection.sh
./demos/02-folder-compliance.sh
./demos/03-database-protection.sh
./demos/04-guardian-decision.sh
./demos/05-agent-sidecar.sh
./demos/06-operations-and-arabic.sh
```

Expect last line: `ALL 6 SELECTED DEMOS PASSED`.  
Artifacts: `demos\.work\output\` (HTML reports, masked CSV, Guardian JSONL, `impact.json`).

If `sidecar` times out on Windows `G:` (`fs.watch UNKNOWN`), that is a known blocker — see `changes_23Sept.md`.

---

## 3. Slash-equivalent CLI (ran 23 Sept in Agent chat)

Create output dir:

```powershell
New-Item -ItemType Directory -Force -Path .\demos\.work\output | Out-Null
```

### `/kakashi-scan` — one file, counts only

```powershell
kakashi scan .\tests\fixtures\sample.txt
```

Expect exit **1** (findings present): about **10** findings (3 ID · 5 personal · 2 credentials). Exit 1 is detection, not a crash.

### `/kakashi-scan-dir` — folder / PDPL report

```powershell
kakashi scan-dir .\tests\fixtures -f html -o .\demos\.work\output\slash-scan-dir.html
```

Expect exit **1**, HTML written, counts only on the console. Open the HTML in a browser. Do not add `--include-values`.

Arabic report:

```powershell
kakashi scan-dir .\tests\fixtures -f html --lang ar -o .\demos\.work\output\estate-report-ar.html
```

### `/kakashi-mask` — one file

```powershell
kakashi mask .\tests\fixtures\sample.txt -o .\demos\.work\output\slash-masked-sample.txt
kakashi scan .\demos\.work\output\slash-masked-sample.txt
```

Expect mask exit **0**; re-scan should be clean (exit **0**) or near-clean.

### `/kakashi-mask-dir` — batch

Needs demo inputs (create by running `node .\demos\demo.js files` first, or the full suite):

```powershell
kakashi mask-dir .\demos\.work\input -r
```

Expect exit **0**, `masked_*` siblings, originals untouched.

### `/kakashi-guard` — allow with transform (analytics)

```powershell
kakashi guard .\tests\fixtures\guardian_employees.md `
  --agent cursor `
  --task "calculate average salary by department" `
  --destination external_model `
  --json `
  -o .\demos\.work\output\slash-guarded-employees.md
```

Expect exit **0**, `"decision": "ALLOW_WITH_TRANSFORMATION"`, `verificationPassed: true`, `releasePath` pointing at the guarded file. Use **only** that path.

### `/kakashi-guard` — fail closed (credentials)

```powershell
kakashi guard .\tests\fixtures\guardian_service.env `
  --agent cursor `
  --task "summarize the file" `
  --destination external_model `
  --json `
  -o .\demos\.work\output\slash-must-not-release.env
```

Expect exit **3** (`REQUIRE_APPROVAL`) or **4** (`BLOCK`), `"releasePath": null`, and **no** output file.

### `/kakashi-db-scan` / `/kakashi-db-mask` — offline adapter

```powershell
kakashi db-scan mock:customers -q demo --limit 5
kakashi db-mask mock:customers -q demo -f csv -o .\demos\.work\output\slash-masked-customers.csv --limit 5
```

Expect scan exit **1** (findings); mask exit **0**; CSV is a safe copy (source DB unchanged).

### `/kakashi-stats` / `/kakashi-list` / `/kakashi-impact`

```powershell
kakashi stats
kakashi list-patterns
kakashi impact
kakashi impact --write .\demos\.work\output\impact.json
```

Expect exit **0**. Impact JSON must have **no** filenames, paths, or source values. `kakashiVersion` should match the installed package (bug if it says 1.1.0 while CLI is 1.2.0).

### `/kakashi-agent-guard` — loopback sidecar

```powershell
kakashi agent-guard --watch .\demos\.work\input --port 8798 --auto-mask
```

In another terminal:

```powershell
Invoke-WebRequest http://127.0.0.1:8798/health -UseBasicParsing
```

Expect `ok: true`. Stop with Ctrl+C.  
On some Windows drives watch may crash after bind — still a blocker.

Unix:

```bash
kakashi agent-guard --watch ./demos/.work/input --port 8798 --auto-mask
curl -s http://127.0.0.1:8798/health
```

---

## 4. Agent chat (after a new chat)

Type `/` and confirm these appear: `kakashi`, `kakashi-scan`, `kakashi-scan-dir`, `kakashi-mask`, `kakashi-mask-dir`, `kakashi-guard`, `kakashi-db-scan`, `kakashi-db-mask`, `kakashi-agent-guard`, `kakashi-impact`, `kakashi-stats`, `kakashi-list`.

Use **path strings**, not `@file`:

```text
/kakashi-scan tests/fixtures/sample.txt
/kakashi-scan-dir tests/fixtures
/kakashi-guard tests/fixtures/guardian_employees.md calculate average salary by department
/kakashi
```

`/kakashi` alone (production target): the agent must pick scan / scan-dir / guard / db-* as needed. Today it only activates “scan then mask” — that is the main remaining UX gap (`changes_23Sept.md`).

Do **not** invoke in Agent chat:

```text
/kakashi-audit tests/fixtures/sample.txt
/kakashi-db-audit mock:customers
```

Those print plaintext secrets into the model context.

---

## 5. Expected exit codes (quick card)

| Command | Clean | Findings / transform | Human gate | Block | Error |
| --- | --- | --- | --- | --- | --- |
| `scan`, `scan-dir`, `db-scan` | 0 | **1** | — | — | 2 |
| `mask`, `mask-dir`, `db-mask` | 0 | — | — | — | 2 |
| `guard` ALLOW / ALLOW_WITH_TRANSFORMATION | **0** | — | — | — | 2 |
| `guard` REQUIRE_APPROVAL | — | — | **3** | — | 2 |
| `guard` BLOCK | — | — | — | **4** | 2 |

---

## 6. 23 Sept live results (this machine)

| Run | Exit | Notes |
| --- | --- | --- |
| `kakashi scan tests/fixtures/sample.txt` | 1 | 10 findings |
| `kakashi scan-dir tests/fixtures -f html` | 1 | 8 files, 173 findings, HTML written |
| `kakashi mask sample.txt -o …` | 0 | 10 replacements |
| `kakashi mask-dir demos/.work/input -r` | 0 | 6 files, 20 replacements |
| `guard guardian_employees.md` + salary task | 0 | `ALLOW_WITH_TRANSFORMATION`, verified |
| `guard guardian_service.env` + summarize | 3 | `REQUIRE_APPROVAL` for CREDENTIAL, no artifact |
| `db-scan mock:customers -q demo --limit 5` | 1 | 5 rows, 25 findings |
| `db-mask mock:customers … csv` | 0 | masked CSV written |
| `stats` / `list-patterns` / `impact` | 0 | impact `kakashiVersion` wrongly 1.1.0 on global 1.2.0 CLI |
| `npm test` (full suite) | 1 | `Cannot find module 'pdf-parse'` |
| `installer.test.js` | 0 | 6 passed |
| `agent-rules.test.js` | 0 | 3 passed |
| `demos/demo.js sidecar` | 1 | watch timeout / `fs.watch` UNKNOWN on `G:` |
