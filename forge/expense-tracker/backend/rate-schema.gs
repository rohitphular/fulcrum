// =============================================================================
// FULCRUM FORGE — Rate schema: column definitions and helpers
// GAS global scope — referenced by rate-core.gs and rate-validation.gs
// =============================================================================

const RATE_SCHEMA = {
  currency:   { sheet_column_position: 1, label: 'Currency' },
  rate:       { sheet_column_position: 2, label: 'Rate',    type: 'number' },
  symbol:     { sheet_column_position: 3, label: 'Symbol' },
  updated_at: { sheet_column_position: 4, label: 'Updated', type: 'datetime' },
};

function getRateSheetColumns() {
  return Object.keys(RATE_SCHEMA).sort(
    (a, b) => RATE_SCHEMA[a].sheet_column_position - RATE_SCHEMA[b].sheet_column_position
  );
}

function rateColIndex(name) {
  const f = RATE_SCHEMA[name];
  if (!f) throw new Error('Unknown rate column: ' + name);
  return f.sheet_column_position - 1;  // 0-based
}
