// =============================================================================
// FULCRUM FORGE — Rates: list and upsert exchange rates
// =============================================================================

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
