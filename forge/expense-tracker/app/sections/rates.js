import { state } from '../core/state.js';
import { el, esc, fmtDateTime } from '../core/utils.js';
import { showLoading, hideLoading, showMsg } from '../core/ui.js';
import { ExpenseAPI } from '../core/api.js';

// ── Entry point ───────────────────────────────────────────────────────────────

export function renderRates() {
  const content = el('ratesContent');

  content.innerHTML = `
    <div class="sec-head">
      <div class="sec-head-left">
        <h2>Exchange rates</h2>
        <p class="sec-sub">Units of currency per 1 GBP. GBP is the base (read-only).</p>
      </div>
      <button class="btn btn-primary btn-sm" id="rateAddBtn">${state.rateAddOpen ? '× Close' : '+ Add currency'}</button>
    </div>
    ${state.rateAddOpen ? _renderAddForm() : ''}
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th style="width:100px">Currency</th>
          <th style="width:80px">Symbol</th>
          <th style="width:140px">Rate (per £1)</th>
          <th>Updated</th>
          <th style="width:150px"></th>
        </tr></thead>
        <tbody>
          ${state.rates.map(r => _rateRowHtml(r)).join('')}
        </tbody>
      </table>
    </div>`;

  _attachRateEvents();
}

// ── Add form ──────────────────────────────────────────────────────────────────

function _renderAddForm() {
  return `
  <div class="card" style="margin-bottom:20px">
    <div class="form-grid form-grid-4">
      <div class="field">
        <label for="rateNewCurrency">Currency code *</label>
        <input type="text" id="rateNewCurrency" placeholder="e.g. JPY" maxlength="4" style="text-transform:uppercase">
        <div class="field-hint">ISO 4217 code (3–4 letters).</div>
      </div>
      <div class="field">
        <label for="rateNewSymbol">Symbol</label>
        <input type="text" id="rateNewSymbol" placeholder="e.g. ¥" maxlength="8">
        <div class="field-hint">Display prefix (optional).</div>
      </div>
      <div class="field">
        <label for="rateNewRate">Rate per £1 *</label>
        <input type="number" id="rateNewRate" placeholder="e.g. 195.5" min="0.0001" step="any">
        <div class="field-hint">Units of this currency per 1 GBP.</div>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary" id="rateSaveNew">Save</button>
      <button class="btn btn-secondary" id="rateCancelNew">Cancel</button>
    </div>
    <div class="pin-error" id="rateAddError"></div>
  </div>`;
}

// ── Table rows ────────────────────────────────────────────────────────────────

function _rateRowHtml(r) {
  const base = r.currency === 'GBP';

  if (state.rateDeleteCurrency === r.currency) {
    return `<tr>
      <td class="td-mono"><strong>${esc(r.currency)}</strong></td>
      <td colspan="2"><span class="confirm-text">Delete <strong>${esc(r.currency)}</strong>?</span></td>
      <td></td>
      <td><div class="row-actions">
        <button class="btn-link danger" data-action="rate-confirm-delete" data-currency="${esc(r.currency)}">Yes, delete</button>
        <button class="btn-link muted"  data-action="rate-cancel-delete">Cancel</button>
      </div></td>
    </tr>`;
  }

  if (state.rateEditCurrency === r.currency) {
    return `<tr>
      <td class="td-mono"><strong>${esc(r.currency)}</strong></td>
      <td><input class="rate-edit-input" style="width:56px" id="rateSymEdit-${esc(r.currency)}" type="text" maxlength="8" value="${esc(r.symbol || '')}"></td>
      <td><input class="rate-edit-input" style="width:100px" id="rateValEdit-${esc(r.currency)}" type="number" min="0.0001" step="any" value="${parseFloat(r.rate)}"></td>
      <td class="td-muted td-mono">${r.updated_at ? esc(fmtDateTime(r.updated_at)) : '—'}</td>
      <td><div class="row-actions">
        <button class="btn-link" data-action="rate-save-edit" data-currency="${esc(r.currency)}">Save</button>
        <button class="btn-link muted" data-action="rate-cancel-edit">Cancel</button>
      </div></td>
    </tr>`;
  }

  return `<tr>
    <td class="td-mono"><strong>${esc(r.currency)}</strong></td>
    <td>${esc(r.symbol || '—')}</td>
    <td class="td-mono">${parseFloat(r.rate).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
    <td class="td-muted td-mono">${r.updated_at ? esc(fmtDateTime(r.updated_at)) : '—'}</td>
    <td><div class="row-actions">
      ${base ? '' : `
        <button class="btn-link" data-action="rate-edit" data-currency="${esc(r.currency)}">Edit</button>
        <button class="btn-link danger" data-action="rate-delete" data-currency="${esc(r.currency)}">Delete</button>
      `}
    </div></td>
  </tr>`;
}

// ── Events ────────────────────────────────────────────────────────────────────

function _attachRateEvents() {
  el('rateAddBtn')?.addEventListener('click', () => {
    state.rateAddOpen = !state.rateAddOpen;
    renderRates();
  });

  el('rateSaveNew')?.addEventListener('click', _saveNewRate);
  el('rateCancelNew')?.addEventListener('click', () => { state.rateAddOpen = false; renderRates(); });

  el('rateNewRate')?.addEventListener('keydown', e => {
    if (e.key === 'Enter')  el('rateSaveNew')?.click();
    if (e.key === 'Escape') el('rateCancelNew')?.click();
  });

  const tableWrap = el('ratesContent')?.querySelector('.table-wrap');

  tableWrap?.addEventListener('click', async e => {
    const btn      = e.target.closest('[data-action]');
    if (!btn) return;
    const action   = btn.dataset.action;
    const currency = btn.dataset.currency;

    if (action === 'rate-edit') {
      state.rateEditCurrency   = currency;
      state.rateDeleteCurrency = null;
      renderRates();
      el(`rateValEdit-${currency}`)?.focus();
    }

    if (action === 'rate-cancel-edit') {
      state.rateEditCurrency = null;
      renderRates();
    }

    if (action === 'rate-save-edit')     await _saveEdit(currency);

    if (action === 'rate-delete') {
      state.rateDeleteCurrency = currency;
      state.rateEditCurrency   = null;
      renderRates();
    }

    if (action === 'rate-cancel-delete') {
      state.rateDeleteCurrency = null;
      renderRates();
    }

    if (action === 'rate-confirm-delete') await _confirmDelete(currency);
  });

  tableWrap?.addEventListener('keydown', e => {
    if (!state.rateEditCurrency) return;
    if (e.key === 'Enter')  _saveEdit(state.rateEditCurrency);
    if (e.key === 'Escape') { state.rateEditCurrency = null; renderRates(); }
  });
}

// ── Save new ──────────────────────────────────────────────────────────────────

async function _saveNewRate() {
  const currency = (el('rateNewCurrency')?.value || '').trim().toUpperCase();
  const symbol   = (el('rateNewSymbol')?.value   || '').trim();
  const rate     = parseFloat(el('rateNewRate')?.value || '');
  const errEl    = el('rateAddError');

  if (!currency) { errEl.textContent = 'Currency code is required.'; return; }
  if (state.rates.find(r => r.currency === currency)) {
    errEl.textContent = `${currency} already exists — use Edit to update it.`; return;
  }
  if (!rate || rate <= 0) { errEl.textContent = 'Rate must be a positive number.'; return; }

  const saveBtn = el('rateSaveNew');
  saveBtn.style.opacity = '.4'; saveBtn.style.pointerEvents = 'none'; saveBtn.textContent = 'Saving…';
  showLoading();
  try {
    const res = await ExpenseAPI.upsertRate({ currency, symbol, rate });
    if (res.ok) {
      state.rates.push({ currency, symbol, rate, updated_at: new Date().toISOString() });
      state.rateMap[currency] = rate;
      state.rateAddOpen = false;
      showMsg('Currency added.');
      renderRates();
    } else {
      errEl.textContent = 'Failed: ' + (res.error || 'unknown');
      saveBtn.style.opacity = ''; saveBtn.style.pointerEvents = ''; saveBtn.textContent = 'Save';
    }
  } catch (_) {
    errEl.textContent = 'Connection error.';
    saveBtn.style.opacity = ''; saveBtn.style.pointerEvents = ''; saveBtn.textContent = 'Save';
  } finally {
    hideLoading();
  }
}

// ── Save edit ─────────────────────────────────────────────────────────────────

async function _saveEdit(currency) {
  const rateVal   = parseFloat(el(`rateValEdit-${currency}`)?.value || '');
  const symbolVal = (el(`rateSymEdit-${currency}`)?.value || '').trim();

  if (!rateVal || rateVal <= 0) { showMsg('Rate must be a positive number.', 'warn'); return; }

  showLoading();
  try {
    const res = await ExpenseAPI.upsertRate({ currency, rate: rateVal, symbol: symbolVal });
    if (res.ok) {
      const r = state.rates.find(r => r.currency === currency);
      if (r) { r.rate = rateVal; r.symbol = symbolVal; r.updated_at = new Date().toISOString(); }
      state.rateMap[currency] = rateVal;
      state.rateEditCurrency  = null;
      showMsg('Rate updated.');
      renderRates();
    } else {
      showMsg('Failed: ' + (res.error || 'unknown'), 'warn');
    }
  } catch (_) {
    showMsg('Connection error.', 'warn');
  } finally {
    hideLoading();
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────

async function _confirmDelete(currency) {
  showLoading();
  try {
    const res = await ExpenseAPI.deleteRate({ currency });
    if (res.ok) {
      state.rates          = state.rates.filter(r => r.currency !== currency);
      delete state.rateMap[currency];
      state.rateDeleteCurrency = null;
      showMsg('Currency removed.');
      renderRates();
    } else {
      showMsg('Failed: ' + (res.error || 'unknown'), 'warn');
    }
  } catch (_) {
    showMsg('Connection error.', 'warn');
  } finally {
    hideLoading();
  }
}
