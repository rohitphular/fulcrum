import { state } from './state.js';
import { el, esc, fmtDate } from './utils.js';
import { showLoading, hideLoading, showMsg } from './ui.js';
import { ExpenseAPI } from './api.js';

export function renderRates() {
  const el2 = el('ratesContent');

  el2.innerHTML = `
    <div class="sec-head"><div class="sec-head-left"><h2>Exchange rates</h2></div></div>
    <p class="sec-sub">Units of currency per 1 GBP. GBP is the base (read-only).</p>
    <div class="rates-table-wrap">
      <table>
        <thead><tr>
          <th>Currency</th><th>Symbol</th><th>Rate</th><th>Updated</th><th></th>
        </tr></thead>
        <tbody>
          ${state.rates.map(r => rateRowHtml(r)).join('')}
        </tbody>
      </table>
    </div>`;

  el2.querySelectorAll('.rate-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.currency !== 'GBP') renderRateEditRow(btn.dataset.currency);
    });
  });
}

function rateRowHtml(r) {
  const base = r.currency === 'GBP';
  return `<tr id="rateRow-${esc(r.currency)}">
    <td class="td-mono">${esc(r.currency)}</td>
    <td>${esc(r.symbol || '')}</td>
    <td class="td-mono">${parseFloat(r.rate).toLocaleString('en-GB', { maximumFractionDigits: 4 })}</td>
    <td class="td-muted td-mono">${r.updated_at ? esc(fmtDate(r.updated_at)) : '—'}</td>
    <td>${base ? '' : `<button class="btn btn-secondary btn-sm rate-edit-btn" data-currency="${esc(r.currency)}">Edit</button>`}</td>
  </tr>`;
}

function renderRateEditRow(currency) {
  const rate = state.rates.find(r => r.currency === currency);
  if (!rate) return;
  const row = el(`rateRow-${currency}`);
  if (!row) return;

  row.innerHTML = `
    <td class="td-mono">${esc(currency)}</td>
    <td><input class="rate-edit-input" style="width:60px" id="rateSymEdit-${esc(currency)}" value="${esc(rate.symbol||'')}" placeholder="£"></td>
    <td><input class="rate-edit-input" style="width:90px" id="rateValEdit-${esc(currency)}" type="number" min="0.0001" step="any" value="${parseFloat(rate.rate)}"></td>
    <td class="td-muted td-mono">${rate.updated_at ? esc(fmtDate(rate.updated_at)) : '—'}</td>
    <td style="display:flex;gap:6px">
      <button class="btn btn-primary btn-sm" id="rateSave-${esc(currency)}">Save</button>
      <button class="btn btn-secondary btn-sm" id="rateCancel-${esc(currency)}">Cancel</button>
    </td>`;

  const saveBtn   = el(`rateSave-${currency}`);
  const cancelBtn = el(`rateCancel-${currency}`);

  saveBtn.addEventListener('click', async () => {
    const newRate = parseFloat(el(`rateValEdit-${currency}`).value);
    const newSym  = el(`rateSymEdit-${currency}`).value.trim();
    if (!newRate || newRate <= 0) { showMsg('Enter a valid rate.', 'warn'); return; }

    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    showLoading();
    try {
      const res = await ExpenseAPI.upsertRate({ currency, rate: newRate, symbol: newSym });
      if (res.ok) {
        const r = state.rates.find(r => r.currency === currency);
        if (r) { r.rate = newRate; r.symbol = newSym; r.updated_at = new Date().toISOString(); }
        state.rateMap[currency] = newRate;
        showMsg('Rate updated.');
        renderRates();
      } else {
        showMsg('Failed: ' + (res.error || 'unknown'), 'warn');
        saveBtn.disabled = false; saveBtn.textContent = 'Save';
      }
    } catch (_) {
      showMsg('Connection error.', 'warn');
      saveBtn.disabled = false; saveBtn.textContent = 'Save';
    } finally {
      hideLoading();
    }
  });

  cancelBtn.addEventListener('click', () => renderRates());

  el(`rateValEdit-${currency}`)?.addEventListener('keydown', e => {
    if (e.key === 'Enter')  saveBtn.click();
    if (e.key === 'Escape') cancelBtn.click();
  });
}
