// =============================================================================
// FULCRUM FORGE — Category Core: CRUD + seed + onEdit sheet cascade
// =============================================================================

function listCategories() {
  var cols  = getCategorySheetColumns();
  var sheet = getOrCreateSheet(CATEGORIES_SHEET, cols);
  var rows  = sheetToObjectsWithRow(sheet);
  if (rows.length === 0) {
    seedCategories();
    rows = sheetToObjectsWithRow(sheet);
  }
  // Coerce is_active to boolean (sheet may store TRUE/FALSE as boolean or string)
  return rows.map(function(r) {
    r.is_active = r.is_active === true || String(r.is_active).toLowerCase() === 'true';
    r.sort_order = Number(r.sort_order) || 0;
    return r;
  });
}

function seedCategories() {
  var cols  = getCategorySheetColumns();
  var sheet = getOrCreateSheet(CATEGORIES_SHEET, cols);
  var existing = sheet.getDataRange().getValues();
  if (existing.length > 1) return;
  CATEGORY_SEED.forEach(function(row) { sheet.appendRow(row); });
}

function createCategory(body) {
  var validation = validateCategoryCreate(body);
  if (!validation.ok) return validation;

  var cols  = getCategorySheetColumns();
  var sheet = getOrCreateSheet(CATEGORIES_SHEET, cols);
  var row   = new Array(cols.length).fill('');

  function setCol(key, value) {
    var field = getCategorySchemaField(key);
    if (field) row[field.sheet_column_position - 1] = (value === undefined || value === null) ? '' : value;
  }

  setCol('transaction_type',        String(body.transaction_type).trim());
  setCol('major_category',          String(body.major_category).trim());
  setCol('minor_category',          String(body.minor_category).trim());
  setCol('description',             String(body.description             || '').trim());
  setCol('is_active',               body.is_active !== false);
  setCol('tag_keywords',            normaliseKeywords(body.tag_keywords || ''));
  setCol('counterparty_examples',   normaliseCandidates(body.counterparty_examples   || ''));
  setCol('source_account_types',    normaliseAccountTypes(body.source_account_types    || ''));
  setCol('destination_account_types', normaliseAccountTypes(body.destination_account_types || ''));
  setCol('sort_order',              Number(body.sort_order) || 0);

  sheet.appendRow(row);
  return { ok: true };
}

function updateCategory(body) {
  var validation = validateCategoryUpdate(body);
  if (!validation.ok) return validation;

  var cols    = getCategorySheetColumns();
  var sheet   = getOrCreateSheet(CATEGORIES_SHEET, cols);
  var rowNum  = Number(body.row_num);
  var lastRow = sheet.getLastRow();
  if (rowNum < 2 || rowNum > lastRow) return { ok: false, error: 'invalid_row' };

  function writeField(key, value) {
    var field = getCategorySchemaField(key);
    if (!field || !field.editable) return;
    sheet.getRange(rowNum, field.sheet_column_position).setValue(value);
  }

  writeField('transaction_type',        String(body.transaction_type).trim());
  writeField('major_category',          String(body.major_category).trim());
  writeField('minor_category',          String(body.minor_category).trim());
  writeField('description',             String(body.description             || '').trim());
  writeField('is_active',               body.is_active !== false);
  writeField('tag_keywords',            normaliseKeywords(body.tag_keywords || ''));
  writeField('counterparty_examples',   normaliseCandidates(body.counterparty_examples   || ''));
  writeField('source_account_types',    normaliseAccountTypes(body.source_account_types    || ''));
  writeField('destination_account_types', normaliseAccountTypes(body.destination_account_types || ''));
  writeField('sort_order',              Number(body.sort_order) || 0);

  return { ok: true };
}

function deleteCategory(body) {
  if (!body.row_num) return { ok: false, error: 'missing_row_num' };
  var cols    = getCategorySheetColumns();
  var sheet   = getOrCreateSheet(CATEGORIES_SHEET, cols);
  var rowNum  = Number(body.row_num);
  var lastRow = sheet.getLastRow();
  if (rowNum < 2 || rowNum > lastRow) return { ok: false, error: 'invalid_row' };
  sheet.deleteRow(rowNum);
  return { ok: true };
}

// onEdit cascade — rebuilds category dropdowns in the transactions sheet when
// the user edits transaction_type or major_category directly in the sheet.
function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  if (sheet.getName() !== TRANSACTIONS_SHEET) return;

  var row = e.range.getRow();
  var col = e.range.getColumn();
  if (row <= 1) return;

  var TYPE_COL  = 3; // transaction_type
  var MAJOR_COL = 8; // major_category
  var MINOR_COL = 9; // minor_category

  var catSheet = e.source.getSheetByName(CATEGORIES_SHEET);
  if (!catSheet) return;
  var catData = catSheet.getDataRange().getValues().slice(1);

  if (col === TYPE_COL) {
    var txType = sheet.getRange(row, TYPE_COL).getValue();
    var majors = [];
    var seen   = {};
    catData.filter(function(r) { return r[0] === txType; }).forEach(function(r) {
      if (!seen[r[1]]) { majors.push(r[1]); seen[r[1]] = true; }
    });

    sheet.getRange(row, MAJOR_COL).clearContent();
    sheet.getRange(row, MINOR_COL).clearContent();

    if (majors.length > 0) {
      var rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(majors, true).setAllowInvalid(false).build();
      sheet.getRange(row, MAJOR_COL).setDataValidation(rule);
    }
    sheet.getRange(row, MINOR_COL).clearDataValidations();
  }

  if (col === MAJOR_COL) {
    var txType2 = sheet.getRange(row, TYPE_COL).getValue();
    var major   = sheet.getRange(row, MAJOR_COL).getValue();
    var minors  = catData
      .filter(function(r) { return r[0] === txType2 && r[1] === major; })
      .map(function(r) { return r[2]; });

    sheet.getRange(row, MINOR_COL).clearContent();

    if (minors.length > 0) {
      var rule2 = SpreadsheetApp.newDataValidation()
        .requireValueInList(minors, true).setAllowInvalid(false).build();
      sheet.getRange(row, MINOR_COL).setDataValidation(rule2);
    }
  }
}
