import { ExpenseAPI } from './api.js';

const CACHE_KEY = 'et_account_schema_v1';

export async function loadAccountSchema() {
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (_) {}
  }
  const res = await ExpenseAPI.getAccountSchema();
  if (res.ok && res.data) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(res.data));
    return res.data;
  }
  return null;
}
