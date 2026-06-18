// =============================================================================
// FULCRUM FORGE — Categories: CRUD + seed + onEdit sheet cascade
// =============================================================================

function listCategories() {
  const sheet = getOrCreateSheet(CATEGORIES_SHEET, CATEGORY_COLUMNS);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    seedCategories();
    return sheetToObjectsWithRow(sheet);
  }
  return sheetToObjectsWithRow(sheet);
}

function seedCategories() {
  const sheet = getOrCreateSheet(CATEGORIES_SHEET, CATEGORY_COLUMNS);
  const existing = sheet.getDataRange().getValues();
  if (existing.length > 1) return; // already seeded
  CATEGORY_SEED.forEach(row => sheet.appendRow(row));
}

function createCategory(body) {
  if (!body.transaction_type || !VALID_TYPES.includes(body.transaction_type))
    return { ok: false, error: 'invalid_transaction_type' };
  if (!String(body.major_category || '').trim()) return { ok: false, error: 'missing_major_category' };
  if (!String(body.minor_category || '').trim()) return { ok: false, error: 'missing_minor_category' };

  const sheet = getOrCreateSheet(CATEGORIES_SHEET, CATEGORY_COLUMNS);
  sheet.appendRow([
    body.transaction_type,
    String(body.major_category).trim(),
    String(body.minor_category).trim(),
    String(body.description || '').trim(),
    normaliseKeywords(body.tag_keywords || ''),
  ]);
  return { ok: true };
}

function updateCategory(body) {
  if (!body.row_num) return { ok: false, error: 'missing_row_num' };
  if (!body.transaction_type || !VALID_TYPES.includes(body.transaction_type))
    return { ok: false, error: 'invalid_transaction_type' };
  if (!String(body.major_category || '').trim()) return { ok: false, error: 'missing_major_category' };
  if (!String(body.minor_category || '').trim()) return { ok: false, error: 'missing_minor_category' };

  const sheet   = getOrCreateSheet(CATEGORIES_SHEET, CATEGORY_COLUMNS);
  const rowNum  = Number(body.row_num);
  const lastRow = sheet.getLastRow();
  if (rowNum < 2 || rowNum > lastRow) return { ok: false, error: 'invalid_row' };

  sheet.getRange(rowNum, 1, 1, 5).setValues([[
    body.transaction_type,
    String(body.major_category).trim(),
    String(body.minor_category).trim(),
    String(body.description || '').trim(),
    normaliseKeywords(body.tag_keywords || ''),
  ]]);
  return { ok: true };
}

function deleteCategory(body) {
  if (!body.row_num) return { ok: false, error: 'missing_row_num' };
  const sheet   = getOrCreateSheet(CATEGORIES_SHEET, CATEGORY_COLUMNS);
  const rowNum  = Number(body.row_num);
  const lastRow = sheet.getLastRow();
  if (rowNum < 2 || rowNum > lastRow) return { ok: false, error: 'invalid_row' };
  sheet.deleteRow(rowNum);
  return { ok: true };
}

function normaliseKeywords(keywords) {
  if (!keywords) return '';
  return String(keywords).split(',').map(k => k.trim().toLowerCase()).filter(Boolean).join(', ');
}

// onEdit cascade — rebuilds category dropdowns in the transactions sheet when
// the user edits transaction_type or major_category directly in the sheet.
function onEdit(e) {
  const sheet = e.source.getActiveSheet();
  if (sheet.getName() !== TRANSACTIONS_SHEET) return;

  const row = e.range.getRow();
  const col = e.range.getColumn();
  if (row <= 1) return; // header row

  const TYPE_COL  = 3; // transaction_type
  const MAJOR_COL = 8; // major_category
  const MINOR_COL = 9; // minor_category

  const catSheet = e.source.getSheetByName(CATEGORIES_SHEET);
  if (!catSheet) return;
  const catData = catSheet.getDataRange().getValues().slice(1);

  if (col === TYPE_COL) {
    const txType = sheet.getRange(row, TYPE_COL).getValue();
    const majors = [...new Set(catData.filter(r => r[0] === txType).map(r => r[1]))];

    sheet.getRange(row, MAJOR_COL).clearContent();
    sheet.getRange(row, MINOR_COL).clearContent();

    if (majors.length > 0) {
      const rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(majors, true).setAllowInvalid(false).build();
      sheet.getRange(row, MAJOR_COL).setDataValidation(rule);
    }
    sheet.getRange(row, MINOR_COL).clearDataValidations();
  }

  if (col === MAJOR_COL) {
    const txType = sheet.getRange(row, TYPE_COL).getValue();
    const major  = sheet.getRange(row, MAJOR_COL).getValue();
    const minors = catData.filter(r => r[0] === txType && r[1] === major).map(r => r[2]);

    sheet.getRange(row, MINOR_COL).clearContent();

    if (minors.length > 0) {
      const rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(minors, true).setAllowInvalid(false).build();
      sheet.getRange(row, MINOR_COL).setDataValidation(rule);
    }
  }
}
