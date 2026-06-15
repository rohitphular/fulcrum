import { state, CURRENCY_SYMBOLS } from './state.js';

export const el = id => document.getElementById(id);

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

export function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) { return '—'; }
}

export function fmtAmount(amount, currency) {
  const num = parseFloat(amount) || 0;
  const sym = CURRENCY_SYMBOLS[currency] ?? (currency + ' ');
  return sym + num.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function toQuote(amount, fromCurrency) {
  const from = state.rateMap[fromCurrency];
  const to   = state.rateMap[state.quoteCurrency];
  if (!from || !to) return parseFloat(amount) || 0;
  return ((parseFloat(amount) || 0) / from) * to;
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
  return new Date().toISOString().slice(0, 10);
}

export function fmtPayDate(s) {
  if (!s) return '—';
  try {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) { return s || '—'; }
}
