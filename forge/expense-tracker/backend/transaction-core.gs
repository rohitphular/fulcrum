// =============================================================================
// FULCRUM FORGE — Transaction Core: CRUD + balance adjustment
// =============================================================================

function listTransactions() {
  return sheetToObjectsWithRow(getOrCreateSheet(TRANSACTIONS_SHEET, TRANSACTION_COLUMNS));
}

// Renames sheet column headers from_account→source_account and to_account→target_account.
// Idempotent: safe to run repeatedly; skips columns already at the new name.
function migrateTransactionColumnHeaders() {
  const sheet = getOrCreateSheet(TRANSACTIONS_SHEET, TRANSACTION_COLUMNS);
  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (let c = 0; c < headerRow.length; c++) {
    if (headerRow[c] === 'from_account') sheet.getRange(1, c + 1).setValue('source_account');
    if (headerRow[c] === 'to_account')   sheet.getRange(1, c + 1).setValue('target_account');
  }
}

function createTransaction(body) {
  const validation = validateTransactionCreate(body);
  if (!validation.ok) return validation;

  const amount = Number(body.amount);
  const fxRate = body.fx_rate !== undefined && body.fx_rate !== '' ? Number(body.fx_rate) : 0;

  if (body.transaction_type === 'money-transfer') {
    const fxValidation = validateFxRate(body.source_account, body.target_account, fxRate);
    if (!fxValidation.ok) return fxValidation;
  }
  if (body.transaction_type === 'money-out' && body.target_account) {
    const fxValidation = validateFxRate(body.source_account, body.target_account, fxRate);
    if (!fxValidation.ok) return fxValidation;
  }

  const sheet = getOrCreateSheet(TRANSACTIONS_SHEET, TRANSACTION_COLUMNS);
  const id    = generateTransactionId(sheet, body.transaction_date_utc);

  sheet.appendRow([
    id,
    body.transaction_date_utc,
    body.transaction_type,
    amount,
    body.currency          || '',
    body.source_account    || '',
    body.target_account    || '',
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
  // money-in: source is external; credit the target account
  if (type === 'money-in') adjustAccountBalance(body.target_account, amount);
  // money-out: debit the source account
  if (type === 'money-out') adjustAccountBalance(body.source_account, -amount);
  // money-out with target (loan repayment, CC payment, etc.): also credit target with FX
  if (type === 'money-out' && body.target_account) {
    const credited = fxRate > 0 ? amount * fxRate : amount;
    adjustAccountBalance(body.target_account, credited);
  }
  if (type === 'money-transfer') {
    adjustAccountBalance(body.source_account, -amount);
    if (body.target_account) {
      const toAmount = fxRate > 0 ? amount * fxRate : amount;
      adjustAccountBalance(body.target_account, toAmount);
    }
  }

  return { ok: true, id };
}

function updateTransaction(body) {
  const validation = validateTransactionUpdate(body);
  if (!validation.ok) return validation;

  const sheet   = getOrCreateSheet(TRANSACTIONS_SHEET, TRANSACTION_COLUMNS);
  const rowNum  = Number(body.row_num);
  const lastRow = sheet.getLastRow();
  if (rowNum < 2 || rowNum > lastRow) return { ok: false, error: 'invalid_row' };

  const oldRow    = sheet.getRange(rowNum, 1, 1, TRANSACTION_COLUMNS.length).getValues()[0];
  const oldType            = String(oldRow[txColIndex('transaction_type')]);
  const oldAmount          = Number(oldRow[txColIndex('amount')]) || 0;
  const oldSourceAccountId = String(oldRow[txColIndex('source_account')]);
  const oldTargetAccountId = String(oldRow[txColIndex('target_account')]);
  const oldFxRate          = Number(oldRow[txColIndex('fx_rate')]) || 0;

  // Phase 1 — reverse old transaction
  if (oldType === 'money-in') adjustAccountBalance(oldTargetAccountId, -oldAmount);
  if (oldType === 'money-out') adjustAccountBalance(oldSourceAccountId, oldAmount);
  if (oldType === 'money-out' && oldTargetAccountId) {
    const oldCredited = oldFxRate > 0 ? oldAmount * oldFxRate : oldAmount;
    adjustAccountBalance(oldTargetAccountId, -oldCredited);
  }
  if (oldType === 'money-transfer') {
    adjustAccountBalance(oldSourceAccountId, oldAmount);
    if (oldTargetAccountId) adjustAccountBalance(oldTargetAccountId, -(oldFxRate > 0 ? oldAmount * oldFxRate : oldAmount));
  }

  // Phase 2 — apply new transaction
  const newType   = body.transaction_type;
  const newAmount = Number(body.amount);
  const newFxRate = body.fx_rate ? Number(body.fx_rate) : 0;

  if (newType === 'money-transfer') {
    const fxValidation = validateFxRate(body.source_account, body.target_account, newFxRate);
    if (!fxValidation.ok) return fxValidation;
  }
  if (newType === 'money-out' && body.target_account) {
    const fxValidation = validateFxRate(body.source_account, body.target_account, newFxRate);
    if (!fxValidation.ok) return fxValidation;
  }

  if (newType === 'money-in') adjustAccountBalance(body.target_account, newAmount);
  if (newType === 'money-out') adjustAccountBalance(body.source_account, -newAmount);
  if (newType === 'money-out' && body.target_account) {
    const credited = newFxRate > 0 ? newAmount * newFxRate : newAmount;
    adjustAccountBalance(body.target_account, credited);
  }
  if (newType === 'money-transfer') {
    adjustAccountBalance(body.source_account, -newAmount);
    if (body.target_account) {
      adjustAccountBalance(body.target_account, newFxRate > 0 ? newAmount * newFxRate : newAmount);
    }
  }

  // Update cols 2–16 (transaction_date_utc through payment_method); col 1 (id) is immutable
  sheet.getRange(rowNum, 2, 1, 15).setValues([[
    body.transaction_date_utc,
    body.transaction_type,
    newAmount,
    body.currency          || '',
    body.source_account    || '',
    body.target_account    || '',
    body.major_category    || '',
    body.minor_category    || '',
    body.counterparty      || '',
    body.notes             || '',
    normaliseTags(body.tags),
    '',
    newFxRate > 0 ? newFxRate : '',
    body.country           || '',
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
  const txType          = String(row[txColIndex('transaction_type')]);
  const txAmount        = Number(row[txColIndex('amount')]) || 0;
  const sourceAccountId = String(row[txColIndex('source_account')]);
  const targetAccountId = String(row[txColIndex('target_account')]);
  const fxRate          = Number(row[txColIndex('fx_rate')]) || 0;

  if (txType === 'money-in') adjustAccountBalance(targetAccountId, -txAmount);
  if (txType === 'money-out') adjustAccountBalance(sourceAccountId, txAmount);
  if (txType === 'money-out' && targetAccountId) {
    const credited = fxRate > 0 ? txAmount * fxRate : txAmount;
    adjustAccountBalance(targetAccountId, -credited);
  }
  if (txType === 'money-transfer') {
    adjustAccountBalance(sourceAccountId, txAmount);
    if (targetAccountId) adjustAccountBalance(targetAccountId, -(fxRate > 0 ? txAmount * fxRate : txAmount));
  }

  sheet.deleteRow(rowNum);
  return { ok: true };
}
