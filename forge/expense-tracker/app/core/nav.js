import { state } from './state.js';
import { el, closeContextMenu } from './utils.js';
import { renderInsights } from '../sections/insights.js';
import { renderTransactions } from '../sections/transactions.js';
import { renderAccounts } from '../sections/accounts.js';
import { renderCategories } from '../sections/categories.js';
import { renderRates } from '../sections/rates.js';
import { renderAdvisor } from '../sections/advisor.js';
import { renderSubscriptions } from '../sections/subscriptions.js';

const SECTIONS = ['insight', 'accounts', 'transactions', 'subscriptions', 'categories', 'rates', 'advisor'];

document.addEventListener('et:show-section', e => showSection(e.detail));

export function showSection(id) {
  if (!SECTIONS.includes(id)) id = 'insight';
  closeContextMenu();
  SECTIONS.forEach(s => el(s).classList.toggle('hidden', s !== id));
  el('tabNav').querySelectorAll('.tab-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.section === id)
  );
  el('dateRangeBar').style.display = id === 'transactions' ? '' : 'none';
  sessionStorage.setItem('et_section', id);

  if (id === 'insight')       renderInsights();
  if (id === 'transactions')  renderTransactions();
  if (id === 'accounts')      renderAccounts();
  if (id === 'categories')    renderCategories();
  if (id === 'rates')         renderRates();
  if (id === 'advisor')       renderAdvisor();
  if (id === 'subscriptions') renderSubscriptions();
}
