/* global Chart */
import { state } from './state.js';
import { el, getSymbol, toBase } from './utils.js';
import { getRangeBounds, filteredTx } from './daterange.js';

export function destroyAllCharts() {
  Object.values(state.charts).forEach(c => { try { c.destroy(); } catch (_) {} });
  state.charts = {};
}

export function renderDashboard() {
  destroyAllCharts();
  const filtered  = filteredTx();
  const income    = filtered.filter(tx => tx.transaction_type === 'money-in'  && !tx.transfer_id);
  const expenses  = filtered.filter(tx => tx.transaction_type === 'money-out' && !tx.transfer_id);
  const transfers = filtered.filter(tx => tx.transfer_id);

  const totalIncome   = income.reduce((s, tx)   => s + toBase(tx.amount, tx.currency, tx.fx_rate), 0);
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
    grid:      isDark ? '#21262D' : '#DCE2EA',
    tick:      isDark ? '#8B96A8' : '#6B7787',
    tooltipBg: isDark ? '#161B22' : '#ffffff',
    tooltipFg: isDark ? '#E2E8F0' : '#16202C',
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
  const mono = "'IBM Plex Mono', monospace";
  const ctx  = el('monthlyChart');
  if (!ctx) return;

  const { from } = getRangeBounds();
  const today    = new Date();
  const months   = [];
  const start    = new Date(from.getFullYear(), from.getMonth(), 1);
  const cursor   = new Date(start);
  while (cursor.getTime() <= today.getTime()) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
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

  const labels     = display.map(d => d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }));
  const incomeVals = display.map(d => { const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; return incomeByMonth[k] || 0; });
  const expVals    = display.map(d => { const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; return expByMonth[k]    || 0; });

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
        legend: { display: true, labels: { color: c.tick, font: { family: mono, size: 11 }, boxWidth: 12 } },
        tooltip: {
          ...baseChartOpts(sym).plugins.tooltip,
          callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + sym + Math.round(ctx.parsed.y).toLocaleString('en-GB') },
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

  let labels, data;

  if (state.catDrillMajor) {
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
    el('catChartBack').addEventListener('click', () => { state.catDrillMajor = null; renderCategoryChart(expenses); });
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

  const mono = "'IBM Plex Mono', monospace";
  state.charts['catChart'] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: c.ember, borderRadius: 4 }] },
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
          callbacks: { label: ctx => ' ' + sym + Math.round(ctx.parsed.x).toLocaleString('en-GB') },
        },
      },
      scales: {
        ...baseChartOpts(sym).scales,
        y: { ticks: { color: c.tick, font: { family: mono, size: 9 } }, grid: { display: false }, border: { display: false } },
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

  const mono = "'IBM Plex Mono', monospace";
  state.charts['accountChart'] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: c.teal, borderRadius: 4 }] },
    options: {
      ...baseChartOpts(sym),
      indexAxis: 'y',
      plugins: {
        ...baseChartOpts(sym).plugins,
        tooltip: {
          ...baseChartOpts(sym).plugins.tooltip,
          callbacks: { label: ctx => ' ' + sym + Math.round(ctx.parsed.x).toLocaleString('en-GB') },
        },
      },
      scales: {
        ...baseChartOpts(sym).scales,
        y: { ticks: { color: c.tick, font: { family: mono, size: 9 } }, grid: { display: false }, border: { display: false } },
      },
    },
  });
}
