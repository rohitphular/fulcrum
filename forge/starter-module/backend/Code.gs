// =============================================================================
// FULCRUM FORGE — Apps Script backend
// Deploy as: Execute as Me · Anyone can access
//
// Script Properties required (Extensions → Apps Script → Project Settings):
//   PIN          — your chosen PIN
//   TOTP_SECRET  — Base32 secret key (e.g. JBSWY3DPEHPK3PXP), same key you
//                  enter into Google Authenticator / Authy
//
// Sheet tabs:
//   starter       — data; created automatically on first request
//   audit_access  — one row per IP; created automatically on first request
//
// To unlock a locked IP: open audit_access, set is_locked to FALSE for that row.
// =============================================================================

const SHEET_NAME       = 'starter';
const AUDIT_SHEET_NAME = 'audit_access';
const COLUMNS          = ['id', 'name', 'description', 'status', 'created_at', 'updated_at'];
const AUDIT_COLUMNS    = [
  'ip', 'city', 'country', 'user_agent',
  'first_seen', 'last_seen',
  'total_attempts', 'success_count', 'failure_count', 'last_failed_at',
  'is_locked', 'locked_at'
];
const MAX_FAILURES = 3;

// AUDIT_COLUMNS indices (for getRange column numbers, add 1):
// 0=ip  1=city  2=country  3=user_agent
// 4=first_seen  5=last_seen
// 6=total_attempts  7=success_count  8=failure_count  9=last_failed_at
// 10=is_locked  11=locked_at

// -----------------------------------------------------------------------------
// Entry points
// -----------------------------------------------------------------------------

function doGet(e) {
  const meta   = extractMeta(e.parameter);
  const action = e.parameter.action || 'list';

  if (checkLocked(meta.ip)) return json({ ok: false, error: 'locked' });

  // verify — called once at login; requires PIN + TOTP
  if (action === 'verify') {
    if (!checkPin(e.parameter.pin)) {
      recordAccess(meta, false);
      return json({ ok: false, error: 'auth' });
    }
    if (!verifyTotp(e.parameter.totp)) {
      // Wrong TOTP: don't count toward IP lockout — it's a separate factor
      return json({ ok: false, error: 'totp_invalid' });
    }
    recordAccess(meta, true);
    return json({ ok: true });
  }

  // list — called after login; PIN only (TOTP verified at login)
  if (action === 'list') {
    if (!checkPin(e.parameter.pin)) {
      recordAccess(meta, false);
      return json({ ok: false, error: 'auth' });
    }
    recordAccess(meta, true);
    return json({ ok: true, data: listRows() });
  }

  return json({ ok: false, error: 'unknown_action' });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); }
  catch (_) { return json({ ok: false, error: 'invalid_json' }); }

  const meta = extractMeta(body);

  if (checkLocked(meta.ip)) return json({ ok: false, error: 'locked' });

  if (!checkPin(body.pin)) {
    recordAccess(meta, false);
    return json({ ok: false, error: 'auth' });
  }

  recordAccess(meta, true);

  if (body.action === 'create') return json(createRow(body));
  if (body.action === 'update') return json(updateRow(body));
  if (body.action === 'delete') return json(deleteRow(body.id));

  return json({ ok: false, error: 'unknown_action' });
}

// -----------------------------------------------------------------------------
// CRUD operations
// -----------------------------------------------------------------------------

function listRows() {
  const sheet  = getSheet();
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function createRow(body) {
  const sheet = getSheet();
  const now   = new Date().toISOString();
  sheet.appendRow([
    Utilities.getUuid(),
    body.name        || '',
    body.description || '',
    body.status      || 'active',
    now,
    now
  ]);
  return { ok: true };
}

function updateRow(body) {
  const sheet  = getSheet();
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] !== body.id) continue;

    const rowNum = i + 1;
    if (body.name        !== undefined) sheet.getRange(rowNum, 2).setValue(body.name);
    if (body.description !== undefined) sheet.getRange(rowNum, 3).setValue(body.description);
    if (body.status      !== undefined) sheet.getRange(rowNum, 4).setValue(body.status);
    sheet.getRange(rowNum, 6).setValue(new Date().toISOString());

    return { ok: true };
  }
  return { ok: false, error: 'not_found' };
}

function deleteRow(id) {
  const sheet  = getSheet();
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] !== id) continue;
    sheet.deleteRow(i + 1);
    return { ok: true };
  }
  return { ok: false, error: 'not_found' };
}

// -----------------------------------------------------------------------------
// TOTP — RFC 6238 (HMAC-SHA1, 30-second window, 6 digits)
// -----------------------------------------------------------------------------

function base32Decode(input) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const s     = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const bytes = [];
  let buf = 0, bits = 0;
  for (let i = 0; i < s.length; i++) {
    buf = (buf << 5) | chars.indexOf(s[i]);
    bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((buf >> bits) & 0xff); }
  }
  return bytes;
}

function generateTotp(keyBytes, counter) {
  const msg = new Array(8).fill(0);
  let   c   = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c = Math.floor(c / 256); }

  const hmac   = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, msg, keyBytes);
  const offset = hmac[19] & 0xf;
  const code   = ((hmac[offset]   & 0x7f) << 24)
               | ((hmac[offset+1] & 0xff) << 16)
               | ((hmac[offset+2] & 0xff) << 8)
               |  (hmac[offset+3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

function verifyTotp(token) {
  const secret = PropertiesService.getScriptProperties().getProperty('TOTP_SECRET');
  if (!secret || !token || String(token).length !== 6) return false;

  const key = base32Decode(secret);
  const T   = Math.floor(Date.now() / 1000 / 30);

  // Allow ±1 window (30 s) for clock skew
  for (let d = -1; d <= 1; d++) {
    if (generateTotp(key, T + d) === String(token)) return true;
  }
  return false;
}

// -----------------------------------------------------------------------------
// Audit — one row per IP, running totals
// -----------------------------------------------------------------------------

function getOrCreateAuditSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(AUDIT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(AUDIT_SHEET_NAME);
    sheet.appendRow(AUDIT_COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function checkLocked(ip) {
  if (!ip || ip === 'unknown') return false;
  const sheet  = getOrCreateAuditSheet();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === ip && values[i][10] === true) return true;
  }
  return false;
}

function recordAccess(meta, success) {
  const ip = meta.ip;
  if (!ip || ip === 'unknown') return;

  const sheet  = getOrCreateAuditSheet();
  const values = sheet.getDataRange().getValues();
  const now    = new Date().toISOString();

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] !== ip) continue;

    const rowNum       = i + 1;
    const totalAttempts = (Number(values[i][6]) || 0) + 1;
    const successCount  = (Number(values[i][7]) || 0) + (success ? 1 : 0);
    const failureCount  = (Number(values[i][8]) || 0) + (success ? 0 : 1);
    const lastFailedAt  = success ? values[i][9] : now;
    const shouldLock    = !success && failureCount >= MAX_FAILURES;
    const isLocked      = values[i][10] === true || shouldLock;
    const lockedAt      = shouldLock ? now : (values[i][11] || '');

    sheet.getRange(rowNum, 4).setValue(meta.ua);
    sheet.getRange(rowNum, 6).setValue(now);
    sheet.getRange(rowNum, 7).setValue(totalAttempts);
    sheet.getRange(rowNum, 8).setValue(successCount);
    sheet.getRange(rowNum, 9).setValue(failureCount);
    sheet.getRange(rowNum, 10).setValue(lastFailedAt);
    sheet.getRange(rowNum, 11).setValue(isLocked);
    sheet.getRange(rowNum, 12).setValue(lockedAt);
    return;
  }

  // New IP — create row
  sheet.appendRow([
    ip, meta.city, meta.country, meta.ua,
    now, now,
    1,
    success ? 1 : 0,
    success ? 0 : 1,
    success ? '' : now,
    !success && 1 >= MAX_FAILURES,
    !success && 1 >= MAX_FAILURES ? now : ''
  ]);
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function extractMeta(source) {
  return {
    ip:      source.ip      || 'unknown',
    city:    source.city    || '',
    country: source.country || '',
    ua:      source.ua      || ''
  };
}

function getSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function checkPin(pin) {
  return pin === PropertiesService.getScriptProperties().getProperty('PIN');
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
