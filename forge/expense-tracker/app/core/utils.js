import {
  el, esc, fmtDate, fmtDateTime, parseLocalDate, toDateInputVal, todayISO, nowLocalISO,
  getSymbol as _getSymbol,
  toBase    as _toBase,
  fmtBase   as _fmtBase,
  fmtNative as _fmtNative,
  exportData as _exportData,
} from '../../../_shared/utils.js';
import { state } from './state.js';

export { el, esc, fmtDate, fmtDateTime, parseLocalDate, toDateInputVal, todayISO, nowLocalISO };

export function fmtDateTimeCompact(v) {
  if (!v) return '—';
  try {
    const d = new Date(String(v));
    if (isNaN(d)) return String(v).slice(0, 16) || '—';
    const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${date} · ${time}`;
  } catch (_) { return '—'; }
}

export const getSymbol  = currency                  => _getSymbol(currency, state.rates);
export const toBase     = (amount, from, rowFxRate) => _toBase(amount, from, rowFxRate, state.rateMap, state.quoteCurrency);
export const fmtBase    = (amount, from, rowFxRate) => _fmtBase(amount, from, rowFxRate, state.rateMap, state.quoteCurrency, state.rates);
export const fmtNative  = (amount, currency)        => _fmtNative(amount, currency, state.rates);

const ET_COLS = ['id', 'transaction_date_utc', 'transaction_type', 'amount', 'currency',
  'from_account', 'to_account', 'major_category', 'minor_category',
  'counterparty', 'notes', 'tags', 'transfer_id', 'fx_rate', 'country', 'payment_method'];
export const exportData = (format, rows)            => _exportData(format, rows, 'expenses', ET_COLS);
