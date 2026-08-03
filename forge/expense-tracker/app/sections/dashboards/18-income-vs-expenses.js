/* global Chart */
import { el, esc } from '../../core/utils.js';
import {
  monthRange, groupByMonth, sumAmountBase,
  getCssColors, baseChartOptions, fmtMonthKey,
} from './dashboard-utils.js';

// ── Monthly build ─────────────────────────────────────────────────────────────

function _buildMonthly(txs, monthKeys) {
  const today      = new Date();
  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const curYYYYMM  = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, '0')}`;

  const inByMonth  = groupByMonth(txs.filter(t => t.transaction_type === 'money-in'));
  const outByMonth = groupByMonth(txs.filter(t => t.transaction_type === 'money-out'));

  const incomeArr  = [];
  const expenseArr = [];
  const netArr     = [];
  const partial    = [];

  for (const mk of monthKeys) {
    const isPartial = mk === curYYYYMM;
    partial.push(isPartial);

    const inTxs  = inByMonth.get(mk)  || [];
    const outTxs = outByMonth.get(mk) || [];

    // Partial month: only count txs up to today
    const filterPartial = arr => isPartial
      ? arr.filter(t => {
          const d = new Date(t.transaction_date_utc);
          return new Date(d.getFullYear(), d.getMonth(), d.getDate()) <= todayLocal;
        })
      : arr;

    const inc = sumAmountBase(filterPartial(inTxs));
    const exp = sumAmountBase(filterPartial(outTxs));
    incomeArr.push(inc);
    expenseArr.push(exp);
    netArr.push(inc - exp);
  }

  return { incomeArr, expenseArr, netArr, partial };
}

// ── Chart options ─────────────────────────────────────────────────────────────

function _buildChartOptions(sym, C, isMobile) {
  const base = baseChartOptions(sym, C);
  return {
    ...base,
    plugins: {
      ...base.plugins,
      legend: { ...base.plugins.legend, display: true },
      tooltip: {
        ...base.plugins.tooltip,
        callbacks: {
          ...base.plugins.tooltip.callbacks,
          afterBody: tooltipItems => {
            const incomeItem = tooltipItems.find(t => t.datasetIndex === 0);
            const netItem    = tooltipItems.find(t => t.datasetIndex === 2);
            if (!incomeItem || !netItem) return [];
            const inc  = incomeItem.parsed.y || 0;
            const net  = netItem.parsed.y    || 0;
            if (inc <= 0) return [];
            const rate = Math.round(net / inc * 100);
            return [`  Savings rate: ${rate}%`];
          },
        },
      },
    },
    scales: {
      ...base.scales,
      x: {
        ...base.scales.x,
        stacked: isMobile,
        ticks: { ...base.scales.x.ticks, maxRotation: 0, maxTicksLimit: isMobile ? 4 : 6 },
      },
      y: { ...base.scales.y, stacked: isMobile },
    },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function render(containerId, { txs, from, to, sym }) {
  const container = el(containerId);
  if (!container) {
    console.warn('[dashboard-18] container not found:', containerId);
    return null;
  }

  const monthKeys                       = monthRange(from, to);
  const { incomeArr, expenseArr, netArr, partial } = _buildMonthly(txs, monthKeys);

  const totalIncome  = incomeArr.reduce((s, v) => s + v, 0);
  const totalExpense = expenseArr.reduce((s, v) => s + v, 0);
  const totalNet     = totalIncome - totalExpense;

  // Avg savings rate across months where income > 0
  const savingsRates = incomeArr.map((inc, i) => inc > 0 ? (netArr[i] / inc) * 100 : null).filter(r => r !== null);
  const avgRate      = savingsRates.length
    ? Math.round(savingsRates.reduce((s, r) => s + r, 0) / savingsRates.length)
    : null;

  const fmt      = v => sym + Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const netClass = totalNet >= 0 ? 'positive' : 'negative';

  const labels   = monthKeys.map((mk, i) => fmtMonthKey(mk) + (partial[i] ? '*' : ''));
  const hasPartial = partial.some(Boolean);

  const C        = getCssColors();
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const barStack = isMobile ? 'io' : undefined;

  container.innerHTML = `
    <div class="stat-cards">
      <div class="stat-card">
        <p class="stat-card-label">Total income</p>
        <p class="stat-card-value positive">${esc(fmt(totalIncome))}</p>
      </div>
      <div class="stat-card">
        <p class="stat-card-label">Total expenses</p>
        <p class="stat-card-value negative">${esc(fmt(totalExpense))}</p>
      </div>
      <div class="stat-card">
        <p class="stat-card-label">Net</p>
        <p class="stat-card-value ${netClass}">${esc(fmt(totalNet))}</p>
      </div>
      <div class="stat-card">
        <p class="stat-card-label">Avg savings rate</p>
        <p class="stat-card-value${avgRate !== null && avgRate >= 0 ? ' positive' : ''}">${esc(avgRate !== null ? avgRate + '%' : 'N/A')}</p>
      </div>
    </div>
    ${hasPartial ? '<p style="font-size:var(--text-xs);color:var(--muted);margin:0 0 8px">* partial month</p>' : ''}
    <div class="chart-wrap">
      <div class="chart-container" style="height:280px"><canvas></canvas></div>
    </div>`;

  const canvas = container.querySelector('canvas');
  if (!canvas) return null;

  console.log(`[dashboard-18] months=${monthKeys.length}, income=${totalIncome.toFixed(0)}, expense=${totalExpense.toFixed(0)}, net=${totalNet.toFixed(0)}`);

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label:           'Income',
          type:            'bar',
          data:            incomeArr,
          backgroundColor: 'rgba(52,211,153,0.8)',
          borderRadius:    3,
          stack:           barStack,
          order:           2,
        },
        {
          label:           'Expenses',
          type:            'bar',
          data:            expenseArr,
          backgroundColor: 'rgba(248,113,113,0.8)',
          borderRadius:    3,
          stack:           barStack,
          order:           2,
        },
        {
          label:        'Net',
          type:         'line',
          data:         netArr,
          borderColor:  '#f59e0b',
          borderWidth:  2,
          pointRadius:  4,
          pointHoverRadius: 6,
          fill:         false,
          tension:      0.3,
          order:        1,
        },
      ],
    },
    options: _buildChartOptions(sym, C, isMobile),
  });
}
