/* global SheetsClient */
import { state } from './state.js';
import { ExpenseAPI } from './api.js';
import { el, esc } from './utils.js';
import { showLoading, hideLoading, showMsg } from './ui.js';
import { showSection } from './nav.js';
import { renderDashboard } from './dashboard.js';
import { renderTransactions } from './transactions.js';
import { showPinGate, hidePinGate, fetchGeo, submitPin } from './auth.js';

// ── Quote currency ────────────────────────────────────────────────────────────

function populateQuoteCurrencySelect() {
  const sel   = el('quoteCurrencySelect');
  const saved = localStorage.getItem('et_quote_currency') || 'GBP';
  sel.innerHTML = state.rates.map(r =>
    `<option value="${esc(r.currency)}" ${r.currency === saved ? 'selected' : ''}>${esc(r.symbol || '')} ${esc(r.currency)}</option>`
  ).join('');
  state.quoteCurrency = sel.value || 'GBP';
}

// ── Theme ─────────────────────────────────────────────────────────────────────

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('et_theme', theme);
  const btn = el('themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀' : '☽';
  if (state.transactions.length) renderDashboard();
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadAll() {
  showLoading();
  try {
    const [txRes, catRes, accRes, ratesRes] = await Promise.all([
      ExpenseAPI.listTransactions(),
      ExpenseAPI.listCategories(),
      ExpenseAPI.listAccounts(),
      ExpenseAPI.listRates(),
    ]);

    if (!txRes.ok) {
      if (txRes.error === 'auth' || txRes.error === 'locked') {
        sessionStorage.removeItem('et_pin'); showPinGate(); return;
      }
      showMsg('Failed to load transactions: ' + (txRes.error || 'unknown'), 'warn');
    } else {
      state.transactions = txRes.data || [];
      sessionStorage.setItem('et_transactions_cache', JSON.stringify(state.transactions));
    }

    if (catRes.ok)   state.categories = catRes.data || [];
    if (accRes.ok)   state.accounts   = accRes.data || [];
    if (ratesRes.ok) {
      state.rates   = ratesRes.data || [];
      state.rateMap = {};
      state.rates.forEach(r => { state.rateMap[r.currency] = Number(r.rate) || 1; });
    }

    populateQuoteCurrencySelect();
    showSection(sessionStorage.getItem('et_section') || 'dashboard');

  } catch (_) {
    showMsg('Connection error — check your internet and reload.', 'warn');
  } finally {
    hideLoading();
  }
}

// ── Initialisation ────────────────────────────────────────────────────────────

async function init() {
  // Theme
  const savedTheme  = localStorage.getItem('et_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(savedTheme || (prefersDark ? 'dark' : 'light'));

  el('themeToggle')?.addEventListener('click', () => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  // Tab nav
  el('tabNav')?.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (btn) showSection(btn.dataset.section);
  });

  // Date range buttons
  el('dateRangeBar')?.querySelectorAll('.range-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.range === state.dateRange);
    btn.addEventListener('click', () => {
      state.dateRange = btn.dataset.range;
      el('customDates').classList.toggle('hidden', state.dateRange !== 'custom');
      el('dateRangeBar').querySelectorAll('.range-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.range === state.dateRange)
      );
      if (state.transactions.length) renderDashboard();
    });
  });

  el('customFrom')?.addEventListener('change', e => { state.customFrom = e.target.value; if (state.transactions.length) renderDashboard(); });
  el('customTo')?.addEventListener('change',   e => { state.customTo   = e.target.value; if (state.transactions.length) renderDashboard(); });

  const savedRange = sessionStorage.getItem('et_date_range');
  if (savedRange) {
    state.dateRange = savedRange;
    el('dateRangeBar')?.querySelectorAll('.range-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.range === state.dateRange)
    );
  }

  // Quote currency change
  el('quoteCurrencySelect')?.addEventListener('change', e => {
    state.quoteCurrency = e.target.value;
    localStorage.setItem('et_quote_currency', state.quoteCurrency);
    const active = sessionStorage.getItem('et_section') || 'dashboard';
    if (active === 'dashboard')    renderDashboard();
    if (active === 'transactions') renderTransactions();
  });

  // Reload event — fired by saveTransaction and submitPin instead of calling loadAll directly
  document.addEventListener('et:reload', loadAll);

  // Config check
  if (window.__configMissing) {
    el('setupBanner').classList.remove('hidden');
    return;
  }

  // PIN gate
  const savedPin = sessionStorage.getItem('et_pin');
  if (savedPin) {
    const meta = await fetchGeo();
    SheetsClient.init({ scriptUrl: window.CONFIG.SCRIPT_URL, pin: savedPin, meta });

    const cached = sessionStorage.getItem('et_transactions_cache');
    if (cached) { try { state.transactions = JSON.parse(cached); } catch (_) {} }

    await loadAll();
  } else {
    showPinGate();
  }

  // PIN form
  el('pinSubmit')?.addEventListener('click', submitPin);
  el('totpInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') submitPin(); });
  el('pinInput')?.addEventListener('keydown',  e => { if (e.key === 'Enter') el('totpInput').focus(); });
}

document.addEventListener('DOMContentLoaded', init);
