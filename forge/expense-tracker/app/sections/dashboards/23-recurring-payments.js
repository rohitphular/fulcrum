/* global Chart */
import { el, esc } from '../../core/utils.js';
import { state } from '../../core/state.js';
import {
  monthRange, sumAmountBase,
  getCssColors, baseChartOptions, buildPalette,
} from './dashboard-utils.js';

// ── Module state ──────────────────────────────────────────────────────────────
let _chart    = null;
let _recurring = [];  // detected [{counterparty, amount, frequency, count, lastDate, category}]
let _sortCol  = 'amount';
let _sortDir  = 'desc';
let _sym      = '';
let _C        = {};

function _setChart(c) {
  if (_chart && _chart !== c) { try { _chart.destroy(); } catch (_e) {} }
  _chart = c;
  state.dashChartInstance = c;
}

function _destroyChart() { _setChart(null); }

// ── Stats helpers ─────────────────────────────────────────────────────────────

function _mean(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }

function _stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = _mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function _daysBetween(a, b) { return Math.round(Math.abs(b - a) / 86400000); }

// ── Recurring detection ───────────────────────────────────────────────────────

function _detectRecurring(outTxs) {
  // Group by normalised counterparty name
  const map = new Map();
  for (const tx of outTxs) {
    const key = ((tx.counterparty || '').trim() || 'unknown').toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(tx);
  }

  const recurring = [];
  for (const [, rows] of map) {
    if (rows.length < 2) continue;

    const sorted  = [...rows].sort((a, b) => new Date(a.transaction_date_utc) - new Date(b.transaction_date_utc));
    const amounts = sorted.map(t => t.amount_base || 0);
    const amtMean = _mean(amounts);
    if (amtMean <= 0) continue;
    if (_stdDev(amounts) / amtMean > 0.05) continue; // too variable

    const dates = sorted.map(t => new Date(t.transaction_date_utc));
    const gaps  = dates.slice(1).map((d, i) => _daysBetween(dates[i], d));
    const gMean = _mean(gaps);
    const gSd   = _stdDev(gaps);

    let frequency = null;
    if (gMean >=  5 && gMean <=  9 && gSd <= 2) frequency = 'weekly';
    if (gMean >= 28 && gMean <= 35 && gSd <= 5) frequency = 'monthly';
    if (gMean >= 85 && gMean <= 95 && gSd <= 7) frequency = 'quarterly';
    if (!frequency) continue;

    recurring.push({
      counterparty: (sorted[0].counterparty || 'Unknown').trim(),
      amount:       amtMean,
      frequency,
      count:        sorted.length,
      lastDate:     dates[dates.length - 1],
      category:     sorted[sorted.length - 1].major_category || 'Other',
    });
  }

  return recurring.sort((a, b) => b.amount - a.amount);
}

// ── Table rendering ───────────────────────────────────────────────────────────

const FREQ_COLOR = { weekly: 'var(--teal)', monthly: '#f59e0b', quarterly: 'var(--ember)' };

function _renderTable(tbodyId) {
  const tbody = el(tbodyId);
  if (!tbody) return;

  const sign   = _sortDir === 'asc' ? 1 : -1;
  const sorted = [..._recurring].sort((a, b) => {
    switch (_sortCol) {
      case 'counterparty': return sign * a.counterparty.localeCompare(b.counterparty);
      case 'frequency':    return sign * a.frequency.localeCompare(b.frequency);
      case 'amount':       return sign * (a.amount - b.amount);
      case 'last_date':    return sign * (a.lastDate - b.lastDate);
      default:             return 0;
    }
  });

  const fmt = v => _sym + Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  tbody.innerHTML = sorted.map(r => `
    <tr style="border-bottom:1px solid var(--hair)">
      <td style="padding:10px 8px;font-size:var(--text-sm)">${esc(r.counterparty)}</td>
      <td style="padding:10px 8px;font-size:var(--text-sm);color:var(--muted)">${esc(r.category)}</td>
      <td style="padding:10px 8px;text-align:center">
        <span style="font-size:var(--text-xs);padding:2px 8px;border-radius:20px;background:${FREQ_COLOR[r.frequency]}22;color:${FREQ_COLOR[r.frequency]};white-space:nowrap">${esc(r.frequency)}</span>
      </td>
      <td style="padding:10px 8px;text-align:right;font-weight:600;font-size:var(--text-sm)">${esc(fmt(r.amount))}</td>
      <td style="padding:10px 8px;text-align:right;color:var(--muted);font-size:var(--text-sm)">${esc(fmtDate(r.lastDate))}</td>
    </tr>`).join('');
}

function _thStyle() {
  return `padding:8px;font-size:var(--text-xs);color:var(--muted);font-weight:600;text-align:left;cursor:pointer;white-space:nowrap;user-select:none`;
}

function _thHtml(col, label, align) {
  const indicator = _sortCol === col ? (_sortDir === 'desc' ? ' ↓' : ' ↑') : '';
  return `<th data-sort="${col}" style="${_thStyle()}${align === 'right' ? ';text-align:right' : align === 'center' ? ';text-align:center' : ''}">${esc(label)}${indicator}</th>`;
}

// ── Bar chart ─────────────────────────────────────────────────────────────────

function _renderBar(canvasId) {
  const canvas = el(canvasId);
  if (!canvas || !_recurring.length) { _setChart(null); return; }

  const palette    = buildPalette(_C);
  const catColors  = {};
  let catIdx       = 0;
  _recurring.forEach(r => {
    if (!catColors[r.category]) catColors[r.category] = palette[catIdx++ % palette.length];
  });

  const freqs  = _recurring.map(r => r.frequency);
  const labels = _recurring.map(r => r.counterparty.length > 22 ? r.counterparty.slice(0, 21) + '…' : r.counterparty);
  const data   = _recurring.map(r => r.amount);
  const colors = _recurring.map(r => catColors[r.category]);

  const base = baseChartOptions(_sym, _C);
  _setChart(new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderRadius: 4 }],
    },
    options: {
      ...base,
      indexAxis: 'y',
      plugins: {
        ...base.plugins,
        legend: { display: false },
        tooltip: {
          ...base.plugins.tooltip,
          callbacks: {
            label: ctx => `  ${_sym}${Math.abs(ctx.raw).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / ${freqs[ctx.dataIndex]}`,
          },
        },
      },
      scales: {
        ...base.scales,
        x: {
          ...base.scales.x,
          ticks: {
            ...base.scales.x.ticks,
            callback: v => `${_sym}${Math.abs(v).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`,
          },
        },
        y: { ...base.scales.y, ticks: { color: _C.muted, font: { size: 12 } } },
      },
    },
  }));
}

// ── Sort event attachment ─────────────────────────────────────────────────────

function _attachSort(containerId) {
  const container = el(containerId);
  if (!container) return;
  container.querySelectorAll('[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (_sortCol === col) _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
      else { _sortCol = col; _sortDir = 'desc'; }
      _renderTable('dash23-tbody');
      // refresh sort indicators in headers
      container.querySelectorAll('[data-sort]').forEach(h => {
        const base = h.textContent.replace(/[ ↓↑]+$/, '');
        h.textContent = base + (_sortCol === h.dataset.sort ? (_sortDir === 'desc' ? ' ↓' : ' ↑') : '');
      });
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function render(containerId, { txs, from, to, sym }) {
  _chart     = null;
  _recurring = [];
  _sortCol   = 'amount';
  _sortDir   = 'desc';
  _sym       = sym;

  const container = el(containerId);
  if (!container) {
    console.warn('[dashboard-23] container not found:', containerId);
    return { destroy() { _destroyChart(); } };
  }

  const outTxs = txs.filter(t => t.transaction_type === 'money-out');
  _recurring   = _detectRecurring(outTxs);
  _C           = getCssColors();

  const fmt = v => sym + Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  if (!_recurring.length) {
    container.innerHTML = `<div class="chart-wrap"><p class="chart-empty">No recurring payments detected in this period.</p></div>`;
    _setChart(null);
    return { destroy() { _destroyChart(); } };
  }

  // Stat card values
  const MONTHLY_EQUIV = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3 };
  const totalMonthly  = _recurring.reduce((s, r) => s + r.amount * MONTHLY_EQUIV[r.frequency], 0);

  const inTxs        = txs.filter(t => t.transaction_type === 'money-in');
  const monthCount   = Math.max(1, monthRange(from, to).length);
  const monthlyIncome = sumAmountBase(inTxs) / monthCount;
  const pctOfIncome  = monthlyIncome > 0 ? Math.round((totalMonthly / monthlyIncome) * 100) : null;

  const top = _recurring[0];

  // Chart height
  const barH = Math.max(200, _recurring.length * 44);

  container.innerHTML = `
    <div class="stat-cards">
      <div class="stat-card">
        <p class="stat-card-label">Recurring / month</p>
        <p class="stat-card-value negative">${esc(fmt(totalMonthly))}</p>
      </div>
      <div class="stat-card">
        <p class="stat-card-label">% of income</p>
        <p class="stat-card-value${pctOfIncome !== null && pctOfIncome > 50 ? ' negative' : ''}">${esc(pctOfIncome !== null ? pctOfIncome + '%' : '—')}</p>
      </div>
      <div class="stat-card">
        <p class="stat-card-label">Count</p>
        <p class="stat-card-value">${esc(String(_recurring.length))}</p>
      </div>
      <div class="stat-card">
        <p class="stat-card-label">Largest</p>
        <p class="stat-card-value" style="font-size:var(--text-base)">${esc(top.counterparty.length > 12 ? top.counterparty.slice(0, 11) + '…' : top.counterparty)}</p>
        <p class="stat-card-sub">${esc(sym + top.amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}</p>
      </div>
    </div>
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:20px">
      <table style="width:100%;border-collapse:collapse;min-width:460px">
        <thead>
          <tr style="border-bottom:2px solid var(--hair)">
            ${_thHtml('counterparty', 'Payee', 'left')}
            ${_thHtml('frequency',    'Category', 'left')}
            ${_thHtml('frequency',    'Frequency', 'center')}
            ${_thHtml('amount',       'Amount', 'right')}
            ${_thHtml('last_date',    'Last paid', 'right')}
          </tr>
        </thead>
        <tbody id="dash23-tbody"></tbody>
      </table>
    </div>
    <div class="chart-container" style="height:${barH}px">
      <canvas id="dash23-canvas" style="width:100%;height:100%"></canvas>
    </div>`;

  _renderTable('dash23-tbody');
  _renderBar('dash23-canvas');
  _attachSort(containerId);

  console.log(`[dashboard-23] recurring=${_recurring.length}, monthly_total=${totalMonthly.toFixed(0)}`);

  return { destroy() { _destroyChart(); } };
}
