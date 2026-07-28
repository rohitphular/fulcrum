// =============================================================================
// FULCRUM FORGE — Category Validation
// All validation is driven by CATEGORY_SCHEMA (category-schema.gs).
// =============================================================================

function validateCategoryCreate(body) {
  var type = String(body.transaction_type || '').trim();
  if (VALID_TRANSACTION_TYPES.indexOf(type) === -1)
    return { ok: false, error: 'invalid_transaction_type' };
  if (!String(body.major_category || '').trim()) return { ok: false, error: 'missing_major_category' };
  if (!String(body.minor_category || '').trim()) return { ok: false, error: 'missing_minor_category' };
  return { ok: true };
}

function validateCategoryUpdate(body) {
  if (!body.row_num) return { ok: false, error: 'missing_row_num' };
  var type = String(body.transaction_type || '').trim();
  if (VALID_TRANSACTION_TYPES.indexOf(type) === -1)
    return { ok: false, error: 'invalid_transaction_type' };
  if (!String(body.major_category || '').trim()) return { ok: false, error: 'missing_major_category' };
  if (!String(body.minor_category || '').trim()) return { ok: false, error: 'missing_minor_category' };
  return { ok: true };
}
