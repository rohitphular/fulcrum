import { ExpenseAPI } from './api.js';

const ACCT_CACHE_KEY = 'et_account_schema_v1';
const TX_CACHE_KEY   = 'et_transaction_schema_v1';

export async function loadAccountSchema() {
  const cached = localStorage.getItem(ACCT_CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (_) {}
  }
  const res = await ExpenseAPI.getAccountSchema();
  if (res.ok && res.data) {
    localStorage.setItem(ACCT_CACHE_KEY, JSON.stringify(res.data));
    return res.data;
  }
  return null;
}

export async function loadTransactionSchema() {
  const cached = localStorage.getItem(TX_CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (_) {}
  }
  const res = await ExpenseAPI.getTransactionSchema();
  if (res.ok && res.data) {
    localStorage.setItem(TX_CACHE_KEY, JSON.stringify(res.data));
    return res.data;
  }
  return null;
}
