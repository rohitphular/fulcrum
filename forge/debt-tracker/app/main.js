import { state, setQuoteCurrency } from './core/state.js';
import { el } from './core/utils.js';
import { showLoading, hideLoading, showMsg } from './core/ui.js';
import { showPinGate, submitPin } from './core/auth.js';
import { showSection } from './core/nav.js';
import { DebtAPI } from './core/api.js';
import { renderDashboard } from './sections/dashboard.js';
import { renderDebts } from './sections/debts.js';
import { renderPayments } from './sections/payments.js';
import { renderRates } from './sections/rates.js';
import { renderProjector } from './sections/projector.js';

function renderAll() {
  renderDashboard();
  renderDebts();
  renderPayments();
  renderRates();
  renderProjector();
}

async function loadAll() {
  showLoading();
  try {
    const [debtsRes, ratesRes, paymentsRes] = await Promise.all([
      DebtAPI.listDebts(), DebtAPI.listRates(), DebtAPI.listPayments()
    ]);

    if (!debtsRes.ok) {
      if (debtsRes.error === 'auth' || debtsRes.error === 'locked') {
        sessionStorage.removeItem('dt_pin');
        showPinGate();
        return;
      }
      showMsg('Failed to load debts: ' + (debtsRes.error || 'unknown'), 'warn');
    } else {
      state.debts = debtsRes.data || [];
    }

    if (!ratesRes.ok) {
      showMsg('Failed to load rates: ' + (ratesRes.error || 'unknown'), 'warn');
    } else {
      state.rates = ratesRes.data || [];
      state.rateMap = {};
      state.rates.forEach(r => { state.rateMap[r.currency] = parseFloat(r.rate) || 1; });
    }

    if (!paymentsRes.ok) {
      showMsg('Failed to load payments: ' + (paymentsRes.error || 'unknown'), 'warn');
    } else {
      state.payments = paymentsRes.data || [];
    }

    renderAll();
  } catch (_) {
    showMsg('Network error loading data. Try refreshing.', 'warn');
  } finally {
    hideLoading();
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('dt_theme', theme);
  const btn = el('themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀' : '☽';
  if (state.debts.length || state.payments.length) renderDashboard();
}

// Cross-module events: sections dispatch these instead of importing loadAll/showSection
document.addEventListener('dt:reload',       loadAll);
document.addEventListener('dt:render-all',   renderAll);
document.addEventListener('dt:show-section', e => showSection(e.detail));

el('themeToggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  setTheme(current === 'dark' ? 'light' : 'dark');
});

el('quoteCurrencySelect').addEventListener('change', e => setQuoteCurrency(e.target.value));

el('tabNav').addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if (btn) showSection(btn.dataset.section);
});

el('pinSubmit').addEventListener('click', submitPin);
el('pinInput').addEventListener('keydown',  e => { if (e.key === 'Enter') { e.preventDefault(); el('totpInput').focus(); } });
el('totpInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitPin(); });

(function init() {
  if (window.__configMissing || !window.CONFIG?.SCRIPT_URL) {
    el('setupBanner').classList.remove('hidden');
    el('pinOverlay').classList.add('hidden');
    return;
  }

  const savedTheme = localStorage.getItem('dt_theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(savedTheme);

  const savedQuote = localStorage.getItem('dt_quote_currency');
  if (savedQuote && ['GBP', 'INR', 'USD', 'EUR', 'AED'].includes(savedQuote)) {
    state.quoteCurrency = savedQuote;
  }
  el('quoteCurrencySelect').value = state.quoteCurrency;

  const section = sessionStorage.getItem('dt_section') || 'dashboard';
  showSection(section);

  const pin = sessionStorage.getItem('dt_pin');
  if (pin) {
    SheetsClient.init({ scriptUrl: window.CONFIG.SCRIPT_URL, pin });
    loadAll();
  } else {
    showPinGate();
  }
})();
