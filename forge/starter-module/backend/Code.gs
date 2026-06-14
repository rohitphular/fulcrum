// =============================================================================
// FULCRUM FORGE — Apps Script backend
// Deploy as: Execute as Me · Anyone can access
//
// Before deploying, set the PIN:
//   Extensions → Apps Script → Project Settings → Script Properties
//   Add property: PIN = <your-chosen-pin>
//
// Sheet tab name must match SHEET_NAME below.
// Column order must match COLUMNS below.
// =============================================================================

const SHEET_NAME = 'starter';
const COLUMNS    = ['id', 'name', 'description', 'status', 'created_at', 'updated_at'];

// -----------------------------------------------------------------------------
// Entry points
// -----------------------------------------------------------------------------

function doGet(e) {
  if (!checkPin(e.parameter.pin)) return json({ ok: false, error: 'auth' });

  const action = e.parameter.action || 'list';
  if (action === 'list') return json({ ok: true, data: listRows() });

  return json({ ok: false, error: 'unknown_action' });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); }
  catch (_) { return json({ ok: false, error: 'invalid_json' }); }

  if (!checkPin(body.pin)) return json({ ok: false, error: 'auth' });

  if (body.action === 'create') return json(createRow(body));
  if (body.action === 'update') return json(updateRow(body));
  if (body.action === 'delete') return json(deleteRow(body.id));

  return json({ ok: false, error: 'unknown_action' });
}

// -----------------------------------------------------------------------------
// CRUD operations
// -----------------------------------------------------------------------------

function listRows() {
  const sheet = getSheet();
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
    Utilities.getUuid(),  // id
    body.name        || '',
    body.description || '',
    body.status      || 'active',
    now,  // created_at
    now   // updated_at
  ]);
  return { ok: true };
}

function updateRow(body) {
  const sheet  = getSheet();
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] !== body.id) continue;

    const rowNum = i + 1; // Sheets rows are 1-indexed; row 1 is headers
    if (body.name        !== undefined) sheet.getRange(rowNum, 2).setValue(body.name);
    if (body.description !== undefined) sheet.getRange(rowNum, 3).setValue(body.description);
    if (body.status      !== undefined) sheet.getRange(rowNum, 4).setValue(body.status);
    sheet.getRange(rowNum, 6).setValue(new Date().toISOString()); // updated_at

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
