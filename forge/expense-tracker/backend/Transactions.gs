// =============================================================================
// FULCRUM FORGE — Transactions: CRUD + balance adjustment
// =============================================================================

function listTransactions() {
  return sheetToObjectsWithRow(getOrCreateSheet(TRANSACTIONS_SHEET, TRANSACTION_COLUMNS));
}

function createTransaction(body) {
  if (!body.transaction_date_utc) return { ok: false, error: 'missing_date' };
  if (!body.transaction_type || !VALID_TYPES.includes(body.transaction_type))
    return { ok: false, error: 'invalid_transaction_type' };
  if (!body.amount || Number(body.amount) <= 0)
    return { ok: false, error: 'invalid_amount' };
  if (!body.from_account) return { ok: false, error: 'missing_from_account' };

  const sheet  = getOrCreateSheet(TRANSACTIONS_SHEET, TRANSACTION_COLUMNS);
  const id     = generateTransactionId(sheet, body.transaction_date_utc);
  const amount = Number(body.amount);
  const fxRate = body.fx_rate !== undefined && body.fx_rate !== '' ? Number(body.fx_rate) : 0;

  // Rule 6 — backend cross-currency guard (before any row is written)
  if (body.to_account) {
    const accSheet  = getOrCreateSheet(ACCOUNTS_SHEET, ACCOUNT_COLUMNS);
    const accValues = accSheet.getDataRange().getValues();
    const ccy = {};
    for (let i = 1; i < accValues.length; i++) ccy[String(accValues[i][0])] = String(accValues[i][2]);
    const fromCcy = ccy[body.from_account];
    const toCcy   = ccy[body.to_account];
    if (fromCcy && toCcy && fromCcy !== toCcy && fxRate <= 0) {
      return { ok: false, error: `FX rate required for ${fromCcy} → ${toCcy} transfer.` };
    }
  }

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
    '',                                      // transfer_id — not used
    fxRate > 0 ? fxRate : '',
    body.country           || '',
    ''                                       // payment_method — not used
  ]);

  const type = body.transaction_type;
  if (type === 'money-in')  adjustAccountBalance(body.from_account,  amount);
  if (type === 'money-out') adjustAccountBalance(body.from_account, -amount);
  if (type === 'money-transfer' && body.from_account) {
    adjustAccountBalance(body.from_account, -amount);
    if (body.to_account) {
      const toAmount = fxRate > 0 ? amount * fxRate : amount; // safe: cross-currency already guarded above
      adjustAccountBalance(body.to_account, toAmount);
    }
  }

  return { ok: true, id };
}

function adjustAccountBalance(accountId, delta) {
  const sheet  = getOrCreateSheet(ACCOUNTS_SHEET, ACCOUNT_COLUMNS);
  const values = sheet.getDataRange().getValues();
  // col 1 = id (index 0), col 6 = current_balance (index 5)
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) !== accountId) continue;
    const current = Number(values[i][5]) || 0;
    sheet.getRange(i + 1, 6).setValue(current + delta);
    return;
  }
}

function updateTransaction(body) {
  if (!body.row_num)                return { ok: false, error: 'missing_row_num' };
  if (!body.transaction_date_utc)   return { ok: false, error: 'missing_date' };
  if (!body.transaction_type || !VALID_TYPES.includes(body.transaction_type))
    return { ok: false, error: 'invalid_transaction_type' };
  if (!body.amount || Number(body.amount) <= 0)
    return { ok: false, error: 'invalid_amount' };
  if (!body.from_account) return { ok: false, error: 'missing_from_account' };

  const sheet   = getOrCreateSheet(TRANSACTIONS_SHEET, TRANSACTION_COLUMNS);
  const rowNum  = Number(body.row_num);
  const lastRow = sheet.getLastRow();
  if (rowNum < 2 || rowNum > lastRow) return { ok: false, error: 'invalid_row' };

  // 0=id 1=date 2=transaction_type 3=amount 4=currency 5=from_account 6=to_account … 13=fx_rate
  const oldRow     = sheet.getRange(rowNum, 1, 1, TRANSACTION_COLUMNS.length).getValues()[0];
  const oldType    = String(oldRow[2]);
  const oldAmount  = Number(oldRow[3]) || 0;
  const oldFromAcc = String(oldRow[5]);
  const oldToAcc   = String(oldRow[6]);
  const oldFxRate  = Number(oldRow[13]) || 0;

  // Phase 1 — reverse old transaction
  if (oldType === 'money-in')  adjustAccountBalance(oldFromAcc, -oldAmount);
  if (oldType === 'money-out') adjustAccountBalance(oldFromAcc,  oldAmount);
  if (oldType === 'money-transfer') {
    adjustAccountBalance(oldFromAcc, oldAmount);
    if (oldToAcc) adjustAccountBalance(oldToAcc, -(oldFxRate > 0 ? oldAmount * oldFxRate : oldAmount));
  }

  // Phase 2 — apply new transaction
  const newType   = body.transaction_type;
  const newAmount = Number(body.amount);
  const newFxRate = body.fx_rate ? Number(body.fx_rate) : 0;
  if (newType === 'money-in')  adjustAccountBalance(body.from_account,  newAmount);
  if (newType === 'money-out') adjustAccountBalance(body.from_account, -newAmount);
  if (newType === 'money-transfer') {
    adjustAccountBalance(body.from_account, -newAmount);
    if (body.to_account) {
      // Rule 6 — backend cross-currency guard for Phase 2 credit (before row is written)
      const accSheet  = getOrCreateSheet(ACCOUNTS_SHEET, ACCOUNT_COLUMNS);
      const accValues = accSheet.getDataRange().getValues();
      const ccy = {};
      for (let i = 1; i < accValues.length; i++) ccy[String(accValues[i][0])] = String(accValues[i][2]);
      const fromCcy = ccy[body.from_account];
      const toCcy   = ccy[body.to_account];
      if (fromCcy && toCcy && fromCcy !== toCcy && newFxRate <= 0) {
        return { ok: false, error: `FX rate required for ${fromCcy} → ${toCcy} transfer.` };
      }
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

  // 0=id … 2=transaction_type 3=amount 5=from_account 6=to_account 13=fx_rate
  const row    = sheet.getRange(rowNum, 1, 1, TRANSACTION_COLUMNS.length).getValues()[0];
  const type   = String(row[2]);
  const amount = Number(row[3]) || 0;
  const fromAcc = String(row[5]);
  const toAcc   = String(row[6]);
  const fxRate  = Number(row[13]) || 0;

  if (type === 'money-in')  adjustAccountBalance(fromAcc, -amount);
  if (type === 'money-out') adjustAccountBalance(fromAcc,  amount);
  if (type === 'money-transfer') {
    adjustAccountBalance(fromAcc, amount);
    if (toAcc) adjustAccountBalance(toAcc, -(fxRate > 0 ? amount * fxRate : amount));
  }

  sheet.deleteRow(rowNum);
  return { ok: true };
}

function generateTransactionId(sheet, date) {
  const dateStr = String(date).slice(0, 10);
  const values  = sheet.getDataRange().getValues();
  let max = 0;

  for (let i = 1; i < values.length; i++) {
    const rowId = String(values[i][0]);
    if (rowId.startsWith(dateStr + '-')) {
      const n = parseInt(rowId.slice(dateStr.length + 1), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }

  return dateStr + '-' + String(max + 1).padStart(3, '0');
}
