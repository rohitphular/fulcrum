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
  if (!body.from_account)
    return { ok: false, error: 'missing_from_account' };
  return null; // no error
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
  if (!body.from_account)
    return { ok: false, error: 'missing_from_account' };
  return null; // no error
}

// Rule 6 — cross-currency FX guard: returns an error object or null
function validateFxRate(fromAccount, toAccount, fxRate) {
  if (!toAccount) return null;
  const accSheet          = getOrCreateSheet(ACCOUNTS_SHEET, getAccountSheetColumns());
  const accValues         = accSheet.getDataRange().getValues();
  const accountIdColIdx   = getAccountSchemaField('id').sheet_column_position - 1;
  const currencyColIdx    = getAccountSchemaField('currency').sheet_column_position - 1;
  const accountCurrencyMap = {};
  for (let i = 1; i < accValues.length; i++) {
    accountCurrencyMap[String(accValues[i][accountIdColIdx])] = String(accValues[i][currencyColIdx]);
  }
  const fromAccountCurrency = accountCurrencyMap[fromAccount];
  const toAccountCurrency   = accountCurrencyMap[toAccount];
  if (fromAccountCurrency && toAccountCurrency && fromAccountCurrency !== toAccountCurrency && fxRate <= 0) {
    return { ok: false, error: `FX rate required for ${fromAccountCurrency} → ${toAccountCurrency} transfer.` };
  }
  return null;
}
