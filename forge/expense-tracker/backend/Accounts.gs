// =============================================================================
// FULCRUM FORGE — Accounts: CRUD
// =============================================================================

function listAccounts() {
  const rows = sheetToObjectsWithRow(getOrCreateSheet(ACCOUNTS_SHEET, ACCOUNT_COLUMNS));
  return rows.map(a => {
    const bal = Number(a.current_balance) || 0;
    const lim = Number(a.credit_limit)    || 0;
    const utilisation_pct = (a.type === 'credit-card' && lim > 0)
      ? Math.round(Math.abs(bal) / lim * 1000) / 10
      : null;
    return Object.assign({}, a, { utilisation_pct });
  });
}

function generateAccountId(sheet) {
  const now     = new Date();
  const y       = now.getUTCFullYear();
  const m       = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d       = String(now.getUTCDate()).padStart(2, '0');
  const dateStr = `${y}${m}${d}`;            // YYYYMMDD
  const prefix  = `ACC-${dateStr}-`;
  const values  = sheet.getDataRange().getValues();
  let max = 0;
  for (let i = 1; i < values.length; i++) {
    const id = String(values[i][0]);
    if (id.startsWith(prefix)) {
      const n = parseInt(id.slice(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return prefix + String(max + 1).padStart(3, '0');
}

function createAccount(body) {
  if (!String(body.name || '').trim())          return { ok: false, error: 'missing_name' };
  if (!String(body.currency || '').trim())       return { ok: false, error: 'missing_currency' };
  if (!VALID_ACCOUNT_TYPES.includes(body.type)) return { ok: false, error: 'invalid_account_type' };

  // Currency must exist in the rates sheet
  const ratesSheet      = getOrCreateSheet(RATES_SHEET, RATES_COLUMNS);
  const ratesVals       = ratesSheet.getDataRange().getValues();
  const knownCurrencies = new Set();
  for (let i = 1; i < ratesVals.length; i++) {
    const c = String(ratesVals[i][0]).trim().toUpperCase();
    if (c) knownCurrencies.add(c);
  }
  const normCurrency = String(body.currency).trim().toUpperCase();
  if (!knownCurrencies.has(normCurrency)) {
    return { ok: false, error: `Unknown currency: ${normCurrency}. Add it to the rates sheet first.` };
  }

  const sheet       = getOrCreateSheet(ACCOUNTS_SHEET, ACCOUNT_COLUMNS);
  const id          = generateAccountId(sheet);
  const now         = new Date().toISOString();
  const creditLimit = body.type === 'credit-card' ? (Number(body.credit_limit) || 0) : '';

  const openingBalance = Number(body.opening_balance) || 0;
  sheet.appendRow([
    id,
    String(body.name).trim(),
    normCurrency,
    body.type,
    openingBalance,
    openingBalance,   // current_balance starts equal to opening_balance
    creditLimit,
    true,
    String(body.notes || '').trim(),
    now,
  ]);
  return { ok: true, id };
}

function updateAccount(body) {
  if (!body.row_num)                            return { ok: false, error: 'missing_row_num' };
  if (!String(body.name || '').trim())          return { ok: false, error: 'missing_name' };
  if (!String(body.currency || '').trim())      return { ok: false, error: 'missing_currency' };
  if (!VALID_ACCOUNT_TYPES.includes(body.type)) return { ok: false, error: 'invalid_account_type' };

  // Currency must exist in the rates sheet
  const ratesSheet      = getOrCreateSheet(RATES_SHEET, RATES_COLUMNS);
  const ratesVals       = ratesSheet.getDataRange().getValues();
  const knownCurrencies = new Set();
  for (let i = 1; i < ratesVals.length; i++) {
    const c = String(ratesVals[i][0]).trim().toUpperCase();
    if (c) knownCurrencies.add(c);
  }
  const normCurrency = String(body.currency).trim().toUpperCase();
  if (!knownCurrencies.has(normCurrency)) {
    return { ok: false, error: `Unknown currency: ${normCurrency}. Add it to the rates sheet first.` };
  }

  const sheet       = getOrCreateSheet(ACCOUNTS_SHEET, ACCOUNT_COLUMNS);
  const rowNum      = Number(body.row_num);
  const lastRow     = sheet.getLastRow();
  if (rowNum < 2 || rowNum > lastRow) return { ok: false, error: 'invalid_row' };

  const creditLimit = body.type === 'credit-card' ? (Number(body.credit_limit) || 0) : '';

  // Update cols 2–4 and 7–9; col 1 (id), col 5 (opening_balance), col 6 (current_balance), and col 10 (created_at) are never written here.
  // opening_balance is immutable after creation; current_balance is maintained exclusively by adjustAccountBalance inside transaction handlers.
  sheet.getRange(rowNum, 2, 1, 3).setValues([[
    String(body.name).trim(),
    normCurrency,
    body.type,
  ]]);
  sheet.getRange(rowNum, 7, 1, 3).setValues([[
    creditLimit,
    body.is_active === true || body.is_active === 'true',
    String(body.notes || '').trim(),
  ]]);
  return { ok: true };
}

function deleteAccount(body) {
  if (!body.row_num) return { ok: false, error: 'missing_row_num' };
  const sheet   = getOrCreateSheet(ACCOUNTS_SHEET, ACCOUNT_COLUMNS);
  const rowNum  = Number(body.row_num);
  const lastRow = sheet.getLastRow();
  if (rowNum < 2 || rowNum > lastRow) return { ok: false, error: 'invalid_row' };
  sheet.deleteRow(rowNum);
  return { ok: true };
}
