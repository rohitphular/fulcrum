import { state } from './state.js';
import { el } from './utils.js';
import { renderDashboard } from './dashboard.js';
import { renderTransactions } from './transactions.js';
import { renderAccounts } from './accounts.js';
import { renderCategories } from './categories.js';
import { renderRates } from './rates.js';

const SECTIONS = ['dashboard', 'transactions', 'accounts', 'categories', 'rates'];

export function showSection(id) {
  if (!SECTIONS.includes(id)) id = 'dashboard';
  SECTIONS.forEach(s => el(s).classList.toggle('hidden', s !== id));
  el('tabNav').querySelectorAll('.tab-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.section === id)
  );
  el('dateRangeBar').style.display = id === 'dashboard' ? '' : 'none';
  sessionStorage.setItem('et_section', id);

  if (id === 'dashboard')    renderDashboard();
  if (id === 'transactions') renderTransactions();
  if (id === 'accounts')     renderAccounts();
  if (id === 'categories')   renderCategories();
  if (id === 'rates')        renderRates();
}
