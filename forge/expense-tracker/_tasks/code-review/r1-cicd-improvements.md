# CI/CD Standards Compliance Review — expense-tracker

**Date:** 2026-08-06
**Standard reference:** `forge/documentation/APP-CICD.md`
**Scope:** Backend deploy pipeline, environment management, `.clasp.json`, `envs.json`, Makefile, `appsscript.json`, `app/config.js`

---

## Summary

| Severity | Count |
|---|---|
| HIGH | 5 |
| MEDIUM | 4 |
| LOW | 3 |

---

## 1. Deploy Script Structure and Invocation

**1.1 [HIGH] — Documented invocation path does not exist**

The standard (APP-CICD.md, "Invocation" section) defines the canonical entry point as:

```
bash forge/expense-tracker/cicd/deploy.sh
```

And also documents that from the repo root, the recommended path is:

```
bash cicd/deploy.sh dev "..."
```

The `REWIRE-BRAIN.md` "Deploy" section and the `Makefile` both show the correct paths (`bash cicd/deploy.sh`, `bash forge/expense-tracker/cicd/deploy.sh`). However, the `cicd/README.md` describes a script named `script-deployment.sh` as the deploy script and references a canonical entry point of `bash forge/deploy.sh` — neither of which exists. The actual script is `cicd/deploy.sh`. The `README.md` inside `cicd/` is out of date with the real file layout and references phantom files.

- **Phantom file referenced:** `cicd/script-deployment.sh` (does not exist — actual file is `cicd/deploy.sh`)
- **Phantom launcher referenced:** `forge/deploy.sh` (does not exist at `forge/` root)
- **File with violation:** `forge/expense-tracker/cicd/README.md`

---

**1.2 [MEDIUM] — Step 2 description prompt is skipped in non-interactive env pass mode**

The standard (APP-CICD.md, "Step 2 — Resolve description") states: if no description arg and the script is running interactively, it prompts for one.

The actual script's condition at line 65 is:

```bash
if [[ -z "$MSG" && -z "${1:-}" ]]; then
```

This means: the prompt only fires when both `$MSG` is empty AND `$1` (the env arg) was not provided. If the user calls `./deploy.sh dev` (env provided, no description), the condition `${1:-}` is non-empty, so the description prompt is silently skipped and the default string is used without asking. The standard implies the prompt should fire whenever no description is given, regardless of whether the env was supplied interactively or as an arg.

- **File:** `forge/expense-tracker/cicd/deploy.sh`, line 65

---

## 2. `api/.clasp.json` — Placeholder and Content

**2.1 [HIGH] — `rootDir` is empty string instead of `"."`**

The standard (APP-CICD.md, "`api/.clasp.json`" section) specifies:

```json
{
  "scriptId": "${SCRIPT_ID_PLACEHOLDER}",
  "rootDir": ".",
  "scriptExtensions": [".js", ".gs"]
}
```

The committed `api/.clasp.json` has `"rootDir": ""` (empty string). An empty `rootDir` means `clasp` resolves paths relative to the directory where the `clasp` CLI is invoked, not relative to `.clasp.json` itself. The deploy script does `cd "$APP_DIR/api"` before running `clasp`, so this works at runtime — but it diverges from the documented schema, and the behavior would break if `clasp` is ever invoked from a different working directory.

- **File:** `forge/expense-tracker/api/.clasp.json`

---

**2.2 [HIGH] — `.clasp.json` contains undocumented fields**

The standard documents exactly three fields in `api/.clasp.json`: `scriptId`, `rootDir`, `scriptExtensions`.

The actual committed file contains five additional fields not mentioned in the standard:

- `"projectId": "default"`
- `"htmlExtensions": [".html"]`
- `"jsonExtensions": [".json"]`
- `"filePushOrder": []`
- `"skipSubdirectories": false`

Of these, `"jsonExtensions": [".json"]` is particularly significant: the standard states "JSON, markdown, and other files are excluded" from uploads. Having `.json` in `jsonExtensions` means `appsscript.json` (and any other `.json` files in `api/`) will be uploaded by `clasp push`. This contradicts the documented intent that `scriptExtensions` limits uploads to `.gs` and `.js` only.

- **File:** `forge/expense-tracker/api/.clasp.json`

---

**2.3 [MEDIUM] — `.clasprc.json` exclusion is in root `.gitignore` but no `.claspignore` exists**

The standard does not explicitly require a `.claspignore` file, but the `api/.clasp.json` schema and the `scriptExtensions` field are documented as the mechanism to prevent non-`.gs`/`.js` files from being uploaded. The `jsonExtensions` field currently in `.clasp.json` undermines this by making `.json` files uploadable. There is no `.claspignore` anywhere in the tree to serve as a secondary guardrail.

- **No `.claspignore` found** in `forge/expense-tracker/api/` or anywhere in the repo tree.

---

## 3. `cicd/envs.json` — Environment Registry

**3.1 [LOW] — `_comment` text references `bash forge/deploy.sh` (non-existent launcher)**

The `_comment` field in `cicd/envs.json` reads:

> "...deploy with `bash forge/deploy.sh` (which prompts for env)"

The standard documents no top-level `forge/deploy.sh` launcher. The correct invocation is `bash forge/expense-tracker/cicd/deploy.sh`. This is a documentation inconsistency inside the config file itself.

- **File:** `forge/expense-tracker/cicd/envs.json`, `_comment` key

---

## 4. `app/config.js` — Frontend URL Routing

**4.1 [MEDIUM] — `localhost` is not handled as a distinct case; `file://` detection is split across two files**

The standard (APP-CICD.md, "Frontend deploy" section) documents three distinct load contexts:

| Where loaded | Backend URL used |
|---|---|
| `http://localhost:*` | dev `/exec` URL |
| `https://*.github.io/...` | prod `/exec` URL |
| `file://` | blocked at HTML level |

`app/config.js` uses a single boolean: `location.hostname.endsWith('.github.io')`. This correctly maps GitHub Pages to prod. However, it maps every other hostname — including `localhost`, any custom domain, and any other host — to dev. The standard implies `localhost` is the expected dev host, not "anything that is not GitHub Pages". If the app were served from a staging domain (e.g. `staging.example.com`), it would silently use the dev backend.

- **File:** `forge/expense-tracker/app/config.js`, line 5

---

**4.2 [LOW] — `config.js` comment says `file://` routes to dev (stale)**

The inline comment in `config.js` at line 2 says "Local file:// or localhost → dev." However, `file://` is blocked by the `index.html` inline script before the app loads at all. The `config.js` comment misrepresents what happens for `file://` — the config is never reached for that protocol. This is a stale comment that contradicts the documented behavior.

- **File:** `forge/expense-tracker/app/config.js`, lines 2-3

---

## 5. `appsscript.json` — GAS Manifest

**5.1 [MEDIUM] — `appsscript.json` is uploadable via `clasp push` due to `jsonExtensions` field**

The standard (APP-CICD.md, first-time setup Step 2) instructs: paste the manifest into the GAS editor manually. It does not mention or endorse `clasp push` as the mechanism for updating the manifest.

Because `api/.clasp.json` has `"jsonExtensions": [".json"]`, every `clasp push` will upload `api/appsscript.json` to GAS, overwriting whatever manifest is in the editor. If the GAS editor's manifest differs from the committed `api/appsscript.json` (e.g. the `oauthScopes` field in the standard's setup template differs from what was manually set), this silently overwrites it. The `appsscript.json` in `api/` does match the standard's template — but the upload mechanism is undocumented and the risk of silent overwrite is unacknowledged.

- **File:** `forge/expense-tracker/api/.clasp.json` (`jsonExtensions`), `forge/expense-tracker/api/appsscript.json`

---

## 6. Makefile

**6.1 [HIGH] — `api-deploy` Makefile target invokes `bash cicd/deploy.sh` without an absolute or repo-relative path**

The `Makefile` `api-deploy` target is:

```make
api-deploy:
	bash cicd/deploy.sh
```

Make's working directory when executing a recipe is the directory containing the `Makefile`. The `Makefile` lives at `forge/expense-tracker/Makefile`, so `cicd/deploy.sh` resolves to `forge/expense-tracker/cicd/deploy.sh`, which is correct. However, if a developer runs `make api-deploy` from any other directory (using `make -C` or a wrapper), the path breaks silently because there is no guard or absolute path. The standard documents no Makefile requirement; the only issue is the implicit path dependency.

- **File:** `forge/expense-tracker/Makefile`, `api-deploy` target

---

**6.2 [HIGH] — `.server.pid` file is committed to the repo**

The root `.gitignore` correctly lists `.server.pid` as an excluded file. However, the `ls` output for `forge/expense-tracker/` shows `.server.pid` present in the working tree with a timestamp of `6 Aug 07:49`. A committed or tracked `.server.pid` would expose a local process ID in the repo history and cause stale-state errors for other developers. This file must remain untracked.

This finding requires verification: if `.server.pid` is listed in `.gitignore` and is genuinely untracked, this finding is LOW/informational. Given the `.gitignore` entry exists, the concern is that the file being present in the directory at review time suggests it may have been committed in an earlier state before the `.gitignore` entry was added.

- **File:** `forge/expense-tracker/.server.pid` (present on disk; `.gitignore` should exclude it but was worth flagging)

---

## 7. No GitHub Actions / CI Automation

**7.1 [LOW] — No `.github/workflows/` directory exists anywhere in the repo**

The standard documents that the frontend deploys automatically via GitHub Pages on every `git push`, which is a GitHub Pages hosting feature and requires no Actions workflow. However, there is no CI workflow of any kind — no lint, no push validation, no automated test of the backend deploy script. The standard does not require CI workflows; this is a gap relative to common practice, not a documented rule violation.

- **No `.github/workflows/` directory found** in the repository.
