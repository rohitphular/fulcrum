# Expense Tracker — CI/CD

Build, commit, and deploy pipeline. One script runs the full flow: stage + commit + push → `clasp push` to GAS draft → `clasp deploy` to the live `/exec` endpoint.

## Folder contents

| File | Purpose |
|---|---|
| `envs.json` | Single source of truth for both envs' Script ID + Deployment ID + /exec URL. Edited by hand when setting up a new env. |
| `app-deployment.sh` | One-shot pipeline — takes the env as a required first argument. Rewrites `backend/.clasp.json` and `app/config.js` based on `envs.json`, then git stage/commit/push → clasp push → clasp deploy. |

## Prerequisites

| What | How |
|---|---|
| `clasp` CLI | `npm install -g @google/clasp` |
| `clasp login` done | One-time OAuth — see `backend/README.md` |
| Git remote configured | `git push -u origin <branch>` works on this checkout |

## Environments

Two environments are wired up in `cicd/envs.json`:

| Env | When to use |
|---|---|
| `dev` | A separate Sheet + Apps Script project for testing risky changes (T-04 deletion FK guard, schema migrations, etc.) without touching real personal-finance data |
| `prod` | The live Sheet + Apps Script project that holds real data |

Each env's IDs (Script ID, Deployment ID, /exec URL) live in `cicd/envs.json`. There's no separate "active env" file. `envs.json` is the single source of truth; `app-deployment.sh` derives everything from it.

### Local-state invariant: always returns to dev

`app/config.js` always points at the **dev** `/exec` URL. This is true after every deploy — dev OR prod. The browser you open locally always talks to the dev backend.

`backend/.clasp.json` also returns to dev after every deploy. During a prod deploy it's flipped to prod for the duration of `clasp push` + `clasp deploy`, then reverted. A bash `EXIT` trap ensures the revert fires even if the deploy fails midway or is interrupted with Ctrl-C.

Concrete effect:

| What you ran | After it finishes, `config.js` points at | `.clasp.json` `scriptId` is |
|---|---|---|
| `bash forge/deploy.sh` → dev | dev | dev |
| `bash forge/deploy.sh` → prod | **dev** | **dev** (reverted) |
| `bash forge/deploy.sh` → prod, but clasp deploy fails | **dev** | **dev** (reverted by EXIT trap) |

Prod testing happens against the live prod `/exec` URL (the deployed Apps Script web app), not by pointing your local frontend at the prod backend.

## The pipeline (mandatory env)

The canonical entry point is the Forge launcher:

```bash
bash forge/deploy.sh
```

It asks two questions and runs everything:

1. **Select an app** — the menu lists every app under `forge/` that has a `cicd/app-deployment.sh`
2. **Select environment** — `dev` or `prod`, mandatory; no default
3. **Commit message** (optional — defaults to `expense-tracker: code pushed`)

There is no separate "switch env first" step. `app-deployment.sh` rewrites `backend/.clasp.json` and `app/config.js` from `envs.json` every time it runs, so the env you pick is the env that gets deployed — no drift possible.

### What runs under the hood

For the chosen app and env, the launcher invokes:

```
cicd/app-deployment.sh <env> "<commit message>"
```

which then:

1. Validates the env arg (`dev` or `prod`) and that all three IDs for that env are set in `envs.json` (refuses on any TODO). Also refuses if **dev** isn't fully configured, because local state always returns to dev — dev's IDs are needed regardless of which env you're deploying to.
2. Writes the **dev** `/exec` URL into `app/config.js` (always — the browser stays on dev).
3. (prod only) Prompts for a `y` confirmation — belt-and-braces even though the env was just chosen in the menu.
4. (prod only) Installs an EXIT trap that will revert `.clasp.json` back to dev on script exit.
5. Writes the **target env**'s `scriptId` to `backend/.clasp.json` (so clasp push hits the right project).
6. `git add .` from the app dir + `git add ../_shared/` for shared forge modules.
7. `git commit -m "<msg>"` — skipped if there's nothing staged.
8. `git push -u origin HEAD`.
9. `cd backend/ && clasp push --force` — syncs all `.gs` modules to the chosen env's GAS **draft**.
10. `clasp deploy --deploymentId <env's id> --description "<msg>"` — snapshots the draft as a new live version on the chosen env.
11. (prod only) EXIT trap fires: reverts `.clasp.json` to dev `scriptId`. Local state is back to dev.

Each env's `/exec` URL is bound to that env's deployment ID and does **not** change between deploys. Pushing without deploying never affects users — see `backend/README.md` for the push-vs-deploy distinction.

### Calling app-deployment.sh directly

You can skip the launcher menu if you already know what you want:

```bash
bash cicd/app-deployment.sh dev  "expense-tracker: try new feature"
bash cicd/app-deployment.sh prod "expense-tracker: ship new feature"
```

The env arg is **required** here too. Calling it without an env (e.g. the old `bash cicd/app-deployment.sh "msg"`) is now an error.

## Alternative entry points

**Backend-only, no git** — push GAS changes without making a commit. Hand-edit `backend/.clasp.json` so `scriptId` matches the target env's value in `envs.json`, then:

```bash
cd backend/
clasp push --force
clasp deploy --deploymentId "<paste from envs.json>" --description "your description"
```

A normal `bash forge/deploy.sh` run will reset `.clasp.json` to whatever env you pick, so this hand-edit only lasts until the next deploy.

**Frontend-only** — HTML/CSS/JS changes don't need a deploy at all. Browser refresh picks them up. If you're hosting the app on GitHub Pages, just push the branch GitHub Pages serves; clasp doesn't get involved.

## First-time setup (per environment)

You do this once for `dev`, then again for `prod`. **Set up dev first** — `app-deployment.sh` refuses any deploy (including prod) while dev's IDs are TODO, because local state always returns to dev. If you only want a single environment in your lifetime, set up the one you want as `dev`.

1. **Sheet** — create a new Google Sheet (any name; e.g. `Expense Tracker — DEV` or `Expense Tracker — PROD`). Tabs (`transactions`, `categories`, `accounts`, `rates`, `audit_access`) auto-create on first request.
2. **Apps Script** — open Extensions → Apps Script in the Sheet. Note the **Script ID** from Project Settings → IDs. Enable the manifest in **Project Settings → Show "appsscript.json" manifest file in editor**, then paste:
   ```json
   {
     "timeZone": "Europe/London",
     "exceptionLogging": "STACKDRIVER",
     "runtimeVersion": "V8",
     "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }
   }
   ```
   (You'll push the `.gs` source via clasp shortly — no need to paste it manually.)
3. **Secrets** — **Project Settings → Script Properties → Add property**:
   - `PIN_SECRET` — your numeric PIN. **Use a different PIN for prod than dev** so a leaked dev PIN can't unlock prod.
   - `TOTP_SECRET` — Base32 secret. Generate locally: `python3 -c "import base64, os; print(base64.b32encode(os.urandom(20)).decode())"`. Add the same secret to an authenticator app (Time-based).
   - `TOTP_ENABLED` — `false` for dev (faster iteration), `true` for prod (real second factor).
4. **Record the Script ID** in `cicd/envs.json` under the matching env. Leave `deployment_id` and `script_url` as TODO for now.
5. **Push the code for the first time** — `app-deployment.sh` refuses while `envs.json` has TODO values, so for this one-off bootstrap, hand-edit `backend/.clasp.json` to set `scriptId` to the new env's value, then:
   ```bash
   cd backend/
   clasp push --force               # uploads the .gs source to that env's project
   cd ..
   ```
6. **Deploy** — in the Apps Script editor: **Deploy → New deployment → Web app**, Execute as = `Me`, Access = `Anyone`. Copy the `/exec` URL.
7. **Record the deployment** in `cicd/envs.json`:
   - `deployment_id` — the long segment between `/s/` and `/exec` in the URL
   - `script_url` — the full `/exec` URL
8. **First proper deploy** — now that all three IDs are set, deploy via the normal pipeline (this regenerates `app/config.js` and bumps the GAS draft + deployment):
   ```bash
   bash cicd/app-deployment.sh dev "expense-tracker: bootstrap"     # or prod
   ```
9. **Open the app, log in with the env's PIN + TOTP, and verify** the Sheet receives the request.

From this point on, deployments to that env are one command:

```bash
bash forge/deploy.sh                                                # interactive
# or directly:
bash cicd/app-deployment.sh dev "expense-tracker: <change description>"
```

## Safety notes

- `clasp push --force` overwrites the GAS draft with local files. If you edited code in the browser editor since the last push, run `clasp pull` first to avoid losing work.
- `clasp login` tokens expire roughly once per year. Re-run `clasp login` if `clasp deploy` starts failing with an auth error.
- `config.js` is committed — the URL alone grants no access. The PIN + TOTP gate is what protects your data.
