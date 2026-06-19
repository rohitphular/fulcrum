import { state } from '../core/state.js';
import { el, esc, getSymbol, toBase } from '../core/utils.js';
import { showLoading, hideLoading, showMsg } from '../core/ui.js';
import { ExpenseAPI } from '../core/api.js';
import { renderDashboard } from './dashboard.js';

const ACCOUNT_TYPES = [
  { value: 'current',     label: 'Current Account', group: 'asset' },
  { value: 'savings',     label: 'Savings Account',  group: 'asset' },
  { value: 'cash',        label: 'Cash',             group: 'asset' },
  { value: 'investment',  label: 'Investment',        group: 'asset' },
  { value: 'credit-card', label: 'Credit Card',       group: 'liability' },
  { value: 'loan',        label: 'Loan',              group: 'liability' },
];

const LIABILITY_TYPES = new Set(['credit-card', 'loan']);
const VALID_ACCOUNT_TYPES = new Set(ACCOUNT_TYPES.map(t => t.value));

function isActive(a) {
  return a.is_active === true || a.is_active === 'TRUE' || a.is_active === 'true';
}

function isLiability(a) { return LIABILITY_TYPES.has(a.type); }

function typeLabel(type) {
  return ACCOUNT_TYPES.find(t => t.value === type)?.label || type || '—';
}

function typeOptgroupHtml(selected) {
  const assetOpts = ACCOUNT_TYPES.filter(t => t.group === 'asset').map(t =>
    `<option value="${esc(t.value)}" ${selected === t.value ? 'selected' : ''}>${esc(t.label)}</option>`
  ).join('');
  const liabOpts = ACCOUNT_TYPES.filter(t => t.group === 'liability').map(t =>
    `<option value="${esc(t.value)}" ${selected === t.value ? 'selected' : ''}>${esc(t.label)}</option>`
  ).join('');
  return `<optgroup label="Assets">${assetOpts}</optgroup><optgroup label="Liabilities">${liabOpts}</optgroup>`;
}

function fmtBal(n) {
  return Math.abs(parseFloat(n || 0)).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function balanceCell(a) {
  const bal = parseFloat(a.current_balance || 0);
  const sym = getSymbol(a.currency);
  if (isLiability(a)) {
    const html = `<span class="summary-card-value negative" style="font-size:13px">${sym}${fmtBal(bal)} owed</span>`;
    if (a.type === 'credit-card' && Number(a.credit_limit) > 0) {
      const pct  = a.utilisation_pct ?? 0;
      const fill = pct > 90 ? 'var(--ember)' : pct > 60 ? '#D97706' : pct > 30 ? '#F59E0B' : 'var(--teal)';
      return `${html}
        <div style="margin-top:4px;font-size:10px;color:var(--muted);font-family:var(--mono)">${sym}${fmtBal(Math.abs(bal))} of ${sym}${fmtBal(a.credit_limit)} (${pct.toFixed(1)}%)</div>
        <div style="height:3px;background:var(--hair);border-radius:2px;margin-top:3px;overflow:hidden">
          <div style="height:100%;width:${Math.min(pct,100).toFixed(1)}%;background:${fill};border-radius:2px"></div>
        </div>`;
    }
    return html;
  }
  const cls = bal < 0 ? 'negative' : '';
  return `<span class="${cls}" style="font-family:var(--mono)">${bal < 0 ? '−' : ''}${sym}${fmtBal(bal)}</span>`;
}

export function renderAccounts() {
  el('accountsContent').innerHTML = `
    <div class="sec-head">
      <div class="sec-head-left"><h2>Accounts</h2></div>
      <button class="btn btn-primary btn-sm" id="accAddBtn">${state.accAddOpen ? '× Close' : '+ Add account'}</button>
    </div>
    ${state.accAddOpen ? renderAddForm() : ''}
    ${renderNetWorth()}
    ${renderTable()}
  `;
  attachEvents();
}

function renderNetWorth() {
  if (!state.accounts.length) return '';
  const sym = getSymbol(state.quoteCurrency);
  const fmt = v => sym + Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const totalAssets = state.accounts
    .filter(a => !isLiability(a))
    .reduce((s, a) => s + toBase(a.current_balance, a.currency, null), 0);
  const totalLiab = state.accounts
    .filter(a => isLiability(a))
    .reduce((s, a) => s + Math.abs(toBase(a.current_balance, a.currency, null)), 0);
  const netWorth = totalAssets - totalLiab;

  return `
    <div class="summary-grid" style="margin-bottom:20px">
      <div class="summary-card">
        <div class="summary-card-label">Total Assets</div>
        <div class="summary-card-value positive">${fmt(totalAssets)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Total Liabilities</div>
        <div class="summary-card-value negative">${fmt(totalLiab)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Net Worth</div>
        <div class="summary-card-value ${netWorth >= 0 ? 'positive' : 'negative'}">${netWorth < 0 ? '−' : ''}${fmt(netWorth)}</div>
      </div>
    </div>`;
}

function renderAddForm() {
  const currencyOpts = state.rates.map(r =>
    `<option value="${esc(r.currency)}">${esc(r.currency)}</option>`
  ).join('');

  return `
  <div class="card" style="margin-bottom:20px">
    <div class="form-grid" style="margin-bottom:16px">
      <div class="field">
        <label for="accNewName">Name *</label>
        <input type="text" id="accNewName" placeholder="e.g. Barclays Current">
      </div>
      <div class="field">
        <label for="accNewCurrency">Currency *</label>
        <select id="accNewCurrency">${currencyOpts}</select>
      </div>
      <div class="field">
        <label for="accNewType">Type *</label>
        <select id="accNewType">${typeOptgroupHtml('current')}</select>
      </div>
    </div>
    <div class="form-grid" style="align-items:start">
      <div class="field">
        <label for="accNewOpeningBal">Opening balance</label>
        <input type="number" id="accNewOpeningBal" step="0.01" placeholder="0.00">
        <div class="field-hint" id="accNewOpeningBalHint" style="display:none">Enter amount owed as negative, e.g. −1500</div>
      </div>
      <div class="field" id="accNewCreditLimitWrap" style="display:none">
        <label for="accNewCreditLimit">Credit limit</label>
        <input type="number" id="accNewCreditLimit" min="0" step="0.01" placeholder="0.00">
      </div>
      <div class="field">
        <label for="accNewNotes">Notes</label>
        <input type="text" id="accNewNotes" placeholder="Optional notes">
      </div>
    </div>
    <div class="form-actions" style="margin-top:20px">
      <button class="btn btn-primary" id="accSaveNew">Save</button>
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

function renderAccountRow(a) {
  if (state.accDeleteRow === a._row) {
    return `<tr>
      <td colspan="6"><span class="confirm-text">Delete <strong>${esc(a.name)}</strong>? Existing transactions linked to this account are not affected.</span></td>
      <td><div class="row-actions">
        <button class="btn-link danger" data-action="acc-confirm-delete" data-row="${a._row}">Yes, delete</button>
        <button class="btn-link" data-action="acc-cancel-delete">Cancel</button>
      </div></td>
    </tr>`;
  }
  if (state.accEditRow === a._row) return renderEditRow(a);

  return `<tr>
    <td class="td-mono" style="color:var(--muted);font-size:11px">${esc(a.id)}</td>
    <td>${esc(a.name)}${a.notes ? `<span class="info-icon-wrap"><span style="cursor:help;color:var(--teal);font-size:13px">ⓘ</span><span class="info-tooltip">${esc(a.notes)}</span></span>` : ''}</td>
    <td style="color:var(--muted);font-size:12px">${esc(typeLabel(a.type))}</td>
    <td>${esc(a.currency)}</td>
    <td>${balanceCell(a)}</td>
    <td>${activeBadge(a)}</td>
    <td><div class="row-actions">
      <button class="btn-link" data-action="acc-edit" data-row="${a._row}">Edit</button>
      <button class="btn-link danger" data-action="acc-delete" data-row="${a._row}">Delete</button>
    </div></td>
  </tr>`;
}

function groupHeader(label, total, sym, isLiab) {
  const sign = isLiab ? '−' : '';
  return `<tr class="acc-group-header">
    <td colspan="7" style="background:var(--canvas);padding:10px 12px 4px;font-size:11px;font-family:var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);border-bottom:none">
      ${label}
      <span style="float:right;font-weight:600;color:${isLiab ? 'var(--ember)' : 'var(--teal)'}">${sign}${sym}${Math.abs(total).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
    </td>
  </tr>`;
}

function renderTable() {
  if (!state.accounts.length) {
    return `<p class="placeholder">No accounts yet. Use &ldquo;+ Add account&rdquo; to create one.</p>`;
  }

  const sym      = getSymbol(state.quoteCurrency);
  const assets   = state.accounts.filter(a => !isLiability(a));
  const liabs    = state.accounts.filter(a => isLiability(a));
  const assetSum = assets.reduce((s, a) => s + toBase(a.current_balance, a.currency, null), 0);
  const liabSum  = liabs.reduce((s, a)  => s + Math.abs(toBase(a.current_balance, a.currency, null)), 0);

  const assetRows = assets.map(renderAccountRow).join('');
  const liabRows  = liabs.map(renderAccountRow).join('');

  const liabSection = liabs.length ? `
    ${groupHeader('Liabilities', liabSum, sym, true)}
    ${liabRows}` : '';

  return `
    <div class="table-wrap">
      <table class="acc-table">
        <thead><tr>
          <th style="width:90px">ID</th>
          <th style="width:160px">Name</th>
          <th style="width:140px">Type</th>
          <th style="width:70px">CCY</th>
          <th style="width:180px">Balance</th>
          <th style="width:80px">Status</th>
          <th style="width:100px">Actions</th>
        </tr></thead>
        <tbody>
          ${assets.length ? groupHeader('Assets', assetSum, sym, false) : ''}
          ${assetRows}
          ${liabSection}
        </tbody>
      </table>
    </div>`;
}

function renderEditRow(a) {
  const r    = a._row;
  const isCC = a.type === 'credit-card';

  return `<tr>
    <td class="td-mono" style="color:var(--muted);font-size:11px">${esc(a.id)}</td>
    <td colspan="5">
      <div style="padding:4px 0;display:flex;flex-direction:column;gap:20px">
        <div class="form-grid" style="gap:10px 12px">
          <div class="field" style="margin:0">
            <label>Name</label>
            <input class="rate-edit-input" style="width:100%" id="accEditName-${r}" value="${esc(a.name)}" placeholder="Name">
          </div>
          <div class="field" style="margin:0">
            <label>Status</label>
            <select class="cat-edit-select" style="width:100%" id="accEditIsActive-${r}">
              <option value="true"  ${isActive(a) ? 'selected' : ''}>active</option>
              <option value="false" ${!isActive(a) ? 'selected' : ''}>archived</option>
            </select>
          </div>
          <div class="field" style="margin:0">
            <label>Notes</label>
            <input class="rate-edit-input" style="width:100%" id="accEditNotes-${r}" value="${esc(a.notes || '')}" placeholder="Notes">
          </div>
          ${isCC ? `<div class="field" style="margin:0">
            <label>Credit limit</label>
            <input class="rate-edit-input" style="width:100%" type="number" step="0.01" id="accEditCreditLimit-${r}" value="${esc(String(a.credit_limit || ''))}">
          </div>` : ''}
        </div>
        <div class="form-grid form-grid-4" style="gap:10px 12px">
          <div class="field" style="margin:0">
            <label>Type</label>
            <div style="padding:6px 0;font-size:13px;color:var(--muted)">${esc(typeLabel(a.type))}</div>
          </div>
          <div class="field" style="margin:0">
            <label>Currency</label>
            <div style="padding:6px 0;font-size:13px;color:var(--muted)">${esc(a.currency)}</div>
          </div>
          <div class="field" style="margin:0">
            <label>Opening bal.</label>
            <div style="padding:6px 0;font-size:13px;color:var(--muted)">${getSymbol(a.currency)}${fmtBal(a.opening_balance || 0)}</div>
          </div>
          <div class="field" style="margin:0">
            <label>Current bal.</label>
            <div style="padding:6px 0;font-size:13px">${balanceCell(a)}</div>
          </div>
        </div>
      </div>
    </td>
    <td><div class="row-actions" style="margin-top:4px">
      <button class="btn-link" data-action="acc-save-edit" data-row="${r}">Save</button>
      <button class="btn-link" data-action="acc-cancel-edit">Cancel</button>
    </div></td>
  </tr>`;
}

function _refreshAddTypeUI() {
  const type   = el('accNewType')?.value || '';
  const isCC   = type === 'credit-card';
  const isLiab = LIABILITY_TYPES.has(type);
  const wrap   = el('accNewCreditLimitWrap');
  const hint   = el('accNewOpeningBalHint');
  if (wrap) wrap.style.display = isCC   ? '' : 'none';
  if (hint) hint.style.display = isLiab ? '' : 'none';
}


function attachEvents() {
  el('accAddBtn')?.addEventListener('click', () => {
    state.accAddOpen = !state.accAddOpen;
    renderAccounts();
  });

  el('accSaveNew')?.addEventListener('click', saveNew);
  el('accCancelNew')?.addEventListener('click', () => { state.accAddOpen = false; renderAccounts(); });
  el('accNewType')?.addEventListener('change', _refreshAddTypeUI);

  el('accountsContent')?.querySelector('.table-wrap')?.addEventListener('click', e => {
    const btn    = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const row    = btn.dataset.row ? Number(btn.dataset.row) : null;

    if (action === 'acc-edit') {
      state.accEditRow = row; state.accDeleteRow = null; renderAccounts();
      return;
    }
    if (action === 'acc-cancel-edit')    { state.accEditRow = null; renderAccounts(); }
    if (action === 'acc-save-edit')      { saveEdit(row); }
    if (action === 'acc-delete')         { state.accDeleteRow = row; state.accEditRow = null; renderAccounts(); }
    if (action === 'acc-cancel-delete')  { state.accDeleteRow = null; renderAccounts(); }
    if (action === 'acc-confirm-delete') { confirmDelete(row); }
  });

}

async function saveNew() {
  const name          = el('accNewName')?.value.trim();
  const currency      = el('accNewCurrency')?.value;
  const type          = el('accNewType')?.value;
  const credit_limit  = el('accNewCreditLimit')?.value;
  const opening_bal   = el('accNewOpeningBal')?.value;
  const notes         = el('accNewNotes')?.value.trim();
  const errEl         = el('accAddError');

  if (!name)                                          { if (errEl) errEl.textContent = 'Name is required.';     return; }
  if (!type || !VALID_ACCOUNT_TYPES.has(type))        { if (errEl) errEl.textContent = 'Type is required.';     return; }
  if (!currency || !(currency in (state.rateMap || {}))) { if (errEl) errEl.textContent = 'Currency is required.'; return; }
  if (errEl) errEl.textContent = '';

  const btn = el('accSaveNew');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  showLoading();
  try {
    const res = await ExpenseAPI.createAccount({
      name, currency, type,
      credit_limit: credit_limit ? parseFloat(credit_limit) : 0,
      opening_balance: parseFloat(opening_bal) || 0,
      notes,
    });
    if (res.ok) {
      showMsg('Account added.');
      state.accAddOpen = false;
      await refreshAccounts();
      renderAccounts();
      renderDashboard();
    } else {
      if (errEl) errEl.textContent = 'Error: ' + (res.error || 'unknown');
      if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    }
  } catch (_) {
    if (errEl) errEl.textContent = 'Connection error.';
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
  } finally {
    hideLoading();
  }
}

async function saveEdit(rowNum) {
  const r            = rowNum;
  const name         = el(`accEditName-${r}`)?.value.trim();
  const credit_limit = el(`accEditCreditLimit-${r}`)?.value;
  const is_active    = el(`accEditIsActive-${r}`)?.value === 'true';
  const notes        = el(`accEditNotes-${r}`)?.value.trim();

  if (!name) { showMsg('Name is required.', 'warn'); return; }

  showLoading();
  try {
    const res = await ExpenseAPI.updateAccount({
      row_num: rowNum, name,
      credit_limit: credit_limit ? parseFloat(credit_limit) : 0,
      is_active, notes,
    });
    if (res.ok) {
      showMsg('Account updated.');
      state.accEditRow = null;
      await refreshAccounts();
      renderAccounts();
      renderDashboard();
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
      renderDashboard();
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
