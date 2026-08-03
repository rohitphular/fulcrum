/* global Chart */
import { el, esc } from '../../core/utils.js';
import {
  groupByMonth, monthRange, sumAmountBase,
  getCssColors, buildPalette, baseChartOptions, fmtMonthKey,
} from './dashboard-utils.js';

const MAX_VISIBLE = 6;  // top N tags visible by default; rest togglable via legend

// ── Monthly tag attribution ────────────────────────────────────────────────────
// Full attribution: each tag on a tx receives the full tx amount (not split).

function _buildTagMonthly(moneyOut, monthKeys) {
  const byMonth   = groupByMonth(moneyOut);
  const tagMonthMap = new Map();  // tag → Map<monthKey, total>

  monthKeys.forEach(mk => {
    (byMonth.get(mk) || []).forEach(tx => {
      const tags = (tx.tags || '').split(';').map(t => t.toLowerCase().trim()).filter(Boolean);
      if (!tags.length) return;
      const amt = sumAmountBase([tx]);
      tags.forEach(tag => {
        if (!tagMonthMap.has(tag)) tagMonthMap.set(tag, new Map());
        const monthMap = tagMonthMap.get(tag);
        monthMap.set(mk, (monthMap.get(mk) || 0) + amt);
      });
    });
  });

  return tagMonthMap;
}

// ── Chart options ─────────────────────────────────────────────────────────────

function _buildChartOptions(sym, C) {
  const base = baseChartOptions(sym, C);
  return {
    ...base,
    plugins: { ...base.plugins, legend: { ...base.plugins.legend, display: true } },
    scales:  { ...base.scales, x: { ...base.scales.x, ticks: { ...base.scales.x.ticks, maxTicksLimit: 6 } } },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function render(containerId, { txs, sym, from, to }) {
  const container = el(containerId);
  if (!container) {
    console.warn('[dashboard-13] container not found:', containerId);
    return null;
  }

  const moneyOut  = txs.filter(t => t.transaction_type === 'money-out');
  const monthKeys = monthRange(from, to);
  const tagMonthMap = _buildTagMonthly(moneyOut, monthKeys);

  if (!tagMonthMap.size) {
    container.innerHTML = `<div class="chart-wrap"><p class="chart-empty">No tagged transactions in this period.</p></div>`;
    return null;
  }

  // Sort tags by grand total descending
  const sorted = [...tagMonthMap.entries()]
    .map(([tag, monthMap]) => ({ tag, total: [...monthMap.values()].reduce((s, v) => s + v, 0) }))
    .sort((a, b) => b.total - a.total);

  const C       = getCssColors();
  const palette = buildPalette(C);
  const labels  = monthKeys.map(fmtMonthKey);

  const datasets = sorted.map(({ tag }, i) => {
    const monthMap = tagMonthMap.get(tag);
    return {
      label:            tag,
      data:             monthKeys.map(mk => monthMap.get(mk) || 0),
      borderColor:      palette[i % palette.length],
      backgroundColor:  palette[i % palette.length] + '22',
      tension:          0.3,
      pointRadius:      5,
      pointHoverRadius: 7,
      hidden:           i >= MAX_VISIBLE,
    };
  });

  const fmt      = v => sym + Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const topTag   = sorted[0];
  const tagCount = sorted.length;

  container.innerHTML = `
    <div class="stat-cards">
      <div class="stat-card">
        <p class="stat-card-label">Distinct tags</p>
        <p class="stat-card-value">${esc(String(tagCount))}</p>
        ${tagCount > MAX_VISIBLE ? `<p class="stat-card-sub">top ${MAX_VISIBLE} shown</p>` : ''}
      </div>
      <div class="stat-card">
        <p class="stat-card-label">Top tag</p>
        <p class="stat-card-value" style="font-size:var(--text-base)">${esc(topTag.tag)}</p>
        <p class="stat-card-sub">${esc(fmt(topTag.total))}</p>
      </div>
    </div>
    <div class="chart-wrap">
      <div class="chart-container"><canvas></canvas></div>
    </div>`;

  const canvas = container.querySelector('canvas');
  if (!canvas) return null;

  console.log(`[dashboard-13] ${tagCount} tags, ${monthKeys.length} months, visible=${Math.min(tagCount, MAX_VISIBLE)}`);

  return new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: _buildChartOptions(sym, C),
  });
}
