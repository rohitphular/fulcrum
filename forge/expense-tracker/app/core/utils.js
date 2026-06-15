import { state } from './state.js';

export const el = id => document.getElementById(id);

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

export function fmtDate(v) {
  if (!v) return '—';
  try {
    const d = v instanceof Date ? v : parseLocalDate(String(v).slice(0, 10));
    if (isNaN(d)) return String(v).slice(0, 10) || '—';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) { return '—'; }
}

export function parseLocalDate(s) {
  if (!s) return new Date(NaN);
  const parts = String(s).slice(0, 10).split('-').map(Number);
  return parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(NaN);
}

export function toDateInputVal(v) {
  if (!v) return '';
  const s = String(v).trim();
  return s.length >= 10 ? s.slice(0, 10) : '';
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function getSymbol(currency) {
  const r = state.rates.find(r => r.currency === currency);
  return r ? String(r.symbol || '') : (currency ? currency + ' ' : '');
}

export function toBase(amount, fromCurrency, rowFxRate) {
  const amt = parseFloat(amount) || 0;
  const to  = state.rateMap[state.quoteCurrency];
  if (!to) return amt;
  if (rowFxRate && parseFloat(rowFxRate) > 0) {
    return (amt / parseFloat(rowFxRate)) * to;
  }
  const from = state.rateMap[fromCurrency];
  if (!from) return amt;
  return (amt / from) * to;
}

export function fmtBase(amount, fromCurrency, rowFxRate) {
  const val = toBase(amount, fromCurrency, rowFxRate);
  const sym = getSymbol(state.quoteCurrency);
  return sym + val.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtNative(amount, currency) {
  const sym = getSymbol(currency);
  const val = parseFloat(amount) || 0;
  return sym + val.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function exportData(format, rows) {
  if (format === 'json') {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    download(blob, `expenses-${todayISO()}.json`);
  } else {
    const cols = ['id','date','transaction_type','amount','currency','account','major_category','minor_category','counterparty','notes','tags','transfer_id','fx_rate','country','payment_method'];
    const lines = [cols.join(','), ...rows.map(tx =>
      cols.map(c => '"' + String(tx[c] ?? '').replace(/"/g, '""') + '"').join(',')
    )];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    download(blob, `expenses-${todayISO()}.csv`);
  }
}

function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
