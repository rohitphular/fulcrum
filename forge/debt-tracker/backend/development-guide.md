# Debt Tracker — Backend Development Guide

This guide covers the clasp-based workflow for iterating on the Apps Script backend without using the browser editor.

---

## Folder contents

| File | Purpose |
|---|---|
| `.clasp.json` | Links this directory to the GAS project (Script ID) |
| `appsscript.json` | GAS runtime manifest — timezone, V8 engine, web app access settings |
| `Code.js` | Backend source — the full server-side logic |

> `.clasp.json` holds the Script ID (a public identifier, not a secret). OAuth credentials live in `~/.clasprc.json` and are never committed — see the root `.gitignore`.

---

## Prerequisites

```bash
npm install -g @google/clasp   # install once globally
clasp login                     # opens browser — authenticate once per machine
```

After login, `~/.clasprc.json` holds your tokens. You will not need to log in again unless the token expires (roughly once per year).

---

## IDs for this app

| Identifier | Value |
|---|---|
| **Script ID** | `1UPaW9snrj0ilkwkPgirRMTCBbsZxXQ9eoawgrFsEv927BKYiFWw-S63x` |
| **Deployment ID** | `AKfycbwAKh5TGg9sP9F5HRROQg5NUpwJV8QPvBwriIG2eToPN-9wt9E0fiNA6S3lqVlrpyNtCg` |

The Script ID is what `.clasp.json` uses for push/pull/open. The Deployment ID is baked into `cicd/app-deployment.sh` — it pins the live `/exec` endpoint.

---

## Everyday commands

Run all commands from inside the `backend/` directory.

```bash
# Push local changes to GAS (updates the draft — does NOT affect the live /exec URL)
clasp push --force

# Open the GAS editor in your browser (view logs, run functions manually)
clasp open

# Pull the latest version from GAS back to local (if you edited in the browser)
clasp pull

# Tail recent execution logs
clasp logs

# Create a new version on the live endpoint (required for changes to take effect)
clasp deploy \
  --deploymentId "AKfycbwAKh5TGg9sP9F5HRROQg5NUpwJV8QPvBwriIG2eToPN-9wt9E0fiNA6S3lqVlrpyNtCg" \
  --description "your description"
```

---

## Push vs deploy — the key distinction

| Action | Command | Effect |
|---|---|---|
| **Push** | `clasp push` | Syncs files to the GAS project. Updates the **draft** only. The `/dev` URL picks this up immediately — useful for manual testing in the browser. |
| **Deploy** | `clasp deploy` | Snapshots the current state as a new version on the live endpoint. The `/exec` URL (used by `config.js`) is updated. **Push alone does not affect what users see.** |

The app's `config.js` always points to `/exec`. A push without a deploy means users still run the previous version.

---

## Testing changes before deploying

Use the `/dev` URL to validate changes without touching the live endpoint:

1. Run `clasp push --force`
2. In the GAS editor, open **Deploy → Test deployments** — copy the `/dev` URL
3. Temporarily change `SCRIPT_URL` in `app/config.js` to the `/dev` URL and test in the browser
4. When satisfied, deploy: `clasp deploy --deploymentId "..." --description "..."`
5. Revert `config.js` back to the `/exec` URL

> The `/dev` URL requires you to be signed in to the same Google account in the browser.

---

## Making a backend change end-to-end

**Via the deploy script (recommended):**
```bash
# From the app root (debt-tracker/)
bash cicd/app-deployment.sh "debt-tracker: fix payment calc"
```
This: git-stages + commits + pushes → `clasp push --force` → `clasp deploy`.

**Or from the forge root (menu-driven):**
```bash
bash forge/deploy.sh
# Select "debt-tracker" from the menu, enter a commit message
```

**Manual (backend only, no git):**
```bash
cd backend/
clasp push --force
clasp deploy \
  --deploymentId "AKfycbwAKh5TGg9sP9F5HRROQg5NUpwJV8QPvBwriIG2eToPN-9wt9E0fiNA6S3lqVlrpyNtCg" \
  --description "your description"
```

---

## Cloning this project fresh

If you ever need to re-link a machine to this GAS project:

```bash
cd backend/
clasp login                    # if not already authenticated
clasp pull                     # pulls the current GAS state into Code.js
```

The `.clasp.json` already contains the Script ID — no `clasp clone` needed.
