import { state } from '../core/state.js';
import { el, esc } from '../core/utils.js';
import { showLoading, hideLoading, showMsg } from '../core/ui.js';
import { ExpenseAPI } from '../core/api.js';

// ── Constants — fallbacks used before schema loads ────────────────────────────

const _ASSET_FALLBACK  = ['current', 'savings', 'cash', 'investment'];
const _CREDIT_FALLBACK = ['credit_card', 'overdraft'];
const _LOAN_FALLBACK   = ['mortgage', 'auto_loan', 'heloc', 'personal_loan', 'student_loan', 'medical_loan', 'debt_consolidation'];

function _acctTypeGroups() {
  const sch        = state.accountSchema;
  const assetTypes = sch?.asset_types     || _ASSET_FALLBACK;
  const loanTypes  = sch?.loan_types      || _LOAN_FALLBACK;
  const liabTypes  = sch?.liability_types || [..._CREDIT_FALLBACK, ..._LOAN_FALLBACK];
  const loanSet    = new Set(loanTypes);
  const creditTypes = liabTypes.filter(t => !loanSet.has(t));
  return { assetTypes, creditTypes, loanTypes };
}

const ACCT_TYPE_LABELS = {
  current: 'Current', savings: 'Savings', cash: 'Cash', investment: 'Investment',
  credit_card: 'Credit Card', overdraft: 'Overdraft', mortgage: 'Mortgage',
  auto_loan: 'Auto Loan', heloc: 'HELOC', personal_loan: 'Personal Loan',
  student_loan: 'Student Loan', medical_loan: 'Medical Loan',
  debt_consolidation: 'Debt Consol.',
};

// ── Entry point ───────────────────────────────────────────────────────────────

export function renderCategories() {
  const content = el('categoriesContent');

  const filtered = state.catFilter === 'all'
    ? state.categories
    : state.categories.filter(c => c.transaction_type === state.catFilter);

  content.innerHTML = `
    <div class="sec-head">
      <div class="sec-head-left"><h2>Categories</h2></div>
      <button class="btn btn-primary btn-sm" id="catAddBtn">${state.catAddOpen ? '× Close' : '+ Add category'}</button>
    </div>
    ${state.catAddOpen ? _renderAddForm() : ''}
    <div class="cat-filter" id="catTypeFilter">
      ${['all','money-in','money-out','money-transfer'].map(t =>
        `<button class="range-btn ${state.catFilter === t ? 'active' : ''}" data-cat-filter="${esc(t)}">${t === 'all' ? 'All types' : t}</button>`
      ).join('')}
      <span class="cat-count">${filtered.length} ${filtered.length === 1 ? 'category' : 'categories'}</span>
    </div>
    ${_renderCatTable(filtered)}
  `;

  _attachCatEvents();
}

// ── Add form ──────────────────────────────────────────────────────────────────

function _renderAddForm() {
  return `
  <div class="card" style="margin-bottom:20px">
    <div class="form-grid form-grid-4">
      <div class="field">
        <label for="catNewType">Type *</label>
        <select id="catNewType">
          ${['money-in','money-out','money-transfer'].map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="catNewMajor">Major category *</label>
        <input type="text" id="catNewMajor" placeholder="e.g. Food">
      </div>
      <div class="field form-grid-span-2">
        <label for="catNewMinor">Minor category *</label>
        <input type="text" id="catNewMinor" placeholder="e.g. Groceries">
      </div>
      <div class="field form-grid-span-3">
        <label for="catNewDesc">Description</label>
        <input type="text" id="catNewDesc" placeholder="Short description of this category">
      </div>
      <div class="field">
        <label for="catNewSortOrder">Sort order</label>
        <input type="number" id="catNewSortOrder" value="0" min="0" step="1" placeholder="0">
        <div class="field-hint">Lower = appears first.</div>
      </div>
      <div class="field form-grid-span-2">
        <label for="catNewKeywords">Tag keywords</label>
        <input type="text" id="catNewKeywords" placeholder="tesco, sainsbury, waitrose, lidl">
        <div class="field-hint">Comma-separated. Used for auto-classification suggestions.</div>
      </div>
      <div class="field form-grid-span-2">
        <label for="catNewCounterparty">Counterparty examples</label>
        <input type="text" id="catNewCounterparty" placeholder="Tesco, Sainsbury's, Lidl">
        <div class="field-hint">Comma-separated merchant or payer names shown as hints.</div>
      </div>
      <div class="field form-grid-full">
        <label>Source account types</label>
        <div class="field-hint" style="margin-bottom:6px">Typical account types for the <em>from account</em> (funding account for money-out; source for transfer; leave blank for money-in).</div>
        ${_renderAcctTypeCheckboxes('catNewSrc', '')}
      </div>
      <div class="field">
        <label class="checkbox-label">
          <input type="checkbox" id="catNewSrcMandatory"> Source account mandatory
        </label>
        <div class="field-hint">When checked, a source account must be selected on the transaction.</div>
      </div>
      <div class="field form-grid-full">
        <label>Target account types</label>
        <div class="field-hint" style="margin-bottom:6px">Typical account types for the <em>to account</em> (receiving account for money-in; target for transfer; debt repayment target).</div>
        ${_renderAcctTypeCheckboxes('catNewTgt', '')}
      </div>
      <div class="field">
        <label class="checkbox-label">
          <input type="checkbox" id="catNewTgtMandatory"> Target account mandatory
        </label>
        <div class="field-hint">When checked, a target account must be selected on the transaction.</div>
      </div>
      <div class="field">
        <label class="checkbox-label">
          <input type="checkbox" id="catNewIsActive" checked> Active
        </label>
        <div class="field-hint">Inactive categories appear greyed-out in transaction dropdowns.</div>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary" id="catSaveNew">Save</button>
      <button class="btn btn-secondary" id="catCancelNew">Cancel</button>
    </div>
    <div class="pin-error" id="catAddError"></div>
  </div>`;
}

// ── Table ─────────────────────────────────────────────────────────────────────

function _renderCatTable(cats) {
  if (!cats.length) {
    return `<p class="placeholder">No categories for this filter. Use &ldquo;+ Add category&rdquo; to create one.</p>`;
  }

  const rows = cats.map(cat => {
    const isArchived = !cat.is_active;
    const rowStyle   = isArchived ? ' style="opacity:0.5"' : '';

    if (state.catDeleteRow === cat._row) {
      return `<tr>
        <td>${_catTypeBadge(cat.transaction_type)}</td>
        <td colspan="2"><span class="confirm-text">Delete <strong>${esc(cat.major_category)} → ${esc(cat.minor_category)}</strong>?</span></td>
        <td><div class="row-actions">
          <button class="btn-link danger" data-action="cat-confirm-delete" data-row="${cat._row}">Yes, delete</button>
          <button class="btn-link" data-action="cat-cancel-delete">Cancel</button>
        </div></td>
      </tr>`;
    }

    if (state.catEditRow === cat._row) return _renderCatEditRow(cat);

    if (state.catViewRow === cat._row) return _renderCatViewRow(cat);

    return `<tr${rowStyle}>
      <td>${_catTypeBadge(cat.transaction_type)}</td>
      <td class="td-name">${esc(cat.major_category)}</td>
      <td>${esc(cat.minor_category)}</td>
      <td><div class="row-actions">
        <button class="btn-link muted" data-action="cat-view"   data-row="${cat._row}">View</button>
        <button class="btn-link" data-action="cat-edit"   data-row="${cat._row}">Edit</button>
        <button class="btn-link danger" data-action="cat-delete" data-row="${cat._row}">Delete</button>
      </div></td>
    </tr>`;
  }).join('');

  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th style="width:80px">Type</th>
          <th>Major</th>
          <th>Minor</th>
          <th style="width:150px">Actions</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── View row ──────────────────────────────────────────────────────────────────

function _renderCatViewRow(cat) {
  const detail = (label, value) => value !== undefined && value !== null && value !== ''
    ? `<div class="tx-detail-field"><span class="tx-detail-label">${label}</span><span class="tx-detail-value">${esc(String(value))}</span></div>`
    : '';

  const acctBadges = str => String(str || '').split(',').map(s => s.trim()).filter(Boolean)
    .map(t => `<span class="cat-view-badge">${esc(ACCT_TYPE_LABELS[t] || t)}</span>`).join(' ');

  const boolBadge = v => v
    ? `<span class="badge badge-in" style="font-size:10px">yes</span>`
    : `<span class="badge" style="background:var(--muted);color:var(--bg);font-size:10px">no</span>`;

  const statusBadge = cat.is_active === true
    ? `<span class="badge badge-in" style="font-size:10px">active</span>`
    : `<span class="badge" style="background:var(--muted);color:var(--bg);font-size:10px">archived</span>`;

  const srcTypes = String(cat.source_account_types || '').trim();
  const tgtTypes = String(cat.target_account_types || '').trim();

  return `<tr>
    <td colspan="4">
      <div class="tx-view-row">
        <div class="tx-detail-grid">
          ${detail('Type', cat.transaction_type)}
          ${detail('Major', cat.major_category)}
          ${detail('Minor', cat.minor_category)}
          <div class="tx-detail-field"><span class="tx-detail-label">Status</span><span class="tx-detail-value">${statusBadge}</span></div>
          ${detail('Description', cat.description)}
          ${detail('Tag keywords', cat.tag_keywords)}
          ${detail('Counterparty examples', cat.counterparty_examples)}
          ${detail('Sort order', cat.sort_order || 0)}
          <div class="tx-detail-field"><span class="tx-detail-label">Source account types</span><span class="tx-detail-value">${srcTypes ? acctBadges(srcTypes) : '<span style="color:var(--muted)">—</span>'}</span></div>
          <div class="tx-detail-field"><span class="tx-detail-label">Source account mandatory</span><span class="tx-detail-value">${boolBadge(cat.source_account_mandatory)}</span></div>
          <div class="tx-detail-field"><span class="tx-detail-label">Target account types</span><span class="tx-detail-value">${tgtTypes ? acctBadges(tgtTypes) : '<span style="color:var(--muted)">—</span>'}</span></div>
          <div class="tx-detail-field"><span class="tx-detail-label">Target account mandatory</span><span class="tx-detail-value">${boolBadge(cat.target_account_mandatory)}</span></div>
        </div>
        <div class="row-actions" style="margin-top:10px">
          <button class="btn-link" data-action="cat-cancel-view">Close</button>
        </div>
      </div>
    </td>
  </tr>`;
}

// ── Edit row ──────────────────────────────────────────────────────────────────

function _renderCatEditRow(cat) {
  const r = cat._row;
  return `<tr>
    <td colspan="7">
      <div class="card" style="margin:6px 0">
        <div class="form-grid form-grid-4">
          <div class="field">
            <label>Type *</label>
            <select id="catEditType-${r}">
              ${['money-in','money-out','money-transfer'].map(t =>
                `<option value="${esc(t)}" ${cat.transaction_type === t ? 'selected' : ''}>${esc(t)}</option>`
              ).join('')}
            </select>
          </div>
          <div class="field">
            <label>Major *</label>
            <input class="rate-edit-input" id="catEditMajor-${r}" value="${esc(cat.major_category)}" placeholder="Major">
          </div>
          <div class="field form-grid-span-2">
            <label>Minor *</label>
            <input class="rate-edit-input" id="catEditMinor-${r}" value="${esc(cat.minor_category)}" placeholder="Minor">
          </div>
          <div class="field form-grid-span-3">
            <label>Description</label>
            <input id="catEditDesc-${r}" value="${esc(String(cat.description || ''))}" placeholder="Short description">
          </div>
          <div class="field">
            <label>Sort order</label>
            <input type="number" id="catEditSortOrder-${r}" value="${esc(String(cat.sort_order ?? 0))}" min="0" step="1">
          </div>
          <div class="field form-grid-span-2">
            <label>Tag keywords</label>
            <input id="catEditKeywords-${r}" value="${esc(String(cat.tag_keywords || ''))}" placeholder="tesco, sainsbury, …">
          </div>
          <div class="field form-grid-span-2">
            <label>Counterparty examples</label>
            <input id="catEditCounterparty-${r}" value="${esc(String(cat.counterparty_examples || ''))}" placeholder="Tesco, Sainsbury's, …">
          </div>
          <div class="field form-grid-full">
            <label>Source account types</label>
            ${_renderAcctTypeCheckboxes(`catEditSrc-${r}`, cat.source_account_types || '')}
          </div>
          <div class="field">
            <label class="checkbox-label">
              <input type="checkbox" id="catEditSrcMandatory-${r}" ${cat.source_account_mandatory === true ? 'checked' : ''}> Source account mandatory
            </label>
          </div>
          <div class="field form-grid-full">
            <label>Target account types</label>
            ${_renderAcctTypeCheckboxes(`catEditTgt-${r}`, cat.target_account_types || '')}
          </div>
          <div class="field">
            <label class="checkbox-label">
              <input type="checkbox" id="catEditTgtMandatory-${r}" ${cat.target_account_mandatory === true ? 'checked' : ''}> Target account mandatory
            </label>
          </div>
          <div class="field">
            <label class="checkbox-label">
              <input type="checkbox" id="catEditIsActive-${r}" ${cat.is_active === true ? 'checked' : ''}> Active
            </label>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary btn-sm" data-action="cat-save-edit" data-row="${r}">Save</button>
          <button class="btn btn-secondary btn-sm" data-action="cat-cancel-edit">Cancel</button>
        </div>
      </div>
    </td>
  </tr>`;
}

// ── Account type multi-select ─────────────────────────────────────────────────

function _renderAcctTypeCheckboxes(containerId, currentValue) {
  const selected = new Set(
    String(currentValue || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  );

  const renderGroup = (label, types) =>
    `<div class="acct-type-group">
      <span class="acct-type-group-label">${label}</span>
      ${types.map(t =>
        `<label class="acct-type-check">
          <input type="checkbox" data-acct-type="${esc(t)}" ${selected.has(t) ? 'checked' : ''}> ${esc(ACCT_TYPE_LABELS[t] || t)}
        </label>`
      ).join('')}
    </div>`;

  const { assetTypes, creditTypes, loanTypes } = _acctTypeGroups();
  return `<div class="account-type-checkboxes" id="${esc(containerId)}">
    ${renderGroup('Assets', assetTypes)}
    ${renderGroup('Credit', creditTypes)}
    ${renderGroup('Loans',  loanTypes)}
  </div>`;
}

function _getCheckedAccountTypes(containerId) {
  const container = el(containerId);
  if (!container) return '';
  return Array.from(container.querySelectorAll('input[data-acct-type]:checked'))
    .map(cb => cb.dataset.acctType)
    .join(', ');
}

// ── Badge ─────────────────────────────────────────────────────────────────────

function _catTypeBadge(type) {
  const cls   = type === 'money-in' ? 'badge-in' : type === 'money-out' ? 'badge-out' : 'badge-transfer';
  const label = type === 'money-in' ? 'in'       : type === 'money-out' ? 'out'       : 'xfer';
  return `<span class="badge ${cls}">${label}</span>`;
}

// ── Events ────────────────────────────────────────────────────────────────────

function _attachCatEvents() {
  el('catAddBtn')?.addEventListener('click', () => {
    state.catAddOpen = !state.catAddOpen;
    renderCategories();
  });

  el('catSaveNew')?.addEventListener('click',   _saveNewCategory);
  el('catCancelNew')?.addEventListener('click', () => { state.catAddOpen = false; renderCategories(); });

  el('catTypeFilter')?.querySelectorAll('[data-cat-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.catFilter    = btn.dataset.catFilter;
      state.catViewRow   = null;
      state.catEditRow   = null;
      state.catDeleteRow = null;
      renderCategories();
    });
  });

  el('categoriesContent')?.querySelector('.table-wrap')?.addEventListener('click', e => {
    const btn    = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const row    = btn.dataset.row ? Number(btn.dataset.row) : null;

    if (action === 'cat-view')           { state.catViewRow = row; state.catEditRow = null; state.catDeleteRow = null; renderCategories(); }
    if (action === 'cat-cancel-view')   { state.catViewRow = null; renderCategories(); }
    if (action === 'cat-edit')           { state.catEditRow = row; state.catViewRow = null; state.catDeleteRow = null; renderCategories(); }
    if (action === 'cat-cancel-edit')    { state.catEditRow = null; renderCategories(); }
    if (action === 'cat-save-edit')      { _saveCatEdit(row); }
    if (action === 'cat-delete')         { state.catDeleteRow = row; state.catViewRow = null; state.catEditRow = null; renderCategories(); }
    if (action === 'cat-cancel-delete')  { state.catDeleteRow = null; renderCategories(); }
    if (action === 'cat-confirm-delete') { _deleteCat(row); }
  });
}

// ── Save / Edit / Delete ──────────────────────────────────────────────────────

async function _saveNewCategory() {
  const transaction_type       = el('catNewType')?.value;
  const major_category         = el('catNewMajor')?.value.trim();
  const minor_category         = el('catNewMinor')?.value.trim();
  const description            = el('catNewDesc')?.value.trim();
  const tag_keywords           = el('catNewKeywords')?.value.trim();
  const counterparty_examples  = el('catNewCounterparty')?.value.trim();
  const source_account_types        = _getCheckedAccountTypes('catNewSrc');
  const target_account_types        = _getCheckedAccountTypes('catNewTgt');
  const source_account_mandatory    = el('catNewSrcMandatory')?.checked === true;
  const target_account_mandatory    = el('catNewTgtMandatory')?.checked === true;
  const sort_order                  = Number(el('catNewSortOrder')?.value) || 0;
  const is_active                   = el('catNewIsActive')?.checked !== false;
  const errEl                       = el('catAddError');

  if (!major_category) { if (errEl) errEl.textContent = 'Major category is required.'; return; }
  if (!minor_category) { if (errEl) errEl.textContent = 'Minor category is required.'; return; }
  if (errEl) errEl.textContent = '';

  const btn = el('catSaveNew');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  showLoading();
  try {
    const res = await ExpenseAPI.createCategory({
      transaction_type, major_category, minor_category, description,
      is_active, tag_keywords, counterparty_examples,
      source_account_types, target_account_types,
      source_account_mandatory, target_account_mandatory, sort_order,
    });
    if (res.ok) {
      showMsg('Category added.');
      state.catAddOpen = false;
      await _reloadCategories();
      renderCategories();
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

async function _saveCatEdit(rowNum) {
  const transaction_type       = el(`catEditType-${rowNum}`)?.value;
  const major_category         = el(`catEditMajor-${rowNum}`)?.value.trim();
  const minor_category         = el(`catEditMinor-${rowNum}`)?.value.trim();
  const description            = el(`catEditDesc-${rowNum}`)?.value.trim();
  const tag_keywords           = el(`catEditKeywords-${rowNum}`)?.value.trim();
  const counterparty_examples  = el(`catEditCounterparty-${rowNum}`)?.value.trim();
  const source_account_types        = _getCheckedAccountTypes(`catEditSrc-${rowNum}`);
  const target_account_types        = _getCheckedAccountTypes(`catEditTgt-${rowNum}`);
  const source_account_mandatory    = el(`catEditSrcMandatory-${rowNum}`)?.checked === true;
  const target_account_mandatory    = el(`catEditTgtMandatory-${rowNum}`)?.checked === true;
  const sort_order                  = Number(el(`catEditSortOrder-${rowNum}`)?.value) || 0;
  const is_active                   = el(`catEditIsActive-${rowNum}`)?.checked !== false;

  if (!major_category || !minor_category) {
    showMsg('Major and minor category are required.', 'warn');
    return;
  }

  showLoading();
  try {
    const res = await ExpenseAPI.updateCategory({
      row_num: rowNum, transaction_type, major_category, minor_category, description,
      is_active, tag_keywords, counterparty_examples,
      source_account_types, target_account_types,
      source_account_mandatory, target_account_mandatory, sort_order,
    });
    if (res.ok) {
      showMsg('Category updated.');
      state.catEditRow = null;
      await _reloadCategories();
      renderCategories();
    } else {
      showMsg('Update failed: ' + (res.error || 'unknown'), 'warn');
    }
  } catch (_) {
    showMsg('Connection error.', 'warn');
  } finally {
    hideLoading();
  }
}

async function _deleteCat(rowNum) {
  showLoading();
  try {
    const res = await ExpenseAPI.deleteCategory({ row_num: rowNum });
    if (res.ok) {
      showMsg('Category deleted.');
      state.catDeleteRow = null;
      await _reloadCategories();
      renderCategories();
    } else {
      showMsg('Delete failed: ' + (res.error || 'unknown'), 'warn');
      state.catDeleteRow = null;
      renderCategories();
    }
  } catch (_) {
    showMsg('Connection error.', 'warn');
    state.catDeleteRow = null;
    renderCategories();
  } finally {
    hideLoading();
  }
}

async function _reloadCategories() {
  const catRes = await ExpenseAPI.listCategories();
  if (catRes.ok) state.categories = catRes.data || [];
}
