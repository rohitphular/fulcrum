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
//   audit_access  — created automatically on first request
//
// To unlock a locked IP: delete its row from the audit_access sheet.
// =============================================================================

const SHEET_NAME       = 'starter';
const AUDIT_SHEET_NAME = 'audit_access';
const COLUMNS          = ['id', 'name', 'description', 'status', 'created_at', 'updated_at'];
const AUDIT_COLUMNS    = ['ip', 'city', 'country', 'user_agent', 'first_attempt_at', 'attempts', 'locked_at', 'status'];
const MAX_ATTEMPTS     = 3;

// -----------------------------------------------------------------------------
// Entry points
// -----------------------------------------------------------------------------

function doGet(e) {
  const ip      = e.parameter.ip      || 'unknown';
  const city    = e.parameter.city    || '';
  const country = e.parameter.country || '';
  const ua      = e.parameter.ua      || '';

  if (checkLocked(ip)) return json({ ok: false, error: 'locked' });

  if (!checkPin(e.parameter.pin)) {
    recordFailedAttempt(ip, city, country, ua);
    return json({ ok: false, error: 'auth' });
  }

  const action = e.parameter.action || 'list';
  if (action === 'list') return json({ ok: true, data: listRows() });

  return json({ ok: false, error: 'unknown_action' });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); }
  catch (_) { return json({ ok: false, error: 'invalid_json' }); }

  const ip      = body.ip      || 'unknown';
  const city    = body.city    || '';
  const country = body.country || '';
  const ua      = body.ua      || '';

  if (checkLocked(ip)) return json({ ok: false, error: 'locked' });

  if (!checkPin(body.pin)) {
    recordFailedAttempt(ip, city, country, ua);
    return json({ ok: false, error: 'auth' });
  }

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
// Audit — lockout
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

// AUDIT_COLUMNS indices:
//   0=ip  1=city  2=country  3=user_agent  4=first_attempt_at  5=attempts  6=locked_at  7=status

function checkLocked(ip) {
  if (ip === 'unknown') return false;
  const sheet  = getOrCreateAuditSheet();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === ip && values[i][7] === 'locked') return true;
  }
  return false;
}

function recordFailedAttempt(ip, city, country, ua) {
  if (ip === 'unknown') return;
  const sheet  = getOrCreateAuditSheet();
  const values = sheet.getDataRange().getValues();
  const now    = new Date().toISOString();

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] !== ip) continue;
    if (values[i][7] === 'locked') return;

    const rowNum  = i + 1;
    const attempts = (Number(values[i][5]) || 0) + 1;
    sheet.getRange(rowNum, 6).setValue(attempts);                          // attempts

    if (attempts >= MAX_ATTEMPTS) {
      sheet.getRange(rowNum, 7).setValue(now);                             // locked_at
      sheet.getRange(rowNum, 8).setValue('locked');                        // status
    }
    return;
  }

  // First failure from this IP
  sheet.appendRow([ip, city, country, ua, now, 1, '', 'watching']);
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

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
