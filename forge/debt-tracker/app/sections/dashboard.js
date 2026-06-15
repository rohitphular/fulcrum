import { state, CURRENCY_SYMBOLS } from '../core/state.js';
import { el, esc, fmtAmount, toQuote, parseLocalDate } from '../core/utils.js';

function computeMonthlyMin(d) {
  if (d.type === 'card') {
    const pct = parseFloat(d.min_percent) || 0;
    const flr = parseFloat(d.min_floor)   || 0;
    const bal = parseFloat(d.balance)     || 0;
    return Math.max(bal * pct / 100, flr);
  }
  return parseFloat(d.min_payment) || 0;
}

function buildMonthlyBalanceSeries() {
  const trackedDebts = state.debts.filter(d =>
    state.rateMap[d.currency] && state.rateMap[state.quoteCurrency]
  );
  if (!trackedDebts.length) return [];

  const today = new Date();
  let earliestMs = today.getTime();

  trackedDebts.forEach(d => {
    const sd = d.start_date ? parseLocalDate(d.start_date)
             : d.created_at ? new Date(d.created_at) : null;
    if (sd && !isNaN(sd) && sd.getTime() < earliestMs) earliestMs = sd.getTime();
  });
  state.payments.forEach(p => {
    const pd = parseLocalDate(p.date);
    if (!isNaN(pd) && pd.getTime() < earliestMs) earliestMs = pd.getTime();
  });

  const earliest = new Date(earliestMs);
  const months   = [];
  const c = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
  while (c.getTime() <= today.getTime()) {
    months.push(new Date(c));
    c.setMonth(c.getMonth() + 1);
  }
  if (months.length < 2) return [];
  const displayMonths = months.length > 36 ? months.slice(-36) : months;

  const paysByDebt = {};
  state.payments.forEach(p => {
    if (!paysByDebt[p.debt_id]) paysByDebt[p.debt_id] = [];
    paysByDebt[p.debt_id].push({ date: p.date, amount: parseFloat(p.amount) || 0 });
  });

  const todayMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  return displayMonths.map(monthStart => {
    const monthEnd  = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59);
    const label     = monthStart.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    const isCurrent = monthStart >= todayMonthStart;

    let total = 0;
    trackedDebts.forEach(d => {
      const debtStart = d.start_date ? parseLocalDate(d.start_date)
                      : d.created_at ? new Date(d.created_at) : null;
      if (debtStart && !isNaN(debtStart) && debtStart > monthEnd) return;

      const currentBal = parseFloat(d.balance) || 0;
      if (isCurrent) { total += toQuote(currentBal, d.currency); return; }

      let bal = currentBal;
      (paysByDebt[d.id] || []).forEach(p => {
        if (parseLocalDate(p.date) > monthEnd) bal += p.amount;
      });

      const origBal = parseFloat(d.original_balance);
      if (origBal > 0 && bal > origBal) bal = origBal;

      total += toQuote(Math.max(0, bal), d.currency);
    });

    return { label, value: Math.max(0, total) };
  });
}

function renderDebtChart(series) {
  const wrap = el('debtChartWrap');
  if (!wrap) return;

  if (typeof Chart === 'undefined') {
    wrap.innerHTML = `<p class="chart-empty">Chart.js failed to load — check your internet connection.</p>`;
    return;
  }

  if (!series.length) {
    wrap.innerHTML = `<p class="chart-empty">Log payments in the Payments tab to see your debt reduction over time.</p>`;
    return;
  }

  wrap.innerHTML = '<div class="chart-container"><canvas id="debtChart"></canvas></div>';
  const ctx = el('debtChart').getContext('2d');

  const isDark    = document.documentElement.getAttribute('data-theme') === 'dark';
  const lineCol   = isDark ? '#26C0B0' : '#0F9D8C';
  const fillCol   = isDark ? 'rgba(38,192,176,0.10)' : 'rgba(15,157,140,0.12)';
  const gridCol   = isDark ? '#21262D' : '#DCE2EA';
  const tickCol   = isDark ? '#8B96A8' : '#6B7787';
  const tooltipBg = isDark ? '#161B22' : '#ffffff';
  const tooltipFg = isDark ? '#E2E8F0' : '#16202C';
  const sym       = CURRENCY_SYMBOLS[state.quoteCurrency] || (state.quoteCurrency + ' ');
  const mono      = "'IBM Plex Mono', monospace";

  state.chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: series.map(d => d.label),
      datasets: [{
        data: series.map(d => d.value),
        borderColor: lineCol,
        backgroundColor: fillCol,
        fill: true,
        tension: 0.35,
        pointRadius: series.length > 20 ? 0 : 3,
        pointHoverRadius: 5,
        pointBackgroundColor: lineCol,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg,
          borderColor: gridCol,
          borderWidth: 1,
          titleColor: tickCol,
          bodyColor: tooltipFg,
          titleFont: { family: mono, size: 10 },
          bodyFont:  { family: mono, size: 12 },
          callbacks: {
            title: items => items[0].label,
            label: ctx  => ' ' + sym + ctx.parsed.y.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
          },
        },
      },
      scales: {
        x: {
          ticks: { color: tickCol, font: { family: mono, size: 9 }, maxRotation: 45, maxTicksLimit: 12 },
          grid:  { color: gridCol },
          border: { display: false },
        },
        y: {
          ticks: {
            color: tickCol,
            font: { family: mono, size: 9 },
            maxTicksLimit: 5,
            callback: v => sym + (v >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v)),
          },
          grid:   { color: gridCol },
          border: { display: false },
        },
      },
    },
  });
}

function dashRowHTML(d) {
  const noRate    = !state.rateMap[d.currency] || !state.rateMap[state.quoteCurrency];
  const warn      = `<span class="no-rate">&#9888;&nbsp;no rate</span>`;
  const balOrig   = fmtAmount(d.balance, d.currency);
  const balQuote  = noRate ? warn : fmtAmount(toQuote(d.balance, d.currency), state.quoteCurrency);
  const minVal    = computeMonthlyMin(d);
  const minQuote  = noRate ? warn : (minVal ? fmtAmount(toQuote(minVal, d.currency), state.quoteCurrency) : '&mdash;');
  const typeBadge = `<span class="badge badge-${esc(d.type)}">${esc(d.type)}</span>`;
  const subBadge  = d.subtype ? ` <span class="badge badge-subtype">${esc(d.subtype.replace(/_/g, ' '))}</span>` : '';
  const rate      = parseFloat(d.rate) || 0;

  return `<tr>
    <td class="td-name">${esc(d.name)}</td>
    <td>${typeBadge}${subBadge}</td>
    <td class="td-amount">${balOrig}</td>
    <td class="td-amount">${balQuote}</td>
    <td class="td-amount">${minQuote}</td>
    <td class="td-mono">${rate > 0 ? rate + '%' : '&mdash;'}</td>
  </tr>`;
}

function dashTypeSummaryHTML(active) {
  return ['loan', 'card', 'friend'].map(type => {
    const group = active.filter(d => d.type === type);
    if (!group.length) return '';

    let totalBal = 0, totalMin = 0, hasWarn = false;
    group.forEach(d => {
      if (!state.rateMap[d.currency] || !state.rateMap[state.quoteCurrency]) {
        hasWarn = true;
      } else {
        totalBal += toQuote(parseFloat(d.balance) || 0, d.currency);
        totalMin += toQuote(computeMonthlyMin(d),        d.currency);
      }
    });

    const warnSpan = hasWarn ? ' <span class="no-rate">&#9888;</span>' : '';
    const minCell  = totalMin > 0
      ? `<strong>${fmtAmount(totalMin, state.quoteCurrency)}${warnSpan}</strong>`
      : `<span style="color:var(--muted);">&mdash;</span>`;

    return `<tr class="type-summary-row">
      <td colspan="2">
        <span class="badge badge-${esc(type)}">${esc(type)}</span>&ensp;
        <strong>${group.length}&nbsp;${type}${group.length !== 1 ? 's' : ''}</strong>
      </td>
      <td></td>
      <td class="td-amount"><strong>${fmtAmount(totalBal, state.quoteCurrency)}${warnSpan}</strong></td>
      <td class="td-amount">${minCell}</td>
      <td></td>
    </tr>`;
  }).join('');
}

export function renderDashboard() {
  if (state.chart) { state.chart.destroy(); state.chart = null; }

  const active  = state.debts.filter(d => d.status === 'active');
  const paidOff = state.debts.filter(d => d.status === 'paid_off');

  let totalDebt = 0, totalMin = 0, hasWarning = false;
  active.forEach(d => {
    if (!state.rateMap[d.currency] || !state.rateMap[state.quoteCurrency]) {
      hasWarning = true;
      return;
    }
    totalDebt += toQuote(parseFloat(d.balance) || 0, d.currency);
    totalMin  += toQuote(computeMonthlyMin(d),        d.currency);
  });

  const warnNote = hasWarning
    ? `<p class="summary-card-sub"><span class="no-rate">&#9888;&nbsp;some rates missing</span></p>`
    : `<p class="summary-card-sub">all active debts combined</p>`;

  const summaryCards = `
    <div class="summary-grid">
      <div class="summary-card">
        <p class="summary-card-label">Total debt</p>
        <p class="summary-card-value">${fmtAmount(totalDebt, state.quoteCurrency)}</p>
        ${warnNote}
      </div>
      <div class="summary-card">
        <p class="summary-card-label">Monthly minimum</p>
        <p class="summary-card-value">${fmtAmount(totalMin, state.quoteCurrency)}</p>
        <p class="summary-card-sub">minimum payments this month</p>
      </div>
      <div class="summary-card">
        <p class="summary-card-label">Active debts</p>
        <p class="summary-card-value">${active.length}</p>
        <p class="summary-card-sub">ongoing obligation${active.length !== 1 ? 's' : ''}</p>
      </div>
      <div class="summary-card">
        <p class="summary-card-label">Paid off</p>
        <p class="summary-card-value">${paidOff.length}</p>
        <p class="summary-card-sub">${paidOff.length === 1 ? '1 debt closed' : paidOff.length + ' debts closed'}</p>
      </div>
    </div>`;

  const series = buildMonthlyBalanceSeries();
  const chartSection = `
    <div class="sec-head" style="margin-top:4px;">
      <div class="sec-head-left"><h2>Balance over time</h2></div>
      <span style="font-size:12.5px;color:var(--muted);">${esc(state.quoteCurrency)}&thinsp;&middot;&thinsp;all debts</span>
    </div>
    <div class="chart-wrap" id="debtChartWrap"></div>`;

  if (!active.length) {
    el('dashboardContent').innerHTML = summaryCards + chartSection +
      `<p class="placeholder" style="margin-top:20px;">No active debts &mdash; add some in the Debts tab to see your breakdown.</p>`;
    renderDebtChart(series);
    return;
  }

  const sortedActive = [...active].sort((a, b) => {
    const bq = state.rateMap[b.currency] ? toQuote(parseFloat(b.balance) || 0, b.currency) : -1;
    const aq = state.rateMap[a.currency] ? toQuote(parseFloat(a.balance) || 0, a.currency) : -1;
    return bq - aq;
  });

  el('dashboardContent').innerHTML = `
    ${summaryCards}
    ${chartSection}

    <div class="sec-head" style="margin-top:28px;">
      <div class="sec-head-left"><h2>Breakdown</h2></div>
      <span style="font-size:12.5px;color:var(--muted);">Active debts &middot; highest balance first</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Name</th><th>Type</th>
          <th>Balance</th><th>&#8776;&nbsp;${esc(state.quoteCurrency)}</th>
          <th>Monthly min (${esc(state.quoteCurrency)})</th><th>Rate %</th>
        </tr></thead>
        <tbody>
          ${sortedActive.map(dashRowHTML).join('')}
          ${dashTypeSummaryHTML(active)}
        </tbody>
      </table>
    </div>
  `;

  renderDebtChart(series);
}
