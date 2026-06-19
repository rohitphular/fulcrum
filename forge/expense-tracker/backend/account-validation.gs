// =============================================================================
// FULCRUM FORGE — Account Validation
// All validation is driven by ACCOUNT_SCHEMA (account-schema.gs).
// =============================================================================

function validateAccountCreate(body) {
  var type = String(body.type || '').trim();
  if (VALID_ACCOUNT_TYPES.indexOf(type) === -1) {
    return { ok: false, error: 'invalid_account_type' };
  }
  if (!String(body.name     || '').trim()) return { ok: false, error: 'missing_name' };
  if (!String(body.currency || '').trim()) return { ok: false, error: 'missing_currency' };

  // Required type-specific fields from schema
  var fields = getFieldsForAccountType(type);
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    if (!Array.isArray(f.required_for) || f.required_for.length === 0) continue;
    if (f.required_for.indexOf(type) === -1) continue;
    var val = body[f.key];
    if (val === undefined || val === null || val === '') {
      return { ok: false, error: 'missing_' + f.key };
    }
  }

  // Numeric range checks
  if (body.loan_interest_rate !== undefined && Number(body.loan_interest_rate) < 0) {
    return { ok: false, error: 'invalid_loan_interest_rate' };
  }
  if (body.loan_tenure_months !== undefined && Number(body.loan_tenure_months) <= 0) {
    return { ok: false, error: 'invalid_loan_tenure_months' };
  }
  if (body.credit_card_limit !== undefined && Number(body.credit_card_limit) < 0) {
    return { ok: false, error: 'invalid_credit_card_limit' };
  }
  if (body.overdraft_limit !== undefined && Number(body.overdraft_limit) < 0) {
    return { ok: false, error: 'invalid_overdraft_limit' };
  }

  // Day-of-month checks (1–31)
  if (body.credit_card_billing_date !== undefined) {
    var bd = Number(body.credit_card_billing_date);
    if (bd < 1 || bd > 31) return { ok: false, error: 'invalid_credit_card_billing_date' };
  }
  if (body.credit_card_due_date !== undefined) {
    var dd = Number(body.credit_card_due_date);
    if (dd < 1 || dd > 31) return { ok: false, error: 'invalid_credit_card_due_date' };
  }

  // Date ordering
  if (body.loan_start_date && body.loan_end_date) {
    if (new Date(body.loan_end_date) <= new Date(body.loan_start_date)) {
      return { ok: false, error: 'loan_end_date_before_start' };
    }
  }

  return { ok: true };
}

function validateAccountUpdate(body, currentType) {
  if (!body.row_num)                   return { ok: false, error: 'missing_row_num' };
  if (!String(body.name || '').trim()) return { ok: false, error: 'missing_name' };

  // Reject attempts to send immutable fields
  var fields = getFieldsForAccountType(currentType);
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    if (!f.editable && f.key !== 'row_num' && body[f.key] !== undefined) {
      return { ok: false, error: 'field_not_editable:' + f.key };
    }
  }

  // Day-of-month checks
  if (body.credit_card_billing_date !== undefined) {
    var bd = Number(body.credit_card_billing_date);
    if (bd < 1 || bd > 31) return { ok: false, error: 'invalid_credit_card_billing_date' };
  }
  if (body.credit_card_due_date !== undefined) {
    var dd = Number(body.credit_card_due_date);
    if (dd < 1 || dd > 31) return { ok: false, error: 'invalid_credit_card_due_date' };
  }

  return { ok: true };
}
