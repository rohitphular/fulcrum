# Authentication

## Overview

Login requires a **PIN** and a **6-digit TOTP code**. Both are always shown on the login screen. The backend decides whether to validate the TOTP based on the `TOTP_ENABLED` Script Property — the frontend always sends whatever the user enters.

---

## Script Properties required

Set these in the Apps Script editor: **Extensions → Apps Script → Project Settings → Script Properties**.

| Property | Value | Description |
|---|---|---|
| `PIN_SECRET` | your chosen PIN | Required. Login is blocked without it. |
| `TOTP_SECRET` | Base32 secret key | Required when `TOTP_ENABLED=true`. Same key entered into Google Authenticator. |
| `TOTP_ENABLED` | `true` \| `false` | Controls TOTP validation (see below). |

---

## TOTP_ENABLED flag

`TOTP_ENABLED` is the single point of control for TOTP enforcement.

| Value | Behaviour |
|---|---|
| `true` | Backend validates the TOTP against `TOTP_SECRET` using RFC 6238 HMAC-SHA1 (±1 window). Wrong code → `totp_invalid` error. |
| `false` (or not set) | Backend skips TOTP validation entirely. Any 6-digit code the user enters is accepted. |

**The frontend is unaffected by this flag.** The login form always shows PIN + TOTP fields. The user always enters a 6-digit code. The backend silently skips or enforces validation depending on the property value.

### Local development

Set `TOTP_ENABLED=false` in Script Properties. Enter your PIN and any 6-digit number (e.g. `000000`) to log in. No changes to any source file are needed — there is no dev flag in the codebase.

### Production

Set `TOTP_ENABLED=true`. Scan the `TOTP_SECRET` QR code with Google Authenticator (or any RFC 6238-compatible app). The backend accepts codes from the current 30-second window ±1 window to tolerate minor clock skew.

---

## IP audit log

Every login attempt (success or failure) is recorded in the `_audit` sheet with:
- IP address, city, country, user-agent
- First seen / last seen timestamps
- Running totals: attempts, successes, failures
- Lock status

After `MAX_FAILURES` consecutive failures from the same IP, that IP is locked. A locked IP receives `{ ok: false, error: 'locked' }` on every subsequent request until manually unlocked in the sheet.

---

## Session

A successful login writes an encrypted session to `sessionStorage` (key: `et_session`) with a 6-hour TTL. Closing the tab or TTL expiry requires re-authentication. The PIN is stored in the session and attached to every subsequent API request — TOTP is only verified at login time.
