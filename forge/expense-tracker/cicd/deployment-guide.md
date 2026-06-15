# Expense Tracker — Deployment Guide

This guide covers first-time setup and ongoing maintenance.

---

## Prerequisites

- A Google account
- The `forge/_shared/` folder present in this repo (required by `index.html`)
- An authenticator app (Google Authenticator, Authy, or similar) on your phone

---

## First-time deployment

### Step 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Name it anything — e.g. `Fulcrum Expense Tracker`.
3. Leave it empty — all sheet tabs (`transactions`, `categories`, `accounts`, `rates`, `audit_access`) are created **automatically** by Apps Script on the first request.

---

### Step 2 — Set up Apps Script

1. In your spreadsheet, go to **Extensions → Apps Script**.
2. Delete the default `myFunction` code in `Code.gs`.
3. Copy the entire contents of `backend/Code.gs` from this repo and paste it in.
4. Click **Save** (the floppy disk icon or Ctrl+S).

**Update the Apps Script manifest (`appsscript.json`):**

5. In the Apps Script editor, go to **Project Settings** (gear icon on the left).
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

> Without the `"webapp"` block in the manifest, the deployment step will not offer the Web App option and the app will fail to connect.

---

### Step 3 — Set your PIN and TOTP secret

1. In Apps Script, go to **Project Settings** (the gear icon on the left sidebar).
2. Scroll to **Script Properties** → click **Add script property**.
3. Add two properties:

| Property name | Value |
|---|---|
| `PIN_SECRET` | Your chosen PIN (numbers recommended, e.g. `482917`) |
| `TOTP_SECRET` | A Base32 secret key — see below |

4. Click **Save script properties**.

**Generating a TOTP secret:**
- Go to [https://it-tools.tech/otp-generator](https://it-tools.tech/otp-generator) or any TOTP generator.
- Copy the Base32 secret (e.g. `JBSWY3DPEHPK3PXP`) — uppercase letters and digits 2–7.
- Paste it as the `TOTP_SECRET` value.

**Adding to your authenticator app:**
1. Open your authenticator app → tap **+** → **Enter a setup key**.
2. Account name: `Fulcrum Expense` (or anything you like).
3. Key: paste your `TOTP_SECRET` value.
4. Type: **Time based**.
5. Tap **Add**.

You will see a 6-digit code that refreshes every 30 seconds. Enter it alongside your PIN when signing in.

---

### Step 4 — Deploy as a Web App

1. In Apps Script, click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set:
   - **Description:** `expense-tracker v1`
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
4. Click **Deploy**.
5. Copy the **Web app URL** — it looks like:
   `https://script.google.com/macros/s/AKfycb.../exec`

---

### Step 5 — Configure the app

1. Create `app/config.js` with the following content:

```js
window.CONFIG = {
  SCRIPT_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec'
};
```

2. Replace `YOUR_DEPLOYMENT_ID` with the Web App URL you copied (the full `/exec` URL).
3. `config.js` is committed to the repo. The Apps Script URL alone gives no access — the PIN + TOTP gate protects your data.

---

### Step 6 — Seed the categories

The categories drive the dropdown cascade in the add-transaction form.

**Option A — Automatic seed on first request (recommended):**
The `listCategories()` function seeds the `categories` tab automatically if it is empty. On first load after sign-in, all categories are created for you.

**Option B — Manual seed from Apps Script:**
1. In Apps Script, click **Run** on the `seedCategories` function.
2. Confirm the authorisation prompt on first run.
3. The `categories` tab in your sheet will be populated with all standard categories.

You can add, remove, or edit rows in the `categories` tab at any time — the app reads them live.

---

### Step 7 — Add your accounts

The `accounts` tab is managed directly in the Sheet (account management from the app is out of scope for v1).

1. Open your spreadsheet and go to the `accounts` tab (created automatically after step 6).
2. Add one row per account:

| Column | Example |
|---|---|
| `name` | `HDFC Savings` |
| `currency` | `INR` |
| `type` | `savings` |
| `notes` | `primary India account` |

Valid types: `savings`, `current`, `credit`, `cash`, `investment`, `other`.

The `account` field on every transaction must match a name in this tab exactly. The app will still show transactions with unknown accounts — no rows are dropped.

---

### Step 8 — Open the app

**Locally:**
Open `app/index.html` directly in a browser (`file://` path works fine).

**Via GitHub Pages:**
```
https://<your-github-username>.github.io/<repo-name>/forge/expense-tracker/app/
```

On first load:
- If `config.js` is missing, a setup banner appears.
- If `config.js` is present, the PIN + TOTP sign-in screen appears.
- Enter your PIN and the 6-digit code from your authenticator app.
- The PIN is stored in `sessionStorage` — it clears when you close the browser tab.

---

### Step 9 — Verify

1. Sign in successfully — you should see the Dashboard with empty summary cards.
2. Go to **Categories** — the full category tree should be visible.
3. Go to **Accounts** — your accounts should appear.
4. Go to **Rates** — GBP, INR, USD, EUR, AED should be pre-seeded.
5. Go to **Transactions** → open the add form → add one transaction → confirm it appears in the table and in your Google Sheet.

---

## Subsequent backend deployments

Apps Script deployments are immutable snapshots. After editing `Code.gs`:

1. Go to **Deploy → Manage deployments**.
2. Click the **pencil (Edit)** icon on your deployment.
3. Change the version to **New version**.
4. Click **Deploy**.

The URL stays the same — no change needed in `config.js`.

---

## Operations reference

### Unlock a locked IP

After 3 failed PIN attempts, the IP is locked. To unlock:
1. Open your spreadsheet → `audit_access` tab.
2. Find the row for that IP.
3. Set the `is_locked` column to `FALSE`.

To reset all counts for that IP, delete the row entirely.

### Change your PIN

1. Open Apps Script → **Project Settings → Script Properties**.
2. Update `PIN_SECRET`.
3. Clear `sessionStorage` in the browser (or close and reopen the tab).

### Change your TOTP secret

1. Generate a new Base32 secret.
2. Update `TOTP_SECRET` in Script Properties.
3. Remove the old entry from your authenticator app and add the new secret.

### Backup

The Google Sheet is the source of truth. Download it as `.xlsx` or use Google Takeout for a full backup.

---

## Category conventions

**Credit card payments:**

Pick one convention and stick to it — mixing causes double-counting:

- If your credit card is tracked as its own account in the `accounts` tab:
  Use `money-transfer → Card payment → Pay credit card`.
  This moves money from a bank account to a credit card account without affecting income/expense totals.

- If credit cards are not tracked as accounts:
  Use `money-out → Debt & finance → Credit card payment`.
  This records the payment as an expense.

The debt-tracker handles what you _owe_ on each card; the expense-tracker handles the _payment flow_.
