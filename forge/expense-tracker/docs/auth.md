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

On successful login the server returns a session token. The client stores it for the duration of the browser tab (or until TTL expiry). Every subsequent request attaches the PIN; TOTP is verified only at login.

| Property | Value |
|---|---|
| Storage scope | Per-tab (cleared on tab close) |
| TTL | 6 hours after issue |
| Re-login required | Tab closed; TTL expired; server returns `auth` or `locked` |

Forced logout = clear the session storage.

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
