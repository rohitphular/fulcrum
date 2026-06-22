# Authentication

Single-user PIN-based authentication with optional TOTP second factor and IP-based rate limiting. There is no user concept — the secret is shared.

## Inputs

| Input | Source |
|---|---|
| PIN | User enters at login. Matched against `PIN_SECRET` (server-side config). |
| TOTP code | User enters at login. Validated against `TOTP_SECRET` (server-side config) when `TOTP_ENABLED = true`. |
| Client IP | Captured server-side from the request. Used for rate limiting + audit. |

## Server-side configuration

| Key | Value | Behaviour |
|---|---|---|
| `PIN_SECRET` | The chosen PIN | Required. Login is impossible without it. |
| `TOTP_SECRET` | Base32 secret (RFC 6238) | Used only when `TOTP_ENABLED = true`. |
| `TOTP_ENABLED` | `true` \| `false` (default `false`) | Single point of control for TOTP enforcement. |

## TOTP_ENABLED flag

| Value | Behaviour |
|---|---|
| `true` | Server validates the 6-digit code via RFC 6238 HMAC-SHA1 with a ±1 window for clock skew. Wrong code returns `totp_invalid`. |
| `false` | Server skips TOTP validation. Any 6-digit input is accepted. |

The login form always shows both fields regardless of the flag. The user always enters a code. The server silently enforces or skips the check.

## Rate limiting and audit

Every login attempt (success or failure) is recorded in an audit store keyed by IP. The record carries:

- IP, city, country, user-agent
- First-seen and last-seen timestamps
- Running counters: attempts, successes, failures
- Lock state

After `MAX_FAILURES` consecutive failures from the same IP, the IP is locked. Subsequent requests from that IP return `{ ok: false, error: 'locked' }` for every endpoint, not just login. Unlocking is a manual operation against the underlying audit store (flip `is_locked = false` or delete the row).

The lock is per-IP, not per-PIN. A locked IP cannot guess further PINs.

## Session

On successful login the client persists a session blob to per-tab session storage and attaches the PIN to every subsequent request. TOTP is verified only at login.

| Property | Value |
|---|---|
| Storage scope | Per-tab (cleared on tab close) |
| TTL | 6 hours after issue |
| Re-login required | Tab closed; TTL expired; server returns `auth` or `locked` |

Forced logout = clear the session storage.

### PIN-as-bearer-credential — design note

The PIN itself serves as the bearer credential on every request — there is no opaque server-issued session token. This is a deliberate simplification given the single-user threat model and the Apps Script substrate:

- **Server-side**: `checkPin` runs constant-time comparison against `PIN_SECRET` (in Script Properties). Failed attempts are rate-limited per-IP via the audit log; `MAX_FAILURES` consecutive failures lock the IP for every endpoint (not just login).
- **Client-side**: PIN sits in `sessionStorage` for the tab's lifetime. The only realistic exfiltration path is XSS, which is closed by (a) server-side input validation on currency codes and rate symbols (the only inputs that flow into innerHTML), (b) `showMsg` using `textContent` not `innerHTML`, and (c) the Chart.js CDN script pinned with an SRI hash.
- **Transport**: HTTPS-only via the GAS web app URL.

A future hardening would issue an opaque session token at login (e.g. `Utilities.getUuid()` stored in PropertiesService) and send that instead of the PIN. That migration would touch every Forge module's auth flow — out of scope for the expense-tracker alone.

## Errors

| Error | Meaning | Response |
|---|---|---|
| `auth` | PIN incorrect | Client clears session and shows login |
| `totp_invalid` | TOTP wrong (when enforced) | Same |
| `locked` | IP exceeded `MAX_FAILURES` | Persistent — manual unlock needed |
| `not_setup` | `PIN_SECRET` not configured server-side | Initial setup gap; login impossible |

## Development convenience

Set `TOTP_ENABLED = false`. The user enters any 6-digit code (e.g. `000000`) along with the PIN. No client-side code change is needed — the toggle is server-only.

For production: set `TOTP_ENABLED = true`, add `TOTP_SECRET` to an authenticator app (Google Authenticator, Authy, or any RFC 6238 client) using the same Base32 secret.
