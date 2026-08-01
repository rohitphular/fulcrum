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

  // Resolve workflow before any sheet mutation — fail fast if category not found
  const hints  = _findCategoryHints(body.transaction_type, body.major_category, body.minor_category);
  const wfType = resolveWorkflow(hints ? hints.workflow_type : null);
  if (typeof wfType !== 'string') return wfType;

  const sheet = getOrCreateSheet(TRANSACTIONS_SHEET, TRANSACTION_COLUMNS);

  // Duplicate guard — reject if an identical row already exists
  const dupCheck = _checkDuplicate(sheet, body);
  if (dupCheck) return dupCheck;
  const id    = generateTransactionId(sheet, body.transaction_date_utc);

  // Augment notes with the conversion rate used (no-op when not cross-currency).
  const finalNotes = applyFxNote(body.notes, body.source_account, body.target_account, amount, fxRate);

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
    finalNotes,
    normaliseTags(body.tags),
    '',                               // transfer_id — not used
    fxRate > 0 ? fxRate : '',
    body.country           || '',
    ''                                // payment_method — not used
  ]);

  const wfResult = executeWorkflow(wfType, {
    source_account: body.source_account || '',
    target_account: body.target_account || '',
    amount:         amount,
    to_amount:      fxRate > 0 ? amount * fxRate : amount,
    fx_rate:        fxRate,
  });
  if (!wfResult.ok) return wfResult;

  return { ok: true, id };
}

function updateTransaction(body) {
  // Row-range guard runs first so we can hand the old row to the validator,
  // which uses it to compute the post-reversal balance for Rules 1–5.
  if (!body.row_num) return { ok: false, error: 'missing_row_num' };
  const sheet   = getOrCreateSheet(TRANSACTIONS_SHEET, TRANSACTION_COLUMNS);
  const rowNum  = Number(body.row_num);
  const lastRow = sheet.getLastRow();
  if (rowNum < 2 || rowNum > lastRow) return { ok: false, error: 'invalid_row' };

  const oldRow = sheet.getRange(rowNum, 1, 1, TRANSACTION_COLUMNS.length).getValues()[0];

  const validation = validateTransactionUpdate(body, oldRow);
  if (!validation.ok) return validation;

  // T-02: ALL validation must run BEFORE Phase 1 reversal. A validation failure
  // between Phase 1 and Phase 2 would leave the sheet in an orphaned state
  // (old row reversed, new row never applied). Rules 1–5 are inside
  // validateTransactionUpdate; Rule 6 (FX) is the two checks below.
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

  // All validation passed — resolve both workflows before any balance mutation
  const oldType            = String(oldRow[txColIndex('transaction_type')]);
  const oldMajor           = String(oldRow[txColIndex('major_category')] || '');
  const oldMinor           = String(oldRow[txColIndex('minor_category')] || '');
  const oldAmount          = Number(oldRow[txColIndex('amount')]) || 0;
  const oldSourceAccountId = String(oldRow[txColIndex('source_account')]);
  const oldTargetAccountId = String(oldRow[txColIndex('target_account')]);
  const oldFxRate          = Number(oldRow[txColIndex('fx_rate')]) || 0;

  const oldHints  = _findCategoryHints(oldType, oldMajor, oldMinor);
  const oldWfType = resolveWorkflow(oldHints ? oldHints.workflow_type : null);
  if (typeof oldWfType !== 'string') return oldWfType;

  const newHints  = _findCategoryHints(body.transaction_type, body.major_category, body.minor_category);
  const newWfType = resolveWorkflow(newHints ? newHints.workflow_type : null);
  if (typeof newWfType !== 'string') return newWfType;

  // Phase 1 — reverse old transaction
  reverseWorkflow(oldWfType, {
    source_account: oldSourceAccountId,
    target_account: oldTargetAccountId,
    amount:         oldAmount,
    to_amount:      oldFxRate > 0 ? oldAmount * oldFxRate : oldAmount,
    fx_rate:        oldFxRate,
  });

  // Phase 2 — apply new transaction
  executeWorkflow(newWfType, {
    source_account: body.source_account || '',
    target_account: body.target_account || '',
    amount:         newAmount,
    to_amount:      newFxRate > 0 ? newAmount * newFxRate : newAmount,
    fx_rate:        newFxRate,
  });

  // Augment notes with the conversion rate used (no-op when not cross-currency).
  // On edit, applyFxNote strips any stale [FX: ...] marker before re-appending,
  // so changing fx_rate updates the inline rate record correctly.
  const finalNotes = applyFxNote(body.notes, body.source_account, body.target_account, newAmount, newFxRate);

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
    finalNotes,
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
  const txMajor         = String(row[txColIndex('major_category')] || '');
  const txMinor         = String(row[txColIndex('minor_category')] || '');
  const txAmount        = Number(row[txColIndex('amount')]) || 0;
  const sourceAccountId = String(row[txColIndex('source_account')]);
  const targetAccountId = String(row[txColIndex('target_account')]);
  const fxRate          = Number(row[txColIndex('fx_rate')]) || 0;

  const hints  = _findCategoryHints(txType, txMajor, txMinor);
  const wfType = resolveWorkflow(hints ? hints.workflow_type : null);
  if (typeof wfType !== 'string') return wfType;

  reverseWorkflow(wfType, {
    source_account: sourceAccountId,
    target_account: targetAccountId,
    amount:         txAmount,
    to_amount:      fxRate > 0 ? txAmount * fxRate : txAmount,
    fx_rate:        fxRate,
  });

  sheet.deleteRow(rowNum);
  return { ok: true };
}

function createTransactionsBulk(body) {
  if (!Array.isArray(body.transactions) || body.transactions.length === 0)
    return { ok: false, error: 'missing_transactions' };

  var results = [];
  body.transactions.forEach(function(tx) {
    var txBody = {};
    Object.keys(tx).forEach(function(k) { txBody[k] = tx[k]; });
    txBody.pin = body.pin;
    var r = createTransaction(txBody);
    results.push({
      label: (tx.transaction_date_utc || '').slice(0, 10) + ' ' + String(tx.notes || tx.counterparty || '').slice(0, 40),
      ok:    r.ok,
      error: r.error || null,
      id:    r.id    || null,
    });
  });

  var failed = results.filter(function(r) { return !r.ok; });
  return {
    ok:      failed.length === 0,
    created: results.length - failed.length,
    failed:  failed.length,
    results: results,
  };
}

// Returns { ok: false, error: 'duplicate_transaction' } if a row with the same
// (date, type, amount, source_account, target_account) already exists.
function _checkDuplicate(sheet, body) {
  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return null;

  var ciDate   = txColIndex('transaction_date_utc');
  var ciType   = txColIndex('transaction_type');
  var ciAmt    = txColIndex('amount');
  var ciSrc    = txColIndex('source_account');
  var ciTgt    = txColIndex('target_account');

  var inDate   = String(body.transaction_date_utc || '');
  var inType   = String(body.transaction_type     || '');
  var inAmt    = Number(body.amount);
  var inSrc    = String(body.source_account       || '');
  var inTgt    = String(body.target_account       || '');

  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (
      String(r[ciDate]) === inDate   &&
      String(r[ciType]) === inType   &&
      Number(r[ciAmt])  === inAmt    &&
      String(r[ciSrc])  === inSrc    &&
      String(r[ciTgt])  === inTgt
    ) {
      return { ok: false, error: 'duplicate_transaction' };
    }
  }
  return null;
}
