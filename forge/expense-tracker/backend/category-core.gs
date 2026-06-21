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
  // Coerce boolean fields (sheet may store TRUE/FALSE as boolean or string)
  return rows.map(function(r) {
    var toBool = function(v) { return v === true || String(v).toLowerCase() === 'true'; };
    r.is_active                = toBool(r.is_active);
    r.source_account_mandatory = toBool(r.source_account_mandatory);
    r.target_account_mandatory = toBool(r.target_account_mandatory);
    r.sort_order = Number(r.sort_order) || 0;
    return r;
  });
}

// Sets source_account_mandatory / target_account_mandatory on existing category rows
// that were seeded before T-14 (columns added later; cells are empty for old rows).
// Logic: money-in → src=false, tgt=true; money-transfer → src=true, tgt=true;
// money-out standard → src=true, tgt=false; debt-repayment rows are already
// handled because the seed wrote their flags on initial seed.
// Idempotent: skips rows where either flag is already set.
function migrateCategoryMandatoryFlags() {
  var cols  = getCategorySheetColumns();
  var sheet = getOrCreateSheet(CATEGORIES_SHEET, cols);
  var values = sheet.getDataRange().getValues();
  var ciType = catColIndex('transaction_type');
  var ciSrcM = catColIndex('source_account_mandatory');
  var ciTgtM = catColIndex('target_account_mandatory');
  var ciSrcT = catColIndex('source_account_types');
  var ciDstT = catColIndex('target_account_types');

  for (var i = 1; i < values.length; i++) {
    var row  = values[i];
    var type = String(row[ciType]);
    var srcM = row[ciSrcM];
    var tgtM = row[ciTgtM];

    // Skip rows where both flags are already populated (non-empty, non-null)
    var isSet = function(v) { return v !== '' && v !== null && v !== undefined; };
    if (isSet(srcM) && isSet(tgtM)) continue;

    var newSrcM, newTgtM;
    if (type === 'money-in') {
      newSrcM = false; newTgtM = true;
    } else if (type === 'money-transfer') {
      newSrcM = true;  newTgtM = true;
    } else if (type === 'money-out') {
      // money-out with a target type = two-account (loan repayment etc.)
      var dstTypes = String(row[ciDstT] || '').trim();
      newSrcM = true; newTgtM = dstTypes !== '';
    } else {
      continue;
    }
    sheet.getRange(i + 1, ciSrcM + 1).setValue(newSrcM);
    sheet.getRange(i + 1, ciTgtM + 1).setValue(newTgtM);
  }
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
  setCol('source_account_types',      normaliseAccountTypes(body.source_account_types      || ''));
  setCol('target_account_types', normaliseAccountTypes(body.target_account_types || ''));
  setCol('source_account_mandatory',  body.source_account_mandatory === true || body.source_account_mandatory === 'true');
  setCol('target_account_mandatory',  body.target_account_mandatory === true || body.target_account_mandatory === 'true');
  setCol('sort_order',                Number(body.sort_order) || 0);

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
  writeField('source_account_types',      normaliseAccountTypes(body.source_account_types      || ''));
  writeField('target_account_types', normaliseAccountTypes(body.target_account_types || ''));
  writeField('source_account_mandatory',  body.source_account_mandatory === true || body.source_account_mandatory === 'true');
  writeField('target_account_mandatory',  body.target_account_mandatory === true || body.target_account_mandatory === 'true');
  writeField('sort_order',                Number(body.sort_order) || 0);

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
