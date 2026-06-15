import { state } from '../core/state.js';
import { el, esc } from '../core/utils.js';
import { showLoading, hideLoading, showMsg } from '../core/ui.js';
import { ExpenseAPI } from '../core/api.js';

const ACCOUNT_TYPES = ['bank', 'savings', 'credit', 'cash', 'investment', 'other'];

function isActive(a) {
  return a.is_active === true || a.is_active === 'TRUE' || a.is_active === 'true';
}

function fmt(n) {
  return parseFloat(n || 0).toFixed(2);
}

export function renderAccounts() {
  el('accountsContent').innerHTML = `
    <div class="sec-head">
      <div class="sec-head-left"><h2>Accounts</h2></div>
      <button class="btn btn-primary btn-sm" id="accAddBtn">${state.accAddOpen ? '× Close' : '+ Add account'}</button>
    </div>
    ${state.accAddOpen ? renderAddForm() : ''}
    ${renderTable()}
  `;
  attachEvents();
}

function renderAddForm() {
  const currencyOpts = state.rates.map(r =>
    `<option value="${esc(r.currency)}">${esc(r.currency)}</option>`
  ).join('');
  const typeOpts = ACCOUNT_TYPES.map(t =>
    `<option value="${esc(t)}">${esc(t)}</option>`
  ).join('');

  return `
  <div class="card" style="margin-bottom:20px">
    <div class="form-grid">
      <div class="field">
        <label for="accNewName">Name *</label>
        <input type="text" id="accNewName" placeholder="e.g. Barclays Current">
      </div>
      <div class="field">
        <label for="accNewCurrency">Currency *</label>
        <select id="accNewCurrency">${currencyOpts}</select>
      </div>
      <div class="field">
        <label for="accNewType">Type</label>
        <select id="accNewType">${typeOpts}</select>
      </div>
      <div class="field">
        <label for="accNewOpeningBal">Opening balance</label>
        <input type="number" id="accNewOpeningBal" min="0" step="0.01" placeholder="0.00">
      </div>
      <div class="field">
        <label for="accNewCurrentBal">Current balance</label>
        <input type="number" id="accNewCurrentBal" min="0" step="0.01" placeholder="0.00">
      </div>
      <div class="field form-grid-full">
        <label for="accNewNotes">Notes</label>
        <input type="text" id="accNewNotes" placeholder="Optional notes">
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary" id="accSaveNew">Save account</button>
      <button class="btn btn-secondary" id="accCancelNew">Cancel</button>
    </div>
    <div class="pin-error" id="accAddError"></div>
  </div>`;
}

function activeBadge(a) {
  return isActive(a)
    ? `<span class="badge badge-in">active</span>`
    : `<span class="badge badge-out">archived</span>`;
}

function renderTable() {
  if (!state.accounts.length) {
    return `<p class="placeholder">No accounts yet. Use &ldquo;+ Add account&rdquo; to create one.</p>`;
  }

  const rows = state.accounts.map(a => {
    if (state.accDeleteRow === a._row) {
      return `<tr>
        <td colspan="8"><span class="confirm-text">Delete <strong>${esc(a.name)}</strong>? Existing transactions linked to this account are not affected.</span></td>
        <td colspan="2"><div class="row-actions">
          <button class="btn-link danger" data-action="acc-confirm-delete" data-row="${a._row}">Yes, delete</button>
          <button class="btn-link" data-action="acc-cancel-delete">Cancel</button>
        </div></td>
      </tr>`;
    }

    if (state.accEditRow === a._row) return renderEditRow(a);

    return `<tr>
      <td class="td-mono" style="color:var(--muted);font-size:11px">${esc(a.id)}</td>
      <td class="td-name">${esc(a.name)}</td>
      <td>${esc(a.currency)}</td>
      <td><span class="badge badge-transfer">${esc(a.type || 'other')}</span></td>
      <td class="td-mono">${fmt(a.opening_balance)}</td>
      <td class="td-mono">${fmt(a.current_balance)}</td>
      <td>${activeBadge(a)}</td>
      <td>${a.notes ? esc(a.notes) : '<span style="color:var(--muted)">—</span>'}</td>
      <td><div class="row-actions">
        <button class="btn-link" data-action="acc-edit" data-row="${a._row}">Edit</button>
        <button class="btn-link danger" data-action="acc-delete" data-row="${a._row}">Delete</button>
      </div></td>
    </tr>`;
  }).join('');

  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th style="width:70px">ID</th>
          <th>Name</th>
          <th style="width:80px">Currency</th>
          <th style="width:90px">Type</th>
          <th style="width:105px">Opening bal.</th>
          <th style="width:105px">Current bal.</th>
          <th style="width:80px">Status</th>
          <th>Notes</th>
          <th style="width:110px">Actions</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderEditRow(a) {
  const r = a._row;
  const currencyOpts = state.rates.map(r2 =>
    `<option value="${esc(r2.currency)}" ${a.currency === r2.currency ? 'selected' : ''}>${esc(r2.currency)}</option>`
  ).join('');
  const typeOpts = ACCOUNT_TYPES.map(t =>
    `<option value="${esc(t)}" ${(a.type || 'other') === t ? 'selected' : ''}>${esc(t)}</option>`
  ).join('');

  return `<tr>
    <td class="td-mono" style="color:var(--muted);font-size:11px">${esc(a.id)}</td>
    <td><input class="rate-edit-input" id="accEditName-${r}" value="${esc(a.name)}" placeholder="Name"></td>
    <td><select class="cat-edit-select" id="accEditCurrency-${r}">${currencyOpts}</select></td>
    <td><select class="cat-edit-select" id="accEditType-${r}">${typeOpts}</select></td>
    <td><input class="rate-edit-input" type="number" step="0.01" id="accEditOpeningBal-${r}" value="${fmt(a.opening_balance)}"></td>
    <td><input class="rate-edit-input" type="number" step="0.01" id="accEditCurrentBal-${r}" value="${fmt(a.current_balance)}"></td>
    <td>
      <select class="cat-edit-select" id="accEditIsActive-${r}">
        <option value="true"  ${isActive(a) ? 'selected' : ''}>active</option>
        <option value="false" ${!isActive(a) ? 'selected' : ''}>archived</option>
      </select>
    </td>
    <td><input class="rate-edit-input" style="width:100%;min-width:100px" id="accEditNotes-${r}" value="${esc(a.notes || '')}" placeholder="Notes"></td>
    <td><div class="row-actions">
      <button class="btn-link" data-action="acc-save-edit" data-row="${r}">Save</button>
      <button class="btn-link" data-action="acc-cancel-edit">Cancel</button>
    </div></td>
  </tr>`;
}

function attachEvents() {
  el('accAddBtn')?.addEventListener('click', () => {
    state.accAddOpen = !state.accAddOpen;
    renderAccounts();
  });

  el('accSaveNew')?.addEventListener('click', saveNew);
  el('accCancelNew')?.addEventListener('click', () => { state.accAddOpen = false; renderAccounts(); });

  el('accountsContent')?.querySelector('.table-wrap')?.addEventListener('click', e => {
    const btn    = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const row    = btn.dataset.row ? Number(btn.dataset.row) : null;

    if (action === 'acc-edit')           { state.accEditRow = row; state.accDeleteRow = null; renderAccounts(); }
    if (action === 'acc-cancel-edit')    { state.accEditRow = null; renderAccounts(); }
    if (action === 'acc-save-edit')      { saveEdit(row); }
    if (action === 'acc-delete')         { state.accDeleteRow = row; state.accEditRow = null; renderAccounts(); }
    if (action === 'acc-cancel-delete')  { state.accDeleteRow = null; renderAccounts(); }
    if (action === 'acc-confirm-delete') { confirmDelete(row); }
  });
}

async function saveNew() {
  const name     = el('accNewName')?.value.trim();
  const currency = el('accNewCurrency')?.value;
  const type            = el('accNewType')?.value;
  const opening_balance = parseFloat(el('accNewOpeningBal')?.value || 0) || 0;
  const current_balance = parseFloat(el('accNewCurrentBal')?.value || 0) || 0;
  const notes           = el('accNewNotes')?.value.trim();
  const errEl           = el('accAddError');

  if (!name) { if (errEl) errEl.textContent = 'Name is required.'; return; }
  if (errEl) errEl.textContent = '';

  const btn = el('accSaveNew');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  showLoading();
  try {
    const res = await ExpenseAPI.createAccount({ name, currency, type, opening_balance, current_balance, notes });
    if (res.ok) {
      showMsg('Account added.');
      state.accAddOpen = false;
      await refreshAccounts();
      renderAccounts();
    } else {
      if (errEl) errEl.textContent = 'Error: ' + (res.error || 'unknown');
      if (btn) { btn.disabled = false; btn.textContent = 'Save account'; }
    }
  } catch (_) {
    if (errEl) errEl.textContent = 'Connection error.';
    if (btn) { btn.disabled = false; btn.textContent = 'Save account'; }
  } finally {
    hideLoading();
  }
}

async function saveEdit(rowNum) {
  const name     = el(`accEditName-${rowNum}`)?.value.trim();
  const currency = el(`accEditCurrency-${rowNum}`)?.value;
  const type            = el(`accEditType-${rowNum}`)?.value;
  const opening_balance = parseFloat(el(`accEditOpeningBal-${rowNum}`)?.value || 0) || 0;
  const current_balance = parseFloat(el(`accEditCurrentBal-${rowNum}`)?.value || 0) || 0;
  const is_active       = el(`accEditIsActive-${rowNum}`)?.value === 'true';
  const notes           = el(`accEditNotes-${rowNum}`)?.value.trim();

  if (!name) { showMsg('Name is required.', 'warn'); return; }

  showLoading();
  try {
    const res = await ExpenseAPI.updateAccount({ row_num: rowNum, name, currency, type, opening_balance, current_balance, is_active, notes });
    if (res.ok) {
      showMsg('Account updated.');
      state.accEditRow = null;
      await refreshAccounts();
      renderAccounts();
    } else {
      showMsg('Update failed: ' + (res.error || 'unknown'), 'warn');
    }
  } catch (_) {
    showMsg('Connection error.', 'warn');
  } finally {
    hideLoading();
  }
}

async function confirmDelete(rowNum) {
  showLoading();
  try {
    const res = await ExpenseAPI.deleteAccount({ row_num: rowNum });
    if (res.ok) {
      showMsg('Account deleted.');
      state.accDeleteRow = null;
      await refreshAccounts();
      renderAccounts();
    } else {
      showMsg('Delete failed: ' + (res.error || 'unknown'), 'warn');
      state.accDeleteRow = null;
      renderAccounts();
    }
  } catch (_) {
    showMsg('Connection error.', 'warn');
    state.accDeleteRow = null;
    renderAccounts();
  } finally {
    hideLoading();
  }
}

async function refreshAccounts() {
  const r = await ExpenseAPI.listAccounts();
  if (r.ok) {
    state.accounts   = r.data || [];
    state.accountMap = Object.fromEntries(state.accounts.map(a => [a.id, a]));
  }
}
