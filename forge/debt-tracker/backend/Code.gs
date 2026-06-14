// =============================================================================
// FULCRUM FORGE — Debt Tracker backend
// Deploy as: Execute as Me · Anyone can access
//
// Script Properties required (Extensions → Apps Script → Project Settings):
//   PIN_SECRET   — your chosen PIN
//   TOTP_SECRET  — Base32 secret key, same as entered in Google Authenticator
//
// All sheet tabs are created automatically on first request.
// To unlock a locked IP: open audit_access, set is_locked to FALSE.
// =============================================================================

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DEBTS_SHEET    = 'debts';
const PAYMENTS_SHEET = 'payments';
const RATES_SHEET    = 'rates';
const AUDIT_SHEET    = 'audit_access';
const MAX_FAILURES   = 3;

const DEBT_COLUMNS = [
  'id', 'name', 'type', 'subtype', 'currency',
  'balance', 'rate', 'min_payment', 'min_percent', 'min_floor',
  'precomputed', 'include_in_projector', 'status',
  'created_at', 'updated_at'
];
// DEBT_COLUMNS indices (col number = index + 1):
// 0=id  1=name  2=type  3=subtype  4=currency
// 5=balance  6=rate  7=min_payment  8=min_percent  9=min_floor
// 10=precomputed  11=include_in_projector  12=status
// 13=created_at  14=updated_at

const PAYMENT_COLUMNS = [
  'id', 'debt_id', 'debt_name', 'amount', 'currency', 'date', 'note', 'created_at'
];
// 0=id  1=debt_id  2=debt_name  3=amount  4=currency  5=date  6=note  7=created_at

const RATES_COLUMNS = ['currency', 'rate', 'symbol', 'updated_at'];

const AUDIT_COLUMNS = [
  'ip', 'city', 'country', 'user_agent',
  'first_seen', 'last_seen',
  'total_attempts', 'success_count', 'failure_count', 'last_failed_at',
  'is_locked', 'locked_at'
];
// 0=ip  1=city  2=country  3=user_agent
// 4=first_seen  5=last_seen
// 6=total_attempts  7=success_count  8=failure_count  9=last_failed_at
// 10=is_locked  11=locked_at

const VALID_TYPES      = ['loan', 'card', 'friend'];
const VALID_SUBTYPES   = ['home_loan', 'personal_loan'];
const VALID_STATUSES   = ['active', 'paid_off'];
const VALID_CURRENCIES = ['GBP', 'INR', 'USD', 'EUR', 'AED'];

const DEFAULT_RATES = [
  { currency: 'GBP', rate: 1,    symbol: '£'    },
  { currency: 'INR', rate: 105,  symbol: '₹'    },
  { currency: 'USD', rate: 1.27, symbol: '$'    },
  { currency: 'EUR', rate: 1.17, symbol: '€'    },
  { currency: 'AED', rate: 4.66, symbol: 'AED ' }
];

// -----------------------------------------------------------------------------
// Entry points
// -----------------------------------------------------------------------------

function doGet(e) {
  const meta   = extractMeta(e.parameter);
  const action = e.parameter.action || '';

  if (checkLocked(meta.ip)) return json({ ok: false, error: 'locked' });

  // verify — PIN + TOTP, called once at login
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

  // All other GET actions — PIN only
  if (!checkPin(e.parameter.pin)) {
    recordAccess(meta, false);
    return json({ ok: false, error: 'auth' });
  }
  recordAccess(meta, true);

  if (action === 'list_debts')    return json({ ok: true, data: listDebts() });
  if (action === 'list_payments') return json({ ok: true, data: listPayments(e.parameter.debt_id || null) });
  if (action === 'list_rates')    return json({ ok: true, data: listRates() });

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

  if (body.action === 'create_debt')    return json(createDebt(body));
  if (body.action === 'update_debt')    return json(updateDebt(body));
  if (body.action === 'delete_debt')    return json(deleteDebt(body.id));
  if (body.action === 'create_payment') return json(createPayment(body));
  if (body.action === 'delete_payment') return json(deletePayment(body.id));
  if (body.action === 'upsert_rate')    return json(upsertRate(body));

  return json({ ok: false, error: 'unknown_action' });
}

// -----------------------------------------------------------------------------
// Debts
// -----------------------------------------------------------------------------

function listDebts() {
  return sheetToObjects(getOrCreateSheet(DEBTS_SHEET, DEBT_COLUMNS));
}

function createDebt(body) {
  const err = validateDebt(body);
  if (err) return { ok: false, error: err };

  const sheet = getOrCreateSheet(DEBTS_SHEET, DEBT_COLUMNS);
  const now   = new Date().toISOString();
  sheet.appendRow([
    Utilities.getUuid(),                                              // id
    String(body.name).trim(),                                         // name
    body.type,                                                        // type
    body.type === 'loan' ? (body.subtype || '') : '',                 // subtype
    body.currency,                                                    // currency
    Number(body.balance)      || 0,                                   // balance
    Number(body.rate)         || 0,                                   // rate
    Number(body.min_payment)  || 0,                                   // min_payment
    Number(body.min_percent)  || 0,                                   // min_percent
    Number(body.min_floor)    || 0,                                   // min_floor
    body.precomputed === true || body.precomputed === 'true',          // precomputed
    body.include_in_projector !== false && body.include_in_projector !== 'false', // include_in_projector
    body.status || 'active',                                          // status
    now,                                                              // created_at
    now                                                               // updated_at
  ]);
  return { ok: true };
}

function updateDebt(body) {
  if (!body.id) return { ok: false, error: 'missing_id' };
  const err = validateDebt(body);
  if (err) return { ok: false, error: err };

  const sheet  = getOrCreateSheet(DEBTS_SHEET, DEBT_COLUMNS);
  const values = sheet.getDataRange().getValues();
  const now    = new Date().toISOString();

  for (let i = 1; i < values.length; i++) {
    if (values[i][0] !== body.id) continue;
    const r = i + 1;
    sheet.getRange(r, 2).setValue(String(body.name).trim());
    sheet.getRange(r, 3).setValue(body.type);
    sheet.getRange(r, 4).setValue(body.type === 'loan' ? (body.subtype || '') : '');
    sheet.getRange(r, 5).setValue(body.currency);
    sheet.getRange(r, 6).setValue(Number(body.balance)     || 0);
    sheet.getRange(r, 7).setValue(Number(body.rate)        || 0);
    sheet.getRange(r, 8).setValue(Number(body.min_payment) || 0);
    sheet.getRange(r, 9).setValue(Number(body.min_percent) || 0);
    sheet.getRange(r, 10).setValue(Number(body.min_floor)  || 0);
    sheet.getRange(r, 11).setValue(body.precomputed === true || body.precomputed === 'true');
    sheet.getRange(r, 12).setValue(body.include_in_projector !== false && body.include_in_projector !== 'false');
    sheet.getRange(r, 13).setValue(body.status || 'active');
    sheet.getRange(r, 15).setValue(now);
    return { ok: true };
  }
  return { ok: false, error: 'not_found' };
}

function deleteDebt(id) {
  if (!id) return { ok: false, error: 'missing_id' };
  const sheet  = getOrCreateSheet(DEBTS_SHEET, DEBT_COLUMNS);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] !== id) continue;
    sheet.deleteRow(i + 1);
    return { ok: true };
  }
  return { ok: false, error: 'not_found' };
}

function validateDebt(body) {
  if (!body.name || !String(body.name).trim()) return 'missing_name';
  if (!body.type || !VALID_TYPES.includes(body.type)) return 'invalid_type';
  if (!body.currency || !VALID_CURRENCIES.includes(body.currency)) return 'invalid_currency';
  if (body.status && !VALID_STATUSES.includes(body.status)) return 'invalid_status';
  if (body.type === 'loan' && (!body.subtype || !VALID_SUBTYPES.includes(body.subtype))) return 'invalid_subtype';
  return null;
}

// -----------------------------------------------------------------------------
// Payments
// -----------------------------------------------------------------------------

function listPayments(debtId) {
  const all = sheetToObjects(getOrCreateSheet(PAYMENTS_SHEET, PAYMENT_COLUMNS));
  return debtId ? all.filter(p => p.debt_id === debtId) : all;
}

function createPayment(body) {
  if (!body.debt_id) return { ok: false, error: 'missing_debt_id' };
  if (!body.date)    return { ok: false, error: 'missing_date' };

  const amount = Number(body.amount);
  if (!amount || amount <= 0) return { ok: false, error: 'invalid_amount' };

  // Find the debt
  const debtsSheet = getOrCreateSheet(DEBTS_SHEET, DEBT_COLUMNS);
  const debtValues = debtsSheet.getDataRange().getValues();
  let debtRow = -1, debtName = '', debtCurrency = '', currentBalance = 0;

  for (let i = 1; i < debtValues.length; i++) {
    if (debtValues[i][0] !== body.debt_id) continue;
    debtRow        = i + 1;
    debtName       = debtValues[i][1];
    debtCurrency   = debtValues[i][4];
    currentBalance = Number(debtValues[i][5]) || 0;
    break;
  }
  if (debtRow < 0) return { ok: false, error: 'debt_not_found' };

  // Log the payment
  const paySheet = getOrCreateSheet(PAYMENTS_SHEET, PAYMENT_COLUMNS);
  const now      = new Date().toISOString();
  paySheet.appendRow([
    Utilities.getUuid(),
    body.debt_id,
    debtName,
    amount,
    debtCurrency,
    body.date,
    body.note || '',
    now
  ]);

  // Reduce debt balance (floor at 0)
  debtsSheet.getRange(debtRow, 6).setValue(Math.max(0, currentBalance - amount));
  debtsSheet.getRange(debtRow, 15).setValue(now);

  return { ok: true };
}

function deletePayment(id) {
  if (!id) return { ok: false, error: 'missing_id' };

  const paySheet  = getOrCreateSheet(PAYMENTS_SHEET, PAYMENT_COLUMNS);
  const payValues = paySheet.getDataRange().getValues();

  for (let i = 1; i < payValues.length; i++) {
    if (payValues[i][0] !== id) continue;

    const debtId = payValues[i][1];
    const amount = Number(payValues[i][3]) || 0;

    // Restore debt balance
    const debtsSheet = getOrCreateSheet(DEBTS_SHEET, DEBT_COLUMNS);
    const debtValues = debtsSheet.getDataRange().getValues();
    for (let j = 1; j < debtValues.length; j++) {
      if (debtValues[j][0] !== debtId) continue;
      const restored = (Number(debtValues[j][5]) || 0) + amount;
      debtsSheet.getRange(j + 1, 6).setValue(restored);
      debtsSheet.getRange(j + 1, 15).setValue(new Date().toISOString());
      break;
    }

    paySheet.deleteRow(i + 1);
    return { ok: true };
  }
  return { ok: false, error: 'not_found' };
}

// -----------------------------------------------------------------------------
// Rates
// -----------------------------------------------------------------------------

function listRates() {
  const sheet  = getOrCreateSheet(RATES_SHEET, RATES_COLUMNS);
  const values = sheet.getDataRange().getValues();
  const now    = new Date().toISOString();

  // Seed defaults if sheet is empty
  if (values.length <= 1) {
    DEFAULT_RATES.forEach(r => sheet.appendRow([r.currency, r.rate, r.symbol, now]));
    return DEFAULT_RATES.map(r => ({ currency: r.currency, rate: r.rate, symbol: r.symbol, updated_at: now }));
  }
  return sheetToObjects(sheet);
}

function upsertRate(body) {
  if (!body.currency) return { ok: false, error: 'missing_currency' };
  if (!VALID_CURRENCIES.includes(body.currency)) return { ok: false, error: 'invalid_currency' };
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
  let   c   = counter;
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
  }
  return sheet;
}

function sheetToObjects(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
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
