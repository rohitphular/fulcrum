// =============================================================================
// FULCRUM FORGE — Transaction Validation: input guards for create and update
// Shared across all transaction .gs files via GAS global scope.
// =============================================================================

function validateTransactionCreate(body) {
  if (!body.transaction_date_utc)
    return { ok: false, error: 'missing_date' };
  if (!body.transaction_type || !VALID_TRANSACTION_TYPES.includes(body.transaction_type))
    return { ok: false, error: 'invalid_transaction_type' };
  if (!body.amount || Number(body.amount) <= 0)
    return { ok: false, error: 'invalid_amount' };
  // money-in: source is external — source_account is not sent by the UI
  if (body.transaction_type !== 'money-in' && !body.source_account)
    return { ok: false, error: 'missing_source_account' };

  const acctTypeErr = _validateCategoryAccountTypeHints(body);
  if (acctTypeErr) return acctTypeErr;

  return { ok: true };
}

function validateTransactionUpdate(body) {
  if (!body.row_num)
    return { ok: false, error: 'missing_row_num' };
  if (!body.transaction_date_utc)
    return { ok: false, error: 'missing_date' };
  if (!body.transaction_type || !VALID_TRANSACTION_TYPES.includes(body.transaction_type))
    return { ok: false, error: 'invalid_transaction_type' };
  if (!body.amount || Number(body.amount) <= 0)
    return { ok: false, error: 'invalid_amount' };
  if (body.transaction_type !== 'money-in' && !body.source_account)
    return { ok: false, error: 'missing_source_account' };

  const acctTypeErr = _validateCategoryAccountTypeHints(body);
  if (acctTypeErr) return acctTypeErr;

  return { ok: true };
}

// ── Account-type hint validation ──────────────────────────────────────────────

function _validateCategoryAccountTypeHints(body) {
  const cat = _findCategoryHints(body.transaction_type, body.major_category, body.minor_category);
  if (!cat) return null;

  if (cat.source_account_mandatory) {
    if (!body.source_account)
      return { ok: false, error: 'missing_source_account' };
    if (cat.source_account_types) {
      const err = _checkAccountTypeHint(body.source_account, cat.source_account_types, 'source');
      if (err) return err;
    }
  }

  if (cat.target_account_mandatory) {
    if (!body.target_account)
      return { ok: false, error: 'missing_target_account' };
    if (cat.destination_account_types) {
      const err = _checkAccountTypeHint(body.target_account, cat.destination_account_types, 'target');
      if (err) return err;
    }
  }

  return null;
}

function _findCategoryHints(type, major, minor) {
  if (!type || !major || !minor) return null;
  const sheet  = getOrCreateSheet(CATEGORIES_SHEET, getCategorySheetColumns());
  const values = sheet.getDataRange().getValues();
  const ci = {
    type:         catColIndex('transaction_type'),
    major:        catColIndex('major_category'),
    minor:        catColIndex('minor_category'),
    src:          catColIndex('source_account_types'),
    dst:          catColIndex('destination_account_types'),
    srcMandatory: catColIndex('source_account_mandatory'),
    dstMandatory: catColIndex('target_account_mandatory'),
  };
  for (let i = 1; i < values.length; i++) {
    if (values[i][ci.type] === type && values[i][ci.major] === major && values[i][ci.minor] === minor) {
      var toBool = function(v) { return v === true || String(v).toLowerCase() === 'true'; };
      return {
        source_account_types:      String(values[i][ci.src]          || '').trim(),
        destination_account_types: String(values[i][ci.dst]          || '').trim(),
        source_account_mandatory:  toBool(values[i][ci.srcMandatory]),
        target_account_mandatory:  toBool(values[i][ci.dstMandatory]),
      };
    }
  }
  return null;
}

function _checkAccountTypeHint(accountId, allowedTypesStr, label) {
  if (!accountId || !allowedTypesStr) return null;
  const allowed = splitToList(allowedTypesStr).map(function(s) { return s.toLowerCase(); });
  if (!allowed.length) return null;

  const sheet  = getOrCreateSheet(ACCOUNTS_SHEET, getAccountSheetColumns());
  const values = sheet.getDataRange().getValues();
  const ciId   = acctColIndex('id');
  const ciType = acctColIndex('type');

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][ciId]) !== String(accountId)) continue;
    const actualType = String(values[i][ciType] || '').trim().toLowerCase();
    if (!allowed.includes(actualType)) {
      return {
        ok: false,
        error: label + '_account_type_mismatch',
        detail: 'Expected one of [' + allowed.join(', ') + '] but got ' + (actualType || 'unknown'),
      };
    }
    return null;
  }
  return null;
}

function validateFxRate(sourceAccount, targetAccount, fxRate) {
  if (!targetAccount) return { ok: true };
  const accSheet          = getOrCreateSheet(ACCOUNTS_SHEET, getAccountSheetColumns());
  const accValues         = accSheet.getDataRange().getValues();
  const accountIdColIdx   = acctColIndex('id');
  const currencyColIdx    = acctColIndex('currency');
  const accountCurrencyMap = {};
  for (let i = 1; i < accValues.length; i++) {
    accountCurrencyMap[String(accValues[i][accountIdColIdx])] = String(accValues[i][currencyColIdx]);
  }
  const fromCcy = accountCurrencyMap[sourceAccount];
  const toCcy   = accountCurrencyMap[targetAccount];
  if (fromCcy && toCcy && fromCcy !== toCcy && fxRate <= 0) {
    return { ok: false, error: `FX rate required for ${fromCcy} → ${toCcy} transaction.` };
  }
  return { ok: true };
}
