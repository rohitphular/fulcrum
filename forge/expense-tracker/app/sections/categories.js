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

  const anyFormOpen = state.catAddOpen || state.catViewRow !== null || state.catEditRow !== null;
  const viewCat = state.catViewRow !== null ? state.categories.find(c => c._row === state.catViewRow) : null;
  const editCat = state.catEditRow !== null ? state.categories.find(c => c._row === state.catEditRow) : null;

  content.innerHTML = `
    <div class="sec-head">
      <div class="sec-head-left"><h2>Categories</h2></div>
      <button class="btn btn-primary btn-sm" id="catAddBtn">${anyFormOpen ? '× Close' : '+ Add'}</button>
    </div>
    ${state.catAddOpen ? _renderForm(null,    'add')  : ''}
    ${viewCat          ? _renderForm(viewCat, 'view') : ''}
    ${editCat          ? _renderForm(editCat, 'edit') : ''}
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

// ── Unified form (Add / View / Edit) ─────────────────────────────────────────

function _renderForm(cat, mode) {
  const isView = mode === 'view';
  const isEdit = mode === 'edit';
  const dis    = isView ? ' disabled' : '';
  const pfx    = isEdit ? 'catEdit' : 'catNew';
  const srcId  = isView ? '' : `${pfx}Src`;
  const tgtId  = isView ? '' : `${pfx}Tgt`;

  const typeOpts = ['money-in', 'money-out', 'money-transfer'].map(t =>
    `<option value="${esc(t)}" ${cat?.transaction_type === t ? 'selected' : ''}>${esc(t)}</option>`
  ).join('');

  const header = (isView || isEdit) ? `
    <div class="cat-form-header">
      ${isView ? 'Viewing' : 'Editing'} —
      <strong>${esc(cat.major_category)}</strong> / ${esc(cat.minor_category)}
    </div>` : '';

  return `
  <div class="card" style="margin-bottom:20px">
    ${header}
    <div class="form-grid form-grid-4" style="margin-bottom:12px">
      <div class="field">
        <label>Type *</label>
        <select id="${pfx}Type"${dis}>${typeOpts}</select>
      </div>
      <div class="field">
        <label>Major *</label>
        <input type="text" id="${pfx}Major" placeholder="e.g. Food" value="${esc(String(cat?.major_category || ''))}"${dis}>
      </div>
      <div class="field form-grid-span-2">
        <label>Minor *</label>
        <input type="text" id="${pfx}Minor" placeholder="e.g. Groceries" value="${esc(String(cat?.minor_category || ''))}"${dis}>
      </div>
      <div class="field form-grid-span-3">
        <label>Description</label>
        <input type="text" id="${pfx}Desc" placeholder="Short description" value="${esc(String(cat?.description || ''))}"${dis}>
      </div>
      <div class="field">
        <label>Sort order</label>
        <input type="number" id="${pfx}SortOrder" min="0" step="1" value="${esc(String(cat?.sort_order ?? 0))}"${dis}>
        <div class="field-hint">Lower = first.</div>
      </div>
      <div class="field form-grid-span-2">
        <label>Tag keywords</label>
        <input type="text" id="${pfx}Keywords" placeholder="tesco, sainsbury…" value="${esc(String(cat?.tag_keywords || ''))}"${dis}>
        <div class="field-hint">Comma-separated, for auto-classification.</div>
      </div>
      <div class="field form-grid-span-2">
        <label>Counterparty examples</label>
        <input type="text" id="${pfx}Counterparty" placeholder="Tesco, Sainsbury's…" value="${esc(String(cat?.counterparty_examples || ''))}"${dis}>
        <div class="field-hint">Comma-separated merchant names.</div>
      </div>
    </div>
    <div class="cat-acct-section">
      <div class="cat-acct-header">
        <div class="cat-acct-label">Source account types</div>
        <label class="checkbox-label cat-mandatory-check">
          <input type="checkbox" id="${pfx}SrcMandatory" ${cat?.source_account_mandatory === true ? 'checked' : ''}${dis}> Mandatory
        </label>
      </div>
      ${_renderAcctTypeCheckboxes(srcId, cat?.source_account_types || '', isView)}
    </div>
    <div class="cat-acct-section">
      <div class="cat-acct-header">
        <div class="cat-acct-label">Target account types</div>
        <label class="checkbox-label cat-mandatory-check">
          <input type="checkbox" id="${pfx}TgtMandatory" ${cat?.target_account_mandatory === true ? 'checked' : ''}${dis}> Mandatory
        </label>
      </div>
      ${_renderAcctTypeCheckboxes(tgtId, cat?.target_account_types || '', isView)}
    </div>
    ${(isEdit || isView) ? `
    <label class="checkbox-label cat-mandatory-check" style="margin-top:14px">
      <input type="checkbox" id="${pfx}IsActive" ${(cat?.is_active !== false) ? 'checked' : ''}${dis}> Active
    </label>` : ''}
    ${isView ? `
    <div class="form-actions" style="margin-top:16px">
      <button class="btn btn-secondary" id="catCancelView">Close</button>
      <button class="btn btn-primary" id="catViewToEdit" data-row="${cat?._row}">Edit</button>
    </div>
    ` : `
    <div class="form-actions" style="margin-top:16px">
      <button class="btn btn-primary" id="${isEdit ? 'catSaveEdit' : 'catSaveNew'}">Save</button>
      <button class="btn btn-secondary" id="${isEdit ? 'catCancelEdit' : 'catCancelNew'}">Cancel</button>
    </div>
    <div class="pin-error" id="${isEdit ? 'catEditError' : 'catAddError'}"></div>
    `}
  </div>`;
}

// ── Table ─────────────────────────────────────────────────────────────────────

function _renderCatTable(cats) {
  if (!cats.length) {
    return `<p class="placeholder">No categories for this filter. Use &ldquo;+ Add&rdquo; to create one.</p>`;
  }

  const hasActiveCatRow = state.catDeleteRow !== null;

  const rows = cats.map(cat => {
    const isArchived = !cat.is_active;
    const rowStyle   = isArchived ? ' style="opacity:0.5"' : '';

    if (state.catDeleteRow === cat._row) {
      return `<tr>
        <td>${_catTypeBadge(cat.transaction_type)}</td>
        <td colspan="2"><span class="confirm-text">Delete <strong>${esc(cat.major_category)} → ${esc(cat.minor_category)}</strong>?</span></td>
        <td><div class="row-actions">
          <button class="btn-link danger" data-action="cat-confirm-delete" data-row="${cat._row}">Yes, delete</button>
          <button class="btn-link muted"  data-action="cat-cancel-delete">Cancel</button>
        </div></td>
      </tr>`;
    }

    return `<tr${rowStyle}>
      <td>${_catTypeBadge(cat.transaction_type)}</td>
      <td class="td-name">${esc(cat.major_category)}</td>
      <td>${esc(cat.minor_category)}</td>
      <td><div class="row-actions">
        <button class="btn-link muted"  data-action="cat-view"   data-row="${cat._row}">View</button>
        <button class="btn-link"        data-action="cat-edit"   data-row="${cat._row}">Edit</button>
        <button class="btn-link danger" data-action="cat-delete" data-row="${cat._row}">Delete</button>
      </div></td>
    </tr>`;
  }).join('');

  const cardRows = cats.map(cat => {
    const isArchived = !cat.is_active;
    if (state.catDeleteRow === cat._row) return '';
    return `<div class="cat-card${isArchived ? ' is-archived' : ''}">
      <div class="cat-card-top">
        ${_catTypeBadge(cat.transaction_type)}
        <div class="cat-card-name">
          <span class="cat-card-major">${esc(cat.major_category)}</span>
          <span class="cat-card-sep">›</span>
          <span class="cat-card-minor">${esc(cat.minor_category)}</span>
        </div>
      </div>
      <div class="row-actions">
        <button class="btn-link muted"  data-action="cat-view"   data-row="${cat._row}">View</button>
        <button class="btn-link"        data-action="cat-edit"   data-row="${cat._row}">Edit</button>
        <button class="btn-link danger" data-action="cat-delete" data-row="${cat._row}">Delete</button>
      </div>
    </div>`;
  }).join('');

  return `
    <div class="table-wrap cat-table-wrap${hasActiveCatRow ? ' cat-has-active' : ''}">
      <table>
        <thead><tr>
          <th style="width:80px">Type</th>
          <th>Major</th>
          <th>Minor</th>
          <th style="width:150px">Actions</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="cat-cards">${cardRows}</div>`;
}

// ── Account type multi-select ─────────────────────────────────────────────────

function _renderAcctTypeCheckboxes(containerId, currentValue, disabled = false) {
  const selected = new Set(
    String(currentValue || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  );
  const dis = disabled ? ' disabled' : '';

  const renderGroup = (label, types) =>
    `<div class="acct-type-group">
      <span class="acct-type-group-label">${label}</span>
      <div class="acct-type-checks">
        ${types.map(t =>
          `<label class="acct-type-check">
            <input type="checkbox" data-acct-type="${esc(t)}" ${selected.has(t) ? 'checked' : ''}${dis}> ${esc(ACCT_TYPE_LABELS[t] || t)}
          </label>`
        ).join('')}
      </div>
    </div>`;

  const { assetTypes, creditTypes, loanTypes } = _acctTypeGroups();
  const idAttr = containerId ? ` id="${esc(containerId)}"` : '';
  return `<div class="account-type-checkboxes"${idAttr}>
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
    if (state.catAddOpen || state.catViewRow !== null || state.catEditRow !== null) {
      state.catAddOpen = false;
      state.catViewRow = null;
      state.catEditRow = null;
    } else {
      state.catAddOpen = true;
    }
    renderCategories();
  });

  // Add form
  el('catSaveNew')?.addEventListener('click', _saveNewCategory);
  el('catCancelNew')?.addEventListener('click', () => { state.catAddOpen = false; renderCategories(); });

  // Edit form
  el('catSaveEdit')?.addEventListener('click', _saveCatEdit);
  el('catCancelEdit')?.addEventListener('click', () => { state.catEditRow = null; renderCategories(); });

  // View form
  el('catCancelView')?.addEventListener('click', () => { state.catViewRow = null; renderCategories(); });
  el('catViewToEdit')?.addEventListener('click', e => {
    const row = Number(e.currentTarget.dataset.row);
    state.catViewRow = null;
    state.catEditRow = row;
    renderCategories();
  });

  el('catTypeFilter')?.querySelectorAll('[data-cat-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.catFilter    = btn.dataset.catFilter;
      state.catAddOpen   = false;
      state.catViewRow   = null;
      state.catEditRow   = null;
      state.catDeleteRow = null;
      renderCategories();
    });
  });

  const handleCatAction = e => {
    const btn    = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const row    = btn.dataset.row ? Number(btn.dataset.row) : null;

    if (action === 'cat-view')           { state.catViewRow = row; state.catEditRow = null; state.catDeleteRow = null; state.catAddOpen = false; renderCategories(); }
    if (action === 'cat-edit')           { state.catEditRow = row; state.catViewRow = null; state.catDeleteRow = null; state.catAddOpen = false; renderCategories(); }
    if (action === 'cat-delete')         { state.catDeleteRow = row; state.catViewRow = null; state.catEditRow = null; renderCategories(); }
    if (action === 'cat-cancel-delete')  { state.catDeleteRow = null; renderCategories(); }
    if (action === 'cat-confirm-delete') { _deleteCat(row); }
  };
  el('categoriesContent')?.querySelector('.cat-table-wrap')?.addEventListener('click', handleCatAction);
  el('categoriesContent')?.querySelector('.cat-cards')?.addEventListener('click', handleCatAction);
}

// ── Save new ──────────────────────────────────────────────────────────────────

async function _saveNewCategory() {
  const transaction_type      = el('catNewType')?.value;
  const major_category        = el('catNewMajor')?.value.trim();
  const minor_category        = el('catNewMinor')?.value.trim();
  const description           = el('catNewDesc')?.value.trim();
  const tag_keywords          = el('catNewKeywords')?.value.trim();
  const counterparty_examples = el('catNewCounterparty')?.value.trim();
  const source_account_types  = _getCheckedAccountTypes('catNewSrc');
  const target_account_types  = _getCheckedAccountTypes('catNewTgt');
  const source_account_mandatory = el('catNewSrcMandatory')?.checked === true;
  const target_account_mandatory = el('catNewTgtMandatory')?.checked === true;
  const sort_order            = Number(el('catNewSortOrder')?.value) || 0;
  const is_active             = true;
  const errEl                 = el('catAddError');

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

// ── Save edit ─────────────────────────────────────────────────────────────────

async function _saveCatEdit() {
  const rowNum = state.catEditRow;
  if (!rowNum) return;

  const transaction_type      = el('catEditType')?.value;
  const major_category        = el('catEditMajor')?.value.trim();
  const minor_category        = el('catEditMinor')?.value.trim();
  const description           = el('catEditDesc')?.value.trim();
  const tag_keywords          = el('catEditKeywords')?.value.trim();
  const counterparty_examples = el('catEditCounterparty')?.value.trim();
  const source_account_types  = _getCheckedAccountTypes('catEditSrc');
  const target_account_types  = _getCheckedAccountTypes('catEditTgt');
  const source_account_mandatory = el('catEditSrcMandatory')?.checked === true;
  const target_account_mandatory = el('catEditTgtMandatory')?.checked === true;
  const sort_order            = Number(el('catEditSortOrder')?.value) || 0;
  const is_active             = el('catEditIsActive')?.checked !== false;
  const errEl                 = el('catEditError');

  if (!major_category || !minor_category) {
    if (errEl) errEl.textContent = 'Major and minor category are required.';
    return;
  }
  if (errEl) errEl.textContent = '';

  const btn = el('catSaveEdit');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
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
      if (errEl) errEl.textContent = 'Update failed: ' + (res.error || 'unknown');
      if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    }
  } catch (_) {
    if (errEl) errEl.textContent = 'Connection error.';
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
  } finally {
    hideLoading();
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────

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
