# Expense Tracker — CI/CD

Build, commit, and deploy pipeline. One script runs the full flow: stage + commit + push → `clasp push` to GAS draft → `clasp deploy` to the live `/exec` endpoint.

## Folder contents

| File | Purpose |
|---|---|
| `app-deployment.sh` | One-shot pipeline — git stage/commit/push, then clasp push + deploy |

## Prerequisites

| What | How |
|---|---|
| `clasp` CLI | `npm install -g @google/clasp` |
| `clasp login` done | One-time OAuth — see `backend/README.md` |
| Git remote configured | `git push -u origin <branch>` works on this checkout |

## The pipeline

```bash
bash cicd/app-deployment.sh "expense-tracker: <change description>"
```

`set -euo pipefail` — any step failing aborts the rest.

### What it does

1. `git add .` from `expense-tracker/` + `git add ../_shared/` for shared forge modules
2. `git commit -m "<msg>"` — skipped if there's nothing staged
3. `git push -u origin HEAD`
4. `cd backend/ && clasp push --force` — syncs all `.gs` modules to the GAS project **draft**
5. `clasp deploy --deploymentId <pinned> --description "<msg>"` — snapshots the draft as a new live version

The deployment ID is pinned inside the script:

```
AKfycbxWTOuXeCkH4tsDvrmCjkjxlhIZqLyIhxfvXR51ymWRc1FGAOYkLt0rkeGjTfQmWAv2RA
```

The live `/exec` URL is bound to that ID and does **not** change between deploys. Pushing without deploying never affects users — see `backend/README.md` for the push-vs-deploy distinction.

## Alternative entry points

**Forge multi-app menu** — pick `expense-tracker` interactively:

```bash
bash forge/deploy.sh
```

**Backend-only, no git** — push GAS changes without a commit:

```bash
cd backend/
clasp push --force
clasp deploy \
  --deploymentId "AKfycbxWTOuXeCkH4tsDvrmCjkjxlhIZqLyIhxfvXR51ymWRc1FGAOYkLt0rkeGjTfQmWAv2RA" \
  --description "your description"
```

**Frontend-only** — HTML/CSS/JS changes don't need a deploy. Browser refresh picks them up. If hosted on GitHub Pages, just push the branch GitHub Pages serves.

## First-time setup

Before the pipeline can run end-to-end you need a GAS project, a Sheet, secrets, and a Deployment ID. Do this once per fork:

1. **Sheet** — create a new Google Sheet (any name). Tabs (`transactions`, `categories`, `accounts`, `rates`, `audit_access`) auto-create on first request.
2. **Apps Script** — open Extensions → Apps Script in the Sheet. Paste every `.gs` file from `backend/`. Enable the manifest in **Project Settings → Show "appsscript.json" manifest file in editor**, then paste:
   ```json
   {
     "timeZone": "Europe/London",
     "exceptionLogging": "STACKDRIVER",
     "runtimeVersion": "V8",
     "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }
   }
   ```
3. **Secrets** — **Project Settings → Script Properties → Add property**:
   - `PIN_SECRET` — your numeric PIN
   - `TOTP_SECRET` — Base32 secret. Generate locally: `python3 -c "import base64, os; print(base64.b32encode(os.urandom(20)).decode())"`. Add the same secret to an authenticator app (Time-based).
4. **Deploy** — **Deploy → New deployment → Web app**, Execute as = `Me`, Access = `Anyone`. Copy the `/exec` URL.
5. **Config** — set `SCRIPT_URL` in `app/config.js` to the `/exec` URL you copied.
6. **Pin the Deployment ID** — replace the `--deploymentId` value inside `cicd/app-deployment.sh` with the ID from your `/exec` URL (the long segment between `/s/` and `/exec`).

After step 6, all subsequent changes ship via `bash cicd/app-deployment.sh "..."`.

## Safety notes

- `clasp push --force` overwrites the GAS draft with local files. If you edited code in the browser editor since the last push, run `clasp pull` first to avoid losing work.
- `clasp login` tokens expire roughly once per year. Re-run `clasp login` if `clasp deploy` starts failing with an auth error.
- `config.js` is committed — the URL alone grants no access. The PIN + TOTP gate is what protects your data.
