/* global Chart */
import { el, esc } from '../../core/utils.js';
import { state } from '../../core/state.js';
import {
  sumAmountBase, getCssColors, buildPalette, baseChartOptions, renderDrillTxTable,
} from './dashboard-utils.js';

// ── Module-level chart reference (needed for drill-down lifecycle) ─────────────
// The coordinator tracks state.dashChartInstance; we mirror it here so the
// click handler can destroy the current chart before creating the next level.

let _chart = null;

function _destroyChart() {
  if (_chart) {
    try { _chart.destroy(); } catch (_) {}
    _chart = null;
    state.dashChartInstance = null;
  }
}

function _setChart(instance) {
  _chart = instance;
  state.dashChartInstance = instance;
}

// ── Grouping helpers ──────────────────────────────────────────────────────────

function _groupMajors(moneyOut) {
  const map = new Map();
  moneyOut.forEach(t => {
    const cat = t.major_category || 'Uncategorised';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(t);
  });
  return [...map.entries()]
    .map(([cat, txs]) => ({ cat, amount: sumAmountBase(txs) }))
    .sort((a, b) => b.amount - a.amount);
}

function _groupMinors(moneyOut, major) {
  const relevant = moneyOut.filter(t => (t.major_category || 'Uncategorised') === major);
  const map = new Map();
  relevant.forEach(t => {
    const cat = t.minor_category || 'Other';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(t);
  });
  return [...map.entries()]
    .map(([cat, txs]) => ({ cat, amount: sumAmountBase(txs) }))
    .sort((a, b) => b.amount - a.amount);
}

// ── Chart options ─────────────────────────────────────────────────────────────

function _buildChartOptions(sym, C, onClick) {
  const base = baseChartOptions(sym, C);
  return {
    ...base,
    indexAxis: 'y',
    onClick,
    plugins: {
      ...base.plugins,
      legend: { display: false },
    },
    scales: {
      x: {
        // value axis — currency formatter from base y
        ...base.scales.y,
      },
      y: {
        // category axis — plain labels, no currency callback
        ticks: { color: C.muted, font: { size: 12 } },
        grid:   { color: C.hair },
        border: { display: false },
      },
    },
  };
}

// ── Canvas height ─────────────────────────────────────────────────────────────

function _canvasHeight(numBars) {
  return Math.max(120, numBars * 36 + 40);
}

// ── Format amount ─────────────────────────────────────────────────────────────

function _fmt(sym, v) {
  return sym + Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Level 1 — major categories ────────────────────────────────────────────────

function _renderLevel1(container, moneyOut, sym) {
  const majors  = _groupMajors(moneyOut);
  const total   = majors.reduce((s, { amount }) => s + amount, 0);
  const C       = getCssColors();
  const palette = buildPalette(C);
  const colors  = majors.map((_, i) => palette[i % palette.length]);

  container.innerHTML = `
    <div class="stat-cards">
      <div class="stat-card">
        <p class="stat-card-label">Total spend</p>
        <p class="stat-card-value">${esc(_fmt(sym, total))}</p>
      </div>
      <div class="stat-card">
        <p class="stat-card-label">Categories</p>
        <p class="stat-card-value">${esc(String(majors.length))}</p>
        <p class="stat-card-sub">tap a bar to drill in</p>
      </div>
    </div>
    <div class="chart-wrap">
      <div class="chart-container" style="height:${_canvasHeight(majors.length)}px"><canvas></canvas></div>
    </div>`;

  const canvas = container.querySelector('canvas');
  if (!canvas) return null;

  const onClick = (_, elements) => {
    if (!elements.length) return;
    const major = majors[elements[0].index].cat;
    const color = colors[elements[0].index % colors.length];
    state.dashDrillMajor = major;
    _destroyChart();
    _renderLevel2(container, moneyOut, major, color, sym);
  };

  console.log(`[dashboard-11] level1 — ${majors.length} major categories, total=${total.toFixed(0)}`);

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels:   majors.map(({ cat }) => cat),
      datasets: [{ data: majors.map(({ amount }) => amount), backgroundColor: colors, borderRadius: 4 }],
    },
    options: _buildChartOptions(sym, C, onClick),
  });
  _setChart(chart);
  return chart;
}

// ── Level 2 — minor categories within a major ─────────────────────────────────

function _renderLevel2(container, moneyOut, major, majorColor, sym) {
  const minors = _groupMinors(moneyOut, major);
  const total  = minors.reduce((s, { amount }) => s + amount, 0);
  const C      = getCssColors();

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
      <button data-action="drill-back"
        style="min-width:44px;min-height:44px;padding:0 12px;border:1px solid var(--hair);border-radius:6px;background:var(--panel);color:var(--ink);font-size:var(--text-sm);cursor:pointer">
        ← Back
      </button>
      <h3 style="font-size:var(--text-sm);font-weight:600;margin:0">${esc(major)} — minor breakdown</h3>
    </div>
    <div class="stat-cards">
      <div class="stat-card">
        <p class="stat-card-label">Total (${esc(major)})</p>
        <p class="stat-card-value">${esc(_fmt(sym, total))}</p>
      </div>
      <div class="stat-card">
        <p class="stat-card-label">Sub-categories</p>
        <p class="stat-card-value">${esc(String(minors.length))}</p>
        <p class="stat-card-sub">tap a bar to see transactions</p>
      </div>
    </div>
    <div class="chart-wrap">
      <div class="chart-container" style="height:${_canvasHeight(minors.length)}px"><canvas></canvas></div>
    </div>`;

  // Back button
  const backBtn = container.querySelector('[data-action="drill-back"]');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      state.dashDrillMajor = null;
      state.dashDrillMinor = null;
      _destroyChart();
      _renderLevel1(container, moneyOut, sym);
    });
  }

  const canvas = container.querySelector('canvas');
  if (!canvas) return null;

  console.log(`[dashboard-11] level2 — major="${major}" minors=${minors.length}, total=${total.toFixed(0)}`);

  const onClick = (_, elements) => {
    if (!elements.length) return;
    const minor = minors[elements[0].index].cat;
    state.dashDrillMinor = minor;
    _destroyChart();
    _renderLevel3(container, moneyOut, major, majorColor, minor, sym);
  };

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels:   minors.map(({ cat }) => cat),
      datasets: [{
        data:            minors.map(({ amount }) => amount),
        backgroundColor: majorColor,
        borderRadius:    4,
      }],
    },
    options: _buildChartOptions(sym, C, onClick),
  });
  _setChart(chart);
  return chart;
}

// ── Level 3 — transactions within a minor category ────────────────────────────

function _renderLevel3(container, moneyOut, major, majorColor, minor, sym) {
  const txs   = moneyOut
    .filter(t =>
      (t.major_category || 'Uncategorised') === major &&
      (t.minor_category || 'Other') === minor
    )
    .sort((a, b) => new Date(b.transaction_date_utc) - new Date(a.transaction_date_utc));

  const total = sumAmountBase(txs);
  const fmt   = v => sym + Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
      <button data-action="drill-back-minor"
        style="min-width:44px;min-height:44px;padding:0 12px;border:1px solid var(--hair);border-radius:6px;background:var(--panel);color:var(--ink);font-size:var(--text-sm);cursor:pointer">
        ← Back
      </button>
      <h3 style="font-size:var(--text-sm);font-weight:600;margin:0">${esc(major)} › ${esc(minor)}</h3>
    </div>
    <div class="stat-cards">
      <div class="stat-card">
        <p class="stat-card-label">Total</p>
        <p class="stat-card-value negative">${esc(fmt(total))}</p>
      </div>
      <div class="stat-card">
        <p class="stat-card-label">Transactions</p>
        <p class="stat-card-value">${esc(String(txs.length))}</p>
      </div>
    </div>
    ${renderDrillTxTable(txs, sym)}`;

  console.log(`[dashboard-11] level3 — major="${major}" minor="${minor}" txs=${txs.length}`);

  // Back button returns to level 2
  const backBtn = container.querySelector('[data-action="drill-back-minor"]');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      state.dashDrillMinor = null;
      _destroyChart();
      _renderLevel2(container, moneyOut, major, majorColor, sym);
    });
  }

  // No chart at level 3 — clear any stale chart reference
  _destroyChart();
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function render(containerId, { txs, sym }) {
  const container = el(containerId);
  if (!container) {
    console.warn('[dashboard-11] container not found:', containerId);
    return null;
  }

  const moneyOut = txs.filter(t => t.transaction_type === 'money-out');

  if (!moneyOut.length) {
    container.innerHTML = `<div class="chart-wrap"><p class="chart-empty">No spending data for this period.</p></div>`;
    return null;
  }

  if (state.dashDrillMajor) {
    // Verify the drilled major still has data in the current period
    const exists = moneyOut.some(t => (t.major_category || 'Uncategorised') === state.dashDrillMajor);
    if (!exists) { state.dashDrillMajor = null; state.dashDrillMinor = null; }
  }

  if (state.dashDrillMajor && state.dashDrillMinor) {
    const minorExists = moneyOut.some(t =>
      (t.major_category || 'Uncategorised') === state.dashDrillMajor &&
      (t.minor_category || 'Other') === state.dashDrillMinor
    );
    if (!minorExists) state.dashDrillMinor = null;
  }

  if (state.dashDrillMajor) {
    const C       = getCssColors();
    const palette = buildPalette(C);
    const majors  = _groupMajors(moneyOut);
    const idx     = majors.findIndex(({ cat }) => cat === state.dashDrillMajor);
    const color   = palette[Math.max(0, idx) % palette.length];
    if (state.dashDrillMinor) {
      return _renderLevel3(container, moneyOut, state.dashDrillMajor, color, state.dashDrillMinor, sym);
    }
    return _renderLevel2(container, moneyOut, state.dashDrillMajor, color, sym);
  }

  return _renderLevel1(container, moneyOut, sym);
}
