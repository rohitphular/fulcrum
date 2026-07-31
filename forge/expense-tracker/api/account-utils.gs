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
