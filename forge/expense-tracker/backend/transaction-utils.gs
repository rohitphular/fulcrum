// =============================================================================
// FULCRUM FORGE — Transaction Utils: ID generation and balance adjustment
// Shared across all transaction .gs files via GAS global scope.
// =============================================================================

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

function adjustAccountBalance(accountId, delta) {
  const sheet           = getOrCreateSheet(ACCOUNTS_SHEET, getAccountSheetColumns());
  const values          = sheet.getDataRange().getValues();
  const accountIdColIdx = getAccountSchemaField('id').sheet_column_position - 1;
  const balanceColIdx   = getAccountSchemaField('current_balance').sheet_column_position - 1;
  const balanceColNum   = getAccountSchemaField('current_balance').sheet_column_position;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][accountIdColIdx]) !== accountId) continue;
    const current = Number(values[i][balanceColIdx]) || 0;
    sheet.getRange(i + 1, balanceColNum).setValue(current + delta);
    return;
  }
}

// applyFxNote — capture the conversion rate USED for this transaction inline in
// notes, so the sheet remains auditable even after the global rates table changes.
// Strips any existing [FX: ...] marker and appends a fresh one when this is a
// cross-currency transaction. Returns the new notes string.
//
// Marker format: [FX: {amount} {fromCcy} <-> {credited} {toCcy}]
// The credited amount is amount × fxRate. The ratio between the two numbers IS
// the rate; this format captures it human-readably for sheet inspection.
function applyFxNote(notes, sourceAccountId, targetAccountId, amount, fxRate) {
  // Strip any existing marker from anywhere in the string, normalise whitespace.
  const cleaned = String(notes || '')
    .replace(/\s*\[FX:[^\]]*\]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // No cross-currency marker needed when:
  //   - no source or target account (money-in or non-repayment money-out)
  //   - fxRate is missing or non-positive
  if (!sourceAccountId || !targetAccountId) return cleaned;
  const rate = Number(fxRate) || 0;
  if (rate <= 0) return cleaned;

  // Look up the source/target currencies from the accounts sheet.
  const accSheet = getOrCreateSheet(ACCOUNTS_SHEET, getAccountSheetColumns());
  const values   = accSheet.getDataRange().getValues();
  const idIdx    = acctColIndex('id');
  const ccyIdx   = acctColIndex('currency');
  let sourceCcy = '', targetCcy = '';
  for (let i = 1; i < values.length; i++) {
    const id = String(values[i][idIdx] || '');
    if (id === String(sourceAccountId)) sourceCcy = String(values[i][ccyIdx] || '');
    if (id === String(targetAccountId)) targetCcy = String(values[i][ccyIdx] || '');
    if (sourceCcy && targetCcy) break;
  }

  // Same-currency or missing currency → no marker.
  if (!sourceCcy || !targetCcy || sourceCcy === targetCcy) return cleaned;

  const credited = Number(amount) * rate;
  const fmt = function(n) {
    // Strip trailing zeros after the decimal; keep integers integer-looking.
    return Number(n).toFixed(2).replace(/\.?0+$/, '') || '0';
  };
  const marker = '[FX: ' + fmt(amount) + ' ' + sourceCcy + ' <-> ' + fmt(credited) + ' ' + targetCcy + ']';

  return cleaned ? (cleaned + ' ' + marker) : marker;
}
