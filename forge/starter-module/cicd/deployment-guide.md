# Starter Module — Deployment Guide

This guide covers first-time setup and ongoing maintenance. Use this as the reference when scaffolding any new Forge module.

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
2. Name it anything — e.g. `Fulcrum — Starter Module`.
3. Leave it empty — both the `starter` and `audit_access` sheet tabs are created **automatically** by Apps Script on the first request.

---

### Step 2 — Set up Apps Script

1. In your spreadsheet, go to **Extensions → Apps Script**.
2. Delete the default `myFunction` code in `Code.gs`.
3. Copy the entire contents of `backend/Code.js` from this repo and paste it in.
4. Click **Save** (the floppy disk icon or Ctrl+S).

**Update the Apps Script manifest (`appsscript.json`):**

5. In the Apps Script editor, go to **Project Settings** (gear icon on the left sidebar).
6. Tick **Show "appsscript.json" manifest file in editor**.
7. Click the `appsscript.json` file in the left panel.
8. Replace its entire contents with:

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

9. Click **Save**.

> Without the `"webapp"` block, the deployment step will not offer the Web App option. Adjust `timeZone` if needed (e.g. `"Asia/Kolkata"`).

---

### Step 3 — Set your PIN and TOTP secret

1. In Apps Script, go to **Project Settings** → **Script Properties** → **Add script property**.
2. Add two properties:

| Property name | Value |
|---|---|
| `PIN_SECRET` | Your chosen PIN (numbers recommended, e.g. `482917`) |
| `TOTP_SECRET` | A Base32 secret key — see below |

3. Click **Save script properties**.

**Generating a TOTP secret:**

- Run locally: `python3 -c "import base64, os; print(base64.b32encode(os.urandom(20)).decode())"`
- Or use [https://it-tools.tech/otp-generator](https://it-tools.tech/otp-generator)
- Copy the Base32 secret (e.g. `JBSWY3DPEHPK3PXP`) — uppercase letters and digits 2–7.

**Adding to your authenticator app:**
1. Open your authenticator app → tap **+** → **Enter a setup key**.
2. Account name: `Fulcrum Starter` (or anything you like).
3. Key: paste your `TOTP_SECRET` value.
4. Type: **Time based** → Tap **Add**.

Both secrets are stored inside Google's infrastructure. Do not put them in `config.js` or any committed file.

---

### Step 4 — Deploy as a Web App

1. In Apps Script, click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set:
   - **Description:** `starter-module v1` (or anything)
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
4. Click **Deploy** — authorise when prompted.
5. Copy the **Web app URL**: `https://script.google.com/macros/s/AKfycb.../exec`

The URL must end in `/exec` (not `/dev`).

---

### Step 5 — Configure the app

1. Create `app/config.js`:

```js
window.CONFIG = {
  SCRIPT_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec'
};
```

2. Replace `YOUR_DEPLOYMENT_ID` with the Web App URL you copied above.
3. `config.js` is committed to the repo. The URL alone gives no access — the PIN + TOTP gate protects your data.

---

### Step 6 — Open the app

**Locally:** Open `app/index.html` directly in a browser (`file://` path works fine).

**Via GitHub Pages:**
```
https://<your-github-username>.github.io/<repo-name>/forge/starter-module/app/
```

On first load: enter your PIN and the 6-digit code from your authenticator app. The PIN is stored in `sessionStorage` — it clears when you close the tab.

---

### Step 7 — Verify

1. Sign in — the table should show "No items yet".
2. Add an item via the form — confirm it appears in both the table and your Google Sheet.
3. Edit and delete the item — confirm the sheet updates correctly.
4. Toggle dark mode — confirm the theme persists on reload.

---

## Ongoing deployments

### Script-based (recommended)

The deployment script handles git and clasp in one step.

**From the app directory:**
```bash
bash cicd/app-deployment.sh "starter-module: your change description"
```

**Or from the forge root (interactive menu):**
```bash
bash forge/deploy.sh
# Select "starter-module", enter a commit message when prompted
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
  --deploymentId "AKfycbykwDFrvKj5vnScj16Y1cb9FA5TkS5I0yss1RrX6ps8N04seU1Tlhi5s_V8ZuNzgvlK" \
  --description "your description"
```

The deployment URL stays the same — `config.js` does not need to change.

---

### Manual — via GAS editor

1. Make your changes in the Apps Script editor.
2. **Deploy → Manage deployments**.
3. Click the **pencil (Edit)** icon on your deployment.
4. Change the version to **New version** → click **Deploy**.

---

## Operations reference

### Unlock a locked IP

After 3 failed PIN attempts, the IP is locked.

1. Open your spreadsheet → `audit_access` tab.
2. Find the row for that IP.
3. Set `is_locked` to `FALSE`.

To reset all counts for that IP, delete the row entirely.

### Change your PIN

1. Apps Script → **Project Settings → Script Properties** → update `PIN_SECRET`.
2. Close and reopen the browser tab (clears `sessionStorage`).

### Change your TOTP secret

1. Generate a new Base32 secret.
2. Update `TOTP_SECRET` in Script Properties.
3. Remove the old entry from your authenticator app and add the new secret.

### Hosting on GitHub Pages

The `_shared/` folder starts with an underscore. Jekyll (GitHub Pages default) skips underscore directories. A `.nojekyll` file at the repo root disables Jekyll so `_shared/` is served correctly — do not remove it.

To enable GitHub Pages:
1. Make the repo public (free tier requirement).
2. Go to repo **Settings → Pages → Branch: `main`, folder: `/ (root)` → Save**.
3. Your module is live at `https://<username>.github.io/<repo>/forge/starter-module/app/`.

### Backup

The Google Sheet is the source of truth. Download as `.xlsx` or use Google Takeout for a full backup.

---

## File reference

```
forge/starter-module/
  app/
    index.html              App shell — open this in a browser
    starter-module.js       All frontend logic
    starter-module.css      Module styles
    config.js               Your Script URL (create manually — see Step 5)
  backend/
    .clasp.json             Links this folder to the GAS project
    appsscript.json         GAS runtime manifest
    Code.js                 Apps Script backend source
    development-guide.md    Clasp workflow reference for backend iteration
  cicd/
    app-deployment.sh       One-shot deploy: git + clasp push + clasp deploy
    deployment-guide.md     This file
  DESIGN.md                 Forge design system guide — UI patterns and conventions
  README.md                 Developer reference (UI patterns, schema, template guide)
  dev-tasks/                Local scratch space — not committed
```
