// =============================================================================
// FULCRUM FORGE — Expense Tracker backend
// Deploy as: Execute as Me · Anyone can access
//
// Script Properties required (Extensions → Apps Script → Project Settings):
//   PIN_SECRET   — your chosen PIN
//   TOTP_SECRET  — Base32 secret key, same as entered in Google Authenticator
//
// All sheet tabs are created automatically on first request.
// Run seedCategories() once from the Apps Script editor to populate categories.
// To unlock a locked IP: open audit_access, set is_locked to FALSE.
// =============================================================================

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const TRANSACTIONS_SHEET = 'transactions';
const CATEGORIES_SHEET   = 'categories';
const ACCOUNTS_SHEET     = 'accounts';
const RATES_SHEET        = 'rates';
const AUDIT_SHEET        = 'audit_access';
const MAX_FAILURES       = 3;

const TRANSACTION_COLUMNS = [
  'id', 'date', 'transaction_type', 'amount', 'currency',
  'account', 'major_category', 'minor_category',
  'counterparty', 'notes', 'tags', 'transfer_id',
  'fx_rate', 'country', 'payment_method'
];
// TRANSACTION_COLUMNS indices (col number = index + 1):
// 0=id  1=date  2=transaction_type  3=amount  4=currency
// 5=account  6=major_category  7=minor_category
// 8=counterparty  9=notes  10=tags  11=transfer_id
// 12=fx_rate  13=country  14=payment_method

const CATEGORY_COLUMNS = ['transaction_type', 'major_category', 'minor_category', 'tag_keywords'];
const ACCOUNT_COLUMNS  = ['name', 'currency', 'type', 'notes'];
const RATES_COLUMNS    = ['currency', 'rate', 'symbol', 'updated_at'];

const AUDIT_COLUMNS = [
  'ip', 'city', 'country', 'user_agent',
  'first_seen', 'last_seen',
  'total_attempts', 'success_count', 'failure_count', 'last_failed_at',
  'is_locked', 'locked_at'
];

const VALID_TYPES = ['money-in', 'money-out', 'money-transfer'];

const DEFAULT_RATES = [
  { currency: 'GBP', rate: 1,    symbol: '£'    },
  { currency: 'INR', rate: 105,  symbol: '₹'    },
  { currency: 'USD', rate: 1.27, symbol: '$'    },
  { currency: 'EUR', rate: 1.17, symbol: '€'    },
  { currency: 'AED', rate: 4.66, symbol: 'AED ' }
];

const CATEGORY_SEED = [
  // money-in
  ['money-in', 'Salary', 'Monthly pay'],
  ['money-in', 'Salary', 'Bonus'],
  ['money-in', 'Salary', 'Commission'],
  ['money-in', 'Salary', 'Overtime'],
  ['money-in', 'Freelance / Self-employed', 'Client payment'],
  ['money-in', 'Freelance / Self-employed', 'Consulting'],
  ['money-in', 'Freelance / Self-employed', 'Royalties'],
  ['money-in', 'Business', 'Sales revenue'],
  ['money-in', 'Business', 'Service income'],
  ['money-in', 'Investments', 'Dividends'],
  ['money-in', 'Investments', 'Interest earned'],
  ['money-in', 'Investments', 'Capital gains'],
  ['money-in', 'Investments', 'Rental income'],
  ['money-in', 'Refunds & reimbursements', 'Tax refund'],
  ['money-in', 'Refunds & reimbursements', 'Work reimbursement'],
  ['money-in', 'Refunds & reimbursements', 'Purchase refund'],
  ['money-in', 'Refunds & reimbursements', 'Cashback & rewards'],
  ['money-in', 'Borrowing', 'Loan received'],
  ['money-in', 'Borrowing', 'Credit drawn'],
  ['money-in', 'Borrowing', 'Money from friend/family'],
  ['money-in', 'Gifts & other', 'Gift received'],
  ['money-in', 'Gifts & other', 'Sale of asset'],
  ['money-in', 'Gifts & other', 'Other income'],
  // money-out
  ['money-out', 'Housing', 'Rent'],
  ['money-out', 'Housing', 'Mortgage'],
  ['money-out', 'Housing', 'Council/Property tax'],
  ['money-out', 'Housing', 'Repairs & maintenance'],
  ['money-out', 'Housing', 'Home insurance'],
  ['money-out', 'Utilities', 'Electricity'],
  ['money-out', 'Utilities', 'Gas'],
  ['money-out', 'Utilities', 'Water'],
  ['money-out', 'Utilities', 'Internet'],
  ['money-out', 'Utilities', 'Mobile/Phone'],
  ['money-out', 'Utilities', 'Streaming/TV'],
  ['money-out', 'Food', 'Groceries'],
  ['money-out', 'Food', 'Eating out'],
  ['money-out', 'Food', 'Takeaway/Delivery'],
  ['money-out', 'Food', 'Coffee & snacks'],
  ['money-out', 'Transport', 'Fuel'],
  ['money-out', 'Transport', 'Public transport'],
  ['money-out', 'Transport', 'Taxi/Rideshare'],
  ['money-out', 'Transport', 'Vehicle insurance'],
  ['money-out', 'Transport', 'Vehicle maintenance'],
  ['money-out', 'Transport', 'Parking & tolls'],
  ['money-out', 'Health', 'Doctor/Medical'],
  ['money-out', 'Health', 'Pharmacy'],
  ['money-out', 'Health', 'Dental'],
  ['money-out', 'Health', 'Optical'],
  ['money-out', 'Health', 'Health insurance'],
  ['money-out', 'Health', 'Fitness/Gym'],
  ['money-out', 'Shopping', 'Clothing'],
  ['money-out', 'Shopping', 'Electronics'],
  ['money-out', 'Shopping', 'Household goods'],
  ['money-out', 'Shopping', 'Personal care'],
  ['money-out', 'Shopping', 'Furniture'],
  ['money-out', 'Entertainment', 'Subscriptions'],
  ['money-out', 'Entertainment', 'Events & movies'],
  ['money-out', 'Entertainment', 'Hobbies'],
  ['money-out', 'Entertainment', 'Books & media'],
  ['money-out', 'Entertainment', 'Sports'],
  ['money-out', 'Travel', 'Flights'],
  ['money-out', 'Travel', 'Accommodation'],
  ['money-out', 'Travel', 'Local transport'],
  ['money-out', 'Travel', 'Activities'],
  ['money-out', 'Travel', 'Travel insurance'],
  ['money-out', 'Education', 'Tuition & fees'],
  ['money-out', 'Education', 'Courses'],
  ['money-out', 'Education', 'Books & supplies'],
  ['money-out', 'Family & dependents', 'Childcare'],
  ['money-out', 'Family & dependents', 'School fees'],
  ['money-out', 'Family & dependents', 'Family support'],
  ['money-out', 'Family & dependents', 'Pet care'],
  ['money-out', 'Debt & finance', 'Loan repayment'],
  ['money-out', 'Debt & finance', 'Credit card payment'],
  ['money-out', 'Debt & finance', 'Interest & charges'],
  ['money-out', 'Debt & finance', 'Bank fees'],
  ['money-out', 'Insurance', 'Life insurance'],
  ['money-out', 'Insurance', 'General insurance'],
  ['money-out', 'Taxes', 'Income tax'],
  ['money-out', 'Taxes', 'Other taxes'],
  ['money-out', 'Gifts & donations', 'Gift given'],
  ['money-out', 'Gifts & donations', 'Charity/Donation'],
  ['money-out', 'Lending', 'Money lent to friend/family'],
  ['money-out', 'Other', 'Cash spending'],
  ['money-out', 'Other', 'Miscellaneous'],
  ['money-out', 'Other', 'Uncategorised'],
  // money-transfer
  ['money-transfer', 'Between own accounts', 'Account to account'],
  ['money-transfer', 'Between own accounts', 'To savings'],
  ['money-transfer', 'Between own accounts', 'From savings'],
  ['money-transfer', 'Cross-border', 'UK to India'],
  ['money-transfer', 'Cross-border', 'India to UK'],
  ['money-transfer', 'Currency exchange', 'FX conversion'],
  ['money-transfer', 'Cash', 'ATM withdrawal'],
  ['money-transfer', 'Cash', 'Cash deposit'],
  ['money-transfer', 'Card payment', 'Pay credit card'],
  ['money-transfer', 'Investments', 'To investment'],
  ['money-transfer', 'Investments', 'From investment'],
  ['money-transfer', 'Investments', 'To pension']
];

// -----------------------------------------------------------------------------
// Entry points
// -----------------------------------------------------------------------------

function doGet(e) {
  const meta   = extractMeta(e.parameter);
  const action = e.parameter.action || '';

  if (checkLocked(meta.ip)) return json({ ok: false, error: 'locked' });

  if (action === 'verify') {
    if (!checkPin(e.parameter.pin)) {
      recordAccess(meta, false);
      return json({ ok: false, error: 'auth' });
    }
    if (!verifyTotp(e.parameter.totp)) {
      return json({ ok: false, error: 'totp_invalid' });
    }
    recordAccess(meta, true);
    return json({ ok: true });
  }

  if (!checkPin(e.parameter.pin)) {
    recordAccess(meta, false);
    return json({ ok: false, error: 'auth' });
  }
  recordAccess(meta, true);

  if (action === 'list_transactions') return json({ ok: true, data: listTransactions() });
  if (action === 'list_categories')   return json({ ok: true, data: listCategories() });
  if (action === 'list_accounts')     return json({ ok: true, data: listAccounts() });
  if (action === 'list_rates')        return json({ ok: true, data: listRates() });

  return json({ ok: false, error: 'unknown_action' });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); }
  catch (_) { return json({ ok: false, error: 'invalid_json' }); }

  const meta = extractMeta(body);

  if (checkLocked(meta.ip)) return json({ ok: false, error: 'locked' });

  if (!checkPin(body.pin)) {
    recordAccess(meta, false);
    return json({ ok: false, error: 'auth' });
  }
  recordAccess(meta, true);

  if (body.action === 'create_transaction') return json(createTransaction(body));
  if (body.action === 'upsert_rate')        return json(upsertRate(body));
  if (body.action === 'create_category')    return json(createCategory(body));
  if (body.action === 'update_category')    return json(updateCategory(body));
  if (body.action === 'delete_category')    return json(deleteCategory(body));

  return json({ ok: false, error: 'unknown_action' });
}

// -----------------------------------------------------------------------------
// Transactions
// -----------------------------------------------------------------------------

function listTransactions() {
  return sheetToObjects(getOrCreateSheet(TRANSACTIONS_SHEET, TRANSACTION_COLUMNS));
}

function createTransaction(body) {
  if (!body.date)             return { ok: false, error: 'missing_date' };
  if (!body.transaction_type || !VALID_TYPES.includes(body.transaction_type))
    return { ok: false, error: 'invalid_transaction_type' };
  if (!body.amount || Number(body.amount) <= 0)
    return { ok: false, error: 'invalid_amount' };
  if (!body.currency) return { ok: false, error: 'missing_currency' };
  if (!body.account)  return { ok: false, error: 'missing_account' };

  const sheet = getOrCreateSheet(TRANSACTIONS_SHEET, TRANSACTION_COLUMNS);
  const id    = generateTransactionId(sheet, body.date);
  const now   = new Date().toISOString();

  sheet.appendRow([
    id,
    body.date,
    body.transaction_type,
    Number(body.amount),
    body.currency,
    body.account,
    body.major_category   || '',
    body.minor_category   || '',
    body.counterparty     || '',
    body.notes            || '',
    normaliseTags(body.tags),
    body.transfer_id      || '',
    body.fx_rate !== undefined && body.fx_rate !== '' ? Number(body.fx_rate) : '',
    body.country          || '',
    body.payment_method   || ''
  ]);

  return { ok: true, id };
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

function normaliseTags(tags) {
  if (!tags) return '';
  return String(tags).split(/[,;]+/).map(t => t.trim()).filter(Boolean).join(';');
}

// -----------------------------------------------------------------------------
// Categories
// -----------------------------------------------------------------------------

function listCategories() {
  const sheet = getOrCreateSheet(CATEGORIES_SHEET, CATEGORY_COLUMNS);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    seedCategories();
    return sheetToObjectsWithRow(sheet);
  }
  return sheetToObjectsWithRow(sheet);
}

function seedCategories() {
  const sheet = getOrCreateSheet(CATEGORIES_SHEET, CATEGORY_COLUMNS);
  const existing = sheet.getDataRange().getValues();
  if (existing.length > 1) return; // already seeded
  CATEGORY_SEED.forEach(row => sheet.appendRow(row));
}

function createCategory(body) {
  if (!body.transaction_type || !VALID_TYPES.includes(body.transaction_type))
    return { ok: false, error: 'invalid_transaction_type' };
  if (!String(body.major_category || '').trim()) return { ok: false, error: 'missing_major_category' };
  if (!String(body.minor_category || '').trim()) return { ok: false, error: 'missing_minor_category' };

  const sheet = getOrCreateSheet(CATEGORIES_SHEET, CATEGORY_COLUMNS);
  sheet.appendRow([
    body.transaction_type,
    String(body.major_category).trim(),
    String(body.minor_category).trim(),
    normaliseKeywords(body.tag_keywords || ''),
  ]);
  return { ok: true };
}

function updateCategory(body) {
  if (!body.row_num) return { ok: false, error: 'missing_row_num' };
  if (!body.transaction_type || !VALID_TYPES.includes(body.transaction_type))
    return { ok: false, error: 'invalid_transaction_type' };
  if (!String(body.major_category || '').trim()) return { ok: false, error: 'missing_major_category' };
  if (!String(body.minor_category || '').trim()) return { ok: false, error: 'missing_minor_category' };

  const sheet   = getOrCreateSheet(CATEGORIES_SHEET, CATEGORY_COLUMNS);
  const rowNum  = Number(body.row_num);
  const lastRow = sheet.getLastRow();
  if (rowNum < 2 || rowNum > lastRow) return { ok: false, error: 'invalid_row' };

  sheet.getRange(rowNum, 1, 1, 4).setValues([[
    body.transaction_type,
    String(body.major_category).trim(),
    String(body.minor_category).trim(),
    normaliseKeywords(body.tag_keywords || ''),
  ]]);
  return { ok: true };
}

function deleteCategory(body) {
  if (!body.row_num) return { ok: false, error: 'missing_row_num' };
  const sheet   = getOrCreateSheet(CATEGORIES_SHEET, CATEGORY_COLUMNS);
  const rowNum  = Number(body.row_num);
  const lastRow = sheet.getLastRow();
  if (rowNum < 2 || rowNum > lastRow) return { ok: false, error: 'invalid_row' };
  sheet.deleteRow(rowNum);
  return { ok: true };
}

function normaliseKeywords(keywords) {
  if (!keywords) return '';
  return String(keywords).split(',').map(k => k.trim().toLowerCase()).filter(Boolean).join(', ');
}

// -----------------------------------------------------------------------------
// Accounts
// -----------------------------------------------------------------------------

function listAccounts() {
  return sheetToObjects(getOrCreateSheet(ACCOUNTS_SHEET, ACCOUNT_COLUMNS));
}

// -----------------------------------------------------------------------------
// Rates
// -----------------------------------------------------------------------------

function listRates() {
  const sheet  = getOrCreateSheet(RATES_SHEET, RATES_COLUMNS);
  const values = sheet.getDataRange().getValues();
  const now    = new Date().toISOString();

  if (values.length <= 1) {
    DEFAULT_RATES.forEach(r => sheet.appendRow([r.currency, r.rate, r.symbol, now]));
    return DEFAULT_RATES.map(r => ({ currency: r.currency, rate: r.rate, symbol: r.symbol, updated_at: now }));
  }
  return sheetToObjects(sheet);
}

function upsertRate(body) {
  if (!body.currency) return { ok: false, error: 'missing_currency' };
  if (body.currency === 'GBP') return { ok: false, error: 'base_currency_readonly' };
  if (body.rate === undefined || body.rate === null) return { ok: false, error: 'missing_rate' };

  const sheet  = getOrCreateSheet(RATES_SHEET, RATES_COLUMNS);
  const values = sheet.getDataRange().getValues();
  const now    = new Date().toISOString();

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] !== body.currency) continue;
    sheet.getRange(i + 1, 2).setValue(Number(body.rate));
    if (body.symbol) sheet.getRange(i + 1, 3).setValue(body.symbol);
    sheet.getRange(i + 1, 4).setValue(now);
    return { ok: true };
  }

  sheet.appendRow([body.currency, Number(body.rate), body.symbol || '', now]);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// onEdit cascade — rebuilds category dropdowns in the transactions sheet
// -----------------------------------------------------------------------------

function onEdit(e) {
  const sheet = e.source.getActiveSheet();
  if (sheet.getName() !== TRANSACTIONS_SHEET) return;

  const row = e.range.getRow();
  const col = e.range.getColumn();
  if (row <= 1) return; // header row

  const TYPE_COL  = 3; // transaction_type
  const MAJOR_COL = 7; // major_category
  const MINOR_COL = 8; // minor_category

  const catSheet = e.source.getSheetByName(CATEGORIES_SHEET);
  if (!catSheet) return;
  const catData = catSheet.getDataRange().getValues().slice(1);

  if (col === TYPE_COL) {
    const txType = sheet.getRange(row, TYPE_COL).getValue();
    const majors = [...new Set(catData.filter(r => r[0] === txType).map(r => r[1]))];

    sheet.getRange(row, MAJOR_COL).clearContent();
    sheet.getRange(row, MINOR_COL).clearContent();

    if (majors.length > 0) {
      const rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(majors, true).setAllowInvalid(false).build();
      sheet.getRange(row, MAJOR_COL).setDataValidation(rule);
    }
    sheet.getRange(row, MINOR_COL).clearDataValidations();
  }

  if (col === MAJOR_COL) {
    const txType = sheet.getRange(row, TYPE_COL).getValue();
    const major  = sheet.getRange(row, MAJOR_COL).getValue();
    const minors = catData.filter(r => r[0] === txType && r[1] === major).map(r => r[2]);

    sheet.getRange(row, MINOR_COL).clearContent();

    if (minors.length > 0) {
      const rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(minors, true).setAllowInvalid(false).build();
      sheet.getRange(row, MINOR_COL).setDataValidation(rule);
    }
  }
}

// -----------------------------------------------------------------------------
// TOTP — RFC 6238 (HMAC-SHA1, 30-second window, 6 digits)
// -----------------------------------------------------------------------------

function base32Decode(input) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const s     = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const bytes = [];
  let buf = 0, bits = 0;
  for (let i = 0; i < s.length; i++) {
    buf = (buf << 5) | chars.indexOf(s[i]);
    bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((buf >> bits) & 0xff); }
  }
  return bytes;
}

function generateTotp(keyBytes, counter) {
  const msg = new Array(8).fill(0);
  let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c = Math.floor(c / 256); }
  const hmac   = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, msg, keyBytes);
  const offset = hmac[19] & 0xf;
  const code   = ((hmac[offset]   & 0x7f) << 24)
               | ((hmac[offset+1] & 0xff) << 16)
               | ((hmac[offset+2] & 0xff) << 8)
               |  (hmac[offset+3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

function verifyTotp(token) {
  const secret = PropertiesService.getScriptProperties().getProperty('TOTP_SECRET');
  if (!secret || !token || String(token).length !== 6) return false;
  const key = base32Decode(secret);
  const T   = Math.floor(Date.now() / 1000 / 30);
  for (let d = -1; d <= 1; d++) {
    if (generateTotp(key, T + d) === String(token)) return true;
  }
  return false;
}

// -----------------------------------------------------------------------------
// Audit — one row per IP, running totals
// -----------------------------------------------------------------------------

function getOrCreateAuditSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(AUDIT_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(AUDIT_SHEET);
    sheet.appendRow(AUDIT_COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function checkLocked(ip) {
  if (!ip || ip === 'unknown') return false;
  const sheet  = getOrCreateAuditSheet();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === ip && values[i][10] === true) return true;
  }
  return false;
}

function recordAccess(meta, success) {
  const ip = meta.ip;
  if (!ip || ip === 'unknown') return;

  const sheet  = getOrCreateAuditSheet();
  const values = sheet.getDataRange().getValues();
  const now    = new Date().toISOString();

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] !== ip) continue;
    const rowNum        = i + 1;
    const totalAttempts = (Number(values[i][6]) || 0) + 1;
    const successCount  = (Number(values[i][7]) || 0) + (success ? 1 : 0);
    const failureCount  = (Number(values[i][8]) || 0) + (success ? 0 : 1);
    const lastFailedAt  = success ? values[i][9] : now;
    const shouldLock    = !success && failureCount >= MAX_FAILURES;
    const isLocked      = values[i][10] === true || shouldLock;
    const lockedAt      = shouldLock ? now : (values[i][11] || '');

    sheet.getRange(rowNum, 4).setValue(meta.ua);
    sheet.getRange(rowNum, 6).setValue(now);
    sheet.getRange(rowNum, 7).setValue(totalAttempts);
    sheet.getRange(rowNum, 8).setValue(successCount);
    sheet.getRange(rowNum, 9).setValue(failureCount);
    sheet.getRange(rowNum, 10).setValue(lastFailedAt);
    sheet.getRange(rowNum, 11).setValue(isLocked);
    sheet.getRange(rowNum, 12).setValue(lockedAt);
    return;
  }

  sheet.appendRow([
    ip, meta.city, meta.country, meta.ua,
    now, now, 1,
    success ? 1 : 0,
    success ? 0 : 1,
    success ? '' : now,
    !success && 1 >= MAX_FAILURES,
    !success && 1 >= MAX_FAILURES ? now : ''
  ]);
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function getOrCreateSheet(name, columns) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(columns);
    sheet.setFrozenRows(1);
    return sheet;
  }
  const lastCol = sheet.getLastColumn();
  const headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  let added = 0;
  columns.forEach(col => {
    if (!headers.includes(col)) sheet.getRange(1, lastCol + ++added).setValue(col);
  });
  return sheet;
}

function sheetToObjects(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj;
  });
}

function sheetToObjectsWithRow(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values[0];
  return values.slice(1).map((row, i) => {
    const obj = { _row: i + 2 }; // 1-based sheet row; +1 for header row
    headers.forEach((h, j) => { obj[h] = row[j] ?? ''; });
    return obj;
  });
}

function extractMeta(source) {
  return {
    ip:      source.ip      || 'unknown',
    city:    source.city    || '',
    country: source.country || '',
    ua:      source.ua      || ''
  };
}

function checkPin(pin) {
  return pin === PropertiesService.getScriptProperties().getProperty('PIN_SECRET');
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
