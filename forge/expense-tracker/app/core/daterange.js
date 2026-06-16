import { state } from './state.js';
import { parseLocalDate } from './utils.js';

export function getRangeBounds() {
  const now   = new Date();
  const y     = now.getFullYear();
  const m     = now.getMonth();
  const today = new Date(y, m, now.getDate());

  switch (state.dateRange) {
    case 'this_month':  return { from: new Date(y, m, 1),    to: today };
    case 'last_month':  return { from: new Date(y, m-1, 1),  to: new Date(y, m, 0) };
    case 'last_3':      return { from: new Date(y, m-2, 1),  to: today };
    case 'last_6':      return { from: new Date(y, m-5, 1),  to: today };
    case 'last_12':     return { from: new Date(y, m-11, 1), to: today };
    case 'ytd':         return { from: new Date(y, 0, 1),    to: today };
    case 'all':         return { from: new Date(2000, 0, 1), to: today };
    case 'custom': {
      const from = state.customFrom ? parseLocalDate(state.customFrom) : new Date(2000, 0, 1);
      const to   = state.customTo   ? parseLocalDate(state.customTo)   : today;
      return { from: isNaN(from) ? new Date(2000, 0, 1) : from, to: isNaN(to) ? today : to };
    }
    default: return { from: new Date(y, m, 1), to: today };
  }
}

export function txInRange(tx) {
  const { from, to } = getRangeBounds();
  const d = parseLocalDate(String(tx.date).slice(0, 10));
  if (isNaN(d)) return true;
  return d >= from && d <= to;
}

export function filteredTx() {
  const f = state.filters;
  return state.transactions.filter(tx => {
    if (!txInRange(tx)) return false;
    if (f.types.length    && !f.types.includes(tx.transaction_type))                          return false;
    if (f.accounts.length && !f.accounts.includes(tx.from_account))                           return false;
    if (f.major.length    && !f.major.includes(tx.major_category))                            return false;
    if (f.minor.length    && !f.minor.includes(tx.minor_category))                            return false;
    if (f.country && !String(tx.country || '').toLowerCase().includes(f.country.toLowerCase())) return false;
    if (f.method  && tx.payment_method !== f.method)                                           return false;
    if (f.tag) {
      const tags = String(tx.tags || '').split(';').map(t => t.trim().toLowerCase());
      if (!tags.some(t => t.includes(f.tag.toLowerCase()))) return false;
    }
    if (f.search) {
      const q           = f.search.toLowerCase();
      const accountName = state.accountMap[tx.from_account]?.name || '';
      const hay         = [tx.counterparty, tx.notes, accountName].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
