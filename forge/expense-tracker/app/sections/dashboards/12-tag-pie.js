/* global Chart */
import { el, esc } from '../../core/utils.js';
import { splitTags, sumAmountBase, getCssColors, buildPalette } from './dashboard-utils.js';

const MAX_SEGMENTS = 7;

// ── Tag aggregation ───────────────────────────────────────────────────────────
// Each tag on a transaction receives the FULL transaction amount (not split).
// Tags are normalised: lowercase + trimmed.

function _aggregateTags(moneyOut) {
  const pairs = splitTags(moneyOut);

  // Map: normalisedTag → { label, txSet (for dedup), txs[] }
  const map = new Map();
  pairs.forEach(({ tag, tx }) => {
    const key = tag.toLowerCase().trim();
    if (!key) return;
    if (!map.has(key)) map.set(key, { label: key, seen: new Set(), txs: [] });
    const entry = map.get(key);
    if (!entry.seen.has(tx)) {    // deduplicate if same tag appears twice in one tx
      entry.seen.add(tx);
      entry.txs.push(tx);
    }
  });

  return [...map.values()]
    .map(({ label, txs }) => ({ label, amount: sumAmountBase(txs), count: txs.length }))
    .sort((a, b) => b.amount - a.amount);
}

// ── Cap at MAX_SEGMENTS + "Other tags" ────────────────────────────────────────

function _buildSegments(rows) {
  if (rows.length > MAX_SEGMENTS + 1) {
    const top   = rows.slice(0, MAX_SEGMENTS);
    const other = rows.slice(MAX_SEGMENTS);
    const otherAmount = other.reduce((s, r) => s + r.amount, 0);
    const otherCount  = other.reduce((s, r) => s + r.count, 0);
    return [...top, { label: 'Other tags', amount: otherAmount, count: otherCount }];
  }
  return rows;
}

// ── HTML fragments ────────────────────────────────────────────────────────────

function _legendHtml(segments, colors, sym) {
  const fmt   = v => sym + v.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const items = segments.map(({ label, amount, count }, i) =>
    `<div style="display:flex;align-items:center;gap:6px;min-width:0">
      <span style="width:11px;height:11px;border-radius:2px;background:${esc(colors[i])};flex-shrink:0"></span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label)}</span>
      <span style="white-space:nowrap;color:var(--muted)">${esc(fmt(amount))}</span>
      <span style="white-space:nowrap;color:var(--muted);min-width:28px;text-align:right">${esc(String(count))} tx</span>
    </div>`
  ).join('');
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;margin-top:16px;font-size:var(--text-sm)">${items}</div>`;
}

function _tableHtml(rows, sym) {
  if (!rows.length) return '';
  const fmt  = v => sym + v.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const trHtml = rows.map(({ label, amount, count }) => {
    const avg = count > 0 ? amount / count : 0;
    return `<tr>
      <td style="padding:5px 8px 5px 0">${esc(label)}</td>
      <td style="padding:5px 8px;text-align:right">${esc(String(count))}</td>
      <td style="padding:5px 8px;text-align:right;white-space:nowrap">${esc(fmt(amount))}</td>
      <td style="padding:5px 0 5px 8px;text-align:right;white-space:nowrap;color:var(--muted)">${esc(fmt(avg))}</td>
    </tr>`;
  }).join('');

  return `
    <h3 style="font-size:var(--text-xs);color:var(--muted);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.06em">By tag</h3>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:var(--text-sm)">
        <thead>
          <tr style="border-bottom:1px solid var(--hair)">
            <th style="padding:5px 8px 5px 0;text-align:left;font-weight:600;color:var(--muted);font-size:var(--text-xs)">Tag</th>
            <th style="padding:5px 8px;text-align:right;font-weight:600;color:var(--muted);font-size:var(--text-xs)">Txs</th>
            <th style="padding:5px 8px;text-align:right;font-weight:600;color:var(--muted);font-size:var(--text-xs)">Total</th>
            <th style="padding:5px 0 5px 8px;text-align:right;font-weight:600;color:var(--muted);font-size:var(--text-xs)">Avg</th>
          </tr>
        </thead>
        <tbody>${trHtml}</tbody>
      </table>
    </div>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function render(containerId, { txs, sym }) {
  const container = el(containerId);
  if (!container) {
    console.warn('[dashboard-12] container not found:', containerId);
    return null;
  }

  const moneyOut = txs.filter(t => t.transaction_type === 'money-out');
  const allRows  = _aggregateTags(moneyOut);

  if (!allRows.length) {
    container.innerHTML = `<div class="chart-wrap"><p class="chart-empty">No tagged transactions in this period.</p></div>`;
    return null;
  }

  const segments  = _buildSegments(allRows);
  const labels    = segments.map(({ label }) => label);
  const amounts   = segments.map(({ amount }) => amount);
  const counts    = segments.map(({ count }) => count);

  const C       = getCssColors();
  const palette = buildPalette(C);
  const colors  = segments.map((_, i) => palette[i % palette.length]);

  const fmt       = v => sym + v.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const tagCount  = allRows.length;
  const totalTxs  = allRows.reduce((s, r) => s + r.count, 0);

  container.innerHTML = `
    <div class="stat-cards">
      <div class="stat-card">
        <p class="stat-card-label">Distinct tags</p>
        <p class="stat-card-value">${esc(String(tagCount))}</p>
      </div>
      <div class="stat-card">
        <p class="stat-card-label">Tagged txs</p>
        <p class="stat-card-value">${esc(String(totalTxs))}</p>
        <p class="stat-card-sub">of ${esc(String(moneyOut.length))} expenses</p>
      </div>
    </div>
    <div style="position:relative">
      <div class="chart-container"><canvas></canvas></div>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;width:90px">
        <p style="font-size:var(--text-xl);font-weight:700;line-height:1.2">${esc(String(tagCount))}</p>
        <p style="font-size:var(--text-xs);color:var(--muted);margin-top:2px">tags</p>
      </div>
    </div>
    ${_legendHtml(segments, colors, sym)}
    ${_tableHtml(allRows, sym)}`;

  const canvas = container.querySelector('canvas');
  if (!canvas) return null;

  console.log(`[dashboard-12] ${tagCount} tags, ${totalTxs} tagged txs`);

  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: amounts, backgroundColor: colors, borderWidth: 2, hoverOffset: 8 }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      cutout:              '55%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${fmt(ctx.raw)} — ${counts[ctx.dataIndex]} tx`,
          },
        },
      },
    },
  });
}
