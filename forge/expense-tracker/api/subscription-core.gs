// =============================================================================
// FULCRUM FORGE — Subscription Core: CRUD operations
// =============================================================================

function listSubscriptions() {
  var cols  = getSubscriptionSheetColumns();
  var sheet = getOrCreateSheet(SUBSCRIPTIONS_SHEET, cols);
  var rows  = sheetToObjectsWithRow(sheet);

  rows.forEach(function(row) {
    var isActive = row.is_active === true || row.is_active === 'true' || row.is_active === 'TRUE';
    if (!isActive) {
      row.next_payment_date = '';
      return;
    }
    row.next_payment_date = computeNextPaymentDate(
      row.frequency,
      row.day_of_month,
      row.day_of_week
    );
  });

  return rows;
}

function createSubscription(body) {
  var validation = validateSubscriptionCreate(body);
  if (!validation.ok) return validation;

  var cols  = getSubscriptionSheetColumns();
  var sheet = getOrCreateSheet(SUBSCRIPTIONS_SHEET, cols);

  // Duplicate guard — reject if a subscription with the same name already exists
  var nameColIdx   = subColIndex('name');
  var existingRows = sheet.getDataRange().getValues();
  var normName     = String(body.name).trim().toLowerCase();
  for (var i = 1; i < existingRows.length; i++) {
    if (String(existingRows[i][nameColIdx] || '').trim().toLowerCase() === normName) {
      return { ok: false, error: 'duplicate_subscription' };
    }
  }

  var id  = generateSubscriptionId(sheet);
  var now = new Date().toISOString();

  var row = new Array(cols.length).fill('');

  function setCol(key, value) {
    var field = getSubscriptionSchemaField(key);
    if (field) row[field.sheet_column_position - 1] = (value === undefined || value === null) ? '' : value;
  }

  setCol('id',               id);
  setCol('name',             String(body.name).trim());
  setCol('counterparty_name', String(body.counterparty_name || '').trim());
  setCol('amount',           Number(body.amount));
  setCol('currency',         String(body.currency).trim().toUpperCase());
  setCol('frequency',        String(body.frequency).trim());
  setCol('day_of_month',     body.day_of_month !== undefined && body.day_of_month !== '' ? Number(body.day_of_month) : '');
  setCol('day_of_week',      body.day_of_week  !== undefined && body.day_of_week  !== '' ? Number(body.day_of_week)  : '');
  setCol('source_account',   String(body.source_account).trim());
  setCol('major_category',   String(body.major_category || '').trim());
  setCol('minor_category',   String(body.minor_category || '').trim());
  setCol('tags',             normaliseTags(body.tags || ''));
  setCol('is_active',        true);
  setCol('notes',            String(body.notes || '').trim());
  setCol('created_at',       now);
  setCol('transaction_type', String(body.transaction_type || '').trim());

  sheet.appendRow(row);
  return { ok: true, id: id };
}

function createSubscriptionsBulk(body) {
  if (!Array.isArray(body.subscriptions) || body.subscriptions.length === 0)
    return { ok: false, error: 'missing_subscriptions' };

  var results = [];
  body.subscriptions.forEach(function(sub) {
    var subBody = {};
    Object.keys(sub).forEach(function(k) { subBody[k] = sub[k]; });
    subBody.pin = body.pin;
    var r = createSubscription(subBody);
    results.push({ name: sub.name || '', ok: r.ok, error: r.error || null, id: r.id || null });
  });

  var failed  = results.filter(function(r) { return !r.ok && r.error !== 'duplicate_subscription'; });
  var skipped = results.filter(function(r) { return r.error === 'duplicate_subscription'; });
  return {
    ok:      failed.length === 0,
    created: results.length - failed.length - skipped.length,
    skipped: skipped.length,
    failed:  failed.length,
    results: results,
  };
}

function updateSubscription(body) {
  var validation = validateSubscriptionUpdate(body);
  if (!validation.ok) return validation;

  var cols    = getSubscriptionSheetColumns();
  var sheet   = getOrCreateSheet(SUBSCRIPTIONS_SHEET, cols);
  var rowNum  = Number(body.row_num);
  var lastRow = sheet.getLastRow();
  if (rowNum < 2 || rowNum > lastRow) return { ok: false, error: 'invalid_row' };

  function writeField(key, value) {
    var field = getSubscriptionSchemaField(key);
    if (!field || !field.editable) return;
    sheet.getRange(rowNum, field.sheet_column_position).setValue(value);
  }

  writeField('name',             String(body.name).trim());
  writeField('counterparty_name', String(body.counterparty_name || '').trim());
  writeField('amount',           body.amount !== undefined && body.amount !== '' ? Number(body.amount) : '');
  writeField('currency',         body.currency !== undefined ? String(body.currency).trim().toUpperCase() : '');
  writeField('frequency',        body.frequency !== undefined ? String(body.frequency).trim() : '');
  writeField('day_of_month',     body.day_of_month !== undefined && body.day_of_month !== '' ? Number(body.day_of_month) : '');
  writeField('day_of_week',      body.day_of_week  !== undefined && body.day_of_week  !== '' ? Number(body.day_of_week)  : '');
  writeField('source_account',   body.source_account !== undefined ? String(body.source_account).trim() : '');
  writeField('major_category',   String(body.major_category || '').trim());
  writeField('minor_category',   String(body.minor_category || '').trim());
  writeField('tags',             normaliseTags(body.tags || ''));
  writeField('is_active',        body.is_active === true || body.is_active === 'true');
  writeField('notes',            String(body.notes || '').trim());
  writeField('transaction_type', String(body.transaction_type || '').trim());

  return { ok: true };
}

function deleteSubscription(body) {
  if (!body.row_num) return { ok: false, error: 'missing_row_num' };

  var cols    = getSubscriptionSheetColumns();
  var sheet   = getOrCreateSheet(SUBSCRIPTIONS_SHEET, cols);
  var rowNum  = Number(body.row_num);
  var lastRow = sheet.getLastRow();
  if (rowNum < 2 || rowNum > lastRow) return { ok: false, error: 'invalid_row' };

  sheet.deleteRow(rowNum);
  return { ok: true };
}
