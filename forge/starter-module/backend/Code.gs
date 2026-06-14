// =============================================================================
// FULCRUM FORGE — Apps Script backend
// Deploy as: Execute as Me · Anyone can access
//
// Before deploying, set the PIN:
//   Extensions → Apps Script → Project Settings → Script Properties
//   Add property: PIN = <your-chosen-pin>
//
// Sheet tabs required:
//   starter       — data (columns defined in COLUMNS below)
//   audit_access  — created automatically on first request; one row per IP
//
// To unlock a locked IP: open audit_access, set is_locked to FALSE for that row
// (or delete the row entirely to reset all counts).
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
  const meta = extractMeta(e.parameter);

  if (checkLocked(meta.ip)) return json({ ok: false, error: 'locked' });

  if (!checkPin(e.parameter.pin)) {
    recordAccess(meta, false);
    return json({ ok: false, error: 'auth' });
  }

  recordAccess(meta, true);

  const action = e.parameter.action || 'list';
  if (action === 'list') return json({ ok: true, data: listRows() });

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
    const totalAttempts = (Number(values[i][6])  || 0) + 1;
    const successCount  = (Number(values[i][7])  || 0) + (success ? 1 : 0);
    const failureCount  = (Number(values[i][8])  || 0) + (success ? 0 : 1);
    const lastFailedAt  = success ? values[i][9] : now;
    const shouldLock    = !success && failureCount >= MAX_FAILURES;
    const isLocked      = values[i][10] === true || shouldLock;
    const lockedAt      = shouldLock ? now : (values[i][11] || '');

    sheet.getRange(rowNum, 4).setValue(meta.ua);               // user_agent (update — device may change)
    sheet.getRange(rowNum, 6).setValue(now);                   // last_seen
    sheet.getRange(rowNum, 7).setValue(totalAttempts);         // total_attempts
    sheet.getRange(rowNum, 8).setValue(successCount);          // success_count
    sheet.getRange(rowNum, 9).setValue(failureCount);          // failure_count
    sheet.getRange(rowNum, 10).setValue(lastFailedAt);         // last_failed_at
    sheet.getRange(rowNum, 11).setValue(isLocked);             // is_locked
    sheet.getRange(rowNum, 12).setValue(lockedAt);             // locked_at
    return;
  }

  // New IP — create row
  sheet.appendRow([
    ip,                    // ip
    meta.city,             // city
    meta.country,          // country
    meta.ua,               // user_agent
    now,                   // first_seen
    now,                   // last_seen
    1,                     // total_attempts
    success ? 1 : 0,       // success_count
    success ? 0 : 1,       // failure_count
    success ? '' : now,    // last_failed_at
    !success && 1 >= MAX_FAILURES,  // is_locked
    !success && 1 >= MAX_FAILURES ? now : ''  // locked_at
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
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

function checkPin(pin) {
  return pin === PropertiesService.getScriptProperties().getProperty('PIN');
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
