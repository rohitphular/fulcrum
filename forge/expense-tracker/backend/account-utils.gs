// =============================================================================
// FULCRUM FORGE — Account Utils: stateless helpers
// No sheet I/O. All functions are pure computations.
// =============================================================================

function generateAccountId(sheet) {
  var now     = new Date();
  var year    = now.getUTCFullYear();
  var month   = String(now.getUTCMonth() + 1).padStart(2, '0');
  var day     = String(now.getUTCDate()).padStart(2, '0');
  var dateStr = year + '' + month + '' + day;
  var prefix  = 'ACC-' + dateStr + '-';
  var values  = sheet.getDataRange().getValues();
  var max     = 0;
  for (var i = 1; i < values.length; i++) {
    var id = String(values[i][0]);
    if (id.indexOf(prefix) === 0) {
      var n = parseInt(id.slice(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return prefix + String(max + 1).padStart(3, '0');
}

// Derives next payment date from first repayment date — not stored in sheet
function calculateNextPaymentDate(firstRepaymentDateStr) {
  if (!firstRepaymentDateStr) return null;
  var first = new Date(firstRepaymentDateStr);
  if (isNaN(first.getTime())) return null;
  var today     = new Date();
  var candidate = new Date(first);
  while (candidate <= today) {
    candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  }
  return candidate.toISOString().slice(0, 10);
}

// Loan repayment progress % — for progress bar
// Returns null when original amount is unknown or zero
function calculateLoanRepaymentPct(originalAmount, currentBalance) {
  var orig = Number(originalAmount) || 0;
  if (orig <= 0) return null;
  var remaining = Math.abs(Number(currentBalance) || 0);
  var repaid    = orig - remaining;
  return Math.max(0, Math.min(100, Math.round(repaid / orig * 1000) / 10));
}

// Credit card / overdraft utilisation % — for progress bar
// Returns null when limit is unknown or zero
function calculateUtilisationPct(limit, currentBalance) {
  var lim = Number(limit) || 0;
  if (lim <= 0) return null;
  return Math.max(0, Math.min(100, Math.round(Math.abs(Number(currentBalance) || 0) / lim * 1000) / 10));
}
