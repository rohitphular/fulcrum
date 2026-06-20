// =============================================================================
// FULCRUM FORGE — Category Utils
// =============================================================================

function normaliseKeywords(keywords) {
  if (!keywords) return '';
  return String(keywords).split(',').map(function(k) { return k.trim().toLowerCase(); }).filter(Boolean).join(', ');
}

function normaliseCandidates(str) {
  if (!str) return '';
  return String(str).split(',').map(function(k) { return k.trim(); }).filter(Boolean).join(', ');
}

// Filters to only valid account type values; normalises lowercase.
function normaliseAccountTypes(str) {
  if (!str) return '';
  var valid = new Set(VALID_ACCOUNT_TYPES);
  return String(str).split(',')
    .map(function(k) { return k.trim().toLowerCase(); })
    .filter(function(k) { return valid.has(k); })
    .join(', ');
}
