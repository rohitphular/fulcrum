// =============================================================================
// FULCRUM FORGE — Account Core: CRUD operations
// =============================================================================

function listAccounts() {
  var cols  = getAccountSheetColumns();
  var sheet = getOrCreateSheet(ACCOUNTS_SHEET, cols);
  return sheetToObjectsWithRow(sheet);
}

function createAccount(body) {
  var validation = validateAccountCreate(body);
  if (!validation.ok) return validation;

  // listRates() auto-seeds default currencies (GBP, INR, USD, EUR, AED) when
  // the rates sheet is empty; reading the sheet directly misses that seeding.
  var ratesData       = listRates();
  var knownCurrencies = {};
  ratesData.forEach(function(r) {
    if (r.currency) knownCurrencies[String(r.currency).trim().toUpperCase()] = true;
  });
  var normCurrency = String(body.currency).trim().toUpperCase();
  if (!knownCurrencies[normCurrency]) {
    return { ok: false, error: 'unknown_currency:' + normCurrency };
  }

  var cols   = getAccountSheetColumns();
  var sheet  = getOrCreateSheet(ACCOUNTS_SHEET, cols);
  var id     = generateAccountId(sheet);
  var now    = new Date().toISOString();
  var type   = String(body.type).trim();
  var isLiabilityAccount = isLiabilityType(type);

  // Liabilities stored as negative; user always inputs positive
  var openingValue = isLiabilityAccount
    ? -(Math.abs(Number(body.opening_value) || 0))
    : (Number(body.opening_value) || 0);

  var row = new Array(cols.length).fill('');

  function setCol(key, value) {
    var field = getAccountSchemaField(key);
    if (field) row[field.sheet_column_position - 1] = (value === undefined || value === null) ? '' : value;
  }

  setCol('id',            id);
  setCol('name',          String(body.name).trim());
  setCol('type',          type);
  setCol('sub_type',      String(body.sub_type || '').trim());
  setCol('currency',      normCurrency);
  setCol('opening_value', openingValue);
  setCol('current_value', openingValue);
  setCol('is_active',     true);
  setCol('notes',         String(body.notes || '').trim());
  setCol('created_at',    now);

  sheet.appendRow(row);
  return { ok: true, id: id };
}

function createAccountsBulk(body) {
  if (!Array.isArray(body.accounts) || body.accounts.length === 0)
    return { ok: false, error: 'missing_accounts' };

  var results = [];
  body.accounts.forEach(function(acct) {
    var acctBody = {};
    Object.keys(acct).forEach(function(k) { acctBody[k] = acct[k]; });
    acctBody.pin = body.pin;
    var r = createAccount(acctBody);
    results.push({ name: acct.name || '', ok: r.ok, error: r.error || null, id: r.id || null });
  });

  var failed = results.filter(function(r) { return !r.ok; });
  return {
    ok:      failed.length === 0,
    created: results.length - failed.length,
    failed:  failed.length,
    results: results,
  };
}

function updateAccount(body) {
  var cols    = getAccountSheetColumns();
  var sheet   = getOrCreateSheet(ACCOUNTS_SHEET, cols);
  var rowNum  = Number(body.row_num);
  var lastRow = sheet.getLastRow();
  if (rowNum < 2 || rowNum > lastRow) return { ok: false, error: 'invalid_row' };

  var typeColPos  = getAccountSchemaField('type').sheet_column_position;
  var currentType = sheet.getRange(rowNum, typeColPos).getValue();

  var validation = validateAccountUpdate(body, currentType);
  if (!validation.ok) return validation;

  function writeField(key, value) {
    var field = getAccountSchemaField(key);
    if (!field || !field.editable) return;
    sheet.getRange(rowNum, field.sheet_column_position).setValue(value);
  }

  writeField('name',     String(body.name).trim());
  writeField('is_active', body.is_active === true || body.is_active === 'true');
  writeField('notes',    String(body.notes || '').trim());

  return { ok: true };
}

function deleteAccount(body) {
  if (!body.row_num) return { ok: false, error: 'missing_row_num' };
  var cols    = getAccountSheetColumns();
  var sheet   = getOrCreateSheet(ACCOUNTS_SHEET, cols);
  var rowNum  = Number(body.row_num);
  var lastRow = sheet.getLastRow();
  if (rowNum < 2 || rowNum > lastRow) return { ok: false, error: 'invalid_row' };

  // T-04 FK check: refuse if any transaction references this account.
  // Archive (is_active = false) is the recommended path for retiring an
  // account while keeping its transaction history intact.
  var idColPos  = getAccountSchemaField('id').sheet_column_position;
  var accountId = String(sheet.getRange(rowNum, idColPos).getValue() || '');
  if (!accountId) return { ok: false, error: 'missing_account_id' };

  var refCount = _countTransactionsReferencingAccount(accountId);
  if (refCount > 0) {
    return {
      ok: false,
      error: 'account_in_use',
      referenced_count: refCount,
      hint: 'archive_instead',
    };
  }

  sheet.deleteRow(rowNum);
  return { ok: true };
}

// Counts transactions where source_account or target_account equals accountId.
function _countTransactionsReferencingAccount(accountId) {
  var txSheet = getOrCreateSheet(TRANSACTIONS_SHEET, TRANSACTION_COLUMNS);
  var values  = txSheet.getDataRange().getValues();
  var srcIdx  = txColIndex('source_account');
  var tgtIdx  = txColIndex('target_account');
  var count   = 0;
  for (var i = 1; i < values.length; i++) {
    var src = String(values[i][srcIdx] || '');
    var tgt = String(values[i][tgtIdx] || '');
    if (src === accountId || tgt === accountId) count++;
  }
  return count;
}

function getAccountById(id) {
  if (!id) return null;
  var cols  = getAccountSheetColumns();
  var sheet = getOrCreateSheet(ACCOUNTS_SHEET, cols);
  var rows  = sheetToObjectsWithRow(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === id) return rows[i];
  }
  return null;
}
