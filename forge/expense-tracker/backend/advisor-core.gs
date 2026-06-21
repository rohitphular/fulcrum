// =============================================================================
// FULCRUM FORGE — Advisor Core: OpenAI-powered financial advisor
// Requires Script Property: OPENAI_API_KEY
// =============================================================================

function advisorChat(body) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) return { ok: false, error: 'no_api_key' };

  var userMessage = String(body.message || '').trim();
  if (!userMessage) return { ok: false, error: 'empty_message' };

  var history    = _getRecentHistory(5);
  var snapshot   = _buildSnapshot();
  var systemPmt  = _buildSystemPrompt(snapshot);
  var messages   = history.concat([{ role: 'user', content: userMessage }]);

  var r1 = _callClaude(apiKey, systemPmt, messages);
  if (!r1.ok) return r1;

  var finalContent = r1.content;
  var dataReq = _parseDataRequest(r1.content);

  if (dataReq) {
    var fetched  = _fetchRequestedData(dataReq);
    var messages2 = messages.concat([
      { role: 'assistant', content: r1.content },
      { role: 'user', content: 'Requested data:\n' + JSON.stringify(fetched) + '\n\nNow answer my original question.' }
    ]);
    var r2 = _callClaude(apiKey, systemPmt, messages2);
    if (r2.ok) finalContent = r2.content;
  }

  _saveToHistory('user', userMessage);
  _saveToHistory('assistant', finalContent);
  _trimHistory();

  return { ok: true, content: finalContent };
}

function getAdvisorHistory() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ADVISOR_SHEET);
  if (!sheet) return [];
  return sheetToObjects(sheet).map(function(row) {
    return { timestamp: row.timestamp, role: row.role, content: row.content };
  });
}

function clearAdvisorHistory() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ADVISOR_SHEET);
  if (sheet) {
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
  }
  return { ok: true };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _getRecentHistory(n) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ADVISOR_SHEET);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  var startRow = Math.max(2, lastRow - n + 1);
  var numRows  = lastRow - startRow + 1;
  var data = sheet.getRange(startRow, 1, numRows, 3).getValues();
  return data.map(function(row) { return { role: String(row[1]), content: String(row[2]) }; });
}

function _saveToHistory(role, content) {
  var sheet = getOrCreateSheet(ADVISOR_SHEET, ['timestamp', 'role', 'content']);
  sheet.appendRow([new Date().toISOString(), role, content]);
}

function _trimHistory() {
  var sheet   = getOrCreateSheet(ADVISOR_SHEET, ['timestamp', 'role', 'content']);
  var lastRow = sheet.getLastRow();
  if (lastRow > 101) sheet.deleteRows(2, lastRow - 101);
}

function _buildSnapshot() {
  var accounts  = listAccounts();
  var ratesData = listRates();

  var rateMap = {};
  ratesData.forEach(function(r) {
    if (r.currency) rateMap[String(r.currency).toUpperCase()] = Number(r.rate) || 1;
  });

  var assets = 0, liabilities = 0;
  var acctList = [];

  accounts.filter(function(a) { return a.is_active; }).forEach(function(a) {
    var bal = (a.type === 'investment' && Number(a.investment_current_value) > 0)
      ? Number(a.investment_current_value)
      : Number(a.current_balance) || 0;
    var rate   = rateMap[String(a.currency || 'GBP').toUpperCase()] || 1;
    var balGbp = bal / rate;

    if (isLiabilityType(a.type)) liabilities += Math.abs(balGbp);
    else                          assets      += balGbp;

    acctList.push({ name: a.name, type: a.type, sub_type: a.sub_type || '', currency: a.currency, balance: Math.round(bal * 100) / 100 });
  });

  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var txSheet = ss.getSheetByName(TRANSACTIONS_SHEET);
  var allTx   = txSheet ? sheetToObjects(txSheet) : [];

  var cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);

  var recentTx = allTx.filter(function(tx) {
    var d = new Date(tx.transaction_date_utc);
    return !isNaN(d.getTime()) && d >= cutoff && tx.transaction_type;
  });

  var catSpend = {}, cpSpend = {}, totalIn = 0, totalOut = 0;
  recentTx.forEach(function(tx) {
    var amt = Number(tx.amount) || 0;
    if (tx.transaction_type === 'money-out') {
      totalOut += amt;
      var key = (tx.major_category || 'Uncategorised') + ' / ' + (tx.minor_category || 'Other');
      catSpend[key] = (catSpend[key] || 0) + amt;
      var cp = String(tx.counterparty_name || '').trim();
      if (cp) cpSpend[cp] = (cpSpend[cp] || 0) + amt;
    } else if (tx.transaction_type === 'money-in') {
      totalIn += amt;
    }
  });

  var topCategories = Object.keys(catSpend)
    .sort(function(a, b) { return catSpend[b] - catSpend[a]; })
    .slice(0, 10)
    .map(function(k) { return { category: k, amount: Math.round(catSpend[k] * 100) / 100 }; });

  var topCounterparties = Object.keys(cpSpend)
    .sort(function(a, b) { return cpSpend[b] - cpSpend[a]; })
    .slice(0, 5)
    .map(function(k) { return { name: k, amount: Math.round(cpSpend[k] * 100) / 100 }; });

  return {
    net_worth_gbp:        Math.round((assets - liabilities) * 100) / 100,
    total_assets_gbp:     Math.round(assets * 100) / 100,
    total_liabilities_gbp: Math.round(liabilities * 100) / 100,
    note: 'Net worth is converted to GBP using stored exchange rates. Account balances shown in native currency.',
    accounts: acctList,
    last_3_months: {
      total_income:           Math.round(totalIn  * 100) / 100,
      total_expense:          Math.round(totalOut * 100) / 100,
      top_spending_categories: topCategories,
      top_counterparties:      topCounterparties
    }
  };
}

function _buildSystemPrompt(snapshot) {
  return 'You are a personal financial advisor embedded in an expense tracking app called Fulcrum Forge. ' +
    'You have access to the user\'s current financial snapshot below. Be helpful, specific, and data-driven. ' +
    'You are read-only — you cannot modify any data. Refer to actual numbers from the snapshot when relevant.\n\n' +
    '## Financial Snapshot\n```json\n' + JSON.stringify(snapshot, null, 2) + '\n```\n\n' +
    '## Requesting Additional Data\n' +
    'If you need specific transactions to answer accurately, respond with ONLY this JSON (nothing else — the user will not see it):\n' +
    '{"data_request":{"transaction_type":"money-out","major_category":"Food","months_back":3,"limit":50}}\n' +
    'Filters: transaction_type (money-in/money-out/money-transfer), major_category, minor_category, account_id, ' +
    'months_back (max 12, default 3), limit (max 100, default 50).\n' +
    'Only request data when the snapshot is genuinely insufficient. For general questions the snapshot is enough.';
}

function _callClaude(apiKey, systemPrompt, messages) {
  var openAiMessages = [{ role: 'system', content: systemPrompt }].concat(messages);
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + apiKey },
    payload: JSON.stringify({
      model:      'gpt-4o',
      max_tokens: 1024,
      messages:   openAiMessages
    }),
    muteHttpExceptions: true
  };
  try {
    var resp = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', options);
    var code = resp.getResponseCode();
    var data = JSON.parse(resp.getContentText());
    if (code !== 200) return { ok: false, error: data.error ? data.error.message : 'api_error_' + code };
    var content = (data.choices && data.choices[0]) ? data.choices[0].message.content : '';
    return { ok: true, content: content };
  } catch (e) {
    return { ok: false, error: 'fetch_error: ' + e.message };
  }
}

function _parseDataRequest(content) {
  var trimmed = content.trim();
  if (trimmed.charAt(0) === '{' && trimmed.indexOf('"data_request"') !== -1) {
    try {
      var parsed = JSON.parse(trimmed);
      if (parsed.data_request) return parsed.data_request;
    } catch (_) {}
  }
  var m = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?"data_request"[\s\S]*?\})\s*```/);
  if (m) {
    try {
      var parsed2 = JSON.parse(m[1]);
      if (parsed2.data_request) return parsed2.data_request;
    } catch (_) {}
  }
  return null;
}

function _fetchRequestedData(request) {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var txSheet = ss.getSheetByName(TRANSACTIONS_SHEET);
  if (!txSheet) return [];

  var monthsBack = Math.min(Number(request.months_back) || 3, 12);
  var limit      = Math.min(Number(request.limit) || 50, 100);

  var cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsBack);

  var allTx = sheetToObjects(txSheet);
  var filtered = allTx.filter(function(tx) {
    var d = new Date(tx.transaction_date_utc);
    if (isNaN(d.getTime()) || d < cutoff) return false;
    if (request.transaction_type && tx.transaction_type !== request.transaction_type) return false;
    if (request.major_category   && tx.major_category   !== request.major_category)  return false;
    if (request.minor_category   && tx.minor_category   !== request.minor_category)  return false;
    if (request.account_id && tx.source_account_id !== request.account_id && tx.destination_account_id !== request.account_id) return false;
    return true;
  });

  filtered.sort(function(a, b) { return new Date(b.transaction_date_utc) - new Date(a.transaction_date_utc); });

  return filtered.slice(0, limit).map(function(tx) {
    return {
      date:         tx.transaction_date_utc,
      type:         tx.transaction_type,
      amount:       tx.amount,
      currency:     tx.currency,
      major:        tx.major_category,
      minor:        tx.minor_category,
      counterparty: tx.counterparty_name,
      notes:        tx.notes
    };
  });
}
