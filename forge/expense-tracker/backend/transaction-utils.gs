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
