# Debt Tracker — Deployment Guide

This guide covers first-time setup and ongoing maintenance.

---

## Prerequisites

| What | Why |
|---|---|
| Google account | Hosts the spreadsheet and Apps Script |
| TOTP authenticator app | Google Authenticator, Authy, or any RFC 6238-compatible app |
| `clasp` CLI | Required for script-based deployments — `npm install -g @google/clasp` |
| `clasp login` done | One-time OAuth — run `clasp login` and authenticate |

---

## First-time deployment

### Step 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Name it something recognisable, e.g. `Fulcrum — Debt Tracker`.
3. The four data tabs (`debts`, `payments`, `rates`, `audit_access`) are created **automatically** on first use.

---

### Step 2 — Add the Apps Script backend

1. Inside the spreadsheet: **Extensions → Apps Script**.
2. Replace the default `Code.gs` content with the contents of `backend/Code.js` from this repo.
3. Rename the project if desired (top-left, next to "Apps Script").

**Set the runtime to V8:**
- **Project Settings** (gear icon, left sidebar) → check **"Show `appsscript.json`"**
- Back in the editor, open `appsscript.json` and replace its contents with:

```json
{
  "timeZone": "Europe/London",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

> Adjust `timeZone` to your local zone if needed (e.g. `"Asia/Kolkata"`).

---

### Step 3 — Generate a TOTP secret

You need a Base32-encoded secret shared between the backend and your authenticator app.

**Generate one locally:**
```bash
python3 -c "import base64, os; print(base64.b32encode(os.urandom(20)).decode())"
```

Example output: `JBSWY3DPEHPK3PXP`

Keep this value — you will need it in both the next step and your authenticator app.

---

### Step 4 — Set Script Properties (secrets)

In the Apps Script editor: **Project Settings** → **Script Properties** → **Add script property** (twice):

| Property | Value |
|---|---|
| `PIN_SECRET` | Your chosen PIN (any string — numeric PINs work well, e.g. `123456`) |
| `TOTP_SECRET` | The Base32 secret from Step 3 |

These are stored server-side and never exposed to the browser.

---

### Step 5 — Deploy as Web App

1. **Deploy → New deployment**
2. Click the gear icon next to "Select type" → choose **Web app**
3. Set:
   - **Description**: `v1` (or any label)
   - **Execute as**: `Me`
   - **Who has access**: `Anyone`
4. Click **Deploy** → authorise when prompted
5. Copy the **Web App URL**: `https://script.google.com/macros/s/AKfycb.../exec`

---

### Step 6 — Add your TOTP account to the authenticator app

1. Open your authenticator app → **Add account → Enter a setup key**
2. Account name: `Debt Tracker` (or anything)
3. Key: paste the Base32 secret from Step 3
4. Type: **Time-based**

Verify it generates 6-digit codes before continuing.

---

### Step 7 — Configure the frontend

Create `app/config.js`, replacing the URL with your Web App URL:

```js
window.CONFIG = {
  SCRIPT_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec'
};
```

The URL must end in `/exec` (not `/dev`). `config.js` is committed to the repo — the PIN + TOTP gate protects your data, not this URL.

---

### Step 8 — Open the app

Open `app/index.html` directly in a browser (`File → Open`, or drag it in).

- Enter your PIN and the current 6-digit TOTP code → **Unlock**
- Exchange rates are seeded automatically on first load
- All four data tabs are created in the spreadsheet on the first request

---

## Ongoing deployments

### Script-based (recommended)

The deployment script handles git and clasp in one step.

**From the app directory:**
```bash
bash cicd/app-deployment.sh "debt-tracker: your change description"
```

**Or from the forge root (interactive menu):**
```bash
bash forge/deploy.sh
# Select "debt-tracker", enter a commit message when prompted
```

Both do the same thing: `git add` → `git commit` → `git push` → `clasp push --force` → `clasp deploy`.

> **Prerequisite:** `clasp` must be installed and `clasp login` must have been run at least once on this machine. See `backend/development-guide.md`.

---

### Manual — frontend only

HTML / CSS / JS changes take effect immediately on refresh. No deployment needed.

---

### Manual — backend only (no git commit)

When you want to push a GAS change without making a git commit:

```bash
cd backend/
clasp push --force
clasp deploy \
  --deploymentId "AKfycbwAKh5TGg9sP9F5HRROQg5NUpwJV8QPvBwriIG2eToPN-9wt9E0fiNA6S3lqVlrpyNtCg" \
  --description "your description"
```

The deployment URL stays the same — `config.js` does not need to change.

---

### Manual — via GAS editor

1. Make your changes in the Apps Script editor.
2. **Deploy → Manage deployments**.
3. Click the **pencil (Edit)** icon on your deployment.
4. Change **Version** to **New version** → click **Deploy**.

---

## Operations reference

### Unlock a locked IP

After 3 consecutive failed PIN attempts, an IP is permanently locked.

1. Open the Google Sheet → `audit_access` tab
2. Find the row where `ip` matches the locked address
3. Set `is_locked` to `FALSE`

### Reset a forgotten PIN

1. Apps Script editor → **Project Settings → Script Properties**
2. Update `PIN_SECRET` to a new value — no redeployment needed

### Reset TOTP (lost authenticator)

1. Generate a new Base32 secret (Step 3 above)
2. Update `TOTP_SECRET` in Script Properties
3. Add the new secret to your authenticator app (Step 6 above) — no redeployment needed

### Move to a different Google account

1. Share the spreadsheet with the new account (Editor access)
2. Open Apps Script → share the project with the new account
3. Log in as the new account, open the script, and redeploy (`Execute as: Me` binding changes)
4. Update `config.js` with the new deployment URL

### Backup

The Google Sheet is the source of truth. Download as `.xlsx` or use Google Takeout for a full backup.

---

## File reference

```
forge/debt-tracker/
  app/
    index.html              App shell — open this in a browser
    main.js                 Frontend entry point (ES module)
    core/                   State, API, utils, UI, auth, nav modules
    sections/               Dashboard, debts, payments, rates, projector
    debt-tracker.css        Styles
    config.js               Your Script URL (create manually — see Step 7)
  backend/
    .clasp.json             Links this folder to the GAS project
    appsscript.json         GAS runtime manifest
    Code.js                 Apps Script backend source
    development-guide.md    Clasp workflow reference for backend iteration
  cicd/
    app-deployment.sh       One-shot deploy: git + clasp push + clasp deploy
    deployment-guide.md     This file
  dev-tasks/                Local scratch space — not committed
```
