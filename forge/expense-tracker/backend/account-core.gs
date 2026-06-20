// =============================================================================
// FULCRUM FORGE — Account Core: CRUD operations
// =============================================================================

function listAccounts() {
  var cols  = getAccountSheetColumns();
  var sheet = getOrCreateSheet(ACCOUNTS_SHEET, cols);
  var rows  = sheetToObjectsWithRow(sheet);

  return rows.map(function(a) {
    var extras = {};

    if (a.type === 'credit_card') {
      extras.utilisation_pct = calculateUtilisationPct(a.credit_card_limit, a.current_balance);
    }
    if (a.type === 'overdraft') {
      extras.utilisation_pct = calculateUtilisationPct(a.overdraft_limit, a.current_balance);
    }
    if (isLoanType(a.type)) {
      extras.repayment_pct     = calculateLoanRepaymentPct(a.loan_original_amount, a.current_balance);
      extras.next_payment_date = calculateNextPaymentDate(a.loan_first_repayment_date);
    }

    return Object.assign({}, a, extras);
  });
}

function createAccount(body) {
  var validation = validateAccountCreate(body);
  if (!validation.ok) return validation;

  // listRates() auto-seeds default currencies (GBP, INR, USD, EUR, AED) when
  // the rates sheet is empty; reading the sheet directly misses that seeding.
  var ratesData       = listRates();
  var knownCurrencies = {};
  ratesData.forEach(function(r) {
    if (r.currency) knownCurrencies[String(r.currency).trim().toUpperCase()] = true;
  });
  var normCurrency = String(body.currency).trim().toUpperCase();
  if (!knownCurrencies[normCurrency]) {
    return { ok: false, error: 'unknown_currency:' + normCurrency };
  }

  var cols   = getAccountSheetColumns();
  var sheet  = getOrCreateSheet(ACCOUNTS_SHEET, cols);
  var id     = generateAccountId(sheet);
  var now    = new Date().toISOString();
  var type   = String(body.type).trim();
  var isLiabilityAccount = isLiabilityType(type);

  // Liabilities stored as negative; user always inputs positive
  var openingBalance = isLiabilityAccount
    ? -(Math.abs(Number(body.opening_balance) || 0))
    : (Number(body.opening_balance) || 0);

  var row = new Array(cols.length).fill('');

  function setCol(key, value) {
    var field = getAccountSchemaField(key);
    if (field) row[field.sheet_column_position - 1] = (value === undefined || value === null) ? '' : value;
  }

  // Core
  setCol('id',                    id);
  setCol('name',                  String(body.name).trim());
  setCol('type',                  type);
  setCol('sub_type',              String(body.sub_type || '').trim());
  setCol('currency',              normCurrency);
  setCol('opening_balance',       openingBalance);
  setCol('current_balance',       openingBalance);
  setCol('is_active',             true);
  setCol('institution',           String(body.institution           || '').trim());
  setCol('account_number_last4',  String(body.account_number_last4  || '').trim());
  setCol('notes',                 String(body.notes                 || '').trim());
  setCol('created_at',            now);

  // Savings / current
  if (type === 'current' || type === 'savings') {
    setCol('savings_interest_rate',      body.savings_interest_rate      !== undefined ? body.savings_interest_rate      : '');
    setCol('savings_interest_frequency', body.savings_interest_frequency !== undefined ? body.savings_interest_frequency : '');
  }

  // Investment
  if (type === 'investment') {
    setCol('savings_maturity_date', body.savings_maturity_date !== undefined ? body.savings_maturity_date : '');
    setCol('investment_platform',   String(body.investment_platform   || '').trim());
    setCol('investment_risk_level', String(body.investment_risk_level || '').trim());
  }

  // Loans
  if (isLoanType(type)) {
    setCol('loan_original_amount',      Math.abs(Number(body.loan_original_amount)  || 0));
    setCol('loan_interest_rate',        body.loan_interest_rate         !== undefined ? body.loan_interest_rate        : '');
    setCol('loan_interest_type',        body.loan_interest_type         !== undefined ? body.loan_interest_type        : '');
    setCol('loan_tenure_months',        body.loan_tenure_months         !== undefined ? body.loan_tenure_months        : '');
    setCol('loan_start_date',           body.loan_start_date            !== undefined ? body.loan_start_date           : '');
    setCol('loan_end_date',             body.loan_end_date              !== undefined ? body.loan_end_date             : '');
    setCol('loan_first_repayment_date', body.loan_first_repayment_date  !== undefined ? body.loan_first_repayment_date : '');
    setCol('loan_monthly_repayment',    body.loan_monthly_repayment     !== undefined ? body.loan_monthly_repayment    : '');
  }
  if (type === 'mortgage' || type === 'auto_loan') {
    setCol('loan_collateral', String(body.loan_collateral || '').trim());
  }

  // Credit card
  if (type === 'credit_card') {
    setCol('credit_card_limit',                  Number(body.credit_card_limit)                  || 0);
    setCol('credit_card_apr',                    body.credit_card_apr                            !== undefined ? body.credit_card_apr                            : '');
    setCol('credit_card_interest_free_days',     body.credit_card_interest_free_days             !== undefined ? body.credit_card_interest_free_days             : '');
    setCol('credit_card_billing_date',           body.credit_card_billing_date                   !== undefined ? body.credit_card_billing_date                   : '');
    setCol('credit_card_due_date',               body.credit_card_due_date                       !== undefined ? body.credit_card_due_date                       : '');
    setCol('credit_card_minimum_payment_pct',    body.credit_card_minimum_payment_pct            !== undefined ? body.credit_card_minimum_payment_pct            : '');
    setCol('credit_card_minimum_payment_fixed',  body.credit_card_minimum_payment_fixed          !== undefined ? body.credit_card_minimum_payment_fixed          : '');
    setCol('credit_card_annual_fee',             body.credit_card_annual_fee                     !== undefined ? body.credit_card_annual_fee                     : '');
  }

  // Overdraft
  if (type === 'overdraft') {
    setCol('overdraft_limit',    Number(body.overdraft_limit) || 0);
    setCol('overdraft_arranged', body.overdraft_arranged !== false);
    setCol('overdraft_apr',      body.overdraft_apr !== undefined ? body.overdraft_apr : '');
  }

  sheet.appendRow(row);
  return { ok: true, id: id };
}

function updateAccount(body) {
  var cols    = getAccountSheetColumns();
  var sheet   = getOrCreateSheet(ACCOUNTS_SHEET, cols);
  var rowNum  = Number(body.row_num);
  var lastRow = sheet.getLastRow();
  if (rowNum < 2 || rowNum > lastRow) return { ok: false, error: 'invalid_row' };

  var typeColPos  = getAccountSchemaField('type').sheet_column_position;
  var currentType = sheet.getRange(rowNum, typeColPos).getValue();

  var validation = validateAccountUpdate(body, currentType);
  if (!validation.ok) return validation;

  function writeField(key, value) {
    var field = getAccountSchemaField(key);
    if (!field || !field.editable) return;
    sheet.getRange(rowNum, field.sheet_column_position).setValue(value);
  }

  writeField('name',                 String(body.name).trim());
  writeField('is_active',            body.is_active === true || body.is_active === 'true');
  writeField('institution',          String(body.institution          || '').trim());
  writeField('account_number_last4', String(body.account_number_last4 || '').trim());
  writeField('notes',                String(body.notes                || '').trim());

  // Savings / current
  if (currentType === 'current' || currentType === 'savings') {
    if (body.savings_interest_rate      !== undefined) writeField('savings_interest_rate',      body.savings_interest_rate);
    if (body.savings_interest_frequency !== undefined) writeField('savings_interest_frequency', body.savings_interest_frequency);
  }

  // Investment
  if (currentType === 'investment') {
    if (body.savings_maturity_date  !== undefined) writeField('savings_maturity_date',  body.savings_maturity_date);
    if (body.investment_platform    !== undefined) writeField('investment_platform',    String(body.investment_platform  || '').trim());
    if (body.investment_risk_level  !== undefined) writeField('investment_risk_level',  String(body.investment_risk_level || '').trim());
  }

  // Loans
  if (isLoanType(currentType)) {
    if (body.loan_interest_rate     !== undefined) writeField('loan_interest_rate',     body.loan_interest_rate);
    if (body.loan_interest_type     !== undefined) writeField('loan_interest_type',     body.loan_interest_type);
    if (body.loan_tenure_months     !== undefined) writeField('loan_tenure_months',     body.loan_tenure_months);
    if (body.loan_end_date          !== undefined) writeField('loan_end_date',          body.loan_end_date);
    if (body.loan_monthly_repayment !== undefined) writeField('loan_monthly_repayment', body.loan_monthly_repayment);
  }
  if (currentType === 'mortgage' || currentType === 'auto_loan') {
    if (body.loan_collateral !== undefined) writeField('loan_collateral', String(body.loan_collateral || '').trim());
  }

  // Credit card
  if (currentType === 'credit_card') {
    if (body.credit_card_limit                 !== undefined) writeField('credit_card_limit',                 Number(body.credit_card_limit) || 0);
    if (body.credit_card_apr                   !== undefined) writeField('credit_card_apr',                   body.credit_card_apr);
    if (body.credit_card_interest_free_days    !== undefined) writeField('credit_card_interest_free_days',    body.credit_card_interest_free_days);
    if (body.credit_card_billing_date          !== undefined) writeField('credit_card_billing_date',          body.credit_card_billing_date);
    if (body.credit_card_due_date              !== undefined) writeField('credit_card_due_date',              body.credit_card_due_date);
    if (body.credit_card_minimum_payment_pct   !== undefined) writeField('credit_card_minimum_payment_pct',   body.credit_card_minimum_payment_pct);
    if (body.credit_card_minimum_payment_fixed !== undefined) writeField('credit_card_minimum_payment_fixed', body.credit_card_minimum_payment_fixed);
    if (body.credit_card_annual_fee            !== undefined) writeField('credit_card_annual_fee',            body.credit_card_annual_fee);
  }

  // Overdraft
  if (currentType === 'overdraft') {
    if (body.overdraft_limit    !== undefined) writeField('overdraft_limit',    Number(body.overdraft_limit) || 0);
    if (body.overdraft_arranged !== undefined) writeField('overdraft_arranged', body.overdraft_arranged !== false);
    if (body.overdraft_apr      !== undefined) writeField('overdraft_apr',      body.overdraft_apr);
  }

  return { ok: true };
}

function deleteAccount(body) {
  if (!body.row_num) return { ok: false, error: 'missing_row_num' };
  var cols    = getAccountSheetColumns();
  var sheet   = getOrCreateSheet(ACCOUNTS_SHEET, cols);
  var rowNum  = Number(body.row_num);
  var lastRow = sheet.getLastRow();
  if (rowNum < 2 || rowNum > lastRow) return { ok: false, error: 'invalid_row' };
  sheet.deleteRow(rowNum);
  return { ok: true };
}

function getAccountById(id) {
  if (!id) return null;
  var cols  = getAccountSheetColumns();
  var sheet = getOrCreateSheet(ACCOUNTS_SHEET, cols);
  var rows  = sheetToObjectsWithRow(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === id) return rows[i];
  }
  return null;
}
