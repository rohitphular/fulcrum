/* global Chart */
import { el, esc } from '../../core/utils.js';
import { state } from '../../core/state.js';
import { sumAmountBase, getCssColors, baseChartOptions } from './dashboard-utils.js';

const MAX_COUNTRIES = 15;

// Common country name normalisations (user might type abbreviations)
const COUNTRY_NORM = {
  'uk': 'United Kingdom', 'gb': 'United Kingdom', 'england': 'United Kingdom',
  'us': 'United States',  'usa': 'United States',  'america': 'United States',
  'uae': 'UAE',
  'in': 'India',
};

function _normalise(raw) {
  if (!raw || !raw.trim()) return 'Unknown';
  const t = raw.trim();
  return COUNTRY_NORM[t.toLowerCase()] || (t.charAt(0).toUpperCase() + t.slice(1));
}

// ── Data grouping ─────────────────────────────────────────────────────────────

function _groupByCountry(outTxs) {
  const map = new Map();
  for (const tx of outTxs) {
    const label = _normalise(tx.country || '');
    if (!map.has(label)) map.set(label, []);
    map.get(label).push(tx);
  }

  const rows = [...map.entries()].map(([label, txs]) => {
    const total = sumAmountBase(txs);
    const count = txs.length;

    // Most common major category in this country
    const catFreq = {};
    for (const t of txs) { const c = t.major_category || '—'; catFreq[c] = (catFreq[c] || 0) + 1; }
    const topCat = Object.entries(catFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

    return { label, total, count, avg: count ? total / count : 0, topCat };
  });

  // Sort: known countries by total desc, "Unknown" always last
  const known   = rows.filter(r => r.label !== 'Unknown').sort((a, b) => b.total - a.total);
  const unknown = rows.filter(r => r.label === 'Unknown');

  const allSorted = [...known, ...unknown];
  const top       = allSorted.slice(0, MAX_COUNTRIES);
  const rest      = allSorted.slice(MAX_COUNTRIES);

  if (rest.length) {
    const otherTotal = rest.reduce((s, r) => s + r.total, 0);
    const otherCount = rest.reduce((s, r) => s + r.count, 0);
    top.push({ label: 'Other', total: otherTotal, count: otherCount, avg: otherCount ? otherTotal / otherCount : 0, topCat: '—' });
  }

  return top;
}

// ── Bar colours ───────────────────────────────────────────────────────────────
// Top country = full teal; progressively lighter; "Unknown"/"Other" = muted.

function _barColors(rows, C) {
  const knownRows = rows.filter(r => r.label !== 'Unknown' && r.label !== 'Other');
  const n = Math.max(knownRows.length - 1, 1);
  return rows.map((r, i) => {
    if (r.label === 'Unknown' || r.label === 'Other') return C.muted + '88';
    const alpha = Math.round(255 - (i / n) * 170); // ff → 55 across ranked rows
    return C.teal + alpha.toString(16).padStart(2, '0');
  });
}

// ── Stat table ────────────────────────────────────────────────────────────────

function _tableHtml(rows, sym) {
  const fmt    = v => sym + Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtAvg = v => sym + Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const thStyle = `padding:8px;font-size:var(--text-xs);color:var(--muted);font-weight:600;white-space:nowrap`;
  const tdStyle = `padding:9px 8px;font-size:var(--text-sm);border-bottom:1px solid var(--hair)`;

  const bodyRows = rows.map(r => `
    <tr>
      <td style="${tdStyle};font-weight:${r.label === 'United Kingdom' ? '600' : '400'}">${esc(r.label)}</td>
      <td style="${tdStyle};text-align:right">${esc(fmt(r.total))}</td>
      <td style="${tdStyle};text-align:right;color:var(--muted)">${esc(String(r.count))}</td>
      <td style="${tdStyle};text-align:right;color:var(--muted)">${esc(fmtAvg(r.avg))}</td>
      <td style="${tdStyle};color:var(--muted)">${esc(r.topCat)}</td>
    </tr>`).join('');

  return `
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:20px">
      <table style="width:100%;border-collapse:collapse;min-width:420px">
        <thead>
          <tr style="border-bottom:2px solid var(--hair)">
            <th style="${thStyle}">Country</th>
            <th style="${thStyle};text-align:right">Spend</th>
            <th style="${thStyle};text-align:right">Txns</th>
            <th style="${thStyle};text-align:right">Avg/txn</th>
            <th style="${thStyle}">Top category</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function render(containerId, { txs, sym }) {
  const container = el(containerId);
  if (!container) {
    console.warn('[dashboard-24] container not found:', containerId);
    return null;
  }

  const outTxs = txs.filter(t => t.transaction_type === 'money-out');

  if (!outTxs.length) {
    container.innerHTML = `<div class="chart-wrap"><p class="chart-empty">No spend transactions for this period.</p></div>`;
    return null;
  }

  const rows = _groupByCountry(outTxs);
  const C    = getCssColors();

  const total       = rows.filter(r => r.label !== 'Other').reduce((s, r) => s + r.total, 0);
  const topCountry  = rows[0];
  const allUnknown  = rows.length === 1 && rows[0].label === 'Unknown';
  const countryCount = rows.filter(r => r.label !== 'Other' && r.label !== 'Unknown').length;

  const fmt    = v => sym + Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const colors = _barColors(rows, C);
  const h      = Math.max(240, rows.length * 44);

  const labels  = rows.map(r => r.label);
  const amounts = rows.map(r => r.total);
  const counts  = rows.map(r => r.count);

  container.innerHTML = `
    <div class="stat-cards">
      <div class="stat-card">
        <p class="stat-card-label">Total spend</p>
        <p class="stat-card-value negative">${esc(fmt(total))}</p>
      </div>
      <div class="stat-card">
        <p class="stat-card-label">Countries</p>
        <p class="stat-card-value">${esc(String(countryCount))}</p>
      </div>
      <div class="stat-card">
        <p class="stat-card-label">Top country</p>
        <p class="stat-card-value" style="font-size:var(--text-base)">${esc(topCountry?.label || '—')}</p>
        <p class="stat-card-sub">${esc(topCountry ? fmt(topCountry.total) : '')}</p>
      </div>
      <div class="stat-card">
        <p class="stat-card-label">Top country %</p>
        <p class="stat-card-value">${esc(total > 0 && topCountry ? Math.round((topCountry.total / total) * 100) + '%' : '—')}</p>
      </div>
    </div>
    ${allUnknown ? '<p style="font-size:var(--text-xs);color:var(--muted);margin:0 0 12px">Country data missing — add it when entering transactions.</p>' : ''}
    <div class="chart-container" style="height:${h}px">
      <canvas id="dash24-canvas" style="width:100%;height:100%"></canvas>
    </div>
    ${_tableHtml(rows, sym)}`;

  const canvas = el('dash24-canvas');
  if (!canvas) return null;

  console.log(`[dashboard-24] countries=${rows.length}, total=${total.toFixed(0)}`);

  const base = baseChartOptions(sym, C);
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data:            amounts,
        backgroundColor: colors,
        borderRadius:    4,
      }],
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
            label: ctx => `  ${sym}${Math.abs(ctx.raw).toLocaleString('en-GB', { maximumFractionDigits: 0 })} · ${counts[ctx.dataIndex]} txn${counts[ctx.dataIndex] === 1 ? '' : 's'}`,
          },
        },
      },
      scales: {
        ...base.scales,
        x: {
          ...base.scales.x,
          ticks: {
            ...base.scales.x.ticks,
            callback: v => `${sym}${Math.abs(v).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`,
          },
        },
        y: { ...base.scales.y, ticks: { color: C.muted, font: { size: 12 } } },
      },
    },
  });
}
