'use strict';

// ── API wrapper ───────────────────────────────────────────────────────────────
const ExpenseAPI = {
  verify:            totp => SheetsClient.get({ action: 'verify', totp }),
  listTransactions:  ()   => SheetsClient.get({ action: 'list_transactions' }),
  listCategories:    ()   => SheetsClient.get({ action: 'list_categories' }),
  listAccounts:      ()   => SheetsClient.get({ action: 'list_accounts' }),
  listRates:         ()   => SheetsClient.get({ action: 'list_rates' }),
  createTransaction: f    => SheetsClient.post({ action: 'create_transaction', ...f }),
  upsertRate:        f    => SheetsClient.post({ action: 'upsert_rate', ...f }),
  createCategory:    f    => SheetsClient.post({ action: 'create_category', ...f }),
  updateCategory:    f    => SheetsClient.post({ action: 'update_category', ...f }),
  deleteCategory:    f    => SheetsClient.post({ action: 'delete_category', ...f }),
};

// ── App state ─────────────────────────────────────────────────────────────────
const state = {
  transactions:  [],
  categories:    [],
  accounts:      [],
  rates:         [],
  rateMap:       {},   // { GBP: 1, INR: 105, ... }  units per 1 GBP
  quoteCurrency: 'GBP',

  // Date range
  dateRange:  'this_month',
  customFrom: '',
  customTo:   '',

  // Filters (transactions tab)
  filters: {
    types:    [],
    accounts: [],
    major:    [],
    minor:    [],
    country:  '',
    method:   '',
    tag:      '',
    search:   '',
  },

  // Transactions table state
  txSort:    { col: 'date', dir: 'desc' },
  txPage:    1,
  txPerPage: 50,

  // Charts
  charts:        {},     // keyed by canvas id
  catDrillMajor: null,   // currently drilled major category

  // Categories CRUD state
  catFilter:    'all',   // 'all' | 'money-in' | 'money-out' | 'money-transfer'
  catAddOpen:   false,
  catEditRow:   null,    // _row being inline-edited
  catDeleteRow: null,    // _row pending delete confirm
};

// ── Tiny helpers ──────────────────────────────────────────────────────────────
const el = id => document.getElementById(id);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function fmtDate(v) {
  if (!v) return '—';
  try {
    const d = v instanceof Date ? v : parseLocalDate(String(v).slice(0, 10));
    if (isNaN(d)) return String(v).slice(0, 10) || '—';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) { return '—'; }
}

function parseLocalDate(s) {
  if (!s) return new Date(NaN);
  const parts = String(s).slice(0, 10).split('-').map(Number);
  return parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(NaN);
}

function toDateInputVal(v) {
  if (!v) return '';
  const s = String(v).trim();
  return s.length >= 10 ? s.slice(0, 10) : '';
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getSymbol(currency) {
  const r = state.rateMap && state.rates.find(r => r.currency === currency);
  return r ? String(r.symbol || '') : (currency ? currency + ' ' : '');
}

function toBase(amount, fromCurrency, rowFxRate) {
  const amt = parseFloat(amount) || 0;
  const to  = state.rateMap[state.quoteCurrency];
  if (!to) return amt;
  if (rowFxRate && parseFloat(rowFxRate) > 0) {
    // row-level rate: fromCurrency units per 1 GBP
    const fromRate = parseFloat(rowFxRate);
    return (amt / fromRate) * to;
  }
  const from = state.rateMap[fromCurrency];
  if (!from) return amt;
  return (amt / from) * to;
}

function fmtBase(amount, fromCurrency, rowFxRate) {
  const val  = toBase(amount, fromCurrency, rowFxRate);
  const sym  = getSymbol(state.quoteCurrency);
  return sym + val.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNative(amount, currency) {
  const sym = getSymbol(currency);
  const val = parseFloat(amount) || 0;
  return sym + val.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Date-range helpers ────────────────────────────────────────────────────────
function getRangeBounds() {
  const now   = new Date();
  const y     = now.getFullYear();
  const m     = now.getMonth();
  const today = new Date(y, m, now.getDate());

  switch (state.dateRange) {
    case 'this_month':  return { from: new Date(y, m, 1),   to: today };
    case 'last_month':  return { from: new Date(y, m-1, 1), to: new Date(y, m, 0) };
    case 'last_3':      return { from: new Date(y, m-2, 1), to: today };
    case 'last_6':      return { from: new Date(y, m-5, 1), to: today };
    case 'last_12':     return { from: new Date(y, m-11, 1), to: today };
    case 'ytd':         return { from: new Date(y, 0, 1),   to: today };
    case 'all':         return { from: new Date(2000, 0, 1), to: today };
    case 'custom': {
      const from = state.customFrom ? parseLocalDate(state.customFrom) : new Date(2000, 0, 1);
      const to   = state.customTo   ? parseLocalDate(state.customTo)   : today;
      return { from: isNaN(from) ? new Date(2000, 0, 1) : from, to: isNaN(to) ? today : to };
    }
    default: return { from: new Date(y, m, 1), to: today };
  }
}

function txInRange(tx) {
  const { from, to } = getRangeBounds();
  const d = parseLocalDate(String(tx.date).slice(0, 10));
  if (isNaN(d)) return true;
  return d >= from && d <= to;
}

// ── Filtered transactions (range + filter bar) ─────────────────────────────
function filteredTx() {
  const f = state.filters;
  return state.transactions.filter(tx => {
    if (!txInRange(tx)) return false;

    // types filter
    if (f.types.length && !f.types.includes(tx.transaction_type)) return false;

    // account filter
    if (f.accounts.length && !f.accounts.includes(tx.account)) return false;

    // category
    if (f.major.length && !f.major.includes(tx.major_category)) return false;
    if (f.minor.length && !f.minor.includes(tx.minor_category)) return false;

    // country
    if (f.country && !String(tx.country || '').toLowerCase().includes(f.country.toLowerCase())) return false;

    // method
    if (f.method && tx.payment_method !== f.method) return false;

    // tag
    if (f.tag) {
      const tags = String(tx.tags || '').split(';').map(t => t.trim().toLowerCase());
      if (!tags.some(t => t.includes(f.tag.toLowerCase()))) return false;
    }

    // search
    if (f.search) {
      const q = f.search.toLowerCase();
      const hay = [tx.counterparty, tx.notes, tx.account].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}

// ── Loading / banner ──────────────────────────────────────────────────────────
function showLoading() { el('loadingBar').classList.remove('hidden'); }
function hideLoading() { el('loadingBar').classList.add('hidden');    }

function showMsg(text, type = 'success') {
  const b = el('msgBanner');
  el('msgText').innerHTML = text;
  el('msgIco').textContent = type === 'warn' ? '!' : '›';
  b.className = `banner ${type === 'warn' ? 'warn' : 'success'}`;
  clearTimeout(showMsg._t);
  showMsg._t = setTimeout(() => b.classList.add('hidden'), 4500);
}

// ── Theme ─────────────────────────────────────────────────────────────────────
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('et_theme', theme);
  const btn = el('themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀' : '☽';
  // Recreate charts with correct palette
  if (state.transactions.length) renderDashboard();
}

// ── Navigation ────────────────────────────────────────────────────────────────
const SECTIONS = ['dashboard', 'transactions', 'accounts', 'categories', 'rates'];

function showSection(id) {
  if (!SECTIONS.includes(id)) id = 'dashboard';
  SECTIONS.forEach(s => {
    el(s).classList.toggle('hidden', s !== id);
  });
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

// ── Auth ──────────────────────────────────────────────────────────────────────
function showPinGate() {
  el('pinOverlay').classList.remove('hidden');
  el('appShell').classList.add('hidden');
  el('pinInput').focus();
}
function hidePinGate() {
  el('pinOverlay').classList.add('hidden');
  el('appShell').classList.remove('hidden');
}

function pinError(msg) {
  el('pinError').textContent = msg;
  const inp = el('pinInput');
  inp.classList.add('shake');
  inp.addEventListener('animationend', () => inp.classList.remove('shake'), { once: true });
}

async function fetchGeo() {
  try {
    const d = await fetch('https://ipapi.co/json/').then(r => r.json());
    return { ip: d.ip || 'unknown', city: d.city || '', country: d.country_name || '', ua: navigator.userAgent };
  } catch (_) {
    return { ip: 'unknown', city: '', country: '', ua: navigator.userAgent };
  }
}

async function submitPin() {
  const pin  = el('pinInput').value.trim();
  const totp = el('totpInput').value.trim();

  if (!pin)                   { pinError('Enter your PIN.');                el('pinInput').focus();  return; }
  if (!totp)                  { pinError('Enter your authenticator code.'); el('totpInput').focus(); return; }
  if (!/^\d{6}$/.test(totp)) { pinError('Code must be 6 digits.');         el('totpInput').focus(); return; }

  el('pinSubmit').disabled = true;
  el('pinError').textContent = 'Connecting…';

  const meta = await fetchGeo();
  SheetsClient.init({ scriptUrl: window.CONFIG.SCRIPT_URL, pin, meta });

  try {
    const res = await ExpenseAPI.verify(totp);
    if (res.ok) {
      sessionStorage.setItem('et_pin', pin);
      hidePinGate();
      await loadAll();
    } else if (res.error === 'locked') {
      pinError('Access locked. Contact admin to unlock.');
      el('pinSubmit').disabled = false;
    } else if (res.error === 'totp_invalid') {
      pinError('Wrong authenticator code. Try again.');
      el('totpInput').value = '';
      el('totpInput').focus();
      el('pinSubmit').disabled = false;
    } else {
      pinError('Wrong PIN. Try again.');
      el('pinInput').value = '';
      el('pinInput').focus();
      el('pinSubmit').disabled = false;
    }
  } catch (_) {
    pinError('Connection failed. Check the Script URL in config.js.');
    el('pinSubmit').disabled = false;
  }
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
    const savedSection = sessionStorage.getItem('et_section') || 'dashboard';
    showSection(savedSection);

  } catch (_) {
    showMsg('Connection error — check your internet and reload.', 'warn');
  } finally {
    hideLoading();
  }
}

// ── Quote currency ────────────────────────────────────────────────────────────
function populateQuoteCurrencySelect() {
  const sel = el('quoteCurrencySelect');
  const saved = localStorage.getItem('et_quote_currency') || 'GBP';
  sel.innerHTML = state.rates.map(r =>
    `<option value="${esc(r.currency)}" ${r.currency === saved ? 'selected' : ''}>${esc(r.symbol || '')} ${esc(r.currency)}</option>`
  ).join('');
  state.quoteCurrency = sel.value || 'GBP';
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function destroyAllCharts() {
  Object.values(state.charts).forEach(c => { try { c.destroy(); } catch (_) {} });
  state.charts = {};
}

function renderDashboard() {
  destroyAllCharts();
  const filtered = filteredTx();
  const income   = filtered.filter(tx => tx.transaction_type === 'money-in' && !tx.transfer_id);
  const expenses = filtered.filter(tx => tx.transaction_type === 'money-out' && !tx.transfer_id);
  const transfers= filtered.filter(tx => tx.transfer_id);

  const totalIncome   = income.reduce((s, tx) => s + toBase(tx.amount, tx.currency, tx.fx_rate), 0);
  const totalExpenses = expenses.reduce((s, tx) => s + toBase(tx.amount, tx.currency, tx.fx_rate), 0);
  const net           = totalIncome - totalExpenses;
  const savingsRate   = totalIncome > 0 ? (net / totalIncome * 100) : 0;
  const sym           = getSymbol(state.quoteCurrency);

  const fmt = v => sym + Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  el('dashboardContent').innerHTML = `
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-card-label">Income</div>
        <div class="summary-card-value positive">${fmt(totalIncome)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Expenses</div>
        <div class="summary-card-value negative">${fmt(totalExpenses)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Net</div>
        <div class="summary-card-value ${net >= 0 ? 'positive' : 'negative'}">${net < 0 ? '−' : ''}${fmt(net)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Savings rate</div>
        <div class="summary-card-value ${savingsRate >= 0 ? 'positive' : 'negative'}">${savingsRate.toFixed(1)}%</div>
      </div>
    </div>
    ${transfers.length ? `<div class="transfer-row">
      <span>Transfers: <strong>${transfers.length}</strong> rows</span>
      <span>Volume: <strong>${fmt(transfers.reduce((s,tx) => s + toBase(tx.amount, tx.currency, tx.fx_rate), 0))}</strong></span>
    </div>` : ''}

    <div class="chart-wrap">
      <div class="chart-title">Income vs Expenses by month</div>
      <div class="chart-container"><canvas id="monthlyChart"></canvas></div>
    </div>

    <div class="chart-wrap">
      <div class="chart-title" id="catChartTitle">Spend by major category</div>
      <div id="catChartBackWrap"></div>
      <div class="chart-container"><canvas id="catChart"></canvas></div>
    </div>

    <div class="chart-wrap">
      <div class="chart-title">Spend by account</div>
      <div class="chart-container"><canvas id="accountChart"></canvas></div>
    </div>
  `;

  renderMonthlyChart(income, expenses);
  renderCategoryChart(expenses);
  renderAccountChart(filtered);
}

function chartColors() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    teal:      isDark ? '#26C0B0' : '#0F9D8C',
    ember:     isDark ? '#F07055' : '#DC5B3B',
    tealFill:  isDark ? 'rgba(38,192,176,0.15)' : 'rgba(15,157,140,0.15)',
    emberFill: isDark ? 'rgba(240,112,85,0.15)' : 'rgba(220,91,59,0.15)',
    grid:      isDark ? '#21262D' : '#DCE2EA',
    tick:      isDark ? '#8B96A8' : '#6B7787',
    tooltipBg: isDark ? '#161B22' : '#ffffff',
    tooltipFg: isDark ? '#E2E8F0' : '#16202C',
    muted:     isDark ? '#30363D' : '#DCE2EA',
  };
}

function baseChartOpts(sym) {
  const c    = chartColors();
  const mono = "'IBM Plex Mono', monospace";
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: c.tooltipBg,
        borderColor: c.grid, borderWidth: 1,
        titleColor: c.tick, bodyColor: c.tooltipFg,
        titleFont: { family: mono, size: 10 },
        bodyFont:  { family: mono, size: 12 },
      },
    },
    scales: {
      x: {
        ticks: { color: c.tick, font: { family: mono, size: 9 }, maxRotation: 45, maxTicksLimit: 12 },
        grid:  { color: c.grid }, border: { display: false },
      },
      y: {
        ticks: {
          color: c.tick, font: { family: mono, size: 9 }, maxTicksLimit: 5,
          callback: v => sym + (v >= 1000 ? Math.round(v/1000)+'k' : Math.round(v)),
        },
        grid:  { color: c.grid }, border: { display: false },
      },
    },
  };
}

function renderMonthlyChart(income, expenses) {
  const sym  = getSymbol(state.quoteCurrency);
  const c    = chartColors();

  // Build monthly buckets for the last 24 months
  const { from } = getRangeBounds();
  const today = new Date();
  const months = [];
  const cursor = new Date(Math.max(from.getFullYear(), today.getFullYear() - 2), 0, 1);
  cursor.setFullYear(Math.max(from.getFullYear(), today.getFullYear() - 2));
  cursor.setMonth(Math.max(from.getMonth(), cursor.getMonth()));
  const start = new Date(from.getFullYear(), from.getMonth(), 1);

  const c2 = new Date(start);
  while (c2.getTime() <= today.getTime()) {
    months.push(new Date(c2));
    c2.setMonth(c2.getMonth() + 1);
  }
  const display = months.length > 24 ? months.slice(-24) : months;

  const incomeByMonth = {};
  const expByMonth    = {};
  income.forEach(tx => {
    const key = String(tx.date).slice(0, 7);
    incomeByMonth[key] = (incomeByMonth[key] || 0) + toBase(tx.amount, tx.currency, tx.fx_rate);
  });
  expenses.forEach(tx => {
    const key = String(tx.date).slice(0, 7);
    expByMonth[key] = (expByMonth[key] || 0) + toBase(tx.amount, tx.currency, tx.fx_rate);
  });

  const labels    = display.map(d => d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }));
  const incomeVals= display.map(d => {
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    return incomeByMonth[key] || 0;
  });
  const expVals   = display.map(d => {
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    return expByMonth[key] || 0;
  });

  const ctx  = el('monthlyChart');
  if (!ctx) return;
  const mono = "'IBM Plex Mono', monospace";

  state.charts['monthlyChart'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Income',   data: incomeVals, backgroundColor: c.teal,  borderRadius: 3 },
        { label: 'Expenses', data: expVals,    backgroundColor: c.ember, borderRadius: 3 },
      ],
    },
    options: {
      ...baseChartOpts(sym),
      plugins: {
        ...baseChartOpts(sym).plugins,
        legend: {
          display: true,
          labels: { color: c.tick, font: { family: mono, size: 11 }, boxWidth: 12 },
        },
        tooltip: {
          ...baseChartOpts(sym).plugins.tooltip,
          callbacks: {
            label: ctx => ' ' + ctx.dataset.label + ': ' + sym + Math.round(ctx.parsed.y).toLocaleString('en-GB'),
          },
        },
      },
    },
  });
}

function renderCategoryChart(expenses) {
  const sym = getSymbol(state.quoteCurrency);
  const c   = chartColors();
  const ctx = el('catChart');
  if (!ctx) return;

  let data, labels;

  if (state.catDrillMajor) {
    // Drill-in view — minor categories within the selected major
    const byMinor = {};
    expenses.filter(tx => tx.major_category === state.catDrillMajor).forEach(tx => {
      const key = tx.minor_category || 'Uncategorised';
      byMinor[key] = (byMinor[key] || 0) + toBase(tx.amount, tx.currency, tx.fx_rate);
    });
    const sorted = Object.entries(byMinor).sort((a, b) => b[1] - a[1]);
    labels = sorted.map(e => e[0]);
    data   = sorted.map(e => e[1]);

    el('catChartTitle').textContent = `${state.catDrillMajor} — by minor category`;
    el('catChartBackWrap').innerHTML = `<button class="chart-back-btn" id="catChartBack">← All categories</button>`;
    el('catChartBack').addEventListener('click', () => {
      state.catDrillMajor = null;
      renderCategoryChart(expenses);
    });
  } else {
    const byMajor = {};
    expenses.forEach(tx => {
      const key = tx.major_category || 'Uncategorised';
      byMajor[key] = (byMajor[key] || 0) + toBase(tx.amount, tx.currency, tx.fx_rate);
    });
    const sorted = Object.entries(byMajor).sort((a, b) => b[1] - a[1]);
    const top8   = sorted.slice(0, 8);
    const rest   = sorted.slice(8).reduce((s, e) => s + e[1], 0);
    if (rest > 0) top8.push(['Other', rest]);
    labels = top8.map(e => e[0]);
    data   = top8.map(e => e[1]);

    el('catChartTitle').textContent = 'Spend by major category';
    el('catChartBackWrap').innerHTML = '';
  }

  if (state.charts['catChart']) { state.charts['catChart'].destroy(); }

  if (!data.length) {
    ctx.parentElement.innerHTML = '<p class="chart-empty">No expense data for this period.</p>';
    return;
  }

  state.charts['catChart'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data, backgroundColor: c.ember, borderRadius: 4 }],
    },
    options: {
      ...baseChartOpts(sym),
      indexAxis: 'y',
      onClick: (event, elements) => {
        if (!state.catDrillMajor && elements.length) {
          state.catDrillMajor = labels[elements[0].index];
          renderCategoryChart(expenses);
        }
      },
      plugins: {
        ...baseChartOpts(sym).plugins,
        tooltip: {
          ...baseChartOpts(sym).plugins.tooltip,
          callbacks: {
            label: ctx => ' ' + sym + Math.round(ctx.parsed.x).toLocaleString('en-GB'),
          },
        },
      },
      scales: {
        ...baseChartOpts(sym).scales,
        x: { ...baseChartOpts(sym).scales.x },
        y: {
          ticks: { color: chartColors().tick, font: { family: "'IBM Plex Mono', monospace", size: 9 } },
          grid:  { display: false },
          border: { display: false },
        },
      },
    },
  });
}

function renderAccountChart(filtered) {
  const sym = getSymbol(state.quoteCurrency);
  const c   = chartColors();
  const ctx = el('accountChart');
  if (!ctx) return;

  const byAccount = {};
  filtered.filter(tx => tx.transaction_type === 'money-out' && !tx.transfer_id).forEach(tx => {
    const key = tx.account || 'Unknown';
    byAccount[key] = (byAccount[key] || 0) + toBase(tx.amount, tx.currency, tx.fx_rate);
  });
  const sorted = Object.entries(byAccount).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(e => e[0]);
  const data   = sorted.map(e => e[1]);

  if (!data.length) {
    ctx.parentElement.innerHTML = '<p class="chart-empty">No spend data for this period.</p>';
    return;
  }

  state.charts['accountChart'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data, backgroundColor: chartColors().teal, borderRadius: 4 }],
    },
    options: {
      ...baseChartOpts(sym),
      indexAxis: 'y',
      plugins: {
        ...baseChartOpts(sym).plugins,
        tooltip: {
          ...baseChartOpts(sym).plugins.tooltip,
          callbacks: {
            label: ctx => ' ' + sym + Math.round(ctx.parsed.x).toLocaleString('en-GB'),
          },
        },
      },
      scales: {
        ...baseChartOpts(sym).scales,
        x: { ...baseChartOpts(sym).scales.x },
        y: {
          ticks: { color: c.tick, font: { family: "'IBM Plex Mono', monospace", size: 9 } },
          grid:  { display: false }, border: { display: false },
        },
      },
    },
  });
}

// ── Transactions tab ──────────────────────────────────────────────────────────
function renderTransactions() {
  const txEl = el('transactionsContent');
  const rows = filteredTx();

  // Separate valid and warning rows
  const validRows = rows.filter(tx => tx.id && tx.date && VALID_TX_TYPES.includes(tx.transaction_type));
  const warnRows  = rows.filter(tx => !tx.id || !tx.date || !VALID_TX_TYPES.includes(tx.transaction_type));

  txEl.innerHTML = `
    ${renderAddForm()}
    ${renderFilterBar()}
    ${warnRows.length ? `<div class="warning-count" id="warnToggle">⚠ ${warnRows.length} row${warnRows.length > 1 ? 's' : ''} have warnings — click to expand</div>` : ''}
    <div class="table-controls">
      <button class="btn btn-secondary btn-sm" id="exportCsv">Export CSV</button>
      <button class="btn btn-secondary btn-sm" id="exportJson">Export JSON</button>
    </div>
    ${renderTxTable(validRows, warnRows)}
  `;

  attachFilterEvents();
  attachAddFormEvents();

  el('exportCsv')?.addEventListener('click', () => exportData('csv', rows));
  el('exportJson')?.addEventListener('click', () => exportData('json', rows));

  if (warnRows.length) {
    el('warnToggle')?.addEventListener('click', () => {
      const t = el('warnTable');
      if (t) t.classList.toggle('hidden');
    });
  }
}

const VALID_TX_TYPES = ['money-in', 'money-out', 'money-transfer'];

function renderTxTable(validRows, warnRows) {
  const sorted = sortTx([...validRows]);
  const total  = sorted.length;
  const pages  = Math.max(1, Math.ceil(total / state.txPerPage));
  if (state.txPage > pages) state.txPage = 1;
  const start  = (state.txPage - 1) * state.txPerPage;
  const paged  = sorted.slice(start, start + state.txPerPage);

  const thSort = (col, label) => {
    const cls = state.txSort.col === col ? ` sort-${state.txSort.dir}` : '';
    return `<th class="${cls}" data-sort="${esc(col)}">${esc(label)}</th>`;
  };

  const rows = paged.map(tx => {
    const badgeCls = tx.transaction_type === 'money-in' ? 'badge-in'
                   : tx.transaction_type === 'money-out' ? 'badge-out' : 'badge-transfer';
    const typeLabel = tx.transaction_type === 'money-in' ? 'in'
                    : tx.transaction_type === 'money-out' ? 'out' : 'xfer';
    const missingRate = !state.rateMap[tx.currency];
    const rowRate     = tx.fx_rate && parseFloat(tx.fx_rate) > 0;

    return `<tr>
      <td class="td-mono">${esc(fmtDate(tx.date))}</td>
      <td><span class="badge ${badgeCls}">${typeLabel}</span>${tx.transfer_id ? ' <span title="Transfer: '+esc(tx.transfer_id)+'">⇌</span>' : ''}</td>
      <td>${esc(tx.account || '—')}</td>
      <td class="td-mono">${esc(fmtNative(tx.amount, tx.currency))}${missingRate ? ' <span class="badge badge-warn" title="Currency not in rates tab">?</span>' : ''}</td>
      <td class="td-mono">${esc(fmtBase(tx.amount, tx.currency, tx.fx_rate))}${rowRate ? ' <span title="Row-level FX rate used" style="color:var(--muted);font-size:10px">†</span>' : ''}</td>
      <td>${esc(tx.major_category || '—')} ${tx.minor_category ? '→ ' + esc(tx.minor_category) : ''}</td>
      <td>${esc(tx.counterparty || '—')}</td>
      <td class="td-muted">${esc(tx.country || '—')}</td>
      <td class="td-muted">${esc(tx.payment_method || '—')}</td>
      <td class="td-muted">${tx.tags ? tx.tags.split(';').map(t => `<span class="badge" style="background:var(--canvas)">${esc(t.trim())}</span>`).join(' ') : '—'}</td>
      <td class="td-muted">${esc(tx.notes || '—')}</td>
    </tr>`;
  }).join('');

  const warnRowsHtml = warnRows.length ? `
    <tbody id="warnTable" class="hidden">
      ${warnRows.map(tx => `<tr>
        <td colspan="11"><span class="badge badge-warn">⚠ malformed</span> id=${esc(String(tx.id||'?'))} type=${esc(tx.transaction_type||'?')} date=${esc(String(tx.date||'?'))}</td>
      </tr>`).join('')}
    </tbody>` : '';

  const pagination = pages > 1 ? `
    <div class="pagination">
      <button class="btn btn-secondary btn-sm" id="prevPage" ${state.txPage <= 1 ? 'disabled' : ''}>← Prev</button>
      <span>Page ${state.txPage} of ${pages} (${total} rows)</span>
      <button class="btn btn-secondary btn-sm" id="nextPage" ${state.txPage >= pages ? 'disabled' : ''}>Next →</button>
    </div>` : `<div class="pagination">${total} rows</div>`;

  const html = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          ${thSort('date','Date')}
          ${thSort('transaction_type','Type')}
          ${thSort('account','Account')}
          <th>Amount</th>
          <th>≈ ${esc(state.quoteCurrency)}</th>
          ${thSort('major_category','Category')}
          ${thSort('counterparty','Counterparty')}
          <th>Country</th>
          <th>Method</th>
          <th>Tags</th>
          <th>Notes</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        ${warnRowsHtml}
      </table>
    </div>
    ${pagination}
  `;

  // Attach sort/page handlers after render
  setTimeout(() => {
    el('transactionsContent')?.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (state.txSort.col === col) {
          state.txSort.dir = state.txSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          state.txSort.col = col; state.txSort.dir = 'desc';
        }
        state.txPage = 1;
        renderTransactions();
      });
    });
    el('prevPage')?.addEventListener('click', () => { state.txPage--; renderTransactions(); });
    el('nextPage')?.addEventListener('click', () => { state.txPage++; renderTransactions(); });
  }, 0);

  return html;
}

function sortTx(rows) {
  const col = state.txSort.col;
  const dir = state.txSort.dir === 'asc' ? 1 : -1;
  return rows.sort((a, b) => {
    let va = a[col] ?? '', vb = b[col] ?? '';
    if (col === 'date') {
      va = parseLocalDate(String(va).slice(0, 10)).getTime() || 0;
      vb = parseLocalDate(String(vb).slice(0, 10)).getTime() || 0;
    } else if (col === 'amount') {
      va = parseFloat(va) || 0; vb = parseFloat(vb) || 0;
    } else {
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
    }
    return va < vb ? -dir : va > vb ? dir : 0;
  });
}

// ── Add-transaction form ──────────────────────────────────────────────────────
let addFormOpen = false;

function renderAddForm() {
  const types = ['money-in', 'money-out', 'money-transfer'];
  const majors = state.catDrillMajor ? [] :
    [...new Set(state.categories.filter(c => c.transaction_type === 'money-out').map(c => c.major_category))];

  return `
  <div class="add-form-wrap">
    <button class="add-form-toggle" id="addFormToggle">
      Add transaction
      <span class="plus-icon">${addFormOpen ? '×' : '+'}</span>
    </button>
    <div class="add-form-body ${addFormOpen ? '' : 'hidden'}" id="addFormBody">
      <div class="form-grid">
        <div class="field">
          <label for="afDate">Date *</label>
          <input type="date" id="afDate" value="${todayISO()}">
        </div>
        <div class="field">
          <label for="afType">Type *</label>
          <select id="afType">
            ${types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="afAccount">Account *</label>
          <select id="afAccount">
            <option value="">— select —</option>
            ${state.accounts.map(a => `<option value="${esc(a.name)}">${esc(a.name)} (${esc(a.currency)})</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="afAmount">Amount *</label>
          <input type="number" id="afAmount" min="0.01" step="0.01" placeholder="0.00">
        </div>
        <div class="field">
          <label for="afCurrency">Currency *</label>
          <select id="afCurrency">
            ${state.rates.map(r => `<option value="${esc(r.currency)}">${esc(r.symbol||'')} ${esc(r.currency)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="afMajor">Major category *</label>
          <select id="afMajor">
            <option value="">— select type first —</option>
          </select>
        </div>
        <div class="field">
          <label for="afMinor">Minor category *</label>
          <select id="afMinor">
            <option value="">— select major first —</option>
          </select>
        </div>
        <div class="field">
          <label for="afCounterparty">Counterparty</label>
          <input type="text" id="afCounterparty" placeholder="Tesco, employer, …">
        </div>
        <div class="field">
          <label for="afCountry">Country</label>
          <input type="text" id="afCountry" placeholder="UK">
        </div>
        <div class="field">
          <label for="afMethod">Payment method</label>
          <select id="afMethod">
            <option value="">— optional —</option>
            ${['card','cash','bank','UPI','other'].map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
        </div>
        <div class="field" id="afTransferIdWrap" style="display:none">
          <label for="afTransferId">Transfer ID</label>
          <input type="text" id="afTransferId" placeholder="T-YYYY-MM-DD-1">
        </div>
        <div class="field" id="afFxRateWrap" style="display:none">
          <label for="afFxRate">FX rate (units per 1 GBP)</label>
          <input type="number" id="afFxRate" min="0" step="any" placeholder="optional override">
        </div>
        <div class="field">
          <label for="afTags">Tags</label>
          <input type="text" id="afTags" placeholder="reimbursable, work">
        </div>
        <div class="field form-grid-full">
          <label for="afNotes">Notes</label>
          <input type="text" id="afNotes" placeholder="free text">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" id="afSubmit">Save</button>
        <button class="btn btn-secondary" id="afReset">Clear</button>
      </div>
      <div class="pin-error" id="afError"></div>
    </div>
  </div>`;
}

function attachAddFormEvents() {
  el('addFormToggle')?.addEventListener('click', () => {
    addFormOpen = !addFormOpen;
    renderTransactions();
  });

  el('afType')?.addEventListener('change', () => {
    const type  = el('afType').value;
    const majors= [...new Set(state.categories.filter(c => c.transaction_type === type).map(c => c.major_category))];
    el('afMajor').innerHTML = `<option value="">— select —</option>${majors.map(m => `<option>${esc(m)}</option>`).join('')}`;
    el('afMinor').innerHTML = `<option value="">— select major first —</option>`;
    el('afTransferIdWrap').style.display = type === 'money-transfer' ? '' : 'none';
  });

  el('afMajor')?.addEventListener('change', () => {
    const type  = el('afType').value;
    const major = el('afMajor').value;
    const minors= state.categories.filter(c => c.transaction_type === type && c.major_category === major).map(c => c.minor_category);
    el('afMinor').innerHTML = `<option value="">— select —</option>${minors.map(m => `<option>${esc(m)}</option>`).join('')}`;
  });

  el('afCurrency')?.addEventListener('change', () => {
    const currency = el('afCurrency').value;
    el('afFxRateWrap').style.display = currency !== 'GBP' ? '' : 'none';
  });

  el('afAccount')?.addEventListener('change', () => {
    const acc = state.accounts.find(a => a.name === el('afAccount').value);
    if (acc) el('afCurrency').value = acc.currency;
    const cur = el('afCurrency').value;
    el('afFxRateWrap').style.display = cur !== 'GBP' ? '' : 'none';
  });

  el('afSubmit')?.addEventListener('click', saveTransaction);
  el('afReset')?.addEventListener('click', () => {
    ['afDate','afAmount','afCounterparty','afCountry','afTags','afNotes','afFxRate','afTransferId']
      .forEach(id => { if(el(id)) el(id).value = id === 'afDate' ? todayISO() : ''; });
    el('afType').value = 'money-in';
    el('afMajor').innerHTML = '<option value="">— select type first —</option>';
    el('afMinor').innerHTML = '<option value="">— select major first —</option>';
    el('afError').textContent = '';
  });
}

async function saveTransaction() {
  const btn  = el('afSubmit');
  const errEl= el('afError');
  errEl.textContent = '';

  const date             = el('afDate').value;
  const transaction_type = el('afType').value;
  const account          = el('afAccount').value;
  const amount           = el('afAmount').value;
  const currency         = el('afCurrency').value;
  const major_category   = el('afMajor').value;
  const minor_category   = el('afMinor').value;
  const counterparty     = el('afCounterparty').value.trim();
  const country          = el('afCountry').value.trim();
  const payment_method   = el('afMethod').value;
  const transfer_id      = el('afTransferId').value.trim();
  const fx_rate          = el('afFxRate').value;
  const tags             = el('afTags').value.trim();
  const notes            = el('afNotes').value.trim();

  if (!date)             { errEl.textContent = 'Date is required.'; return; }
  if (!account)          { errEl.textContent = 'Account is required.'; return; }
  if (!amount || parseFloat(amount) <= 0) { errEl.textContent = 'Enter a positive amount.'; return; }
  if (!major_category)   { errEl.textContent = 'Major category is required.'; return; }
  if (!minor_category)   { errEl.textContent = 'Minor category is required.'; return; }

  btn.disabled = true; btn.textContent = 'Saving…';

  showLoading();
  try {
    const res = await ExpenseAPI.createTransaction({
      date, transaction_type, account, amount: parseFloat(amount), currency,
      major_category, minor_category, counterparty, country, payment_method,
      transfer_id, fx_rate: fx_rate ? parseFloat(fx_rate) : '',
      tags, notes,
    });

    if (res.ok) {
      showMsg('Transaction saved.');
      addFormOpen = false;
      await loadAll();
    } else {
      errEl.textContent = 'Error: ' + (res.error || 'unknown');
      btn.disabled = false; btn.textContent = 'Save';
    }
  } catch (_) {
    errEl.textContent = 'Connection error.';
    btn.disabled = false; btn.textContent = 'Save';
  } finally {
    hideLoading();
  }
}

// ── Filter bar ────────────────────────────────────────────────────────────────
let filterOpen = false;

function renderFilterBar() {
  const f        = state.filters;
  const allTypes = ['money-in', 'money-out', 'money-transfer'];
  const allAccs  = [...new Set(state.accounts.map(a => a.name))];
  const allMajor = [...new Set(state.categories.map(c => c.major_category))];
  const allMinor = [...new Set(state.categories.map(c => c.minor_category))];
  const methods  = ['card','cash','bank','UPI','other'];

  const activeChips = [
    ...f.types.map(t => ({ label: t, key: 'types', val: t })),
    ...f.accounts.map(a => ({ label: a, key: 'accounts', val: a })),
    ...f.major.map(m => ({ label: m, key: 'major', val: m })),
    ...f.minor.map(m => ({ label: m, key: 'minor', val: m })),
    ...(f.country  ? [{ label: 'Country: '+f.country, key: 'country', val: '' }] : []),
    ...(f.method   ? [{ label: 'Method: '+f.method,   key: 'method',  val: '' }] : []),
    ...(f.tag      ? [{ label: 'Tag: '+f.tag,          key: 'tag',     val: '' }] : []),
    ...(f.search   ? [{ label: 'Search: '+f.search,    key: 'search',  val: '' }] : []),
  ];

  const mkMulti = (id, opts, selected) =>
    `<select id="${id}" multiple size="1" style="min-height:44px">
      ${opts.map(o => `<option value="${esc(o)}" ${selected.includes(o) ? 'selected' : ''}>${esc(o)}</option>`).join('')}
    </select>`;

  return `
  <div class="filter-bar">
    <button class="filter-toggle" id="filterToggle">
      Filters ${activeChips.length ? `<span class="badge badge-in">${activeChips.length}</span>` : ''}
      <span class="filter-arrow">${filterOpen ? '▲' : '▼'}</span>
    </button>
    <div class="filter-body ${filterOpen ? '' : 'hidden'}" id="filterBody">
      <div class="filter-row">
        <label>Type</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${allTypes.map(t => `<label style="display:flex;align-items:center;gap:4px;font-size:12px">
            <input type="checkbox" data-filter-type="${esc(t)}" ${f.types.includes(t) ? 'checked' : ''}> ${esc(t)}
          </label>`).join('')}
        </div>
      </div>
      <div class="filter-row">
        <label>Account</label>
        <select id="filterAccount">
          <option value="">All accounts</option>
          ${allAccs.map(a => `<option value="${esc(a)}" ${f.accounts.includes(a) ? 'selected' : ''}>${esc(a)}</option>`).join('')}
        </select>
      </div>
      <div class="filter-row">
        <label>Major cat.</label>
        <select id="filterMajor">
          <option value="">All</option>
          ${allMajor.map(m => `<option value="${esc(m)}" ${f.major.includes(m) ? 'selected' : ''}>${esc(m)}</option>`).join('')}
        </select>
      </div>
      <div class="filter-row">
        <label>Minor cat.</label>
        <select id="filterMinor">
          <option value="">All</option>
          ${allMinor.map(m => `<option value="${esc(m)}" ${f.minor.includes(m) ? 'selected' : ''}>${esc(m)}</option>`).join('')}
        </select>
      </div>
      <div class="filter-row">
        <label>Country</label>
        <input type="text" id="filterCountry" value="${esc(f.country)}" placeholder="e.g. UK">
      </div>
      <div class="filter-row">
        <label>Method</label>
        <select id="filterMethod">
          <option value="">All</option>
          ${methods.map(m => `<option value="${esc(m)}" ${f.method === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
        </select>
      </div>
      <div class="filter-row">
        <label>Tag</label>
        <input type="text" id="filterTag" value="${esc(f.tag)}" placeholder="any tag">
      </div>
      <div class="filter-row">
        <label>Search</label>
        <input type="text" id="filterSearch" value="${esc(f.search)}" placeholder="counterparty or notes">
      </div>
      <div style="margin-top:4px">
        <button class="btn btn-secondary btn-sm" id="clearFilters">Clear all filters</button>
      </div>
    </div>
    ${activeChips.length ? `<div class="filter-chips">
      ${activeChips.map(chip => `<span class="filter-chip">${esc(chip.label)}<button class="chip-remove" data-chip-key="${esc(chip.key)}" data-chip-val="${esc(chip.val)}">×</button></span>`).join('')}
    </div>` : ''}
  </div>`;
}

function attachFilterEvents() {
  el('filterToggle')?.addEventListener('click', () => {
    filterOpen = !filterOpen;
    renderTransactions();
  });

  document.querySelectorAll('[data-filter-type]').forEach(cb => {
    cb.addEventListener('change', () => {
      const t = cb.dataset.filterType;
      if (cb.checked) { if (!state.filters.types.includes(t)) state.filters.types.push(t); }
      else { state.filters.types = state.filters.types.filter(x => x !== t); }
      state.txPage = 1; renderTransactions();
    });
  });

  const bindSelect = (id, key) => el(id)?.addEventListener('change', e => {
    state.filters[key] = e.target.value ? [e.target.value] : [];
    state.txPage = 1; renderTransactions();
  });
  const bindText = (id, key) => el(id)?.addEventListener('input', e => {
    state.filters[key] = e.target.value.trim();
    state.txPage = 1; renderTransactions();
  });

  bindSelect('filterAccount', 'accounts');
  bindSelect('filterMajor', 'major');
  bindSelect('filterMinor', 'minor');
  bindSelect('filterMethod', 'method');
  bindText('filterCountry', 'country');
  bindText('filterTag', 'tag');
  bindText('filterSearch', 'search');

  el('clearFilters')?.addEventListener('click', () => {
    state.filters = { types:[], accounts:[], major:[], minor:[], country:'', method:'', tag:'', search:'' };
    state.txPage = 1; renderTransactions();
  });

  document.querySelectorAll('.chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.chipKey;
      const val = btn.dataset.chipVal;
      if (Array.isArray(state.filters[key])) {
        state.filters[key] = state.filters[key].filter(x => x !== val);
      } else {
        state.filters[key] = '';
      }
      state.txPage = 1; renderTransactions();
    });
  });
}

// ── Export ────────────────────────────────────────────────────────────────────
function exportData(format, rows) {
  if (format === 'json') {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    download(blob, `expenses-${todayISO()}.json`);
  } else {
    const cols = ['id','date','transaction_type','amount','currency','account','major_category','minor_category','counterparty','notes','tags','transfer_id','fx_rate','country','payment_method'];
    const lines = [cols.join(','), ...rows.map(tx =>
      cols.map(c => '"' + String(tx[c] ?? '').replace(/"/g, '""') + '"').join(',')
    )];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    download(blob, `expenses-${todayISO()}.csv`);
  }
}

function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Accounts tab ──────────────────────────────────────────────────────────────
function renderAccounts() {
  const el2 = el('accountsContent');
  if (!state.accounts.length) {
    el2.innerHTML = `<div class="empty-state"><strong>No accounts yet</strong>Add rows to the <code>accounts</code> tab in your Google Sheet, then reload.</div>`;
    return;
  }
  el2.innerHTML = `
    <div class="sec-head"><div class="sec-head-left"><h2>Accounts</h2></div></div>
    <div class="accounts-list">
      ${state.accounts.map(a => `
        <div class="account-item">
          <div>
            <div class="account-name">${esc(a.name)}</div>
            <div class="account-meta">${esc(a.currency)}${a.notes ? ' · ' + esc(a.notes) : ''}</div>
          </div>
          <span class="account-type">${esc(a.type || 'other')}</span>
        </div>`).join('')}
    </div>`;
}

// ── Categories tab ────────────────────────────────────────────────────────────
function renderCategories() {
  const el2 = el('categoriesContent');

  const filtered = state.catFilter === 'all'
    ? state.categories
    : state.categories.filter(c => c.transaction_type === state.catFilter);

  el2.innerHTML = `
    <div class="sec-head">
      <div class="sec-head-left"><h2>Categories</h2></div>
      <button class="btn btn-primary btn-sm" id="catAddBtn">${state.catAddOpen ? '× Close' : '+ Add category'}</button>
    </div>
    ${state.catAddOpen ? renderCatAddForm() : ''}
    <div class="cat-filter" id="catTypeFilter">
      ${['all','money-in','money-out','money-transfer'].map(t =>
        `<button class="range-btn ${state.catFilter === t ? 'active' : ''}" data-cat-filter="${esc(t)}">${t === 'all' ? 'All' : t}</button>`
      ).join('')}
      <span class="cat-count">${filtered.length} ${filtered.length === 1 ? 'category' : 'categories'}</span>
    </div>
    ${renderCatTable(filtered)}
  `;

  attachCatEvents();
}

function renderCatAddForm() {
  return `
  <div class="card" style="margin-bottom:20px">
    <div class="form-grid">
      <div class="field">
        <label for="catNewType">Type *</label>
        <select id="catNewType">
          ${['money-in','money-out','money-transfer'].map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="catNewMajor">Major category *</label>
        <input type="text" id="catNewMajor" placeholder="e.g. Food">
      </div>
      <div class="field">
        <label for="catNewMinor">Minor category *</label>
        <input type="text" id="catNewMinor" placeholder="e.g. Groceries">
      </div>
      <div class="field form-grid-full">
        <label for="catNewKeywords">Keywords</label>
        <input type="text" id="catNewKeywords" placeholder="tesco, sainsbury, waitrose, lidl">
        <div class="field-hint">Comma-separated. Used to find the right category when adding transactions.</div>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary" id="catSaveNew">Save category</button>
      <button class="btn btn-secondary" id="catCancelNew">Cancel</button>
    </div>
    <div class="pin-error" id="catAddError"></div>
  </div>`;
}

function renderCatTable(cats) {
  if (!cats.length) {
    return `<p class="placeholder">No categories for this type. Use &ldquo;+ Add category&rdquo; to create one.</p>`;
  }

  const rows = cats.map(cat => {
    if (state.catDeleteRow === cat._row) {
      return `<tr>
        <td>${catTypeBadge(cat.transaction_type)}</td>
        <td colspan="3"><span class="confirm-text">Delete <strong>${esc(cat.major_category)} → ${esc(cat.minor_category)}</strong>?</span></td>
        <td><div class="row-actions">
          <button class="btn-link danger" data-action="cat-confirm-delete" data-row="${cat._row}">Yes, delete</button>
          <button class="btn-link" data-action="cat-cancel-delete">Cancel</button>
        </div></td>
      </tr>`;
    }

    if (state.catEditRow === cat._row) {
      return renderCatEditRow(cat);
    }

    const kwHtml = cat.tag_keywords
      ? `<span class="cat-keywords">${esc(String(cat.tag_keywords))}</span>`
      : `<span style="color:var(--muted)">—</span>`;

    return `<tr>
      <td>${catTypeBadge(cat.transaction_type)}</td>
      <td class="td-name">${esc(cat.major_category)}</td>
      <td>${esc(cat.minor_category)}</td>
      <td class="td-keywords">${kwHtml}</td>
      <td><div class="row-actions">
        <button class="btn-link" data-action="cat-edit" data-row="${cat._row}">Edit</button>
        <button class="btn-link danger" data-action="cat-delete" data-row="${cat._row}">Delete</button>
      </div></td>
    </tr>`;
  }).join('');

  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th style="width:80px">Type</th>
          <th>Major</th>
          <th>Minor</th>
          <th>Keywords</th>
          <th style="width:110px">Actions</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderCatEditRow(cat) {
  const r = cat._row;
  return `<tr>
    <td>
      <select class="cat-edit-select" id="catEditType-${r}">
        ${['money-in','money-out','money-transfer'].map(t =>
          `<option value="${esc(t)}" ${cat.transaction_type === t ? 'selected' : ''}>${esc(t)}</option>`
        ).join('')}
      </select>
    </td>
    <td><input class="rate-edit-input" id="catEditMajor-${r}" value="${esc(cat.major_category)}" placeholder="Major"></td>
    <td><input class="rate-edit-input" id="catEditMinor-${r}" value="${esc(cat.minor_category)}" placeholder="Minor"></td>
    <td><input class="rate-edit-input" style="width:100%;min-width:160px" id="catEditKeywords-${r}" value="${esc(String(cat.tag_keywords || ''))}" placeholder="tesco, sainsbury, …"></td>
    <td><div class="row-actions">
      <button class="btn btn-primary btn-sm" data-action="cat-save-edit" data-row="${r}">Save</button>
      <button class="btn btn-secondary btn-sm" data-action="cat-cancel-edit">Cancel</button>
    </div></td>
  </tr>`;
}

function catTypeBadge(type) {
  const cls   = type === 'money-in' ? 'badge-in' : type === 'money-out' ? 'badge-out' : 'badge-transfer';
  const label = type === 'money-in' ? 'in'       : type === 'money-out' ? 'out'       : 'xfer';
  return `<span class="badge ${cls}">${label}</span>`;
}

function attachCatEvents() {
  el('catAddBtn')?.addEventListener('click', () => {
    state.catAddOpen = !state.catAddOpen;
    renderCategories();
  });

  el('catSaveNew')?.addEventListener('click', saveNewCategory);
  el('catCancelNew')?.addEventListener('click', () => {
    state.catAddOpen = false;
    renderCategories();
  });

  el('catTypeFilter')?.querySelectorAll('[data-cat-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.catFilter    = btn.dataset.catFilter;
      state.catEditRow   = null;
      state.catDeleteRow = null;
      renderCategories();
    });
  });

  el('categoriesContent')?.querySelector('.table-wrap')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const row    = btn.dataset.row ? Number(btn.dataset.row) : null;

    if (action === 'cat-edit')           { state.catEditRow = row; state.catDeleteRow = null; renderCategories(); }
    if (action === 'cat-cancel-edit')    { state.catEditRow = null; renderCategories(); }
    if (action === 'cat-save-edit')      { saveCatEdit(row); }
    if (action === 'cat-delete')         { state.catDeleteRow = row; state.catEditRow = null; renderCategories(); }
    if (action === 'cat-cancel-delete')  { state.catDeleteRow = null; renderCategories(); }
    if (action === 'cat-confirm-delete') { deleteCat(row); }
  });
}

async function saveNewCategory() {
  const transaction_type = el('catNewType')?.value;
  const major_category   = el('catNewMajor')?.value.trim();
  const minor_category   = el('catNewMinor')?.value.trim();
  const tag_keywords     = el('catNewKeywords')?.value.trim();
  const errEl            = el('catAddError');

  if (!major_category) { if (errEl) errEl.textContent = 'Major category is required.'; return; }
  if (!minor_category) { if (errEl) errEl.textContent = 'Minor category is required.'; return; }
  if (errEl) errEl.textContent = '';

  const btn = el('catSaveNew');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  showLoading();
  try {
    const res = await ExpenseAPI.createCategory({ transaction_type, major_category, minor_category, tag_keywords });
    if (res.ok) {
      showMsg('Category added.');
      state.catAddOpen = false;
      const catRes = await ExpenseAPI.listCategories();
      if (catRes.ok) state.categories = catRes.data || [];
      renderCategories();
    } else {
      if (errEl) errEl.textContent = 'Error: ' + (res.error || 'unknown');
      if (btn) { btn.disabled = false; btn.textContent = 'Save category'; }
    }
  } catch (_) {
    if (errEl) errEl.textContent = 'Connection error.';
    if (btn) { btn.disabled = false; btn.textContent = 'Save category'; }
  } finally {
    hideLoading();
  }
}

async function saveCatEdit(rowNum) {
  const transaction_type = el(`catEditType-${rowNum}`)?.value;
  const major_category   = el(`catEditMajor-${rowNum}`)?.value.trim();
  const minor_category   = el(`catEditMinor-${rowNum}`)?.value.trim();
  const tag_keywords     = el(`catEditKeywords-${rowNum}`)?.value.trim();

  if (!major_category || !minor_category) {
    showMsg('Major and minor category are required.', 'warn'); return;
  }

  showLoading();
  try {
    const res = await ExpenseAPI.updateCategory({ row_num: rowNum, transaction_type, major_category, minor_category, tag_keywords });
    if (res.ok) {
      showMsg('Category updated.');
      state.catEditRow = null;
      const catRes = await ExpenseAPI.listCategories();
      if (catRes.ok) state.categories = catRes.data || [];
      renderCategories();
    } else {
      showMsg('Update failed: ' + (res.error || 'unknown'), 'warn');
    }
  } catch (_) {
    showMsg('Connection error.', 'warn');
  } finally {
    hideLoading();
  }
}

async function deleteCat(rowNum) {
  showLoading();
  try {
    const res = await ExpenseAPI.deleteCategory({ row_num: rowNum });
    if (res.ok) {
      showMsg('Category deleted.');
      state.catDeleteRow = null;
      const catRes = await ExpenseAPI.listCategories();
      if (catRes.ok) state.categories = catRes.data || [];
      renderCategories();
    } else {
      showMsg('Delete failed: ' + (res.error || 'unknown'), 'warn');
      state.catDeleteRow = null;
      renderCategories();
    }
  } catch (_) {
    showMsg('Connection error.', 'warn');
    state.catDeleteRow = null;
    renderCategories();
  } finally {
    hideLoading();
  }
}

// ── Rates tab ─────────────────────────────────────────────────────────────────
function renderRates() {
  const el2 = el('ratesContent');
  const sym = getSymbol(state.quoteCurrency);

  el2.innerHTML = `
    <div class="sec-head"><div class="sec-head-left"><h2>Exchange rates</h2></div></div>
    <p class="sec-sub">Units of currency per 1 GBP. GBP is the base (read-only).</p>
    <div class="rates-table-wrap">
      <table>
        <thead><tr>
          <th>Currency</th><th>Symbol</th><th>Rate</th><th>Updated</th><th></th>
        </tr></thead>
        <tbody>
          ${state.rates.map(r => rateRowHtml(r)).join('')}
        </tbody>
      </table>
    </div>`;

  el2.querySelectorAll('.rate-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const currency = btn.dataset.currency;
      if (currency === 'GBP') return;
      renderRateEditRow(currency);
    });
  });
}

function rateRowHtml(r) {
  const base = r.currency === 'GBP';
  return `<tr id="rateRow-${esc(r.currency)}">
    <td class="td-mono">${esc(r.currency)}</td>
    <td>${esc(r.symbol || '')}</td>
    <td class="td-mono">${parseFloat(r.rate).toLocaleString('en-GB', { maximumFractionDigits: 4 })}</td>
    <td class="td-muted td-mono">${r.updated_at ? esc(fmtDate(r.updated_at)) : '—'}</td>
    <td>${base ? '' : `<button class="btn btn-secondary btn-sm rate-edit-btn" data-currency="${esc(r.currency)}">Edit</button>`}</td>
  </tr>`;
}

function renderRateEditRow(currency) {
  const rate = state.rates.find(r => r.currency === currency);
  if (!rate) return;
  const row = el(`rateRow-${currency}`);
  if (!row) return;

  row.innerHTML = `
    <td class="td-mono">${esc(currency)}</td>
    <td><input class="rate-edit-input" style="width:60px" id="rateSymEdit-${esc(currency)}" value="${esc(rate.symbol||'')}" placeholder="£"></td>
    <td><input class="rate-edit-input" style="width:90px" id="rateValEdit-${esc(currency)}" type="number" min="0.0001" step="any" value="${parseFloat(rate.rate)}"></td>
    <td class="td-muted td-mono">${rate.updated_at ? esc(fmtDate(rate.updated_at)) : '—'}</td>
    <td style="display:flex;gap:6px">
      <button class="btn btn-primary btn-sm" id="rateSave-${esc(currency)}">Save</button>
      <button class="btn btn-secondary btn-sm" id="rateCancel-${esc(currency)}">Cancel</button>
    </td>`;

  const saveBtn = el(`rateSave-${currency}`);
  const cancelBtn = el(`rateCancel-${currency}`);

  saveBtn.addEventListener('click', async () => {
    const newRate = parseFloat(el(`rateValEdit-${currency}`).value);
    const newSym  = el(`rateSymEdit-${currency}`).value.trim();
    if (!newRate || newRate <= 0) { showMsg('Enter a valid rate.', 'warn'); return; }

    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    showLoading();
    try {
      const res = await ExpenseAPI.upsertRate({ currency, rate: newRate, symbol: newSym });
      if (res.ok) {
        const r = state.rates.find(r => r.currency === currency);
        if (r) { r.rate = newRate; r.symbol = newSym; r.updated_at = new Date().toISOString(); }
        state.rateMap[currency] = newRate;
        showMsg('Rate updated.');
        renderRates();
      } else {
        showMsg('Failed: ' + (res.error || 'unknown'), 'warn');
        saveBtn.disabled = false; saveBtn.textContent = 'Save';
      }
    } catch (_) {
      showMsg('Connection error.', 'warn');
      saveBtn.disabled = false; saveBtn.textContent = 'Save';
    } finally {
      hideLoading();
    }
  });

  cancelBtn.addEventListener('click', () => renderRates());

  el(`rateValEdit-${currency}`)?.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveBtn.click();
    if (e.key === 'Escape') cancelBtn.click();
  });
}

// ── Initialisation ────────────────────────────────────────────────────────────
async function init() {
  // Theme
  const savedTheme = localStorage.getItem('et_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(savedTheme || (prefersDark ? 'dark' : 'light'));

  // Theme toggle
  el('themeToggle')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'light' : 'dark');
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

  el('customFrom')?.addEventListener('change', e => {
    state.customFrom = e.target.value;
    if (state.transactions.length) renderDashboard();
  });
  el('customTo')?.addEventListener('change', e => {
    state.customTo = e.target.value;
    if (state.transactions.length) renderDashboard();
  });

  // Restore saved range
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
    if (active === 'dashboard') renderDashboard();
    if (active === 'transactions') renderTransactions();
  });

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

    // Try to use cached transactions for fast render
    const cached = sessionStorage.getItem('et_transactions_cache');
    if (cached) {
      try { state.transactions = JSON.parse(cached); } catch (_) {}
    }

    await loadAll();
  } else {
    showPinGate();
  }

  // PIN form submit
  el('pinSubmit')?.addEventListener('click', submitPin);
  el('totpInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') submitPin(); });
  el('pinInput')?.addEventListener('keydown',  e => { if (e.key === 'Enter') el('totpInput').focus(); });
}

document.addEventListener('DOMContentLoaded', init);
