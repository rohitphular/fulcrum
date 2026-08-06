// =============================================================================
// FULCRUM FORGE — Subscription Validation
// All validation is driven by SUBSCRIPTION_SCHEMA (subscription-schema.gs).
// =============================================================================

function validateSubscriptionCreate(body) {
  if (!String(body.name     || '').trim()) return { ok: false, error: 'missing_name' };
  if (!String(body.currency || '').trim()) return { ok: false, error: 'missing_currency' };

  const amount = Number(body.amount);
  if (isNaN(amount) || amount <= 0) return { ok: false, error: 'invalid_amount' };

  const frequency = String(body.frequency || '').trim();
  if (VALID_FREQUENCIES.indexOf(frequency) === -1) return { ok: false, error: 'invalid_frequency' };

  if (!String(body.source_account || '').trim()) return { ok: false, error: 'missing_source_account' };

  if (frequency === 'weekly') {
    const dow = Number(body.day_of_week);
    if (!body.day_of_week && body.day_of_week !== 0) return { ok: false, error: 'missing_day_of_week' };
    if (!Number.isInteger(dow) || dow < 1 || dow > 7)  return { ok: false, error: 'invalid_day_of_week' };
  } else {
    // monthly / quarterly / annual — day_of_month required
    if (!body.day_of_month && body.day_of_month !== 0) return { ok: false, error: 'missing_day_of_month' };
    const dom = Number(body.day_of_month);
    if (!Number.isInteger(dom) || dom < 1 || dom > 31)  return { ok: false, error: 'invalid_day_of_month' };
  }

  return { ok: true };
}

function validateSubscriptionUpdate(body) {
  if (!body.row_num)                        return { ok: false, error: 'missing_row_num' };
  if (!String(body.name || '').trim())      return { ok: false, error: 'missing_name' };

  if (body.amount !== undefined && body.amount !== '') {
    const amount = Number(body.amount);
    if (isNaN(amount) || amount <= 0) return { ok: false, error: 'invalid_amount' };
  }

  if (body.is_active !== undefined && body.is_active !== '') {
    const isActive = body.is_active;
    if (isActive !== true && isActive !== false &&
        isActive !== 'true' && isActive !== 'false') {
      return { ok: false, error: 'invalid_is_active' };
    }
  }

  return { ok: true };
}
