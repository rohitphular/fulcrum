/* global Chart */
import { state } from '../core/state.js';
import { el, esc, getSymbol } from '../core/utils.js';
import { getPeriodBounds, filterTxByRange, findMissingRates } from './dashboards/dashboard-utils.js';

const DASHBOARDS = [
  // Spending comparisons
  { id: '01-mom-cumulative',    label: 'Month-on-Month daily cumulative', group: 'Spending comparisons', tabs: true  },
  { id: '02-yoy-monthly',       label: 'Year-on-Year monthly',            group: 'Spending comparisons', tabs: true  },
  { id: '03-wow-daily',         label: 'Week-on-Week daily',              group: 'Spending comparisons', tabs: true  },
  { id: '04-qtd-comparison',    label: 'Quarter-to-date comparison',      group: 'Spending comparisons', tabs: true  },
  { id: '05-ytd-comparison',    label: 'Year-to-date comparison',         group: 'Spending comparisons', tabs: true  },
  { id: '06-last-12-months',    label: 'Last 12 months',                  group: 'Spending comparisons', tabs: true  },
  { id: '07-last-8-weeks',      label: 'Last 8 weeks',                    group: 'Spending comparisons', tabs: false  },
  // Categories
  { id: '08-category-pie',      label: 'Category breakdown',              group: 'Categories',           tabs: false },
  { id: '09-category-trend',    label: 'Category trend over time',        group: 'Categories',           tabs: false },
  { id: '10-top-categories',    label: 'Top categories',                  group: 'Categories',           tabs: false },
  { id: '11-category-drilldown', label: 'Category drilldown',             group: 'Categories',           tabs: false },
  { id: '12-tag-pie',           label: 'Tag breakdown',                   group: 'Categories',           tabs: false },
  { id: '13-tag-trend',         label: 'Tag trend over time',             group: 'Categories',           tabs: false },
  // Net worth
  { id: '14-networth-trend',    label: 'Net worth trend',                 group: 'Net worth',            tabs: false },
  { id: '15-account-balances',  label: 'Account balances',               group: 'Net worth',            tabs: false },
  { id: '16-asset-vs-liability', label: 'Assets vs liabilities',          group: 'Net worth',            tabs: false },
  { id: '17-liability-paydown', label: 'Liability paydown',               group: 'Net worth',            tabs: false },
  // Cash flow
  { id: '18-income-vs-expenses', label: 'Income vs expenses',             group: 'Cash flow',            tabs: false },
  { id: '19-cashflow-waterfall', label: 'Cashflow waterfall',             group: 'Cash flow',            tabs: false },
  { id: '20-savings-rate',      label: 'Savings rate',                    group: 'Cash flow',            tabs: false },
  { id: '21-income-sources',    label: 'Income sources',                  group: 'Cash flow',            tabs: false },
  // Counterparties
  { id: '22-top-counterparties', label: 'Top counterparties',             group: 'Counterparties',       tabs: false },
  { id: '23-recurring-payments', label: 'Recurring payments',             group: 'Counterparties',       tabs: false },
  // Geography
  { id: '24-spend-by-country',  label: 'Spend by country',               group: 'Geography',            tabs: false },
  { id: '25-spend-by-city',     label: 'Spend by city',                  group: 'Geography',            tabs: false },
  // Loans
  { id: '26-loan-progress',     label: 'Loan progress',                   group: 'Loans',                tabs: false },
  { id: '27-debt-to-income',    label: 'Debt-to-income',                  group: 'Loans',                tabs: false },
  // FX
  { id: '28-forex-spend',       label: 'Foreign currency spend',          group: 'FX & currency',        tabs: false },
];

const PERIOD_OPTIONS = [
  { value: 'this_week',    label: 'This week'      },
  { value: 'last_week',    label: 'Last week'      },
  { value: 'this_month',   label: 'This month'     },
  { value: 'last_month',   label: 'Last month'     },
  { value: 'last_3',       label: 'Last 3 months'  },
  { value: 'last_6',       label: 'Last 6 months'  },
  { value: 'last_12',      label: 'Last 12 months' },
  { value: 'this_quarter', label: 'This quarter'   },
  { value: 'last_quarter', label: 'Last quarter'   },
  { value: 'ytd',          label: 'Year to date'   },
  { value: 'last_year',    label: 'Last year'      },
  { value: 'custom',       label: 'Custom range'   },
];

const _renderers = {};
let _renderId = 0; // incremented on every render; stale async continuations bail out

export function renderDashboard() {
  _destroyChart();
  _applyChartDefaults();

  const container = el('dashboardContent');
  container.innerHTML = _buildShellHtml();
  _attachShellEvents();
  _renderActiveDashboard();
}

// ── Shell HTML ─────────────────────────────────────────────────────────────────

function _buildShellHtml() {
  const dash = DASHBOARDS.find(d => d.id === state.dashId) || DASHBOARDS[0];

  // Group selector by group
  const groupMap = new Map();
  DASHBOARDS.forEach(d => {
    if (!groupMap.has(d.group)) groupMap.set(d.group, []);
    groupMap.get(d.group).push(d);
  });
  const selectorHtml = [...groupMap.entries()].map(([group, items]) =>
    `<optgroup label="${esc(group)}">${items.map(d =>
      `<option value="${esc(d.id)}"${d.id === state.dashId ? ' selected' : ''}>${esc(d.label)}</option>`
    ).join('')}</optgroup>`
  ).join('');

  const periodHtml = PERIOD_OPTIONS.map(p =>
    `<option value="${esc(p.value)}"${p.value === state.dashPeriod ? ' selected' : ''}>${esc(p.label)}</option>`
  ).join('');

  const customHidden = state.dashPeriod !== 'custom' ? ' hidden' : '';

  const tabStrip = dash.tabs
    ? `<div class="dash-tabs">
        <button class="dash-tab${state.dashTab === 'transactions' ? ' active' : ''}" data-action="dash-tab" data-tab="transactions">Transactions</button>
        <button class="dash-tab${state.dashTab === 'accounts'     ? ' active' : ''}" data-action="dash-tab" data-tab="accounts">Accounts</button>
      </div>`
    : '';

  return `
    <div class="dash-controls">
      <div class="dash-top-row">
        <select class="dash-selector" id="dashSelector">${selectorHtml}</select>
        <select class="dash-period-select" id="dashPeriodSelect">${periodHtml}</select>
      </div>
      <div class="dash-custom-dates${customHidden}" id="dashCustomDates">
        <input type="date" id="dashCustomFrom" value="${esc(state.dashCustomFrom)}">
        <span class="dash-custom-sep">–</span>
        <input type="date" id="dashCustomTo" value="${esc(state.dashCustomTo)}">
      </div>
      ${tabStrip}
    </div>
    <div id="dashInner"></div>`;
}

// ── Events ─────────────────────────────────────────────────────────────────────

function _attachShellEvents() {
  const container = el('dashboardContent');

  container.addEventListener('change', e => {
    const id = e.target.id;

    if (id === 'dashSelector') {
      state.dashId  = e.target.value;
      state.dashTab = 'transactions';
      renderDashboard();
      return;
    }
    if (id === 'dashPeriodSelect') {
      state.dashPeriod = e.target.value;
      const customDates = el('dashCustomDates');
      if (customDates) customDates.classList.toggle('hidden', state.dashPeriod !== 'custom');
      if (state.dashPeriod !== 'custom') _renderActiveDashboard();
      return;
    }
    if (id === 'dashCustomFrom') {
      state.dashCustomFrom = e.target.value;
      if (state.dashCustomFrom && state.dashCustomTo) _renderActiveDashboard();
      return;
    }
    if (id === 'dashCustomTo') {
      state.dashCustomTo = e.target.value;
      if (state.dashCustomFrom && state.dashCustomTo) _renderActiveDashboard();
    }
  });

  container.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action } = btn.dataset;

    if (action === 'dash-tab') {
      state.dashTab = btn.dataset.tab;
      _destroyChart();
      container.querySelectorAll('.dash-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.tab === state.dashTab)
      );
      _renderActiveDashboard();
      return;
    }

    if (action === 'go-rates') {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('et:show-section', { detail: 'rates' }));
    }
  });
}

// ── Render active dashboard ───────────────────────────────────────────────────

async function _renderActiveDashboard() {
  const inner = el('dashInner');
  if (!inner) return;

  // Stamp this render. Any earlier in-flight render that resumes after an await
  // will see its id no longer matches and will bail out — preventing orphaned
  // Chart.js instances from running RAF loops after the user has moved on.
  const myId = ++_renderId;

  _destroyChart();
  inner.innerHTML = '<div class="dash-placeholder"><span class="spinner"></span>Loading…</div>';

  const { from, to } = getPeriodBounds(state.dashPeriod, state.dashCustomFrom, state.dashCustomTo);
  const txs           = filterTxByRange(state.transactions, from, to);
  const sym           = getSymbol(state.quoteCurrency);
  const missingRates  = findMissingRates(txs, state.accounts);

  const rateWarn = missingRates.length
    ? `<div class="dash-warn">⚠ No exchange rate for <strong>${esc(missingRates.join(', '))}</strong> — affected transactions excluded from totals. <a href="#" data-action="go-rates">Add rates →</a></div>`
    : '';

  const renderer = await _loadRenderer(state.dashId);

  if (myId !== _renderId) return; // superseded while loading module

  if (!renderer) {
    inner.innerHTML = `${rateWarn}<div class="dash-placeholder">Dashboard <strong>${esc(state.dashId)}</strong> is not yet implemented.</div>`;
    return;
  }

  inner.innerHTML = `${rateWarn}<div id="dashChart"></div>`;

  const chartInstance = await renderer.render('dashChart', {
    txs,
    accounts: state.accounts,
    from,
    to,
    sym,
    tab:    state.dashTab,
    period: state.dashPeriod,
  });

  if (myId !== _renderId) {
    // Another render started while renderer.render() was running.
    // Destroy the chart we just created so its RAF loop doesn't linger.
    try { chartInstance?.destroy(); } catch (_) {}
    return;
  }

  if (chartInstance) state.dashChartInstance = chartInstance;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function _loadRenderer(dashId) {
  if (Object.prototype.hasOwnProperty.call(_renderers, dashId)) return _renderers[dashId];
  try {
    const mod = await import(`./dashboards/${dashId}.js`);
    _renderers[dashId] = mod;
    return mod;
  } catch (_) {
    _renderers[dashId] = null;
    return null;
  }
}

function _destroyChart() {
  if (state.dashChartInstance) {
    try { state.dashChartInstance.destroy(); } catch (_) {}
    state.dashChartInstance = null;
  }
}

function _applyChartDefaults() {
  if (!window.Chart) return;
  const s = getComputedStyle(document.documentElement);
  window.Chart.defaults.font.family = s.getPropertyValue('--grotesk').trim() || 'inherit';
  window.Chart.defaults.font.size   = 12;
  window.Chart.defaults.color       = s.getPropertyValue('--ink').trim();
}
