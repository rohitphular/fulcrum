// =============================================================================
// FULCRUM FORGE — Transaction Core: CRUD + balance adjustment
// Depends on: transaction-schema.gs, transaction-validation.gs, transaction-utils.gs
// =============================================================================

function listTransactions() {
  return sheetToObjectsWithRow(getOrCreateSheet(TRANSACTIONS_SHEET, TRANSACTION_COLUMNS));
}

function createTransaction(body) {
  const validationError = validateTransactionCreate(body);
  if (validationError) return validationError;

  const amount = Number(body.amount);
  const fxRate = body.fx_rate !== undefined && body.fx_rate !== '' ? Number(body.fx_rate) : 0;

  if (body.transaction_type === 'money-transfer') {
    const fxValidationError = validateFxRate(body.from_account, body.to_account, fxRate);
    if (fxValidationError) return fxValidationError;
  }

  const sheet = getOrCreateSheet(TRANSACTIONS_SHEET, TRANSACTION_COLUMNS);
  const id    = generateTransactionId(sheet, body.transaction_date_utc);

  sheet.appendRow([
    id,
    body.transaction_date_utc,
    body.transaction_type,
    amount,
    body.currency          || '',
    body.from_account,
    body.to_account        || '',
    body.major_category    || '',
    body.minor_category    || '',
    body.counterparty      || '',
    body.notes             || '',
    normaliseTags(body.tags),
    '',                               // transfer_id — not used
    fxRate > 0 ? fxRate : '',
    body.country           || '',
    ''                                // payment_method — not used
  ]);

  const type = body.transaction_type;
  if (type === 'money-in')  adjustAccountBalance(body.from_account,  amount);
  if (type === 'money-out') adjustAccountBalance(body.from_account, -amount);
  if (type === 'money-transfer') {
    adjustAccountBalance(body.from_account, -amount);
    if (body.to_account) {
      const toAmount = fxRate > 0 ? amount * fxRate : amount;
      adjustAccountBalance(body.to_account, toAmount);
    }
  }

  return { ok: true, id };
}

function updateTransaction(body) {
  const validationError = validateTransactionUpdate(body);
  if (validationError) return validationError;

  const sheet   = getOrCreateSheet(TRANSACTIONS_SHEET, TRANSACTION_COLUMNS);
  const rowNum  = Number(body.row_num);
  const lastRow = sheet.getLastRow();
  if (rowNum < 2 || rowNum > lastRow) return { ok: false, error: 'invalid_row' };

  // 0=id 1=date 2=transaction_type 3=amount 4=currency 5=from_account 6=to_account … 13=fx_rate
  const oldRow    = sheet.getRange(rowNum, 1, 1, TRANSACTION_COLUMNS.length).getValues()[0];
  const oldType          = String(oldRow[txColIndex('transaction_type')]);
  const oldAmount        = Number(oldRow[txColIndex('amount')]) || 0;
  const oldFromAccountId = String(oldRow[txColIndex('from_account')]);
  const oldToAccountId   = String(oldRow[txColIndex('to_account')]);
  const oldFxRate        = Number(oldRow[txColIndex('fx_rate')]) || 0;

  // Phase 1 — reverse old transaction
  if (oldType === 'money-in')  adjustAccountBalance(oldFromAccountId, -oldAmount);
  if (oldType === 'money-out') adjustAccountBalance(oldFromAccountId,  oldAmount);
  if (oldType === 'money-transfer') {
    adjustAccountBalance(oldFromAccountId, oldAmount);
    if (oldToAccountId) adjustAccountBalance(oldToAccountId, -(oldFxRate > 0 ? oldAmount * oldFxRate : oldAmount));
  }

  // Phase 2 — apply new transaction
  const newType   = body.transaction_type;
  const newAmount = Number(body.amount);
  const newFxRate = body.fx_rate ? Number(body.fx_rate) : 0;

  if (newType === 'money-transfer') {
    const fxValidationError = validateFxRate(body.from_account, body.to_account, newFxRate);
    if (fxValidationError) return fxValidationError;
  }

  if (newType === 'money-in')  adjustAccountBalance(body.from_account,  newAmount);
  if (newType === 'money-out') adjustAccountBalance(body.from_account, -newAmount);
  if (newType === 'money-transfer') {
    adjustAccountBalance(body.from_account, -newAmount);
    if (body.to_account) {
      adjustAccountBalance(body.to_account, newFxRate > 0 ? newAmount * newFxRate : newAmount);
    }
  }

  // Update cols 2–16 (transaction_date_utc through payment_method); col 1 (id) is immutable
  sheet.getRange(rowNum, 2, 1, 15).setValues([[
    body.transaction_date_utc,
    body.transaction_type,
    newAmount,
    body.currency         || '',
    body.from_account,
    body.to_account       || '',
    body.major_category   || '',
    body.minor_category   || '',
    body.counterparty     || '',
    body.notes            || '',
    normaliseTags(body.tags),
    '',
    newFxRate > 0 ? newFxRate : '',
    body.country          || '',
    '',
  ]]);

  return { ok: true };
}

function deleteTransaction(body) {
  if (!body.row_num) return { ok: false, error: 'missing_row_num' };

  const sheet   = getOrCreateSheet(TRANSACTIONS_SHEET, TRANSACTION_COLUMNS);
  const rowNum  = Number(body.row_num);
  const lastRow = sheet.getLastRow();
  if (rowNum < 2 || rowNum > lastRow) return { ok: false, error: 'invalid_row' };

  const row    = sheet.getRange(rowNum, 1, 1, TRANSACTION_COLUMNS.length).getValues()[0];
  const txType       = String(row[txColIndex('transaction_type')]);
  const txAmount     = Number(row[txColIndex('amount')]) || 0;
  const fromAccountId = String(row[txColIndex('from_account')]);
  const toAccountId   = String(row[txColIndex('to_account')]);
  const fxRate        = Number(row[txColIndex('fx_rate')]) || 0;

  if (txType === 'money-in')  adjustAccountBalance(fromAccountId, -txAmount);
  if (txType === 'money-out') adjustAccountBalance(fromAccountId,  txAmount);
  if (txType === 'money-transfer') {
    adjustAccountBalance(fromAccountId, txAmount);
    if (toAccountId) adjustAccountBalance(toAccountId, -(fxRate > 0 ? txAmount * fxRate : txAmount));
  }

  sheet.deleteRow(rowNum);
  return { ok: true };
}
