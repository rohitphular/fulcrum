'use strict';

// ── Currency config ───────────────────────────────────────────────────────────
const CURRENCY_SYMBOLS = { GBP: '£', INR: '₹', USD: '$', EUR: '€', AED: 'AED ' };

// ── App state ─────────────────────────────────────────────────────────────────
const state = {
  debts:         [],
  payments:      [],
  rates:         [],
  rateMap:       {},   // { GBP: 1, INR: 105, ... }  units of currency per 1 GBP
  quoteCurrency: 'GBP',
  chart:         null, // Chart.js instance — destroyed before each dashboard re-render
};

// ── DebtAPI — wraps SheetsClient with debt-tracker-specific actions ───────────
const DebtAPI = {
  verify:        totp    => SheetsClient.get({ action: 'verify', totp }),
  listDebts:     ()      => SheetsClient.get({ action: 'list_debts' }),
  listPayments:  debtId  => SheetsClient.get({ action: 'list_payments', ...(debtId ? { debt_id: debtId } : {}) }),
  listRates:     ()      => SheetsClient.get({ action: 'list_rates' }),
  createDebt:    f       => SheetsClient.post({ action: 'create_debt',    ...f }),
  updateDebt:    (id, f) => SheetsClient.post({ action: 'update_debt',    id, ...f }),
  deleteDebt:    id      => SheetsClient.post({ action: 'delete_debt',    id }),
  createPayment: f       => SheetsClient.post({ action: 'create_payment', ...f }),
  deletePayment: id      => SheetsClient.post({ action: 'delete_payment', id }),
  upsertRate:    f       => SheetsClient.post({ action: 'upsert_rate',    ...f }),
};

// ── Tiny helpers ──────────────────────────────────────────────────────────────
const el = id => document.getElementById(id);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) { return '—'; }
}

function fmtAmount(amount, currency) {
  const num = parseFloat(amount) || 0;
  const sym = CURRENCY_SYMBOLS[currency] ?? (currency + ' ');
  return sym + num.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toQuote(amount, fromCurrency) {
  const from = state.rateMap[fromCurrency];
  const to   = state.rateMap[state.quoteCurrency];
  if (!from || !to) return parseFloat(amount) || 0;
  return ((parseFloat(amount) || 0) / from) * to;
}

// ── Date helpers ──────────────────────────────────────────────────────────────
// Parse YYYY-MM-DD (or ISO strings) as local dates without timezone shift
function parseLocalDate(s) {
  if (!s) return new Date(NaN);
  const parts = String(s).slice(0, 10).split('-').map(Number);
  return parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(NaN);
}

// Extract a YYYY-MM-DD string safe for <input type="date"> value attributes
function toDateInputVal(v) {
  if (!v) return '';
  const s = String(v).trim();
  return s.length >= 10 ? s.slice(0, 10) : '';
}

// ── Balance-over-time series ──────────────────────────────────────────────────
// Backwards-reconstructs monthly total debt by starting from the current balance
// and adding back any payments that occurred AFTER each month-end.
// Capped at original_balance when available (prevents interest overshoot).
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

  // Build list of months from earliest to today (cap at 36 for readability)
  const earliest = new Date(earliestMs);
  const months   = [];
  const c = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
  while (c.getTime() <= today.getTime()) {
    months.push(new Date(c));
    c.setMonth(c.getMonth() + 1);
  }
  if (months.length < 2) return [];
  const displayMonths = months.length > 36 ? months.slice(-36) : months;

  // Index payments by debt_id
  const paysByDebt = {};
  state.payments.forEach(p => {
    if (!paysByDebt[p.debt_id]) paysByDebt[p.debt_id] = [];
    paysByDebt[p.debt_id].push({ date: p.date, amount: parseFloat(p.amount) || 0 });
  });

  const todayMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  return displayMonths.map(monthStart => {
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59);
    const label    = monthStart.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    const isCurrent = monthStart >= todayMonthStart;

    let total = 0;
    trackedDebts.forEach(d => {
      const debtStart = d.start_date ? parseLocalDate(d.start_date)
                      : d.created_at ? new Date(d.created_at) : null;
      if (debtStart && !isNaN(debtStart) && debtStart > monthEnd) return;

      const currentBal = parseFloat(d.balance) || 0;
      if (isCurrent) { total += toQuote(currentBal, d.currency); return; }

      // Add back payments that hadn't happened yet at this month-end
      let bal = currentBal;
      (paysByDebt[d.id] || []).forEach(p => {
        if (parseLocalDate(p.date) > monthEnd) bal += p.amount;
      });

      // Cap at original_balance so interest accrual doesn't overshoot the start
      const origBal = parseFloat(d.original_balance);
      if (origBal > 0 && bal > origBal) bal = origBal;

      total += toQuote(Math.max(0, bal), d.currency);
    });

    return { label, value: Math.max(0, total) };
  });
}

// ── Chart renderer ────────────────────────────────────────────────────────────
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

  const isDark   = document.documentElement.getAttribute('data-theme') === 'dark';
  const lineCol  = isDark ? '#26C0B0' : '#0F9D8C';
  const fillCol  = isDark ? 'rgba(38,192,176,0.10)' : 'rgba(15,157,140,0.12)';
  const gridCol  = isDark ? '#21262D' : '#DCE2EA';
  const tickCol  = isDark ? '#8B96A8' : '#6B7787';
  const tooltipBg = isDark ? '#161B22' : '#ffffff';
  const tooltipFg = isDark ? '#E2E8F0' : '#16202C';
  const sym      = CURRENCY_SYMBOLS[state.quoteCurrency] || (state.quoteCurrency + ' ');
  const mono     = "'IBM Plex Mono', monospace";

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

// ── Loading indicator ─────────────────────────────────────────────────────────
function showLoading() { el('loadingBar').classList.remove('hidden'); }
function hideLoading() { el('loadingBar').classList.add('hidden'); }

// ── Theme ─────────────────────────────────────────────────────────────────────
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('dt_theme', theme);
  const btn = el('themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀' : '☽';
  // Re-render dashboard so the chart adopts the new theme's colours
  if (state.debts.length || state.payments.length) renderDashboard();
}

// ── Message banner ────────────────────────────────────────────────────────────
function showMsg(text, type = 'success') {
  const b = el('msgBanner');
  el('msgText').innerHTML = text;
  el('msgIco').textContent = type === 'warn' ? '!' : '›';
  b.className = `banner ${type === 'warn' ? 'warn' : 'success'}`;
  clearTimeout(showMsg._t);
  showMsg._t = setTimeout(() => b.classList.add('hidden'), 4500);
}

// ── Navigation ────────────────────────────────────────────────────────────────
const SECTIONS = ['dashboard', 'debts', 'payments', 'rates', 'projector'];

function showSection(id) {
  if (!SECTIONS.includes(id)) id = 'dashboard';
  SECTIONS.forEach(s => el(s).classList.toggle('hidden', s !== id));
  el('tabNav').querySelectorAll('.tab-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.section === id)
  );
  sessionStorage.setItem('dt_section', id);
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function showPinGate() {
  el('pinOverlay').classList.remove('hidden');
  el('pinInput').focus();
}
function hidePinGate() { el('pinOverlay').classList.add('hidden'); }

function pinError(msg) {
  el('pinError').textContent = msg;
  const inp = el('pinInput');
  inp.classList.add('shake');
  inp.addEventListener('animationend', () => inp.classList.remove('shake'), { once: true });
}

async function fetchGeo() {
  try {
    const data = await fetch('https://ipapi.co/json/').then(r => r.json());
    return { ip: data.ip || 'unknown', city: data.city || '', country: data.country_name || '', ua: navigator.userAgent };
  } catch (_) {
    return { ip: 'unknown', city: '', country: '', ua: navigator.userAgent };
  }
}

async function submitPin() {
  const pin  = el('pinInput').value.trim();
  const totp = el('totpInput').value.trim();

  if (!pin)                    { pinError('Enter your PIN.');                el('pinInput').focus();  return; }
  if (!totp)                   { pinError('Enter your authenticator code.'); el('totpInput').focus(); return; }
  if (!/^\d{6}$/.test(totp))  { pinError('Code must be 6 digits.');         el('totpInput').focus(); return; }

  el('pinSubmit').disabled = true;
  el('pinError').textContent = 'Connecting…';

  const meta = await fetchGeo();
  SheetsClient.init({ scriptUrl: window.CONFIG.SCRIPT_URL, pin, meta });

  try {
    const res = await DebtAPI.verify(totp);
    if (res.ok) {
      sessionStorage.setItem('dt_pin', pin);
      hidePinGate();
      await loadAll();
    } else if (res.error === 'locked') {
      pinError('Access locked. Contact admin to unlock.');
    } else if (res.error === 'totp_invalid') {
      pinError('Wrong authenticator code. Try again.');
      el('totpInput').value = '';
      el('totpInput').focus();
      el('pinSubmit').disabled = false;
    } else {
      pinError('Wrong PIN. Try again.');
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
    const [debtsRes, ratesRes, paymentsRes] = await Promise.all([
      DebtAPI.listDebts(), DebtAPI.listRates(), DebtAPI.listPayments()
    ]);

    if (!debtsRes.ok) {
      if (debtsRes.error === 'auth' || debtsRes.error === 'locked') {
        sessionStorage.removeItem('dt_pin');
        showPinGate();
        return;
      }
      showMsg('Failed to load debts: ' + (debtsRes.error || 'unknown'), 'warn');
    } else {
      state.debts = debtsRes.data || [];
    }

    if (!ratesRes.ok) {
      showMsg('Failed to load rates: ' + (ratesRes.error || 'unknown'), 'warn');
    } else {
      state.rates = ratesRes.data || [];
      state.rateMap = {};
      state.rates.forEach(r => { state.rateMap[r.currency] = parseFloat(r.rate) || 1; });
    }

    if (!paymentsRes.ok) {
      showMsg('Failed to load payments: ' + (paymentsRes.error || 'unknown'), 'warn');
    } else {
      state.payments = paymentsRes.data || [];
    }

    renderAll();
  } catch (_) {
    showMsg('Network error loading data. Try refreshing.', 'warn');
  } finally {
    hideLoading();
  }
}

// ── Section renderers (stubs — T-03 through T-07 fill these in) ───────────────
function renderAll() {
  renderDashboard();
  renderDebts();
  renderPayments();
  renderRates();
  renderProjector();
}

// ── DASHBOARD MODULE ──────────────────────────────────────────────────────────

function computeMonthlyMin(d) {
  if (d.type === 'card') {
    const pct = parseFloat(d.min_percent) || 0;
    const flr = parseFloat(d.min_floor)   || 0;
    const bal = parseFloat(d.balance)     || 0;
    return Math.max(bal * pct / 100, flr);
  }
  return parseFloat(d.min_payment) || 0;
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

function renderDashboard() {
  // Always destroy the old chart before replacing DOM
  if (state.chart) { state.chart.destroy(); state.chart = null; }

  const active  = state.debts.filter(d => d.status === 'active');
  const paidOff = state.debts.filter(d => d.status === 'paid_off');

  // Totals — skip debts whose currency has no rate; flag a warning instead
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

  // Sort by quote balance descending; debts with missing rates sort last
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
// ── DEBTS MODULE ──────────────────────────────────────────────────────────────

const debtsUI = { editId: null, deleteId: null, formOpen: false };

function openDebtForm(id) {
  debtsUI.editId   = id || null;
  debtsUI.formOpen = true;
  debtsUI.deleteId = null;
  renderDebts();
  requestAnimationFrame(() => el('debtFormCard')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
}

function closeDebtForm() {
  debtsUI.editId   = null;
  debtsUI.formOpen = false;
  renderDebts();
}

function updateDebtFormFields(type) {
  const isLoan = type === 'loan', isCard = type === 'card', isFriend = type === 'friend';
  el('dSubtypeWrap')?.classList.toggle('field-hidden',    !isLoan);
  el('dMinPaymentWrap')?.classList.toggle('field-hidden', !(isLoan || isFriend));
  el('dPrecomputedWrap')?.classList.toggle('field-hidden', !isLoan);
  el('dMinPercentWrap')?.classList.toggle('field-hidden', !isCard);
  el('dMinFloorWrap')?.classList.toggle('field-hidden',   !isCard);
}

function debtTableHead() {
  return `<thead><tr>
    <th>Name</th><th>Type</th><th>CCY</th>
    <th>Balance</th><th>&#8776;&nbsp;${esc(state.quoteCurrency)}</th>
    <th>Monthly min</th><th>Status</th><th>Actions</th>
  </tr></thead>`;
}

function debtRowHTML(d) {
  const typeBadge = `<span class="badge badge-${esc(d.type)}">${esc(d.type)}</span>`;
  const subBadge  = d.subtype
    ? ` <span class="badge badge-subtype">${esc(d.subtype.replace(/_/g, ' '))}</span>`
    : '';

  const balOrig  = fmtAmount(d.balance, d.currency);
  const balQuote = d.currency !== state.quoteCurrency
    ? fmtAmount(toQuote(d.balance, d.currency), state.quoteCurrency)
    : '&mdash;';

  let monthlyMin = '&mdash;';
  if (d.type === 'card') {
    const pct = parseFloat(d.min_percent) || 0;
    const flr = parseFloat(d.min_floor)   || 0;
    if (pct || flr) monthlyMin = `${pct}% (min&nbsp;${fmtAmount(flr, d.currency)})`;
  } else {
    const mp = parseFloat(d.min_payment) || 0;
    if (mp) monthlyMin = fmtAmount(mp, d.currency);
  }

  if (debtsUI.deleteId === d.id) {
    return `<tr>
      <td class="td-name">${esc(d.name)}</td>
      <td>${typeBadge}${subBadge}</td>
      <td colspan="5"><span class="confirm-text">Delete &ldquo;<strong>${esc(d.name)}</strong>&rdquo;? This cannot be undone.</span></td>
      <td><div class="row-actions">
        <button class="btn-link danger" data-action="confirm-delete">Yes, delete</button>
        <button class="btn-link" data-action="cancel-delete">Cancel</button>
      </div></td>
    </tr>`;
  }

  return `<tr>
    <td class="td-name">${esc(d.name)}</td>
    <td>${typeBadge}${subBadge}</td>
    <td>${esc(d.currency)}</td>
    <td class="td-amount">${balOrig}</td>
    <td class="td-amount-quote">${balQuote}</td>
    <td class="td-mono">${monthlyMin}</td>
    <td><span class="badge badge-${esc(d.status)}">${esc(d.status.replace(/_/g, ' '))}</span></td>
    <td><div class="row-actions">
      <button class="btn-link" data-action="edit" data-id="${esc(d.id)}">Edit</button>
      <button class="btn-link danger" data-action="delete" data-id="${esc(d.id)}">Delete</button>
    </div></td>
  </tr>`;
}

function debtFormHTML() {
  const debt     = debtsUI.editId ? state.debts.find(d => d.id === debtsUI.editId) : null;
  const type     = debt?.type || 'loan';
  const isLoan   = type === 'loan';
  const isCard   = type === 'card';
  const isFriend = type === 'friend';
  const ccys     = ['GBP', 'INR', 'USD', 'EUR', 'AED'];

  return `
<div class="card" id="debtFormCard" style="margin-bottom:22px;">
  <p class="sec-sub" style="margin:0 0 16px;">${debt ? 'Editing: ' + esc(debt.name) : 'Add a new debt'}</p>
  <form id="debtForm" novalidate>
    <div class="form-grid">

      <div class="field">
        <label for="dType">Type</label>
        <select id="dType">
          <option value="loan"   ${type === 'loan'   ? 'selected' : ''}>Loan</option>
          <option value="card"   ${type === 'card'   ? 'selected' : ''}>Card</option>
          <option value="friend" ${type === 'friend' ? 'selected' : ''}>Friend</option>
        </select>
      </div>

      <div class="field ${isLoan ? '' : 'field-hidden'}" id="dSubtypeWrap">
        <label for="dSubtype">Subtype</label>
        <select id="dSubtype">
          <option value="personal_loan" ${(!debt || debt.subtype === 'personal_loan') ? 'selected' : ''}>Personal Loan</option>
          <option value="home_loan"     ${debt?.subtype === 'home_loan' ? 'selected' : ''}>Home Loan</option>
        </select>
      </div>

      <div class="field" id="dNameWrap">
        <label for="dName">Name *</label>
        <input type="text" id="dName" placeholder="e.g. HDFC Personal Loan" maxlength="200" value="${esc(debt?.name || '')}">
        <div class="err-msg">Name is required.</div>
      </div>

      <div class="field">
        <label for="dCurrency">Currency</label>
        <select id="dCurrency">
          ${ccys.map(c => `<option value="${c}" ${(debt?.currency || 'GBP') === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>

      <div class="field" id="dBalanceWrap">
        <label for="dBalance">Balance *</label>
        <input type="number" id="dBalance" placeholder="0.00" min="0" step="0.01" value="${debt?.balance ?? ''}">
        <div class="err-msg">Enter a valid balance.</div>
      </div>

      <div class="field">
        <label for="dRate">Interest rate %</label>
        <input type="number" id="dRate" placeholder="0.00" min="0" max="100" step="0.01" value="${debt?.rate ?? ''}">
      </div>

      <div class="field ${(isLoan || isFriend) ? '' : 'field-hidden'}" id="dMinPaymentWrap">
        <label for="dMinPayment">Monthly payment</label>
        <input type="number" id="dMinPayment" placeholder="0.00" min="0" step="0.01" value="${debt?.min_payment ?? ''}">
      </div>

      <div class="field ${isCard ? '' : 'field-hidden'}" id="dMinPercentWrap">
        <label for="dMinPercent">Min % of balance</label>
        <input type="number" id="dMinPercent" placeholder="2.00" min="0" max="100" step="0.01" value="${debt?.min_percent ?? ''}">
      </div>

      <div class="field ${isCard ? '' : 'field-hidden'}" id="dMinFloorWrap">
        <label for="dMinFloor">Minimum floor</label>
        <input type="number" id="dMinFloor" placeholder="25.00" min="0" step="0.01" value="${debt?.min_floor ?? ''}">
      </div>

      ${debt ? `
      <div class="field">
        <label for="dStatus">Status</label>
        <select id="dStatus">
          <option value="active"   ${debt.status === 'active'   ? 'selected' : ''}>Active</option>
          <option value="paid_off" ${debt.status === 'paid_off' ? 'selected' : ''}>Paid off</option>
        </select>
      </div>` : '<input type="hidden" id="dStatus" value="active">'}

      <div class="field">
        <label for="dStartDate">Start date</label>
        <input type="date" id="dStartDate" value="${esc(toDateInputVal(debt?.start_date))}">
      </div>

    </div>

    <div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:16px;">
      <div class="field-check ${isLoan ? '' : 'field-hidden'}" id="dPrecomputedWrap">
        <input type="checkbox" id="dPrecomputed" ${debt?.precomputed ? 'checked' : ''}>
        <label for="dPrecomputed">Precomputed EMI (interest already baked into payment)</label>
      </div>
      <div class="field-check">
        <input type="checkbox" id="dInclude" ${!debt || debt.include_in_projector ? 'checked' : ''}>
        <label for="dInclude">Include in projector</label>
      </div>
    </div>

    <div class="form-actions">
      <button type="submit" class="btn btn-primary" id="dSaveBtn">${debt ? 'Update Debt' : 'Add Debt'}</button>
      <button type="button" class="btn btn-secondary" id="dCancelBtn">Cancel</button>
      <span class="hidden" id="dFormSpinner"><span class="spinner"></span>Saving&hellip;</span>
    </div>
  </form>
</div>`;
}

function renderDebts() {
  const active  = state.debts.filter(d => d.status === 'active');
  const paidOff = state.debts.filter(d => d.status === 'paid_off');

  const activeRows = active.length
    ? active.map(debtRowHTML).join('')
    : `<tr class="empty-row"><td colspan="8">No active debts &mdash; click &ldquo;+ Add Debt&rdquo; to get started.</td></tr>`;

  const paidSection = paidOff.length ? `
    <div class="paid-section">
      <button class="paid-toggle" id="paidToggle" aria-expanded="false">
        <span class="paid-toggle-arrow">&#8250;</span>&ensp;Paid off (${paidOff.length})
      </button>
      <div class="paid-content collapsed" id="paidContent">
        <div class="table-wrap">
          <table>
            ${debtTableHead()}
            <tbody id="paidDebtsBody">${paidOff.map(debtRowHTML).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>` : '';

  el('debtsContent').innerHTML = `
    <div class="sec-head">
      <div class="sec-head-left"><h2>Debts</h2></div>
      ${!debtsUI.formOpen ? '<button class="btn btn-primary" id="dAddBtn">+ Add Debt</button>' : ''}
    </div>

    ${debtsUI.formOpen ? debtFormHTML() : ''}

    <div class="table-wrap">
      <table>
        ${debtTableHead()}
        <tbody id="activeDebtsBody">${activeRows}</tbody>
      </table>
    </div>

    ${paidSection}
  `;

  wireDebtsEvents();
}

function wireDebtsEvents() {
  el('dAddBtn')?.addEventListener('click', () => openDebtForm(null));

  const form = el('debtForm');
  if (form) {
    form.addEventListener('submit', e => { e.preventDefault(); saveDebt(); });
    el('dType').addEventListener('change', e => updateDebtFormFields(e.target.value));
    el('dCancelBtn').addEventListener('click', closeDebtForm);
  }

  el('activeDebtsBody')?.addEventListener('click', debtRowClick);
  el('paidDebtsBody')?.addEventListener('click', debtRowClick);

  const pt = el('paidToggle');
  if (pt) {
    pt.addEventListener('click', () => {
      const isOpen = pt.getAttribute('aria-expanded') === 'true';
      pt.setAttribute('aria-expanded', String(!isOpen));
      el('paidContent').classList.toggle('collapsed', isOpen);
    });
  }
}

function debtRowClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'edit')           openDebtForm(id);
  if (action === 'delete')         startDeleteDebt(id);
  if (action === 'confirm-delete') confirmDeleteDebt();
  if (action === 'cancel-delete')  cancelDeleteDebt();
}

async function saveDebt() {
  const type    = el('dType').value;
  const name    = el('dName').value.trim();
  const balance = el('dBalance').value.trim();

  let valid = true;
  const nw = el('dNameWrap'), bw = el('dBalanceWrap');
  if (!name) { nw.classList.add('error'); valid = false; } else nw.classList.remove('error');
  if (balance === '' || isNaN(parseFloat(balance)) || parseFloat(balance) < 0) {
    bw.classList.add('error'); valid = false;
  } else bw.classList.remove('error');
  if (!valid) return;

  const fields = {
    name,
    type,
    subtype:              type === 'loan'               ? el('dSubtype').value                        : '',
    currency:             el('dCurrency').value,
    balance:              parseFloat(balance),
    rate:                 parseFloat(el('dRate').value)             || 0,
    min_payment:          (type === 'loan' || type === 'friend')    ? (parseFloat(el('dMinPayment').value) || 0) : 0,
    precomputed:          type === 'loan'               ? el('dPrecomputed').checked                  : false,
    min_percent:          type === 'card'               ? (parseFloat(el('dMinPercent').value)        || 0) : 0,
    min_floor:            type === 'card'               ? (parseFloat(el('dMinFloor').value)          || 0) : 0,
    include_in_projector: el('dInclude').checked,
    status:               el('dStatus').value,
    start_date:           el('dStartDate').value || '',
    // original_balance is set once on create — backend ignores it on update
    ...(debtsUI.editId ? {} : { original_balance: parseFloat(balance) }),
  };

  el('dSaveBtn').disabled = true;
  el('dFormSpinner').classList.remove('hidden');

  try {
    const res = debtsUI.editId
      ? await DebtAPI.updateDebt(debtsUI.editId, fields)
      : await DebtAPI.createDebt(fields);
    if (res.ok) {
      showMsg(debtsUI.editId ? 'Debt updated.' : 'Debt added.');
      closeDebtForm();
      await loadAll();
    } else {
      showMsg('Save failed: ' + (res.error || 'unknown error'), 'warn');
      el('dSaveBtn').disabled = false;
      el('dFormSpinner').classList.add('hidden');
    }
  } catch (_) {
    showMsg('Network error. Try again.', 'warn');
    el('dSaveBtn').disabled = false;
    el('dFormSpinner').classList.add('hidden');
  }
}

function startDeleteDebt(id)  { debtsUI.deleteId = id; renderDebts(); }
function cancelDeleteDebt()   { debtsUI.deleteId = null; renderDebts(); }

async function confirmDeleteDebt() {
  const id = debtsUI.deleteId;
  debtsUI.deleteId = null;
  const btn = document.querySelector('[data-action="confirm-delete"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
  try {
    const res = await DebtAPI.deleteDebt(id);
    if (res.ok) {
      showMsg('Debt deleted.');
      await loadAll();
    } else {
      showMsg('Delete failed: ' + (res.error || 'unknown'), 'warn');
      renderDebts();
    }
  } catch (_) {
    showMsg('Network error. Try again.', 'warn');
    renderDebts();
  }
}
// ── PAYMENTS MODULE ───────────────────────────────────────────────────────────

const paymentsUI = { deleteId: null, filterDebtId: '' };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Parse YYYY-MM-DD as local date to avoid UTC-midnight timezone shift
function fmtPayDate(s) {
  if (!s) return '—';
  try {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) { return s || '—'; }
}

function updatePayCurrencyLabel() {
  const debt = state.debts.find(d => d.id === el('pDebt')?.value);
  const lbl  = el('pCurrencyLabel');
  if (lbl) lbl.textContent = debt?.currency ? `(${debt.currency})` : '';
}

function payFormHTML() {
  const activeDebts = state.debts.filter(d => d.status === 'active');
  if (!activeDebts.length) {
    return `<div class="card" style="margin-bottom:22px;">
      <p style="color:var(--muted);font-size:13.5px;margin:0;">
        No active debts found.
        <a href="#" id="goToDebts" style="color:var(--teal);">Add a debt first</a>
        before logging payments.
      </p>
    </div>`;
  }
  return `
<div class="card" style="margin-bottom:22px;">
  <p class="sec-sub" style="margin:0 0 16px;">Log a payment against one of your active debts.</p>
  <form id="payForm" novalidate>
    <div class="form-grid">
      <div class="field" id="pDebtWrap">
        <label for="pDebt">Debt *</label>
        <select id="pDebt">
          <option value="">&#8212; select a debt &#8212;</option>
          ${activeDebts.map(d => `<option value="${esc(d.id)}">${esc(d.name)} (${esc(d.currency)})</option>`).join('')}
        </select>
        <div class="err-msg">Select a debt.</div>
      </div>
      <div class="field" id="pAmountWrap">
        <label for="pAmount">Amount * <span id="pCurrencyLabel" class="field-currency"></span></label>
        <input type="number" id="pAmount" placeholder="0.00" min="0.01" step="0.01">
        <div class="err-msg">Enter a valid amount greater than zero.</div>
      </div>
      <div class="field">
        <label for="pDate">Date *</label>
        <input type="date" id="pDate" value="${esc(todayISO())}">
      </div>
      <div class="field">
        <label for="pNote">Note</label>
        <input type="text" id="pNote" placeholder="Optional" maxlength="500">
      </div>
    </div>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary" id="pSaveBtn">Log Payment</button>
      <span class="hidden" id="pFormSpinner"><span class="spinner"></span>Saving&hellip;</span>
    </div>
  </form>
</div>`;
}

function payHistoryHTML() {
  // Build filter options from debts that actually have payments
  const seen = new Set();
  const debtOptions = [];
  state.payments.forEach(p => {
    if (!seen.has(p.debt_id)) {
      seen.add(p.debt_id);
      debtOptions.push({ id: p.debt_id, name: p.debt_name });
    }
  });
  debtOptions.sort((a, b) => a.name.localeCompare(b.name));

  const filtered = paymentsUI.filterDebtId
    ? state.payments.filter(p => p.debt_id === paymentsUI.filterDebtId)
    : state.payments;

  const sorted = [...filtered].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    return byDate !== 0 ? byDate : (b.created_at || '').localeCompare(a.created_at || '');
  });

  const rows = sorted.length
    ? sorted.map(payRowHTML).join('')
    : `<tr class="empty-row"><td colspan="6">${
        paymentsUI.filterDebtId ? 'No payments for this debt.' : 'No payments logged yet.'
      }</td></tr>`;

  const filterSelect = debtOptions.length ? `
    <div class="field" style="margin:0;min-width:190px;">
      <select id="pFilterDebt">
        <option value="">All debts</option>
        ${debtOptions.map(d =>
          `<option value="${esc(d.id)}" ${paymentsUI.filterDebtId === d.id ? 'selected' : ''}>${esc(d.name)}</option>`
        ).join('')}
      </select>
    </div>` : '';

  return `
<div class="sec-head" style="margin-top:28px;">
  <div class="sec-head-left"><h2>History</h2></div>
  ${filterSelect}
</div>
<div class="table-wrap">
  <table>
    <thead><tr>
      <th>Date</th><th>Debt</th><th>Amount</th><th>CCY</th><th>Note</th><th>Actions</th>
    </tr></thead>
    <tbody id="payHistoryBody">${rows}</tbody>
  </table>
</div>`;
}

function payRowHTML(p) {
  if (paymentsUI.deleteId === p.id) {
    return `<tr>
      <td class="td-mono">${fmtPayDate(p.date)}</td>
      <td class="td-name">${esc(p.debt_name)}</td>
      <td colspan="3"><span class="confirm-text">Delete payment of <strong>${fmtAmount(p.amount, p.currency)}</strong>? The balance will be restored.</span></td>
      <td><div class="row-actions">
        <button class="btn-link danger" data-action="pay-confirm-delete">Yes, delete</button>
        <button class="btn-link" data-action="pay-cancel-delete">Cancel</button>
      </div></td>
    </tr>`;
  }
  return `<tr>
    <td class="td-mono">${fmtPayDate(p.date)}</td>
    <td class="td-name">${esc(p.debt_name)}</td>
    <td class="td-amount">${fmtAmount(p.amount, p.currency)}</td>
    <td>${esc(p.currency)}</td>
    <td class="td-muted">${esc(p.note || '') || '&mdash;'}</td>
    <td><div class="row-actions">
      <button class="btn-link danger" data-action="pay-delete" data-id="${esc(p.id)}">Delete</button>
    </div></td>
  </tr>`;
}

function renderPayments() {
  el('paymentsContent').innerHTML = `
    <div class="sec-head">
      <div class="sec-head-left"><h2>Payments</h2></div>
    </div>
    ${payFormHTML()}
    ${payHistoryHTML()}
  `;
  wirePaymentsEvents();
}

function wirePaymentsEvents() {
  el('goToDebts')?.addEventListener('click', e => { e.preventDefault(); showSection('debts'); });

  const form = el('payForm');
  if (form) {
    form.addEventListener('submit', e => { e.preventDefault(); savePayment(); });
    el('pDebt').addEventListener('change', updatePayCurrencyLabel);
  }

  el('pFilterDebt')?.addEventListener('change', e => {
    paymentsUI.filterDebtId = e.target.value;
    renderPayments();
  });

  el('payHistoryBody')?.addEventListener('click', payRowClick);
}

function payRowClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'pay-delete')         startDeletePayment(id);
  if (action === 'pay-confirm-delete') confirmDeletePayment();
  if (action === 'pay-cancel-delete')  cancelDeletePayment();
}

async function savePayment() {
  const debtId = el('pDebt').value;
  const amount = el('pAmount').value.trim();
  const date   = el('pDate').value;
  const note   = el('pNote').value.trim();

  let valid = true;
  const dw = el('pDebtWrap'), aw = el('pAmountWrap');
  if (!debtId)                                                            { dw.classList.add('error'); valid = false; } else dw.classList.remove('error');
  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0)  { aw.classList.add('error'); valid = false; } else aw.classList.remove('error');
  if (!valid) return;

  const debt = state.debts.find(d => d.id === debtId);

  el('pSaveBtn').disabled = true;
  el('pFormSpinner').classList.remove('hidden');

  try {
    const res = await DebtAPI.createPayment({
      debt_id:   debtId,
      debt_name: debt?.name     || '',
      amount:    parseFloat(amount),
      currency:  debt?.currency || '',
      date:      date || todayISO(),
      note,
    });
    if (res.ok) {
      showMsg('Payment logged. Debt balance updated.');
      await loadAll();
    } else {
      showMsg('Save failed: ' + (res.error || 'unknown'), 'warn');
      el('pSaveBtn').disabled = false;
      el('pFormSpinner').classList.add('hidden');
    }
  } catch (_) {
    showMsg('Network error. Try again.', 'warn');
    el('pSaveBtn').disabled = false;
    el('pFormSpinner').classList.add('hidden');
  }
}

function startDeletePayment(id)  { paymentsUI.deleteId = id; renderPayments(); }
function cancelDeletePayment()   { paymentsUI.deleteId = null; renderPayments(); }

async function confirmDeletePayment() {
  const id = paymentsUI.deleteId;
  paymentsUI.deleteId = null;
  const btn = document.querySelector('[data-action="pay-confirm-delete"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
  try {
    const res = await DebtAPI.deletePayment(id);
    if (res.ok) {
      showMsg('Payment deleted. Debt balance restored.');
      await loadAll();
    } else {
      showMsg('Delete failed: ' + (res.error || 'unknown'), 'warn');
      renderPayments();
    }
  } catch (_) {
    showMsg('Network error. Try again.', 'warn');
    renderPayments();
  }
}
// ── RATES MODULE ──────────────────────────────────────────────────────────────

const ratesUI = { editCurrency: null };

function setQuoteCurrency(ccy) {
  state.quoteCurrency = ccy;
  localStorage.setItem('dt_quote_currency', ccy);
  el('quoteCurrencySelect').value = ccy;
  const ratePicker = el('ratesQuotePicker');
  if (ratePicker) ratePicker.value = ccy;
  renderAll();
}

function rateRowHTML(r) {
  const isBase    = r.currency === 'GBP';
  const isEditing = ratesUI.editCurrency === r.currency;

  const rateCell = isEditing
    ? `<td><input type="number" id="rateEditInput" class="rate-edit-input"
           value="${parseFloat(r.rate)}" min="0.0001" step="0.0001"></td>`
    : `<td class="td-mono">${parseFloat(r.rate)}</td>`;

  let actionsCell;
  if (isBase) {
    actionsCell = `<td><span class="badge badge-subtype">base</span></td>`;
  } else if (isEditing) {
    actionsCell = `<td><div class="row-actions">
      <button class="btn-link" data-action="rate-save" data-currency="${esc(r.currency)}">Save</button>
      <button class="btn-link danger" data-action="rate-cancel">Cancel</button>
    </div></td>`;
  } else {
    actionsCell = `<td><button class="btn-link" data-action="rate-edit" data-currency="${esc(r.currency)}">Edit</button></td>`;
  }

  return `<tr>
    <td class="td-name">${esc(r.currency)}</td>
    <td class="td-mono">${esc(r.symbol)}</td>
    ${rateCell}
    <td class="td-mono">${fmtDate(r.updated_at)}</td>
    ${actionsCell}
  </tr>`;
}

function renderRates() {
  const CCY_ORDER = ['GBP', 'INR', 'USD', 'EUR', 'AED'];

  const sortedRates = [...state.rates].sort(
    (a, b) => CCY_ORDER.indexOf(a.currency) - CCY_ORDER.indexOf(b.currency)
  );

  const rows = sortedRates.length
    ? sortedRates.map(rateRowHTML).join('')
    : `<tr class="empty-row"><td colspan="5">No rates loaded.</td></tr>`;

  el('ratesContent').innerHTML = `
    <div class="sec-head">
      <div class="sec-head-left"><h2>Rates</h2></div>
    </div>

    <div class="card" style="margin-bottom:22px;">
      <p class="sec-sub" style="margin:0 0 14px;">
        Quote currency converts all balances across the app for comparison. Saved in your browser across sessions.
      </p>
      <div class="field" style="max-width:200px;margin:0;">
        <label for="ratesQuotePicker">Quote currency</label>
        <select id="ratesQuotePicker">
          ${CCY_ORDER.map(c => `<option value="${c}" ${state.quoteCurrency === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="sec-head">
      <div class="sec-head-left"><h2>Exchange rates</h2></div>
      <span style="font-size:12.5px;color:var(--muted);">Units of currency per&nbsp;1&nbsp;GBP</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Currency</th><th>Symbol</th><th>Rate (per 1 GBP)</th><th>Last updated</th><th>Actions</th>
        </tr></thead>
        <tbody id="ratesBody">${rows}</tbody>
      </table>
    </div>
  `;

  wireRatesEvents();
}

function wireRatesEvents() {
  el('ratesQuotePicker')?.addEventListener('change', e => setQuoteCurrency(e.target.value));
  el('ratesBody')?.addEventListener('click', ratesRowClick);

  const editInput = el('rateEditInput');
  if (editInput) {
    editInput.focus();
    editInput.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); saveRate(ratesUI.editCurrency); }
      if (e.key === 'Escape') cancelRateEdit();
    });
  }
}

function ratesRowClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, currency } = btn.dataset;
  if (action === 'rate-edit')   { ratesUI.editCurrency = currency; renderRates(); }
  if (action === 'rate-cancel') cancelRateEdit();
  if (action === 'rate-save')   saveRate(currency);
}

function cancelRateEdit() {
  ratesUI.editCurrency = null;
  renderRates();
}

async function saveRate(currency) {
  const input = el('rateEditInput');
  const rate  = parseFloat(input?.value);

  if (!rate || rate <= 0) {
    if (input) input.style.borderColor = 'var(--ember)';
    return;
  }

  const saveBtn = el('ratesBody')?.querySelector('[data-action="rate-save"]');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  const rateRecord = state.rates.find(r => r.currency === currency);

  try {
    const res = await DebtAPI.upsertRate({ currency, rate, symbol: rateRecord?.symbol || '' });
    if (res.ok) {
      showMsg(`${currency} rate updated.`);
      ratesUI.editCurrency = null;
      await loadAll();
    } else {
      showMsg('Update failed: ' + (res.error || 'unknown'), 'warn');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
    }
  } catch (_) {
    showMsg('Network error. Try again.', 'warn');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
  }
}
// ── PROJECTOR MODULE ──────────────────────────────────────────────────────────

const CAP_MONTHS = 360;
const projectorUI = { strategy: 'avalanche', extra: 0, includes: {} };

function projIncluded(d) {
  if (projectorUI.includes.hasOwnProperty(d.id)) return projectorUI.includes[d.id];
  return d.include_in_projector !== false && d.include_in_projector !== 'false';
}

function projReqMin(type, bal, minFixed, minPercent, minFloor) {
  if (bal <= 0.005) return 0;
  if (type === 'card') return Math.min(Math.max(bal * ((minPercent || 0) / 100), minFloor || 0), bal);
  return Math.min(minFixed || 0, bal);
}

function runProjection() {
  const active = state.debts.filter(d => d.status === 'active');
  const noRateDebts = [];
  const src = [];

  for (const d of active) {
    if (!projIncluded(d)) continue;
    if (!state.rateMap[d.currency] || !state.rateMap[state.quoteCurrency]) {
      noRateDebts.push(d);
      continue;
    }
    src.push({
      id:         d.id,
      name:       d.name,
      type:       d.type,
      rate:       parseFloat(d.rate) || 0,
      pre:        d.precomputed === true || d.precomputed === 'true',
      minFixed:   toQuote(parseFloat(d.min_payment) || 0, d.currency),
      minPercent: parseFloat(d.min_percent) || 0,
      minFloor:   toQuote(parseFloat(d.min_floor) || 0, d.currency),
      balance:    toQuote(parseFloat(d.balance) || 0, d.currency),
    });
  }

  if (!src.length) {
    return { src, noRateDebts, months: 0, totalInterest: 0, cleared: {}, interestByDebt: {}, snapshots: [], paidOff: true };
  }

  const L = src.map(l => ({ ...l, bal: l.balance }));
  const extraAmt = parseFloat(projectorUI.extra) || 0;

  // Fixed monthly budget locks in cascade: when a debt clears, its freed minimum
  // rolls into the pot and accelerates the next target (avalanche/snowball effect).
  const budget = L.reduce((s, l) => s + projReqMin(l.type, l.bal, l.minFixed, l.minPercent, l.minFloor), 0) + extraAmt;

  const cleared = {};
  const interestByDebt = {};
  L.forEach(l => { interestByDebt[l.id] = 0; });

  const snapshots = [{
    bals:    Object.fromEntries(L.map(l => [l.id, l.bal])),
    extraTo: null,
    total:   L.reduce((s, l) => s + l.bal, 0),
  }];

  let totalInterest = 0;
  let month = 0;

  while (L.some(l => l.bal > 0.005) && month < CAP_MONTHS) {
    month++;

    // 1. Apply interest (precomputed loans and friends skip)
    for (const l of L) {
      if (l.bal <= 0.005 || l.pre || l.type === 'friend') continue;
      const i = l.bal * (l.rate / 100 / 12);
      l.bal += i;
      totalInterest += i;
      interestByDebt[l.id] += i;
    }

    // 2. Pay each debt's minimum from the fixed budget
    let pot = budget;
    for (const l of L) {
      if (l.bal <= 0.005) continue;
      const m = projReqMin(l.type, l.bal, l.minFixed, l.minPercent, l.minFloor);
      const p = Math.min(m, l.bal);
      l.bal = Math.max(l.bal - p, 0);
      pot -= p;
    }
    if (pot < 0) pot = 0;

    // 3. Apply remaining pot to attack debt (cascade + extra)
    const unpaid = L.filter(l => l.bal > 0.005).sort(
      projectorUI.strategy === 'snowball'
        ? (a, b) => a.bal - b.bal
        : (a, b) => b.rate - a.rate
    );

    let extraToName = null;
    for (const l of unpaid) {
      if (pot <= 0.005) break;
      if (!extraToName) extraToName = l.name;
      const p = Math.min(pot, l.bal);
      l.bal = Math.max(l.bal - p, 0);
      pot -= p;
    }

    // 4. Mark cleared debts
    for (const l of L) {
      if (l.bal <= 0.005 && !cleared[l.id]) {
        cleared[l.id] = month;
        l.bal = 0;
      }
    }

    snapshots.push({
      bals:    Object.fromEntries(L.map(l => [l.id, Math.max(l.bal, 0)])),
      extraTo: extraToName,
      total:   L.reduce((s, l) => s + Math.max(l.bal, 0), 0),
    });
  }

  return {
    src,
    noRateDebts,
    months: month,
    totalInterest,
    cleared,
    interestByDebt,
    snapshots,
    paidOff: !L.some(l => l.bal > 0.005),
  };
}

function projDebtFreeDate(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function projYearsMonths(n) {
  const y = Math.floor(n / 12);
  const m = n % 12;
  if (!y) return `${m} month${m !== 1 ? 's' : ''}`;
  if (!m) return `${y} year${y !== 1 ? 's' : ''}`;
  return `${y} yr ${m} mo`;
}

function projMonthRowHTML(snap, monthNum, src) {
  const CCY = state.quoteCurrency;
  const balCells = src.map(d => {
    const bal = snap.bals[d.id] ?? 0;
    return `<td class="td-amount">${
      bal > 0.005
        ? fmtAmount(bal, CCY)
        : '<span style="color:var(--teal);">&#10003;&nbsp;paid</span>'
    }</td>`;
  }).join('');
  return `<tr>
    <td class="td-mono">${monthNum}</td>
    ${balCells}
    <td class="td-muted">${snap.extraTo ? esc(snap.extraTo) : '&mdash;'}</td>
    <td class="td-amount"><strong>${fmtAmount(snap.total, CCY)}</strong></td>
  </tr>`;
}

function renderProjector() {
  const active = state.debts.filter(d => d.status === 'active');

  if (!active.length) {
    el('projectorContent').innerHTML = `<p class="placeholder">No active debts to project — add some in the Debts tab first.</p>`;
    return;
  }

  // Seed includes from debt flags on first encounter; new debts default to their stored flag
  active.forEach(d => {
    if (!projectorUI.includes.hasOwnProperty(d.id)) {
      projectorUI.includes[d.id] = d.include_in_projector !== false && d.include_in_projector !== 'false';
    }
  });

  const proj = runProjection();
  const CCY  = state.quoteCurrency;

  // Controls
  const controlsHTML = `
<div class="card" style="margin-bottom:22px;">
  <div class="projector-controls">
    <div class="proj-strategy-group">
      <span class="proj-label">Strategy</span>
      <div style="display:flex;gap:6px;">
        <button class="mode-btn${projectorUI.strategy === 'avalanche' ? ' active' : ''}" data-proj-action="strategy" data-value="avalanche">Avalanche</button>
        <button class="mode-btn${projectorUI.strategy === 'snowball'  ? ' active' : ''}" data-proj-action="strategy" data-value="snowball">Snowball</button>
      </div>
      <span class="proj-hint">${projectorUI.strategy === 'avalanche' ? 'Highest rate first' : 'Lowest balance first'}</span>
    </div>
    <div class="proj-extra-group">
      <label class="proj-label" for="projExtra">Extra per month (${esc(CCY)})</label>
      <input type="number" id="projExtra" class="proj-extra-input" value="${projectorUI.extra || ''}" placeholder="0.00" min="0" step="0.01">
    </div>
  </div>
  <div style="margin-top:18px;">
    <span class="proj-label">Include in projection</span>
    <div class="proj-checks">
      ${active.map(d => {
        const noRate = !state.rateMap[d.currency] || !state.rateMap[state.quoteCurrency];
        const chk    = !noRate && projIncluded(d);
        return `<label class="proj-check-label${noRate ? ' proj-check-disabled' : ''}">
          <input type="checkbox" data-proj-action="toggle-include" data-id="${esc(d.id)}" ${chk ? 'checked' : ''} ${noRate ? 'disabled' : ''}>
          ${esc(d.name)}${noRate ? ' <span class="no-rate">&#9888;&nbsp;no rate</span>' : ''}
        </label>`;
      }).join('')}
    </div>
  </div>
</div>`;

  // No-rate warning
  const noRateHTML = proj.noRateDebts.length
    ? `<p class="proj-notice"><span class="no-rate">&#9888;</span>&ensp;<strong>${proj.noRateDebts.map(d => esc(d.name)).join(', ')}</strong> excluded — missing exchange rate. Update in Rates to include.</p>`
    : '';

  // Summary card
  let summaryHTML;
  if (!proj.src.length) {
    summaryHTML = `<p class="placeholder" style="padding:28px 0;">No debts included &mdash; check the boxes above.</p>`;
  } else {
    const capNote = !proj.paidOff
      ? `<p class="proj-cap-note">&#9888;&nbsp;Capped at ${CAP_MONTHS} months — not fully paid off within 30 years.</p>`
      : '';
    summaryHTML = `
<div class="proj-summary-card">
  <div class="proj-summary-grid">
    <div>
      <span class="proj-summary-label">Debt-free date</span>
      <strong class="proj-summary-val">${proj.paidOff ? projDebtFreeDate(proj.months) : 'Not within 30 yrs'}</strong>
    </div>
    <div>
      <span class="proj-summary-label">Time to pay off</span>
      <strong class="proj-summary-val">${proj.paidOff ? projYearsMonths(proj.months) : '&gt;&nbsp;360 mo'}</strong>
    </div>
    <div>
      <span class="proj-summary-label">Total interest (${esc(CCY)})</span>
      <strong class="proj-summary-val">${fmtAmount(proj.totalInterest, CCY)}</strong>
    </div>
    <div>
      <span class="proj-summary-label">Debts cleared</span>
      <strong class="proj-summary-val">${Object.keys(proj.cleared).length}&nbsp;/&nbsp;${proj.src.length}</strong>
    </div>
  </div>
  ${capNote}
</div>`;
  }

  // Per-debt payoff table
  let payoffTableHTML = '';
  if (proj.src.length) {
    const rows = proj.src.map(d => {
      const m = proj.cleared[d.id];
      return `<tr>
        <td class="td-name">${esc(d.name)}</td>
        <td class="td-mono">${m ? `Month&nbsp;${m}` : '&mdash;'}</td>
        <td class="td-mono">${m ? projDebtFreeDate(m) : `&gt;&nbsp;30&nbsp;yrs`}</td>
        <td class="td-amount">${fmtAmount(proj.interestByDebt[d.id] || 0, CCY)}</td>
      </tr>`;
    }).join('');
    payoffTableHTML = `
<div class="sec-head" style="margin-top:22px;">
  <div class="sec-head-left"><h2>Per-debt payoff</h2></div>
</div>
<div class="table-wrap">
  <table>
    <thead><tr>
      <th>Debt</th><th>Payoff month</th><th>Payoff date</th><th>Interest paid (${esc(CCY)})</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
  }

  // Month-by-month table
  let monthlyTableHTML = '';
  if (proj.src.length && proj.snapshots.length > 1) {
    const monthSnaps  = proj.snapshots.slice(1);
    const debtCols    = proj.src.map(d => `<th>${esc(d.name)}</th>`).join('');
    const headerRow   = `<tr><th>Month</th>${debtCols}<th>Extra to</th><th>Total (${esc(CCY)})</th></tr>`;
    const first12     = monthSnaps.slice(0, 12).map((s, i) => projMonthRowHTML(s, i + 1, proj.src)).join('');
    const remaining   = monthSnaps.length > 12
      ? monthSnaps.slice(12).map((s, i) => projMonthRowHTML(s, i + 13, proj.src)).join('')
      : '';

    const collapsible = remaining ? `
<div class="paid-section" style="margin-top:0;">
  <button class="paid-toggle" id="projMonthToggle" aria-expanded="false">
    <span class="paid-toggle-arrow">&#8250;</span>&ensp;Show all ${monthSnaps.length} months
  </button>
  <div class="paid-content collapsed" id="projMonthExtra">
    <div class="table-wrap">
      <table>
        <thead>${headerRow}</thead>
        <tbody>${remaining}</tbody>
      </table>
    </div>
  </div>
</div>` : '';

    monthlyTableHTML = `
<div class="sec-head" style="margin-top:22px;">
  <div class="sec-head-left"><h2>Month by month</h2></div>
  <span style="font-size:12.5px;color:var(--muted);">First 12 months expanded</span>
</div>
<div class="table-wrap">
  <table>
    <thead>${headerRow}</thead>
    <tbody>${first12}</tbody>
  </table>
</div>
${collapsible}`;
  }

  el('projectorContent').innerHTML = `
    <div class="sec-head"><div class="sec-head-left"><h2>Payoff Projector</h2></div></div>
    ${controlsHTML}
    ${noRateHTML}
    ${summaryHTML}
    ${payoffTableHTML}
    ${monthlyTableHTML}
  `;

  wireProjectorEvents();
}

function wireProjectorEvents() {
  el('projectorContent').querySelectorAll('[data-proj-action="strategy"]').forEach(btn => {
    btn.addEventListener('click', () => {
      projectorUI.strategy = btn.dataset.value;
      renderProjector();
    });
  });

  el('projExtra')?.addEventListener('change', e => {
    projectorUI.extra = parseFloat(e.target.value) || 0;
    renderProjector();
  });

  el('projectorContent').querySelectorAll('[data-proj-action="toggle-include"]').forEach(cb => {
    cb.addEventListener('change', () => {
      projectorUI.includes[cb.dataset.id] = cb.checked;
      renderProjector();
    });
  });

  const monthToggle = el('projMonthToggle');
  if (monthToggle) {
    monthToggle.addEventListener('click', () => {
      const isOpen = monthToggle.getAttribute('aria-expanded') === 'true';
      monthToggle.setAttribute('aria-expanded', String(!isOpen));
      el('projMonthExtra').classList.toggle('collapsed', isOpen);
    });
  }
}

// ── Event: theme toggle ───────────────────────────────────────────────────────
el('themeToggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  setTheme(current === 'dark' ? 'light' : 'dark');
});

// ── Event: quote currency change ──────────────────────────────────────────────
el('quoteCurrencySelect').addEventListener('change', e => {
  setQuoteCurrency(e.target.value);
});

// ── Event: tab navigation ─────────────────────────────────────────────────────
el('tabNav').addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if (btn) showSection(btn.dataset.section);
});

// ── Event: PIN gate ───────────────────────────────────────────────────────────
el('pinSubmit').addEventListener('click', submitPin);
el('pinInput').addEventListener('keydown',  e => { if (e.key === 'Enter') { e.preventDefault(); el('totpInput').focus(); } });
el('totpInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitPin(); });

// ── Init ──────────────────────────────────────────────────────────────────────
(function init() {
  if (window.__configMissing || !window.CONFIG?.SCRIPT_URL) {
    el('setupBanner').classList.remove('hidden');
    el('pinOverlay').classList.add('hidden');
    return;
  }

  // Restore theme preference (falls back to OS preference)
  const savedTheme = localStorage.getItem('dt_theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(savedTheme);

  // Restore quote currency preference from previous session
  const savedQuote = localStorage.getItem('dt_quote_currency');
  if (savedQuote && ['GBP', 'INR', 'USD', 'EUR', 'AED'].includes(savedQuote)) {
    state.quoteCurrency = savedQuote;
  }
  el('quoteCurrencySelect').value = state.quoteCurrency;

  const section = sessionStorage.getItem('dt_section') || 'dashboard';
  showSection(section);

  const pin = sessionStorage.getItem('dt_pin');
  if (pin) {
    SheetsClient.init({ scriptUrl: window.CONFIG.SCRIPT_URL, pin });
    loadAll();
  } else {
    showPinGate();
  }
})();
