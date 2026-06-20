// =============================================================================
// FULCRUM FORGE — Rate validation
// =============================================================================

function validateRateUpsert(body) {
  if (!body.currency)                               return { ok: false, error: 'missing_currency' };
  if (body.currency === 'GBP')                      return { ok: false, error: 'base_currency_readonly' };
  if (body.rate === undefined || body.rate === null) return { ok: false, error: 'missing_rate' };
  if (Number(body.rate) <= 0)                       return { ok: false, error: 'rate_must_be_positive' };
  return { ok: true };
}
