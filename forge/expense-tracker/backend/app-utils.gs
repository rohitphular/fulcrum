// =============================================================================
// FULCRUM FORGE — Utils: shared helpers used across multiple modules
// =============================================================================

function getOrCreateSheet(name, columns) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(columns);
    sheet.setFrozenRows(1);
    return sheet;
  }
  const lastCol = sheet.getLastColumn();
  const headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  let added = 0;
  columns.forEach(col => {
    if (!headers.includes(col)) sheet.getRange(1, lastCol + ++added).setValue(col);
  });
  return sheet;
}

function sheetToObjects(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj;
  });
}

function sheetToObjectsWithRow(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values[0];
  return values.slice(1).map((row, i) => {
    const obj = { _row: i + 2 }; // 1-based sheet row; +1 for header row
    headers.forEach((h, j) => { obj[h] = row[j] ?? ''; });
    return obj;
  });
}

function extractMeta(source) {
  return {
    ip:      source.ip      || 'unknown',
    city:    source.city    || '',
    country: source.country || '',
    ua:      source.ua      || ''
  };
}

function checkPin(pin) {
  return pin === PropertiesService.getScriptProperties().getProperty('PIN_SECRET');
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function normaliseTags(tags) {
  if (!tags) return '';
  return String(tags).split(/[,;]+/).map(t => t.trim()).filter(Boolean).join(';');
}
