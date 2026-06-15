import { state } from '../core/state.js';
import { el, esc, fmtAmount, toQuote } from '../core/utils.js';

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

    for (const l of L) {
      if (l.bal <= 0.005 || l.pre || l.type === 'friend') continue;
      const i = l.bal * (l.rate / 100 / 12);
      l.bal += i;
      totalInterest += i;
      interestByDebt[l.id] += i;
    }

    let pot = budget;
    for (const l of L) {
      if (l.bal <= 0.005) continue;
      const m = projReqMin(l.type, l.bal, l.minFixed, l.minPercent, l.minFloor);
      const p = Math.min(m, l.bal);
      l.bal = Math.max(l.bal - p, 0);
      pot -= p;
    }
    if (pot < 0) pot = 0;

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
  return `${y} yr ${m} mo`;
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

export function renderProjector() {
  const active = state.debts.filter(d => d.status === 'active');

  if (!active.length) {
    el('projectorContent').innerHTML = `<p class="placeholder">No active debts to project — add some in the Debts tab first.</p>`;
    return;
  }

  active.forEach(d => {
    if (!projectorUI.includes.hasOwnProperty(d.id)) {
      projectorUI.includes[d.id] = d.include_in_projector !== false && d.include_in_projector !== 'false';
    }
  });

  const proj = runProjection();
  const CCY  = state.quoteCurrency;

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

  const noRateHTML = proj.noRateDebts.length
    ? `<p class="proj-notice"><span class="no-rate">&#9888;</span>&ensp;<strong>${proj.noRateDebts.map(d => esc(d.name)).join(', ')}</strong> excluded — missing exchange rate. Update in Rates to include.</p>`
    : '';

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

  let monthlyTableHTML = '';
  if (proj.src.length && proj.snapshots.length > 1) {
    const monthSnaps = proj.snapshots.slice(1);
    const debtCols   = proj.src.map(d => `<th>${esc(d.name)}</th>`).join('');
    const headerRow  = `<tr><th>Month</th>${debtCols}<th>Extra to</th><th>Total (${esc(CCY)})</th></tr>`;
    const first12    = monthSnaps.slice(0, 12).map((s, i) => projMonthRowHTML(s, i + 1, proj.src)).join('');
    const remaining  = monthSnaps.length > 12
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
