import {
  el, esc, fmtDate, parseLocalDate, toDateInputVal, todayISO,
  fmtAmount as _fmtAmount,
  toQuote   as _toQuote,
} from '../../../_shared/utils.js';
import { state, CURRENCY_SYMBOLS } from './state.js';

export { el, esc, fmtDate, parseLocalDate, toDateInputVal, todayISO };

export const fmtAmount = (amount, currency) => _fmtAmount(amount, currency, CURRENCY_SYMBOLS);
export const toQuote   = (amount, currency) => _toQuote(amount, currency, state.rateMap, state.quoteCurrency);

export function fmtPayDate(s) { return fmtDate(s); }
